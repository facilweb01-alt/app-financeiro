import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";
import { fillSignup } from "./helpers/signup.mjs";

// Medição de anúncios (pixel da Meta) + aviso de cookies, de ponta a ponta.
// NUNCA fala com a Meta de verdade: o script dela é trocado por um falso
// que só anota os eventos em window.__px, e qualquer outra chamada para
// facebook.com / facebook.net é bloqueada e contada.
//
// O app precisa subir com o pixel de teste e o Asaas/Z-API falsos:
//   META_PIXEL_ID=123456789012345 ASAAS_API_KEY='$aact_hmlg_teste' \
//   ASAAS_BASE_URL=http://localhost:3998/v3 ASAAS_WEBHOOK_TOKEN=token-teste-webhook \
//   ZAPI_BASE_URL=http://localhost:3997 ZAPI_INSTANCE_ID=inst-teste \
//   ZAPI_INSTANCE_TOKEN=tok-teste ZAPI_CLIENT_TOKEN=client-teste npx next start -p 3100
// e este teste roda com: node e2e/pixel.smoke.mjs

if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || "token-teste-webhook";
const PIXEL = process.env.META_PIXEL_ID || "123456789012345";
const fake = await startFakeAsaas(3998);
const zapi = await startFakeZapi();

const sandboxChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (extra ? ` (${extra})` : ""));
  if (!cond) failed = true;
}

const FAKE_FBEVENTS = `(function(){var f=window.fbq;window.__px=window.__px||[];if(!f)return;
f.callMethod=function(){window.__px.push(Array.prototype.slice.call(arguments))};
var q=f.queue||[];while(q.length){f.callMethod.apply(f,q.shift())}})();`;

// Contexto novo (= navegador sem escolha de cookies) com a Meta falsa.
async function newVisitor() {
  const ctx = await browser.newContext();
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
  const page = await ctx.newPage();
  return { ctx, page, net };
}
const events = (page) => page.evaluate(() => (window.__px || []).map((e) => e.slice(0, 3)));
const names = (list) => list.filter((e) => e[0] === "track").map((e) => e[1]);
const hasFbq = (page) => page.evaluate(() => typeof window.fbq !== "undefined");

