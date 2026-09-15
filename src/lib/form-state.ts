// Tipo de retorno padrão para Server Actions usadas com useActionState em
// formulários simples de criar/editar (sem múltiplos campos de erro).
export type SimpleFormState = { ok: true } | { ok: false; error: string } | undefined;
