import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";
import { fillSignup, randomCpf } from "./helpers/signup.mjs";

// Ajustes de conversão de 11/10/2026, de ponta a ponta:
//  - origem do cadastro: os "utm_*" do anúncio seguem da página de vendas para
//    o cadastro e ficam gravados em users.signup_source (sem fbclid);
//  - tela de pagamento: atalho "Prefere pagar com Pix?" e o evento
//    "começou a pagar" (InitiateCheckout) só para quem aceitou os cookies.
// (O teste grátis de 7 dias tem suíte própria: e2e/teste-gratis.smoke.mjs. O nome
// deste arquivo ficou da 1ª versão, que tinha garantia de 7 dias no lugar do teste.)
// NUNCA fala com a Meta nem com o Asaas de verdade (mesmos falsos do pixel.smoke).
//
// Suba o app como no pixel.smoke.mjs, com o Checkout falso:
//   META_PIXEL_ID=123456789012345 ASAAS_API_KEY='$aact_hmlg_teste' \
//   ASAAS_BASE_URL=http://localhost:3998/v3 ASAAS_CHECKOUT_BASE_URL=http://localhost:3998/__checkout \
//   ASAAS_WEBHOOK_TOKEN=token-teste-webhook ZAPI_BASE_URL=http://localhost:3997 ZAPI_INSTANCE_ID=inst-teste \
//   ZAPI_INSTANCE_TOKEN=tok-teste ZAPI_CLIENT_TOKEN=client-teste npx next start -p 3100
// e rode: node e2e/conversao-origem-garantia.smoke.mjs

if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const fake = await startFakeAsaas(3998);
const zapi = await startFakeZapi();

const sandboxChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (extra ? ` (${extra})` : ""));
  if (!cond) failed = true;
}

// Meta falsa: anota os eventos na página (window.__px) e também aqui no teste
// (pxLog), para não perder o que sai logo antes de a página mudar.
const FAKE_FBEVENTS = `(function(){var f=window.fbq;window.__px=window.__px||[];if(!f)return;
f.callMethod=function(){var a=Array.prototype.slice.call(arguments);window.__px.push(a);try{window.__pxReport&&window.__pxReport(JSON.stringify(a))}catch(e){}};
var q=f.queue||[];while(q.length){f.callMethod.apply(f,q.shift())}})();`;

async function newVisitor() {
  const ctx = await browser.newContext();
  const net = { script: 0, other: 0 };
  const pxLog = [];
  await ctx.exposeFunction("__pxReport", (json) => pxLog.push(JSON.parse(json)));
  await ctx.route(/facebook\.(net|com)/, (route) => {
    const url = route.request().url();
    if (url.includes("connect.facebook.net") && url.endsWith("fbevents.js")) {
      net.script += 1;
      return route.fulfill({ contentType: "application/javascript", body: FAKE_FBEVENTS });
    }
    net.other += 1;
    return route.abort();
  });
  // o CEP do cartão consulta o ViaCEP: responde aqui, sem sair para a internet
  await ctx.route(/viacep\.com\.br/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ logradouro: "Rua de Teste", bairro: "Centro" }) })
  );
  const page = await ctx.newPage();
  return { ctx, page, net, pxLog };
}
const tracked = (log, name) => log.filter((e) => e[0] === "track" && e[1] === name);

/** Depois do cadastro (tela de teste liberado): vai assinar, informa o CPF e espera o Pix. */
async function goPay(page) {
  await page.waitForURL(`${BASE}/bem-vindo`, { timeout: 15000 });
  await page.goto(`${BASE}/assinatura`);
  const cpf = randomCpf();
  await page.fill("#pay-cpf", cpf);
  await page.click('[data-testid="cpf-form"] button[type="submit"]');
  await page.waitForSelector('img[alt="QR Code do Pix"]', { timeout: 15000 });
  return cpf;
}

const UTM = "utm_source=meta&utm_medium=cpc&utm_campaign=C1%20Vendas%20Cadastro&utm_content=VID%20REAL%201";
const STORED = "utm_source=meta&utm_medium=cpc&utm_campaign=C1+Vendas+Cadastro&utm_content=VID+REAL+1";

