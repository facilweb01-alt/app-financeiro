import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, closeTestDb, insertLegacyMonthClosing } from "./helpers/testDb.mjs";
import { fillSignup } from "./helpers/signup.mjs";

// Correções de 07/10/2026 (relato do Lucas, cliente do Marcelo):
// 1. o fechamento do mês soma as contas fixas e mostra o MESMO total do painel;
// 2. fatura do cartão: fechar por mês com um clique ou por período, a lista
//    fica só com as parcelas em aberto, a fatura fechada vira relatório
//    (itens + PDF) e pode ser reaberta; encerrar o mês fecha a fatura junto;
// 3. gasto lançado depois, com data em período já fechado, entra direto no
//    período dele — painel e fechamento continuam batendo.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const email = `fatura.${Date.now()}@example.com`;
const password = "SenhaForte123";

const sandboxChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
const page = await context.newPage();
// Os botões de excluir/reabrir pedem confirmação: aceita sempre.
page.on("dialog", (d) => d.accept());

let failed = false;
function check(label, cond, extra) {
    console.log((cond ? "OK  " : "FAIL") + " - " + label + (!cond && extra ? ` (${String(extra).slice(0, 600)})` : ""));
    if (!cond) failed = true;
}

// "Hoje" no fuso de São Paulo, igual ao app.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const [ty, tm] = today.split("-").map(Number);
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const mesAtual = MESES[tm - 1];
const mesAtualLabel = `${mesAtual} de ${ty}`;

const body = () => page.innerText("body");
const cardBlock = (name) => page.locator('[data-testid="card-block"]').filter({ hasText: name });

async function addPurchase(cardName, { description, total, installments = 1, firstDue }) {
    const block = cardBlock(cardName);
    await block.locator('input[name="description"]').first().fill(description);
    await block.locator('input[name="totalAmount"]').first().fill(String(total));
    await block.locator('input[name="installmentsTotal"]').first().fill(String(installments));
    if (firstDue) await block.locator('input[name="firstDueDate"]').first().fill(firstDue);
    await block.locator('button:has-text("Adicionar compra")').click();
    await page.waitForTimeout(900);
}

async function dashboardTotal() {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForTimeout(400);
    const text = await page.locator("text=comprometidos este mês").first().innerText();
    return text;
}

// --- Preparação -----------------------------------------------------------
await page.goto(`${BASE}/registrar`);
await fillSignup(page, { name: "Lucas Fatura", email, password });
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
await activateUser(email);
await page.goto(`${BASE}/dashboard`);
await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
await page.goto(`${BASE}/fechamento`);
await page.fill('input[name="monthlyIncome"]', "5000");
await page.click('button:has-text("Salvar renda")');
await page.waitForTimeout(700);

await page.goto(`${BASE}/contas-fixas`);
await page.fill('input[name="description"]', "Aluguel");
await page.fill('input[name="amount"]', "1200");
await page.click('button:has-text("Adicionar conta fixa")');
await page.waitForTimeout(700);

await page.goto(`${BASE}/lancamentos`);
await page.fill('input[name="description"]', "Feira");
await page.fill('input[name="amount"]', "300");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(700);

await page.goto(`${BASE}/cartoes`);
for (const name of ["Azul Teste", "Verde Teste"]) {
    await page.fill('input[name="name"]', name);
    await page.click('button:has-text("Adicionar cartão")');
    await page.waitForTimeout(700);
}
await addPurchase("Azul Teste", { description: "Tenis", total: 300, installments: 3 });
await addPurchase("Azul Teste", { description: "Mercado cartao", total: 80 });
await addPurchase("Verde Teste", { description: "Livro", total: 40 });

// --- 1. Total do mês: painel e fechamento batem, com contas fixas ----------
// 300 (feira) + 100 (1/3 do tênis) + 80 + 40 = 520 lançado; + 1.200 fixas = 1.720
let dash = await dashboardTotal();
check("painel: R$ 1.720,00 comprometidos este mês", dash.includes("1.720,00"), dash);
await page.goto(`${BASE}/fechamento`);
let totalBox = await page.locator('[data-testid="month-total"]').first().innerText();
check("fechamento (prévia): Total do mês inclui contas fixas e bate com o painel (R$ 1.720,00)", totalBox.includes("1.720,00"), totalBox);
check("fechamento mostra o gasto lançado separado (R$ 520,00)", (await body()).includes("520,00"));

