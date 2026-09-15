"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const LINKS = [
  { href: "/dashboard", label: "Painel", icon: "📊" },
  { href: "/lancamentos", label: "Lançamentos", icon: "🧾" },
  { href: "/cartoes", label: "Cartões", icon: "💳" },
  { href: "/investimentos", label: "Investimentos", icon: "📈" },
  { href: "/contas-fixas", label: "Contas fixas", icon: "🏠" },
  { href: "/fechamento", label: "Fechamento", icon: "🗓️" },
];

const ADMIN_LINK = { href: "/admin", label: "Admin", icon: "🛠️" };

export function AppNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, ADMIN_LINK] : LINKS;

  return (
    <>
      {/* Navegação lateral — telas maiores (computador) */}
      <nav className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-slate-200 md:bg-white md:p-4 md:gap-1 dark:md:border-slate-800 dark:md:bg-slate-950">
        <div className="mb-4 px-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          App Financeiro
        </div>
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
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
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
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
                active ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <span className="text-base" aria-hidden>
                {link.icon}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
