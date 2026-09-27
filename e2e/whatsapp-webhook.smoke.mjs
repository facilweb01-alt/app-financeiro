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

// 6b. Bug real 1 (26/09): "vencimento dia 15/10" -> data em formato BR é aceita
const post = (body) =>
    fetch(`${BASE}/api/whatsapp/lancamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${WEBHOOK_SECRET}` },
        body: JSON.stringify({ phone, ...body }),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

const brDate = await post({ description: "Suco", amount: 19.9, categoryKey: "alimentacao", dueDate: "15/10" });
check("vencimento '15/10' (formato BR) é aceito -> 201", brDate.status === 201, JSON.stringify(brDate));
check("vencimento convertido para AAAA-10-15", /^\d{4}-10-15$/.test(brDate.json.dueDate ?? ""), brDate.json.dueDate);

const badDate = await post({ description: "Suco", amount: 19.9, dueDate: "2026-15-10" });
check("data impossível (dia/mês trocados) -> 400 com mensagem clara, não 500", badDate.status === 400 && /vencimento inválida/i.test(badDate.json.error ?? ""), JSON.stringify(badDate));

const nullFields = await post({ description: "Pão", amount: 8, categoryKey: null, dueDate: null, cardName: null, installments: null });
check("campos null da IA não quebram (lançamento comum) -> 201", nullFields.status === 201 && nullFields.json.kind === "lancamento", JSON.stringify(nullFields));

// 6c. Bug real 2 (26/09): "Gastei 300 no cartão Mercado Pago parcelado em 3x" -> compra no cartão com 3 parcelas
const card3x = await post({ description: "Compra Mercado Pago", amount: 300, categoryKey: "compras_pessoais", paymentMethod: "cartao", cardName: "cartão mercado pago", installments: 3 });
check("compra no cartão parcelada -> 201 kind=cartao", card3x.status === 201 && card3x.json.kind === "cartao", JSON.stringify(card3x));
check("3 parcelas de R$ 100", card3x.json.installments === 3 && card3x.json.installmentAmount === 100, JSON.stringify(card3x.json));
check("cartão novo criado com nome bonito 'Mercado Pago'", card3x.json.cardCreated === true && card3x.json.cardName === "Mercado Pago", JSON.stringify(card3x.json));

const sameCard = await post({ description: "Tênis", amount: 250, cardName: "MERCADO PAGO", installments: 2, dueDate: "10/11" });
check("mesmo cartão é reaproveitado (não duplica)", sameCard.status === 201 && sameCard.json.cardCreated === false && sameCard.json.cardName === "Mercado Pago", JSON.stringify(sameCard.json));
check("1º vencimento usa a data falada (10/11)", /^\d{4}-11-10$/.test(sameCard.json.firstDueDate ?? ""), sameCard.json.firstDueDate);

await page.goto(`${BASE}/cartoes`);
const cardsText = await page.innerText("body");
check("aba Cartões mostra o cartão Mercado Pago", cardsText.includes("Mercado Pago"));
check("aba Cartões mostra a compra parcelada em 3x", cardsText.includes("Compra Mercado Pago") && /3x|1\/3/.test(cardsText), cardsText.slice(0, 300));

const azul = await post({ description: "Suco", amount: 19.9, cardName: "cartão azul", dueDate: "15/10" });
check("à vista no cartão 'azul' (a mensagem que deu erro) -> 201, 1 parcela vencendo 15/10", azul.status === 201 && azul.json.installments === 1 && /-10-15$/.test(azul.json.firstDueDate ?? ""), JSON.stringify(azul.json));

const noCardName = await post({ description: "Livro", amount: 60, installments: 2 });
check("parcelado sem dizer o cartão, com 2 cartões -> 400 pedindo o nome", noCardName.status === 400 && /Qual cartão/.test(noCardName.json.error ?? ""), JSON.stringify(noCardName));

// 6d. Bug real 1b (26/09): Z-API mandou o remetente como LID ("...@lid"), sem telefone
const lid = `${Date.now()}${Math.floor(Math.random() * 100)}`.slice(0, 15) + "@lid";
const lidNotLinked = await post({ phone: lid, description: "Café", amount: 5 });
check("LID não vinculado -> 404 pedindo para vincular", lidNotLinked.status === 404 && lidNotLinked.json.needsLink === true, JSON.stringify(lidNotLinked));

const wrongCode = await post({ phone: lid, linkCode: "000000" });
check("código errado -> 400", wrongCode.status === 400 && /inválido ou expirado/.test(wrongCode.json.error ?? ""), JSON.stringify(wrongCode));

await page.goto(`${BASE}/fechamento`);
await page.click('button:has-text("Vincular pelo WhatsApp")');
await page.waitForSelector("#whatsapp-link-code", { timeout: 10000 });
const codeText = await page.innerText("#whatsapp-link-code");
const code = (codeText.match(/VINCULAR\s+(\d{6})/) || [])[1];
check("aba Fechamento gera código 'VINCULAR 123456' com o número do app", !!code && codeText.includes("98199-5301"), codeText.replace(/\s+/g, " "));

const linkRes = await post({ phone: lid, linkCode: code });
check("mensagem VINCULAR <código> -> 200 vinculado", linkRes.status === 200 && linkRes.json.kind === "vinculo", JSON.stringify(linkRes));
const reuse = await post({ phone: lid, linkCode: code });
check("mesmo código não vale duas vezes", reuse.status === 400, JSON.stringify(reuse));

const lidLanc = await post({ phone: lid, description: "Café pelo LID", amount: 5, categoryKey: "alimentacao" });
check("depois de vincular, lançamento pelo LID -> 201", lidLanc.status === 201, JSON.stringify(lidLanc));
await page.goto(`${BASE}/fechamento`);
check("Fechamento mostra 'WhatsApp vinculado pelo código'", (await page.innerText("body")).includes("vinculado pelo código"));

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