// --- 2. Fatura do cartão: fechar por mês com um clique ---------------------
await page.goto(`${BASE}/cartoes`);
let azul = await cardBlock("Azul Teste").innerText();
check("cartão mostra o total em aberto do mês (R$ 180,00, 2 parcelas)", azul.includes(mesAtualLabel) && azul.includes("180,00") && azul.includes("2 parcelas"), azul.slice(0, 400));
await cardBlock("Azul Teste").locator(`button:has-text("Fechar fatura de ${mesAtual.toLowerCase()}")`).click();
await page.waitForTimeout(900);
azul = await cardBlock("Azul Teste").innerText();
check("fatura do mês fechada com aviso do total", azul.includes("Fatura de") && azul.includes("180,00"));
const tabela = await cardBlock("Azul Teste").locator("table").innerText();
check("compra 1x já faturada sai da lista de compras em aberto", !tabela.includes("Mercado cartao"), tabela);
check("compra parcelada continua, só com as parcelas em aberto (2/3 e 3/3)", tabela.includes("Tenis") && tabela.includes("2/3") && tabela.includes("3/3") && !tabela.includes("1/3"), tabela);
check("lista avisa quantas parcelas da compra já estão em fatura fechada", tabela.includes("1 já em fatura fechada"));
check("nota: 1 compra totalmente faturada não aparece acima", (await cardBlock("Azul Teste").locator('[data-testid="invoiced-note"]').innerText()).includes("1 compra"));
const fatura = cardBlock("Azul Teste").locator('[data-testid="closed-statement"]').first();
await fatura.locator("summary").click();
let faturaTxt = await fatura.innerText();
check("fatura fechada é relatório: lista as parcelas que entraram nela", faturaTxt.includes("Tenis (1/3)") && faturaTxt.includes("Mercado cartao (1/1)") && faturaTxt.includes("180,00"), faturaTxt);

// PDF da fatura
const pdfHref = await fatura.locator('a:has-text("exportar PDF da fatura")').getAttribute("href");
const cookieHeader = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const pdfResp = await fetch(`${BASE}${pdfHref}`, { headers: { cookie: cookieHeader } });
const pdfBytes = Buffer.from(await pdfResp.arrayBuffer());
check("PDF da fatura fechada é gerado", pdfResp.status === 200 && pdfResp.headers.get("content-type") === "application/pdf" && pdfBytes.subarray(0, 4).toString() === "%PDF", `status=${pdfResp.status}`);
const pdfSemLogin = await fetch(`${BASE}${pdfHref}`, { redirect: "manual" });
check("PDF da fatura não abre sem login", pdfSemLogin.status !== 200, `status=${pdfSemLogin.status}`);

// --- 3. Compra nova com vencimento dentro da fatura já fechada -------------
const sugerido = await cardBlock("Azul Teste").locator('input[name="firstDueDate"]').first().inputValue();
check("com a fatura do mês fechada, o 1º vencimento já vem sugerido para o mês seguinte", sugerido > today && sugerido.slice(0, 7) !== today.slice(0, 7), sugerido);
await addPurchase("Azul Teste", { description: "Farmacia cartao", total: 50, firstDue: today });
azul = await cardBlock("Azul Teste").innerText();
check("compra com data em período fechado: aviso de que entrou direto na fatura", azul.includes("entrou direto nela"), azul.slice(0, 600));
check("ela não fica na lista de compras em aberto", !(await cardBlock("Azul Teste").locator("table").innerText()).includes("Farmacia cartao"));
faturaTxt = await cardBlock("Azul Teste").locator('[data-testid="closed-statement"]').first().innerText();
check("total da fatura fechada foi atualizado (R$ 230,00)", faturaTxt.includes("230,00"), faturaTxt);
dash = await dashboardTotal();
check("ela soma no mês da data dela: painel R$ 1.770,00", dash.includes("1.770,00"), dash);

// --- 4. Período manual: erro explica e não apaga o que foi digitado --------
await page.goto(`${BASE}/cartoes`);
const azulBlock = cardBlock("Azul Teste");
await azulBlock.locator('input[name="periodStart"]').fill("2000-01-01");
await azulBlock.locator('input[name="periodEnd"]').fill("2000-01-31");
await azulBlock.locator('button:has-text("Fechar fatura do período")').click();
await page.waitForTimeout(900);
azul = await azulBlock.innerText();
check("período sem parcelas: mensagem explica que vale o VENCIMENTO e mostra onde estão as parcelas em aberto", azul.includes("VENCIMENTO") && azul.includes("vencem de"), azul.slice(-500));
check("as datas digitadas continuam no formulário depois do erro", (await azulBlock.locator('input[name="periodStart"]').inputValue()) === "2000-01-01");

