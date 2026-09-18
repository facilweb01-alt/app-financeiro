"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { ValuesVisibilityToggle } from "@/components/ValuesVisibilityToggle";

const LINKS = [
  { href: "/dashboard", label: "Painel", icon: "📊" },
  { href: "/lancamentos", label: "Lançamentos", icon: "🧾" },
  { href: "/cartoes", label: "Cartões", icon: "💳" },
  { href: "/investimentos", label: "Investimentos", icon: "📈" },
  { href: "/contas-fixas", label: "Contas fixas", icon: "🏠" },
  { href: "/fechamento", label: "Fechamento", icon: "🗓️" },
];

// O painel administrativo NÃO mora mais neste app (ver app-financeiro-admin
// — deploy separado, banco separado/role separada) — de propósito, para
// reduzir o que um eventual problema neste app conseguiria alcançar. Não
// há mais link nem rota /admin aqui.

export function AppNav() {
  const pathname = usePathname();
  const links = LINKS;

  return (
    <>
      {/* Navegação lateral — telas maiores (computador) */}
      <nav className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-slate-200 md:bg-white md:p-4 md:gap-1 dark:md:border-slate-800 dark:md:bg-slate-950">
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              AF
            </span>
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
              App Financeiro
            </span>
          </div>
          <ValuesVisibilityToggle />
        </div>
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                  : "text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-900"
              }`}
            >
              <span aria-hidden>{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
        <form action={logout} className="mt-auto">
          <button
            type="submit"
            className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
          >
            Sair
          </button>
        </form>
      </nav>

      {/* Navegação inferior — celular */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-blue-700 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <span
                className={`flex h-7 w-10 items-center justify-center rounded-full text-base transition-colors ${
                  active ? "bg-blue-100 dark:bg-blue-900/40" : ""
                }`}
                aria-hidden
              >
                {link.icon}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Botão de ocultar valores — só no celular (no desktop já fica no topo da barra lateral) */}
      <div className="fixed right-3 top-3 z-10 md:hidden">
        <div className="rounded-full bg-white/95 shadow-sm backdrop-blur dark:bg-slate-950/95">
          <ValuesVisibilityToggle />
        </div>
      </div>
    </>
  );
}
