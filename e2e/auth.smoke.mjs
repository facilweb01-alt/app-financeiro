import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, suspendUser, closeTestDb } from "./helpers/testDb.mjs";

// Teste de fumaça ponta a ponta do fluxo de autenticação, contra um servidor
// `next dev` já rodando e um banco Postgres local descartável.
// Uso: SMOKE_BASE_URL=http://localhost:3100 node e2e/auth.smoke.mjs
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const email = `teste.${Date.now()}@example.com`;
const password = "SenhaForte123";

// Em ambientes com Chromium pré-instalado num caminho fixo (ex: sandbox de
// desenvolvimento), usa esse caminho; caso contrário deixa o Playwright
// resolver o Chromium instalado normalmente (`npx playwright install`).
const sandboxChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();

let failed = false;
function check(label, cond) {
    console.log((cond ? "OK  " : "FAIL") + " - " + label);
    if (!cond) failed = true;
}

// 1. Signup — conta nova nasce 'pending' e cai na tela de espera, não no app
// (ver src/lib/dal.ts#verifySession e /conta-pendente).
await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Marcelo Teste");
await page.fill("#email", email);
await page.fill("#password", password);
await page.check("#terms");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
check("signup de conta nova cai em /conta-pendente (aguardando aprovação)", page.url() === `${BASE}/conta-pendente`);
const pendingText = await page.textContent("body");
check("tela de espera explica que a conta está aguardando aprovação", pendingText.includes("aguardando aprovação"));

// Simula um admin aprovando o acesso em /admin, e confirma que a mesma
// sessão (sem precisar logar de novo) já passa a acessar o app normalmente.
await activateUser(email);
await page.goto(`${BASE}/dashboard`);
await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
check("depois de aprovada, a conta acessa /dashboard normalmente", page.url() === `${BASE}/dashboard`);
const dashboardText = await page.textContent("h1");
// O painel cumprimenta só com o primeiro nome, de propósito.
check("dashboard mostra o primeiro nome do usuário", dashboardText?.includes("Marcelo"));

// 2. Logout
await page.getByRole("button", { name: "Sair" }).click();
await page.waitForURL(`${BASE}/login`, { timeout: 10000 });
check("logout redireciona para /login", page.url() === `${BASE}/login`);

// 3. Tentar acessar rota protegida sem sessão
await page.goto(`${BASE}/lancamentos`);
await page.waitForURL(/\/login/, { timeout: 10000 });
check("rota protegida sem sessão redireciona para /login", page.url().includes("/login"));

// 4. Login de novo
await page.goto(`${BASE}/login`);
await page.fill("#email", email);
await page.fill("#password", password);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
check("login com credenciais corretas redireciona para /dashboard", page.url() === `${BASE}/dashboard`);

// 5. Login com senha errada
await page.getByRole("button", { name: "Sair" }).click();
await page.waitForURL(`${BASE}/login`, { timeout: 10000 });
await page.fill("#email", email);
await page.fill("#password", "senhaErrada123");
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);
const errorText = await page.textContent("body");
check("login com senha errada mostra erro e não redireciona", page.url() === `${BASE}/login` && errorText.includes("incorretos"));

// 6. Email duplicado no cadastro
await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Outra Pessoa");
await page.fill("#email", email);
await page.fill("#password", "OutraSenha123");
await page.check("#terms");
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);
const dupText = await page.textContent("body");
check("cadastro com e-mail duplicado mostra erro", dupText.includes("Já existe uma conta"));

// 7. Conta suspensa (ex: admin suspendeu) também cai em /conta-pendente, não no app
await page.goto(`${BASE}/login`);
await page.fill("#email", email);
await page.fill("#password", password);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });
await suspendUser(email);
await page.goto(`${BASE}/dashboard`);
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
const suspendedText = await page.textContent("body");
check("conta suspensa é barrada do app e vê a mensagem de suspensão", suspendedText.includes("suspenso"));

await browser.close();
await closeTestDb();

if (failed) {
    console.error("\nALGUM TESTE FALHOU");
    process.exit(1);
} else {
    console.log("\nTODOS OS TESTES DE FUMAÇA PASSARAM");
}
