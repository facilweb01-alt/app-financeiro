import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, closeTestDb } from "./helpers/testDb.mjs";
import { randomCpf, randomPhone } from "./helpers/signup.mjs";

// Teste de fumaça das features novas do redesign azul: metas de
// investimento (criar meta + registrar aporte + progresso), limites de
// gastos por categoria (criar limite + alerta quando ultrapassa) e a
// exportação em PDF do fechamento mensal. Contra um `next dev` real +
// Postgres local descartável, igual aos outros smoke tests desta pasta.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const email = `novasfeatures.${Date.now()}@example.com`;
const password = "SenhaForte123";

const sandboxChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (extra ? ` (${extra})` : ""));
  if (!cond) failed = true;
}

await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Teste Features");
await page.fill("#email", email);
await page.fill("#whatsappPhone", randomPhone());
await page.fill("#cpf", randomCpf());
await page.fill("#password", password);
await page.check("#terms");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
await activateUser(email);
await page.goto(`${BASE}/dashboard`);
await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });

// Renda (necessária pro % de limite)
await page.goto(`${BASE}/fechamento`);
await page.fill('input[name="monthlyIncome"]', "5000");
await page.click('button:has-text("Salvar renda")');
await page.waitForTimeout(600);

// --- Meta de investimento ---
await page.goto(`${BASE}/investimentos`);
check("seção de metas aparece", (await page.textContent("body")).includes("Metas de investimento"));
await page.fill('input[name="name"]', "Reserva de emergência");
await page.fill('input[name="targetAmount"]', "1000");
await page.click('button:has-text("Criar meta")');
await page.waitForTimeout(800);
let invBody = await page.textContent("body");
check("meta criada aparece", invBody.includes("Reserva de emergência"));
check("progresso inicial 0%", invBody.includes("0%"));

await page.fill('input[placeholder="Registrar aporte (R$)"]', "250");
await page.click('button:has-text("Aportar")');
await page.waitForTimeout(800);
invBody = await page.textContent("body");
check("aporte refletido (25%)", invBody.includes("25%"));

// --- Limite de gastos por categoria ---
await page.goto(`${BASE}/fechamento`);
check("seção de limites aparece", (await page.textContent("body")).includes("Limites de gastos por categoria"));
await page.selectOption('form:has-text("Definir limite") select[name="categoryId"]', { label: "Compra de alimentos" });
await page.fill('form:has-text("Definir limite") input[name="monthlyLimit"]', "100");
await page.click('button:has-text("Definir limite")');
await page.waitForTimeout(800);
let fechBody = await page.textContent("body");
check("limite criado aparece", fechBody.includes("Compra de alimentos") && fechBody.includes("100,00"));

// Lança uma despesa acima do limite pra checar o alerta
await page.goto(`${BASE}/lancamentos`);
await page.fill('input[name="description"]', "Mercado caro");
await page.selectOption('select[name="categoryId"]', { label: "Compra de alimentos" });
await page.fill('input[name="amount"]', "150");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(800);

await page.goto(`${BASE}/fechamento`);
fechBody = await page.textContent("body");
check("alerta de limite ultrapassado aparece", fechBody.includes("Limite ultrapassado"));

// --- PDF export ---
const cookies = await page.context().cookies();
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const resp = await fetch(`${BASE}/api/fechamento/pdf`, { headers: { cookie: cookieHeader } });
const buf = Buffer.from(await resp.arrayBuffer());
check("PDF: status 200", resp.status === 200, `status=${resp.status}`);
check("PDF: content-type application/pdf", resp.headers.get("content-type") === "application/pdf");
check("PDF: começa com assinatura %PDF", buf.slice(0, 4).toString() === "%PDF");
check("PDF: tamanho razoável (> 500 bytes)", buf.length > 500, `bytes=${buf.length}`);

await browser.close();
await closeTestDb();

if (failed) {
  console.error("\nALGUM TESTE FALHOU");
  process.exit(1);
} else {
  console.log("\nTODOS OS TESTES DAS NOVAS FEATURES PASSARAM");
}
