"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, withServiceMode } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, deleteSession } from "@/lib/session";
import { LoginFormSchema, SignupFormSchema, type AuthFormState } from "@/lib/definitions";

export async function signup(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validated = SignupFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { name, email, password } = validated.data;

  // Ainda não existe um usuário logado (é literalmente o que este passo
  // cria) — busca de e-mail duplicado e criação da conta rodam em modo
  // serviço; o próprio índice único de e-mail no banco garante a
  // consistência mesmo sob concorrência.
  const existing = await withServiceMode(() =>
    db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  );
  if (existing[0]) {
    return { errors: { email: ["Já existe uma conta com esse e-mail."] } };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [created] = await withServiceMode(() =>
    db.insert(users).values({ name, email, passwordHash }).returning({ id: users.id })
  );

  if (!created) {
    return { message: "Não foi possível criar a conta. Tente novamente." };
  }

  await createSession(created.id);
  redirect("/dashboard");
}

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validated = LoginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, password } = validated.data;

  // Ainda não sabemos quem está tentando entrar — é justamente o que esta
  // busca por e-mail descobre — então roda em modo serviço; a senha com
  // hash conferida logo abaixo é quem realmente autoriza o acesso.
  const [user] = await withServiceMode(() =>
    db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
  );

  // Mensagem genérica de propósito (não revela se o e-mail existe ou não).
  const invalidCredentialsMessage = "E-mail ou senha incorretos.";

  if (!user) {
    return { message: invalidCredentialsMessage };
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return { message: invalidCredentialsMessage };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