// Período manual atravessando meses (as duas parcelas futuras do tênis)
const addM = (n) => {
    const t = ty * 12 + (tm - 1) + n;
    return { y: Math.floor(t / 12), m: (t % 12) + 1 };
};
const p1 = addM(1);
const p2 = addM(2);
const pad = (n) => String(n).padStart(2, "0");
await azulBlock.locator('input[name="periodStart"]').fill(`${p1.y}-${pad(p1.m)}-01`);
await azulBlock.locator('input[name="periodEnd"]').fill(`${p2.y}-${pad(p2.m)}-${pad(new Date(p2.y, p2.m, 0).getDate())}`);
await azulBlock.locator('button:has-text("Fechar fatura do período")').click();
await page.waitForTimeout(900);
azul = await azulBlock.innerText();
check("período manual pegando dois meses fecha as 2 parcelas (R$ 200,00)", azul.includes("2 parcelas") && azul.includes("200,00") && azul.includes("Nenhuma compra em aberto"), azul.slice(0, 700));
// Reabre essa fatura: as parcelas voltam para a lista
await azulBlock.locator('[data-testid="closed-statement"]').first().locator("summary").click();
await azulBlock.locator('[data-testid="closed-statement"]').first().locator('button:has-text("reabrir fatura")').click();
await page.waitForTimeout(900);
const tabelaReaberta = await cardBlock("Azul Teste").locator("table").innerText();
check("reabrir fatura devolve as parcelas para a lista em aberto", tabelaReaberta.includes("2/3") && tabelaReaberta.includes("3/3"), tabelaReaberta);

// --- 5. Encerrar o mês: fecha a fatura junto e o total bate com o painel ---
await page.goto(`${BASE}/fechamento`);
await page.click('button:has-text("Fechar mês")');
await page.waitForTimeout(1200);
check("mês fechado com sucesso", (await body()).includes("Mês fechado com sucesso"));
const item = page.locator('[data-testid="closing-history-item"]').first();
let itemTxt = await item.locator("> summary").innerText();
check("histórico mostra o total do mês com contas fixas (R$ 1.770,00 no mês)", itemTxt.includes("1.770,00") && itemTxt.includes("no mês"), itemTxt);
dash = await dashboardTotal();
check("painel do mês encerrado mostra o MESMO total (R$ 1.770,00) e o selo de mês encerrado", dash.includes("1.770,00") && (await page.locator('[data-testid="closed-month-badge"]').count()) === 1, dash);

await page.goto(`${BASE}/cartoes`);
const verde = await cardBlock("Verde Teste").innerText();
check("encerrar o mês fechou junto a fatura do outro cartão", verde.includes("Nenhuma compra em aberto") && verde.includes("Faturas fechadas") && verde.includes("40,00"), verde.slice(0, 500));

// PDF do fechamento com o total do mês
const pdfMes = await fetch(`${BASE}/api/fechamento/pdf?yearMonth=${today.slice(0, 7)}`, { headers: { cookie: cookieHeader } });
check("PDF do mês encerrado é gerado", pdfMes.status === 200 && pdfMes.headers.get("content-type") === "application/pdf");

// --- 6. Depois de encerrado: renda/contas fixas congeladas; gasto novo entra no mês dele
await page.goto(`${BASE}/contas-fixas`);
await page.fill('input[name="description"]', "Internet nova");
await page.fill('input[name="amount"]', "500");
await page.click('button:has-text("Adicionar conta fixa")');
await page.waitForTimeout(700);
dash = await dashboardTotal();
check("conta fixa criada depois não altera o mês já encerrado (segue R$ 1.770,00)", dash.includes("1.770,00"), dash);

await page.goto(`${BASE}/lancamentos`);
await page.fill('input[name="description"]', "Gasto atrasado");
await page.fill('input[name="amount"]', "20");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(900);
const lanc = await body();
check("lançamento com data em mês encerrado é aceito, com aviso", lanc.includes("já está encerrado") && lanc.includes("entrou direto no fechamento"));
check("ele não aparece na lista do dia a dia", !(await page.locator("table").innerText()).includes("Gasto atrasado"));

await page.goto(`${BASE}/cartoes`);
await addPurchase("Verde Teste", { description: "Presente", total: 30, firstDue: today });
check("compra no cartão com vencimento em mês encerrado entra direto na fatura fechada", (await cardBlock("Verde Teste").innerText()).includes("70,00"));

