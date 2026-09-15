import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { promoteAdmin, closeTestDb } from "./helpers/testDb.mjs";

// Teste de fumaça do painel administrativo: cadastro fica pendente, um
// admin aprova em /admin, define vencimento da mensalidade, suspende e
// reativa — e confirma que um usuário comum não consegue nem ver /admin.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";

const sandboxChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

const browser = await chromium.launch(launchOptions);

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (extra ? ` (${extra})` : ""));
  if (!cond) failed = true;
}

const adminEmail = `admin.${Date.now()}@example.com`;
const clientEmail = `cliente.${Date.now()}@example.com`;
const password = "SenhaForte123";

async function signup(page, name, email) {
  await page.goto(`${BASE}/registrar`);
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

// 1. Cria as duas contas de teste (ambas nascem 'pending'). Cada signup usa
// uma página nova (= contexto/cookies novos do Playwright) — reaproveitar a
// mesma página faria o segundo /registrar ser barrado pelo proxy.ts, que
// redireciona quem já tem cookie de sessão para longe de /registrar.
const setupPage1 = await browser.newPage();
await signup(setupPage1, "Admin Teste", adminEmail);
await setupPage1.close();

const setupPage2 = await browser.newPage();
await signup(setupPage2, "Cliente Teste", clientEmail);
await setupPage2.close();

// 2. Promove a primeira a admin (fora da UI de propósito — não existe tela
// pra isso, ver drizzle/promote-admin.sql) e loga com ela.
await promoteAdmin(adminEmail);
const adminPage = await browser.newPage();
await login(adminPage, adminEmail);
await adminPage.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });

// 3. O cliente ainda pendente aparece em /admin, e o link "Admin" existe no menu.
await adminPage.goto(`${BASE}/admin`);
check("admin acessa /admin", adminPage.url() === `${BASE}/admin`);
let adminBody = await adminPage.textContent("body");
check("cliente pendente aparece listado", adminBody.includes(clientEmail));
check("badge de status pendente aparece", adminBody.includes("Aguardando aprovação"));

// 4. Aprova o cliente.
const clientRow = adminPage.locator("tr", { hasText: clientEmail });
await clientRow.getByRole("button", { name: "Aprovar acesso" }).click();
await adminPage.waitForTimeout(600);
adminBody = await adminPage.textContent("body");
check("depois de aprovar, cliente some da lista de pendentes / vira ativo", !adminBody.includes("Nenhum cliente"));

// 5. O cliente, na própria sessão, já consegue acessar o app (sem logar de novo).
const clientPage = await browser.newPage();
await login(clientPage, clientEmail);
await clientPage.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
check("cliente aprovado acessa /dashboard normalmente", clientPage.url() === `${BASE}/dashboard`);

// 6. Admin define o vencimento da mensalidade.
await adminPage.reload();
const clientRow2 = adminPage.locator("tr", { hasText: clientEmail });
await clientRow2.locator('input[type="date"]').fill("2026-10-10");
await clientRow2.getByRole("button", { name: "Salvar" }).click();
await adminPage.waitForTimeout(600);
const dueBody = await adminPage.textContent("body");
check("vencimento salvo aparece formatado (10/10/2026)", dueBody.includes("10/10/2026"));

// 7. Admin suspende o cliente -> a sessão já aberta do cliente é barrada na próxima navegação.
const clientRow3 = adminPage.locator("tr", { hasText: clientEmail });
await clientRow3.getByRole("button", { name: "Suspender" }).click();
await adminPage.waitForTimeout(600);
await clientPage.goto(`${BASE}/dashboard`);
await clientPage.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
check("cliente suspenso é barrado do app na hora", clientPage.url() === `${BASE}/conta-pendente`);

// 8. Admin reativa -> cliente volta a acessar.
const clientRow4 = adminPage.locator("tr", { hasText: clientEmail });
await clientRow4.getByRole("button", { name: "Reativar" }).click();
await adminPage.waitForTimeout(600);
await clientPage.goto(`${BASE}/dashboard`);
await clientPage.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
check("cliente reativado volta a acessar o app", clientPage.url() === `${BASE}/dashboard`);

// 9. Usuário comum (não-admin) não consegue ver /admin — é mandado pro dashboard.
await clientPage.goto(`${BASE}/admin`);
await clientPage.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
check("cliente comum é redirecionado para fora de /admin", clientPage.url() === `${BASE}/dashboard`);
const adminNavLinkCount = await clientPage.locator('nav a[href="/admin"]').count();
check("link 'Admin' não aparece no menu de um cliente comum", adminNavLinkCount === 0);

// E, pra fechar o ciclo, confirma que no admin o link aparece de verdade.
const adminNavLinkCountForAdmin = await adminPage.locator('nav a[href="/admin"]').count();
check("link 'Admin' aparece no menu de quem é admin", adminNavLinkCountForAdmin > 0);

await adminPage.close();
await clientPage.close();
await browser.close();
await closeTestDb();

if (failed) {
  console.error("\nALGUM TESTE FALHOU");
  process.exit(1);
} else {
  console.log("\nTODOS OS TESTES DO PAINEL ADMINISTRATIVO PASSARAM");
}
