import * as z from "zod";
import { isValidCpf, normalizeSignupPhone, onlyDigits } from "@/lib/billing/core";

export const SignupFormSchema = z.object({
    name: z.string().trim().min(2, { message: "Nome precisa ter pelo menos 2 letras." }),
    email: z.string().trim().toLowerCase().email({ message: "Informe um e-mail válido." }),
    // WhatsApp: já fica vinculado à conta (é por ele que o lançamento via
    // WhatsApp identifica o cliente) — ver src/lib/billing/core.ts#normalizeSignupPhone.
    whatsappPhone: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const normalized = normalizeSignupPhone(v);
        if (!normalized) {
          ctx.addIssue({ code: "custom", message: "Informe o WhatsApp com DDD, ex.: (83) 99999-8888." });
          return z.NEVER;
        }
        return normalized;
      }),
    // CPF: exigido pelo Asaas para emitir a cobrança Pix.
    cpf: z
      .string()
      .trim()
      .refine(isValidCpf, { message: "CPF inválido. Confira os números." })
      .transform(onlyDigits),
    password: z
      .string()
      .min(8, { message: "A senha precisa ter pelo menos 8 caracteres." })
      .regex(/[a-zA-Z]/, { message: "A senha precisa ter pelo menos uma letra." })
      .regex(/[0-9]/, { message: "A senha precisa ter pelo menos um número." }),
    // Checkbox obrigatório dos Termos de Uso / Política de Privacidade (LGPD)
    // — vem do form como a string "on" quando marcado, e undefined quando não
    // marcado (é assim que um <input type="checkbox"> normal serializa em
    // FormData). z.literal("on") já rejeita "não marcado" com a mensagem
    // abaixo, sem precisar de .refine().
    terms: z.literal("on", { message: "É preciso aceitar os Termos de Uso e a Política de Privacidade para criar a conta." }),
});

export const LoginFormSchema = z.object({
    email: z.string().trim().toLowerCase().email({ message: "Informe um e-mail válido." }),
    password: z.string().min(1, { message: "Informe a senha." }),
});

export type AuthFormState =
    | {
            errors?: {
                      name?: string[];
                      email?: string[];
                      whatsappPhone?: string[];
                      cpf?: string[];
                      password?: string[];
                      terms?: string[];
            };
            message?: string;
    }
  | undefined;
