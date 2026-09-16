// Texto dos Termos de Uso / Política de Privacidade (LGPD) e a versão atual
// que todo mundo precisa ter aceitado para usar o app — ver
// src/lib/dal.ts#verifySession (gate) e drizzle/migrations/0005.
//
// Mudou o texto de forma relevante? Troque CURRENT_TERMS_VERSION (ex: para
// a data de hoje) — quem já aceitou uma versão anterior será mandado de
// novo para /aceitar-termos automaticamente, porque termsVersion salvo no
// banco vai deixar de bater com esta constante.
export const CURRENT_TERMS_VERSION = "2026-09-16";

export const TERMS_CHECKBOX_LABEL =
  "Li e aceito os Termos de Uso e a Política de Privacidade do App Financeiro. Entendo que meus dados de cadastro e os lançamentos financeiros que eu inserir são de acesso restrito — protegidos por controle de acesso no banco de dados, não compartilhados com terceiros e acessados pela equipe do App Financeiro apenas quando estritamente necessário para operar, corrigir ou dar suporte ao serviço.";

export const TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: "Quem trata seus dados",
    body: "O App Financeiro é operado por Fácil Web (Marcelo), que atua como controlador dos dados pessoais tratados nesta plataforma, nos termos da Lei nº 13.709/2018 (LGPD).",
  },
  {
    title: "Quais dados coletamos",
    body: "Dados de cadastro (nome, e-mail, senha) e os dados financeiros que você mesmo insere ao usar o app: lançamentos, categorias de gasto, cartões e parcelas, investimentos, contas fixas e, se você ativar, o número de WhatsApp vinculado à sua conta.",
  },
  {
    title: "Para que usamos",
    body: "Exclusivamente para fornecer as funcionalidades do app a você: registrar seus lançamentos, calcular fechamentos mensais, gerar gráficos e projeções, e permitir o lançamento via WhatsApp quando ativado. Não usamos seus dados financeiros para nenhuma outra finalidade, nem os vendemos ou compartilhamos com terceiros.",
  },
  {
    title: "Quem pode acessar",
    body: "Seus dados são protegidos por controle de acesso a nível de banco de dados (Row-Level Security), que impede que outros clientes do app — ou o próprio sistema, fora do seu login — vejam suas informações. A equipe do App Financeiro tem acesso técnico restrito à infraestrutura (necessário para operar, corrigir problemas e dar suporte), mas não acessa nem revisa seus dados de rotina, e nunca os compartilha com terceiros para fins comerciais.",
  },
  {
    title: "Por quanto tempo guardamos",
    body: "Enquanto sua conta estiver ativa. Se você pedir a exclusão da conta, seus dados são removidos, salvo o mínimo exigido por obrigação legal.",
  },
  {
    title: "Seus direitos (Art. 18 da LGPD)",
    body: "A qualquer momento, você pode pedir: confirmação de que tratamos seus dados, acesso aos dados, correção de dados incompletos ou desatualizados, anonimização/eliminação de dados desnecessários, portabilidade dos seus dados, informação sobre com quem compartilhamos (hoje: ninguém), e a revogação deste consentimento — o que pode implicar encerramento da sua conta, já que os dados são essenciais para o funcionamento do serviço.",
  },
  {
    title: "Como exercer seus direitos ou tirar dúvidas",
    body: "Fale com a gente pelo e-mail ou WhatsApp de suporte informado no app.",
  },
  {
    title: "Alterações",
    body: "Se este termo mudar de forma relevante, vamos pedir um novo aceite seu antes de você continuar usando o app.",
  },
];
