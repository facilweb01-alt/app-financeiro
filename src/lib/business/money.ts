// Utilidades para trabalhar com dinheiro sem erro de arredondamento.
// Internamente tudo é feito em centavos (inteiros); só convertemos para
// reais (número decimal) na entrada/saída.

export function toCents(amountInReais: number): number {
  return Math.round(amountInReais * 100);
}

export function fromCents(amountInCents: number): number {
  return Math.round(amountInCents) / 100;
}

/**
 * Divide um valor total (em centavos) em N parcelas inteiras que somam
 * exatamente o total, distribuindo os centavos restantes entre as
 * primeiras parcelas (é assim que bancos brasileiros costumam fazer:
 * a diferença de arredondamento fica concentrada, nunca é perdida).
 */
export function splitCentsInInstallments(totalCents: number, installments: number): number[] {
  if (installments <= 0) {
    throw new Error("Número de parcelas precisa ser maior que zero");
  }
  const base = Math.floor(totalCents / installments);
  const remainder = totalCents - base * installments;
  const result: number[] = [];
  for (let i = 0; i < installments; i++) {
    result.push(base + (i < remainder ? 1 : 0));
  }
  return result;
}
