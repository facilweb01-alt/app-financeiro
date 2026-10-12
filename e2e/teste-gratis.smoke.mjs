import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";
import { fillSignup, randomCpf } from "./helpers/signup.mjs";

// Teste grátis de 7 dias (11/10/2026), de ponta a ponta:
//  - cadastro sem CPF e sem pagamento libera o app na hora, por 7 dias;
//  - boas-vindas pelo WhatsApp com o manual e o aviso de teste liberado;
//  - avisos na véspera e no último dia, com o link de pagamento;
//  - fim do teste sem assinar: só a tela de pagamento abre (app e WhatsApp);
//  - assinar durante o teste (Pix ou cartão) não tira nenhum dia;
//  - CPF pedido só na tela de pagamento;
//  - cadastro antigo (sem teste) continua como antes.
// NUNCA fala com o Asaas, o Z-API nem a Meta de verdade.
//
// O app precisa subir com tudo falso e as automações sem janela de horário:
//   META_PIXEL_ID=123456789012345 ASAAS_API_KEY='$aact_hmlg_teste' \
//   ASAAS_BASE_URL=http://localhost:3998/v3 ASAAS_CHECKOUT_BASE_URL=http://localhost:3998/__checkout \
//   ASAAS_WEBHOOK_TOKEN=token-teste-webhook ZAPI_BASE_URL=http://localhost:3997 ZAPI_INSTANCE_ID=inst-teste \
//   ZAPI_INSTANCE_TOKEN=tok-teste ZAPI_CLIENT_TOKEN=client-teste AUTOMACOES_IGNORAR_HORARIO=1 \
//   AUTOMACOES_INTERVALO_MS=0 AUTOMACOES_DESDE=2026-09-15T00:00:00-03:00 npx next start -p 3100
// e rode: WHATSAPP_WEBHOOK_SECRET=<o do .env.local> node e2e/teste-gratis.smoke.mjs

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
const addMonth = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
};
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
const setTrialEnd = (email, iso) => sql`update users set trial_ends_at = ${iso} where email = ${email}`;

const FAKE_FBEVENTS = `(function(){var f=window.fbq;window.__px=window.__px||[];if(!f)return;
f.callMethod=function(){window.__px.push(Array.prototype.slice.call(arguments))};
var q=f.queue||[];while(q.length){f.callMethod.apply(f,q.shift())}})();`;

async function newVisitor() {
  const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  const net = { script: 0, other: 0 };
  await ctx.route(/facebook\.(net|com)/, (route) => {
    const url = route.request().url();
    if (url.includes("connect.facebook.net") && url.endsWith("fbevents.js")) {
      net.script += 1;
      return route.fulfill({ contentType: "application/javascript", body: FAKE_FBEVENTS });
    }
    net.other += 1;
    return route.abort();
  });
  await ctx.route(/viacep\.com\.br/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ logradouro: "Rua de Teste", bairro: "Centro" }) })
  );
  const page = await ctx.newPage();
  return { ctx, page, net };
}

/** Cadastro pela tela, como um visitante. Devolve a página já em /bem-vindo. */
async function signup(name, { acceptCookies = false, from = "/registrar" } = {}) {
  const v = await newVisitor();
  const email = `teste7.${Date.now()}.${Math.floor(Math.random() * 1e5)}@example.com`;
  if (acceptCookies) {
    await v.page.goto(`${BASE}/`);
    await v.page.click('[data-testid="cookie-banner"] button:has-text("Aceitar")');
  }
  await v.page.goto(`${BASE}${from}`);
  const { phone } = await fillSignup(v.page, { name, email, password: "SenhaForte123" });
  await v.page.click('button[type="submit"]');
  await v.page.waitForURL(`${BASE}/bem-vindo`, { timeout: 15000 });
  return { ...v, email, phone, zphone: `55${phone}` };
}

