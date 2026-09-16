// Schema do banco de dados (Postgres) usando Drizzle ORM.
// Este mesmo schema roda tanto no Postgres local de desenvolvimento
// quanto no Supabase (Postgres) em produção — só a DATABASE_URL muda.
//
// Convenções:
// - Valores monetários usam numeric(12,2) para evitar erro de arredondamento
//   de ponto flutuante em dinheiro.
// - Datas de vencimento/compra usam "date" (sem hora) pois o usuário informa
//   apenas o dia.
// - Toda tabela de domínio do usuário tem userId + índice, para múltiplos
//   usuários (multi-tenant simples, cada usuário só vê os próprios dados).

import {
    pgTable,
    text,
    timestamp,
    numeric,
    integer,
    boolean,
    date,
    uniqueIndex,
    index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { randomUUID } from "crypto";

const id = () =>
    text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

// ---------------------------------------------------------------------------
// Usuários (autenticação própria: e-mail + senha com hash bcrypt, sessão em
// banco — ver src/lib/session.ts e src/lib/dal.ts)
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
    id: id(),
    name: text("name"),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    // Renda mensal usada para calcular o % de gasto por categoria nos gráficos.
    monthlyIncome: numeric("monthly_income", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    // Número de WhatsApp vinculado (formato internacional, ex: "5583999998888"),
    // usado para o comando por WhatsApp identificar de qual usuário é a
    // mensagem (ver src/app/api/whatsapp/lancamento/route.ts). Vinculado pelo
    // próprio usuário logado no app — nunca por verificação externa.
    whatsappPhone: text("whatsapp_phone"),
    // --- Painel administrativo / SaaS pago (ver drizzle/migrations/0004) -----
    // role: quem pode acessar /admin. status: controla se a conta consegue
    // usar o app de verdade — contas novas nascem "pending" e ficam bloqueadas
    // (ver src/app/actions/auth.ts) até um admin aprovar manualmente em
    // /admin. Contas que já existiam antes desta coluna existir foram
    // "grandfathered" como active pela própria migração (ver comentário lá) —
    // só quem se cadastra a partir de agora entra pendente.
    role: text("role").notNull().default("user"), // 'user' | 'admin'
    status: text("status").notNull().default("pending"), // 'pending' | 'active' | 'suspended'
    subscriptionDueDate: date("subscription_due_date"), // próximo vencimento da mensalidade
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // --- Aceite dos Termos de Uso / Política de Privacidade (LGPD) ----------
    // termsAcceptedAt/termsVersion NULL = ainda não aceitou (conta antiga de
    // antes desta coluna existir, ou o termo mudou de versão desde o último
    // aceite). Nesse caso verifySession() (ver src/lib/dal.ts) manda a conta
    // para /aceitar-termos antes de liberar o resto do app — mesma ideia do
    // gate de aprovação (status 'pending'), mas para o consentimento. Guardar
    // a versão (não só um true/false) é o que permite provar qual texto a
    // pessoa realmente aceitou, se um dia for preciso (LGPD art. 8º, §2º: o
    // ônus da prova do consentimento é de quem trata o dado).
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: text("terms_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
}, (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
    whatsappPhoneUnique: uniqueIndex("users_whatsapp_phone_unique").on(t.whatsappPhone),
}));

// ---------------------------------------------------------------------------
// Sessões de login (database sessions). O cookie do navegador guarda só um
// JWT com o id desta sessão (assinado, ver src/lib/session.ts); os dados de
// verdade — a quem pertence e até quando vale — ficam aqui no banco, então
// dá pra revogar uma sessão (ex: "sair de todos os dispositivos") a qualquer
// momento apagando a linha.
// ---------------------------------------------------------------------------
export const sessions = pgTable("sessions", {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
}));

// ---------------------------------------------------------------------------
// Categorias (lazer, saúde, alimentação, compras pessoais, viagem, gasolina...)
// Ficam numa tabela (em vez de enum fixo) para o usuário poder criar novas.
// Categorias com userId = null são categorias padrão do sistema (globais).
// ---------------------------------------------------------------------------
export const categories = pgTable("categories", {
    id: id(),
    // slug estável usado internamente (ex: "lazer", "saude")
    key: text("key").notNull(),
    label: text("label").notNull(),
    color: text("color"), // usado nos gráficos
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }), // null = padrão do sistema
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
}, (t) => ({
    // uma categoria com a mesma key não pode se repetir para o mesmo dono
             // (dono = usuário específico, ou o "sistema" quando userId é null)
             keyPerOwnerUnique: uniqueIndex("categories_key_owner_unique").on(t.key, t.userId),
}));

