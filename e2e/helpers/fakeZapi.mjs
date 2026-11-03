// Z-API FALSO para os testes das boas-vindas pelo WhatsApp. Guarda cada
// envio recebido (texto e documento) e pode ser colocado em "modo falha".
// O app precisa subir com:
//   ZAPI_BASE_URL=http://localhost:3997 ZAPI_INSTANCE_ID=inst-teste
//   ZAPI_INSTANCE_TOKEN=tok-teste ZAPI_CLIENT_TOKEN=client-teste
import { createServer } from "node:http";

export const FAKE_ZAPI_PORT = 3997;
export const FAKE_ZAPI_CLIENT_TOKEN = "client-teste";
// Evolution API falsa no mesmo servidor: EVOLUTION_API_URL=http://localhost:3997
// EVOLUTION_INSTANCE=contay EVOLUTION_API_KEY=evo-teste
export const FAKE_EVOLUTION_API_KEY = "evo-teste";

export function startFakeZapi() {
  const state = { sent: [], fail: false };

  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      // Evolution API (03/11/2026): mesmas mensagens, outro formato. Guardadas
      // no mesmo formato do Z-API para as suítes não precisarem mudar.
      const evo = req.url.match(/^\/message\/(sendText|sendMedia)\/([^/]+)$/);
      if (evo && req.method === "POST") {
        if (req.headers["apikey"] !== FAKE_EVOLUTION_API_KEY) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: "apikey inválida" }));
        }
        if (state.fail) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: "instância desconectada (teste)" }));
        }
        let b = {};
        try {
          b = JSON.parse(raw);
        } catch {
          // corpo inválido: registra vazio
        }
        const body =
          evo[1] === "sendText"
            ? { phone: b.number, message: b.text }
            : {
                phone: b.number,
                fileName: String(b.fileName ?? "").replace(/\.pdf$/i, ""),
                document: `data:${b.mimetype};base64,${b.media}`,
                ...(b.caption ? { caption: b.caption } : {}),
                mediatype: b.mediatype,
              };
        state.sent.push({ kind: evo[1] === "sendText" ? "send-text" : "send-document/pdf", instance: evo[2], token: "evolution", provider: "evolution", body });
        return res.end(JSON.stringify({ key: { id: `msg-${state.sent.length}` }, status: "PENDING" }));
      }
      const m = req.url.match(/^\/instances\/([^/]+)\/token\/([^/]+)\/(send-text|send-document\/pdf)$/);
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
      state.sent.push({ kind: m[3], instance: m[1], token: m[2], provider: "zapi", body });
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
