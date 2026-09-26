// Servidor FALSO da API do Asaas, só para os testes automatizados (nunca
// usado em produção). Implementa apenas os endpoints que o app usa
// (src/lib/billing/asaas.ts) e alguns atalhos de teste (/__test/*) para
// simular "o cliente pagou o Pix" ou "o Asaas gerou a cobrança do mês".
//
// Uso: const fake = await startFakeAsaas(3998); ... fake.close()
// No app: ASAAS_BASE_URL=http://localhost:3998/v3 ASAAS_API_KEY=$aact_hmlg_teste

import http from "node:http";

// PNG 1x1 transparente
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export async function startFakeAsaas(port = 3998, apiKey = "$aact_hmlg_teste") {
  const state = {
    customers: new Map(),
    subscriptions: new Map(),
    payments: new Map(),
    seq: 0,
    requests: [],
  };
  const nextId = (prefix) => `${prefix}_${++state.seq}${Date.now().toString(36)}`;

  function createPayment(sub, dueDate) {
    const p = {
      id: nextId("pay"),
      customer: sub.customer,
      subscription: sub.id,
      value: sub.value,
      netValue: sub.value - 1.99,
      status: "PENDING",
      dueDate,
      paymentDate: null,
      clientPaymentDate: null,
      invoiceUrl: `https://sandbox.asaas.com/i/${sub.id}`,
      externalReference: sub.externalReference,
      deleted: false,
    };
    state.payments.set(p.id, p);
    return p;
  }

  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = body ? JSON.parse(body) : undefined;
    const url = new URL(req.url, `http://localhost:${port}`);
    const path = url.pathname;
    state.requests.push({ method: req.method, path, body: json });

    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    // --- atalhos de teste -------------------------------------------------
    if (path.startsWith("/__test/")) {
      const [, , action, id] = path.split("/");
      if (action === "pay") {
        const p = state.payments.get(id);
        if (!p) return send(404, { error: "no payment" });
        p.status = "RECEIVED";
        p.paymentDate = p.clientPaymentDate = new Date().toISOString().slice(0, 10);
        return send(200, p);
      }
      if (action === "cycle") {
        const sub = state.subscriptions.get(id);
        if (!sub) return send(404, { error: "no sub" });
        return send(200, createPayment(sub, json.dueDate));
      }
      if (action === "setDue") {
        const p = state.payments.get(id);
        p.dueDate = json.dueDate;
        p.status = json.status ?? p.status;
        return send(200, p);
      }
      return send(404, {});
    }

    // --- API "de verdade" ---------------------------------------------------
    if (req.headers["access_token"] !== apiKey) {
      return send(401, { errors: [{ code: "invalid_access_token", description: "Chave inválida" }] });
    }
    if (!req.headers["user-agent"]) {
      return send(400, { errors: [{ code: "user_agent", description: "User-Agent obrigatório" }] });
    }

    if (req.method === "POST" && path === "/v3/customers") {
      if (!json?.name || !json?.cpfCnpj) {
        return send(400, { errors: [{ code: "invalid", description: "Nome e CPF obrigatórios" }] });
      }
      const c = { id: nextId("cus"), ...json };
      state.customers.set(c.id, c);
      return send(200, c);
    }
    if (req.method === "POST" && path === "/v3/subscriptions") {
      if (json.billingType !== "PIX" || json.cycle !== "MONTHLY") {
        return send(400, { errors: [{ code: "invalid", description: "tipo/ciclo inválido" }] });
      }
      const sub = { id: nextId("sub"), ...json };
      state.subscriptions.set(sub.id, sub);
      createPayment(sub, json.nextDueDate);
      return send(200, sub);
    }
    let m = path.match(/^\/v3\/subscriptions\/([^/]+)\/payments$/);
    if (req.method === "GET" && m) {
      const data = [...state.payments.values()].filter((p) => p.subscription === m[1]);
      return send(200, { object: "list", hasMore: false, totalCount: data.length, data });
    }
    m = path.match(/^\/v3\/payments\/([^/]+)\/pixQrCode$/);
    if (req.method === "GET" && m) {
      if (!state.payments.has(m[1])) return send(404, { errors: [{ description: "not found" }] });
      return send(200, {
        encodedImage: PNG_1PX,
        payload: `00020101021226820014br.gov.bcb.pix2560fake.asaas.com/qr/${m[1]}5204000053039865406${"29.90"}5802BR6304ABCD`,
        expirationDate: "2027-12-31 23:59:59",
      });
    }
    m = path.match(/^\/v3\/payments\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const p = state.payments.get(m[1]);
      return p ? send(200, p) : send(404, { errors: [{ description: "not found" }] });
    }
    return send(404, { errors: [{ description: `rota falsa não implementada: ${req.method} ${path}` }] });
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    state,
    url: `http://localhost:${port}/v3`,
    paymentsOf: (subId) => [...state.payments.values()].filter((p) => p.subscription === subId),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
