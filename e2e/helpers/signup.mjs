// Preenche o formulário de cadastro (/registrar) — usado por todos os smoke
// tests. Desde a página de vendas + cobrança Pix, o cadastro também pede
// WhatsApp e CPF; centralizar aqui evita repetir isso em cada suíte.

/** Gera um CPF válido aleatório (só dígitos). */
export function randomCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (n.every((d) => d === n[0])) n[0] = (n[0] + 1) % 10;
  const dv = (digits) => {
    const len = digits.length;
    const sum = digits.reduce((acc, d, i) => acc + d * (len + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = dv(n);
  const d2 = dv([...n, d1]);
  return [...n, d1, d2].join("");
}

/** Celular único (DDD 83 + 9 + 8 dígitos) para não colidir entre testes. */
export function randomPhone() {
  return `839${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`;
}

export async function fillSignup(page, { name, email, password, phone = randomPhone(), cpf = randomCpf() }) {
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#whatsappPhone", phone);
  // Desde o teste grátis (11/10/2026) o cadastro não pede CPF: ele é pedido
  // na tela de pagamento. O campo só é preenchido se existir.
  if ((await page.locator("#cpf").count()) > 0) await page.fill("#cpf", cpf);
  await page.fill("#password", password);
  await page.check("#terms");
  return { phone, cpf };
}

/**
 * Deixa a conta recém-cadastrada no estado "sem teste grátis, aguardando a 1ª
 * mensalidade" (o de quem se cadastrou antes de 11/10/2026 ou de quem já teve
 * o teste encerrado há tempo): tira a data do teste, grava o CPF (antes vinha
 * do cadastro) e zera as boas-vindas do cadastro, que nesse estado só saem
 * depois do 1º pagamento. É o ponto de partida das suítes de cobrança.
 * `sql` é a conexão do teste (role dona do banco).
 */
export async function makeLegacyPending(sql, email, cpf = randomCpf()) {
  // espera as boas-vindas do cadastro terminarem (enviadas ou com erro) para não zerar no meio do envio
  for (let i = 0; i < 40; i++) {
    const [u] = await sql`select welcome_sent_at, welcome_error from users where email = ${email}`;
    if (!u) throw new Error(`usuário ${email} não encontrado`);
    if (u.welcome_sent_at || u.welcome_error) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await sql`update users set trial_ends_at = null, cpf = ${cpf}, welcome_requested_at = null, welcome_sent_at = null, welcome_error = null where email = ${email}`;
  return cpf;
}
