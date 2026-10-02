import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, closeTestDb, getWelcome, requestWelcome } from "./helpers/testDb.mjs";
import { fillSignup } from "./helpers/signup.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";

// Manual do usuário + boas-vindas pelo WhatsApp, contra um Z-API FALSO
// (e2e/helpers/fakeZapi.mjs). Suba o app assim antes (sem Asaas):
//   ZAPI_BASE_URL=http://localhost:3997 ZAPI_INSTANCE_ID=inst-teste \
//   ZAPI_INSTANCE_TOKEN=tok-teste ZAPI_CLIENT_TOKEN=client-teste npx next start -p 3100
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";

const sandboxChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};
const browser = await chromium.launch(launchOptions);
const zapi = await startFakeZapi();

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (extra ? ` (${extra})` : ""));
  if (!cond) failed = true;
}
const processar = () =>
  fetch(`${BASE}/api/boas-vindas/processar`, { method: "POST" }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

async function signup(name) {
  const page = await browser.newPage();
  const email = `boasvindas.${Date.now()}.${Math.floor(Math.random() * 1000)}@example.com`;
  await page.goto(`${BASE}/registrar`);
  const { phone } = await fillSignup(page, { name, email, password: "SenhaForte123" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
  return { page, email, phone: `55${phone}` };
}

try {
  // 1. Manual: página pública e PDF
  {
    const page = await browser.newPage();
    const res = await page.goto(`${BASE}/manual`);
    const body = await page.innerText("body");
    check("página /manual abre sem login", res.status() === 200 && body.includes("Manual do Contay"));
    check(
      "manual explica as funções do app",
      ["Lançar pelo WhatsApp", "Painel", "Lançamentos", "Cartões", "Investimentos", "Contas fixas", "Fechamento do mês", "Dúvidas e suporte"].every((t) => body.includes(t))
    );
    check("manual pede para salvar o número do Contay", body.includes("98199-5301") && body.includes("Salve este"));
    const pdf = await fetch(`${BASE}/api/manual/pdf`);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    check(
      "PDF do manual é gerado (application/pdf, começa com %PDF)",
      pdf.status === 200 && pdf.headers.get("content-type") === "application/pdf" && bytes.subarray(0, 4).toString() === "%PDF" && bytes.length > 5000,
      `${bytes.length} bytes`
    );
    await page.close();
  }

  // 2. Conta pedida mas ainda pendente: não envia
  const a = await signup("maria das boas vindas");
  await requestWelcome(a.email);
  let r = await processar();
  check("conta ainda não liberada não recebe boas-vindas", r.status === 200 && zapi.sentTo(a.phone).length === 0, JSON.stringify(r.json));

  // 3. Conta liberada: texto + PDF, uma vez só
  await activateUser(a.email);
  r = await processar();
  const sentA = zapi.sentTo(a.phone);
  const text = sentA.find((s) => s.kind === "send-text");
  const doc = sentA.find((s) => s.kind === "send-document/pdf");
  check("processar envia 1 texto e 1 documento para o WhatsApp do cadastro (com 55)", r.json.sent === 1 && sentA.length === 2 && !!text && !!doc, JSON.stringify(r.json));
  check(
    "texto dá as boas-vindas pelo primeiro nome e pede para salvar o contato",
    !!text && text.body.message.includes("Olá, Maria!") && text.body.message.includes("Salve este contato") && text.body.message.includes("/manual"),
    text?.body.message.slice(0, 60)
  );
  check(
    "documento é o manual em PDF (base64) com nome de arquivo",
    !!doc && doc.body.fileName === "Manual-Contay" && String(doc.body.document).startsWith("data:application/pdf;base64,JVBERi") && doc.body.document.length > 8000
  );
  check("texto chega antes do PDF", sentA[0]?.kind === "send-text");
  let w = await getWelcome(a.email);
  check("banco registra o envio (welcome_sent_at) sem erro", !!w.welcome_sent_at && !w.welcome_error);
  r = await processar();
  check("chamar de novo não reenvia (sem duplicar mensagem)", r.json.sent === 0 && zapi.sentTo(a.phone).length === 2, JSON.stringify(r.json));

  // 4. Aviso de mês/ajuda no app: link Ajuda leva ao manual
  await a.page.goto(`${BASE}/dashboard`);
  check("menu do app tem o link Ajuda para o manual", (await a.page.locator('a[href="/manual"]').count()) > 0);

  // 5. Z-API fora do ar: registra o erro e não fica tentando sozinho
  const b = await signup("joão teste");
  await activateUser(b.email);
  await requestWelcome(b.email);
  zapi.setFail(true);
  r = await processar();
  w = await getWelcome(b.email);
  check("falha do Z-API fica registrada no cliente (welcome_error), sem marcar como enviado", r.json.failed === 1 && !w.welcome_sent_at && /Z-API/.test(w.welcome_error || ""), w.welcome_error);
  zapi.setFail(false);
  r = await processar();
  check("depois de falhar, não reenvia sozinho", r.json.sent === 0 && zapi.sentTo(b.phone).length === 0, JSON.stringify(r.json));
  await requestWelcome(b.email); // botão "Enviar boas-vindas" do painel
  r = await processar();
  w = await getWelcome(b.email);
  check("pedido de reenvio (painel) envia e limpa o erro", r.json.sent === 1 && zapi.sentTo(b.phone).length === 2 && !!w.welcome_sent_at && !w.welcome_error, JSON.stringify(r.json));

  // 6. Reenviar para quem já recebeu
  await requestWelcome(a.email);
  r = await processar();
  check("reenviar para quem já recebeu manda de novo (2 mensagens a mais)", r.json.sent === 1 && zapi.sentTo(a.phone).length === 4);
} finally {
  await browser.close();
  await zapi.close();
  await closeTestDb();
}

if (failed) {
  console.error("\nALGUM TESTE FALHOU");
  process.exit(1);
} else {
  console.log("\nMANUAL + BOAS-VINDAS PELO WHATSAPP OK");
}
