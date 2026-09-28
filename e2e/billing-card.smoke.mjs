import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { fillSignup } from "./helpers/signup.mjs";

// Cartão de crédito recorrente (Checkout do Asaas), de ponta a ponta, contra
// o servidor FALSO do Asaas (e2e/helpers/fakeAsaas.mjs) — nunca o real.
//
// O app precisa estar rodando apontando para o servidor falso:
//   ASAAS_API_KEY='$aact_hmlg_teste' ASAAS_BASE_URL=http://localhost:3998/v3 \
//   ASAAS_CHECKOUT_BASE_URL=http://localhost:3998/__checkout \
//   ASAAS_WEBHOOK_TOKEN=token-teste-webhook npx next start -p 3100
// e este teste roda com: node e2e/billing-card.smoke.mjs
//
// Três caminhos para o app descobrir que o cliente concluiu o Checkout
// (todos precisam funcionar, porque na vida real qualquer um pode chegar
// primeiro ou não chegar):
//   A) o cliente volta para /assinatura?cartao=ok (o app confere no Asaas);
//   B) webhook SUBSCRIPTION_CREATED;
//   C) webhook da 1ª cobrança do cartão (PAYMENT_CONFIRMED).

if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || "token-teste-webhook";
const fake = await startFakeAsaas(3998);

const sandboxChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (extra ? ` (${extra})` : ""));
  if (!cond) failed = true;
}

