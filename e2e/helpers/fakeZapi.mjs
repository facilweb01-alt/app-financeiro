// Z-API FALSO para os testes das boas-vindas pelo WhatsApp. Guarda cada
// envio recebido (texto e documento) e pode ser colocado em "modo falha".
// O app precisa subir com:
//   ZAPI_BASE_URL=http://localhost:3997 ZAPI_INSTANCE_ID=inst-teste
//   ZAPI_INSTANCE_TOKEN=tok-teste ZAPI_CLIENT_TOKEN=client-teste
import { createServer } from "node:http";

export const FAKE_ZAPI_PORT = 3997;
export const FAKE_ZAPI_CLIENT_TOKEN = "client-teste";

export function startFakeZapi() {
  const state = { sent: [], fail: false };

  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const m = req.url.match(/^\/instances\/([^/]+)\/token\/([^/]+)\/(send-text|send-document\/pdf)$/);
      res.setHeader("Content-Type", "application/json");
      if (req.method !== "POST" || !m) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "not found" }));
      }
      if (req.headers["client-token"] !== FAKE_ZAPI_CLIENT_TOKEN) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: "client-token inválido" }));
      }
      if (state.fail) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: "instância desconectada (teste)" }));
      }
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        // corpo inválido: registra vazio
      }
      state.sent.push({ kind: m[3], instance: m[1], token: m[2], body });
      res.end(JSON.stringify({ zaapId: "fake", messageId: `msg-${state.sent.length}` }));
    });
  });

  return new Promise((resolve) => {
    server.listen(FAKE_ZAPI_PORT, () =>
      resolve({
        state,
        sentTo: (phone) => state.sent.filter((s) => s.body.phone === phone),
        setFail: (v) => (state.fail = v),
        close: () => new Promise((r) => server.close(r)),
      })
    );
  });
}
