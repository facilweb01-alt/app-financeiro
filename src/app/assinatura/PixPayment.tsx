"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { choosePlan, payWithCard, refreshBillingStatus, saveCpf } from "@/app/actions/billing";
import { trackMeta } from "@/components/tracking/metaPixel";

// Parte interativa da tela de pagamento: copiar o Pix copia-e-cola, botão
// "Já paguei" e checagem automática (a cada 6s relê a página — o webhook do
// Asaas atualiza o banco; a cada 30s também pergunta direto ao Asaas, caso o
// webhook atrase). Quando o pagamento cai, avisa e leva para o app.

// "Começou a pagar" (clicou para copiar o Pix ou seguiu para o cartão): avisa
// a medição de anúncios, só de quem aceitou os cookies e só na 1ª mensalidade.
// Uma vez por navegador. Sem dado da pessoa: só o valor do plano.
export type PixelCheckout = { pixelId: string; value: number; currency: string } | null;

function trackCheckoutStart(pixel: PixelCheckout, method: "pix" | "cartao") {
  if (!pixel) return;
  try {
    trackMeta(pixel.pixelId, "InitiateCheckout", { value: pixel.value, currency: pixel.currency, content_name: method }, "checkout");
  } catch {
    // medição nunca pode atrapalhar o pagamento
  }
}

export function CopyPixButton({ payload, pixel = null }: { payload: string; pixel?: PixelCheckout }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        trackCheckoutStart(pixel, "pix");
        try {
          await navigator.clipboard.writeText(payload);
        } catch {
          // navegador sem permissão de clipboard: seleciona o texto para o usuário copiar
          const el = document.getElementById("pix-payload") as HTMLTextAreaElement | null;
          el?.select();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }}
      className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
    >
      {copied ? "Código copiado! Agora é só colar no app do seu banco" : "Copiar código Pix"}
    </button>
  );
}

type PixelPurchase = { pixelId: string; value: number; currency: string } | null;

export function PaymentWatcher({
  waiting,
  justPaidRedirect,
  pixel = null,
}: {
  waiting: boolean;
  justPaidRedirect: string;
  // Só vem preenchido enquanto a pessoa espera o 1º pagamento: quando ele
  // cai, a medição de anúncios conta a assinatura (se ela aceitou os cookies).
  pixel?: PixelPurchase;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const wasWaiting = useRef(waiting);
  const pixelWhileWaiting = useRef<PixelPurchase>(waiting ? pixel : null);
  const [paid, setPaid] = useState(false);

  // Detecta a transição "esperando pagamento" -> "pago".
  useEffect(() => {
    if (waiting && pixel) pixelWhileWaiting.current = pixel;
    if (wasWaiting.current && !waiting) {
      const px = pixelWhileWaiting.current;
      if (px) trackMeta(px.pixelId, "Purchase", { value: px.value, currency: px.currency }, "compra");
      setPaid(true);
      const t = setTimeout(() => router.push(justPaidRedirect), 2500);
      return () => clearTimeout(t);
    }
    wasWaiting.current = waiting;
  }, [waiting, router, justPaidRedirect, pixel]);

  useEffect(() => {
    if (!waiting) return;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      if (ticks % 5 === 0) {
        startTransition(async () => {
          await refreshBillingStatus();
          router.refresh();
        });
      } else {
        router.refresh();
      }
    }, 6000);
    return () => clearInterval(id);
  }, [waiting, router]);

  if (paid) {
    return (
      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-center text-sm font-semibold text-emerald-300">
        ✅ Pagamento confirmado! Liberando seu acesso...
      </div>
    );
  }

  if (!waiting) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const res = await refreshBillingStatus();
            router.refresh();
            if (res.waiting) {
              setMessage("Ainda não recebemos a confirmação. Se você acabou de pagar, aguarde alguns segundos.");
            }
          })
        }
        className="w-full rounded-xl border border-navy-700 px-4 py-2.5 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 disabled:opacity-60"
      >
        {pending ? "Verificando..." : "Já paguei — verificar agora"}
      </button>
      <p className="flex items-center gap-2 text-xs text-navy-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
        Aguardando o pagamento — esta tela se atualiza sozinha.
      </p>
      {message && <p className="text-center text-xs text-amber-300">{message}</p>}
    </div>
  );
}

