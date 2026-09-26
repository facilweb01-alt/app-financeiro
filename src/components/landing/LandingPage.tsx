import Link from "next/link";
import { Logo, LogoSymbol } from "@/components/Logo";
import { PLAN_PRICE } from "@/lib/billing/core";
import { formatBRL } from "@/lib/format";

// Página de vendas pública (rota "/" para quem não está logado). Server
// Component puro — sem JavaScript no navegador além do que o Next já manda —
// para abrir rápido no celular, que é de onde vem a maior parte do tráfego.

const PRICE = formatBRL(PLAN_PRICE);

function CtaButton({ children = "Quero esse app", className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <Link
      href="/registrar"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-base font-bold text-navy-950 shadow-lg shadow-emerald-500/25 transition-all hover:-translate-y-0.5 hover:bg-emerald-400 ${className}`}
    >
      {children}
      <span aria-hidden>→</span>
    </Link>
  );
}

function ChatBubble({ from, children, time }: { from: "me" | "app"; children: React.ReactNode; time: string }) {
  const me = from === "me";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${
          me ? "rounded-br-md bg-emerald-700/90 text-white" : "rounded-bl-md bg-navy-800 text-navy-50"
        }`}
      >
        {children}
        <div className={`mt-1 text-right text-[10px] ${me ? "text-emerald-100/70" : "text-navy-400"}`}>{time}</div>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[290px] rounded-[2.5rem] border border-navy-600/60 bg-navy-950 p-3 shadow-2xl shadow-blue-900/40">
      <div className="mx-auto mb-2 h-1.5 w-20 rounded-full bg-navy-700" aria-hidden />
      <div className="flex items-center gap-2.5 rounded-t-2xl bg-navy-900 px-3 py-2.5">
        <LogoSymbol size={30} />
        <div>
          <div className="text-sm font-semibold text-navy-50">App Financeiro</div>
          <div className="text-[11px] text-emerald-400">online</div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 rounded-b-2xl bg-[#0d1733] px-3 py-4">
        <ChatBubble from="me" time="12:41">gastei 85 no mercado</ChatBubble>
        <ChatBubble from="app" time="12:41">
          ✅ <strong>Lançamento registrado!</strong>
          <br />
          Mercado - R$ 85,00
          <br />
          Categoria: Compra de alimentos
        </ChatBubble>
        <ChatBubble from="me" time="18:03">paguei 120 de gasolina</ChatBubble>
        <ChatBubble from="app" time="18:03">
          ✅ <strong>Lançamento registrado!</strong>
          <br />
          Gasolina - R$ 120,00
          <br />
          Categoria: Gasolina
        </ChatBubble>
        <ChatBubble from="me" time="20:15">farmácia 42,90</ChatBubble>
        <ChatBubble from="app" time="20:15">
          ✅ <strong>Lançamento registrado!</strong>
          <br />
          Farmácia - R$ 42,90 · Saúde
        </ChatBubble>
      </div>
    </div>
  );
}

