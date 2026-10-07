"use client";

import type { ReactNode } from "react";

/**
 * Botão de enviar que pede confirmação antes — para as ações que apagam
 * coisas de vez (excluir cartão, compra, lançamento, fechamento). Um toque
 * sem querer no celular apagava, por exemplo, um cartão com todas as
 * compras.
 */
export function ConfirmSubmitButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
