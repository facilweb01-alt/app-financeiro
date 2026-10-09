import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { activateUser, closeTestDb } from "./helpers/testDb.mjs";
import { fillSignup } from "./helpers/signup.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";

// Pedidos de 09/10/2026:
// 1. cartão com dia de fechamento e de vencimento: a compra é lançada com a
//    data em que aconteceu e o 1º vencimento sai do cartão (app e WhatsApp);
// 2. cliente ativo sem nenhum lançamento recebe mensagem aos 7 e 14 dias;
// 3. cadastro sem pagamento recebe mensagem 1 hora depois e ofertas a cada
//    15 dias (até 6), e SAIR para tudo.
//
// Suba o app assim (sem Asaas, com o Z-API falso e sem esperar o horário):
//   ZAPI_BASE_URL=http://localhost:3997 ZAPI_INSTANCE_ID=inst-teste ZAPI_INSTANCE_TOKEN=tok-teste \
//   ZAPI_CLIENT_TOKEN=client-teste AUTOMACOES_IGNORAR_HORARIO=1 AUTOMACOES_INTERVALO_MS=0 \
//   AUTOMACOES_DESDE=2026-09-15T00:00:00-03:00 \
//   WHATSAPP_WEBHOOK_SECRET=<o do .env.local> npx next start -p 3100
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const sandboxChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};
const browser = await chromium.launch(launchOptions);
const zapi = await startFakeZapi();

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (!cond && extra ? ` (${String(extra).slice(0, 500)})` : ""));
  if (!cond) failed = true;
}
const processar = () =>
  fetch(`${BASE}/api/automacoes/processar`, { method: "POST" }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const whatsapp = (body) =>
  fetch(`${BASE}/api/whatsapp/lancamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

async function signup(name) {
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  const email = `ciclo.${Date.now()}.${Math.floor(Math.random() * 1000)}@example.com`;
  await page.goto(`${BASE}/registrar`);
  const { phone } = await fillSignup(page, { name, email, password: "SenhaForte123" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
  return { page, email, phone, zphone: `55${phone}` };
}
const userId = async (email) => (await sql`select id from users where email = ${email}`)[0].id;

try {
  // =========================================================================
  // 1. Cartão com dia de fechamento e vencimento
  // =========================================================================
  const a = await signup("Carla Ciclo");
  await activateUser(a.email);
  const page = a.page;
  await page.goto(`${BASE}/cartoes`);
  await page.fill('[data-testid="new-card-form"] input[name="name"]', "Roxo Ciclo");
  await page.fill('[data-testid="new-card-form"] input[name="closingDay"]', "3");
  await page.fill('[data-testid="new-card-form"] input[name="dueDay"]', "10");
  await page.click('button:has-text("Adicionar cartão")');
  await page.waitForTimeout(900);
  const block = page.locator('[data-testid="card-block"]').filter({ hasText: "Roxo Ciclo" });
  check("cartão mostra 'Fecha dia 3 · vence dia 10'", (await block.locator('[data-testid="card-cycle"]').innerText()).includes("Fecha dia 3 · vence dia 10"));
  check("formulário da compra explica o cálculo pelo cartão", (await block.locator('[data-testid="purchase-cycle-hint"]').innerText()).includes("fecha dia 3 e vence dia 10"));

  await block.locator('input[name="purchaseDate"]').fill("2026-10-02");
  check("compra em 02/10 (antes do fechamento dia 3): 1º vencimento 10/10", (await block.locator('[data-testid="purchase-first-due"]').inputValue()) === "2026-10-10");
  await block.locator('input[name="purchaseDate"]').fill("2026-10-03");
  check("compra no dia do fechamento (03/10): 1º vencimento 10/11", (await block.locator('[data-testid="purchase-first-due"]').inputValue()) === "2026-11-10");
  await block.locator('input[name="purchaseDate"]').fill("2026-10-20");
  check("compra em 20/10: 1º vencimento 10/11", (await block.locator('[data-testid="purchase-first-due"]').inputValue()) === "2026-11-10");

  await block.locator('input[name="description"]').first().fill("Geladeira");
  await block.locator('input[name="totalAmount"]').first().fill("1200");
  await block.locator('input[name="installmentsTotal"]').first().fill("3");
  await block.locator('button:has-text("Adicionar compra")').click();
  await page.waitForTimeout(1000);
  const inst = await sql`
    select i.due_date::text as due, p.purchase_date::text as bought from card_installments i
    join card_purchases p on p.id = i.card_purchase_id join credit_cards c on c.id = p.card_id
    where c.user_id = ${await userId(a.email)} and p.description = 'Geladeira' order by i.installment_number`;
  check(
    "compra gravada com a data da compra e parcelas em 10/11, 10/12 e 10/01",
    inst.length === 3 && inst[0].bought === "2026-10-20" && inst.map((r) => r.due).join(",") === "2026-11-10,2026-12-10,2027-01-10",
    JSON.stringify(inst)
  );

  const todaySp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  check(
    "depois de salvar, o formulário volta para a data de hoje com o vencimento calculado",
    (await block.locator('input[name="purchaseDate"]').inputValue()) === todaySp && /^\d{4}-\d{2}-10$/.test(await block.locator('[data-testid="purchase-first-due"]').inputValue()),
    `${await block.locator('input[name="purchaseDate"]').inputValue()} / ${await block.locator('[data-testid="purchase-first-due"]').inputValue()}`
  );

  // Vencimento alterado à mão continua valendo.
  await block.locator('input[name="purchaseDate"]').fill("2026-10-21");
  await block.locator('[data-testid="purchase-first-due"]').fill("2026-12-15");
  await block.locator('input[name="purchaseDate"]').fill("2026-10-22");
  check("depois de alterar o vencimento à mão, mudar a data da compra não sobrescreve", (await block.locator('[data-testid="purchase-first-due"]').inputValue()) === "2026-12-15");

  // Cartão antigo (sem os dias): aviso e edição.
  await sql`insert into credit_cards (id, user_id, name) values (${"old-" + Date.now()}, ${await userId(a.email)}, 'Antigo Sem Dias')`;
  await page.goto(`${BASE}/cartoes`);
  const old = page.locator('[data-testid="card-block"]').filter({ hasText: "Antigo Sem Dias" });
  check("cartão sem os dias mostra o aviso para informar", await old.locator('[data-testid="card-cycle-missing"]').isVisible());
  await old.locator('[data-testid="card-settings-toggle"]').click();
  await old.locator('[data-testid="card-settings"] input[name="closingDay"]').fill("28");
  await old.locator('[data-testid="card-settings"] input[name="dueDay"]').fill("5");
  await old.locator('[data-testid="card-settings"] button:has-text("Salvar")').click();
  await page.waitForTimeout(1000);
  check("cartão editado passa a mostrar 'Fecha dia 28 · vence dia 5'", (await old.locator('[data-testid="card-cycle"]').innerText()).includes("Fecha dia 28 · vence dia 5"));
  // Só um dos dias: recusado (o formulário continua aberto depois de salvar).
  if (!(await old.locator('[data-testid="card-settings"] input[name="closingDay"]').isVisible())) {
    await old.locator('[data-testid="card-settings-toggle"]').click();
  }
  await old.locator('[data-testid="card-settings"] input[name="closingDay"]').fill("");
  await old.locator('[data-testid="card-settings"] button:has-text("Salvar")').click();
  await page.waitForTimeout(400);
  check("informar só um dos dias é recusado", (await old.locator('[data-testid="card-settings"] input[name="closingDay"]:invalid').count()) === 1 || (await old.innerText()).includes("os dois"));

  // WhatsApp: compra sem vencimento usa o ciclo do cartão; cartão novo pelo WhatsApp, a regra antiga.
  await sql`update users set whatsapp_phone = ${a.phone} where email = ${a.email}`;
  const wz = await whatsapp({ phone: a.zphone, description: "Tênis", amount: 300, cardName: "Roxo Ciclo", installments: 2, purchaseDate: "05/10/2026" });
  check(
    "WhatsApp: compra em 05/10 no cartão (fecha 3, vence 10) vence 10/11, marcada como calculada pelo cartão",
    wz.status === 201 && wz.json.firstDueDate === "2026-11-10" && wz.json.dueFromCardCycle === true && wz.json.cardCycleMissing === false,
    JSON.stringify(wz.json)
  );
  const wn = await whatsapp({ phone: a.zphone, description: "Livro", amount: 50, cardName: "Cartão Novo Zap", purchaseDate: "05/10/2026" });
  check(
    "WhatsApp: cartão criado pela mensagem (sem dias) mantém compra + 1 mês e avisa que faltam os dias",
    wn.status === 201 && wn.json.cardCreated === true && wn.json.firstDueDate === "2026-11-05" && wn.json.cardCycleMissing === true,
    JSON.stringify(wn.json)
  );
  const wd = await whatsapp({ phone: a.zphone, description: "Curso", amount: 90, cardName: "Roxo Ciclo", purchaseDate: "05/10/2026", dueDate: "15/12/2026" });
  check("WhatsApp: vencimento falado na mensagem continua valendo", wd.status === 201 && wd.json.firstDueDate === "2026-12-15" && wd.json.dueFromCardCycle === false, JSON.stringify(wd.json));

  // =========================================================================
  // 2/3. Mensagens automáticas
  // =========================================================================
  // Cadastro sem pagamento.
  const p = await signup("Paulo Pendente");
  const pid = await userId(p.email);
  let r = await processar();
  check("rota de processamento responde só com contagens", r.status === 200 && r.json.ok === true && !("details" in r.json), JSON.stringify(r.json));
  check("cadastro de agora há pouco ainda não recebe nada (menos de 1 hora)", zapi.sentTo(p.zphone).length === 0);

  await sql`update users set created_at = now() - interval '61 minutes' where id = ${pid}`;
  r = await processar();
  let msgs = zapi.sentTo(p.zphone);
  check("1 hora depois do cadastro: 1 mensagem perguntando se ficou dúvida", msgs.length === 1 && /pagamento ainda não foi concluído/.test(msgs[0].body.message) && /dúvida/.test(msgs[0].body.message), JSON.stringify(msgs.map((m) => m.body.message)));
  check("mensagem chama pelo primeiro nome, tem o link de assinatura e o SAIR", /^Oi, Paulo!/.test(msgs[0]?.body.message ?? "") && /\/assinatura/.test(msgs[0]?.body.message ?? "") && /SAIR/.test(msgs[0]?.body.message ?? ""));
  await processar();
  check("rodar de novo não repete a mensagem", zapi.sentTo(p.zphone).length === 1);

  await sql`update automation_messages set sent_at = now() - interval '14 days', last_attempt_at = now() - interval '14 days' where user_id = ${pid} and kind = 'nao_pagou' and step = 0`;
  await processar();
  check("14 dias depois ainda não manda a oferta", zapi.sentTo(p.zphone).length === 1);
  await sql`update automation_messages set sent_at = now() - interval '15 days 1 minute', last_attempt_at = now() - interval '15 days 1 minute' where user_id = ${pid} and kind = 'nao_pagou' and step = 0`;
  await processar();
  msgs = zapi.sentTo(p.zphone);
  check("15 dias depois: 1ª oferta curta, com preço e SAIR", msgs.length === 2 && /29,90/.test(msgs[1].body.message) && /SAIR/.test(msgs[1].body.message), JSON.stringify(msgs.map((m) => m.body.message)));

  // SAIR pelo WhatsApp (o n8n manda optOut: true).
  const out = await whatsapp({ phone: p.zphone, optOut: true });
  check("SAIR: endpoint confirma e marca o cadastro", out.status === 200 && out.json.kind === "optout" && out.json.updated === 1, JSON.stringify(out.json));
  await sql`update automation_messages set sent_at = now() - interval '16 days', last_attempt_at = now() - interval '16 days' where user_id = ${pid} and kind = 'nao_pagou' and step = 1`;
  await processar();
  check("depois do SAIR não recebe mais nada", zapi.sentTo(p.zphone).length === 2);
  const out2 = await whatsapp({ phone: "5511900000123", optOut: true });
  check("SAIR de número sem conta responde 200 (nada a parar)", out2.status === 200 && out2.json.updated === 0, JSON.stringify(out2.json));

  // Falha no Z-API: registra e tenta de novo depois de 6 horas.
  const f = await signup("Fabio Falha");
  const fid = await userId(f.email);
  await sql`update users set created_at = now() - interval '2 hours' where id = ${fid}`;
  zapi.setFail(true);
  await processar();
  zapi.setFail(false);
  let [row] = await sql`select attempts, sent_at, error from automation_messages where user_id = ${fid} and kind = 'nao_pagou' and step = 0`;
  check("falha no envio fica registrada (1 tentativa, sem enviado)", row && row.attempts === 1 && row.sent_at === null && /Z-API/.test(row.error ?? ""), JSON.stringify(row));
  await processar();
  check("logo depois da falha não tenta de novo", zapi.sentTo(f.zphone).length === 0);
  await sql`update automation_messages set last_attempt_at = now() - interval '7 hours' where user_id = ${fid}`;
  await processar();
  [row] = await sql`select attempts, sent_at, error from automation_messages where user_id = ${fid} and kind = 'nao_pagou' and step = 0`;
  check("6 horas depois tenta de novo e envia", zapi.sentTo(f.zphone).length === 1 && row.attempts === 2 && row.sent_at !== null && row.error === null, JSON.stringify(row));

  // Cliente ativo sem nenhum lançamento.
  const s = await signup("Sara Semuso");
  const sid = await userId(s.email);
  await activateUser(s.email);
  await sql`update users set approved_at = now() - interval '6 days' where id = ${sid}`;
  await processar();
  check("ativo há 6 dias sem lançamento: ainda nada", zapi.sentTo(s.zphone).length === 0);
  await sql`update users set approved_at = now() - interval '7 days 1 minute' where id = ${sid}`;
  await processar();
  msgs = zapi.sentTo(s.zphone);
  check("7 dias sem lançamento: mensagem com exemplos e o manual, sem SAIR", msgs.length === 1 && /ainda não fez nenhum lançamento/.test(msgs[0].body.message) && /\/manual/.test(msgs[0].body.message) && !/SAIR/.test(msgs[0].body.message), JSON.stringify(msgs.map((m) => m.body.message)));
  await sql`update users set approved_at = now() - interval '14 days 1 minute' where id = ${sid}`;
  await sql`update automation_messages set sent_at = now() - interval '7 days', last_attempt_at = now() - interval '7 days' where user_id = ${sid}`;
  await processar();
  msgs = zapi.sentTo(s.zphone);
  check("14 dias: reforço com dicas (cartão com fechamento/vencimento, contas fixas)", msgs.length === 2 && /fechamento/.test(msgs[1].body.message) && /contas fixas/.test(msgs[1].body.message), JSON.stringify(msgs.map((m) => m.body.message)));

  // Quem já lançou não recebe.
  const u = await signup("Ursula Usou");
  const uid = await userId(u.email);
  await activateUser(u.email);
  await sql`update users set approved_at = now() - interval '8 days' where id = ${uid}`;
  const [cat] = await sql`select id from categories where key = 'outros' and user_id is null limit 1`;
  await sql`insert into transactions (id, user_id, category_id, description, amount, purchase_date, due_date)
    values (${"t-" + Date.now()}, ${uid}, ${cat.id}, 'teste', 10, current_date, current_date)`;
  await processar();
  check("ativo há 8 dias que já lançou algo não recebe lembrete", zapi.sentTo(u.zphone).length === 0);

  // Conta criada antes do início das automações: nada.
  const o = await signup("Otavio Antigo");
  await sql`update users set created_at = '2026-09-01T10:00:00-03:00' where email = ${o.email}`;
  await processar();
  check("cadastro antigo (antes da data de início das automações) não recebe nada", zapi.sentTo(o.zphone).length === 0);
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await browser.close();
  await zapi.close();
  await sql.end({ timeout: 1 });
  await closeTestDb();
}

if (failed) {
  console.error("\nSMOKE TEST FALHOU");
  process.exit(1);
}
console.log("\nSMOKE TEST OK");
