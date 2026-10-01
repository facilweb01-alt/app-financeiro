"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { payWithCard, refreshBillingStatus } from "@/app/actions/billing";

// Parte interativa da tela de pagamento: copiar o Pix copia-e-cola, botão
// "Já paguei" e checagem automática (a cada 6s relê a página — o webhook do
// Asaas atualiza o banco; a cada 30s também pergunta direto ao Asaas, caso o
// webhook atrase). Quando o pagamento cai, avisa e leva para o app.

export function CopyPixButton({ payload }: { payload: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
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

export function PaymentWatcher({ waiting, justPaidRedirect }: { waiting: boolean; justPaidRedirect: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const wasWaiting = useRef(waiting);
  const [paid, setPaid] = useState(false);

  // Detecta a transição "esperando pagamento" -> "pago".
  useEffect(() => {
    if (wasWaiting.current && !waiting) {
      setPaid(true);
      const t = setTimeout(() => router.push(justPaidRedirect), 2500);
      return () => clearTimeout(t);
    }
    wasWaiting.current = waiting;
  }, [waiting, router, justPaidRedirect]);

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
 * "Pagar com cartão de crédito" em duas etapas: 1) o cliente informa o
 * endereço de cobrança (o Asaas exige endereço no cliente para cobrar no
 * cartão; o CEP preenche rua e bairro pelo ViaCEP); 2) a Server Action grava o
 * endereço no cliente do Asaas, cria o Checkout e redireciona para a página
 * segura do Asaas, onde o cliente digita o cartão (os dados do cartão nunca
 * passam pelo app).
 */
export function CardCheckoutButton({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const [state, formAction, pending] = useActionState(payWithCard, { error: null });
  const [open, setOpen] = useState(false);
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [district, setDistrict] = useState("");
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  const btnClass =
    variant === "primary"
      ? "w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
      : "w-full rounded-xl border border-navy-600 px-4 py-2.5 text-sm font-medium text-navy-100 transition-colors hover:bg-navy-800 disabled:opacity-60";
  const inputClass =
    "w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2.5 text-sm text-navy-100 placeholder:text-navy-500 focus:border-blue-500 focus:outline-none";

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepMsg("Buscando endereço...");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string };
      if (data.erro) {
        setCepMsg("CEP não encontrado — preencha a rua e o bairro.");
        return;
      }
      if (data.logradouro) setStreet(data.logradouro);
      if (data.bairro) setDistrict(data.bairro);
      setCepMsg(null);
      numberRef.current?.focus();
    } catch {
      setCepMsg("Não consegui buscar o CEP — preencha a rua e o bairro.");
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
    <form action={formAction} className="flex flex-col gap-2.5">
      <div className="text-sm font-medium text-navy-100">Endereço de cobrança do cartão</div>
      <p className="-mt-1 text-xs text-navy-400">O Asaas pede o endereço para cobrar no cartão. Ele não fica guardado no Contay.</p>
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
            if (e.target.value.replace(/\D/g, "").length === 8) void lookupCep(e.target.value);
          }}
          className={inputClass}
        />
        {cepMsg && <p className="mt-1 text-xs text-navy-400">{cepMsg}</p>}
      </div>
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
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="card-number" className="mb-1 block text-xs text-navy-400">
            Número
          </label>
          <input id="card-number" name="addressNumber" ref={numberRef} required placeholder="123 ou S/N" className={inputClass} />
        </div>
        <div>
          <label htmlFor="card-complement" className="mb-1 block text-xs text-navy-400">
            Complemento
          </label>
          <input id="card-complement" name="complement" autoComplete="address-line2" placeholder="Opcional" className={inputClass} />
        </div>
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
      <button type="submit" disabled={pending} className={btnClass}>
        {pending ? "Abrindo pagamento seguro..." : "Continuar para o pagamento seguro"}
      </button>
      {state.error && <p className="text-center text-xs text-red-300">{state.error}</p>}
    </form>
  );
}
