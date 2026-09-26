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
  await page.fill("#cpf", cpf);
  await page.fill("#password", password);
  await page.check("#terms");
  return { phone, cpf };
}
