// Acesso direto ao banco só para os testes de ponta a ponta simularem ações
// que, na vida real, um admin faria em /admin (aprovar um cliente) — sem
// isso, todo teste que precisa de uma conta ativa teria que passar pela UI
// do painel administrativo, o que tornaria cada smoke test de outra
// funcionalidade acoplado ao painel admin. Usa a mesma DATABASE_URL "dona"
// de desenvolvimento (nunca a app_runtime — aqui não estamos testando RLS,
// só preparando estado).
import postgres from "postgres";
import { config } from "dotenv";

if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

/** Simula um admin aprovando o cadastro (status -> active). */
export async function activateUser(email) {
  await sql`update users set status = 'active', approved_at = now() where email = ${email}`;
}

/** Simula um admin suspendendo o cliente (status -> suspended). */
export async function suspendUser(email) {
  await sql`update users set status = 'suspended' where email = ${email}`;
}

/** Promove a conta de teste a admin (para os próprios testes do painel /admin). */
export async function promoteAdmin(email) {
  await sql`update users set role = 'admin', status = 'active', approved_at = now() where email = ${email}`;
}

export async function closeTestDb() {
  await sql.end({ timeout: 1 });
}
