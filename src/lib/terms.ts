// Texto dos Termos de Uso / Política de Privacidade (LGPD) e a versão atual
// que todo mundo precisa ter aceitado para usar o app — ver
// src/lib/dal.ts#verifySession (gate) e drizzle/migrations/0005.
//
// Mudou o texto de forma relevante? Troque CURRENT_TERMS_VERSION (ex: para
// a data de hoje) — quem já aceitou uma versão anterior será mandado de
// novo para /aceitar-termos automaticamente, porque termsVersion salvo no
// banco vai deixar de bater com esta constante.
export const CURRENT_TERMS_VERSION = "2026-10-12.1";

export const TERMS_CHECKBOX_LABEL =
  "Li e aceito os Termos de Uso e a Política de Privacidade do Contay. Entendo que meus dados de cadastro e os lançamentos financeiros que eu inserir são de acesso restrito — protegidos por controle de acesso no banco de dados, não são vendidos nem repassados a anunciantes, passam apenas pelos serviços contratados para o Contay funcionar (cobrança pelo Asaas, WhatsApp, inteligência artificial que lê as mensagens e hospedagem), descritos nos Termos, e são acessados pela equipe do Contay apenas quando estritamente necessário para operar, corrigir ou dar suporte ao serviço. Aceito receber mensagens do Contay no WhatsApp que informei, e posso parar as ofertas respondendo SAIR.";