dash = await dashboardTotal();
check("painel: R$ 1.820,00 (1.770 + 20 + 30)", dash.includes("1.820,00"), dash);
await page.goto(`${BASE}/fechamento`);
itemTxt = await page.locator('[data-testid="closing-history-item"]').first().locator("> summary").innerText();
check("fechamento: o mesmo R$ 1.820,00 — painel e fechamento batem depois dos lançamentos", itemTxt.includes("1.820,00"), itemTxt);
await page.locator('[data-testid="closing-history-item"]').first().locator("> summary").click();
const detalhe = await page.locator('[data-testid="closing-history-item"]').first().innerText();
check("relatório do mês encerrado: total, gasto lançado (R$ 620,00) e contas fixas (R$ 1.200,00)", detalhe.includes("620,00") && detalhe.includes("1.200,00"), detalhe.slice(0, 400));

// --- 7. Reabrir: fatura de mês encerrado só reabre depois de reabrir o mês --
await page.goto(`${BASE}/cartoes`);
const faturaVerde = cardBlock("Verde Teste").locator('[data-testid="closed-statement"]').first();
await faturaVerde.locator("summary").click();
await faturaVerde.locator('button:has-text("reabrir fatura")').click();
await page.waitForTimeout(900);
check("fatura com parcela em mês encerrado não reabre e explica o motivo", (await cardBlock("Verde Teste").innerText()).includes("mês que está encerrado"));

await page.goto(`${BASE}/fechamento`);
await page.locator('[data-testid="closing-history-item"]').first().locator('button:has-text("reabrir mês")').click();
await page.waitForTimeout(1000);
check("reabrir mês tira o mês do histórico", (await page.locator('[data-testid="closing-history-item"]').count()) === 0);
await page.goto(`${BASE}/lancamentos`);
check("lançamentos do mês reaberto voltam para a lista", (await page.locator("table").innerText()).includes("Gasto atrasado"));
dash = await dashboardTotal();
// mês reaberto: contas fixas atuais (1.200 + 500) -> 620 + 1.700 = 2.320
check("mês reaberto volta a usar as contas fixas atuais (R$ 2.320,00)", dash.includes("2.320,00"), dash);
await page.goto(`${BASE}/cartoes`);
const fv = cardBlock("Verde Teste").locator('[data-testid="closed-statement"]').first();
await fv.locator("summary").click();
await fv.locator('button:has-text("reabrir fatura")').click();
await page.waitForTimeout(900);
const verdeDepois = await cardBlock("Verde Teste").locator("table").innerText();
check("com o mês reaberto, a fatura reabre e as compras voltam para a lista", verdeDepois.includes("Livro") && verdeDepois.includes("Presente"), verdeDepois);

// Mês futuro não pode ser encerrado
await page.goto(`${BASE}/fechamento`);
const fut = addM(2);
await page.fill('input[name="yearMonth"]', `${fut.y}-${pad(fut.m)}`);
await page.click('button:has-text("Fechar mês")');
await page.waitForTimeout(900);
check("não deixa encerrar um mês que ainda não começou", (await body()).includes("ainda não começou"));

// --- 8. Mês encerrado na versão antiga (sem fechar a fatura): acerto automático
const ant = addM(-1);
const mesAnterior = `${ant.y}-${pad(ant.m)}`;
await page.goto(`${BASE}/cartoes`);
await addPurchase("Verde Teste", { description: "Compra antiga", total: 60, firstDue: `${mesAnterior}-15` });
check("antes: compra do mês anterior aparece em aberto", (await cardBlock("Verde Teste").locator("table").innerText()).includes("Compra antiga"));
await insertLegacyMonthClosing(email, mesAnterior);
await page.goto(`${BASE}/cartoes`);
const verdeLegado = await cardBlock("Verde Teste").innerText();
check(
    "mês encerrado na versão antiga: as parcelas dele saem sozinhas da lista em aberto e viram fatura fechada",
    !(await cardBlock("Verde Teste").locator("table").innerText()).includes("Compra antiga") && verdeLegado.includes("Faturas fechadas") && verdeLegado.includes("60,00"),
    verdeLegado
);

await browser.close();
await closeTestDb();

if (failed) {
    console.error("\nALGUM TESTE FALHOU");
    process.exit(1);
} else {
    console.log("\nTODOS OS TESTES DE FECHAMENTO E FATURA PASSARAM");
}