/** Espera as boas-vindas do cadastro terminarem de sair (texto + PDF), ou falharem. */
async function waitWelcome(email) {
  for (let i = 0; i < 60; i++) {
    const u = await userOf(email);
    const arrived = zapi.sentTo(`55${u.whatsapp_phone}`).length >= 2;
    if (u.welcome_error || (u.welcome_sent_at && arrived)) return u;
    await new Promise((r) => setTimeout(r, 150));
  }
  return userOf(email);
}
const isoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

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
  const today = todaySP();
  const trialEnd = todaySP(7);

  // =========================================================================
  // 0. Página de vendas e cadastro falam do teste grátis
  // =========================================================================
  {
    const { ctx, page } = await newVisitor();
    await page.goto(`${BASE}/`);
    const landing = await page.textContent("body");
    check("página de vendas: chamada de teste grátis de 7 dias, sem cartão", landing.includes("Testar grátis por 7 dias") && landing.includes("Sem cartão para testar") && landing.includes("Como funciona o teste grátis de 7 dias?"));
    check("página de vendas não promete mais garantia de devolução", !/[Gg]arantia de 7 dias/.test(landing));
    check("página de vendas: passo a passo sem CPF e sem pagamento para começar", landing.includes("Nome, e-mail, WhatsApp e senha") && landing.includes("Use 7 dias grátis"));
    const deps = page.locator('[data-testid="depoimento"]');
    check("página de vendas mostra os 2 depoimentos", (await deps.count()) === 2);
    const imgs = await page.$$eval('[data-testid="depoimento"] img', (els) => els.map((e) => ({ src: e.getAttribute("src"), alt: e.getAttribute("alt") })));
    const imgStatus = await Promise.all(imgs.map((i) => fetch(`${BASE}${i.src}`).then((r) => `${r.status} ${r.headers.get("content-type")}`)));
    check("as imagens dos depoimentos abrem sem login", imgStatus.every((s) => s.startsWith("200 image/webp")), imgStatus.join(" | "));
    check("depoimentos têm a mensagem transcrita para leitor de tela e não mostram telefone", imgs.every((i) => i.alt.length > 80) && !/\(?\b\d{2}\)?\s?9\d{4}-?\d{4}/.test(await page.locator("#depoimentos").innerText()));

    // "Escreva, fale ou fotografe" (carrossel 3D de áudio e foto)
    check("página de vendas: topo fala de texto, áudio e foto do cupom", landing.includes("por texto, áudio ou foto do cupom"));
    const ms = page.locator('[data-testid="media-showcase"]');
    await ms.scrollIntoViewIfNeeded();
    check("seção 'Escreva, fale ou fotografe' aparece com 3 abas e 3 cartões", (await page.locator("#audio-foto h2").innerText()).includes("Escreva, fale ou fotografe") && (await ms.locator('[role="tab"]').count()) === 3 && (await ms.locator(".ms-card").count()) === 3);
    // gira sozinho enquanto está na tela
    await page.waitForFunction(() => document.querySelector('[data-testid="media-showcase"]')?.getAttribute("data-mode") !== "texto", null, { timeout: 12000 });
    check("o carrossel 3D gira sozinho", true);
    await ms.locator('[role="tab"]:has-text("Fotografe")').click();
    await page.waitForTimeout(1200);
    const fotoOn = await ms.getAttribute("data-mode");
    const front = ms.locator(".ms-card.front");
    check("tocar em 'Fotografe' mostra o cupom lido e lançado", fotoOn === "foto" && (await front.innerText()).includes("Cupom lido e lançado") && (await front.innerText()).includes("R$ 87,40"));
    await ms.locator('[role="tab"]:has-text("Fale")').click();
    await page.waitForTimeout(6000);
    check("depois de tocar numa aba o giro automático para (fica em 'Fale')", (await ms.getAttribute("data-mode")) === "audio" && (await ms.locator('[role="tab"][aria-selected="true"]').innerText()).includes("Fale"));
    check("cartão do áudio mostra a fala transcrita e a categoria Saúde", (await front.innerText()).includes("gastei trinta reais na farmácia") && (await front.innerText()).includes("Saúde"));
    check("FAQ responde se pode mandar áudio ou foto", landing.includes("Posso mandar áudio ou foto do cupom?"));

    // demonstração animada do WhatsApp
    const demo = page.locator('[data-testid="chat-demo"]');
    await demo.scrollIntoViewIfNeeded();
    // ao entrar na tela ela recomeça do zero (fase < 4) e vai até o fim (fase 4)
    await page.waitForFunction(() => {
      const phase = document.querySelector('[data-testid="chat-demo"]')?.getAttribute("data-phase");
      if (phase !== "4") window.__demoPlayed = true;
      return window.__demoPlayed === true && phase === "4";
    }, null, { timeout: 15000, polling: 50 });
    check("demonstração do WhatsApp toca o 1º exemplo até o fim (mensagem, resposta e app)", (await demo.innerText()).includes("gastei 45 no mercado") && (await demo.innerText()).includes("Lançamento registrado") && (await demo.locator(".demo-app.on").count()) === 1);
    await demo.locator('button:has-text("Compra parcelada")').click();
    await page.waitForFunction(() => { const d = document.querySelector('[data-testid="chat-demo"]'); return d?.getAttribute("data-scenario") === "parcelado" && d?.getAttribute("data-phase") === "4"; }, null, { timeout: 15000 });
    const demoTxt = await demo.innerText();
    check("tocar em 'Compra parcelada' mostra a conversa e as parcelas no app", demoTxt.includes("400 no cartão azul em 4x") && demoTxt.includes("4x de R$ 100,00") && demoTxt.includes("parcela 2/4"));
    await page.waitForTimeout(5200);
    check("depois que a pessoa escolhe um exemplo, a demonstração não troca sozinha", (await demo.getAttribute("data-scenario")) === "parcelado");
    await demo.locator('button:has-text("Tirar dúvida")').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="chat-demo"]')?.getAttribute("data-phase") === "4", null, { timeout: 15000 });
    check("exemplo de dúvida responde e aponta o manual", (await demo.innerText()).includes("como cadastro um cartão?") && (await demo.innerText()).includes("contay.com.br/manual"));
    await page.setViewportSize({ width: 360, height: 780 });
    check("sem rolagem lateral no celular estreito (360)", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await ctx.close();

    // com "reduzir movimento": aparece parado e completo, e as abas continuam funcionando
    const calm = await browser.newContext({ reducedMotion: "reduce" });
    const cp = await calm.newPage();
    await cp.goto(`${BASE}/`);
    const cd = cp.locator('[data-testid="chat-demo"]');
    await cd.scrollIntoViewIfNeeded();
    await cp.waitForTimeout(1500);
    check("com 'reduzir movimento' a demonstração fica parada e completa", (await cd.getAttribute("data-phase")) === "4" && (await cd.getAttribute("data-scenario")) === "gasto");
    await cd.locator('button:has-text("Categoria nova")').click();
    await cp.waitForTimeout(300);
    check("com 'reduzir movimento' as abas trocam o exemplo na hora", (await cd.getAttribute("data-phase")) === "4" && (await cd.innerText()).includes("ração 80 categoria pet"));
    await calm.close();
  }

  // =========================================================================
  // A. Cadastro libera o teste na hora, sem CPF e sem cobrança
  // =========================================================================
  const a = await signup("Tania Teste", { acceptCookies: true });
  {
    const { page } = a;
    const regHtml = await (await browser.newPage()).goto(`${BASE}/registrar`).then(async (r) => (await r.text()));
    check("cadastro não pede CPF", regHtml.includes('name="cpf"') === false);
    check("caixa de aceite do cadastro traz a frase do WhatsApp e do SAIR", regHtml.includes("Aceito receber mensagens do Contay no WhatsApp que informei") && regHtml.includes("respondendo SAIR"));
    const welcome = await page.textContent("body");
    check("depois do cadastro abre a tela 'teste grátis liberado' com o prazo", welcome.includes("Seu teste grátis de 7 dias está liberado") && (await page.locator('[data-testid="bem-vindo-prazo"]').innerText()).includes(br(trialEnd)), br(trialEnd));
    const wa = await page.getAttribute('[data-testid="bem-vindo-whatsapp"]', "href");
    check("botão abre o WhatsApp do Contay com um 'oi' (não cria gasto de exemplo)", wa.startsWith("https://wa.me/5583981995301?text=") && decodeURIComponent(wa).includes("Acabei de me cadastrar") && !/gastei/.test(decodeURIComponent(wa)), wa);
    await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "CompleteRegistration"), null, { timeout: 10000 });
    const px = await page.evaluate(() => JSON.stringify(window.__px || []));
    check("cadastro concluído é contado na tela de boas-vindas, sem dado da pessoa", !px.includes(a.email) && !px.includes(a.phone) && !px.includes("Tania"));

    let u = await userOf(a.email);
    check("conta nasce em teste: pendente, com cobrança ligada e teste até hoje + 7 dias", u.status === "pending" && u.billing_enabled === true && isoDate(u.trial_ends_at) === trialEnd, `${u.status} ${u.trial_ends_at}`);
    check("sem CPF e sem nada criado no Asaas no cadastro", u.cpf === null && u.asaas_customer_id === null && u.asaas_subscription_id === null && fake.state.customers.size === 0, `${u.cpf} ${fake.state.customers.size}`);

    u = await waitWelcome(a.email);
    const msgs = zapi.sentTo(a.zphone);
    check("boas-vindas pelo WhatsApp: 1 texto + o manual em PDF", u.welcome_sent_at !== null && msgs.length === 2 && msgs[0].kind === "send-text" && msgs[1].kind === "send-document/pdf", JSON.stringify(msgs.map((m) => m.kind)) + " " + u.welcome_error);
    const wtxt = msgs[0]?.body.message ?? "";
    check("boas-vindas avisam que o teste de 7 dias está liberado e até quando", /^Olá, Tania!/.test(wtxt) && /teste grátis de 7 dias está liberado/.test(wtxt) && wtxt.includes(`${trialEnd.slice(8, 10)}/${trialEnd.slice(5, 7)}`) && /Manual do Contay/.test(wtxt), wtxt.slice(0, 300));

    // usa o app sem ter pago
    await page.click('[data-testid="bem-vindo-app"]');
    await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
    // dentro do app a página recarrega uma vez sozinha para sair sem o script da Meta
    await page.waitForFunction(() => typeof window.fbq === "undefined", null, { timeout: 15000 });
    await page.waitForSelector('[data-testid="trial-banner"]', { timeout: 10000 });
    check("dentro do app, mesmo em teste, não existe script da Meta", !(await page.content()).includes("fbevents"));
    const banner = await page.locator('[data-testid="trial-banner"]').innerText();
    check("app abre sem pagamento, com o aviso de teste (faltam 7 dias)", banner.includes("faltam 7 dias") && banner.includes(br(trialEnd)) && banner.includes("Assinar o Contay"), banner);
    for (const path of ["/lancamentos", "/cartoes", "/contas-fixas", "/fechamento"]) {
      await page.goto(`${BASE}${path}`);
      check(`em teste abre ${path}`, new URL(page.url()).pathname === path, page.url());
    }
    const w = await whatsapp({ phone: a.zphone, description: "Mercado", amount: 45, categoryKey: "alimentacao" });
    check("em teste, lançamento pelo WhatsApp funciona", w.status === 201, JSON.stringify(w.json));
    await page.goto(`${BASE}/lancamentos`);
    check("o lançamento do WhatsApp aparece no app", (await page.textContent("body")).includes("Mercado"));

    // nenhuma mensagem automática nos primeiros dias (nem a de "pagamento não concluído")
    await sql`update users set created_at = now() - interval '3 hours' where email = ${a.email}`;
    await processar();
    check("3 horas depois do cadastro: nenhuma mensagem de cobrança", zapi.sentTo(a.zphone).length === 2, texts(a.zphone).join(" || "));
  }

  // =========================================================================
  // B. Tela de assinatura durante o teste: CPF só aqui; Pix vence no fim do teste
  // =========================================================================
  {
    const { page } = a;
    await page.goto(`${BASE}/assinatura`);
    let t = await page.textContent("body");
    check("assinatura no teste: título com o prazo e aviso de que não precisa pagar agora", t.includes(`Seu teste grátis vai até ${br(trialEnd)}`) && (await page.locator('[data-testid="assinatura-teste"]').innerText()).includes("Você não precisa pagar agora"));
    check("assinatura no teste: dá para voltar ao app", (await page.locator('a:has-text("Voltar ao app")').count()) === 1);
    check("antes do CPF não mostra cartão nem Pix e nada é criado no Asaas", (await page.locator('[data-testid="assinatura-cpf"]').count()) === 1 && (await page.locator("#card-cep").count()) === 0 && (await page.locator('img[alt="QR Code do Pix"]').count()) === 0 && fake.state.customers.size === 0);
    await page.fill("#pay-cpf", "123.456.789-00");
    await page.click('[data-testid="cpf-form"] button[type="submit"]');
    await page.waitForSelector("text=CPF inválido", { timeout: 10000 });
    check("CPF inválido é recusado na tela de pagamento", (await userOf(a.email)).cpf === null);
    const cpf = randomCpf();
    await page.fill("#pay-cpf", cpf);
    await page.click('[data-testid="cpf-form"] button[type="submit"]');
    await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    const u = await userOf(a.email);
    check("CPF gravado só com dígitos; cliente e assinatura criados no Asaas", u.cpf === cpf && Boolean(u.asaas_customer_id && u.asaas_subscription_id));
    const sub = fake.state.subscriptions.get(u.asaas_subscription_id);
    check("1ª cobrança Pix vence no último dia do teste (não hoje)", sub.nextDueDate === trialEnd && sub.value === 29.9 && sub.billingType === "PIX", sub.nextDueDate);
    t = await page.textContent("body");
    check("explica que pagar agora não tira dias do teste", (await page.locator('[data-testid="pix-no-teste"]').innerText()).includes(br(trialEnd)) && t.includes("nada é cobrado hoje"));
    check("continua em teste e usando o app depois de abrir a cobrança", u.status === "pending");
    await page.goto(`${BASE}/dashboard`);
    check("o app continua abrindo com a cobrança em aberto", new URL(page.url()).pathname === "/dashboard");
    // alguém tenta trocar o CPF depois: não muda
    await page.goto(`${BASE}/assinatura`);
    check("depois de informado, o CPF não é pedido de novo", (await page.locator('[data-testid="assinatura-cpf"]').count()) === 0);
  }

  // =========================================================================
  // C. Avisos na véspera e no último dia, com o link de pagamento
  // =========================================================================
  {
    const before = zapi.sentTo(a.zphone).length;
    await setTrialEnd(a.email, todaySP(3));
    await processar();
    check("faltando 3 dias: nenhuma mensagem", zapi.sentTo(a.zphone).length === before);

    await setTrialEnd(a.email, todaySP(1));
    let r = await processar();
    let msgs = texts(a.zphone);
    const eve = msgs[msgs.length - 1] ?? "";
    check("véspera: 1 mensagem dizendo que o teste termina amanhã", zapi.sentTo(a.zphone).length === before + 1 && /termina \*amanhã\*/.test(eve), `${r.status} ${eve.slice(0, 200)}`);
    check("véspera: chama pelo nome, traz o link de pagamento, o preço e o SAIR", /^Oi, Tania!/.test(eve) && eve.includes("/assinatura") && /R\$ 29,90/.test(eve) && /SAIR/.test(eve));
    check("véspera: como já lançou algo, diz que os lançamentos continuam guardados", /continuam guardados/.test(eve));
    await processar();
    await processar();
    check("rodar de novo não repete a mensagem da véspera", zapi.sentTo(a.zphone).length === before + 1);

    await setTrialEnd(a.email, today);
    await processar();
    msgs = texts(a.zphone);
    const last = msgs[msgs.length - 1] ?? "";
    check("último dia: 1 mensagem dizendo que termina hoje, com o link de pagamento", zapi.sentTo(a.zphone).length === before + 2 && /termina \*hoje\*/.test(last) && last.includes("/assinatura") && /acesso fica pausado/.test(last), last.slice(0, 200));
    await processar();
    check("rodar de novo não repete a mensagem do último dia", zapi.sentTo(a.zphone).length === before + 2);
    const rows = await sql`select kind, step, sent_at is not null as sent from automation_messages where user_id = ${(await userOf(a.email)).id} order by step`;
    check("envios registrados: teste passo 1 e passo 2, nenhum 'não pagou'", JSON.stringify(rows.map((x) => `${x.kind}:${x.step}:${x.sent}`)) === JSON.stringify(["teste:1:true", "teste:2:true"]), JSON.stringify(rows));
    await a.page.goto(`${BASE}/dashboard`);
    const banner = await a.page.locator('[data-testid="trial-banner"]').innerText();
    check("no último dia o app ainda abre e o aviso diz 'termina hoje'", banner.includes("termina hoje"), banner);
  }

  // =========================================================================
  // D. Teste terminou sem assinar: só a tela de pagamento
  // =========================================================================
  {
    const { page } = a;
    await setTrialEnd(a.email, todaySP(-1));
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(`${BASE}/assinatura`, { timeout: 10000 });
    const t = await page.textContent("body");
    check("teste encerrado: /dashboard leva para a tela de pagamento", t.includes("Seu teste grátis terminou") && t.includes("estão guardados"));
    check("teste encerrado: não oferece voltar ao app e mostra cartão e Pix", (await page.locator('a:has-text("Voltar ao app")').count()) === 0 && (await page.locator("#card-cep").count()) === 1 && (await page.locator('img[alt="QR Code do Pix"]').count()) === 1);
    for (const path of ["/lancamentos", "/cartoes", "/fechamento", "/bem-vindo"]) {
      await page.goto(`${BASE}${path}`);
      check(`teste encerrado: ${path} não abre`, new URL(page.url()).pathname === "/assinatura", page.url());
    }
    const w = await whatsapp({ phone: a.zphone, description: "Padaria", amount: 12 });
    check("teste encerrado: WhatsApp não lança e explica como voltar", w.status === 403 && w.json.reason === "trial_ended" && /assinatura/.test(w.json.error), JSON.stringify(w.json));
    const n = (await sql`select count(*)::int as n from transactions where user_id = ${(await userOf(a.email)).id}`)[0].n;
    check("nenhum lançamento novo foi gravado depois do fim do teste; o antigo continua lá", n === 1, `${n}`);
    const before = zapi.sentTo(a.zphone).length;
    await processar();
    check("no dia seguinte ao fim do teste não sai mensagem (oferta só 15 dias depois)", zapi.sentTo(a.zphone).length === before);

    // paga o Pix: volta na hora, sem segundas boas-vindas
    const u = await userOf(a.email);
    const [pay] = fake.paymentsOf(u.asaas_subscription_id);
    await page.goto(`${BASE}/assinatura`);
    await fetch(`http://localhost:3998/__test/pay/${pay.id}`, { method: "POST" });
    const res = await asaasWebhook("PAYMENT_RECEIVED", fake.state.payments.get(pay.id));
    check("webhook do pagamento aceito", res.status === 200, `${res.status}`);
    await page.waitForURL(`${BASE}/dashboard`, { timeout: 30000 });
    const paid = await userOf(a.email);
    check("pagou depois do teste: conta ativa e app liberado", paid.status === "active" && paid.approved_at !== null);
    check("assinante não vê mais o aviso de teste", (await page.locator('[data-testid="trial-banner"]').count()) === 0);
    await new Promise((r) => setTimeout(r, 1500));
    await processar();
    check("quem já recebeu as boas-vindas no teste não recebe de novo ao pagar", zapi.sentTo(a.zphone).length === before, texts(a.zphone).slice(before).join(" || "));
    const w2 = await whatsapp({ phone: a.zphone, description: "Padaria", amount: 12 });
    check("depois de pagar, o WhatsApp volta a lançar", w2.status === 201, JSON.stringify(w2.json));
  }

  // =========================================================================
  // E. Assinar com Pix durante o teste: não perde nenhum dia
  // =========================================================================
  {
    const b = await signup("Bruno Antecipado");
    await waitWelcome(b.email);
    await b.page.goto(`${BASE}/assinatura`);
    await b.page.fill("#pay-cpf", randomCpf());
    await b.page.click('[data-testid="cpf-form"] button[type="submit"]');
    await b.page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
    let u = await userOf(b.email);
    const [pay] = fake.paymentsOf(u.asaas_subscription_id);
    check("[Pix no teste] cobrança vence no fim do teste", pay.dueDate === trialEnd, pay.dueDate);
    await fetch(`http://localhost:3998/__test/pay/${pay.id}`, { method: "POST" });
    await asaasWebhook("PAYMENT_RECEIVED", fake.state.payments.get(pay.id));
    await b.page.waitForURL(`${BASE}/dashboard`, { timeout: 30000 });
    u = await userOf(b.email);
    check("[Pix no teste] pagou no 1º dia: ativo, e o próximo vencimento é um mês depois do FIM do teste", u.status === "active" && isoDate(u.subscription_due_date) === addMonth(trialEnd), `${u.status} ${u.subscription_due_date} esperado ${addMonth(trialEnd)}`);
    const before = zapi.sentTo(b.zphone).length;
    await sql`update users set trial_ends_at = ${todaySP(1)} where email = ${b.email}`;
    await processar();
    check("[Pix no teste] quem já pagou não recebe aviso de fim de teste", zapi.sentTo(b.zphone).length === before);
    await b.ctx.close();
  }

  // =========================================================================
  // F. Cadastrar o cartão durante o teste: 1ª cobrança só no fim
  // =========================================================================
  {
    const c = await signup("Carla Cartao");
    await waitWelcome(c.email);
    await c.page.goto(`${BASE}/assinatura`);
    await c.page.fill("#pay-cpf", randomCpf());
    await c.page.click('[data-testid="cpf-form"] button[type="submit"]');
    await c.page.waitForSelector("#card-cep", { timeout: 15000 });
    check("[cartão no teste] texto diz que nada é cobrado hoje e informa o dia da 1ª cobrança", (await c.page.textContent("body")).includes(`só é cobrada em ${br(trialEnd)}`));
    const coId = await fillCard(c.page);
    let u = await userOf(c.email);
    const co = fake.checkoutsOf(u.asaas_customer_id).find((x) => x.id === coId);
    check("[cartão no teste] checkout com a 1ª cobrança no último dia do teste", co?.subscription?.nextDueDate?.startsWith(trialEnd), co?.subscription?.nextDueDate);
    const done = await (await fetch(`http://localhost:3998/__test/checkout/${coId}`, { method: "POST" })).json();
    check("[cartão no teste] nada é cobrado na hora (cobrança fica pendente)", done.payment.status === "PENDING" && done.payment.dueDate === trialEnd, JSON.stringify(done.payment));
    await c.page.goto(`${BASE}/assinatura?cartao=ok`);
    await c.page.waitForSelector('[data-testid="assinatura-cartao-no-teste"]', { timeout: 15000 });
    u = await userOf(c.email);
    check("[cartão no teste] cartão adotado, conta segue em teste (ainda não pagou)", u.billing_method === "CREDIT_CARD" && u.status === "pending" && u.asaas_subscription_id === done.subscription.id, `${u.billing_method} ${u.status}`);
    check("[cartão no teste] tela diz que nada foi cobrado e quando será", (await c.page.locator('[data-testid="assinatura-cartao-no-teste"]').innerText()).includes(br(trialEnd)));
    await c.page.goto(`${BASE}/dashboard`);
    const banner = await c.page.locator('[data-testid="trial-banner"]').innerText();
    check("[cartão no teste] app aberto; aviso fala da cobrança no cartão e não pede para assinar", new URL(c.page.url()).pathname === "/dashboard" && banner.includes("Cartão cadastrado") && !banner.includes("Assinar o Contay"), banner);

    // véspera: aviso de cobrança (não de "assine")
    const before = zapi.sentTo(c.zphone).length;
    await setTrialEnd(c.email, todaySP(1));
    await processar();
    const eve = texts(c.zphone).pop() ?? "";
    check("[cartão no teste] véspera: avisa que a mensalidade será cobrada no cartão amanhã", zapi.sentTo(c.zphone).length === before + 1 && /será cobrada nele amanhã/.test(eve) && !/é só assinar/.test(eve), eve.slice(0, 220));

    // a cobrança demora: tolerância de 3 dias com o cartão cadastrado
    await setTrialEnd(c.email, todaySP(-2));
    await c.page.goto(`${BASE}/dashboard`);
    check("[cartão no teste] 2 dias depois do fim, com a cobrança ainda sem confirmar: app continua aberto", new URL(c.page.url()).pathname === "/dashboard", c.page.url());
    await setTrialEnd(c.email, todaySP(-4));
    await c.page.goto(`${BASE}/dashboard`);
    await c.page.waitForURL(`${BASE}/assinatura`, { timeout: 10000 });
    check("[cartão no teste] 4 dias depois sem cobrança confirmada: acesso pausado", true);

    // a operadora confirma a cobrança: conta ativa
    const cardPay = fake.state.payments.get(done.payment.id);
    cardPay.status = "CONFIRMED";
    cardPay.paymentDate = cardPay.clientPaymentDate = today;
    await asaasWebhook("PAYMENT_CONFIRMED", cardPay);
    await c.page.goto(`${BASE}/dashboard`);
    u = await userOf(c.email);
    check("[cartão no teste] cobrança confirmada: conta ativa e app liberado", u.status === "active" && new URL(c.page.url()).pathname === "/dashboard", `${u.status} ${c.page.url()}`);
    await c.ctx.close();
  }

  // =========================================================================
  // G. Casos de borda
  // =========================================================================
  {
    // mesmo WhatsApp não ganha um segundo teste
    const v = await newVisitor();
    await v.page.goto(`${BASE}/registrar`);
    await fillSignup(v.page, { name: "Tania De Novo", email: `teste7.dup.${Date.now()}@example.com`, password: "SenhaForte123", phone: a.phone });
    await v.page.click('button[type="submit"]');
    await v.page.waitForSelector("text=Esse WhatsApp já está vinculado a outra conta", { timeout: 10000 });
    check("o mesmo WhatsApp não consegue abrir um segundo teste", true);
    await v.ctx.close();

    // termos desatualizados durante o teste: aceita e segue (sem laço de redirecionamento)
    const d = await signup("Dora Termos");
    await sql`update users set terms_version = '2020-01-01' where email = ${d.email}`;
    await d.page.goto(`${BASE}/dashboard`);
    await d.page.waitForURL(`${BASE}/aceitar-termos`, { timeout: 10000 });
    await d.page.check('input[name="terms"]');
    await d.page.click('button[type="submit"]');
    await d.page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
    check("em teste com termos antigos: aceita os novos e volta para o app", true);

    // conta suspensa pelo admin durante o teste não entra
    await sql`update users set status = 'suspended' where email = ${d.email}`;
    await d.page.goto(`${BASE}/dashboard`);
    await d.page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
    const ws = await whatsapp({ phone: d.zphone, description: "Teste", amount: 5 });
    check("conta suspensa durante o teste: nem app nem WhatsApp", ws.status === 403 && ws.json.reason === undefined, JSON.stringify(ws.json));
    await d.ctx.close();

    // assinatura cancelada pelo admin durante o teste: acesso encerrado, sem avisos
    const e = await signup("Enzo Cancelado");
    await waitWelcome(e.email);
    await sql`update users set billing_canceled_at = now(), trial_ends_at = ${todaySP(1)} where email = ${e.email}`;
    await e.page.goto(`${BASE}/dashboard`);
    await e.page.waitForURL(`${BASE}/assinatura`, { timeout: 10000 });
    const before = zapi.sentTo(e.zphone).length;
    await processar();
    check("cancelada durante o teste: acesso encerrado e nenhum aviso de fim de teste", (await e.page.textContent("body")).includes("Assinatura cancelada") && zapi.sentTo(e.zphone).length === before);
    await e.ctx.close();

    // respondeu SAIR: não recebe os avisos
    const s = await signup("Sara Sair");
    await waitWelcome(s.email);
    const out = await whatsapp({ phone: s.zphone, optOut: true });
    await setTrialEnd(s.email, todaySP(1));
    const beforeS = zapi.sentTo(s.zphone).length;
    await processar();
    check("quem respondeu SAIR não recebe aviso de fim de teste", out.status === 200 && zapi.sentTo(s.zphone).length === beforeS, JSON.stringify(out.json));
    await s.ctx.close();

    // Z-API fora do ar no aviso: registra o erro e tenta de novo depois de 6 horas
    const f = await signup("Fabio Falha");
    await waitWelcome(f.email);
    await setTrialEnd(f.email, todaySP(1));
    const beforeF = zapi.sentTo(f.zphone).length;
    zapi.setFail(true);
    await processar();
    zapi.setFail(false);
    const fid = (await userOf(f.email)).id;
    let [row] = await sql`select attempts, sent_at, error from automation_messages where user_id = ${fid} and kind = 'teste' and step = 1`;
    check("falha no envio do aviso fica registrada, sem marcar como enviado", row?.attempts === 1 && row.sent_at === null && Boolean(row.error), JSON.stringify(row));
    await processar();
    check("logo depois da falha não tenta de novo", zapi.sentTo(f.zphone).length === beforeF);
    await sql`update automation_messages set last_attempt_at = now() - interval '7 hours' where user_id = ${fid}`;
    await processar();
    [row] = await sql`select attempts, sent_at, error from automation_messages where user_id = ${fid} and kind = 'teste' and step = 1`;
    check("6 horas depois tenta de novo e envia", zapi.sentTo(f.zphone).length === beforeF + 1 && row.attempts === 2 && row.sent_at !== null, JSON.stringify(row));
    await f.ctx.close();

    // cadastro antigo (sem data de teste) continua indo para a tela de pagamento
    const o = await signup("Olga Antiga");
    await waitWelcome(o.email);
    await sql`update users set trial_ends_at = null where email = ${o.email}`;
    await o.page.goto(`${BASE}/dashboard`);
    await o.page.waitForURL(`${BASE}/assinatura`, { timeout: 10000 });
    const ot = await o.page.textContent("body");
    check("cadastro sem teste (antigo): sem acesso até pagar, tela de pagamento de sempre", ot.includes("Falta só o pagamento para liberar seu acesso") && !ot.includes("teste grátis"));
    await o.page.goto(`${BASE}/bem-vindo`);
    check("cadastro sem teste não vê a tela de 'teste liberado'", new URL(o.page.url()).pathname === "/assinatura", o.page.url());
    await o.ctx.close();
  }

  // Termos
  {
    const { ctx, page } = await newVisitor();
    await page.goto(`${BASE}/termos`);
    const t = await page.textContent("body");
    check("Termos explicam o teste grátis, os avisos e o CPF só no pagamento", t.includes("Teste grátis de 7 dias") && t.includes("nada é cobrado se você não assinar") && t.includes("dois avisos de fim do teste grátis") && t.includes("o CPF é pedido só quando você vai assinar"));
    check("Termos não prometem mais garantia de devolução", !t.includes("Garantia de 7 dias"));
    await ctx.close();
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
