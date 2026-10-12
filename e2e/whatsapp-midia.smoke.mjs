import { chromium } from "playwright";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";
import { startFakeAsaas } from "./helpers/fakeAsaas.mjs";
import { startFakeZapi } from "./helpers/fakeZapi.mjs";
import { startFakeGemini } from "./helpers/fakeGemini.mjs";
import { fillSignup } from "./helpers/signup.mjs";

// Áudio e imagem pelo WhatsApp (11/10/2026): POST /api/whatsapp/midia, de
// ponta a ponta, contra um Gemini FALSO e um servidor de arquivos falso.
// NUNCA fala com o Google nem com o Z-API de verdade.
//
// Suba o app como no teste-gratis.smoke.mjs, mais:
//   GEMINI_API_KEY=chave-gemini-teste GEMINI_BASE_URL=http://localhost:3996/v1beta WHATSAPP_MIDIA_HOSTS=localhost
// e rode: WHATSAPP_WEBHOOK_SECRET=<o do .env.local> node e2e/whatsapp-midia.smoke.mjs

if (!process.env.DATABASE_URL) config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;
const fake = await startFakeAsaas(3998);
const zapi = await startFakeZapi();
const ai = await startFakeGemini();
const sandboxChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});

let failed = false;
function check(label, cond, extra) {
  console.log((cond ? "OK  " : "FAIL") + " - " + label + (!cond && extra !== undefined ? ` (${String(extra).slice(0, 700)})` : ""));
  if (!cond) failed = true;
}
const todaySP = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offsetDays * 86_400_000));
const midia = (body, secret = SECRET) =>
  fetch(`${BASE}/api/whatsapp/midia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const userOf = async (email) => (await sql`select * from users where email = ${email}`)[0];
const countTx = async (userId) => (await sql`select count(*)::int as n from transactions where user_id = ${userId}`)[0].n;
const lastTx = async (userId) => (await sql`select description, amount::text as amount from transactions where user_id = ${userId} order by created_at desc limit 1`)[0];

async function signup(name) {
  const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  const page = await ctx.newPage();
  const email = `midia.${Date.now()}.${Math.floor(Math.random() * 1e5)}@example.com`;
  await page.goto(`${BASE}/registrar`);
  const { phone } = await fillSignup(page, { name, email, password: "SenhaForte123" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/bem-vindo`, { timeout: 15000 });
  return { ctx, page, email, phone, zphone: `55${phone}` };
}

