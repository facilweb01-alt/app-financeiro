"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshBillingStatus } from "@/app/actions/billing";

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
