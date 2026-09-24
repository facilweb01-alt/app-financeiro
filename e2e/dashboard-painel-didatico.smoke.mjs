import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, closeTestDb } from "./helpers/testDb.mjs";

// Teste de fumaça do pacote "painel mais didático" pedido pelo Marcelo depois
// de achar a % de renda comprometida "um pouco complicada de intender":
// (1) resumo em português simples no lugar do anel de % + 4 caixinhas, com
//     barra de progresso que nunca estoura visualmente (mesmo em caso
//     extremo de renda muito baixa) e o "Investido" separado num card verde;
// (2) busca de categoria em "Gastos por categoria" com detalhe misturando
//     lançamentos do dia a dia e compras de cartão, cada um com a origem
//     marcada;
// (3) filtro por categoria (além do filtro por mês já existente) em
//     "Parcelas e contas a vencer nos próximos meses", sem alterar o
//     gráfico dos 3 meses mais próximos.
// Contra um `next dev` real + Postgres local descartável, igual aos outros
// smoke tests desta pasta. Todas as 3 mudanças foram aprovadas por prévia
// (Artifact) antes de qualquer código real ser escrito — ver claude/status.md.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const email = `paineldidatico.${Date.now()}@example.com`;
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
  return new Date(base.getFullYear(), base.getMonth() + n, 1);
}
function yearMonthOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const today = new Date();
const nextMonthDate = addMonths(today, 1);
const nextYearMonth = yearMonthOf(nextMonthDate);
const farMonthDate = addMonths(today, 2);
const farYearMonth = yearMonthOf(farMonthDate);

await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Teste Painel Didatico");
await page.fill("#email", email);
await page.fill("#password", password);
await page.check("#terms");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
await activateUser(email);

await page.goto(`${BASE}/fechamento`);
await page.fill('input[name="monthlyIncome"]', "2000");
await page.click('button:has-text("Salvar renda")');
await page.waitForTimeout(600);

// --- Lançamentos do mês atual, em 2 categorias (Lazer e Saúde) ---
await page.goto(`${BASE}/lancamentos`);
await page.fill('input[name="description"]', "Cinema Ingresso");
await page.selectOption('select[name="categoryId"]', { label: "Lazer" });
await page.fill('input[name="amount"]', "60");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(500);

await page.fill('input[name="description"]', "Consulta Odontologica");
await page.selectOption('select[name="categoryId"]', { label: "Saúde" });
await page.fill('input[name="amount"]', "120");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(500);

// --- Investimento do mês (fica fora da conta de "comprometido") ---
await page.goto(`${BASE}/investimentos`);
await page.fill('input[name="description"]', "Aporte CDB");
await page.fill('input[name="amount"]', "50");
await page.click('button:has-text("Adicionar investimento")');
await page.waitForTimeout(500);

// --- Cartão: 2 compras no mês atual (Lazer + Compra de alimentos, testando
//     a MISTURA de origem dentro de uma mesma categoria — "Lazer" recebe
//     tanto lançamento quanto cartão) e 2 compras no mês que vem (Viagem +
//     Gasolina, pro filtro por categoria das parcelas futuras) ---
await page.goto(`${BASE}/cartoes`);
await page.fill('input[name="name"]', "Cartão Painel Didático");
await page.click('button:has-text("Adicionar cartão")');
await page.waitForTimeout(800);

async function addCardPurchase({ description, categoryLabel, amount, dueDate }) {
  await page.fill('input[name="description"]', description);
  await page.selectOption('select[name="categoryId"]', { label: categoryLabel });
  await page.fill('input[name="firstDueDate"]', dueDate);
  await page.fill('input[name="totalAmount"]', String(amount));
  await page.fill('input[name="installmentsTotal"]', "1");
  await page.click('button:has-text("Adicionar compra")');
  await page.waitForTimeout(500);
}