const FEATURES: { icon: string; title: string; text: string }[] = [
  {
    icon: "💬",
    title: "Lançamento pelo WhatsApp",
    text: "Mande “gastei 50 no mercado” e pronto: valor, categoria e data vão direto para o app, com confirmação na hora.",
  },
  {
    icon: "🧾",
    title: "Gastos do dia a dia",
    text: "Data da compra, vencimento, produto ou serviço e categoria: alimentação, saúde, lazer, compras pessoais, viagem, gasolina — e as suas próprias.",
  },
  {
    icon: "💳",
    title: "Cartões e parcelas",
    text: "Compras parceladas em cada cartão, fechamento de fatura do jeito do seu banco e as parcelas futuras já somadas nos próximos meses.",
  },
  {
    icon: "🏠",
    title: "Contas fixas",
    text: "Aluguel, internet, escola… cadastre uma vez, com descrição e valor, e acrescente quantas quiser.",
  },
  {
    icon: "📈",
    title: "Investimentos e metas",
    text: "Registre seus aportes e acompanhe metas com barra de progresso até o objetivo.",
  },
  {
    icon: "🚦",
    title: "Limites por categoria",
    text: "Defina quanto quer gastar em cada categoria e receba alerta quando estiver chegando perto.",
  },
  {
    icon: "📊",
    title: "Gráficos e % da renda",
    text: "Veja quanto cada categoria consome da sua renda, o gasto do mês e o que já está comprometido no mês que vem.",
  },
  {
    icon: "🗓️",
    title: "Fechamento do mês + PDF",
    text: "Feche o mês com um clique: resumo por categoria, parcelas que ainda faltam e relatório em PDF para guardar.",
  },
  {
    icon: "📱",
    title: "Celular e computador",
    text: "Funciona no navegador e pode ser instalado na tela inicial do celular, como um aplicativo.",
  },
  {
    icon: "🙈",
    title: "Modo discreto",
    text: "Um toque esconde todos os valores da tela — ideal para abrir o app em público.",
  },
  {
    icon: "🔒",
    title: "Seus dados protegidos",
    text: "Cada conta é isolada no próprio banco de dados, com senha criptografada e em conformidade com a LGPD.",
  },
  {
    icon: "⚡",
    title: "Liberação imediata",
    text: "Pagou o Pix, o acesso é liberado automaticamente em segundos — sem esperar ninguém aprovar.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Como funciona o lançamento pelo WhatsApp?",
    a: "No cadastro você informa seu WhatsApp. Depois é só mandar uma mensagem para o número do App Financeiro, do jeito que você fala: “gastei 30 na padaria”, “paguei 200 de luz”. Uma inteligência artificial entende o valor e a categoria, lança no app e te responde confirmando.",
  },
  {
    q: "Preciso instalar alguma coisa?",
    a: "Não. O App Financeiro funciona no navegador do celular ou do computador. Se quiser, adicione à tela inicial do celular para abrir como um aplicativo.",
  },
  {
    q: "Como é feita a cobrança?",
    a: `${PRICE} por mês, via Pix. A cobrança se repete todo mês no mesmo dia em que você contratou. Alguns dias antes do vencimento aparece um aviso dentro do app com o Pix pronto para pagar.`,
  },
  {
    q: "E se eu atrasar o pagamento?",
    a: "Você tem 3 dias de tolerância depois do vencimento. Passado esse prazo o acesso fica pausado — sem perder nenhum dado — e volta automaticamente assim que o Pix é pago.",
  },
  {
    q: "Tem fidelidade? Posso cancelar?",
    a: "Não tem fidelidade. Para cancelar, é só falar com o nosso suporte — a cobrança para no mês seguinte.",
  },
  {
    q: "Meus dados financeiros ficam seguros?",
    a: "Sim. Cada conta é isolada no banco de dados, a senha é guardada criptografada e seus lançamentos nunca são compartilhados. Para a cobrança, só nome, CPF, e-mail e WhatsApp vão para o Asaas, a instituição que processa o Pix.",
  },
];

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">{eyebrow}</div>
      <h2 className="text-3xl font-extrabold tracking-tight text-navy-50 md:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-navy-300">{text}</p>}
    </div>
  );
}

