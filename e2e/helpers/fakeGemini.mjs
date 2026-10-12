// Gemini FALSO + servidor de arquivos falso para os testes de áudio e imagem
// pelo WhatsApp. Nunca fala com o Google de verdade.
// O app precisa subir com:
//   GEMINI_API_KEY=chave-gemini-teste GEMINI_BASE_URL=http://localhost:3996/v1beta
//   WHATSAPP_MIDIA_HOSTS=localhost
import { createServer } from "node:http";

export const FAKE_GEMINI_PORT = 3996;
export const FAKE_GEMINI_KEY = "chave-gemini-teste";

export function startFakeGemini() {
  const state = {
    calls: [], // { model, key, mime, bytes, prompt }
    downloads: [], // caminhos baixados
    next: null, // próxima resposta: texto, ou { status }, ou função
    files: new Map(), // "/media/x" -> { type, body, status?, location? }
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${FAKE_GEMINI_PORT}`);
    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      state.downloads.push(url.pathname);
      const f = state.files.get(url.pathname);
      if (!f) {
        res.statusCode = 404;
        return res.end("não existe");
      }
      if (f.location) {
        res.statusCode = f.status ?? 302;
        res.setHeader("Location", f.location);
        return res.end();
      }
      res.statusCode = f.status ?? 200;
      if (f.type) res.setHeader("Content-Type", f.type);
      return res.end(f.body);
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const m = url.pathname.match(/^\/v1beta\/models\/([^:]+):generateContent$/);
      res.setHeader("Content-Type", "application/json");
      if (req.method !== "POST" || !m) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: { message: "not found" } }));
      }
      if (req.headers["x-goog-api-key"] !== FAKE_GEMINI_KEY) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: { message: "API key inválida" } }));
      }
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        // corpo inválido
      }
      const parts = body.contents?.[0]?.parts ?? [];
      const inline = parts.find((p) => p.inline_data)?.inline_data;
      state.calls.push({
        model: m[1],
        urlHadKey: url.searchParams.has("key"),
        mime: inline?.mime_type,
        bytes: inline ? Buffer.from(inline.data, "base64").length : 0,
        prompt: parts.find((p) => p.text)?.text ?? "",
        json: body.generationConfig?.responseMimeType,
      });
      const next = state.next;
      if (next && typeof next === "object" && next.status) {
        res.statusCode = next.status;
        return res.end(JSON.stringify({ error: { message: "sobrecarga (teste)" } }));
      }
      const text = typeof next === "string" ? next : JSON.stringify(next ?? { tipo: "nada", transcricao: "" });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    });
  });

  return new Promise((resolve) => {
    server.listen(FAKE_GEMINI_PORT, () =>
      resolve({
        state,
        base: `http://localhost:${FAKE_GEMINI_PORT}`,
        /** Registra um arquivo e devolve o endereço para mandar ao app. */
        file: (name, type, body, extra = {}) => {
          state.files.set(`/media/${name}`, { type, body, ...extra });
          return `http://localhost:${FAKE_GEMINI_PORT}/media/${name}`;
        },
        answer: (value) => (state.next = value),
        close: () => new Promise((r) => server.close(r)),
      })
    );
  });
}
