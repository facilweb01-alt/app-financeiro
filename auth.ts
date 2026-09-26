"use server";

import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, withRLS, withServiceMode } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, deleteSession } from "@/lib/session";
import { getRawSession } from "@/lib/dal";
import { LoginFormSchema, SignupFormSchema, type AuthFormState } from "@/lib/definitions";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { isAsaasConfigured } from "@/lib/billing/asaas";
import { whatsappPhoneVariants } from "@/lib/billing/core";

export async function signup(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
    const validated = SignupFormSchema.safeParse({
          name: formData.get("name"),
          email: formData.get("email"),
          whatsappPhone: formData.get("whatsappPhone") ?? "",
          cpf: formData.get("cpf") ?? "",
          password: formData.get("password"),
          terms: formData.get("terms"),
    });

  if (!validated.success) {
        return { errors: validated.error.flatten().fieldErrors };
  }

  const { name, email, password, whatsappPhone, cpf } = validated.data;

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

  // O mesmo WhatsApp não pode ficar em duas contas (é ele que identifica o
  // dono de cada lançamento enviado por WhatsApp).
  const phoneTaken = await withServiceMode(() =>
        db.select({ id: users.id }).from(users).where(inArray(users.whatsappPhone, whatsappPhoneVariants(whatsappPhone))).limit(1)
  );
  if (phoneTaken[0]) {
        return { errors: { whatsappPhone: ["Esse WhatsApp já está vinculado a outra conta."] } };
  }

  // Com a cobrança automática (Asaas) configurada, a conta nasce aguardando
  // o primeiro Pix e é liberada sozinha quando ele é pago (ver
  // src/lib/billing/). Sem ela, segue o fluxo antigo: aguarda aprovação
  // manual no painel admin.
  const billingEnabled = isAsaasConfigured();

  const passwordHash = await bcrypt.hash(password, 10);

  // Aceite dos termos gravado no mesmo insert (data/hora + versão do texto
  // aceito, não só um booleano) — ver src/lib/terms.ts.
  const [created] = await withServiceMode(() =>
        db
                                                .insert(users)
                                                .values({
                                                          name,
                                                          email,
                                                          passwordHash,
                                                          whatsappPhone,
                                                          cpf,
                                                          billingEnabled,
                                                          termsAcceptedAt: new Date(),
                                                          termsVersion: CURRENT_TERMS_VERSION,
                                                })
                                                .returning({ id: users.id })
                                            );

  if (!created) {
        return { message: "Não foi possível criar a conta. Tente novamente." };
  }

  await createSession(created.id);
    redirect(billingEnabled ? "/assinatura" : "/dashboard");
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

/**
 * Aceite retroativo dos Termos de Uso / Política de Privacidade — para
 * quem já tinha conta antes desta coluna existir, ou cujo aceite ficou
 * numa versão antiga do texto (ver src/lib/dal.ts#verifySession, que manda
 * pra /aceitar-termos nesses casos). Usa getRawSession() (não
 * verifySession()) de propósito, mesma razão de /conta-pendente: evitar
 * loop de redirect.
 */
export async function acceptTerms(formData: FormData) {
    const session = await getRawSession();
    if (!session) {
          redirect("/login");
    }
    if (formData.get("terms") !== "on") {
          // Formulário só tem esse campo — sem marcar, não há o que processar;
      // volta pra mesma tela (o form em si já exige o checkbox no navegador).
      redirect("/aceitar-termos");
    }

  await withRLS(session.userId, () =>
        db
                      .update(users)
                      .set({ termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION })
                      .where(eq(users.id, session.userId))
                  );

  redirect("/dashboard");
}
