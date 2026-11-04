import { isAsaasConfigured } from "@/lib/billing/asaas";
import { cardRequiredForNewSignups } from "@/lib/billing/core";
import { RegistrarForm } from "./RegistrarForm";

// Página de cadastro. O texto muda conforme a regra do momento: teste grátis
// sem cartão (padrão desde 04/11/2026, CADASTRO_EXIGE_CARTAO=0) ou com cartão.
export const dynamic = "force-dynamic";

export default function RegistrarPage() {
  return <RegistrarForm cardRequired={isAsaasConfigured() && cardRequiredForNewSignups()} />;
}