try {
  // 1. Sem escolher nada: aviso aparece e NADA da Meta é carregado.
  {
    const { ctx, page, net } = await newVisitor();
    await page.goto(`${BASE}/`);
    await page.waitForSelector('[data-testid="cookie-banner"]', { timeout: 10000 });
    await page.waitForTimeout(600);
    check("visitante novo vê o aviso de cookies", true);
    check("antes da escolha, nenhum script da Meta é baixado", net.script === 0 && net.other === 0 && !(await hasFbq(page)), JSON.stringify(net));
    const html = await page.content();
    check("o código da página não traz o script da Meta", !html.includes("fbevents.js"));

    // 2. Recusar: aviso some, nada é carregado, e a escolha é lembrada.
    await page.click('[data-testid="cookie-banner"] button:has-text("Recusar")');
    await page.waitForSelector('[data-testid="cookie-banner"]', { state: "detached", timeout: 5000 });
    await page.reload();
    await page.waitForTimeout(800);
    check("recusou: aviso não volta e nada da Meta é carregado", (await page.$('[data-testid="cookie-banner"]')) === null && net.script === 0 && !(await hasFbq(page)), JSON.stringify(net));
    await page.goto(`${BASE}/registrar`);
    await page.waitForTimeout(600);
    check("recusou: cadastro também fica sem a Meta", net.script === 0 && !(await hasFbq(page)));

    // 3. Mudar de ideia pelo link "Cookies" do rodapé.
    await page.goto(`${BASE}/`);
    await page.click('[data-testid="cookie-prefs"]');
    await page.waitForSelector('[data-testid="cookie-banner"]', { timeout: 5000 });
    check("link Cookies do rodapé reabre o aviso", true);
    await ctx.close();
  }

  // 4. Aceitar: carrega e conta a visita.
  const { ctx, page, net } = await newVisitor();
  await page.goto(`${BASE}/`);
  await page.click('[data-testid="cookie-banner"] button:has-text("Aceitar")');
  await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "ViewContent"), null, { timeout: 10000 });
  let ev = await events(page);
  check("aceitou: script baixado 1 vez", net.script === 1, `${net.script}`);
  check("pixel iniciado com o ID certo e eventos automáticos desligados", ev.some((e) => e[0] === "init" && e[1] === PIXEL) && ev.some((e) => e[0] === "set" && e[1] === "autoConfig" && e[2] === false) && (await page.evaluate(() => window.fbq.disablePushState === true)), JSON.stringify(ev));
  check("página de vendas conta visita e conteúdo visto", JSON.stringify(names(ev)) === JSON.stringify(["PageView", "ViewContent"]), JSON.stringify(names(ev)));

  // 5. Clica no botão da página -> cadastro conta nova visita (sem duplicar).
  await page.click('main a:has-text("Quero esse app")');
  await page.waitForURL(`${BASE}/registrar`, { timeout: 10000 });
  await page.waitForFunction(() => (window.__px || []).filter((e) => e[1] === "PageView").length === 2, null, { timeout: 10000 });
  check("cadastro conta 1 visita e não mostra o aviso de novo", (await page.$('[data-testid="cookie-banner"]')) === null);

  // 6. Cadastro concluído -> evento sai 1 vez, sem nenhum dado da pessoa.
  const email = `pixel.${Date.now()}@example.com`;
  const { phone, cpf } = await fillSignup(page, { name: "Cliente Pixel", email, password: "SenhaForte123" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/assinatura`, { timeout: 15000 });
  await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "CompleteRegistration"), null, { timeout: 10000 });
  const all = await page.evaluate(() => JSON.stringify(window.__px || []));
  check("cadastro concluído é contado", true);
  check("nenhum evento leva e-mail, CPF, WhatsApp ou nome", !all.includes(email) && !all.includes(cpf) && !all.includes(phone) && !all.includes("Cliente Pixel"));
  check("cookie de sinal do cadastro foi apagado", !(await ctx.cookies()).some((c) => c.name === "contay_reg"));
  await page.reload();
  await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "PageView"), null, { timeout: 10000 });
  await page.waitForTimeout(500);
  check("recarregar não conta o cadastro de novo", !names(await events(page)).includes("CompleteRegistration") && !names(await events(page)).includes("Purchase"), JSON.stringify(names(await events(page))));

  // 7. Pix pago -> assinatura contada 1 vez com o valor do plano.
  const [user] = await sql`select id, asaas_subscription_id from users where email = ${email}`;
  const [firstPayment] = fake.paymentsOf(user.asaas_subscription_id);
  await fetch(`http://localhost:3998/__test/pay/${firstPayment.id}`, { method: "POST" });
  const res = await fetch(`${BASE}/api/asaas/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": WEBHOOK_TOKEN },
    body: JSON.stringify({ id: `evt_px_${Date.now()}`, event: "PAYMENT_RECEIVED", payment: fake.state.payments.get(firstPayment.id) }),
  });
  check("webhook aceito", res.status === 200, `${res.status}`);
  await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "Purchase"), null, { timeout: 20000 });
  ev = await events(page);
  const purchase = ev.filter((e) => e[1] === "Purchase");
  check("assinatura paga contada 1 vez, R$ 29,90 em BRL", purchase.length === 1 && purchase[0][2].value === 29.9 && purchase[0][2].currency === "BRL", JSON.stringify(purchase));

  // 8. Dentro do app: a página recarrega sozinha e fica SEM o script da Meta.
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  await page.waitForFunction(() => typeof window.fbq === "undefined", null, { timeout: 15000 });
  await page.waitForSelector("nav", { timeout: 10000 });
  const scriptsBefore = net.script;
  await page.goto(`${BASE}/lancamentos`);
  await page.waitForTimeout(800);
  check("dentro do app não existe script da Meta", !(await hasFbq(page)) && net.script === scriptsBefore && !(await page.content()).includes("fbevents"), `${net.script}/${scriptsBefore}`);

  // 9. Voltar à tela de assinatura não conta outra compra.
  await page.goto(`${BASE}/assinatura`);
  await page.waitForFunction(() => (window.__px || []).some((e) => e[1] === "PageView"), null, { timeout: 10000 });
  await page.waitForTimeout(500);
  check("assinatura não é contada duas vezes", !names(await events(page)).includes("Purchase"), JSON.stringify(names(await events(page))));
  check("nenhuma chamada direta à Meta além do script falso", net.other === 0, `${net.other}`);
  await ctx.close();
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