function DashboardPreview() {
  const rows = [
    { label: "Contas fixas", pct: 32, color: "bg-blue-500" },
    { label: "Alimentação", pct: 18, color: "bg-emerald-400" },
    { label: "Cartões (parcelas)", pct: 14, color: "bg-violet-400" },
    { label: "Gasolina", pct: 7, color: "bg-amber-400" },
    { label: "Lazer", pct: 5, color: "bg-pink-400" },
  ];
  return (
    <div className="glass-card rounded-3xl p-6">
      <div className="mb-1 text-xs uppercase tracking-wide text-navy-400">Setembro</div>
      <div className="mb-5 text-lg font-semibold text-navy-50">
        Você já usou <span className="text-emerald-300">76%</span> da sua renda
      </div>
      <div className="mb-6 h-3 w-full overflow-hidden rounded-full bg-navy-800">
        <div className="h-full w-[76%] rounded-full bg-linear-to-r from-blue-500 to-emerald-400" />
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-navy-200">{r.label}</span>
              <span className="font-semibold text-navy-100">{r.pct}% da renda</span>
            </div>
            <div className="h-2 w-full rounded-full bg-navy-800">
              <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.pct * 2.5}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 rounded-xl border border-navy-700/70 bg-navy-900/60 p-3 text-sm text-navy-300">
        📅 Mês que vem já tem <strong className="text-navy-100">R$ 640,00</strong> em parcelas de cartão.
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* luzes de fundo */}
      <div className="mesh-glow -left-32 top-0 h-96 w-96 bg-blue-600" aria-hidden />
      <div className="mesh-glow right-0 top-[420px] h-96 w-96 bg-emerald-500" aria-hidden />
      <div className="mesh-glow -left-20 top-[1600px] h-96 w-96 bg-indigo-600" aria-hidden />

      {/* topo */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
        <Logo size={32} textClassName="text-[15px] md:text-lg" />
        <nav className="flex items-center gap-2 md:gap-4">
          <a href="#recursos" className="hidden text-sm text-navy-300 hover:text-navy-50 md:inline">
            Recursos
          </a>
          <a href="#preco" className="hidden text-sm text-navy-300 hover:text-navy-50 md:inline">
            Preço
          </a>
          <a href="#duvidas" className="hidden text-sm text-navy-300 hover:text-navy-50 md:inline">
            Dúvidas
          </a>
          <Link href="/login" className="whitespace-nowrap rounded-xl px-2 py-2 text-sm font-medium text-navy-200 hover:bg-navy-900 sm:px-3">
            Entrar
          </Link>
          <Link
            href="/registrar"
            className="whitespace-nowrap rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-navy-950 hover:bg-emerald-400"
          >
            <span className="sm:hidden">Assinar</span>
            <span className="hidden sm:inline">Quero esse app</span>
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        {/* herói */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-8 md:grid-cols-2 md:px-8 md:pt-16">
          <div className="animate-rise-in">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Novo: lance seus gastos pelo WhatsApp
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-navy-50 md:text-6xl">
              Mandou mensagem,{" "}
              <span className="bg-linear-to-r from-blue-400 to-emerald-300 bg-clip-text text-transparent">
                tá lançado.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-navy-300">
              O App Financeiro organiza seu dinheiro sem planilha e sem esforço: você manda o gasto pelo WhatsApp e ele
              aparece no app, na categoria certa, com gráficos, cartões, parcelas e contas fixas — tudo num só lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CtaButton />
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center rounded-2xl border border-navy-700 px-6 py-3.5 text-base font-semibold text-navy-100 hover:bg-navy-900"
              >
                Ver como funciona
              </a>
            </div>
            <p className="mt-4 text-sm text-navy-400">
              {PRICE}/mês · pagamento via Pix · sem fidelidade · acesso liberado na hora
            </p>
          </div>
          <div className="animate-rise-in stagger-2">
            <PhoneMockup />
          </div>
        </section>

        {/* como funciona */}
        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 md:px-8">
          <SectionTitle eyebrow="Como funciona" title="Três passos e seu controle financeiro está no ar" />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                n: "1",
                t: "Crie sua conta",
                d: "Nome, e-mail, WhatsApp e CPF. Leva menos de um minuto.",
              },
              {
                n: "2",
                t: "Pague o Pix",
                d: `${PRICE} por mês. Pagou, o acesso é liberado automaticamente em segundos.`,
              },
              {
                n: "3",
                t: "Mande seus gastos",
                d: "Pelo WhatsApp ou direto no app. Ele organiza, soma e mostra para onde seu dinheiro está indo.",
              },
            ].map((s) => (
              <div key={s.n} className="glass-card rounded-3xl p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-lg font-extrabold text-white">
                  {s.n}
                </div>
                <div className="text-lg font-bold text-navy-50">{s.t}</div>
                <p className="mt-1.5 text-navy-300">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* destaque WhatsApp */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <div className="glass-card grid items-center gap-10 overflow-hidden rounded-[2rem] p-8 md:grid-cols-2 md:p-12">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">O diferencial</div>
              <h2 className="text-3xl font-extrabold tracking-tight text-navy-50 md:text-4xl">
                Seu assistente financeiro mora no WhatsApp
              </h2>
              <p className="mt-4 text-navy-300">
                Sem abrir app, sem preencher formulário. Escreva do seu jeito — a inteligência artificial entende e lança
                para você, e o app se atualiza sozinho.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-navy-200">
                {[
                  "Entende valor, descrição e categoria em linguagem natural",
                  "Responde na hora confirmando o que foi lançado",
                  "Tudo aparece no painel, nos gráficos e no fechamento do mês",
                  "Funciona do seu próprio WhatsApp, o mesmo do cadastro",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-navy-950">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              {[
                ["gastei 32 na padaria", "Padaria - R$ 32,00 · Compra de alimentos"],
                ["uber 18,50", "Uber - R$ 18,50 · Serviço"],
                ["cinema com a família 96", "Cinema - R$ 96,00 · Lazer"],
                ["consulta dentista 250", "Dentista - R$ 250,00 · Saúde"],
              ].map(([msg, res]) => (
                <div key={msg} className="rounded-2xl border border-navy-700/60 bg-navy-950/60 p-4">
                  <div className="text-sm text-navy-400">
                    Você: <span className="text-navy-100">“{msg}”</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-emerald-300">✅ {res}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* recursos */}
        <section id="recursos" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 md:px-8">
          <SectionTitle
            eyebrow="Recursos"
            title="Tudo que você precisa para dominar suas finanças"
            text="Do cafezinho às parcelas do cartão: cada centavo no lugar certo, com visão do mês atual e dos próximos."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="glass-card rounded-3xl p-6 transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="mb-3 text-3xl" aria-hidden>
                  {f.icon}
                </div>
                <div className="text-lg font-bold text-navy-50">{f.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-300">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* visão do painel */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-8">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Clareza</div>
            <h2 className="text-3xl font-extrabold tracking-tight text-navy-50 md:text-4xl">
              Saiba em segundos para onde vai o seu dinheiro
            </h2>
            <p className="mt-4 text-navy-300">
              Quanto cada categoria pesa na sua renda, o que já está comprometido com parcelas nos próximos meses e
              quanto ainda sobra — em gráficos simples, no celular ou no computador.
            </p>
            <div className="mt-8">
              <CtaButton>Começar agora</CtaButton>
            </div>
          </div>
          <DashboardPreview />
        </section>

        {/* preço */}
        <section id="preco" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 md:px-8">
          <SectionTitle eyebrow="Preço" title="Um plano, tudo incluído" text="Sem letras miúdas, sem fidelidade." />
          <div className="relative mx-auto max-w-md">
            <div className="absolute -inset-1 rounded-[2.2rem] bg-linear-to-br from-blue-500 to-emerald-400 opacity-60 blur-lg" aria-hidden />
            <div className="relative rounded-[2rem] border border-navy-700 bg-navy-900 p-8">
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-navy-50">App Financeiro</div>
                <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                  Mensal
                </div>
              </div>
              <div className="mt-5 flex items-end gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-navy-50">{PRICE}</span>
                <span className="mb-1.5 text-navy-400">/mês</span>
              </div>
              <p className="mt-1 text-sm text-navy-400">Pago via Pix, todo mês no dia em que você contratou.</p>
              <ul className="mt-6 flex flex-col gap-2.5 text-sm text-navy-200">
                {[
                  "Lançamento de gastos pelo WhatsApp",
                  "Lançamentos, categorias e contas fixas ilimitados",
                  "Cartões, parcelas e fechamento de fatura",
                  "Investimentos e metas com progresso",
                  "Limites por categoria com alertas",
                  "Gráficos, fechamento mensal e PDF",
                  "Celular e computador",
                  "Acesso liberado na hora após o Pix",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="text-emerald-400" aria-hidden>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <CtaButton className="mt-8 w-full" />
              <p className="mt-3 text-center text-xs text-navy-500">Sem fidelidade — cancele quando quiser.</p>
            </div>
          </div>
        </section>

        {/* dúvidas */}
        <section id="duvidas" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-16 md:px-8">
          <SectionTitle eyebrow="Dúvidas" title="Perguntas frequentes" />
          <div className="flex flex-col gap-3">
            {FAQ.map((item) => (
              <details key={item.q} className="glass-card group rounded-2xl p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy-50">
                  {item.q}
                  <span className="text-xl text-navy-400 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-navy-300">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* chamada final */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-8 md:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-blue-600 to-blue-900 p-10 text-center md:p-14">
            <div className="mesh-glow -right-10 -top-10 h-64 w-64 bg-emerald-400" aria-hidden />
            <h2 className="relative text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              Comece hoje a ter controle do seu dinheiro
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-blue-100">
              Crie sua conta, pague o Pix e mande seu primeiro gasto pelo WhatsApp em menos de 5 minutos.
            </p>
            <CtaButton className="relative mt-8" />
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-navy-800/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-navy-400 md:flex-row md:px-8">
          <Logo size={26} textClassName="text-sm" />
          <div className="flex gap-5">
            <Link href="/termos" className="hover:text-navy-100">
              Termos e Privacidade
            </Link>
            <Link href="/login" className="hover:text-navy-100">
              Entrar
            </Link>
          </div>
          <div>© {new Date().getFullYear()} App Financeiro · Fácil Web</div>
        </div>
      </footer>
    </div>
  );
}
