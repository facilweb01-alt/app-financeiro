import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { activateUser, closeTestDb } from "./helpers/testDb.mjs";

// Teste de fumaça da funcionalidade "+ Nova categoria" em /lancamentos:
// o usuário cria uma categoria própria direto do formulário, sem sair da
// página, e ela já aparece selecionada e disponível pro lançamento.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const email = `categorias.${Date.now()}@example.com`;
const password = "SenhaForte123";
const customLabel = `Categoria Teste ${Date.now()}`;

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
await page.fill("#name", "Marcelo Categorias");
await page.fill("#email", email);
await page.fill("#password", password);
await page.check("#terms");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/conta-pendente`, { timeout: 10000 });
await activateUser(email);

await page.goto(`${BASE}/lancamentos`);
await page.waitForURL(`${BASE}/lancamentos`, { timeout: 10000 });

// 1. As categorias globais do sistema aparecem no select (não fica vazio).
const optionsBefore = await page.locator('select[name="categoryId"] option').allTextContents();
check(
  "select de categorias vem populado com as categorias do sistema",
  optionsBefore.some((t) => t.includes("Lazer")) && optionsBefore.some((t) => t.includes("alimentos"))
);
check("select tem a opção '+ Nova categoria...'", optionsBefore.some((t) => t.includes("Nova categoria")));

// 2. Abre o formulário inline de nova categoria.
await page.selectOption('select[name="categoryId"]', { label: "+ Nova categoria..." });
check("formulário de nova categoria aparece", await page.locator('input[name="label"]').isVisible());

// 3. Cria a categoria e confirma que ela aparece selecionada no select,
// sem precisar recarregar a página manualmente.
await page.fill('input[name="label"]', customLabel);
await page.click('button:has-text("Salvar")');

// Espera a Server Action completar (ida ao banco) e o select refletir a
// categoria recém-criada como selecionada — sem tempo fixo, faz polling.
await page
  .waitForFunction(
    (expected) => {
      const el = document.querySelector('select[name="categoryId"]');
      const opt = el && el.options[el.selectedIndex];
      return !!opt && opt.textContent === expected;
    },
    customLabel,
    { timeout: 8000 }
  )
  .catch(() => {});

const selectedLabel = await page.locator('select[name="categoryId"]').evaluate((el) => {
  const opt = el.options[el.selectedIndex];
  return opt ? opt.textContent : null;
});
check("categoria recém-criada fica selecionada automaticamente", selectedLabel === customLabel, selectedLabel);

const optionsAfter = await page.locator('select[name="categoryId"] option').allTextContents();
check("categoria nova aparece na lista de opções", optionsAfter.includes(customLabel));

// 4. Usa a categoria nova de verdade num lançamento.
await page.fill('input[name="description"]', "Teste categoria própria");
await page.fill('input[name="amount"]', "42");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(800);
const bodyAfterSubmit = await page.textContent("body");
check(
  "lançamento com a categoria nova aparece na lista",
  bodyAfterSubmit.includes("Teste categoria própria") && bodyAfterSubmit.includes(customLabel)
);

// 5. Recarrega a página do zero: a categoria criada continua lá (foi
// persistida no banco, não só no estado local do formulário).
await page.reload();
await page.waitForTimeout(500);
const optionsAfterReload = await page.locator('select[name="categoryId"] option').allTextContents();
check("categoria nova persiste depois de recarregar a página", optionsAfterReload.includes(customLabel));

await browser.close();
await closeTestDb();

if (failed) {
  console.log("\nALGUM TESTE FALHOU");
  process.exit(1);
} else {
  console.log("\nTODOS OS TESTES DE CATEGORIAS PASSARAM");
}
