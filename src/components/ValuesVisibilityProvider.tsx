"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "app-financeiro:valores-visiveis";

type ValuesVisibilityContextValue = {
  visible: boolean;
  toggle: () => void;
};

const ValuesVisibilityContext = createContext<ValuesVisibilityContextValue | null>(null);

// Provider de segurança: controla se valores em R$ aparecem normalmente ou
// mascarados (tipo "R$ ••••"), do jeito que apps de banco costumam ter —
// útil pra quem abre o app perto de outras pessoas. Preferência fica salva
// no localStorage do navegador (só nesse aparelho, não sincroniza entre
// dispositivos nem é lida pelo servidor — não é dado sensível, é só uma
// conveniência de UI).
export function ValuesVisibilityProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "hidden") setVisible(false);
    } catch {
      // localStorage pode falhar (modo privado, storage bloqueado) — segue com o padrão (visível).
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, visible ? "visible" : "hidden");
    } catch {
      // best-effort — não impede o toggle de funcionar na sessão atual.
    }
  }, [visible, hydrated]);

  return (
    <ValuesVisibilityContext.Provider value={{ visible, toggle: () => setVisible((v) => !v) }}>
      {children}
    </ValuesVisibilityContext.Provider>
  );
}

export function useValuesVisibility() {
  const ctx = useContext(ValuesVisibilityContext);
  if (!ctx) {
    // Fora do provider (ex: página pública) — assume sempre visível, sem quebrar.
    return { visible: true, toggle: () => {} };
  }
  return ctx;
}
