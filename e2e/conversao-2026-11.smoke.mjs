import { chromium } from "playwright";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";
import { fillCardAddress, fillSignup, randomCpf, randomPhone } from "./helpers/signup.mjs";

// Estratégia de conversão (04/11/2026), de ponta a ponta:
//  - cadastro sem cartão nasce no plano anual sugerido (R$ 97);
//  - quem aceitou os cookies leva os identificadores _fbp/_fbc; quem recusou, nada;
//  - 1º registro (WhatsApp) grava first_entry_at e avisa a Meta pelo servidor
//    (PrimeiroRegistro) uma vez só, e só de quem aceitou os cookies;
//  - oferta de fim de teste: R$ 77 no anual do 5º dia até o dia seguinte ao fim,
//    no Pix (a assinatura a R$ 97 já criada é trocada) e no cartão (12x);
//    pago com a oferta, a renovação volta a R$ 97; Purchase pelo servidor;
//  - reativação: cadastros antigos que não pagaram ganham teste novo + mensagem,
//    no máximo REATIVACAO_POR_DIA por dia; quem pagou ou respondeu SAIR fica de fora.
// NUNCA fala com o Asaas, o WhatsApp nem a Meta de verdade.
//
// Servidor (porta 3102) com tudo falso, teste sem cartão, reativação ligada e CAPI falsa:
//   ... CADASTRO_EXIGE_CARTAO=0 REATIVACAO_WHATSAPP=1 REATIVACAO_POR_DIA=2 REATIVACAO_ATE=2026-01-01T00:00:00-03:00 \
//   META_CAPI_TOKEN=capi-teste META_CAPI_BASE_URL=http://localhost:3995 npx next start -p 3102
// e rode: WHATSAPP_WEBHOOK_SECRET=<o do .env.local> SMOKE_BASE_URL=http://localhost:3102 node e2e/conversao-2026-11.smoke.mjs

if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3102";
const SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || "token-teste-webhook";
const fake = await startFakeAsaas(3998);
const zapi = await startFakeZapi();

// Conversions API falsa (graph.facebook.com)
const capi = [];
const capiServer = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const json = JSON.parse(body || "{}");
      capi.push({ path: req.url, json });
    } catch {
      capi.push({ path: req.url, raw: body });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ events_received: 1 }));
  });
});
await new Promise((r) => capiServer.listen(3995, r));

const sandboxChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (!cond && extra !== undefined ? ` (${String(extra).slice(0, 600)})` : ""));
  if (!cond) failed = true;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todaySP = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offsetDays * 86_400_000));
const isoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const userOf = async (email) => (await sql`select * from users where email = ${email}`)[0];
const sha = (v) => createHash("sha256").update(v).digest("hex");
const processar = () => fetch(`${BASE}/api/automacoes/processar`, { method: "POST" }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const whatsapp = (body) =>
  fetch(`${BASE}/api/whatsapp/lancamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const asaasWebhook = (event, payment) =>
  fetch(`${BASE}/api/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": WEBHOOK_TOKEN },
    body: JSON.stringify({ id: `evt_${event}_${payment.id}_${Date.now()}`, event, payment }),
  });
const capiEvents = (name) => capi.flatMap((c) => c.json?.data ?? []).filter((e) => e.event_name === name);
const texts = (zphone) => zapi.sentTo(zphone).filter((m) => m.kind === "send-text").map((m) => m.body.message);

const FAKE_FBEVENTS = `(function(){var f=window.fbq;window.__px=window.__px||[];if(!f)return;
f.callMethod=function(){window.__px.push(Array.prototype.slice.call(arguments))};
var q=f.queue||[];while(q.length){f.callMethod.apply(f,q.shift())}})();`;

async function newVisitor() {
  const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  await ctx.route(/facebook\.(net|com)/, (route) =>
    route.request().url().endsWith("fbevents.js")
      ? route.fulfill({ contentType: "application/javascript", body: FAKE_FBEVENTS })
      : route.abort()
  );
  await ctx.route(/viacep\.com\.br/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ logradouro: "Rua de Teste", bairro: "Centro" }) })
  );
  return { ctx, page: await ctx.newPage() };
}

