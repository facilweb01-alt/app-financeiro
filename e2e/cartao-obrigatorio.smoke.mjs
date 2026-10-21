import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";
import { fillCardAddress, fillSignup, randomCpf } from "./helpers/signup.mjs";

// Teste grátis só com cartão de crédito (decisão do Marcelo, 20/10/2026).
//  - página de vendas e cadastro: sem Pix, avisam que o teste pede cartão;
//  - cadastro novo nasce com card_required, sem acesso e sem teste contando;
//  - tela /assinatura: CPF -> endereço -> Checkout do cartão (mensal, 1ª
//    cobrança no fim do teste); nenhuma assinatura Pix é criada no Asaas;
//  - sem cartão: app, boas-vindas e WhatsApp bloqueados (com o caminho certo);
//  - cartão cadastrado: teste de 7 dias liberado a partir dali, boas-vindas
//    com a data da 1ª cobrança, medição de anúncios conta o cadastro;
//  - mensagens: 1 lembrete só para quem não cadastrou o cartão; no teste com
//    cartão, dicas sim e avisos de fim de teste não;
//  - fim do teste: 1ª cobrança confirmada -> conta ativa.
// NUNCA fala com o Asaas, o Z-API nem a Meta de verdade.
//
// O app precisa subir com tudo falso (CADASTRO_EXIGE_CARTAO ausente = ligado):
//   META_PIXEL_ID=123456789012345 ASAAS_API_KEY='$aact_hmlg_teste' \
//   ASAAS_BASE_URL=http://localhost:3998/v3 ASAAS_CHECKOUT_BASE_URL=http://localhost:3998/__checkout \
//   ASAAS_WEBHOOK_TOKEN=token-teste-webhook ZAPI_BASE_URL=http://localhost:3997 ZAPI_INSTANCE_ID=inst-teste \
//   ZAPI_INSTANCE_TOKEN=tok-teste ZAPI_CLIENT_TOKEN=client-teste AUTOMACOES_IGNORAR_HORARIO=1 \
//   AUTOMACOES_INTERVALO_MS=0 AUTOMACOES_DESDE=2026-09-15T00:00:00-03:00 npx next start -p 3100
// e rode: WHATSAPP_WEBHOOK_SECRET=<o do .env.local> node e2e/cartao-obrigatorio.smoke.mjs

if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;
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
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const isoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const processar = () =>
  fetch(`${BASE}/api/automacoes/processar`, { method: "POST" }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
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
const userOf = async (email) => (await sql`select * from users where email = ${email}`)[0];
const texts = (zphone) => zapi.sentTo(zphone).filter((m) => m.kind === "send-text").map((m) => m.body.message);

const FAKE_FBEVENTS = `(function(){var f=window.fbq;window.__px=window.__px||[];if(!f)return;
f.callMethod=function(){window.__px.push(Array.prototype.slice.call(arguments))};
var q=f.queue||[];while(q.length){f.callMethod.apply(f,q.shift())}})();`;

async function newVisitor() {
  const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  await ctx.route(/facebook\.(net|com)/, (route) => {
    const url = route.request().url();
    if (url.includes("connect.facebook.net") && url.endsWith("fbevents.js")) {
      return route.fulfill({ contentType: "application/javascript", body: FAKE_FBEVENTS });
    }
    return route.abort();
  });
  await ctx.route(/viacep\.com\.br/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ logradouro: "Rua de Teste", bairro: "Centro" }) })
  );
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Cadastro pela tela. No fluxo novo, termina na tela /assinatura (cadastrar o cartão). */
async function signup(name, { acceptCookies = false } = {}) {
  const v = await newVisitor();
  const email = `cartao7.${Date.now()}.${Math.floor(Math.random() * 1e5)}@example.com`;
  if (acceptCookies) {
    await v.page.goto(`${BASE}/`);
    await v.page.click('[data-testid="cookie-banner"] button:has-text("Aceitar")');
  }
  await v.page.goto(`${BASE}/registrar`);
  const { phone } = await fillSignup(v.page, { name, email, password: "SenhaForte123" });
  await v.page.click('button[type="submit"]');
  await v.page.waitForURL(`${BASE}/assinatura`, { timeout: 15000 });
  return { ...v, email, phone, zphone: `55${phone}` };
}