try {
  const u1 = await signup("Marta Midia"); // em teste grátis: pode lançar
  const user = await userOf(u1.email);
  const OGG = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(4000, 7)]);
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(9000, 3)]);
  const audioUrl = ai.file("voz1.ogg", "application/octet-stream", OGG);
  const imageUrl = ai.file("cupom.jpg", "image/jpeg", JPG);

  // ------------------------------------------------------------------ acesso e validação
  let r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: audioUrl }, null);
  check("sem o segredo: 401 e nada é baixado nem enviado à IA", r.status === 401 && ai.state.calls.length === 0 && ai.state.downloads.length === 0);
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: audioUrl }, "segredo-errado");
  check("segredo errado: 401", r.status === 401);
  r = await midia("isto não é json");
  check("corpo que não é JSON: 400", r.status === 400, JSON.stringify(r.json));
  r = await midia({ phone: u1.zphone, kind: "video", mediaUrl: audioUrl });
  check("tipo que não é áudio nem imagem: 400", r.status === 400, JSON.stringify(r.json));
  r = await midia({ phone: u1.zphone, kind: "audio" });
  check("sem endereço do arquivo: 400", r.status === 400);
  r = await midia({ phone: "abc", kind: "audio", mediaUrl: audioUrl });
  check("telefone inválido: 400", r.status === 400);
  check("nenhuma das chamadas recusadas tocou na IA nem baixou arquivo", ai.state.calls.length === 0 && ai.state.downloads.length === 0);

  // ------------------------------------------------------------------ áudio que vira lançamento
  ai.answer({ tipo: "lancamento", transcricao: "gastei 45 e 90 no mercado", description: "Mercado", amount: 45.9, categoryKey: "alimentacao", categoryName: null, purchaseDate: null, dueDate: null, paymentMethod: null, cardName: null, installments: null });
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: audioUrl, mimeType: "audio/ogg; codecs=opus" });
  check("áudio com gasto: 201, lançamento gravado", r.status === 201 && r.json.kind === "lancamento" && r.json.source === "audio", JSON.stringify(r.json));
  let tx = await lastTx(user.id);
  check("o lançamento está no banco com descrição e valor ditos no áudio", tx?.description === "Mercado" && tx?.amount === "45.90" && (await countTx(user.id)) === 1, JSON.stringify(tx));
  check("resposta pronta para o cliente: confirma, mostra a categoria e o que foi entendido", /Lançamento registrado/.test(r.json.reply) && /Mercado · R\$\s45,90/.test(r.json.reply) && /Categoria: Compra de alimentos/.test(r.json.reply) && /Entendi: “gastei 45 e 90 no mercado”/.test(r.json.reply), r.json.reply);
  let call = ai.state.calls.at(-1);
  check("a IA recebeu o arquivo inteiro, como áudio ogg, e pediu resposta em JSON", call.mime === "audio/ogg" && call.bytes === OGG.length && call.json === "application/json", JSON.stringify({ m: call.mime, b: call.bytes }));
  check("a chave da IA vai no cabeçalho, nunca no endereço", call.urlHadKey === false);
  check("a instrução leva a data de hoje e não leva telefone, nome nem e-mail do cliente", call.prompt.includes(`Hoje é ${todaySP()}`) && !call.prompt.includes(u1.phone) && !call.prompt.includes("Marta") && !call.prompt.includes(u1.email));

  // ------------------------------------------------------------------ imagem: compra no cartão, parcelada, valor em texto
  ai.answer('```json\n' + JSON.stringify({ tipo: "lancamento", transcricao: "Cupom Loja Bela, total R$ 1.234,56", description: "Loja Bela", amount: "R$ 1.234,56", categoryKey: "compras_pessoais", paymentMethod: "cartao", cardName: "Azul Midia", installments: 3, purchaseDate: todaySP() }) + '\n```');
  r = await midia({ phone: u1.zphone, kind: "image", mediaUrl: imageUrl, caption: "compra no cartão azul em 3x" });
  check("imagem de cupom com cartão e parcelas: 201, compra no cartão em 3x", r.status === 201 && r.json.kind === "cartao" && r.json.installments === 3 && r.json.amount === 1234.56, JSON.stringify(r.json));
  check("resposta da imagem: compra no cartão, parcelas e o que foi lido", /Compra no cartão registrada/.test(r.json.reply) && /3x de R\$\s411,52/.test(r.json.reply) && /Li na imagem/.test(r.json.reply), r.json.reply);
  call = ai.state.calls.at(-1);
  check("a IA recebeu a imagem como jpeg e a legenda do cliente", call.mime === "image/jpeg" && call.bytes === JPG.length && call.prompt.includes("compra no cartão azul em 3x"));
  const parcelas = await sql`select count(*)::int as n from card_installments i join card_purchases p on p.id = i.card_purchase_id join credit_cards c on c.id = p.card_id where c.user_id = ${user.id}`;
  check("as 3 parcelas foram geradas no cartão", parcelas[0].n === 3, `${parcelas[0].n}`);

  // ------------------------------------------------------------------ o que NÃO vira lançamento
  const before = await countTx(user.id);
  ai.answer({ tipo: "duvida", transcricao: "como eu cadastro um cartão?" });
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: audioUrl });
  check("áudio com dúvida: 200, sem lançamento, pede a pergunta por texto", r.status === 200 && r.json.kind === "duvida" && /dúvidas por texto/.test(r.json.reply) && /como eu cadastro um cartão\?/.test(r.json.reply), JSON.stringify(r.json));
  ai.answer({ tipo: "nada", transcricao: "" });
  r = await midia({ phone: u1.zphone, kind: "image", mediaUrl: imageUrl });
  check("imagem sem gasto legível: 200 'não entendi'", r.status === 200 && r.json.kind === "nao_entendi" && /Não consegui ler um gasto com valor nessa imagem/.test(r.json.reply), JSON.stringify(r.json));
  for (const [label, answer] of [
    ["texto solto em vez de JSON", "Claro! O usuário gastou 50 reais."],
    ["valor negativo", { tipo: "lancamento", transcricao: "x", description: "Estorno", amount: -50 }],
    ["valor zero", { tipo: "lancamento", transcricao: "x", description: "Nada", amount: 0 }],
    ["sem descrição", { tipo: "lancamento", transcricao: "x", amount: 50 }],
    ["valor absurdo", { tipo: "lancamento", transcricao: "x", description: "Carro", amount: 5e9 }],
    ["tipo inventado", { tipo: "apagar_conta", description: "x", amount: 10 }],
  ]) {
    ai.answer(answer);
    r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: audioUrl });
    check(`resposta estranha da IA (${label}): não grava nada`, r.status === 200 && r.json.kind === "nao_entendi", JSON.stringify(r.json));
  }
  check("nenhum lançamento foi criado por dúvida, imagem ilegível ou resposta estranha", (await countTx(user.id)) === before, `${await countTx(user.id)} vs ${before}`);

  // a IA tenta lançar na conta de outra pessoa: o remetente é sempre o da mensagem
  const u2 = await signup("Outro Cliente");
  const other = await userOf(u2.email);
  ai.answer({ tipo: "lancamento", transcricao: "x", description: "Padaria", amount: 12, phone: u2.zphone, userId: other.id });
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: audioUrl });
  check("campos a mais na resposta da IA (telefone, id de outro cliente) são ignorados", r.status === 201 && (await countTx(other.id)) === 0 && (await lastTx(user.id)).description === "Padaria");

  // ------------------------------------------------------------------ quem não pode usar não gasta chamada de IA
  let calls = ai.state.calls.length;
  let downloads = ai.state.downloads.length;
  r = await midia({ phone: "5511900000000", kind: "audio", mediaUrl: audioUrl });
  check("número sem conta: 404 com orientação de vincular; não baixa nem chama a IA", r.status === 404 && r.json.needsLink === true && /Vincular pelo WhatsApp/.test(r.json.reply) && ai.state.calls.length === calls && ai.state.downloads.length === downloads, JSON.stringify(r.json));
  await sql`update users set trial_ends_at = ${todaySP(-1)} where id = ${other.id}`;
  r = await midia({ phone: u2.zphone, kind: "audio", mediaUrl: audioUrl });
  check("teste grátis encerrado: 403 com o caminho para assinar; não chama a IA", r.status === 403 && r.json.reason === "trial_ended" && /assinatura/.test(r.json.reply) && ai.state.calls.length === calls, JSON.stringify(r.json));
  await sql`update users set status = 'suspended' where id = ${other.id}`;
  r = await midia({ phone: u2.zphone, kind: "image", mediaUrl: imageUrl });
  check("conta suspensa: 403; não chama a IA", r.status === 403 && r.json.reason === undefined && ai.state.calls.length === calls, JSON.stringify(r.json));

  // ------------------------------------------------------------------ arquivo com problema
  ai.answer({ tipo: "lancamento", transcricao: "x", description: "Nao deveria gravar", amount: 99 });
  const n0 = await countTx(user.id);
  calls = ai.state.calls.length;
  const big = ai.file("grande.ogg", "audio/ogg", Buffer.alloc(8 * 1024 * 1024 + 10, 1));
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: big });
  check("áudio acima do limite de tamanho: 422, não vai para a IA", r.status === 422 && /grande demais/i.test(r.json.error) && ai.state.calls.length === calls, JSON.stringify(r.json));
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: `${ai.base}/media/nao-existe.ogg` });
  check("arquivo que não existe mais: 422 com pedido para mandar de novo", r.status === 422 && /Mande de novo/.test(r.json.reply), JSON.stringify(r.json));
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: ai.file("vazio.ogg", "audio/ogg", Buffer.alloc(0)) });
  check("arquivo vazio: 422", r.status === 422, JSON.stringify(r.json));
  r = await midia({ phone: u1.zphone, kind: "image", mediaUrl: ai.file("doc.pdf", "application/pdf", Buffer.from("%PDF-1.4 teste")) });
  check("imagem em formato não aceito (PDF): 422", r.status === 422 && /Formato de imagem/.test(r.json.error), JSON.stringify(r.json));
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: imageUrl, mimeType: "video/mp4" });
  check("áudio com tipo de vídeo: 422", r.status === 422, JSON.stringify(r.json));

  // endereços que não podem ser baixados
  downloads = ai.state.downloads.length;
  for (const bad of [
    "http://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/a.ogg",
    "https://evil.example.com/a.ogg",
    "file:///etc/passwd",
    "http://localhost.evil.example.com/a.ogg",
    `${BASE}/api/health`.replace("localhost", "127.0.0.2"),
  ]) {
    r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: bad });
    check(`endereço não permitido é recusado sem baixar: ${bad.slice(0, 44)}`, r.status === 422 && ai.state.calls.length === calls, `${r.status} ${JSON.stringify(r.json)}`);
  }
  check("nenhum dos endereços recusados gerou download", ai.state.downloads.length === downloads);
  // redirecionamento para fora do permitido
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: ai.file("pula.ogg", null, null, { location: "http://169.254.169.254/latest/" }) });
  check("arquivo que redireciona para endereço interno: 422, não segue", r.status === 422 && ai.state.calls.length === calls, JSON.stringify(r.json));
  check("nenhum arquivo com problema virou lançamento", (await countTx(user.id)) === n0);
  // redirecionamento dentro do permitido funciona
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: ai.file("atalho.ogg", null, null, { location: audioUrl }) });
  check("redirecionamento para endereço permitido é seguido e o lançamento sai", r.status === 201 && (await lastTx(user.id)).description === "Nao deveria gravar".replace("Nao deveria gravar", "Nao deveria gravar"), JSON.stringify(r.json));

  // ------------------------------------------------------------------ IA fora do ar
  const n1 = await countTx(user.id);
  ai.answer({ status: 503 });
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: audioUrl });
  check("IA sobrecarregada: 502, resposta pedindo para tentar de novo, nada gravado", r.status === 502 && /Mande de novo em 1 minuto/.test(r.json.reply) && (await countTx(user.id)) === n1 && !JSON.stringify(r.json).includes("chave-gemini-teste"), JSON.stringify(r.json));

  // ------------------------------------------------------------------ regras do lançamento por texto continuam valendo
  ai.answer({ tipo: "lancamento", transcricao: "200 no cartão", description: "Roupas", amount: 200, paymentMethod: "cartao" });
  await sql`insert into credit_cards (id, user_id, name) values (${`cc_${Date.now()}`}, ${user.id}, 'Segundo Cartao')`;
  r = await midia({ phone: u1.zphone, kind: "audio", mediaUrl: audioUrl });
  check("cartão sem nome com dois cartões cadastrados: não chuta, devolve a mesma orientação do texto", r.status !== 201 && typeof r.json.error === "string" && r.json.reply.includes(r.json.error), JSON.stringify(r.json));

  await u1.ctx.close();
  await u2.ctx.close();
} catch (err) {
  failed = true;
  console.error("ERRO:", err);
} finally {
  await browser.close();
  await fake.close?.();
  await zapi.close?.();
  await ai.close?.();
  await sql.end();
}
console.log(failed ? "\nFALHOU" : "\nTUDO OK");
process.exit(failed ? 1 : 0);