async function signup(name, { consent = null } = {}) {
  const v = await newVisitor();
  const email = `conv.${Date.now()}.${Math.floor(Math.random() * 1e5)}@example.com`;
  await v.page.goto(`${BASE}/`);
  if (consent) {
    await v.page.click('[data-testid="cookie-banner"] button:has-text("Aceitar")');
    // os cookies da Meta (o fbevents.js de verdade cria o _fbp; o _fbc vem do clique no anúncio)
    const host = new URL(BASE).hostname;
    await v.ctx.addCookies([
      { name: "_fbp", value: "fb.1.1762270000000.1234567890", domain: host, path: "/" },
      { name: "_fbc", value: "fb.1.1762270000000.IwAR_teste_clique", domain: host, path: "/" },
    ]);
  } else {
    await v.page.click('[data-testid="cookie-banner"] button:has-text("Recusar")');
  }
  await v.page.click('[data-testid="hero-cta"]');
  await v.page.waitForURL(/\/registrar/, { timeout: 10000 });
  await v.page.waitForTimeout(300);
  const { phone } = await fillSignup(v.page, { name, email, password: "SenhaForte123" });
  await v.page.click('button[type="submit"]');
  await v.page.waitForURL(`${BASE}/bem-vindo`, { timeout: 15000 });
  return { ...v, email, phone, zphone: `55${phone}` };
}

async function openPix(page) {
  await page.goto(`${BASE}/assinatura`);
  if (await page.locator("#pay-cpf").count()) {
    await page.fill("#pay-cpf", randomCpf());
    await page.click('[data-testid="cpf-form"] button[type="submit"]');
  }
  await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
}