await addCardPurchase({ description: "Streaming Assinatura", categoryLabel: "Lazer", amount: 25, dueDate: dateStr(today) });
await addCardPurchase({ description: "Mercado Cartao", categoryLabel: "Compra de alimentos", amount: 40, dueDate: dateStr(today) });
await addCardPurchase({ description: "Passagem Aerea", categoryLabel: "Viagem", amount: 300, dueDate: dateStr(nextMonthDate) });
await addCardPurchase({ description: "Posto Combustivel", categoryLabel: "Gasolina", amount: 150, dueDate: dateStr(nextMonthDate) });

// Total do mês atual: 60 (lazer) + 120 (saúde) + 25 (lazer/cartão) + 40 (alimentação/cartão) = 245
// Total do mês que vem: 300 (viagem) + 150 (gasolina) = 450
// Contas fixas: 0. Combinado: 695. Renda: 2000 -> 34,75% (~35%) => "Sob controle".

// ============================================================
// 1) Resumo didático — frase em português simples, barra de progresso,
//    composição do total e "Investido" separado
// ============================================================
await page.goto(`${BASE}/dashboard`);
let dashBody = await page.textContent("body");

// Corrigido em 24/09/2026 (bug real reportado pelo Lucas, cliente do
// Marcelo, em vídeo no WhatsApp, um dia depois deste painel ir pro ar): o
// total da frase de abertura ERA gasto do mês + gasto do mês que vem +
// contas fixas (695,00 = 245 + 450 + 0). Agora é só gasto do mês + contas
// fixas do mês exibido (245,00 = 245 + 0) — "Gasto no mês que vem"
// continua aparecendo, só que como card informativo separado, do mesmo
// jeito que "Investido no mês". Ver comentário do `combinedTotal` em
// src/app/(app)/dashboard/page.tsx.
check("painel mostra a frase de resumo com o total comprometido", dashBody.includes("comprometidos este mês"));
check("painel mostra o total do mês exibido, SEM somar o mês que vem (R$ 245,00)", dashBody.includes("245,00"));
check("status do medidor é 'Sob controle' (abaixo de 70%)", dashBody.includes("Sob controle"));
check(
  "frase explicativa de status sob controle aparece",
  dashBody.includes("dentro do que você ganha esse mês")
);
check("barra de composição mostra os 2 componentes do mês exibido (gasto + contas fixas)", dashBody.includes("245,00") && dashBody.includes("0,00"));
check(
  "card do investido aparece separado, com o aviso de que não entra na conta",
  dashBody.includes("Investido no mês") && dashBody.includes("não entra na conta acima") && dashBody.includes("50,00")
);
check(
  "card do gasto do mês que vem aparece separado (R$ 450,00), com aviso de que não entra na conta",
  dashBody.includes("Gasto no mês que vem") && dashBody.includes("não entra na conta acima") && dashBody.includes("450,00")
);

// --- Caso extremo: renda cadastrada muito baixa vira múltiplo, não um
//     percentual gigante sem sentido (o bug real que o Marcelo reportou) ---
await page.goto(`${BASE}/fechamento`);
await page.fill('input[name="monthlyIncome"]', "1");
await page.click('button:has-text("Salvar renda")');
await page.waitForTimeout(600);

await page.goto(`${BASE}/dashboard`);
dashBody = await page.textContent("body");
check("caso extremo mostra rótulo 'Renda estourada'", dashBody.includes("Renda estourada"));
check(
  "caso extremo mostra múltiplo da renda em vez de percentual gigante",
  /Isso é cerca de \d+x a renda que você cadastrou/.test(dashBody)
);
check(
  "caso extremo sugere conferir a renda cadastrada",
  dashBody.includes("renda desatualizado") && dashBody.includes("Fechamento")
);
check("caso extremo NÃO mostra um percentual gigante solto (ex: 69500%)", !/69[.,]?500[.,]\d*%/.test(dashBody));

// Restaura renda razoável para o resto do teste.
await page.goto(`${BASE}/fechamento`);
await page.fill('input[name="monthlyIncome"]', "2000");
await page.click('button:has-text("Salvar renda")');
await page.waitForTimeout(600);

// ============================================================
// 2) Busca de categoria + detalhe misturando cartão e lançamento
// ============================================================
await page.goto(`${BASE}/dashboard`);

