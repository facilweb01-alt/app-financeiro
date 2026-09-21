import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, closeTestDb } from "./helpers/testDb.mjs";

// Teste de fumaça de ponta a ponta cobrindo o fluxo completo do app:
// cadastro, renda, lançamento manual, cartão com parcelas, fechamento de
// fatura, investimento, conta fixa, fechamento do mês e conferência dos
// números no painel. Contra um `next dev` real + Postgres local descartável.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const email = `fluxo.${Date.now()}@example.com`;
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

// 1. Cadastro — nasce 'pending' (ver e2e/auth.smoke.mjs para o teste
// dedicado desse gate); aqui só simula a aprovação do admin pra poder
// seguir testando o resto do fluxo com uma conta ativa.
await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Marcelo Fluxo");
await page.fill("#email", email);
await page.fill("#password", password);
await page.check("#terms");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
await activateUser(email);
await page.goto(`${BASE}/dashboard`);
await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
check("cadastro ok (após aprovação)", page.url() === `${BASE}/dashboard`);

// 2. Definir renda mensal
await page.goto(`${BASE}/fechamento`);
await page.fill('input[name="monthlyIncome"]', "5000");
await page.click('button:has-text("Salvar renda")');
await page.waitForTimeout(800);
check("renda salva", (await page.textContent("body")).includes("Renda atualizada"));

// 3. Lançamento manual
await page.goto(`${BASE}/lancamentos`);
await page.fill('input[name="description"]', "Supermercado do mês");
await page.selectOption('select[name="categoryId"]', { label: "Compra de alimentos" });
await page.fill('input[name="amount"]', "300");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(800);
let lancBody = await page.textContent("body");
check("lançamento manual aparece na lista", lancBody.includes("Supermercado do mês") && lancBody.includes("R$"));

// 4. Cartão + compra parcelada
await page.goto(`${BASE}/cartoes`);
await page.fill('input[name="name"]', "Nubank Teste");
await page.click('button:has-text("Adicionar cartão")');
await page.waitForTimeout(800);
check("cartão criado", (await page.textContent("body")).includes("Nubank Teste"));

await page.fill('input[name="description"]', "Notebook novo");
await page.fill('input[name="totalAmount"]', "300");
await page.fill('input[name="installmentsTotal"]', "3");
await page.click('button:has-text("Adicionar compra")');
await page.waitForTimeout(800);
let cardBody = await page.textContent("body");
check("compra parcelada aparece com 3 parcelas", cardBody.includes("Notebook novo") && cardBody.includes("1/3") && cardBody.includes("2/3") && cardBody.includes("3/3"));

// 5. Fechar fatura cobrindo só a 1ª parcela (mês atual)
const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, "0");
const periodStart = `${y}-${m}-01`;
const lastDay = new Date(y, today.getMonth() + 1, 0).getDate();
const periodEnd = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

await page.fill('input[name="periodStart"]', periodStart);
await page.fill('input[name="periodEnd"]', periodEnd);
await page.fill('input[name="closingDate"]', periodEnd);
await page.click('button:has-text("Fechar fatura do período")');
await page.waitForTimeout(800);
// A lista de parcelas vem recolhida por padrão (só "1/3 · R$ 100,00" etc) —
// o selo "na fatura" só aparece no modo expandido, então precisa abrir
// "Ver detalhes" antes de checar.
await page.click('button:has-text("Ver detalhes")');
cardBody = await page.textContent("body");
check("fatura fechada mostra 'na fatura' na 1ª parcela e período no histórico", cardBody.includes("na fatura") && cardBody.includes("Faturas já fechadas"));

// 6. Investimento
await page.goto(`${BASE}/investimentos`);
await page.fill('input[name="description"]', "Tesouro Selic");
await page.fill('input[name="amount"]', "1000");
await page.click('button:has-text("Adicionar investimento")');
await page.waitForTimeout(800);
check("investimento aparece na lista", (await page.textContent("body")).includes("Tesouro Selic"));

// 7. Conta fixa
await page.goto(`${BASE}/contas-fixas`);
await page.fill('input[name="description"]', "Aluguel");
await page.fill('input[name="amount"]', "1200");
await page.click('button:has-text("Adicionar conta fixa")');
await page.waitForTimeout(800);
check("conta fixa aparece na lista", (await page.textContent("body")).includes("Aluguel"));

// 8. Dashboard reflete os números
await page.goto(`${BASE}/dashboard`);
await page.waitForTimeout(500);
const dashBody = await page.textContent("body");
// 300 (lançamento) + 100 (1a parcela de 300/3) = 400 gasto no mês
check("dashboard mostra gasto do mês (R$ 400,00)", dashBody.includes("400,00"));
check("dashboard mostra contas fixas (R$ 1.200,00)", dashBody.includes("1.200,00"));
check("dashboard mostra investido no mês (R$ 1.000,00)", dashBody.includes("1.000,00"));
// % da renda comprometida = (gasto variável + contas fixas) / renda = (400 + 1200) / 5000 = 32%
check("dashboard mostra % da renda comprometida (32%)", dashBody.includes("32%"));

// 9. Fechar o mês e checar projeção de parcelas futuras
await page.goto(`${BASE}/fechamento`);
await page.click('button:has-text("Fechar mês")');
await page.waitForTimeout(1000);
const fechamentoBody = await page.textContent("body");
check("mês fechado com sucesso", fechamentoBody.includes("Mês fechado com sucesso") || fechamentoBody.includes("já foi fechado"));
check("projeção mostra parcelas futuras do notebook (2 meses)", fechamentoBody.includes("Notebook novo"));

await browser.close();
await closeTestDb();

if (failed) {
    console.error("\nALGUM TESTE FALHOU");
    process.exit(1);
} else {
    console.log("\nTODOS OS TESTES DE FUMAÇA (FLUXO COMPLETO) PASSARAM");
}
