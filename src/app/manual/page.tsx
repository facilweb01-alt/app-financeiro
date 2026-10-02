import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MANUAL_SECTIONS, MANUAL_SUBTITLE, MANUAL_TITLE, MANUAL_UPDATED } from "@/lib/manual";
import { WHATSAPP_BOT_DISPLAY } from "@/lib/whatsappBot";

// Manual do usuário — página pública (o link vai na mensagem de boas-vindas
// do WhatsApp, e o cliente pode abrir antes de fazer login). O conteúdo vem
// de src/lib/manual.ts, a mesma fonte do PDF.
export const metadata: Metadata = {
  title: "Manual do Contay",
  description: "Como usar o Contay: lançamentos pelo WhatsApp, cartões, contas fixas, investimentos e fechamento do mês.",
};

export default function ManualPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8 md:py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" aria-label="Contay, início">
          <Logo size={34} />
        </Link>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/manual/pdf"
            className="rounded-xl border border-navy-600 px-4 py-2 text-sm font-semibold text-navy-100 hover:bg-navy-800"
          >
            Baixar em PDF
          </a>
          <Link
            href="/dashboard"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Abrir o app
          </Link>
        </div>
      </header>

      <div>
        <h1 className="text-3xl font-bold text-navy-50">{MANUAL_TITLE}</h1>
        <p className="mt-1 text-navy-300">{MANUAL_SUBTITLE}</p>
        <p className="mt-3 rounded-xl border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-navy-100">
          WhatsApp do Contay, para lançar gastos e tirar dúvidas: <strong>{WHATSAPP_BOT_DISPLAY}</strong>. Salve este
          número na sua agenda.
        </p>
      </div>

      <nav aria-label="Seções do manual" className="rounded-2xl border border-navy-800 bg-navy-900 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Neste manual</div>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {MANUAL_SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-blue-400 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {MANUAL_SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-6 rounded-2xl border border-navy-800 bg-navy-900 p-5">
          <h2 className="text-lg font-semibold text-navy-50">{s.title}</h2>
          <p className="mt-1 text-sm text-navy-300">{s.intro}</p>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-navy-200">
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {s.tip && (
            <p className="mt-3 rounded-xl bg-navy-800/70 p-3 text-sm text-navy-200">
              <strong className="text-navy-50">Dica:</strong> {s.tip}
            </p>
          )}
        </section>
      ))}

      <p className="pb-6 text-xs text-navy-500">Manual atualizado em {MANUAL_UPDATED}.</p>
    </div>
  );
}
