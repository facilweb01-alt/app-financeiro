import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { randomCpf, randomPhone } from "./helpers/signup.mjs";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const outDir = process.argv[2] || "/tmp";

const sandboxChromium = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const email = `screenshot.${Date.now()}@example.com`;
const password = "SenhaForte123";

await page.goto(`${BASE}/registrar`);
await page.fill("#name", "Marcelo Screenshot");
await page.fill("#email", email);
await page.fill("#whatsappPhone", randomPhone());
await page.fill("#cpf", randomCpf());
await page.fill("#password", password);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 });

await page.goto(`${BASE}/fechamento`);
await page.fill('input[name="monthlyIncome"]', "5000");
await page.click('button:has-text("Salvar renda")');
await page.waitForTimeout(500);

await page.goto(`${BASE}/lancamentos`);
await page.fill('input[name="description"]', "Supermercado");
await page.selectOption('select[name="categoryId"]', { label: "Compra de alimentos" });
await page.fill('input[name="amount"]', "300");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(500);
await page.fill('input[name="description"]', "Cinema");
await page.selectOption('select[name="categoryId"]', { label: "Lazer" });
await page.fill('input[name="amount"]', "80");
await page.click('button:has-text("Adicionar lançamento")');
await page.waitForTimeout(500);

await page.goto(`${BASE}/cartoes`);
await page.fill('input[name="name"]', "Nubank");
await page.click('button:has-text("Adicionar cartão")');
await page.waitForTimeout(500);
await page.fill('input[name="description"]', "Notebook");
await page.fill('input[name="totalAmount"]', "3000");
await page.fill('input[name="installmentsTotal"]', "6");
await page.click('button:has-text("Adicionar compra")');
await page.waitForTimeout(500);

await page.goto(`${BASE}/dashboard`);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/dashboard.png`, fullPage: true });

await page.goto(`${BASE}/cartoes`);
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/cartoes.png`, fullPage: true });

await page.goto(`${BASE}/fechamento`);
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/fechamento.png`, fullPage: true });

console.log("screenshots salvos em", outDir);
await browser.close();
