// Lógica pura por trás do resumo didático do painel (o card "hero" do
// dashboard). Fica separada em arquivo próprio pra poder ser testada sem
// precisar montar o resto do snapshot de fechamento — o comportamento aqui
// é justamente o que resolve a reclamação do Marcelo de que o percentual
// "38.266,67%" ficava difícil de entender.
//
// Mantém exatamente as mesmas faixas/cores/rótulos que já existiam no anel
// de progresso (CircularProgress) antes desta mudança: <70% verde "Sob
// controle", 70-99% âmbar "Atenção", >=100% vermelho "Renda estourada" —
// só a apresentação muda, nenhum limiar de negócio muda.

export type SpendingStatusLevel = "sem-renda" | "controle" | "atencao" | "estourado";

export type SpendingStatus = {
  level: SpendingStatusLevel;
  label: string;
  color: string;
  badgeClass: string;
  // Percentual já limitado a 0-100 — é o que a barra/medidor usa como
  // largura de preenchimento, pra nunca "dar a volta" visualmente mesmo
  // quando o percentual real passa de 1000%.
  meterPercent: number;
  // Quando o percentual real é extremo (>= 1000%, geralmente sintoma de uma
  // renda cadastrada muito baixa/desatualizada), em vez de mostrar um número
  // gigante sem sentido, o painel mostra um múltiplo arredondado da renda
  // ("~12x a renda").
  isExtreme: boolean;
  multiplier: number | null;
};

const EXTREME_THRESHOLD = 1000;

export function computeSpendingStatus(percent: number | null): SpendingStatus {
  if (percent === null) {
    return {
      level: "sem-renda",
      label: "Defina sua renda",
      color: "#94a3b8",
      badgeClass: "bg-navy-800 text-navy-400",
      meterPercent: 0,
      isExtreme: false,
      multiplier: null,
    };
  }

  const meterPercent = Math.max(0, Math.min(percent, 100));
  const isExtreme = percent >= EXTREME_THRESHOLD;
  const multiplier = isExtreme ? Math.round(percent / 100) : null;

  if (percent < 70) {
    return {
      level: "controle",
      label: "Sob controle",
      color: "#22c55e",
      badgeClass: "bg-emerald-950/40 text-emerald-400",
      meterPercent,
      isExtreme,
      multiplier,
    };
  }
  if (percent < 100) {
    return {
      level: "atencao",
      label: "Atenção",
      color: "#f59e0b",
      badgeClass: "bg-amber-950/40 text-amber-400",
      meterPercent,
      isExtreme,
      multiplier,
    };
  }
  return {
    level: "estourado",
    label: "Renda estourada",
    color: "#ef4444",
    badgeClass: "bg-red-950/40 text-red-400",
    meterPercent,
    isExtreme,
    multiplier,
  };
}

/** Frase curta em português simples explicando o status — usada abaixo do medidor. */
export function spendingStatusSentence(status: SpendingStatus): string {
  if (status.level === "sem-renda") {
    return "Cadastre sua renda mensal em Fechamento para ver o quanto isso representa.";
  }
  if (status.isExtreme) {
    return "Isso é muito mais do que a renda informada — geralmente é sinal de um valor de renda desatualizado. Vale conferir em Fechamento → Renda mensal.";
  }
  if (status.level === "controle") {
    return "Seus gastos e contas fixas estão dentro do que você ganha esse mês.";
  }
  if (status.level === "atencao") {
    return "Você está perto do limite da sua renda esse mês — vale ficar de olho.";
  }
  return "Isso é mais do que você ganha esse mês.";
}