// ---------------------------------------------------------------------------
// Lançamentos manuais (gastos do dia a dia, fora do cartão)
// ---------------------------------------------------------------------------
export const transactions = pgTable("transactions", {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purchaseDate: date("purchase_date").notNull(), // data da compra
    dueDate: date("due_date").notNull(), // data do vencimento
    description: text("description").notNull(), // qual produto / qual serviço
    categoryId: text("category_id").notNull().references(() => categories.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
}, (t) => ({
    userIdx: index("transactions_user_idx").on(t.userId),
    dueDateIdx: index("transactions_due_date_idx").on(t.dueDate),
}));

// ---------------------------------------------------------------------------
// Cartões de crédito
// ---------------------------------------------------------------------------
export const creditCards = pgTable("credit_cards", {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // ex: Nubank, Itaú
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
}, (t) => ({
    userIdx: index("credit_cards_user_idx").on(t.userId),
}));

// Compra feita no cartão — pode ter várias parcelas.
export const cardPurchases = pgTable("card_purchases", {
    id: id(),
    cardId: text("card_id").notNull().references(() => creditCards.id, { onDelete: "cascade" }),
    purchaseDate: date("purchase_date").notNull(),
    description: text("description").notNull(),
    categoryId: text("category_id").references(() => categories.id),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    installmentsTotal: integer("installments_total").notNull().default(1), // parcelas
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
}, (t) => ({
    cardIdx: index("card_purchases_card_idx").on(t.cardId),
}));

// Cada parcela de uma compra, gerada automaticamente na criação da compra
// (parcela 1..N, cada uma com seu próprio vencimento em um mês futuro).
// É essa tabela que permite ao "fechar o mês" identificar o que ainda falta
// pagar e projetar os valores nos próximos meses.
export const cardInstallments = pgTable("card_installments", {
    id: id(),
    cardPurchaseId: text("card_purchase_id").notNull().references(() => cardPurchases.id, { onDelete: "cascade" }),
    installmentNumber: integer("installment_number").notNull(), // 1..N
    dueDate: date("due_date").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paid: boolean("paid").notNull().default(false),
    statementId: text("statement_id").references(() => cardStatements.id, { onDelete: "set null" }),
}, (t) => ({
    purchaseInstallmentUnique: uniqueIndex("card_installments_purchase_number_unique").on(
          t.cardPurchaseId,
          t.installmentNumber
        ),
    dueDateIdx: index("card_installments_due_date_idx").on(t.dueDate),
}));

// Fechamento manual de fatura: usuário informa "de tal data até tal data".
export const cardStatements = pgTable("card_statements", {
    id: id(),
    cardId: text("card_id").notNull().references(() => creditCards.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    closingDate: date("closing_date").notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
}, (t) => ({
    cardPeriodUnique: uniqueIndex("card_statements_card_period_unique").on(
          t.cardId,
          t.periodStart,
          t.periodEnd
        ),
}));

// ---------------------------------------------------------------------------
// Investimentos
// ---------------------------------------------------------------------------
export const investments = pgTable("investments", {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    description: text("description").notNull(),
    type: text("type"), // ex: renda fixa, ações, cripto, tesouro...
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
}, (t) => ({
    userIdx: index("investments_user_idx").on(t.userId),
}));

// ---------------------------------------------------------------------------
// Contas fixas (descrição + valor, sempre pode acrescentar mais)
// ---------------------------------------------------------------------------
export const fixedAccounts = pgTable("fixed_accounts", {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
}, (t) => ({
    userIdx: index("fixed_accounts_user_idx").on(t.userId),
}));

// ---------------------------------------------------------------------------
// Fechamento mensal — snapshot do mês fechado (totais por categoria, % sobre
// a renda, e a projeção de parcelas/valores a vencer nos próximos meses).
// Guardamos um snapshot em JSON para o histórico de um mês já fechado não
// mudar retroativamente se a renda ou lançamentos futuros mudarem.
// ---------------------------------------------------------------------------
export const monthClosings = pgTable("month_closings", {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(), // formato "YYYY-MM"
    income: numeric("income", { precision: 12, scale: 2 }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
    snapshot: text("snapshot").notNull(), // JSON.stringify(MonthClosingSnapshot)
    notes: text("notes"),
}, (t) => ({
    userMonthUnique: uniqueIndex("month_closings_user_month_unique").on(t.userId, t.yearMonth),
}));

// ---------------------------------------------------------------------------
// Relations (para queries aninhadas com drizzle "query" API)
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
    transactions: many(transactions),
    creditCards: many(creditCards),
    investments: many(investments),
    fixedAccounts: many(fixedAccounts),
    monthClosings: many(monthClosings),
    categories: many(categories),
    sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
    transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
    user: one(users, { fields: [transactions.userId], references: [users.id] }),
    category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
}));

export const creditCardsRelations = relations(creditCards, ({ one, many }) => ({
    user: one(users, { fields: [creditCards.userId], references: [users.id] }),
    purchases: many(cardPurchases),
    statements: many(cardStatements),
}));

export const cardPurchasesRelations = relations(cardPurchases, ({ one, many }) => ({
    card: one(creditCards, { fields: [cardPurchases.cardId], references: [creditCards.id] }),
    category: one(categories, { fields: [cardPurchases.categoryId], references: [categories.id] }),
    installments: many(cardInstallments),
}));

export const cardInstallmentsRelations = relations(cardInstallments, ({ one }) => ({
    purchase: one(cardPurchases, { fields: [cardInstallments.cardPurchaseId], references: [cardPurchases.id] }),
    statement: one(cardStatements, { fields: [cardInstallments.statementId], references: [cardStatements.id] }),
}));

export const cardStatementsRelations = relations(cardStatements, ({ one, many }) => ({
    card: one(creditCards, { fields: [cardStatements.cardId], references: [creditCards.id] }),
    installments: many(cardInstallments),
}));

export const investmentsRelations = relations(investments, ({ one }) => ({
    user: one(users, { fields: [investments.userId], references: [users.id] }),
}));

export const fixedAccountsRelations = relations(fixedAccounts, ({ one }) => ({
    user: one(users, { fields: [fixedAccounts.userId], references: [users.id] }),
}));

export const monthClosingsRelations = relations(monthClosings, ({ one }) => ({
    user: one(users, { fields: [monthClosings.userId], references: [users.id] }),
}));
