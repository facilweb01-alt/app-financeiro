import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { fillSignup, randomCpf } from "./helpers/signup.mjs";

// Página de vendas + cobrança mensal via Pix (Asaas), de ponta a ponta, contra
// um servidor FALSO do Asaas (e2e/helpers/fakeAsaas.mjs) — nunca o real.
//
// O app precisa estar rodando apontando para o servidor falso:
//   ASAAS_API_KEY='$aact_hmlg_teste' ASAAS_BASE_URL=http://localhost:3998/v3 \
//   ASAAS_WEBHOOK_TOKEN=token-teste-webhook npx next start -p 3100
// e este teste roda com: node e2e/billing-pix.smoke.mjs

if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || "token-teste-webhook";
const fake = await startFakeAsaas(3998);

const sandboxChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});
const page = await browser.newPage();

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (extra ? ` (${extra})` : ""));
  if (!cond) failed = true;
}

function todaySP(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

async function webhook(event, payment, { token = WEBHOOK_TOKEN, id } = {}) {
  const res = await fetch(`${BASE}/api/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": token },
    body: JSON.stringify({ id: id ?? `evt_${event}_${payment.id}_${Date.now()}`, event, payment }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

try {
  // 1. Página de vendas pública
  await page.goto(`${BASE}/`);
  const landing = await page.textContent("body");
  check("página de vendas abre para visitante", landing.includes("tá lançado") && landing.includes("R$ 29,90"));
  check("destaca o WhatsApp", landing.includes("WhatsApp"));
  const ctaHref = await page.getAttribute('main a:has-text("Quero esse app")', "href");
  check("botão 'Quero esse app' leva ao cadastro", ctaHref === "/registrar", ctaHref);

  // 2. Cadastro: CPF inválido é recusado com mensagem clara
  await page.goto(`${BASE}/registrar`);
  const email = `pix.${Date.now()}@example.com`;
  const password = "SenhaForte123";
  await fillSignup(page, { name: "Cliente Pix", email, password, cpf: "12345678900" });
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=CPF inválido", { timeout: 10000 });
  check("CPF inválido mostra erro", true);

  // 3. Cadastro válido -> tela de pagamento com o Pix
  const cpf = randomCpf();
  const { phone } = await fillSignup(page, { name: "Cliente Pix", email, password, cpf });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/assinatura`, { timeout: 15000 });
  await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
  const payTxt = await page.textContent("body");
  check("tela de pagamento pede o Pix", payTxt.includes("Falta só o Pix"));
  const payload = await page.inputValue("#pix-payload");
  check("mostra o Pix copia-e-cola", payload.startsWith("000201"), payload.slice(0, 20));

  const [user] = await sql`select id, status, billing_enabled, cpf, whatsapp_phone, asaas_customer_id, asaas_subscription_id from users where email = ${email}`;
  check("conta nasce pendente com cobrança ativa", user.status === "pending" && user.billing_enabled === true);
  check("CPF e WhatsApp gravados só com dígitos", user.cpf === cpf && user.whatsapp_phone === phone, `${user.cpf} ${user.whatsapp_phone}`);
  check("cliente e assinatura criados no Asaas", Boolean(user.asaas_customer_id && user.asaas_subscription_id));
  const sub = fake.state.subscriptions.get(user.asaas_subscription_id);
  check("assinatura Pix mensal de R$ 29,90 vencendo hoje", sub.billingType === "PIX" && sub.cycle === "MONTHLY" && sub.value === 29.9 && sub.nextDueDate === todaySP(), JSON.stringify({ v: sub.value, d: sub.nextDueDate }));

  // 4. Acesso ao app bloqueado até pagar
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL(`${BASE}/assinatura`, { timeout: 10000 });
  check("sem pagar, /dashboard volta para /assinatura", true);

  // 5. Abrir a tela várias vezes ao mesmo tempo NÃO cria outra assinatura
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  await Promise.all([1, 2, 3].map(() => fetch(`${BASE}/assinatura`, { headers: { cookie: cookieHeader } })));
  const subsOfCustomer = [...fake.state.subscriptions.values()].filter((s) => s.customer === user.asaas_customer_id);
  check("só 1 assinatura por cliente, mesmo com acessos simultâneos", subsOfCustomer.length === 1, `${subsOfCustomer.length}`);

  // 6. Webhook: segurança e idempotência
  const [firstPayment] = fake.paymentsOf(user.asaas_subscription_id);
  const bad = await webhook("PAYMENT_RECEIVED", firstPayment, { token: "errado" });
  check("webhook com token errado -> 401", bad.status === 401, `${bad.status}`);
  const [stillPending] = await sql`select status from users where id = ${user.id}`;
  check("token errado não libera a conta", stillPending.status === "pending");

  // 7. Cliente paga o Pix -> Asaas avisa -> conta liberada sozinha, e a tela
  // de pagamento (que ficou aberta) leva a pessoa para o app sozinha.
  await page.goto(`${BASE}/assinatura`);
  await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
  await fetch(`http://localhost:3998/__test/pay/${firstPayment.id}`, { method: "POST" });
  const paidPayment = fake.state.payments.get(firstPayment.id);
  const eventId = `evt_pago_${Date.now()}`;
  const ok = await webhook("PAYMENT_RECEIVED", paidPayment, { id: eventId });
  check("webhook válido -> 200", ok.status === 200 && ok.body.matched === true, JSON.stringify(ok.body));
  const dup = await webhook("PAYMENT_RECEIVED", paidPayment, { id: eventId });
  check("evento repetido é ignorado (idempotente)", dup.status === 200 && dup.body.duplicate === true, JSON.stringify(dup.body));

  let autoRedirected = true;
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 25000 }).catch(() => (autoRedirected = false));
  check("tela de pagamento aberta se atualiza sozinha e entra no app", autoRedirected);
  const [activeUser] = await sql`select status, approved_at, subscription_due_date::text as due from users where id = ${user.id}`;
  check("pagamento libera a conta (active)", activeUser.status === "active" && activeUser.approved_at !== null);
  const expectedNext = (() => {
    const [y, m, d] = todaySP().split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  })();
  check("próximo vencimento = mesmo dia do mês seguinte", activeUser.due === expectedNext, `${activeUser.due} vs ${expectedNext}`);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
  check("depois de pagar, o app abre normalmente", true);
  check("sem aviso de mensalidade quando está em dia", !(await page.textContent("body")).includes("Pagar com Pix"));

  // 8. Asaas gera a cobrança do mês seguinte (vence em 3 dias) -> aviso no app com o Pix
  const cycle = await (
    await fetch(`http://localhost:3998/__test/cycle/${user.asaas_subscription_id}`, {
      method: "POST",
      body: JSON.stringify({ dueDate: todaySP(3) }),
    })
  ).json();
  await webhook("PAYMENT_CREATED", cycle);
  await page.goto(`${BASE}/dashboard`);
  let body = await page.textContent("body");
  check("aviso 'vence em 3 dias' aparece no app", body.includes("vence em 3 dias") && body.includes("Pagar com Pix"));
  await page.goto(`${BASE}/assinatura`);
  body = await page.textContent("body");
  check("tela de assinatura mostra o Pix do mês e o histórico", body.includes("Pagar com Pix") && body.includes("Histórico de pagamentos") && body.includes("Paga"));

  // 9. Venceu há 2 dias -> aviso vermelho, mas ainda usa o app
  await fetch(`http://localhost:3998/__test/setDue/${cycle.id}`, { method: "POST", body: JSON.stringify({ dueDate: todaySP(-2), status: "OVERDUE" }) });
  await webhook("PAYMENT_OVERDUE", fake.state.payments.get(cycle.id));
  await page.goto(`${BASE}/dashboard`);
  body = await page.textContent("body");
  check("vencido há 2 dias: aviso de atraso, app continua aberto", page.url() === `${BASE}/dashboard` && body.includes("Sua mensalidade venceu"));

  // 10. Venceu há 5 dias -> acesso pausado (só a tela de pagamento abre)
  await fetch(`http://localhost:3998/__test/setDue/${cycle.id}`, { method: "POST", body: JSON.stringify({ dueDate: todaySP(-5), status: "OVERDUE" }) });
  await webhook("PAYMENT_UPDATED", fake.state.payments.get(cycle.id));
  await page.goto(`${BASE}/lancamentos`);
  await page.waitForURL(`${BASE}/assinatura`, { timeout: 10000 });
  body = await page.textContent("body");
  check("vencido há 5 dias: acesso pausado, vai para o pagamento", body.includes("Seu acesso está pausado"));

  // 11. Paga SEM webhook (ex.: webhook atrasado) -> checagem automática/"Já paguei" consulta o Asaas e libera
  await fetch(`http://localhost:3998/__test/pay/${cycle.id}`, { method: "POST" });
  await page.click('button:has-text("Já paguei")');
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 20000 });
  check("'Já paguei' confirma direto no Asaas e libera o acesso", true);
  const [afterPay] = await sql`select subscription_due_date::text as due from users where id = ${user.id}`;
  check("vencimento avança para o ciclo seguinte", afterPay.due > todaySP(), afterPay.due);

  // 12. Webhook de cobrança que não é deste app: 200 (não trava a fila do Asaas), sem efeito
  const foreign = await webhook("PAYMENT_RECEIVED", { id: "pay_de_outro_sistema", customer: "cus_x", status: "RECEIVED", value: 10, dueDate: todaySP() });
  check("cobrança desconhecida -> 200 sem vincular", foreign.status === 200 && foreign.body.matched === false, JSON.stringify(foreign.body));

  // 13. RLS: o cliente (role app_runtime) não consegue gravar cobranças nem ver as de outros
  const appSql = postgres(process.env.APP_DATABASE_URL, { max: 1 });
  let insertBlocked = false;
  try {
    await appSql.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${user.id}, true)`;
      await tx`insert into billing_payments (id, user_id, asaas_payment_id, due_date, value, status) values ('x', ${user.id}, 'forjado', '2030-01-01', 0, 'RECEIVED')`;
    });
  } catch {
    insertBlocked = true;
  }
  check("RLS: cliente não consegue forjar um pagamento", insertBlocked);
  const [ownCount] = await appSql.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${user.id}, true)`;
    return tx`select count(*)::int as n, count(*) filter (where user_id <> ${user.id})::int as others from billing_payments`;
  });
  check("RLS: cliente só enxerga as próprias cobranças", ownCount.n >= 2 && ownCount.others === 0, JSON.stringify(ownCount));
  await appSql.end({ timeout: 1 });

  // 14. Uma conta antiga (sem cobrança automática) nunca é bloqueada nem vê aviso
  await sql`update users set billing_enabled = false, subscription_due_date = ${todaySP(-30)} where id = ${user.id}`;
  await page.goto(`${BASE}/dashboard`);
  body = await page.textContent("body");
  check("conta sem cobrança automática: vencimento manual antigo não bloqueia", page.url() === `${BASE}/dashboard` && !body.includes("Pagar com Pix"));
  await page.goto(`${BASE}/assinatura`);
  check("conta sem cobrança automática não usa /assinatura", page.url() === `${BASE}/dashboard`);
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await browser.close();
  await fake.close();
  await sql.end({ timeout: 1 });
}

if (failed) {
  console.log("\nSMOKE TEST FALHOU");
  process.exit(1);
}
console.log("\nSMOKE TEST OK");
