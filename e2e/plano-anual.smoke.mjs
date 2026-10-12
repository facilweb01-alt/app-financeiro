import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";
import { fillSignup, makeLegacyPending, randomCpf } from "./helpers/signup.mjs";

// Plano anual com 15% de desconto (11/10/2026), de ponta a ponta:
//  - a tela de pagamento deixa escolher mensal (R$ 29,90) ou anual (R$ 304,98);
//  - trocar de plano refaz a cobrança Pix com o valor e o ciclo certos, sem
//    deixar duas assinaturas no Asaas;
//  - pagou a anuidade: o próximo vencimento é um ano depois;
//  - cartão no plano anual; Checkout antigo concluído depois da troca;
//  - quem já é assinante não troca de plano pela tela.
// NUNCA fala com o Asaas de verdade. Suba o app como no teste-gratis.smoke.mjs.

if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || "token-teste-webhook";
const fake = await startFakeAsaas(3998);
const zapi = await startFakeZapi();
const sandboxChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (!cond && extra !== undefined ? ` (${String(extra).slice(0, 600)})` : ""));
  if (!cond) failed = true;
}
const todaySP = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offsetDays * 86_400_000));
const isoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const addMonths = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
};
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const userOf = async (email) => (await sql`select * from users where email = ${email}`)[0];
const asaasWebhook = (event, payment) =>
  fetch(`${BASE}/api/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": WEBHOOK_TOKEN },
    body: JSON.stringify({ id: `evt_${event}_${payment.id}_${Date.now()}`, event, payment }),
  });
const activeSubs = (customer) => [...fake.state.subscriptions.values()].filter((s) => s.customer === customer && !s.deleted);

async function signup(name) {
  const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  await ctx.route(/viacep\.com\.br/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ logradouro: "Rua de Teste", bairro: "Centro" }) })
  );
  const page = await ctx.newPage();
  const email = `anual.${Date.now()}.${Math.floor(Math.random() * 1e5)}@example.com`;
  await page.goto(`${BASE}/registrar`);
  await fillSignup(page, { name, email, password: "SenhaForte123" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/bem-vindo`, { timeout: 15000 });
  return { ctx, page, email };
}
async function openPayment(page) {
  await page.goto(`${BASE}/assinatura`);
  await page.fill("#pay-cpf", randomCpf());
  await page.click('[data-testid="cpf-form"] button[type="submit"]');
  await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
}
async function choose(page, which) {
  await page.click(`[data-testid="plano-${which}"]`);
  await page.waitForFunction((w) => document.querySelector(`[data-testid="plano-${w}"]`)?.getAttribute("aria-pressed") === "true", which, { timeout: 15000 });
}
async function fillCard(page) {
  await page.fill("#card-cep", "58310000");
  await page.fill("#card-address", "Rua das Flores");
  await page.fill("#card-number", "12");
  await page.fill("#card-province", "Centro");
  await page.click('button:has-text("Continuar para os dados do cartão")');
  await page.waitForURL(/\/__checkout\/checkoutSession\/show\?id=/, { timeout: 15000 });
  return new URL(page.url()).searchParams.get("id");
}