try {
  // ---------------------------------------------------------------- A. veio de um anúncio, aceitou os cookies, paga com Pix
  {
    const { ctx, page, net, pxLog } = await newVisitor();
    await page.goto(`${BASE}/?${UTM}&fbclid=IwAR0clique123`);
    const hrefs = await page.$$eval('a[href^="/registrar"]', (els) => els.map((a) => a.getAttribute("href")));
    check("página de vendas: todos os botões de cadastro levam a origem do anúncio", hrefs.length >= 6 && hrefs.every((h) => h === `/registrar?${STORED}`), JSON.stringify([...new Set(hrefs)]));
    check("página de vendas: o identificador de clique (fbclid) não é repassado", hrefs.every((h) => !h.includes("fbclid")));
    const landing = await page.textContent("body");
    check("página de vendas fala do teste grátis de 7 dias (topo, plano, dúvidas e chamada final)", (landing.match(/7 dias grátis|grátis por 7 dias|teste grátis de 7 dias/gi) || []).length >= 4, String((landing.match(/7 dias grátis|grátis por 7 dias|teste grátis de 7 dias/gi) || []).length));
    check("página de vendas sem rolagem lateral no celular (390 de largura)", await (async () => {
      await page.setViewportSize({ width: 390, height: 800 });
      const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      await page.setViewportSize({ width: 1280, height: 800 });
      return ok;
    })());

    await page.click('[data-testid="cookie-banner"] button:has-text("Aceitar")');
    await page.click('main a:has-text("Testar grátis por 7 dias")');
    await page.waitForURL(`${BASE}/registrar?${STORED}`, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('input[name="source"]')?.value.includes("utm_source=meta"), null, { timeout: 10000 });
    const reg = await page.textContent("body");
    check("cadastro: diz que não paga nada agora e não promete só Pix", reg.includes("não paga nada agora") && !reg.includes("aparece o Pix de"));
    check("cadastro: mostra 7 dias grátis, sem fidelidade e sem senha de banco", (await page.locator('[data-testid="registrar-garantias"] li').count()) === 3 && reg.includes("7 dias grátis"));

    const email = `origem.${Date.now()}@example.com`;
    const { phone } = await fillSignup(page, { name: "Cliente Origem", email, password: "SenhaForte123" });
    await page.click('button[type="submit"]');
    const cpf = await goPay(page);
    const [user] = await sql`select signup_source, status from users where email = ${email}`;
    check("origem gravada no cadastro, sem fbclid", user.signup_source === STORED, user.signup_source);

    const pay = await page.textContent("body");
    check("tela de pagamento mostra o aviso de teste grátis", (await page.locator('[data-testid="assinatura-teste"]').count()) === 1 && pay.includes("Teste grátis de 7 dias liberado"));
    const pixLink = await page.getAttribute('[data-testid="ir-para-pix"]', "href");
    check("tela de pagamento tem o atalho para o Pix, e ele aponta para o bloco do Pix", pixLink === "#pagar-pix" && (await page.locator("#pagar-pix img[alt='QR Code do Pix']").count()) === 1, pixLink);
    check("cartão continua em 1º (aberto) e o Pix em 2º", pay.indexOf("1ª opção: cartão de crédito") > -1 && pay.indexOf("1ª opção: cartão de crédito") < pay.indexOf("2ª opção: Pix") && (await page.locator("#card-cep").count()) === 1);
    await page.click('[data-testid="ir-para-pix"]');
    await page.waitForTimeout(400);
    check("atalho rola a tela até o Pix", await page.evaluate(() => { const r = document.getElementById("pagar-pix").getBoundingClientRect(); return r.top >= -5 && r.top < window.innerHeight; }));

    check("cadastro concluído foi contado 1 vez (na tela de boas-vindas)", tracked(pxLog, "CompleteRegistration").length === 1, String(tracked(pxLog, "CompleteRegistration").length));
    check("antes de clicar, 'começou a pagar' ainda não foi contado", tracked(pxLog, "InitiateCheckout").length === 0);
    await page.click('button:has-text("Copiar código Pix")');
    await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "InitiateCheckout"), null, { timeout: 10000 });
    await page.click('button:has-text("Código copiado"), button:has-text("Copiar código Pix")');
    await page.waitForTimeout(400);
    const ic = tracked(pxLog, "InitiateCheckout");
    check("copiar o Pix conta 'começou a pagar' 1 única vez, R$ 29,90 em BRL", ic.length === 1 && ic[0][2].value === 29.9 && ic[0][2].currency === "BRL" && ic[0][2].content_name === "pix", JSON.stringify(ic));
    const all = JSON.stringify(pxLog);
    check("nenhum evento leva e-mail, CPF, WhatsApp, nome ou a origem", !all.includes(email) && !all.includes(cpf) && !all.includes(phone) && !all.includes("Cliente Origem") && !all.includes("utm_"));
    check("nenhuma chamada direta à Meta além do script falso", net.other === 0, `${net.other}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- B. sem anúncio, sem escolher cookies, vai para o cartão
  {
    const { ctx, page, net, pxLog } = await newVisitor();
    await page.goto(`${BASE}/`);
    const hrefs = await page.$$eval('a[href^="/registrar"]', (els) => els.map((a) => a.getAttribute("href")));
    check("sem anúncio: botões levam para /registrar puro", hrefs.every((h) => h === "/registrar"), JSON.stringify([...new Set(hrefs)]));
    await page.goto(`${BASE}/registrar`);
    const email = `direto.${Date.now()}@example.com`;
    await fillSignup(page, { name: "Cliente Direto", email, password: "SenhaForte123" });
    await page.click('button[type="submit"]');
    await goPay(page);
    const [user] = await sql`select signup_source from users where email = ${email}`;
    check("sem anúncio: origem fica vazia (nula)", user.signup_source === null, String(user.signup_source));
    await page.click('button:has-text("Copiar código Pix")');
    await page.fill("#card-cep", "58000000");
    await page.fill("#card-address", "Rua de Teste");
    await page.fill("#card-number", "10");
    await page.fill("#card-province", "Centro");
    await page.click('button:has-text("Continuar para os dados do cartão")');
    await page.waitForURL(/__checkout\/checkoutSession\/show/, { timeout: 15000 });
    check("sem aceitar cookies: pagamento segue normal e NADA vai para a Meta", net.script === 0 && net.other === 0 && pxLog.length === 0, JSON.stringify({ net, n: pxLog.length }));
    await ctx.close();
  }

  // ---------------------------------------------------------------- C. aceitou os cookies e vai para o cartão
  {
    const { ctx, page, pxLog } = await newVisitor();
    await page.goto(`${BASE}/?utm_source=meta&utm_content=IMG01`);
    await page.click('[data-testid="cookie-banner"] button:has-text("Aceitar")');
    await page.click('main a:has-text("Testar grátis por 7 dias")');
    await page.waitForURL(/\/registrar\?utm_source=meta&utm_content=IMG01$/, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('input[name="source"]')?.value === "utm_source=meta&utm_content=IMG01", null, { timeout: 10000 });
    const email = `cartao.${Date.now()}@example.com`;
    await fillSignup(page, { name: "Cliente Cartao", email, password: "SenhaForte123" });
    await page.click('button[type="submit"]');
    await goPay(page);
    await page.fill("#card-cep", "58000000");
    await page.fill("#card-address", "Rua de Teste");
    await page.fill("#card-number", "10");
    await page.fill("#card-province", "Centro");
    await page.click('button:has-text("Continuar para os dados do cartão")');
    await page.waitForURL(/__checkout\/checkoutSession\/show/, { timeout: 15000 });
    const ic = tracked(pxLog, "InitiateCheckout");
    check("seguir para o cartão conta 'começou a pagar' 1 vez, como cartão", ic.length === 1 && ic[0][2].content_name === "cartao" && ic[0][2].value === 29.9, JSON.stringify(ic));
    const [user] = await sql`select signup_source from users where email = ${email}`;
    check("origem parcial gravada como veio", user.signup_source === "utm_source=meta&utm_content=IMG01", user.signup_source);
    await ctx.close();
  }

  // ---------------------------------------------------------------- D. alguém mexe no campo escondido: o cadastro não quebra
  for (const [label, value, expected] of [
    ["lixo sem utm", "qualquer=coisa&fbclid=abc&<script>alert(1)</script>", (v) => v === null],
    ["valores gigantes com acento", `utm_source=${"ç".repeat(3000)}&utm_campaign=${"ã".repeat(3000)}&utm_content=${"é".repeat(3000)}&utm_medium=${"õ".repeat(3000)}`, (v) => v === null || v.length <= 400],
    ["tentativa de injeção de SQL", "utm_source=meta'); drop table users;--", (v) => v === "utm_source=meta%27%29%3B+drop+table+users%3B--"],
  ]) {
    const { ctx, page } = await newVisitor();
    await page.goto(`${BASE}/registrar`);
    const email = `mexeu.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
    await fillSignup(page, { name: "Cliente Curioso", email, password: "SenhaForte123" });
    await page.evaluate((v) => {
      const el = document.querySelector('input[name="source"]');
      el.removeAttribute("readonly");
      // define direto no elemento, como faria quem edita o formulário pelo navegador
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    }, value);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/bem-vindo`, { timeout: 15000 });
    const [user] = await sql`select signup_source from users where email = ${email}`;
    check(`campo de origem adulterado (${label}): cadastro conclui e grava só valor limpo`, Boolean(user) && expected(user.signup_source), String(user?.signup_source).slice(0, 80));
    await ctx.close();
  }
  const [{ n }] = await sql`select count(*)::int as n from users`;
  check("tabela de usuários continua lá", n > 0, `${n}`);

  // ---------------------------------------------------------------- E. Termos
  {
    const { ctx, page } = await newVisitor();
    await page.goto(`${BASE}/termos`);
    const t = await page.textContent("body");
    check("Termos na versão 2026-10-11.1", t.includes("Versão: 2026-10-11.1"));
    check("Termos explicam a origem do cadastro e o evento de início do pagamento", t.includes("o nome da origem, da campanha e do anúncio") && t.includes("o início do pagamento"));
    await ctx.close();
  }
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
