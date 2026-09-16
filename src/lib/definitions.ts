import * as z from "zod";

export const SignupFormSchema = z.object({
    name: z.string().trim().min(2, { message: "Nome precisa ter pelo menos 2 letras." }),
    email: z.string().trim().toLowerCase().email({ message: "Informe um e-mail válido." }),
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
                      password?: string[];
                      terms?: string[];
            };
            message?: string;
    }
  | undefined;
