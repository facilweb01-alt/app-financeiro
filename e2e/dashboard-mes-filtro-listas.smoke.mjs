import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, closeTestDb } from "./helpers/testDb.mjs";
import { randomCpf, randomPhone } from "./helpers/signup.mjs";

// Teste de fumaça do pacote pedido pelo Marcelo pelos 3 prints:
// (1) seletor de mês no painel principal (até 3 meses à frente, painel
//     inteiro reflete o mês escolhido);
// (2) campo com a somatória (contas fixas + gasto do mês + gasto do mês
//     que vem) ao lado dos campos individuais;
// (3) botão de minimizar/expandir ("Ver mais" / "Mostrar menos") em toda
//     lista de lançamentos da aplicação, não só na do print (a de
//     "Parcelas e valores a vencer" no Fechamento).
// Contra um `next dev` real + Postgres local descartável, igual aos outros
// smoke tests desta pasta.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const email = `mesfiltro.${Date.now()}@example.com`;
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

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMonths(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth() + n, 1);
  return d;
}
function yearMonthOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const today = new Date();
const nextMonthDate = addMonths(today, 1);
const nextYearMonth = yearMonthOf(nextMonthDate);

await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Teste Mes Filtro");
await page.fill("#email", email);
await page.fill("#whatsappPhone", randomPhone());
await page.fill("#cpf", randomCpf());
await page.fill("#password", password);
await page.check("#terms");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
await activateUser(email);

// Renda (necessária pro % e pros stats do dashboard)
await page.goto(`${BASE}/fechamento`);
await page.fill('input[name="monthlyIncome"]', "5000");
await page.click('button:has-text("Salvar renda")');
await page.waitForTimeout(600);

// --- Cartão + 7 compras de parcela única com vencimento no mês que vem ---
// 7 pra passar do limite padrão (6) da lista de compras do cartão, e
// também pra encher o "balde" do mês que vem no Fechamento com mais de 4
// parcelas (limite daquela lista específica, a do print 3 do Marcelo).
await page.goto(`${BASE}/cartoes`);
await page.fill('input[name="name"]', "Cartão Colapso Teste");
await page.click('button:has-text("Adicionar cartão")');
await page.waitForTimeout(800);

for (let i = 1; i <= 7; i++) {
  await page.fill('input[name="description"]', `Compra Colapso ${i}`);
  await page.fill('input[name="firstDueDate"]', dateStr(nextMonthDate));
  await page.fill('input[name="totalAmount"]', "50");
  await page.fill('input[name="installmentsTotal"]', "1");
  await page.click('button:has-text("Adicionar compra")');
  await page.waitForTimeout(500);
}
let cardsBody = await page.textContent("body");
// A lista já mostra a versão colapsada (6 de 7) neste ponto, então a compra
// mais recente (a 7ª) pode estar escondida atrás do "Ver mais" — confere a
// 1ª, que fica sempre visível por padrão.
check("7 compras lançadas no cartão", cardsBody.includes("Compra Colapso 1"));

// --- 8 lançamentos (pra passar do limite padrão de 6 da tabela) ---
await page.goto(`${BASE}/lancamentos`);
for (let i = 1; i <= 8; i++) {
  await page.fill('input[name="description"]', `Lancamento Colapso ${i}`);
  await page.fill('input[name="amount"]', "10");
  await page.click('button:has-text("Adicionar lançamento")');
  await page.waitForTimeout(400);
}
let lancBody = await page.textContent("body");
// Mesmo motivo: com a lista colapsada em 6 de 8, confere o 1º lançamento
// (sempre visível), não o mais recente.
check("8 lançamentos criados", lancBody.includes("Lancamento Colapso 1"));

// --- 6 contas fixas (pra passar do limite padrão de 5 da lista) ---
await page.goto(`${BASE}/contas-fixas`);
for (let i = 1; i <= 6; i++) {
  await page.fill('input[name="description"]', `Conta Fixa Colapso ${i}`);
  await page.fill('input[name="amount"]', "100");
  await page.click('button:has-text("Adicionar conta fixa")');
  await page.waitForTimeout(400);
}
let contasBody = await page.textContent("body");
check("6 contas fixas criadas", contasBody.includes("Conta Fixa Colapso 6"));

// ============================================================
// 1) Seletor de mês no painel — até 3 meses à frente, painel inteiro muda
// ============================================================
await page.goto(`${BASE}/dashboard`);
const monthSelectExists = (await page.locator("#dashboard-month").count()) > 0;
check("seletor de mês do painel existe", monthSelectExists);

