import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, closeTestDb } from "./helpers/testDb.mjs";

// Teste de fumaça do pacote de melhorias pedido pelo Marcelo: (1) "Gasto no
// mês que vem" ao lado de "Gasto no mês" no dashboard, (2) gráfico de
// parcelas a vencer sempre com 3 meses + filtro pra qualquer mês do
// horizonte de 10 meses, (3) botão "editar" numa compra de cartão já
// lançada, (4) relatório em PDF por cartão no painel principal. Contra um
// `next dev` real + Postgres local descartável, igual aos outros smoke
// tests desta pasta.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const email = `dashupgrade.${Date.now()}@example.com`;
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

function nextYearMonth() {
  const now = new Date();
  const total = now.getFullYear() * 12 + now.getMonth() + 1; // +1 mês
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Teste Dashboard Upgrade");
await page.fill("#email", email);
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

// --- Cartão + compra parcelada (parcela 1 no mês atual, 2 e 3 nos próximos) ---
await page.goto(`${BASE}/cartoes`);
await page.fill('input[name="name"]', "Cartão Upgrade Teste");
await page.click('button:has-text("Adicionar cartão")');
await page.waitForTimeout(800);
check("cartão criado", (await page.textContent("body")).includes("Cartão Upgrade Teste"));

await page.fill('input[name="description"]', "Compra Original");
await page.fill('input[name="totalAmount"]', "300");
await page.fill('input[name="installmentsTotal"]', "3");
await page.click('button:has-text("Adicionar compra")');
await page.waitForTimeout(800);
let cardBody = await page.textContent("body");
check("compra parcelada aparece", cardBody.includes("Compra Original") && cardBody.includes("1/3"));

// --- Editar a compra recém-criada ---
// Depois de clicar "editar", a tela tem DOIS campos "description" na
// página: o do formulário "Adicionar compra" (topo) e o do formulário de
// edição que acabou de abrir (dentro da linha da tabela) — por isso usa
// `.last()` em vez de page.fill (que pegaria o primeiro, o formulário
// errado).
await page.click('button:has-text("editar")');
await page.waitForTimeout(300);
await page.locator('input[name="description"]').last().fill("Compra Corrigida");
await page.click('button:has-text("Salvar alterações")');
await page.waitForTimeout(800);
cardBody = await page.textContent("body");
check(
  "edição da compra aplicada (descrição trocada)",
  cardBody.includes("Compra Corrigida") && !cardBody.includes("Compra Original")
);

// --- Dashboard: stat do próximo mês + gráfico fixo em 3 + filtro ---
await page.goto(`${BASE}/dashboard`);
await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
let dashBody = await page.textContent("body");
check("dashboard mostra 'Gasto no mês que vem'", dashBody.includes("Gasto no mês que vem"));
check(
  "dashboard mostra o filtro de mês do gráfico de parcelas",
  dashBody.includes("Ver parcelas de um mês")
);

const nym = nextYearMonth();
const selectExists = (await page.locator("#future-month-filter").count()) > 0;
check("select de filtro de mês existe", selectExists);
if (selectExists) {
  await page.selectOption("#future-month-filter", nym);
  await page.waitForTimeout(300);
  dashBody = await page.textContent("body");
  check(
    "painel de detalhe do mês selecionado mostra a parcela da compra editada",
    dashBody.includes("Compra Corrigida") && dashBody.includes("2/3")
  );
}

// --- Relatório em PDF por cartão ---
check("dashboard mostra o seletor de relatório em PDF por cartão", dashBody.includes("Relatório em PDF por cartão"));
const pdfLink = await page.locator('a:has-text("Baixar PDF")').getAttribute("href");
check("link de download do PDF do cartão existe", !!pdfLink && pdfLink.includes("/api/cartoes/pdf"));
if (pdfLink) {
  const resp = await page.request.get(`${BASE}${pdfLink}`);
  check("PDF do cartão: status 200", resp.status() === 200, `status=${resp.status()}`);
  check(
    "PDF do cartão: content-type application/pdf",
    (resp.headers()["content-type"] || "").includes("application/pdf")
  );
  const buf = await resp.body();
  check("PDF do cartão: começa com assinatura %PDF", buf.slice(0, 4).toString() === "%PDF");
}

await browser.close();
await closeTestDb();

if (failed) {
  console.error("\nALGUM TESTE FALHOU");
  process.exit(1);
} else {
  console.log("\nTODOS OS TESTES DO PACOTE DE MELHORIAS (DASHBOARD + CARTÕES) PASSARAM");
}