function todaySP(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}
function br(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function post(body) {
  const res = await fetch(`${BASE}/api/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": WEBHOOK_TOKEN },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const paymentWebhook = (event, payment) => post({ id: `evt_${event}_${payment.id}_${Date.now()}`, event, payment });

async function signup(page, name) {
  const email = `card.${name}.${Date.now()}@example.com`;
  await page.goto(`${BASE}/registrar`);
  await fillSignup(page, { name: `Cliente ${name}`, email, password: "SenhaForte123" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/assinatura`, { timeout: 15000 });
  await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
  return email;
}
const userRow = async (email) =>
  (await sql`select id, status, billing_method, asaas_customer_id, asaas_subscription_id, subscription_due_date::text as due
             from users where email = ${email}`)[0];

/** Clica em pagar com cartão e espera cair na página (falsa) do Checkout. Devolve o checkout criado. */
async function goToCheckout(page, buttonLabel, customer) {
  await page.click(`button:has-text("${buttonLabel}")`);
  await page.waitForURL(/\/__checkout\/checkoutSession\/show\?id=/, { timeout: 15000 });
  const id = new URL(page.url()).searchParams.get("id");
  return fake.checkoutsOf(customer).find((c) => c.id === id);
}

try {
  // ------------------------------------------------------------------ A
  const pageA = await browser.newPage();
  const emailA = await signup(pageA, "a");
  let body = await pageA.textContent("body");
  check("tela de pagamento oferece Pix E cartão", body.includes("Falta só o pagamento") && body.includes("Pagar com cartão de crédito"));
  check("avisa que o cartão é digitado na página do Asaas", body.includes("página segura do Asaas"));
  let a = await userRow(emailA);
  const pixSubA = a.asaas_subscription_id;
  check("começa no Pix", a.billing_method === "PIX" && Boolean(pixSubA));

  const coA = await goToCheckout(pageA, "Pagar com cartão de crédito", a.asaas_customer_id);
  check("abre o Checkout do Asaas do cliente certo", Boolean(coA) && coA.customer === a.asaas_customer_id);
  check("checkout: cartão recorrente mensal de R$ 29,90", coA?.chargeTypes?.[0] === "RECURRENT" && coA?.items?.[0]?.value === 29.9 && coA?.subscription?.cycle === "MONTHLY");
  check("checkout: 1ª cobrança hoje (conta ainda sem pagamento)", coA?.subscription?.nextDueDate?.startsWith(todaySP()), coA?.subscription?.nextDueDate);
  check("checkout: manda a imagem do plano e volta para /assinatura", (coA?.items?.[0]?.imageBase64 ?? "").length > 100 && coA?.callback?.successUrl?.endsWith("/assinatura?cartao=ok"), coA?.callback?.successUrl);
  check("dados do cartão nunca passam pelo app (checkout sem creditCard)", !("creditCard" in (coA ?? {})) && !("creditCardHolderInfo" in (coA ?? {})));

  // cliente paga na página do Asaas e volta pelo successUrl
  await fetch(`http://localhost:3998/__test/checkout/${coA.id}`, { method: "POST" });
  await pageA.goto(coA.callback.successUrl);
  body = await pageA.textContent("body");
  a = await userRow(emailA);
  check("[A] ao voltar, o app adota a assinatura de cartão", a.billing_method === "CREDIT_CARD" && a.asaas_subscription_id !== pixSubA);
  check("[A] conta liberada (1ª cobrança do cartão confirmada)", a.status === "active", a.status);
  check("[A] assinatura Pix antiga apagada no Asaas", fake.state.requests.some((r) => r.method === "DELETE" && r.path === `/v3/subscriptions/${pixSubA}`));
  const [oldPix] = await sql`select status from billing_payments where user_id = ${a.id} and billing_type = 'PIX'`;
  check("[A] Pix em aberto fica como cancelado no histórico", oldPix?.status === "DELETED", oldPix?.status);
  check("[A] tela confirma: 'Pronto!' e forma de pagamento cartão", body.includes("Pronto! Sua mensalidade agora é cobrada automaticamente no cartão") && body.includes("cartão de crédito (cobrança automática)"));
  check("[A] próxima cobrança é daqui a 1 mês, no dia de hoje", a.due > todaySP(26) && a.due < todaySP(32), a.due);
  check("[A] não mostra mais o QR Code do Pix", !(await pageA.locator('img[alt="QR Code do Pix"]').count()));

  // mensalidade seguinte no cartão perto de vencer: SEM aviso amarelo (é automática)
  const cardSubA = fake.state.subscriptions.get(a.asaas_subscription_id);
  const nextRes = await fetch(`http://localhost:3998/__test/cycle/${cardSubA.id}`, {
    method: "POST",
    body: JSON.stringify({ dueDate: todaySP(3) }),
  });
  const nextPay = await nextRes.json();
  await paymentWebhook("PAYMENT_CREATED", nextPay);
  await pageA.goto(`${BASE}/dashboard`);
  body = await pageA.textContent("body");
  check("[A] cartão: sem aviso de 'vence em 3 dias' no app", pageA.url().endsWith("/dashboard") && !body.includes("vence em 3 dias") && !body.includes("Pagar com Pix"));

  // cartão recusado (cobrança venceu sem passar)
  const declined = await (
    await fetch(`http://localhost:3998/__test/decline/${nextPay.id}`, { method: "POST", body: JSON.stringify({ dueDate: todaySP(-1) }) })
  ).json();
  const wh = await paymentWebhook("PAYMENT_OVERDUE", declined);
  check("[A] webhook de cartão recusado aceito", wh.status === 200, JSON.stringify(wh.body));
  await pageA.goto(`${BASE}/dashboard`);
  body = await pageA.textContent("body");
  check("[A] app avisa que não conseguiu cobrar no cartão", body.includes("Não conseguimos cobrar a mensalidade") && body.includes("Resolver pagamento"));
  await pageA.goto(`${BASE}/assinatura`);
  body = await pageA.textContent("body");
  check("[A] /assinatura oferece pagar a fatura ou outro cartão", body.includes("Pagar esta mensalidade") && body.includes("Cadastrar outro cartão"));

  // cadastra outro cartão -> nova assinatura; a recusada sai
  const coA2 = await goToCheckout(pageA, "Cadastrar outro cartão", a.asaas_customer_id);
  check("[A] cartão novo: 1ª cobrança hoje (mensalidade vencida)", coA2?.subscription?.nextDueDate?.startsWith(todaySP()), coA2?.subscription?.nextDueDate);
  await fetch(`http://localhost:3998/__test/checkout/${coA2.id}`, { method: "POST" });
  await pageA.goto(coA2.callback.successUrl);
  const a2 = await userRow(emailA);
  check("[A] troca para o cartão novo e apaga a assinatura do cartão recusado", a2.asaas_subscription_id !== cardSubA.id && fake.state.subscriptions.get(cardSubA.id).deleted === true);
  const [declinedRow] = await sql`select status from billing_payments where asaas_payment_id = ${nextPay.id}`;
  check("[A] cobrança recusada fica cancelada; conta em dia", declinedRow?.status === "DELETED" && a2.due > todaySP(), `${declinedRow?.status} ${a2.due}`);
  await pageA.close();

  // ------------------------------------------------------------------ B
  // Cliente que JÁ PAGA por Pix e está em dia troca para o cartão.
  const pageB = await browser.newPage();
  const emailB = await signup(pageB, "b");
  let b = await userRow(emailB);
  const pixPayB = fake.paymentsOf(b.asaas_subscription_id)[0];
  await fetch(`http://localhost:3998/__test/pay/${pixPayB.id}`, { method: "POST" });
  await paymentWebhook("PAYMENT_RECEIVED", fake.state.payments.get(pixPayB.id));
  b = await userRow(emailB);
  const dueB = b.due;
  check("[B] pagou o Pix: ativo, próximo vencimento no mês que vem", b.status === "active" && dueB > todaySP(20), dueB);

  await pageB.goto(`${BASE}/assinatura`);
  body = await pageB.textContent("body");
  check("[B] oferece passar a pagar no cartão, com a data da 1ª cobrança", body.includes("Usar cartão de crédito") && body.includes(`primeira cobrança será em ${br(dueB)}`));
  const coB = await goToCheckout(pageB, "Usar cartão de crédito", b.asaas_customer_id);
  check("[B] checkout: 1ª cobrança no vencimento que já existia (não cobra 2x o mesmo mês)", coB?.subscription?.nextDueDate?.startsWith(dueB), coB?.subscription?.nextDueDate);
  await fetch(`http://localhost:3998/__test/checkout/${coB.id}`, { method: "POST" });
  const newSubB = fake.subsOf(b.asaas_customer_id).find((s) => s.billingType === "CREDIT_CARD");
  const whB = await post({ id: `evt_sub_${newSubB.id}`, event: "SUBSCRIPTION_CREATED", subscription: newSubB });
  check("[B] webhook SUBSCRIPTION_CREATED troca para o cartão", whB.status === 200 && whB.body.switched === true, JSON.stringify(whB.body));
  const whB2 = await post({ id: `evt_sub_${newSubB.id}`, event: "SUBSCRIPTION_CREATED", subscription: newSubB });
  check("[B] evento repetido é ignorado", whB2.body.duplicate === true);
  b = await userRow(emailB);
  check("[B] continua ativo, mesmo vencimento, agora no cartão", b.status === "active" && b.due === dueB && b.billing_method === "CREDIT_CARD", `${b.status} ${b.due} ${b.billing_method}`);
  const [paidB] = await sql`select status from billing_payments where asaas_payment_id = ${pixPayB.id}`;
  check("[B] Pix já pago continua no histórico como pago", paidB?.status === "RECEIVED");
  await pageB.goto(`${BASE}/assinatura`);
  body = await pageB.textContent("body");
  check("[B] /assinatura: cobrança automática no cartão + trocar de cartão", body.includes("Cobrança automática no cartão") && body.includes(`Próxima cobrança: ${br(dueB)}`) && body.includes("Trocar de cartão"));
  await pageB.close();

  // ------------------------------------------------------------------ C
  // Só o webhook da 1ª cobrança do cartão chega (sem SUBSCRIPTION_CREATED e
  // sem o cliente voltar para o app).
  const pageC = await browser.newPage();
  const emailC = await signup(pageC, "c");
  let c = await userRow(emailC);
  const coC = await goToCheckout(pageC, "Pagar com cartão de crédito", c.asaas_customer_id);
  const done = await (await fetch(`http://localhost:3998/__test/checkout/${coC.id}`, { method: "POST" })).json();
  const whC = await paymentWebhook("PAYMENT_CONFIRMED", done.payment);
  check("[C] webhook da 1ª cobrança do cartão aceito", whC.status === 200 && whC.body.matched === true, JSON.stringify(whC.body));
  c = await userRow(emailC);
  check("[C] só com o webhook: ativo e no cartão", c.status === "active" && c.billing_method === "CREDIT_CARD" && c.asaas_subscription_id === done.subscription.id);
  await pageC.goto(`${BASE}/dashboard`);
  check("[C] entra no app", pageC.url().endsWith("/dashboard"), pageC.url());

  // voltar do checkout sem concluir não muda nada
  await pageC.goto(`${BASE}/assinatura?cartao=cancelado`);
  body = await pageC.textContent("body");
  check("[C] 'cancelado' explica que nada foi cobrado", body.includes("Nada foi cobrado"));
  await pageC.close();
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await browser.close();
  await fake.close();
  await sql.end();
}

console.log("");
if (failed) {
  console.log("ALGUM TESTE FALHOU");
  process.exit(1);
} else {
  console.log("CARTÃO RECORRENTE OK");
}