await page.fill("#category-search", "Lazer");
await page.waitForTimeout(300);
let dashVisible = await page.innerText("body");
check("busca por 'Lazer' mostra o lançamento do dia a dia", dashVisible.includes("Cinema Ingresso"));
check("busca por 'Lazer' mostra a compra de cartão da mesma categoria (mistura origem)", dashVisible.includes("Streaming Assinatura"));
check("item de lançamento aparece com o chip 'Lançamento'", dashVisible.includes("Lançamento"));
check("item de cartão aparece com o chip 'Cartão'", dashVisible.includes("Cartão"));
check(
  "busca por 'Lazer' NÃO mostra itens de outra categoria (Saúde)",
  dashVisible.includes("Consulta Odontologica") === false
);

await page.fill("#category-search", "Saúde");
await page.waitForTimeout(300);
dashVisible = await page.innerText("body");
check("trocar a busca para 'Saúde' mostra o lançamento certo", dashVisible.includes("Consulta Odontologica"));
check("trocar a busca para 'Saúde' não mostra mais os itens de Lazer", dashVisible.includes("Streaming Assinatura") === false);

await page.fill("#category-search", "");
await page.waitForTimeout(300);
dashVisible = await page.innerText("body");
check("limpar a busca esconde o detalhe da categoria", dashVisible.includes("Consulta Odontologica") === false);

// ============================================================
// 3) Filtro por categoria nas parcelas futuras (mantendo o gráfico e o
//    filtro por mês como já eram)
// ============================================================
await page.goto(`${BASE}/dashboard`);
check("filtro de mês das parcelas futuras continua existindo", (await page.locator("#future-month-filter").count()) > 0);
check(
  "heading 'Ver parcelas de um mês' continua no painel (gráfico de 3 meses inalterado)",
  (await page.textContent("body")).includes("Ver parcelas de um mês")
);

await page.selectOption("#future-month-filter", nextYearMonth);
await page.waitForTimeout(300);

const categoryFilterOptions = await page
  .locator("#future-category-filter option")
  .evaluateAll((opts) => opts.map((o) => o.textContent?.trim()));
check(
  "filtro de categoria das parcelas futuras lista as 2 categorias do mês (Viagem, Gasolina)",
  categoryFilterOptions.includes("Viagem") && categoryFilterOptions.includes("Gasolina"),
  categoryFilterOptions.join(",")
);

let futureBody = await page.textContent("body");
check("sem filtro de categoria, lista mostra as 2 parcelas do mês que vem", futureBody.includes("Passagem Aerea") && futureBody.includes("Posto Combustivel"));

await page.selectOption("#future-category-filter", { label: "Viagem" });
await page.waitForTimeout(300);
futureBody = await page.textContent("body");
// "Posto Combustivel" (do mês selecionado, categoria Gasolina) continua no
// payload de hidratação de todo o horizonte de 10 meses (invisível), então
// a checagem de "só aparece o item filtrado" usa innerText (texto
// realmente renderizado) em vez de textContent — mesmo motivo do teste do
// pacote de mês/listas colapsáveis.
let futureVisible = await page.innerText("body");
check(
  "filtrando por 'Viagem', mostra só a parcela dessa categoria",
  futureVisible.includes("Passagem Aerea") && futureVisible.includes("Posto Combustivel") === false
);
check("filtrando por categoria, mostra o total filtrado correto (R$ 300,00)", futureBody.includes("Total filtrado") && futureBody.includes("300,00"));

// Trocar de mês limpa o filtro de categoria de volta para "Todas as categorias".
await page.selectOption("#future-month-filter", farYearMonth);
await page.waitForTimeout(300);
const categoryFilterValueAfterMonthChange = await page.locator("#future-category-filter").inputValue();
check("trocar de mês reseta o filtro de categoria", categoryFilterValueAfterMonthChange === "");

await browser.close();
await closeTestDb();

if (failed) {
  console.error("\nALGUM TESTE FALHOU");
  process.exit(1);
} else {
  console.log("\nTODOS OS TESTES DO PAINEL DIDÁTICO (RESUMO + BUSCA DE CATEGORIA + FILTRO DE PARCELAS) PASSARAM");
}