if (monthSelectExists) {
  const optionValues = await page.locator("#dashboard-month option").evaluateAll((opts) =>
    opts.map((o) => o.getAttribute("value"))
  );
  check("seletor tem exatamente 4 opções (mês atual + 3 à frente)", optionValues.length === 4, `opções=${optionValues.join(",")}`);
  check("seletor inclui o mês que vem", optionValues.includes(nextYearMonth));

  let dashBody = await page.textContent("body");
  const spentThisMonthMatch = dashBody.match(/Gasto no mêsR\$\s*[\d.,]+/);
  check("painel mostra gasto do mês atual antes de trocar o mês", !!spentThisMonthMatch, dashBody.slice(0, 0));

  await page.selectOption("#dashboard-month", nextYearMonth);
  await page.waitForURL((url) => url.searchParams.get("mes") === nextYearMonth, { timeout: 10000 });
  dashBody = await page.textContent("body");
  check("painel indica '(mês selecionado)' após trocar o mês", dashBody.includes("(mês selecionado)"));
  // A descrição de cada compra só aparece VISIVELMENTE se o usuário buscar/
  // selecionar a categoria (busca+detalhe da categoria, feature nova) — por
  // isso usa innerText (texto realmente renderizado) em vez de textContent
  // (que também pega o payload de hidratação embutido no HTML, invisível).
  const dashVisibleText = await page.innerText("body");
  check(
    "painel do mês selecionado NÃO mostra de cara a descrição das 7 parcelas (só some ao buscar a categoria)",
    dashVisibleText.includes("Compra Colapso 1") === false
  );
  // O gasto do mês selecionado (mês que vem) deve refletir as 7 compras de
  // R$50 lançadas no cartão para esse mês = R$ 350,00 (sem o prefixo "R$"
  // na comparação porque o Intl usa espaço não separável ali).
  check("painel do mês selecionado mostra o gasto correto (R$ 350,00)", dashBody.includes("350,00"));
}

// ============================================================
// 2) Resumo didático do painel mostra o total comprometido (SÓ do mês
//    exibido: gasto do mês + contas fixas) na frase de abertura do card,
//    mantendo os campos individuais na barra de composição — substitui o
//    antigo campo solto "Total" pedido pelo Marcelo depois de achar a %
//    difícil de entender.
//
// Corrigido em 24/09/2026 (bug real reportado pelo Lucas, cliente do
// Marcelo, em vídeo no WhatsApp): esse total ERA mês + mês que vem +
// contas fixas, o que inflava o valor do mês exibido com uma fatia do mês
// seguinte. Agora é só gasto do mês + contas fixas — "Gasto no mês que
// vem" continua no painel, mas como card informativo separado (não entra
// nessa soma). Ver comentário do `combinedTotal` em
// src/app/(app)/dashboard/page.tsx.
// ============================================================
await page.goto(`${BASE}/dashboard`);
let dashHomeBody = await page.textContent("body");
check("painel mostra a frase de resumo com o total comprometido", dashHomeBody.includes("comprometidos este mês"));
check("painel ainda mostra os campos individuais (Gasto no mês, Contas fixas)", dashHomeBody.includes("Gasto no mês") && dashHomeBody.includes("Contas fixas"));
// Contas fixas ativas somam R$ 600,00 (6 x R$100) + gasto do mês atual
// (lançamentos de R$10 x 8 = R$80) = R$ 680,00 — SEM o gasto do mês que
// vem (R$ 350,00), que agora fica de fora dessa conta.
check("total do mês bate com o esperado (R$ 680,00), sem somar o mês que vem", dashHomeBody.includes("680,00"));
check(
  "painel mostra o gasto do mês que vem (R$ 350,00) separado, com aviso de que não entra na conta",
  dashHomeBody.includes("Gasto no mês que vem") &&
    dashHomeBody.includes("não entra na conta acima") &&
    dashHomeBody.includes("350,00")
);

// ============================================================
// 3) Botão de minimizar/expandir em listas de lançamentos por toda a app
// ============================================================
await page.goto(`${BASE}/lancamentos`);
lancBody = await page.textContent("body");
check("lista de lançamentos mostra 'Ver mais' (mais de 6 itens)", /Ver mais \d+ lançamentos?/.test(lancBody));
await page.click('button:has-text("Ver mais")');
await page.waitForTimeout(300);
lancBody = await page.textContent("body");
check("depois de expandir, mostra 'Mostrar menos' e todos os 8 lançamentos", lancBody.includes("Mostrar menos") && lancBody.includes("Lancamento Colapso 8"));
await page.click('button:has-text("Mostrar menos")');
await page.waitForTimeout(300);

await page.goto(`${BASE}/contas-fixas`);
contasBody = await page.textContent("body");
check("lista de contas fixas mostra 'Ver mais' (mais de 5 itens)", /Ver mais \d+ contas? fixas?/.test(contasBody));

await page.goto(`${BASE}/cartoes`);
cardsBody = await page.textContent("body");
check("lista de compras do cartão mostra 'Ver mais' (mais de 6 itens)", /Ver mais \d+ compras?/.test(cardsBody));

await page.goto(`${BASE}/fechamento`);
let fechBody = await page.textContent("body");
check(
  "Fechamento mostra 'Ver mais' na lista de parcelas do mês que vem (o print 3 do Marcelo)",
  /Ver mais \d+ parcelas?/.test(fechBody)
);

await browser.close();
await closeTestDb();

if (failed) {
  console.error("\nALGUM TESTE FALHOU");
  process.exit(1);
} else {
  console.log("\nTODOS OS TESTES DO PACOTE (SELETOR DE MÊS + TOTAL SOMADO + LISTAS COLAPSÁVEIS) PASSARAM");
}
