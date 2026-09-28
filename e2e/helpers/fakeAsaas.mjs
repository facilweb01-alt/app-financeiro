// Servidor FALSO da API do Asaas, só para os testes automatizados (nunca
// usado em produção). Implementa apenas os endpoints que o app usa
// (src/lib/billing/asaas.ts) e alguns atalhos de teste (/__test/*) para
// simular "o cliente pagou o Pix", "o Asaas gerou a cobrança do mês",
// "o cliente concluiu o Checkout do cartão" ou "o cartão foi recusado".
// A página do Checkout falsa fica em /__checkout/checkoutSession/show?id=...
// (no app: ASAAS_CHECKOUT_BASE_URL=http://localhost:3998/__checkout).
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
    checkouts: new Map(),
    seq: 0,
    requests: [],
  };
  const nextId = (prefix) => `${prefix}_${++state.seq}${Date.now().toString(36)}`;

  const todaySP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  function createPayment(sub, dueDate, status = "PENDING") {
    const p = {
      id: nextId("pay"),
      customer: sub.customer,
      subscription: sub.id,
      value: sub.value,
      netValue: sub.value - 1.99,
      billingType: sub.billingType,
      status,
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
      // cliente concluiu o Checkout do cartão: cria a assinatura de cartão e a
      // 1ª cobrança (já confirmada se vence hoje, como o Asaas cobra na hora)
      if (action === "checkout") {
        const co = state.checkouts.get(id);
        if (!co) return send(404, { error: "no checkout" });
        const due = co.subscription.nextDueDate.slice(0, 10);
        const sub = {
          id: nextId("sub"),
          customer: co.customer,
          billingType: "CREDIT_CARD",
          cycle: co.subscription.cycle,
          value: co.items[0].value,
          nextDueDate: due,
          status: "ACTIVE",
          dateCreated: todaySP(),
          deleted: false,
          description: co.items[0].name,
        };
        state.subscriptions.set(sub.id, sub);
        const pay = createPayment(sub, due, due <= todaySP() ? "CONFIRMED" : "PENDING");
        if (pay.status === "CONFIRMED") pay.paymentDate = pay.clientPaymentDate = todaySP();
        co.status = "PAID";
        return send(200, { checkout: co, subscription: sub, payment: pay });
      }
      if (action === "decline") {
        const p = state.payments.get(id);
        if (!p) return send(404, { error: "no payment" });
        p.status = "OVERDUE";
        if (json?.dueDate) p.dueDate = json.dueDate;
        return send(200, p);
      }
      if (action === "setDue") {
        const p = state.payments.get(id);
        p.dueDate = json.dueDate;
        p.status = json.status ?? p.status;
        return send(200, p);
      }
      return send(404, {});
    }

    // --- página do Checkout falsa (o navegador do cliente abre esta) --------
    if (req.method === "GET" && path === "/__checkout/checkoutSession/show") {
      const co = state.checkouts.get(url.searchParams.get("id"));
      res.writeHead(co ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<html><body><h1>Checkout falso do Asaas</h1><p id="co">${co ? co.id : "não existe"}</p></body></html>`);
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
    let mc = path.match(/^\/v3\/customers\/([^/]+)$/);
    if (req.method === "POST" && mc) {
      const cus = state.customers.get(mc[1]);
      if (!cus) return send(404, { errors: [{ description: "not found" }] });
      if (json.postalCode && !/^\d{8}$/.test(json.postalCode)) return send(400, { errors: [{ description: "CEP inválido" }] });
      Object.assign(cus, json);
      return send(200, cus);
    }
    if (req.method === "POST" && path === "/v3/checkouts") {
      const errs = [];
      if (JSON.stringify(json?.billingTypes) !== '["CREDIT_CARD"]') errs.push("billingTypes");
      if (JSON.stringify(json?.chargeTypes) !== '["RECURRENT"]') errs.push("chargeTypes");
      if (!json?.customer || !state.customers.has(json.customer)) errs.push("customer");
      else {
        // como o Asaas real (descoberto no 1º teste no sandbox): o cliente precisa ter endereço
        const cus = state.customers.get(json.customer);
        if (!cus.address || !cus.addressNumber || !cus.postalCode) {
          return send(400, { errors: [{ code: "invalid_customer", description: "O campo address deve existir para o customer informado." }] });
        }
      }
      if (json?.customerData) errs.push("customer e customerData juntos");
      if (!json?.callback?.successUrl || !json?.callback?.cancelUrl || !json?.callback?.expiredUrl) errs.push("callback");
      const item = json?.items?.[0];
      if (!item?.name || !item?.value || !item?.quantity || !item?.imageBase64) errs.push("items");
      if (json?.subscription?.cycle !== "MONTHLY" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(json?.subscription?.nextDueDate ?? "")) errs.push("subscription");
      if (errs.length) return send(400, { errors: errs.map((e) => ({ code: "invalid", description: `campo inválido: ${e}` })) });
      const co = { id: `co_${++state.seq}${Date.now().toString(36)}`, status: "ACTIVE", ...json };
      state.checkouts.set(co.id, co);
      // o Asaas real devolve o id (o link é montado a partir dele)
      return send(200, { id: co.id, status: co.status });
    }
    if (req.method === "GET" && path === "/v3/subscriptions") {
      const customer = url.searchParams.get("customer");
      const status = url.searchParams.get("status");
      const data = [...state.subscriptions.values()].filter(
        (s) => s.customer === customer && !s.deleted && (!status || (s.status ?? "ACTIVE") === status)
      );
      return send(200, { object: "list", hasMore: false, totalCount: data.length, data });
    }
    if (req.method === "POST" && path === "/v3/subscriptions") {
      if (json.billingType !== "PIX" || json.cycle !== "MONTHLY") {
        return send(400, { errors: [{ code: "invalid", description: "tipo/ciclo inválido" }] });
      }
      const sub = { id: nextId("sub"), status: "ACTIVE", dateCreated: todaySP(), deleted: false, ...json };
      state.subscriptions.set(sub.id, sub);
      createPayment(sub, json.nextDueDate);
      return send(200, sub);
    }
    let m = path.match(/^\/v3\/subscriptions\/([^/]+)$/);
    if (req.method === "DELETE" && m) {
      const sub = state.subscriptions.get(m[1]);
      if (!sub) return send(404, { errors: [{ description: "not found" }] });
      sub.deleted = true;
      sub.status = "INACTIVE";
      // como o Asaas: apagar a assinatura remove as cobranças ainda não pagas
      for (const p of state.payments.values()) {
        if (p.subscription === sub.id && (p.status === "PENDING" || p.status === "OVERDUE")) p.deleted = true;
      }
      return send(200, { deleted: true, id: sub.id });
    }
    m = path.match(/^\/v3\/subscriptions\/([^/]+)\/payments$/);
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
    checkoutsOf: (customer) => [...state.checkouts.values()].filter((c) => c.customer === customer),
    subsOf: (customer) => [...state.subscriptions.values()].filter((s) => s.customer === customer),
    paymentsOf: (subId) => [...state.payments.values()].filter((p) => p.subscription === subId),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