try {
  const trialEnd = todaySP(7);

  // 0. Página de vendas e Termos
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`);
    const anual = await page.locator('[data-testid="landing-anual"]').innerText();
    check("página de vendas mostra o plano anual: R$ 304,98 por ano, 15% de desconto, R$ 25,42 por mês", /304,98 por ano/.test(anual) && /15% de desconto/.test(anual) && /25,42 por mês/.test(anual), anual);
    await page.goto(`${BASE}/termos`);
    const t = await page.textContent("body");
    check("Termos explicam o plano anual (valor, renovação, cancelamento e desistência em 7 dias)", t.includes("Plano mensal e plano anual") && t.includes("R$ 304,98 por ano") && t.includes("uma vez por ano") && t.includes("Nos primeiros 7 dias"));
    await page.close();
  }

  // =========================================================================
  // A. Em teste: escolhe o anual, paga o Pix, vence um ano depois do teste
  // =========================================================================
  const a = await signup("Ana Anual");
  {
    const { page } = a;
    await page.goto(`${BASE}/assinatura`);
    check("a escolha do plano aparece antes do CPF, com o mensal marcado", (await page.locator('[data-testid="escolha-plano"]').count()) === 1 && (await page.getAttribute('[data-testid="plano-mensal"]', "aria-pressed")) === "true");
    const opt = await page.locator('[data-testid="plano-anual"]').innerText();
    check("opção anual mostra valor, desconto, equivalente por mês e economia", /304,98 por ano/.test(opt) && /15% de desconto/.test(opt) && /25,42 por mês/.test(opt) && /53,82/.test(opt), opt);
    await openPayment(page);
    let u = await userOf(a.email);
    const subMensal = u.asaas_subscription_id;
    check("começa no mensal: assinatura de R$ 29,90 por mês", fake.state.subscriptions.get(subMensal).value === 29.9 && fake.state.subscriptions.get(subMensal).cycle === "MONTHLY" && u.billing_plan === "MONTHLY");

    await choose(page, "anual");
    await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    u = await userOf(a.email);
    const subs = activeSubs(u.asaas_customer_id);
    check("trocou para o anual: plano gravado e UMA assinatura ativa no Asaas (a mensal foi apagada)", u.billing_plan === "YEARLY" && subs.length === 1 && subs[0].id === u.asaas_subscription_id && fake.state.subscriptions.get(subMensal).deleted === true, `${u.billing_plan} ${subs.length}`);
    check("assinatura anual: R$ 304,98, ciclo anual, 1ª cobrança no fim do teste", subs[0].value === 304.98 && subs[0].cycle === "YEARLY" && subs[0].nextDueDate === trialEnd, JSON.stringify({ v: subs[0].value, c: subs[0].cycle, d: subs[0].nextDueDate }));
    const local = await sql`select value::text as value, status from billing_payments where user_id = ${u.id} order by created_at`;
    check("no espelho local: a cobrança mensal ficou cancelada e a anual em aberto", local.length === 2 && local[0].value === "29.90" && local[0].status === "DELETED" && local[1].value === "304.98" && local[1].status === "PENDING", JSON.stringify(local));
    const t = await page.textContent("body");
    check("a tela passa a mostrar o valor anual e a palavra anuidade", /R\$\s304,98/.test(t) && t.includes("por ano") && t.includes("Contay — anual") && /304,98 · vence/.test(t.replace(/\s+/g, " ")), t.slice(0, 300));
    check("continua em teste e com o app aberto", (await page.locator('a:has-text("Voltar ao app")').count()) === 1);

    // vai e volta: sem lixo no Asaas
    await choose(page, "mensal");
    await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    await choose(page, "anual");
    await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    u = await userOf(a.email);
    const subs2 = activeSubs(u.asaas_customer_id);
    check("trocar de ideia várias vezes deixa sempre uma única assinatura ativa, do plano escolhido", subs2.length === 1 && subs2[0].cycle === "YEARLY" && subs2[0].value === 304.98, JSON.stringify(subs2.map((s) => [s.cycle, s.value])));
    const custs = [...fake.state.customers.values()].filter((c) => c.email === a.email);
    check("o cliente no Asaas é sempre o mesmo (não duplica)", custs.length === 1, `${custs.length}`);

    // paga a anuidade
    const [pay] = fake.paymentsOf(u.asaas_subscription_id);
    await fetch(`http://localhost:3998/__test/pay/${pay.id}`, { method: "POST" });
    await asaasWebhook("PAYMENT_RECEIVED", fake.state.payments.get(pay.id));
    await page.waitForURL(`${BASE}/dashboard`, { timeout: 30000 });
    u = await userOf(a.email);
    check("pagou a anuidade: conta ativa e próximo vencimento UM ANO depois do fim do teste", u.status === "active" && isoDate(u.subscription_due_date) === addMonths(trialEnd, 12), `${u.status} ${isoDate(u.subscription_due_date)} esperado ${addMonths(trialEnd, 12)}`);
    await page.goto(`${BASE}/assinatura`);
    const paidTxt = await page.textContent("body");
    check("assinante anual vê o próximo vencimento do ano que vem e não vê mais a escolha de plano", paidTxt.includes(br(addMonths(trialEnd, 12))) && (await page.locator('[data-testid="escolha-plano"]').count()) === 0 && (await page.locator('[data-testid="oferta-anual"]').count()) === 0);
    await page.goto(`${BASE}/dashboard`);
    check("assinante anual em dia entra no app sem aviso de cobrança", new URL(page.url()).pathname === "/dashboard" && !(await page.textContent("body")).includes("anuidade de"));
  }

  // =========================================================================
  // B. Quem já paga não troca pela tela (tela antiga aberta + pagamento no meio)
  // =========================================================================
  {
    const b = await signup("Beto Mensal");
    await openPayment(b.page);
    const stale = await b.ctx.newPage();
    await stale.goto(`${BASE}/assinatura`);
    await stale.waitForSelector('[data-testid="plano-anual"]');
    let u = await userOf(b.email);
    const [pay] = fake.paymentsOf(u.asaas_subscription_id);
    await fetch(`http://localhost:3998/__test/pay/${pay.id}`, { method: "POST" });
    await asaasWebhook("PAYMENT_RECEIVED", fake.state.payments.get(pay.id));
    u = await userOf(b.email);
    check("[já pagou] virou assinante mensal", u.status === "active" && u.billing_plan === "MONTHLY");
    // a aba antiga ainda mostra o botão: o servidor tem que recusar
    await stale.evaluate(() => document.querySelector('[data-testid="plano-anual"]')?.removeAttribute("disabled"));
    await stale.click('[data-testid="plano-anual"]', { timeout: 5000 }).catch(() => {});
    await stale.waitForTimeout(1500);
    u = await userOf(b.email);
    const subs = activeSubs(u.asaas_customer_id);
    check("[já pagou] tentar trocar por uma tela antiga não muda nada: plano, assinatura e vencimento intactos", u.billing_plan === "MONTHLY" && subs.length === 1 && subs[0].cycle === "MONTHLY" && isoDate(u.subscription_due_date) === addMonths(todaySP(7), 1), `${u.billing_plan} ${subs.length} ${isoDate(u.subscription_due_date)}`);
    await b.page.goto(`${BASE}/assinatura`);
    check("[já pagou] a tela oferece o anual só pelo suporte", (await b.page.locator('[data-testid="oferta-anual"]').count()) === 1 && (await b.page.locator('[data-testid="escolha-plano"]').count()) === 0);
    await b.ctx.close();
  }

  // =========================================================================
  // C. Anual no cartão
  // =========================================================================
  {
    const c = await signup("Caio Cartao");
    await openPayment(c.page);
    await choose(c.page, "anual");
    await c.page.waitForSelector("#card-cep", { timeout: 15000 });
    check("[cartão anual] texto fala em anuidade e todo ano", /1ª anuidade de R\$\s304,98/.test(await c.page.textContent("body")) && (await c.page.textContent("body")).includes("todo ano"));
    const coId = await fillCard(c.page);
    let u = await userOf(c.email);
    const co = fake.checkoutsOf(u.asaas_customer_id).find((x) => x.id === coId);
    check("[cartão anual] checkout de R$ 304,98, ciclo anual, 1ª cobrança no fim do teste", co?.items?.[0]?.value === 304.98 && co?.subscription?.cycle === "YEARLY" && co?.subscription?.nextDueDate?.startsWith(trialEnd), JSON.stringify({ v: co?.items?.[0]?.value, c: co?.subscription?.cycle, d: co?.subscription?.nextDueDate }));
    const done = await (await fetch(`http://localhost:3998/__test/checkout/${coId}`, { method: "POST" })).json();
    await c.page.goto(`${BASE}/assinatura?cartao=ok`);
    await c.page.waitForSelector('[data-testid="assinatura-cartao-no-teste"]', { timeout: 15000 });
    u = await userOf(c.email);
    check("[cartão anual] cartão adotado, plano anual mantido, só a assinatura de cartão ativa", u.billing_method === "CREDIT_CARD" && u.billing_plan === "YEARLY" && activeSubs(u.asaas_customer_id).length === 1, `${u.billing_method} ${u.billing_plan}`);
    check("[cartão anual] com o cartão cadastrado a escolha de plano some (troca só pelo suporte)", (await c.page.locator('[data-testid="escolha-plano"]').count()) === 0);
    const cardPay = fake.state.payments.get(done.payment.id);
    cardPay.status = "CONFIRMED";
    cardPay.paymentDate = cardPay.clientPaymentDate = todaySP();
    await asaasWebhook("PAYMENT_CONFIRMED", cardPay);
    u = await userOf(c.email);
    check("[cartão anual] cobrança confirmada: ativo, próximo vencimento um ano depois", u.status === "active" && isoDate(u.subscription_due_date) === addMonths(trialEnd, 12), `${u.status} ${isoDate(u.subscription_due_date)}`);
    await c.ctx.close();
  }

  // =========================================================================
  // D. Abriu o Checkout do MENSAL, trocou para anual na tela e depois concluiu
  //    o Checkout antigo: vale o que o Asaas vai cobrar (mensal)
  // =========================================================================
  {
    const d = await signup("Dani Desencontro");
    await openPayment(d.page);
    const coId = await fillCard(d.page); // checkout do plano mensal
    await d.page.goto(`${BASE}/assinatura`);
    await choose(d.page, "anual");
    let u = await userOf(d.email);
    check("[desencontro] na tela o plano virou anual", u.billing_plan === "YEARLY");
    const done = await (await fetch(`http://localhost:3998/__test/checkout/${coId}`, { method: "POST" })).json();
    await d.page.goto(`${BASE}/assinatura?cartao=ok`);
    await d.page.waitForSelector('[data-testid="assinatura-cartao-no-teste"]', { timeout: 15000 });
    u = await userOf(d.email);
    check("[desencontro] concluiu o Checkout mensal: o plano volta a ser mensal, igual ao que será cobrado", u.billing_plan === "MONTHLY" && u.billing_method === "CREDIT_CARD" && activeSubs(u.asaas_customer_id).length === 1 && activeSubs(u.asaas_customer_id)[0].value === 29.9, `${u.billing_plan}`);
    check("[desencontro] a tela mostra R$ 29,90 (não promete anuidade)", /R\$\s29,90/.test(await d.page.locator('[data-testid="assinatura-cartao-no-teste"]').innerText()));
    const cardPay = fake.state.payments.get(done.payment.id);
    cardPay.status = "CONFIRMED";
    cardPay.paymentDate = cardPay.clientPaymentDate = todaySP();
    await asaasWebhook("PAYMENT_CONFIRMED", cardPay);
    u = await userOf(d.email);
    check("[desencontro] pagou R$ 29,90: próximo vencimento em UM MÊS (não ganha um ano)", u.status === "active" && isoDate(u.subscription_due_date) === addMonths(trialEnd, 1), isoDate(u.subscription_due_date));
    await d.ctx.close();
  }

  // =========================================================================
  // E. Sem teste grátis (cadastro antigo): anual vence hoje; Asaas fora do ar não troca
  // =========================================================================
  {
    const e = await signup("Eva Antiga");
    await makeLegacyPending(sql, e.email);
    await e.page.goto(`${BASE}/assinatura`);
    await e.page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    await choose(e.page, "anual");
    await e.page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    let u = await userOf(e.email);
    const sub = fake.state.subscriptions.get(u.asaas_subscription_id);
    check("[sem teste] anual: R$ 304,98 vencendo hoje", sub.value === 304.98 && sub.cycle === "YEARLY" && sub.nextDueDate === todaySP(), JSON.stringify({ v: sub.value, d: sub.nextDueDate }));
    const [pay] = fake.paymentsOf(u.asaas_subscription_id);
    await fetch(`http://localhost:3998/__test/pay/${pay.id}`, { method: "POST" });
    await asaasWebhook("PAYMENT_RECEIVED", fake.state.payments.get(pay.id));
    await e.page.waitForURL(`${BASE}/dashboard`, { timeout: 30000 });
    u = await userOf(e.email);
    check("[sem teste] pagou a anuidade: próximo vencimento daqui a um ano", u.status === "active" && isoDate(u.subscription_due_date) === addMonths(todaySP(), 12), isoDate(u.subscription_due_date));
    await e.ctx.close();
  }
  await a.ctx.close();
} catch (err) {
  failed = true;
  console.error("ERRO:", err);
} finally {
  await browser.close();
  await fake.close?.();
  await zapi.close?.();
  await sql.end();
}
console.log(failed ? "\nFALHOU" : "\nTUDO OK");
process.exit(failed ? 1 : 0);