async function fillCard(page, cpf) {
  await fillCardAddress(page, { cpf, cep: "58310000", street: "Rua das Flores", number: "12", district: "Centro" });
  await page.click('button:has-text("Continuar para os dados do cartão")');
  await page.waitForURL(/\/__checkout\/checkoutSession\/show\?id=/, { timeout: 15000 });
  return new URL(page.url()).searchParams.get("id");
}

async function waitWelcome(email) {
  for (let i = 0; i < 60; i++) {
    const u = await userOf(email);
    const arrived = zapi.sentTo(`55${u.whatsapp_phone}`).length >= 2;
    if (u.welcome_error || (u.welcome_sent_at && arrived)) return u;
    await new Promise((r) => setTimeout(r, 150));
  }
  return userOf(email);
}

try {
  const today = todaySP();
  const trialEnd = todaySP(7);

  // =========================================================================
  // 0. Página de vendas, cadastro, termos e manual
  // =========================================================================
  {
    const { ctx, page } = await newVisitor();
    await page.goto(`${BASE}/`);
    const landing = await page.textContent("body");
    check("página de vendas não fala em Pix", !/\bpix\b/i.test(landing), (landing.match(/.{0,60}\bpix\b.{0,60}/i) || [""])[0]);
    check("página de vendas explica que o teste pede cartão e que nada é cobrado nos 7 dias", landing.includes("Cadastre o cartão e use 7 dias grátis") && landing.includes("Nada é cobrado agora") && landing.includes("Peça o cancelamento pelo WhatsApp antes do último dia do teste"));
    check("página de vendas: anual com 10% de desconto (R$ 322,92)", landing.includes("10% de desconto") && landing.includes("322,92") && !landing.includes("15% de desconto") && !landing.includes("304,98"));
    check("página de vendas não fala mais em \"sem cartão\"", !/sem cart[aã]o|informa cart[aã]o|pedimos cart[aã]o/i.test(landing));
    await page.goto(`${BASE}/registrar`);
    const reg = await page.textContent("body");
    check("cadastro avisa que o próximo passo é o cartão e que nada é cobrado agora", reg.includes("cadastre seu cartão de crédito para liberar o teste") && reg.includes("não paga nada agora") && reg.includes("cancele antes do fim do teste e não paga nada"));
    await page.goto(`${BASE}/termos`);
    const termos = await page.textContent("body");
    check("termos: teste só com cartão, 1ª cobrança automática no fim, cancelamento antes pelo suporte", termos.includes("é preciso cadastrar um cartão de crédito") && termos.includes("cobrada automaticamente no cartão, sem novo aviso") && termos.includes("peça o cancelamento ao suporte pelo WhatsApp antes do último dia do teste"));
    check("termos: Pix só para contas criadas antes de 20/10/2026; anual a R$ 322,92", termos.includes("O Pix continua disponível apenas para as contas criadas antes de 20/10/2026") && termos.includes("R$ 322,92"));
    await page.goto(`${BASE}/manual`);
    const manual = await page.textContent("body");
    check("manual: teste pede cartão; cancelar antes do último dia; anual 10% pelo suporte", manual.includes("Para liberar o teste é preciso cadastrar um cartão de crédito") && manual.includes("antes do último dia do teste") && manual.includes("R$ 322,92"));
    await ctx.close();
  }

  // =========================================================================
  // A. Cadastro: sem acesso, sem teste contando, sem nada no Asaas
  // =========================================================================
  const a = await signup("Carla Cartao", { acceptCookies: true });
  {
    const { page } = a;
    let u = await userOf(a.email);
    check("conta nasce com card_required, pendente, sem teste contando", u.card_required === true && u.status === "pending" && u.trial_ends_at === null && u.billing_method === "PIX", `${u.card_required} ${u.status} ${u.trial_ends_at}`);
    check("sem boas-vindas e sem nada no Asaas no cadastro", u.welcome_requested_at === null && u.asaas_customer_id === null && zapi.sentTo(a.zphone).length === 0);
    const body = await page.textContent("body");
    check("tela de assinatura: 'Cadastre seu cartão para liberar os 7 dias grátis'", body.includes("Cadastre seu cartão para liberar os 7 dias grátis"));
    check("tela de assinatura: uma tela só, com CPF, CEP e número (sem passo separado de CPF)", (await page.locator('[data-testid="assinatura-cpf"]').count()) === 0 && (await page.locator("#card-cpf").count()) === 1 && (await page.locator("#card-cep").count()) === 1 && (await page.locator("#card-number").count()) === 1 && (await page.locator("#card-complement").count()) === 0 && body.includes("Só CPF, CEP e número"));
    check("tela de assinatura: sem Pix e sem escolha de plano", !/\bpix\b/i.test(body) && (await page.locator('input[name="plan"]').count()) === 0, (body.match(/.{0,60}\bpix\b.{0,60}/i) || [""])[0]);
    await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "Lead"), null, { timeout: 10000 }).catch(() => {});
    const px = await page.evaluate(() => (window.__px || []).map((e) => e[1]));
    check("medição: cadastro sem cartão conta como Lead (não como cadastro concluído)", px.includes("Lead") && !px.includes("CompleteRegistration"), JSON.stringify(px));

    // sem cartão: app e boas-vindas fechados
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(`${BASE}/assinatura`, { timeout: 15000 });
    check("sem cartão: /dashboard leva para /assinatura", page.url() === `${BASE}/assinatura`);
    await page.goto(`${BASE}/bem-vindo`);
    await page.waitForURL(`${BASE}/assinatura`, { timeout: 15000 });
    check("sem cartão: /bem-vindo leva para /assinatura", page.url() === `${BASE}/assinatura`);
    const w = await whatsapp({ phone: a.phone, amount: 12.5, description: "café", categoryKey: "alimentacao" });
    check("sem cartão: WhatsApp não lança e explica como liberar (card_required)", w.status === 403 && w.json.reason === "card_required" && /cadastrar o cartão/.test(w.json.error ?? ""), JSON.stringify(w));

    // CEP preenche rua e bairro sozinho (campos escondidos, com "corrigir")
    await page.fill("#card-cep", "58310000");
    await page.waitForSelector('[data-testid="card-endereco"]', { timeout: 15000 });
    check("CEP: rua e bairro vêm sozinhos, sem campos para digitar", (await page.locator("#card-address").count()) === 0 && (await page.locator('[data-testid="card-endereco"]').innerText()).includes("Rua de Teste, Centro"));
    // CPF inválido: erro claro, continua na tela, campos mantidos
    await page.fill("#card-cpf", "111.111.111-11");
    await page.fill("#card-number", "12");
    await page.click('button:has-text("Continuar para os dados do cartão")');
    await page.waitForSelector("text=CPF inválido", { timeout: 10000 }).catch(() => {});
    u = await userOf(a.email);
    check("CPF inválido: erro na mesma tela, nada criado no Asaas, CEP e número mantidos", (await page.textContent("body")).includes("CPF inválido") && u.asaas_customer_id === null && (await page.inputValue("#card-cep")) === "58310000" && (await page.inputValue("#card-number")) === "12");
    const txt = await page.locator('[data-testid="cartao-obrigatorio-texto"]').innerText();
    check("texto do cartão: nada hoje, teste até hoje + 7, depois R$ 29,90 por mês, cancelar pelo suporte", txt.includes("Nada é cobrado hoje") && txt.includes(br(trialEnd)) && /R\$\s29,90/.test(txt) && txt.includes("cancelar antes"), txt);
    check("botão 'Cadastrar cartão e liberar o teste'", (await page.locator('button:has-text("Continuar para os dados do cartão")').count()) === 1 && (await page.textContent("body")).includes("Cadastre seu cartão de crédito"));

    // Checkout: mensal, 1ª cobrança no fim do teste
    const coId = await fillCard(page, randomCpf());
    const co = fake.state.checkouts.get(coId);
    u = await userOf(a.email);
    const subs = [...fake.state.subscriptions.values()].filter((s) => s.customer === u.asaas_customer_id && s.billingType === "PIX");
    check("CPF no mesmo envio: gravado, cliente criado no Asaas com o endereço, sem assinatura Pix", Boolean(u.cpf) && Boolean(u.asaas_customer_id) && subs.length === 0, JSON.stringify(subs));
    check("Checkout do cartão: recorrente mensal de R$ 29,90 com 1ª cobrança no fim do teste", co.subscription.cycle === "MONTHLY" && co.items[0].value === 29.9 && co.subscription.nextDueDate === `${trialEnd} 12:00:00`, JSON.stringify(co.subscription));
    check("ao abrir o Checkout o teste passa a contar de hoje", isoDate(u.trial_ends_at) === trialEnd && u.billing_method === "PIX", `${u.trial_ends_at} ${u.billing_method}`);

    // Concluiu o Checkout -> volta, cartão adotado, teste liberado
    const done = await (await fetch(`http://localhost:3998/__test/checkout/${coId}`, { method: "POST" })).json();
    await page.goto(`${BASE}/assinatura?cartao=ok`);
    await page.waitForURL(`${BASE}/bem-vindo?cartao=1`, { timeout: 20000 });
    check("voltou do Checkout: vai para a tela 'teste liberado'", page.url().endsWith("/bem-vindo?cartao=1"));
    const bv = await page.textContent("body");
    check("boas-vindas na tela: teste até o fim, cartão cadastrado, nada cobrado, assinatura depois", bv.includes("Seu teste grátis de 7 dias está liberado") && bv.includes(br(trialEnd)) && bv.includes("Seu cartão está cadastrado e nada foi cobrado") && bv.includes("cobrada automaticamente no cartão"));
    await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "CompleteRegistration"), null, { timeout: 10000 }).catch(() => {});
    const px2 = await page.evaluate(() => (window.__px || []).map((e) => e[1]));
    check("medição: cadastro concluído e início do teste contados com o cartão", px2.includes("CompleteRegistration") && px2.includes("StartTrial"), JSON.stringify(px2));
    u = await userOf(a.email);
    check("conta: cartão adotado (CREDIT_CARD, assinatura do Checkout), pendente em teste", u.billing_method === "CREDIT_CARD" && u.asaas_subscription_id === done.subscription.id && u.status === "pending" && isoDate(u.trial_ends_at) === trialEnd, `${u.billing_method} ${u.asaas_subscription_id} ${u.status}`);

    u = await waitWelcome(a.email);
    const msgs = zapi.sentTo(a.zphone);
    const wtxt = msgs[0]?.body.message ?? "";
    check("boas-vindas pelo WhatsApp saem só agora: texto + manual", u.welcome_sent_at !== null && msgs.length === 2 && msgs[1].kind === "send-document/pdf", JSON.stringify(msgs.map((m) => m.kind)) + " " + u.welcome_error);
    check("boas-vindas: data da 1ª cobrança no cartão e como cancelar", wtxt.includes(`no dia ${ddmm(trialEnd)} começa a assinatura mensal de R$ 29,90`) && wtxt.includes("Para cancelar antes, é só falar aqui") && !/\bpix\b|sem cart/i.test(wtxt), wtxt);

    // app e WhatsApp liberados
    await page.click('[data-testid="bem-vindo-app"]');
    await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
    check("com cartão: app liberado", page.url() === `${BASE}/dashboard`);
    // dentro do app a página recarrega uma vez sozinha para sair sem o script da Meta
    await page.waitForFunction(() => typeof window.fbq === "undefined", null, { timeout: 15000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    const w2 = await whatsapp({ phone: a.phone, amount: 12.5, description: "café", categoryKey: "alimentacao" });
    check("com cartão: lança pelo WhatsApp", w2.status === 201, JSON.stringify(w2));

    // tela de assinatura no teste: cartão cadastrado, sem Pix, sem plano anual para escolher
    await page.goto(`${BASE}/assinatura`);
    const as = await page.textContent("body");
    check("assinatura no teste: cartão cadastrado e data da 1ª cobrança, sem Pix", (await page.locator('[data-testid="assinatura-cartao-no-teste"]').count()) === 1 && as.includes(br(trialEnd)) && !/\bpix\b/i.test(as));

    // mensagens: no teste com cartão, dicas sim, avisos de fim de teste não
    const n0 = texts(a.zphone).length;
    await sql`update users set trial_ends_at = ${todaySP(6)} where email = ${a.email}`;
    let r = await processar();
    let t = texts(a.zphone).slice(n0);
    check("teste com cartão: dica do 2º dia sai (passo 3), sem falar em cobrança", r.status === 200 && t.some((m) => /Dica do \*Contay\* para o seu 2º dia/.test(m)) && !t.some((m) => /cobrad|vai até/.test(m)), JSON.stringify(t).slice(0, 400));
    const before = texts(a.zphone).length;
    await sql`update users set trial_ends_at = ${todaySP(1)} where email = ${a.email}`;
    await processar();
    await sql`update users set trial_ends_at = ${today} where email = ${a.email}`;
    await processar();
    check("teste com cartão: nenhum aviso na véspera nem no último dia", texts(a.zphone).length === before, JSON.stringify(texts(a.zphone).slice(before)));
    await sql`update users set trial_ends_at = ${trialEnd} where email = ${a.email}`;

    // fim do teste: 1ª cobrança confirmada -> conta ativa
    const pay = done.payment;
    const paid = { ...pay, status: "CONFIRMED", paymentDate: today, clientPaymentDate: today };
    const wh = await asaasWebhook("PAYMENT_CONFIRMED", paid);
    u = await userOf(a.email);
    check("1ª cobrança no cartão confirmada: conta ativa", wh.status === 200 && u.status === "active", `${wh.status} ${u.status}`);
    await a.ctx.close();
  }

  // =========================================================================
  // B. Não cadastrou o cartão: 1 lembrete só, 2 horas depois
  // =========================================================================
  {
    const b = await signup("Bruno Semcartao");
    await b.ctx.close();
    let r = await processar();
    check("logo depois do cadastro, nenhum lembrete", texts(b.zphone).length === 0, JSON.stringify(texts(b.zphone)));
    await sql`update users set created_at = now() - interval '3 hours' where email = ${b.email}`;
    r = await processar();
    let t = texts(b.zphone);
    check("2 horas depois: 1 lembrete para cadastrar o cartão, com link e SAIR", r.status === 200 && t.length === 1 && /cadastrar o cartão de crédito/.test(t[0]) && /\/assinatura/.test(t[0]) && /SAIR/.test(t[0]) && !/\bpix\b/i.test(t[0]), JSON.stringify(t));
    await sql`update users set created_at = now() - interval '40 days' where email = ${b.email}`;
    await processar();
    t = texts(b.zphone);
    check("depois do lembrete, nada mais (nem as ofertas a cada 15 dias)", t.length === 1, JSON.stringify(t));
    // áudio/foto pelo WhatsApp também explica como liberar (precisa do Gemini falso ligado no app)
    const m = await fetch(`${BASE}/api/whatsapp/midia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ phone: b.phone, kind: "audio", mediaUrl: "http://localhost:3995/audio.ogg", mimeType: "audio/ogg" }),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    check("sem cartão: áudio/foto pelo WhatsApp também explica como liberar", m.status === 503 || (m.status === 403 && m.json.reason === "card_required" && /cadastrar o cartão/.test(m.json.reply ?? "")), JSON.stringify(m));
    const u = await userOf(b.email);
    check("quem não cadastrou o cartão continua sem teste e sem Pix no Asaas", u.trial_ends_at === null && u.asaas_subscription_id === null && u.status === "pending");
  }
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
  await sql.end();
  await fake.close?.();
  await zapi.close?.();
}

console.log(failed ? "\nFALHOU" : "\nTUDO OK");
process.exit(failed ? 1 : 0);