/**
 * "Pagar com cartão de crédito", simplificado em 21/10/2026: uma tela só com
 * CPF (quando a conta ainda não tem), CEP e número. Rua e bairro vêm do CEP
 * (ViaCEP) e vão escondidos; só aparecem para digitar quando o CEP não traz
 * a rua (CEP geral de cidade) ou a busca falha. A Server Action grava o CPF,
 * grava o endereço no cliente do Asaas (exigência do Asaas para cobrar no
 * cartão), cria o Checkout e redireciona para a página segura do Asaas, onde
 * o cliente digita o cartão (os dados do cartão nunca passam pelo app).
 */
export function CardCheckoutButton({
  label,
  variant = "primary",
  defaultOpen = false,
  pixel = null,
  installments = null,
  askCpf = false,
}: {
  label: string;
  variant?: "primary" | "secondary";
  /** Já mostra o formulário (sem precisar clicar no botão antes). */
  defaultOpen?: boolean;
  /** Só na 1ª mensalidade: conta "começou a pagar" ao seguir para o cartão. */
  pixel?: PixelCheckout;
  /** Plano anual: o Checkout deixa pagar à vista ou em até N vezes. */
  installments?: number | null;
  /** A conta ainda não tem CPF: pede no mesmo formulário. */
  askCpf?: boolean;
}) {
  const [state, formAction, pending] = useActionState(payWithCard, { error: null });
  const [open, setOpen] = useState(defaultOpen);
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [number, setNumber] = useState("");
  const [street, setStreet] = useState("");
  const [district, setDistrict] = useState("");
  const [cityUf, setCityUf] = useState("");
  // "auto": rua e bairro vieram do CEP (campos escondidos); "manual": digitar.
  const [addrMode, setAddrMode] = useState<"idle" | "loading" | "auto" | "manual">("idle");
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  // Servidor reclamou de rua ou bairro (CEP não buscado): mostra os campos.
  const manual = addrMode === "manual" || Boolean(state.error && /rua|bairro/i.test(state.error));

  const btnClass =
    variant === "primary"
      ? "w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
      : "w-full rounded-xl border border-navy-600 px-4 py-2.5 text-sm font-medium text-navy-100 transition-colors hover:bg-navy-800 disabled:opacity-60";
  const inputClass =
    "w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2.5 text-sm text-navy-100 placeholder:text-navy-500 focus:border-blue-500 focus:outline-none";

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setAddrMode("loading");
    setCepMsg("Buscando endereço...");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) {
        setAddrMode("manual");
        setCepMsg("CEP não encontrado. Confira o CEP ou preencha a rua e o bairro.");
        return;
      }
      setStreet(data.logradouro ?? "");
      setDistrict(data.bairro ?? "");
      setCityUf(data.localidade ? `${data.localidade}${data.uf ? "/" + data.uf : ""}` : "");
      if (data.logradouro && data.bairro) {
        setAddrMode("auto");
        setCepMsg(null);
      } else {
        setAddrMode("manual");
        setCepMsg("Esse CEP não traz a rua. Preencha a rua e o bairro.");
      }
      numberRef.current?.focus();
    } catch {
      setAddrMode("manual");
      setCepMsg("Não consegui buscar o CEP. Preencha a rua e o bairro.");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnClass}>
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} onSubmit={() => trackCheckoutStart(pixel, "cartao")} className="flex flex-col gap-2.5" data-testid="card-form">
      <p className="text-xs text-navy-400" data-testid="card-steps">
        {askCpf ? "Só CPF, CEP e número. " : "Só o CEP e o número. "}
        Na tela seguinte, segura, do Asaas, você digita os dados do cartão.
        {installments ? ` Lá você escolhe pagar à vista ou em até ${installments}x.` : null}
      </p>
      {askCpf && (
        <div>
          <label htmlFor="card-cpf" className="mb-1 block text-xs text-navy-400">
            CPF do titular do cartão
          </label>
          <input
            id="card-cpf"
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            required
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            className={inputClass}
          />
        </div>
      )}
      <div className="grid grid-cols-[3fr_2fr] gap-2.5">
        <div>
          <label htmlFor="card-cep" className="mb-1 block text-xs text-navy-400">
            CEP
          </label>
          <input
            id="card-cep"
            name="postalCode"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            required
            value={cep}
            onChange={(e) => {
              setCep(e.target.value);
              const digits = e.target.value.replace(/\D/g, "");
              if (digits.length === 8) void lookupCep(e.target.value);
              else if (addrMode !== "manual") setAddrMode("idle");
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="card-number" className="mb-1 block text-xs text-navy-400">
            Número
          </label>
          <input
            id="card-number"
            name="addressNumber"
            ref={numberRef}
            required
            placeholder="123 ou S/N"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      {cepMsg && <p className="-mt-1 text-xs text-navy-400">{cepMsg}</p>}
      {addrMode === "auto" && !manual && (
        <p className="-mt-1 text-xs text-navy-300" data-testid="card-endereco">
          📍 {street}, {district}
          {cityUf ? ` · ${cityUf}` : ""}{" "}
          <button type="button" onClick={() => setAddrMode("manual")} className="text-blue-300 underline hover:text-blue-200">
            corrigir
          </button>
        </p>
      )}
      {manual ? (
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="card-address" className="mb-1 block text-xs text-navy-400">
              Rua
            </label>
            <input
              id="card-address"
              name="address"
              autoComplete="address-line1"
              required
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="card-province" className="mb-1 block text-xs text-navy-400">
              Bairro
            </label>
            <input
              id="card-province"
              name="province"
              required
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="address" value={street} />
          <input type="hidden" name="province" value={district} />
        </>
      )}
      <button type="submit" disabled={pending || addrMode === "loading"} className={btnClass}>
        {pending ? "Abrindo pagamento seguro..." : "Continuar para os dados do cartão"}
      </button>
      {state.error && <p className="text-center text-xs text-red-300">{state.error}</p>}
    </form>
  );
}

