// Teste de integração (09/11/2026): avisos de vencimento e AUTOMACOES_SO_COBRANCA.
// Banco Postgres descartável + Evolution falsa. Rodar:
//   DATABASE_URL=... EVOLUTION_API_URL=http://127.0.0.1:3998 EVOLUTION_INSTANCE=contay EVOLUTION_API_KEY=x \
//   AUTOMACOES_SO_COBRANCA=1 npx tsx --conditions=react-server e2e/vencimento-avisos.it.mts
import http from "node:http";
import postgres from "postgres";

const sent: { number: string; text: string }[] = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try { sent.push(JSON.parse(body)); } catch { /* ignore */ }
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ key: { id: "x" } }));
  });
});
await new Promise<void>((r) => server.listen(3998, "127.0.0.1", () => r()));

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let failed = false;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (!cond && extra !== undefined ? ` (${JSON.stringify(extra).slice(0, 400)})` : ""));
  if (!cond) failed = true;
};

const { processAutomations } = await import("../src/lib/whatsapp/automations");

try {
  await sql`delete from automation_messages`;
  await sql`delete from billing_payments`;
  await sql`delete from users where email like 'it.venc.%'`;
  const mk = async (email: string, name: string, phone: string, extra: Record<string, unknown> = {}) => {
    const [u] = await sql`insert into users ${sql({ id: crypto.randomUUID(), email, name, password_hash: "x", whatsapp_phone: phone, role: "user", status: "active", billing_enabled: true, approved_at: new Date("2026-10-01"), ...extra })} returning id`;
    return u.id as string;
  };
  const pay = async (userId: string, id: string, due: string, status: string, type = "PIX", value = "19.90") =>
    sql`insert into billing_payments ${sql({ id: crypto.randomUUID(), user_id: userId, asaas_payment_id: id, due_date: due, value, status, billing_type: type })}`;

  // hoje = 14/11 (simulado). Pix vence 15/11 (véspera); cartão vence 14/11 (dia); Pix venceu 11/11 (3 dias).
  const ana = await mk("it.venc.ana@example.com", "Ana Souza", "83911110001");
  await pay(ana, "pay_ana_old", "2026-10-15", "RECEIVED");
  await pay(ana, "pay_ana", "2026-11-15", "PENDING");
  const bia = await mk("it.venc.bia@example.com", "Bia Lima", "83911110002", { billing_method: "CREDIT_CARD" });
  await pay(bia, "pay_bia_old", "2026-10-14", "CONFIRMED", "CREDIT_CARD");
  await pay(bia, "pay_bia", "2026-11-14", "PENDING", "CREDIT_CARD");
  const caio = await mk("it.venc.caio@example.com", "Caio Reis", "83911110003");
  await pay(caio, "pay_caio_old", "2026-10-11", "RECEIVED");
  await pay(caio, "pay_caio", "2026-11-11", "OVERDUE");
  // nunca pagou (1ª cobrança do teste com cartão): fica com os avisos de fim de teste, não com os de vencimento
  const davi = await mk("it.venc.davi@example.com", "Davi Teste", "83911110004", { status: "pending", billing_method: "CREDIT_CARD", card_required: true, trial_ends_at: "2026-11-15", approved_at: null, created_at: new Date("2026-11-08T12:00:00-03:00") });
  await pay(davi, "pay_davi", "2026-11-15", "PENDING", "CREDIT_CARD");
  // pediu SAIR: nada
  const eva = await mk("it.venc.eva@example.com", "Eva SAIR", "83911110005", { marketing_opt_out_at: new Date() });
  await pay(eva, "pay_eva_old", "2026-10-15", "RECEIVED");
  await pay(eva, "pay_eva", "2026-11-15", "PENDING");
  // cliente ativo sem uso (sem_uso): bloqueado por AUTOMACOES_SO_COBRANCA
  await mk("it.venc.fabio@example.com", "Fabio SemUso", "83911110006", { approved_at: new Date("2026-11-01T10:00:00-03:00") });

  const now = new Date("2026-11-14T10:00:00-03:00");
  const r1 = await processAutomations({ now, delayMs: 0, limit: 20 });
  const textTo = (p: string) => sent.filter((s) => s.number === `55${p}`).map((s) => s.text);
  check("rodada 1 enviou 4 mensagens (Ana, Bia, Caio, Davi)", r1.sent === 4, { r1, sent });
  check("Ana (Pix): vence amanhã 15/11", (textTo("83911110001")[0] ?? "").includes("vence *amanhã* (15/11)") && textTo("83911110001")[0].includes("Pix"), textTo("83911110001"));
  check("Bia (cartão): vence hoje, cobrança automática", (textTo("83911110002")[0] ?? "").includes("vence *hoje* (14/11)") && textTo("83911110002")[0].includes("automática no cartão"), textTo("83911110002"));
  check("Caio (Pix, 3 dias): venceu em 11/11", (textTo("83911110003")[0] ?? "").includes("venceu em 11/11"), textTo("83911110003"));
  check("Davi (teste com cartão, nunca pagou): aviso de fim de teste, não de vencimento", (textTo("83911110004")[0] ?? "").includes("termina *amanhã*") && !textTo("83911110004")[0].includes("Lembrete do"), textTo("83911110004"));
  check("Eva (SAIR): nada", textTo("83911110005").length === 0);
  check("Fabio (sem uso): bloqueado pelo modo só cobrança", textTo("83911110006").length === 0);

  const r2 = await processAutomations({ now: new Date("2026-11-14T15:00:00-03:00"), delayMs: 0, limit: 20 });
  check("rodada 2 no mesmo dia não repete", r2.sent === 0, r2);

  // Ana paga no dia 15: nada no dia; Bia continua em aberto
  await sql`update billing_payments set status = 'RECEIVED' where asaas_payment_id = 'pay_ana'`;
  const before = sent.length;
  const r3 = await processAutomations({ now: new Date("2026-11-15T10:00:00-03:00"), delayMs: 0, limit: 20 });
  const day15 = sent.slice(before);
  check("15/11: Ana já pagou, não recebe", !day15.some((s) => s.number === "5583911110001"), day15);
  check("15/11: Davi recebe o aviso do último dia do teste", day15.some((s) => s.number === "5583911110004" && s.text.includes("termina *hoje*")), day15);
  // 17/11: Bia (venceu 14/11, ainda PENDING/OVERDUE) recebe o de 3 dias
  await sql`update billing_payments set status = 'OVERDUE' where asaas_payment_id = 'pay_bia'`;
  const b2 = sent.length;
  await processAutomations({ now: new Date("2026-11-17T10:00:00-03:00"), delayMs: 0, limit: 20 });
  const day17 = sent.slice(b2);
  check("17/11: Bia recebe aviso de cobrança não aprovada no cartão", day17.some((s) => s.number === "5583911110002" && s.text.includes("ainda não foi aprovada no cartão")), day17);
  const rows = await sql`select kind, step, sent_at is not null as ok from automation_messages where kind = 'vencimento' order by step`;
  check("histórico grava um passo por cobrança e aviso", rows.length === 4 && rows.every((r) => r.ok), rows);
  void r3;
} finally {
  await sql`delete from users where email like 'it.venc.%'`;
  await sql.end();
  server.close();
}
process.exit(failed ? 1 : 0);