export const TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: "Quem trata seus dados",
    body: "O Contay (antes chamado App Financeiro) é operado por Fácil Web (Marcelo), que atua como controlador dos dados pessoais tratados nesta plataforma, nos termos da Lei nº 13.709/2018 (LGPD).",
  },
  {
    title: "Quais dados coletamos",
    body: "Dados de cadastro (nome, e-mail, senha e número de WhatsApp; o CPF é pedido só quando você vai assinar, na tela de pagamento) e os dados financeiros que você mesmo insere ao usar o app: lançamentos, categorias de gasto, cartões e parcelas, investimentos, contas fixas e o número de WhatsApp vinculado à sua conta. Também guardamos o histórico das mensalidades (vencimento, valor e se foi paga) e, quando você chega ao cadastro por um anúncio nosso, o nome da origem, da campanha e do anúncio que te trouxe (para sabermos quais anúncios funcionam; não guardamos identificador de clique nem nada do seu perfil nas redes sociais). Se você usar o WhatsApp do Contay, tratamos ainda as mensagens que você envia para o nosso número (texto, áudio e imagem) e o número de onde elas vêm.",
  },
  {
    title: "Para que usamos",
    body: "Exclusivamente para fornecer as funcionalidades do app a você: registrar seus lançamentos, calcular fechamentos mensais, gerar gráficos e projeções, e permitir o lançamento via WhatsApp quando ativado. Não usamos seus dados financeiros para nenhuma outra finalidade, não os vendemos e não os repassamos a anunciantes. Eles só passam pelos serviços contratados para o Contay funcionar, descritos em “Pagamento da assinatura”, “Lançamentos e dúvidas pelo WhatsApp” e “Onde os dados ficam guardados”.",
  },
  {
    title: "Teste grátis de 7 dias",
    body: "Quem cria a conta pelo site usa o Contay gratuitamente por 7 dias, contados do dia do cadastro, com todas as funções. Para testar não pedimos pagamento, cartão nem CPF, e nada é cobrado se você não assinar. Um dia antes do fim e no último dia do teste avisamos pelo WhatsApp do cadastro, com o endereço para assinar. Se você assinar durante o teste, a primeira mensalidade vence no último dia do teste (no cartão de crédito, é nesse dia que acontece a primeira cobrança). Terminado o teste sem assinatura, o acesso fica pausado, sem perda de dados, até você assinar. O teste vale uma vez por pessoa e por número de WhatsApp.",
  },
  {
    title: "Plano mensal e plano anual",
    body: "Na hora de assinar você escolhe o plano mensal (R$ 29,90 por mês) ou o plano anual (R$ 304,98 por ano, que é o valor de 12 mensalidades com 15% de desconto, cobrado de uma vez). O plano mensal não tem fidelidade. No plano anual pago no Pix, a cobrança se repete uma vez por ano, na mesma data; você pode cancelar a renovação quando quiser e continua com acesso até o fim do ano já pago. No cartão de crédito, o plano anual é pago à vista ou parcelado em até 12 vezes, conforme a opção que você escolher na página de pagamento do Asaas: o valor é cobrado no cartão na hora da compra (as parcelas aparecem nas faturas seguintes do seu cartão) e o ano de acesso começa no fim do teste grátis, ou no vencimento que você já tiver. Não há renovação automática no cartão: perto do fim do ano o Contay avisa e você escolhe se renova. Nos primeiros 7 dias depois do pagamento do plano anual você pode desistir e receber o valor de volta (direito de arrependimento das compras pela internet; no cartão parcelado, a compra é estornada inteira); depois desse prazo o valor do ano em curso não é devolvido e as parcelas restantes continuam nas faturas do cartão. Tudo o que estes Termos dizem sobre a mensalidade (vencimento, atraso, pausa do acesso e cobrança no cartão) vale também para a anuidade. Quem já é assinante troca de plano falando com o suporte.",
  },
  {
    title: "Pagamento da assinatura",
    body: "Nas assinaturas contratadas pelo site, a mensalidade é cobrada pelo Asaas (Asaas Gestão Financeira S.A.), instituição de pagamento que atua como operadora nos termos da LGPD, via Pix ou cartão de crédito recorrente, conforme a sua escolha. Para emitir a cobrança, o que só acontece quando você decide assinar e informa o CPF, compartilhamos com o Asaas apenas seu nome, CPF, e-mail e WhatsApp — e, se você escolher o cartão de crédito, também o endereço de cobrança que você informar (o Asaas exige endereço para cobrar no cartão; o Contay não guarda esse endereço). No cartão de crédito, os dados do cartão são digitados diretamente na página de pagamento do Asaas: o Contay não recebe, não vê e não guarda o número do cartão, e a mensalidade passa a ser cobrada automaticamente no cartão todo mês. Seus lançamentos e demais dados financeiros nunca são enviados ao Asaas. A mensalidade vence todo mês no mesmo dia da contratação; se ficar mais de 3 dias em atraso (inclusive quando o cartão for recusado), o acesso é pausado (sem perda de dados) até o pagamento, que libera o acesso automaticamente. Você pode cancelar quando quiser, sem fidelidade.",
  },
  {
    title: "Lançamentos e dúvidas pelo WhatsApp",
    body: "Usar o WhatsApp é opcional: tudo pode ser feito direto no app. Quando você manda uma mensagem para o número do Contay, ela chega a um número de atendimento da nossa equipe, que consegue ver a conversa, como em qualquer conversa de WhatsApp — é por ali que o suporte atende. Para ler a mensagem e responder na hora, ela passa pela Z-API (serviço que liga o número ao sistema) e pelo nosso servidor de automação, e o texto é enviado ao Google (inteligência artificial Gemini), que identifica o gasto ou a dúvida. Se você mandar um áudio ou uma imagem (foto de nota, cupom ou comprovante), o arquivo também é enviado ao Google, que ouve o áudio ou lê a imagem para identificar o gasto; o Contay não guarda o áudio nem a imagem, só o lançamento que resultou deles. Ao Google segue só o que você mandou (o texto, o áudio ou a imagem), sem o seu nome, telefone ou CPF cadastrados; lembre que a sua voz e tudo o que aparece na imagem fazem parte do que é enviado. O Google trata esse conteúdo conforme os termos do próprio serviço, o que pode incluir o uso para melhorar os serviços dele. Por isso, não escreva, não fale e não fotografe senhas, número de cartão, documentos ou outras informações sensíveis.",
  },
  {
    title: "Mensagens do Contay no seu WhatsApp",
    body: "Usamos o número de WhatsApp do cadastro para falar com você sobre o Contay: boas-vindas com o manual e o aviso de que o teste grátis está liberado, respostas às suas dúvidas, durante o teste grátis três mensagens com dicas de uso (no 2º, 4º e 6º dia, só para quem ainda não assinou), dois avisos de fim do teste grátis (na véspera e no último dia, com o endereço para assinar), um lembrete com dicas para começar se a conta de quem assinou ficar 5 e 10 dias sem nenhum lançamento e, se o teste terminar sem assinatura, algumas ofertas curtas (no máximo 6, uma a cada 15 dias). As mensagens saem só das 8h às 22h. Para não receber mais as ofertas, responda SAIR a qualquer momento.",
  },
  {
    title: "Onde os dados ficam guardados",
    body: "O banco de dados do Contay fica no Supabase, o app é hospedado no Render e a automação do WhatsApp roda em servidor da Hostinger. Essas empresas prestam serviço de hospedagem para o Contay e atuam como operadoras nos termos da LGPD. Os servidores delas, assim como os da Z-API e do Google, podem ficar fora do Brasil.",
  },
  {
    title: "Cookies e medição de anúncios",
    body: "Na página de vendas, no cadastro, na tela de boas-vindas que abre logo depois dele e na tela de pagamento, e somente se você clicar em “Aceitar” no aviso de cookies, usamos o pixel da Meta (Meta Platforms, dona do Facebook e do Instagram) para saber se os nossos anúncios trouxeram visitas, cadastros e assinaturas. Nesse caso a Meta recebe as informações técnicas da visita (endereço da página, endereço IP, tipo de navegador e os cookies dela) e o aviso de que houve uma visita, um cadastro concluído, o início do pagamento (quando você copia o código Pix ou segue para os dados do cartão) ou uma assinatura paga, com o valor do plano. Não enviamos à Meta seu nome, e-mail, CPF, WhatsApp, senha nem qualquer lançamento ou dado financeiro, e o pixel não existe dentro do app (painel, lançamentos, cartões, investimentos e contas fixas). A Meta trata essas informações conforme a política de dados dela e pode relacioná-las ao seu perfil nas redes dela; os servidores podem ficar fora do Brasil. Se você recusar, nada disso é carregado e o Contay funciona do mesmo jeito. Para mudar de ideia, use o link “Cookies” no rodapé da página de vendas.",
  },
  {
    title: "Quem pode acessar",
    body: "Seus dados são protegidos por controle de acesso a nível de banco de dados (Row-Level Security), que impede que outros clientes do app — ou o próprio sistema, fora do seu login — vejam suas informações. A equipe do Contay tem acesso técnico restrito à infraestrutura (necessário para operar, corrigir problemas e dar suporte), mas não acessa nem revisa seus dados de rotina: o painel administrativo da equipe mostra só o cadastro e a situação da assinatura, não os seus lançamentos. As mensagens que você manda para o WhatsApp do Contay ficam visíveis para o suporte nesse número. Não vendemos seus dados nem os repassamos a terceiros para fins comerciais; os únicos compartilhamentos são os descritos em “Pagamento da assinatura”, “Lançamentos e dúvidas pelo WhatsApp”, “Onde os dados ficam guardados” e “Cookies e medição de anúncios”.",
  },
  {
    title: "Por quanto tempo guardamos",
    body: "Enquanto sua conta estiver ativa. Se você pedir a exclusão da conta, seus dados são removidos, salvo o mínimo exigido por obrigação legal.",
  },
  {
    title: "Seus direitos (Art. 18 da LGPD)",
    body: "A qualquer momento, você pode pedir: confirmação de que tratamos seus dados, acesso aos dados, correção de dados incompletos ou desatualizados, anonimização/eliminação de dados desnecessários, portabilidade dos seus dados, informação sobre com quem compartilhamos (hoje: Asaas, para a cobrança; Z-API e Google, para as mensagens do WhatsApp; Supabase, Render e Hostinger, para a hospedagem; e a Meta, apenas para a medição de anúncios de quem aceitou os cookies), e a revogação deste consentimento — o que pode implicar encerramento da sua conta, já que os dados são essenciais para o funcionamento do serviço.",
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