/**
 * CPF pedido na hora de pagar (o cadastro com teste grátis não pede). Depois
 * de gravado, a página recarrega e mostra o cartão e o Pix.
 */
export function CpfForm() {
  const [state, formAction, pending] = useActionState(saveCpf, { error: null });
  return (
    <form action={formAction} className="flex flex-col gap-2.5" data-testid="cpf-form">
      <label htmlFor="pay-cpf" className="text-xs text-navy-400">
        CPF
      </label>
      <input
        id="pay-cpf"
        name="cpf"
        inputMode="numeric"
        autoComplete="off"
        placeholder="000.000.000-00"
        required
        className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2.5 text-sm text-navy-100 placeholder:text-navy-500 focus:border-blue-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Continuar para o pagamento"}
      </button>
      {state.error && <p className="text-center text-xs text-red-300">{state.error}</p>}
    </form>
  );
}

/**
 * Escolha entre o plano mensal e o anual (15% de desconto), para quem ainda
 * não pagou. Trocar aqui refaz a cobrança Pix com o valor do plano escolhido.
 */
export function PlanChooser({
  current,
  monthlyLabel,
  yearlyLabel,
  yearlyDetail,
}: {
  current: "MONTHLY" | "YEARLY";
  monthlyLabel: string;
  yearlyLabel: string;
  yearlyDetail: string;
}) {
  const [state, formAction, pending] = useActionState(choosePlan, { error: null });
  const option = (plan: "MONTHLY" | "YEARLY", title: string, price: string, detail: string | null, badge: string | null) => {
    const on = current === plan;
    return (
      <button
        type="submit"
        name="plan"
        value={plan}
        disabled={pending || on}
        aria-pressed={on}
        data-testid={`plano-${plan === "YEARLY" ? "anual" : "mensal"}`}
        className={`flex w-full flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-default ${
          on ? "border-emerald-400 bg-emerald-500/10" : "border-navy-700 bg-navy-950/60 hover:border-navy-500"
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-navy-50">
            {on ? "● " : "○ "}
            {title}
          </span>
          {badge && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">{badge}</span>}
        </span>
        <span className="text-sm text-navy-200">{price}</span>
        {detail && <span className="text-xs text-navy-400">{detail}</span>}
      </button>
    );
  };
  return (
    <form action={formAction} className="glass-card flex flex-col gap-2.5 rounded-2xl p-5" data-testid="escolha-plano">
      <div className="font-semibold text-navy-50">Escolha o plano</div>
      {option("MONTHLY", "Mensal", monthlyLabel, "Sem fidelidade: cancela quando quiser.", null)}
      {option("YEARLY", "Anual", yearlyLabel, yearlyDetail, "Mais econômico")}
      {pending && <p className="text-center text-xs text-navy-400">Atualizando o plano...</p>}
      {state.error && <p className="text-center text-xs text-red-300">{state.error}</p>}
    </form>
  );
}
