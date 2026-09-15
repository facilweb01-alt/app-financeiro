import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

// Em runtime do Next.js, .env.local já é carregado automaticamente. Este
// fallback só entra em ação quando este módulo é importado fora do Next
// (scripts standalone via tsx, ex: src/db/seed.ts) e a env ainda não foi
// carregada.
if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: ".env.local" });
}

// A aplicação roda com uma role de banco restrita (app_runtime — ver
// drizzle/rls-runtime-role.sql), separada da role usada pra rodar migrações
// (DATABASE_URL). Isso é o que faz as políticas de Row-Level Security da
// migração 0003 realmente valerem: no Postgres, o dono da tabela e
// superusuários sempre ignoram RLS, então rodar a aplicação com a mesma
// conexão que criou as tabelas tornaria as políticas inúteis.
//
// Cai de volta pra DATABASE_URL quando APP_DATABASE_URL não está definida
// (ex: scripts administrativos como o seed, que precisam gravar categorias
// globais e por isso usam withServiceMode explicitamente).
const connectionString = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL/APP_DATABASE_URL não configurada. Defina em .env.local (dev) ou nas variáveis de ambiente de produção."
  );
}

// Reaproveita a conexão entre hot-reloads em dev para não esgotar o pool.
const client = global.__dbClient ?? postgres(connectionString, { max: 10, prepare: false });

if (process.env.NODE_ENV !== "production") {
  global.__dbClient = client;
}

const baseDb = drizzle(client, { schema });
type DrizzleDb = typeof baseDb;

// Contexto por requisição: dentro de withRLS()/withServiceMode(), todo
// código que usa `db` (inclusive indiretamente, via src/lib/queries/* e
// src/app/actions/*) passa a usar automaticamente uma conexão que já rodou
// `set_config('app.current_user_id', ...)` dentro de uma transação — sem
// precisar passar esse handle manualmente por cada função. Fora desses
// wrappers, `db` cai no cliente-base (sem contexto de usuário definido),
// que as políticas de RLS tratam como "sem permissão" por padrão.
const requestContext = new AsyncLocalStorage<DrizzleDb>();

export const db: DrizzleDb = new Proxy(baseDb, {
  get(target, prop) {
    const active = requestContext.getStore() ?? target;
    const value = Reflect.get(active as object, prop, active as object);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as DrizzleDb;

/**
 * Roda `fn` no contexto de RLS de um usuário autenticado: abre uma
 * transação, define app.current_user_id só para ela (SET LOCAL, via
 * set_config com is_local=true — não vaza pra próxima requisição que
 * reaproveitar a mesma conexão do pool) e faz todo uso de `db` dentro de
 * `fn` passar a rodar nessa transação. Use logo após verifySession().
 */
export async function withRLS<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    return requestContext.run(tx as unknown as DrizzleDb, fn);
  });
}

/**
 * Só para os poucos pontos que precisam localizar QUEM é o usuário antes de
 * saber sua identidade — login por e-mail, cadastro, verificação de sessão
 * pelo cookie, busca por telefone no webhook do WhatsApp — sempre depois de
 * outra credencial já ter sido conferida (senha com hash, id de sessão
 * imprevisível, segredo compartilhado do webhook). Ver
 * drizzle/migrations/0003_add_row_level_security.sql.
 */
export async function withServiceMode<T>(fn: () => Promise<T>): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.service_mode', 'true', true)`);
    return requestContext.run(tx as unknown as DrizzleDb, fn);
  });
}
