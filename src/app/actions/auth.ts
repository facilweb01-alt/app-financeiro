"use server";

import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { db, withRLS, withServiceMode } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, deleteSession } from "@/lib/session";
import { getRawSession } from "@/lib/dal";
import { LoginFormSchema, SignupFormSchema, type AuthFormState } from "@/lib/definitions";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { isAsaasConfigured } from "@/lib/billing/asaas";
import { cardRequiredForNewSignups, todayInSaoPaulo, trialEndDate, whatsappPhoneVariants } from "@/lib/billing/core";
import { processPendingWelcomesSafely } from "@/lib/whatsapp/welcome";
import { normalizeSignupSource } from "@/lib/business/signupSource";

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

  // Com a cobrança automática (Asaas) configurada, a conta nasce com 7 dias
  // de teste grátis: usa o app sem pagar até trial_ends_at e, pagando, vira
  // 'active' (ver src/lib/billing/core.ts, TRIAL_DAYS). Sem ela, segue o
  // fluxo antigo: aguarda aprovação manual no painel admin.
  const billingEnabled = isAsaasConfigured();
  // Teste grátis só com cartão (decisão do Marcelo, 20/10/2026): a conta nasce
  // sem acesso e sem teste contando; o teste de 7 dias começa quando o cartão
  // é cadastrado no Checkout do Asaas (ver billing/service.ts#startCardCheckout)
  // e a 1ª mensalidade é cobrada sozinha no fim dele. Sem Pix. A variável
  // CADASTRO_EXIGE_CARTAO=0 volta ao fluxo anterior (teste sem cartão).
  const cardRequired = billingEnabled && cardRequiredForNewSignups();
  const trialEndsAt = billingEnabled && !cardRequired ? trialEndDate(todayInSaoPaulo()) : null;

  const passwordHash = await bcrypt.hash(password, 10);

  // De qual anúncio/link a pessoa veio (campo escondido do formulário, que a
  // página de cadastro preenche com os "utm_*" do endereço). Só os nomes da
  // origem, campanha e anúncio; valor desconhecido ou estranho vira nulo.
  const signupSource = normalizeSignupSource(String(formData.get("source") ?? ""));

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
                                                          signupSource,
                                                          trialEndsAt,
                                                          cardRequired,
                                                          // Pede as boas-vindas pelo WhatsApp (manual + aviso de que o
                                                          // teste está liberado); quem envia é processPendingWelcomes.
                                                          ...(trialEndsAt ? { welcomeRequestedAt: new Date() } : {}),
                                                          termsAcceptedAt: new Date(),
                                                          termsVersion: CURRENT_TERMS_VERSION,
                                                })
                                                .returning({ id: users.id })
                                            );

  if (!created) {
        return { message: "Não foi possível criar a conta. Tente novamente." };
  }

  await createSession(created.id);
  // Marca "acabou de se cadastrar" para a medição de anúncios contar o
  // cadastro uma única vez na tela seguinte (ver components/tracking). É só
  // um sinal, sem nenhum dado da pessoa, e dura 15 minutos.
  (await cookies()).set("contay_reg", "1", { maxAge: 900, path: "/", sameSite: "lax", httpOnly: false });
  if (trialEndsAt) after(processPendingWelcomesSafely);
  redirect(cardRequired ? "/assinatura" : billingEnabled ? "/bem-vindo" : "/dashboard");
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
