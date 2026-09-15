import * as z from "zod";

export const SignupFormSchema = z.object({
  name: z.string().trim().min(2, { message: "Nome precisa ter pelo menos 2 letras." }),
  email: z.string().trim().toLowerCase().email({ message: "Informe um e-mail válido." }),
  password: z
    .string()
    .min(8, { message: "A senha precisa ter pelo menos 8 caracteres." })
    .regex(/[a-zA-Z]/, { message: "A senha precisa ter pelo menos uma letra." })
    .regex(/[0-9]/, { message: "A senha precisa ter pelo menos um número." }),
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
      };
      message?: string;
    }
  | undefined;