try {
  // =========================================================================
  // A. Cadastro: anual sugerido; cookies aceitos levam _fbp/_fbc, recusados não
  // =========================================================================
  const a = await signup("Alice Aceitou", { consent: true });
  const r = await signup("Rui Recusou", { consent: false });
  {
    const ua = await userOf(a.email);
    const ur = await userOf(r.email);
    check("cadastro sem cartão nasce em teste no plano anual (sugestão)", ua.billing_plan === "YEARLY" && ua.card_required === false && isoDate(ua.trial_ends_at) === todaySP(7), `${ua.billing_plan} ${ua.card_required} ${ua.trial_ends_at}`);
    check("aceitou os cookies: consentimento, _fbp, _fbc e navegador guardados", Boolean(ua.ads_consent_at) && ua.meta_fbp === "fb.1.1762270000000.1234567890" && ua.meta_fbc === "fb.1.1762270000000.IwAR_teste_clique" && Boolean(ua.meta_ua), JSON.stringify({ c: ua.ads_consent_at, p: ua.meta_fbp, f: ua.meta_fbc }));
    check("recusou os cookies: nada da Meta guardado", ur.ads_consent_at === null && ur.meta_fbp === null && ur.meta_fbc === null && ur.meta_ua === null);
    check("ninguém começa com 1º registro", ua.first_entry_at === null && ur.first_entry_at === null);
    const px = await a.page.evaluate(() => (window.__px || []).map((e) => e[1]));
    check("tela de boas-vindas conta cadastro e início do teste (pixel do navegador)", px.includes("CompleteRegistration") && px.includes("StartTrial"), JSON.stringify(px));
  }

  // =========================================================================
  // B. 1º registro pelo WhatsApp -> first_entry_at + PrimeiroRegistro (só com consentimento)
  // =========================================================================
  {
    const w1 = await whatsapp({ phone: a.zphone, description: "Almoço", amount: 25, categoryKey: "alimentacao" });
    check("lançamento pelo WhatsApp aceito", w1.status === 201, JSON.stringify(w1.json));
    for (let i = 0; i < 40 && capiEvents("PrimeiroRegistro").length === 0; i++) await sleep(150);
    let ua = await userOf(a.email);
    const ev = capiEvents("PrimeiroRegistro");
    check("1º registro gravado (first_entry_at)", ua.first_entry_at !== null);
    check("Meta avisada 1 vez pelo servidor: PrimeiroRegistro", ev.length === 1, JSON.stringify(capi));
    const e = ev[0] ?? {};
    check("evento com id fixo por conta, origem site, _fbp/_fbc, navegador e id embaralhado", e.event_id === `primeiro-registro-${ua.id}` && e.action_source === "website" && e.user_data?.fbp === ua.meta_fbp && e.user_data?.fbc === ua.meta_fbc && Boolean(e.user_data?.client_user_agent) && e.user_data?.external_id?.[0] === sha(ua.id), JSON.stringify(e));
    const body = JSON.stringify(capi);
    check("nada de e-mail, telefone, nome ou lançamento vai para a Meta", !body.includes(a.email) && !body.includes(a.phone) && !body.includes("Alice") && !body.includes("Almoço"), body.slice(0, 300));
    check("token e pixel certos no envio", capi[0]?.path === "/123456789012345/events" && capi[0]?.json?.access_token === "capi-teste", capi[0]?.path);
    const firstAt = ua.first_entry_at.getTime();
    await whatsapp({ phone: a.zphone, description: "Uber", amount: 18 });
    await sleep(800);
    ua = await userOf(a.email);
    check("2º registro não muda a data nem avisa de novo", ua.first_entry_at.getTime() === firstAt && capiEvents("PrimeiroRegistro").length === 1);

    const before = capi.length;
    const w2 = await whatsapp({ phone: r.zphone, description: "Padaria", amount: 9 });
    await sleep(1000);
    const ur = await userOf(r.email);
    check("quem recusou os cookies: 1º registro gravado, mas a Meta NÃO é avisada", w2.status === 201 && ur.first_entry_at !== null && capi.length === before, `${w2.status} ${capi.length - before}`);

    // pelo app (conta fixa) também conta
    const c = await signup("Carlos App");
    await c.page.goto(`${BASE}/contas-fixas`);
    await c.page.fill('input[name="description"]', "Internet");
    await c.page.fill('input[name="amount"]', "99.9");
    await c.page.click('form:has(input[name="description"]) button[type="submit"]');
    let uc;
    for (let i = 0; i < 40; i++) {
      uc = await userOf(c.email);
      if (uc.first_entry_at) break;
      await sleep(150);
    }
    check("1º registro pelo app (conta fixa) também é gravado", Boolean(uc.first_entry_at));
    await c.ctx.close();
  }

  // =========================================================================
  // C. Oferta de fim de teste: R$ 77 (Pix troca a assinatura de R$ 97; cartão em 12x)
  // =========================================================================
  {
    // dia 0: abre o Pix a preço cheio
    await openPix(a.page);
    let ua = await userOf(a.email);
    const subFull = ua.asaas_subscription_id;
    check("antes da oferta: Pix anual de R$ 97 vencendo no fim do teste", fake.state.subscriptions.get(subFull).value === 97 && fake.state.subscriptions.get(subFull).cycle === "YEARLY");
    check("antes da oferta: a tela não mostra a oferta", (await a.page.locator('[data-testid="oferta-fim-teste"]').count()) === 0);
    check("tela de pagamento mostra a garantia de 7 dias", (await a.page.locator('[data-testid="assinatura-garantia"]').innerText()).includes("Garantia de 7 dias"));

    // 5º dia (faltam 2)
    await sql`update users set trial_ends_at = ${todaySP(2)} where email = ${a.email}`;
    await openPix(a.page);
    ua = await userOf(a.email);
    const sub77 = fake.state.subscriptions.get(ua.asaas_subscription_id);
    const offer = (await a.page.locator('[data-testid="oferta-fim-teste"]').innerText()).replace(/ /g, " ");
    check("oferta aparece na tela com R$ 77, o preço cheio e o prazo", offer.includes("R$ 77") && offer.includes("R$ 97") && offer.includes(`${todaySP(3).slice(8, 10)}/${todaySP(3).slice(5, 7)}`), offer);
    check("Pix trocado: a assinatura de R$ 97 foi apagada e a nova é de R$ 77", ua.asaas_subscription_id !== subFull && fake.state.subscriptions.get(subFull).deleted === true && sub77.value === 77 && sub77.cycle === "YEARLY", JSON.stringify({ old: fake.state.subscriptions.get(subFull).deleted, v: sub77.value }));
    const local = await sql`select value::text as value, status from billing_payments where user_id = ${ua.id} order by created_at`;
    check("espelho local: a cobrança de R$ 97 cancelada, a de R$ 77 em aberto", local.length === 2 && local[0].status === "DELETED" && local[1].value === "77.00" && local[1].status === "PENDING", JSON.stringify(local));
    const big = (await a.page.textContent("body")).replace(/ /g, " ");
    check("caixa do plano mostra R$ 97 riscado e R$ 77", /R\$ 97,00\s*R\$ 77,00/.test(big), big.slice(0, 400));
    await openPix(a.page);
    ua = await userOf(a.email);
    check("abrir a tela de novo não troca a assinatura outra vez", ua.asaas_subscription_id === sub77.id && [...fake.state.subscriptions.values()].filter((s) => s.customer === ua.asaas_customer_id && !s.deleted).length === 1);

    // paga a oferta
    const [pay] = fake.paymentsOf(sub77.id);
    await fetch(`http://localhost:3998/__test/pay/${pay.id}`, { method: "POST" });
    const res = await asaasWebhook("PAYMENT_RECEIVED", fake.state.payments.get(pay.id));
    check("webhook do pagamento aceito", res.status === 200);
    ua = await userOf(a.email);
    check("pagou a oferta: conta ativa", ua.status === "active");
    check("renovação volta ao preço cheio: assinatura passa a R$ 97", fake.state.subscriptions.get(sub77.id).value === 97, String(fake.state.subscriptions.get(sub77.id).value));
    for (let i = 0; i < 40 && capiEvents("Purchase").length === 0; i++) await sleep(150);
    const pur = capiEvents("Purchase");
    check("Meta avisada pelo servidor: Purchase de R$ 77 em BRL, 1 vez", pur.length === 1 && pur[0].custom_data?.value === 77 && pur[0].custom_data?.currency === "BRL" && pur[0].event_id === `compra-${ua.id}`, JSON.stringify(pur));

    // cartão na oferta: compra do ano em até 12x por R$ 77
    const k = await signup("Kátia Cartão", { consent: false });
    await sql`update users set trial_ends_at = ${todaySP(1)} where email = ${k.email}`;
    await k.page.goto(`${BASE}/assinatura`);
    await k.page.fill("#pay-cpf", randomCpf());
    await k.page.click('[data-testid="cpf-form"] button[type="submit"]');
    await k.page.waitForSelector("#card-cep", { timeout: 15000 });
    await fillCardAddress(k.page, { cep: "58310000", street: "Rua das Flores", number: "12", district: "Centro" });
    await k.page.click('button:has-text("Continuar para os dados do cartão")');
    await k.page.waitForURL(/\/__checkout\/checkoutSession\/show\?id=/, { timeout: 15000 });
    const coId = new URL(k.page.url()).searchParams.get("id");
    const co = fake.state.checkouts.get(coId);
    check("cartão na oferta: compra do ano por R$ 77, à vista ou em até 12x", co?.items?.[0]?.value === 77 && co?.installment?.maxInstallmentCount === 12 && !co?.subscription, JSON.stringify({ v: co?.items?.[0]?.value, i: co?.installment }));
    await k.ctx.close();

    // oferta acabou (2 dias depois do fim): volta a R$ 97
    const o = await signup("Otávio Atrasado", { consent: false });
    await sql`update users set trial_ends_at = ${todaySP(-2)} where email = ${o.email}`;
    await openPix(o.page);
    const uo = await userOf(o.email);
    check("passou o prazo da oferta: Pix anual de R$ 97 e nenhuma oferta na tela", fake.state.subscriptions.get(uo.asaas_subscription_id).value === 97 && (await o.page.locator('[data-testid="oferta-fim-teste"]').count()) === 0);
    await o.ctx.close();
  }

  // =========================================================================
  // D. Reativação de cadastros antigos (no máximo 2 por dia neste servidor)
  // =========================================================================
  {
    // sobras de rodadas anteriores (cadastros "antigos" de teste) atrapalhariam a ordem e o limite
    await sql`delete from users where email like 'reat.%@example.com'`;
    const old = async (label, over = {}) => {
      const email = `reat.${label}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.com`;
      const phone = randomPhone();
      const [u] = await sql`
        insert into users (id, name, email, password_hash, whatsapp_phone, billing_enabled, status, trial_ends_at, card_required, billing_plan, created_at, terms_accepted_at, terms_version)
        values (gen_random_uuid()::text, ${label}, ${email}, 'x', ${phone}, true, 'pending', ${"trial" in over ? over.trial : "2025-12-08"}, ${over.cardRequired ?? false}, 'MONTHLY', ${over.created ?? "2025-12-01T10:00:00-03:00"}, now(), '2026-11-04.1')
        returning id`;
      return { id: u.id, email, zphone: `55${phone}` };
    };
    // o mais novo sai primeiro
    const t1 = await old("Teresa Encerrado", { created: "2025-12-03T10:00:00-03:00" });
    const t2 = await old("Caio CartaoObrig", { created: "2025-12-02T10:00:00-03:00", cardRequired: true, trial: null });
    const t3 = await old("Lia Terceira", { created: "2025-12-01T10:00:00-03:00" });
    const paid = await old("Paulo Pagou", { created: "2025-12-04T10:00:00-03:00" });
    await sql`insert into billing_payments (id, user_id, asaas_payment_id, due_date, value, status, paid_at) values (gen_random_uuid()::text, ${paid.id}, ${"pay_old_" + Date.now()}, '2025-12-08', 29.90, 'RECEIVED', now())`;
    const sair = await old("Sara Saiu", { created: "2025-12-05T10:00:00-03:00" });
    await sql`update users set marketing_opt_out_at = now() where id = ${sair.id}`;
    const recent = await old("Nina Nova", { created: "2026-10-20T10:00:00-03:00" });
    const ASAAS_H = { "Content-Type": "application/json", access_token: "$aact_hmlg_teste", "User-Agent": "teste" };
    // t1 tinha uma assinatura Pix antiga (R$ 29,90) no Asaas, nunca paga
    const cus = await (await fetch("http://localhost:3998/v3/customers", { method: "POST", headers: ASAAS_H, body: JSON.stringify({ name: "Teresa", cpfCnpj: randomCpf(), email: t1.email }) })).json();
    const oldSub = await (await fetch("http://localhost:3998/v3/subscriptions", { method: "POST", headers: ASAAS_H, body: JSON.stringify({ customer: cus.id, billingType: "PIX", cycle: "MONTHLY", value: 29.9, nextDueDate: "2025-12-08", description: "x", externalReference: t1.id }) })).json();
    await sql`update users set asaas_customer_id = ${cus.id}, asaas_subscription_id = ${oldSub.id} where id = ${t1.id}`;

    let out = await processar();
    check("reativação roda junto das automações", out.status === 200 && out.json.reactivation?.sent === 2, JSON.stringify(out.json));
    const m1 = texts(t1.zphone).pop() ?? "";
    check("1º e 2º mais novos recebem a mensagem de teste novo sem cartão, com SAIR", /7 dias grátis, sem cartão/.test(m1) && /SAIR/.test(m1) && texts(t2.zphone).length === 1, m1);
    const u1 = await userOf(t1.email);
    const u2 = await userOf(t2.email);
    check("teste novo: 7 dias a partir de hoje, sem cartão, anual sugerido, marcado como reativado", isoDate(u1.trial_ends_at) === todaySP(7) && u1.card_required === false && u1.billing_plan === "YEARLY" && u1.reactivated_at !== null, `${u1.trial_ends_at} ${u1.billing_plan}`);
    check("quem parou no cartão obrigatório também ganha o teste sem cartão", u2.card_required === false && isoDate(u2.trial_ends_at) === todaySP(7));
    check("assinatura Pix antiga (R$ 29,90) apagada no Asaas e na conta", fake.state.subscriptions.get(oldSub.id).deleted === true && u1.asaas_subscription_id === null);
    check("limite do dia: o 3º não recebe hoje", texts(t3.zphone).length === 0);
    out = await processar();
    check("rodar de novo no mesmo dia não manda mais nada", out.json.reactivation?.sent === 0 && texts(t3.zphone).length === 0 && texts(t1.zphone).length === 1, JSON.stringify(out.json.reactivation));
    // dia seguinte
    await sql`update automation_messages set last_attempt_at = last_attempt_at - interval '1 day' where kind = 'reativacao' and user_id in (${t1.id}, ${t2.id})`;
    out = await processar();
    check("no dia seguinte sai o 3º", texts(t3.zphone).length === 1);
    const [{ n }] = await sql`select count(*)::int as n from automation_messages where kind = 'reativacao' and user_id in (${paid.id}, ${sair.id}, ${recent.id})`;
    check("quem pagou, respondeu SAIR ou é recente nunca recebe a reativação", n === 0 && texts(paid.zphone).length === 0 && texts(sair.zphone).length === 0 && !texts(recent.zphone).some((m) => /sem cartão/.test(m)), `${n}`);
    const rp = await userOf(paid.email);
    check("conta que já pagou não é mexida", rp.reactivated_at === null && isoDate(rp.trial_ends_at) === "2025-12-08");

    // o reativado entra no fluxo de ativação (cadastro antigo, antes da data de início das automações)
    await sql`update users set trial_ends_at = ${todaySP(5)} where id = ${t1.id}`;
    await processar();
    const act = texts(t1.zphone).pop() ?? "";
    check("reativado recebe a ativação do 2º dia (foto)", /foto/.test(act) && texts(t1.zphone).length === 2, act.slice(0, 120));
    // pelo WhatsApp já consegue lançar
    const w = await whatsapp({ phone: t1.zphone, description: "Mercado", amount: 40 });
    check("reativado lança pelo WhatsApp", w.status === 201, JSON.stringify(w.json));
  }

  await a.ctx.close();
  await r.ctx.close();
} catch (err) {
  console.error("ERRO:", err);
  failed = true;
} finally {
  await browser.close();
  await fake.close?.();
  await zapi.close?.();
  capiServer.close();
  await sql.end();
}
console.log(failed ? "\nFALHOU" : "\nTUDO OK");
process.exit(failed ? 1 : 0);
