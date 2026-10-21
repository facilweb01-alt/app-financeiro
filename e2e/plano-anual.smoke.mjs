import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";
import { fillCardAddress, fillSignup, makeLegacyPending, randomCpf } from "./helpers/signup.mjs";

// Plano anual com 10% de desconto (11/10/2026), de ponta a ponta:
//  - a tela de pagamento deixa escolher mensal (R$ 29,90) ou anual (R$ 322,92);
//  - trocar de plano refaz a cobrança Pix com o valor e o ciclo certos, sem
//    deixar duas assinaturas no Asaas;
//  - pagou a anuidade: o próximo vencimento é um ano depois;
//  - anual no cartão à vista ou em até 12x (compra do ano, sem cobrança
//    automática) e a renovação perto do fim do ano; Checkout antigo concluído
//    depois da troca de plano (nos dois sentidos);
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
  await fillCardAddress(page, { cep: "58310000", street: "Rua das Flores", number: "12", district: "Centro" });
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
    check("página de vendas mostra o plano anual: R$ 322,92 por ano, 10% de desconto, R$ 26,91 por mês", /322,92 por ano/.test(anual) && /10% de desconto/.test(anual) && /26,91 por mês/.test(anual), anual);
    await page.goto(`${BASE}/termos`);
    const t = await page.textContent("body");
    check("Termos explicam o plano anual (valor, renovação, cancelamento e desistência em 7 dias)", t.includes("Plano mensal e plano anual") && t.includes("R$ 322,92 por ano") && t.includes("uma vez por ano") && t.includes("Nos primeiros 7 dias"));
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
    check("opção anual mostra valor, desconto, equivalente por mês e economia", /322,92 por ano/.test(opt) && /10% de desconto/.test(opt) && /26,91 por mês/.test(opt) && /35,88/.test(opt), opt);
    await openPayment(page);
    let u = await userOf(a.email);
    const subMensal = u.asaas_subscription_id;
    check("começa no mensal: assinatura de R$ 29,90 por mês", fake.state.subscriptions.get(subMensal).value === 29.9 && fake.state.subscriptions.get(subMensal).cycle === "MONTHLY" && u.billing_plan === "MONTHLY");

    await choose(page, "anual");
    await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    u = await userOf(a.email);
    const subs = activeSubs(u.asaas_customer_id);
    check("trocou para o anual: plano gravado e UMA assinatura ativa no Asaas (a mensal foi apagada)", u.billing_plan === "YEARLY" && subs.length === 1 && subs[0].id === u.asaas_subscription_id && fake.state.subscriptions.get(subMensal).deleted === true, `${u.billing_plan} ${subs.length}`);
    check("assinatura anual: R$ 322,92, ciclo anual, 1ª cobrança no fim do teste", subs[0].value === 322.92 && subs[0].cycle === "YEARLY" && subs[0].nextDueDate === trialEnd, JSON.stringify({ v: subs[0].value, c: subs[0].cycle, d: subs[0].nextDueDate }));
    const local = await sql`select value::text as value, status from billing_payments where user_id = ${u.id} order by created_at`;
    check("no espelho local: a cobrança mensal ficou cancelada e a anual em aberto", local.length === 2 && local[0].value === "29.90" && local[0].status === "DELETED" && local[1].value === "322.92" && local[1].status === "PENDING", JSON.stringify(local));
    const t = await page.textContent("body");
    check("a tela passa a mostrar o valor anual e a palavra anuidade", /R\$\s322,92/.test(t) && t.includes("por ano") && t.includes("Contay — anual") && /322,92 · vence/.test(t.replace(/\s+/g, " ")), t.slice(0, 300));
    check("continua em teste e com o app aberto", (await page.locator('a:has-text("Voltar ao app")').count()) === 1);

    // vai e volta: sem lixo no Asaas
    await choose(page, "mensal");
    await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    await choose(page, "anual");
    await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    u = await userOf(a.email);
    const subs2 = activeSubs(u.asaas_customer_id);
    check("trocar de ideia várias vezes deixa sempre uma única assinatura ativa, do plano escolhido", subs2.length === 1 && subs2[0].cycle === "YEARLY" && subs2[0].value === 322.92, JSON.stringify(subs2.map((s) => [s.cycle, s.value])));
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
  // C. Anual no cartão em até 12x (12/10/2026): compra do ano no Checkout,
  //    cobrada na hora; o ano começa no fim do teste; sem cobrança automática;
  //    renovação perto do fim do ano (cartão de novo ou Pix)
  // =========================================================================
  {
    const c = await signup("Caio Cartao");
    await openPayment(c.page);
    await choose(c.page, "anual");
    await c.page.waitForSelector("#card-cep", { timeout: 15000 });
    let body = (await c.page.textContent("body")).replace(/\s+/g, " ");
    check("[anual 12x] cartão oferece o ano à vista ou em até 12x, cobrado na hora, contando do fim do teste", body.includes("Pague o ano no cartão, à vista ou em até 12x") && body.includes(`o ano só começa a contar em ${br(trialEnd)}`) && body.includes("A cobrança é feita na hora"), body.slice(0, 500));
    check("[anual 12x] passo a passo avisa que dá para escolher as parcelas no Asaas", (await c.page.locator('[data-testid="card-steps"]').innerText()).includes("à vista ou em até 12x"));
    check("[anual 12x] escolha de plano e caixa do plano falam em até 12x no cartão", body.includes("até 12x no cartão ou Pix") && body.includes("No cartão, em até 12x."));
    const coId = await fillCard(c.page);
    let u = await userOf(c.email);
    const co = fake.checkoutsOf(u.asaas_customer_id).find((x) => x.id === coId);
    check("[anual 12x] Checkout de compra: R$ 322,92, à vista ou parcelado em até 12x, sem assinatura", co?.items?.[0]?.value === 322.92 && JSON.stringify(co?.chargeTypes) === '["DETACHED","INSTALLMENT"]' && co?.installment?.maxInstallmentCount === 12 && !co?.subscription, JSON.stringify({ v: co?.items?.[0]?.value, t: co?.chargeTypes, i: co?.installment }));
    check("[anual 12x] o início do ano (fim do teste) fica gravado ao abrir o Checkout", isoDate(u.card_period_start) === trialEnd, isoDate(u.card_period_start));
    const reserva = u.asaas_subscription_id;
    check("[anual 12x] até concluir, a assinatura Pix continua como reserva", Boolean(reserva) && activeSubs(u.asaas_customer_id).length === 1);

    // concluiu no Asaas em 12x e voltou (sem webhook: a tela confere direto no Asaas)
    const done = await (await fetch(`http://localhost:3998/__test/purchase/${coId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ installments: 12 }) })).json();
    check("[anual 12x] (Asaas falso) 12 parcelas confirmadas somando R$ 322,92", done.payments.length === 12 && Math.round(done.payments.reduce((t, p) => t + p.value, 0) * 100) === 32292);
    await c.page.goto(`${BASE}/assinatura?cartao=ok`);
    await c.page.waitForSelector('[data-testid="anual-pago-ok"]', { timeout: 15000 });
    u = await userOf(c.email);
    const due1 = addMonths(trialEnd, 12);
    check("[anual 12x] pago: conta ativa, ano pago no cartão, sem assinatura no Asaas", u.status === "active" && u.billing_method === "CARD_INSTALLMENT" && u.billing_plan === "YEARLY" && u.asaas_subscription_id === null && activeSubs(u.asaas_customer_id).length === 0, `${u.status} ${u.billing_method} ${u.asaas_subscription_id} ${activeSubs(u.asaas_customer_id).length}`);
    check("[anual 12x] a assinatura Pix reserva foi apagada no Asaas", fake.state.subscriptions.get(reserva).deleted === true);
    check("[anual 12x] o ano conta do fim do teste: próximo vencimento um ano depois dele", isoDate(u.subscription_due_date) === due1, `${isoDate(u.subscription_due_date)} esperado ${due1}`);
    let local = await sql`select status, billing_type, asaas_installment_id, installment_number, period_start from billing_payments where user_id = ${u.id} order by created_at`;
    const parc = local.filter((r) => r.asaas_installment_id);
    check("[anual 12x] espelho: as 12 parcelas gravadas com o mesmo início do ano, e o Pix reserva cancelado", parc.length === 12 && parc.every((r) => isoDate(r.period_start) === trialEnd) && new Set(parc.map((r) => r.installment_number)).size === 12 && local.some((r) => r.billing_type !== "CREDIT_CARD" && r.status === "DELETED"), JSON.stringify(local.map((r) => [r.status, r.installment_number, isoDate(r.period_start)])));
    check("[anual 12x] início do ano pendente foi limpo depois da compra", u.card_period_start === null);
    body = (await c.page.textContent("body")).replace(/\s+/g, " ");
    check("[anual 12x] tela: ano pago no cartão até a data, sem cartão nem Pix para pagar e sem escolha de plano", body.includes(`Seu acesso está garantido até ${br(due1)}`) && (await c.page.locator('[data-testid="anual-pago-cartao"]').count()) === 1 && (await c.page.locator("#card-cep").count()) === 0 && (await c.page.locator('img[alt="QR Code do Pix"]').count()) === 0 && (await c.page.locator('[data-testid="escolha-plano"]').count()) === 0, body.slice(0, 600));
    const hist = (await c.page.locator("li", { hasText: "Plano anual a partir de" }).allInnerTexts()).join(" | ").replace(/\s+/g, " ");
    check("[anual 12x] histórico: UMA linha com o ano, R$ 322,92, cartão em 12x, paga", hist.includes(`Plano anual a partir de ${br(trialEnd)}`) && hist.includes("Cartão em 12x") && /322,92/.test(hist) && hist.includes("Paga") && (await c.page.locator("li", { hasText: "Plano anual a partir de" }).count()) === 1, hist);

    // webhooks das parcelas chegando depois: nada muda, nada é recriado
    for (const p of done.payments.slice(0, 3)) await asaasWebhook("PAYMENT_CONFIRMED", fake.state.payments.get(p.id));
    await c.page.goto(`${BASE}/assinatura`);
    u = await userOf(c.email);
    check("[anual 12x] webhooks atrasados e nova visita à tela não criam cobrança nem mudam o vencimento", u.billing_method === "CARD_INSTALLMENT" && activeSubs(u.asaas_customer_id).length === 0 && isoDate(u.subscription_due_date) === due1);
    await c.page.goto(`${BASE}/dashboard`);
    check("[anual 12x] no app, sem aviso de cobrança nem de renovação", (await c.page.locator('[data-testid="renovar-anual"]').count()) === 0 && (await c.page.locator('[data-testid="trial-banner"]').count()) === 0);

    // --- renovação: faltando 3 dias para acabar o ano ---
    const due3 = todaySP(3);
    await sql`update users set subscription_due_date = ${due3} where id = ${u.id}`;
    await sql`update billing_payments set period_start = ${addMonths(due3, -12)} where user_id = ${u.id} and asaas_installment_id is not null`;
    await c.page.goto(`${BASE}/dashboard`);
    const banner = await c.page.locator('[data-testid="renovar-anual"]').innerText().catch(() => "");
    check("[renovação] aviso no app: plano anual termina em 3 dias, renovar no cartão em até 12x ou no Pix", banner.includes("Seu plano anual termina em 3 dias") && banner.includes("12x") && banner.includes("Renovar o plano"), banner);
    await c.page.goto(`${BASE}/assinatura`);
    await c.page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    u = await userOf(c.email);
    const renSub = fake.state.subscriptions.get(u.asaas_subscription_id);
    check("[renovação] Pix anual de renovação vencendo no fim do ano pago (não hoje)", renSub?.cycle === "YEARLY" && renSub?.value === 322.92 && renSub?.nextDueDate === due3 && u.billing_method === "PIX", JSON.stringify({ c: renSub?.cycle, d: renSub?.nextDueDate, m: u.billing_method }));
    body = (await c.page.textContent("body")).replace(/\s+/g, " ");
    check("[renovação] tela oferece renovar em até 12x no cartão (o ano novo começa no fim do atual) ou Pix", body.includes("Renove por mais um ano no cartão, à vista ou em até 12x") && body.includes(`O novo ano começa em ${br(due3)}`) && body.includes("o Pix em aberto é cancelado"), body.slice(0, 600));
    const coRen = await fillCard(c.page);
    u = await userOf(c.email);
    check("[renovação] Checkout de compra com o início do novo ano gravado", isoDate(u.card_period_start) === due3 && JSON.stringify(fake.state.checkouts.get(coRen).chargeTypes) === '["DETACHED","INSTALLMENT"]');
    const ren = await (await fetch(`http://localhost:3998/__test/purchase/${coRen}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ installments: 6 }) })).json();
    // desta vez quem avisa é o webhook (antes de a pessoa voltar para a tela)
    await asaasWebhook("PAYMENT_CONFIRMED", ren.payments[0]);
    u = await userOf(c.email);
    check("[renovação] renovou em 6x pelo webhook: mais um ano a partir do fim do atual, Pix de renovação apagado", u.billing_method === "CARD_INSTALLMENT" && u.asaas_subscription_id === null && activeSubs(u.asaas_customer_id).length === 0 && renSub.deleted === true && isoDate(u.subscription_due_date) === addMonths(due3, 12), `${u.billing_method} ${isoDate(u.subscription_due_date)} esperado ${addMonths(due3, 12)}`);
    await c.page.goto(`${BASE}/assinatura`);
    const hist2 = (await c.page.locator("li", { hasText: "Plano anual a partir de" }).allInnerTexts()).join(" | ").replace(/\s+/g, " ");
    check("[renovação] histórico com as duas compras (12x e 6x)", hist2.includes("Cartão em 12x") && hist2.includes("Cartão em 6x") && hist2.includes(`Plano anual a partir de ${br(due3)}`), hist2);
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
    check("[sem teste] anual: R$ 322,92 vencendo hoje", sub.value === 322.92 && sub.cycle === "YEARLY" && sub.nextDueDate === todaySP(), JSON.stringify({ v: sub.value, d: sub.nextDueDate }));
    const [pay] = fake.paymentsOf(u.asaas_subscription_id);
    await fetch(`http://localhost:3998/__test/pay/${pay.id}`, { method: "POST" });
    await asaasWebhook("PAYMENT_RECEIVED", fake.state.payments.get(pay.id));
    await e.page.waitForURL(`${BASE}/dashboard`, { timeout: 30000 });
    u = await userOf(e.email);
    check("[sem teste] pagou a anuidade: próximo vencimento daqui a um ano", u.status === "active" && isoDate(u.subscription_due_date) === addMonths(todaySP(), 12), isoDate(u.subscription_due_date));
    await e.ctx.close();
  }
  // =========================================================================
  // F. Sem teste grátis: anual no cartão à vista, confirmado pelo webhook
  // =========================================================================
  {
    const f = await signup("Fabio Avista");
    await makeLegacyPending(sql, f.email);
    await f.page.goto(`${BASE}/assinatura`);
    await f.page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    await choose(f.page, "anual");
    await f.page.waitForSelector("#card-cep", { timeout: 15000 });
    const body = (await f.page.textContent("body")).replace(/\s+/g, " ");
    check("[sem teste 1x] cartão: pagar o ano à vista ou em até 12x, acesso liberado na hora", body.includes("Pague o ano no cartão, à vista ou em até 12x, e o acesso é liberado na hora"), body.slice(0, 400));
    const coId = await fillCard(f.page);
    const done = await (await fetch(`http://localhost:3998/__test/purchase/${coId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ installments: 1 }) })).json();
    check("[sem teste 1x] (Asaas falso) uma cobrança à vista, sem parcelamento", done.payments.length === 1 && done.payments[0].installment === null && done.payments[0].value === 322.92);
    await asaasWebhook("PAYMENT_CONFIRMED", done.payments[0]);
    let u = await userOf(f.email);
    check("[sem teste 1x] pago à vista: ativo, um ano a partir de hoje, sem assinatura", u.status === "active" && u.billing_method === "CARD_INSTALLMENT" && activeSubs(u.asaas_customer_id).length === 0 && isoDate(u.subscription_due_date) === addMonths(todaySP(), 12), `${u.status} ${u.billing_method} ${isoDate(u.subscription_due_date)}`);
    await f.page.goto(`${BASE}/assinatura`);
    const hist = (await f.page.locator("li", { hasText: "Plano anual a partir de" }).allInnerTexts()).join(" ").replace(/\s+/g, " ");
    check("[sem teste 1x] histórico mostra cartão à vista", hist.includes("Cartão à vista") && /322,92/.test(hist), hist);
    await f.ctx.close();
  }

  // =========================================================================
  // G. Abriu o Checkout do ANUAL, voltou para o mensal na tela e depois pagou
  //    o anual no Asaas: vale o que foi pago (um ano)
  // =========================================================================
  {
    const g = await signup("Gil Inverso");
    await openPayment(g.page);
    await choose(g.page, "anual");
    await g.page.waitForSelector("#card-cep", { timeout: 15000 });
    const coId = await fillCard(g.page);
    await g.page.goto(`${BASE}/assinatura`);
    await choose(g.page, "mensal");
    let u = await userOf(g.email);
    check("[inverso] na tela o plano voltou a ser mensal", u.billing_plan === "MONTHLY");
    await fetch(`http://localhost:3998/__test/purchase/${coId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ installments: 3 }) });
    await g.page.goto(`${BASE}/assinatura?cartao=ok`);
    await g.page.waitForSelector('[data-testid="anual-pago-ok"]', { timeout: 15000 });
    u = await userOf(g.email);
    check("[inverso] pagou o anual em 3x: plano anual, um ano do fim do teste, assinatura mensal apagada", u.billing_plan === "YEARLY" && u.billing_method === "CARD_INSTALLMENT" && u.status === "active" && activeSubs(u.asaas_customer_id).length === 0 && isoDate(u.subscription_due_date) === addMonths(trialEnd, 12), `${u.billing_plan} ${u.billing_method} ${isoDate(u.subscription_due_date)}`);
    await g.ctx.close();
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
