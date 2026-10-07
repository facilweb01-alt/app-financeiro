// Tipo de retorno padrão para Server Actions usadas com useActionState em
// formulários simples de criar/editar (sem múltiplos campos de erro).
// `notice` é um aviso opcional mostrado junto do sucesso (ex.: "entrou
// direto na fatura já fechada").
export type SimpleFormState = { ok: true; notice?: string } | { ok: false; error: string } | undefined;
