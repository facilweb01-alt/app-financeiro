// Manual do usuário do Contay — fonte única do conteúdo. Daqui saem:
//   - a página pública /manual;
//   - o PDF enviado nas boas-vindas pelo WhatsApp (src/lib/pdf/manualPdf.ts);
//   - o texto resumido que a IA do WhatsApp usa para tirar dúvidas
//     (manualPlainText — colado no prompt do n8n; mudou aqui, atualize lá).
//
// Regra de escrita: frases curtas, sem termo técnico, um passo por linha.
// Mudou uma tela do app? Atualize a seção correspondente aqui.

import { WHATSAPP_BOT_DISPLAY } from "@/lib/whatsappBot";

export type ManualSection = {
  id: string;
  title: string;
  intro: string;
  items: string[];
  tip?: string;
};

export const MANUAL_TITLE = "Manual do Contay";
export const MANUAL_SUBTITLE = "Tudo o que o app faz, explicado passo a passo.";
export const MANUAL_UPDATED = "02/10/2026";

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: "comeco",
    title: "1. Primeiros passos",
    intro: "O Contay funciona no navegador do celular e do computador. Não precisa baixar nada.",
    items: [
      "Entre pelo endereço do app com o e-mail e a senha do seu cadastro.",
      "No celular, você pode deixar o Contay na tela inicial: abra o app no navegador, toque no menu do navegador e escolha “Adicionar à tela inicial”.",
      `Salve o número ${WHATSAPP_BOT_DISPLAY} na sua agenda como “Contay”. É por ele que você lança gastos e tira dúvidas.`,
      "Na aba Fechamento, informe a sua renda mensal. É com ela que o app calcula quanto da renda cada gasto consome.",
    ],
  },
  {
    id: "whatsapp",
    title: "2. Lançar pelo WhatsApp",
    intro: "Mande uma mensagem para o número do Contay, escrita do seu jeito. Ele entende, lança no app e responde confirmando.",
    items: [
      "Gasto simples: “gastei 45 no mercado”, “uber 18,50”, “farmácia 42,90”.",
      "Com vencimento: “dentista 250 vence dia 15/10”.",
      "Compra no cartão: “300 no cartão Nubank em 3x”. O app cria as parcelas, uma por mês.",
      "Cartão à vista: “89,90 no cartão Nubank”.",
      "Categoria: o Contay escolhe sozinho (mercado vai para Compra de alimentos, posto vai para Gasolina). Para escolher, diga a categoria: “ração 80 categoria pet”. Se ela não existir, é criada na hora.",
      "O valor é sempre o total da compra. Mande uma compra por mensagem.",
      "Foto, áudio e figurinha não são lidos: mande em texto.",
    ],
    tip: "Se o Contay responder que o seu WhatsApp não está vinculado, abra o app, vá em Fechamento, toque em “Vincular pelo WhatsApp” e mande para o número do Contay a mensagem que aparecer (VINCULAR e um código de 6 números). O código vale 30 minutos.",
  },
  {
    id: "painel",
    title: "3. Painel",
    intro: "É a tela inicial. Mostra o resumo do mês em poucos números.",
    items: [
      "Total do mês e quanto da sua renda já está comprometido.",
      "“De onde vem esse total”: lançamentos do dia a dia, parcelas de cartão e contas fixas.",
      "Gastos por categoria, com a porcentagem da renda. Toque em uma categoria para ver cada gasto dela.",
      "“Gasto no mês que vem”: quanto das parcelas de cartão já cai no próximo mês.",
      "Parcelas futuras, mês a mês. Dá para filtrar por mês e por categoria.",
      "Seletor de mês: veja o mês atual ou os próximos.",
      "“Relatório em PDF por cartão”: baixa as compras e parcelas de um cartão.",
    ],
  },
  {
    id: "lancamentos",
    title: "4. Lançamentos",
    intro: "Os gastos do dia a dia que não são no cartão de crédito.",
    items: [
      "Preencha a data da compra, o vencimento, o produto ou serviço, a categoria e o valor, e toque em “Adicionar lançamento”.",
      "Categorias prontas: Produto, Serviço, Lazer, Saúde, Compra de alimentos, Compras pessoais, Viagem, Gasolina e Outros.",
      "Para criar a sua, escolha “+ Nova categoria” na lista de categorias.",
      "Para apagar um lançamento, toque em “excluir” na linha dele.",
      "Lançamentos de um mês já encerrado saem desta lista e ficam guardados no Fechamento.",
    ],
  },
  {
    id: "cartoes",
    title: "5. Cartões",
    intro: "Controle das compras no cartão de crédito e das parcelas.",
    items: [
      "Cadastre cada cartão pelo nome (por exemplo, Nubank) em “Novo cartão”.",
      "Em “Adicionar compra”, informe a descrição, a data da compra, o 1º vencimento, o valor total e o número de parcelas. O app cria uma parcela por mês.",
      "As parcelas que faltam já aparecem somadas nos próximos meses, no Painel e no Fechamento.",
      "“Fechar fatura do período”: escolha as datas de início e fim da fatura do seu banco para ver o total daquele período.",
      "Você pode editar ou excluir uma compra. As parcelas são refeitas.",
    ],
  },
  {
    id: "investimentos",
    title: "6. Investimentos",
    intro: "Registro do que você guarda e das suas metas.",
    items: [
      "Em “Adicionar investimento”, informe o nome (por exemplo, Tesouro Selic), o tipo, a data e o valor.",
      "Em “Metas de investimento”, crie uma meta com nome, valor alvo e, se quiser, uma data.",
      "Registre cada aporte na meta. A barra mostra quanto falta, e o app avisa quando a meta é alcançada.",
      "O que você investe aparece separado dos gastos no Painel e no Fechamento.",
    ],
  },
  {
    id: "contas-fixas",
    title: "7. Contas fixas",
    intro: "As contas que se repetem todo mês: aluguel, internet, escola, plano de saúde.",
    items: [
      "Cadastre a descrição e o valor. Pode acrescentar quantas quiser.",
      "As contas fixas ativas entram no total do mês e na porcentagem da renda.",
      "Se uma conta parar por um tempo, use “Marcar como inativa”. Ela deixa de somar, sem ser apagada.",
    ],
  },
  {
    id: "fechamento",
    title: "8. Fechamento do mês",
    intro: "O resumo do mês: quanto você gastou, em quê, e o que ainda vai vencer.",
    items: [
      "“Sua renda mensal”: informe ou corrija a renda.",
      "“Limites de gastos por categoria”: defina quanto quer gastar em cada categoria. O app avisa quando você chega perto e quando ultrapassa.",
      "“Fechar um mês”: guarda o resumo daquele mês no histórico, com as parcelas que ainda faltam nos meses seguintes.",
      "Quando um mês termina, o app pergunta se você quer encerrar. Se responder “Agora não”, ele pergunta de novo no dia seguinte e depois só no próximo mês.",
      "Mês encerrado não recebe lançamento novo. Para lançar nele, exclua o fechamento no histórico e feche de novo depois.",
      "“Exportar PDF”: baixa o relatório do mês.",
      "É nesta aba que você vincula ou troca o número de WhatsApp.",
    ],
  },
  {
    id: "privacidade",
    title: "9. Modo discreto",
    intro: "Para abrir o app perto de outras pessoas sem mostrar valores.",
    items: [
      "Toque no ícone do olho, no topo do app. Todos os valores viram “R$ ••••”.",
      "Toque de novo para voltar a mostrar. A escolha fica guardada naquele aparelho.",
    ],
  },
  {
    id: "assinatura",
    title: "10. Assinatura e pagamento",
    intro: "O Contay custa R$ 29,90 por mês, sem fidelidade.",
    items: [
      "Em “Minha assinatura” você vê a forma de pagamento, o próximo vencimento e o histórico.",
      "Pix: todo mês o app gera um QR Code. Ele avisa 5 dias antes do vencimento.",
      "Cartão de crédito: a mensalidade é cobrada sozinha todo mês. O cartão é digitado na página segura do Asaas, e o Contay não vê nem guarda os dados dele.",
      "Se a mensalidade ficar 3 dias vencida, o acesso é pausado. Os seus dados continuam guardados, e o acesso volta assim que o pagamento é confirmado.",
      "Para cancelar a assinatura, fale com o suporte. Você continua usando até o fim do período já pago.",
    ],
  },
  {
    id: "suporte",
    title: "11. Dúvidas e suporte",
    intro: "O suporte é pelo mesmo WhatsApp em que você lança os gastos.",
    items: [
      `Mande a sua dúvida para ${WHATSAPP_BOT_DISPLAY}, por exemplo: “como cadastro um cartão?”.`,
      "A resposta vem na hora. Quando for um caso que precisa de uma pessoa, um atendente continua a conversa.",
      "Este manual fica sempre disponível no app, em “Ajuda”.",
    ],
  },
  {
    id: "seguranca",
    title: "12. Seus dados",
    intro: "Os seus lançamentos são só seus.",
    items: [
      "Cada conta é isolada das outras, e a senha é guardada criptografada.",
      "O Contay não se conecta ao seu banco e não pede senha de banco.",
      "Os Termos de Uso e a Política de Privacidade estão no rodapé da página inicial.",
    ],
  },
];

/**
 * Versão em texto corrido do manual, para a IA do WhatsApp responder
 * dúvidas (vai dentro do prompt no n8n — por isso sem formatação e curta).
 */
export function manualPlainText(): string {
  return MANUAL_SECTIONS.map((s) => {
    const body = [s.intro, ...s.items, ...(s.tip ? [s.tip] : [])].join(" ");
    return `${s.title}: ${body}`;
  }).join("\n");
}
