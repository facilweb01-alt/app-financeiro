import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, suspendUser, closeTestDb } from "./helpers/testDb.mjs";
import { randomCpf } from "./helpers/signup.mjs";

// Testa o endpoint POST /api/whatsapp/lancamento de ponta a ponta:
// cria usuário, vincula um número de WhatsApp pela UI, chama o endpoint
// simulando o que uma automação (ex: n8n) chamaria depois de interpretar
// uma mensagem, e confere que o lançamento aparece na lista.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
    console.error("Defina WHATSAPP_WEBHOOK_SECRET no ambiente para rodar este teste.");
    process.exit(1);
}

const sandboxChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();

let failed = false;
function check(label, cond, extra) {
    console.log((cond ? "OK  " : "FAIL") + " - " + label + (extra ? ` (${extra})` : ""));
    if (!cond) failed = true;
}

const email = `whatsapp.${Date.now()}@example.com`;
const password = "SenhaForte123";
const phone = `5583${Date.now().toString().slice(-9)}`;

await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Marcelo WhatsApp");
await page.fill("#email", email);
await page.fill("#whatsappPhone", phone); // o WhatsApp agora já vem do cadastro
await page.fill("#cpf", randomCpf());
await page.fill("#password", password);
await page.check("#terms");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
await activateUser(email); // simula aprovação do admin, como nos outros smoke tests
await page.goto(`${BASE}/fechamento`);
// O cadastro guarda DDD + número (sem o 55) — o webhook casa as duas formas.
check("número do cadastro já aparece vinculado na aba Fechamento", (await page.textContent("body")).includes(`+${phone.slice(2)}`));

// 1. Chamada sem secret -> 401
const noAuthRes = await fetch(`${BASE}/api/whatsapp/lancamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, description: "teste", amount: 10 }),
});
check("sem secret retorna 401", noAuthRes.status === 401, `status=${noAuthRes.status}`);

// 2. Chamada com secret errado -> 401
const wrongAuthRes = await fetch(`${BASE}/api/whatsapp/lancamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret-errado" },
    body: JSON.stringify({ phone, description: "teste", amount: 10 }),
});
check("secret errado retorna 401", wrongAuthRes.status === 401, `status=${wrongAuthRes.status}`);

// 3. Telefone não vinculado -> 404
const unknownPhoneRes = await fetch(`${BASE}/api/whatsapp/lancamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ phone: "5511900000000", description: "teste", amount: 10 }),
});
check("telefone não vinculado retorna 404", unknownPhoneRes.status === 404, `status=${unknownPhoneRes.status}`);

// 4. Chamada válida -> 201 e cria lançamento
const validRes = await fetch(`${BASE}/api/whatsapp/lancamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ phone, description: "Uber", amount: 27.5, categoryKey: "viagem" }),
});
const validJson = await validRes.json();
check("chamada válida retorna 201", validRes.status === 201, `status=${validRes.status} body=${JSON.stringify(validJson)}`);
check("categoria retornada é Viagem", validJson.category === "Viagem", JSON.stringify(validJson));

// 5. Confirma que aparece na lista de lançamentos da conta certa
await page.goto(`${BASE}/lancamentos`);
const lancBody = await page.textContent("body");
check("lançamento via WhatsApp aparece na lista do usuário", lancBody.includes("Uber") && lancBody.includes("27,50"));

// 6. Categoria inexistente -> 400
const badCategoryRes = await fetch(`${BASE}/api/whatsapp/lancamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ phone, description: "x", amount: 1, categoryKey: "categoria-que-nao-existe" }),
});
check("categoria inexistente retorna 400", badCategoryRes.status === 400, `status=${badCategoryRes.status}`);

// 7. Conta suspensa (ex: admin suspendeu em /admin) -> 403, mesmo número vinculado
await suspendUser(email);
const suspendedRes = await fetch(`${BASE}/api/whatsapp/lancamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ phone, description: "y", amount: 1 }),
});
check("conta suspensa retorna 403 no webhook", suspendedRes.status === 403, `status=${suspendedRes.status}`);

await browser.close();
await closeTestDb();

if (failed) {
    console.error("\nALGUM TESTE FALHOU");
    process.exit(1);
} else {
    console.log("\nTODOS OS TESTES DO WEBHOOK DE WHATSAPP PASSARAM");
}
