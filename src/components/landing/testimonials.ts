// Depoimentos da página de vendas: mensagens reais recebidas no WhatsApp do
// Contay, enviadas pelo Marcelo em 11/10/2026 para publicar no site.
//
// As imagens são recortes dos prints originais, com foto, nome e número
// escondidos (public/landing/depoimento-N.webp). `text` é a transcrição
// fiel da mensagem, usada como texto alternativo da imagem (leitor de tela).
//
// Só entra aqui depoimento de cliente de verdade e com autorização. Para
// mostrar o primeiro nome de alguém que autorizou, troque `who`
// (ex.: "Carlos, Campinas/SP").

export type Testimonial = {
  image: string;
  width: number;
  height: number;
  text: string;
  /** Como a pessoa é identificada na página. */
  who: string;
  detail: string;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    image: "/landing/depoimento-1.webp",
    width: 720,
    height: 369,
    text: "O Contay facilitou minha vida, eu não atualizava minha planilha as meses, agora com um aplicativo na palma da minha mão é tudo muito mais fácil, não deixo de anotar nada, é muito prático e fácil de usar, já não me vejo sem",
    // Autorizou a publicação; o Marcelo informou a cidade (11/10/2026).
    who: "Cliente Contay",
    detail: "Campinas/SP · pelo WhatsApp",
  },
  {
    image: "/landing/depoimento-2.webp",
    width: 720,
    height: 551,
    text: "Quero agradecer a equipe da Contay pelo excelente aplicativo, muito simples e prático de usar, lanço todas minhas despesas e gastos pelo whatsapp já a necessidade de abrir o aplicativo, e o controle de cartão de crédito e muito bom, consigo colocar limites por categoria, e quando tenho dúvidas sobre como utilizar pergunto direito pelo whatsapp e tenho a respostas na mesma hora, um ótimo suporte.",
    // Autorizou mostrar o primeiro nome (confirmado pelo Marcelo em 11/10/2026).
    who: "Marcelo M.",
    detail: "cliente Contay · pelo WhatsApp",
  },
];
