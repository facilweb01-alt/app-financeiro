// Rotina agendada das mensagens automáticas pelo WhatsApp (09/10/2026).
//
// O app roda no Render Starter (sempre ligado), então um relógio dentro do
// próprio servidor resolve sem serviço extra: a cada 10 minutos ele chama a
// rota POST /api/automacoes/processar deste mesmo servidor, que decide quem
// deve receber mensagem agora (e respeita 8h–22h).
//
// Só liga com a variável AUTOMACOES_WHATSAPP=1 (Render → app-financeiro →
// Environment). Sem ela — e nos testes locais — nada é agendado.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AUTOMACOES_WHATSAPP !== "1") return;

  const port = process.env.PORT || "3000";
  const url = `http://127.0.0.1:${port}/api/automacoes/processar`;
  const everyMs = 10 * 60 * 1000;

  const tick = async () => {
    try {
      const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(5 * 60 * 1000) });
      if (!res.ok) console.error(`[automacoes] rotina recebeu HTTP ${res.status}`);
    } catch (err) {
      console.error("[automacoes] rotina não conseguiu chamar a rota:", err instanceof Error ? err.message : err);
    }
  };

  // Primeira rodada 2 minutos depois de subir (o servidor já está pronto).
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), everyMs);
  }, 2 * 60 * 1000);
  console.log("[automacoes] rotina agendada: a cada 10 minutos (8h–22h).");
}
