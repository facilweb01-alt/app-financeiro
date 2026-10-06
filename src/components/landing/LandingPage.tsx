import Link from "next/link";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./landing.css";
import { LogoSymbol } from "@/components/Logo";
import { PLAN_PRICE } from "@/lib/billing/core";
import { formatBRL } from "@/lib/format";
import { LandingEffects } from "./LandingEffects";

// Página de vendas pública (rota "/" para quem não está logado).
//
// Estrutura pensada para vender: começa pela dor (o salário some), mostra
// os números do endividamento, lista as dores, apresenta os 3 diferenciais
// (WhatsApp, cartões e parcelas, % da renda), compara com planilha e app
// comum, e só no fim mostra o preço. Veio da prévia aprovada pelo Marcelo.
//
// É um Server Component: o único JavaScript no navegador é o
// LandingEffects (barra fixa do celular e inclinação 3D do celular no
// computador). O visual fica em landing.css, todo dentro de ".lp".

const PRICE = formatBRL(PLAN_PRICE);
const PRICE_NUMBER = PLAN_PRICE.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

export function LandingPage() {
  return (
    <div className="lp">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="lp-ck" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="10" fill="#10b981" />
            <path d="M5.8 10.4l2.7 2.7 5.7-6" fill="none" stroke="#052e22" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </symbol>
          <symbol id="lp-xx" viewBox="0 0 20 20">
            <path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="#fb7185" strokeWidth="2.4" strokeLinecap="round" />
          </symbol>
        </defs>
      </svg>

      <header className="top">
        <div className="wrap">
          <a className="logo" href="#topo" aria-label="Contay, início"><LogoSymbol size={34} /><span>Con<b>tay</b></span></a>
          <nav>
            <a className="link hide-sm" href="#diferenciais">Diferenciais</a>
            <a className="link hide-sm" href="#como-funciona">Como funciona</a>
            <a className="link hide-sm" href="#duvidas">Dúvidas</a>
            <Link className="link" href="/login">Entrar</Link>
            <Link className="btn btn-cta" href="/registrar">Quero esse app</Link>
          </nav>
        </div>
      </header>

      <main id="topo">
  
        <section className="hero" id="hero">
          <div className="glow" style={{ width: "420px", height: "420px", left: "-140px", top: "-60px", background: "#2563eb" }}></div>
          <div className="glow" style={{ width: "380px", height: "380px", right: "-80px", top: "260px", background: "#10b981" }}></div>
          <div className="wrap" style={{ position: "relative", zIndex: 1 }}>
            <div>
              <span className="pain-tag ok"><i></i>Controle de gastos pelo WhatsApp e no app</span>
              <h1>Seu dinheiro acaba antes do mês <span className="grad">e você não sabe para onde foi?</span></h1>
              <p className="lead"><strong>O Contay mostra para onde vai cada real.</strong> Você manda o gasto pelo WhatsApp e acompanha tudo no app, no celular ou no computador: cartões, parcelas, contas fixas e quanto ainda sobra no mês.</p>
              <div className="ctas">
                <Link className="btn btn-cta" href="/registrar">Quero ter controle do meu dinheiro <span aria-hidden="true">→</span></Link>
                <a className="btn btn-ghost" href="#como-funciona">Ver como funciona</a>
              </div>
              <div className="trust">
                <span><svg width="16" height="16"><use href="#lp-ck"/></svg>Sem planilha</span>
                <span><svg width="16" height="16"><use href="#lp-ck"/></svg>Não pede senha do banco</span>
                <span><svg width="16" height="16"><use href="#lp-ck"/></svg>Sem fidelidade</span>
              </div>
            </div>

            <div className="scene" id="scene">
              <div className="stage" id="stage">
                <div className="phone">
                  <div className="notch"></div>
                  <div className="chat-head">
                    <LogoSymbol size={30} />
                    <div><div className="n">Contay</div><div className="s">online</div></div>
                  </div>
                  <div className="chat">
                    <div className="b me">gastei 85 no mercado<small>12:41</small></div>
                    <div className="b bot">✅ <strong>Lançamento registrado!</strong><br />Mercado · R$ 85,00<br />Categoria: Compra de alimentos<small>12:41</small></div>
                    <div className="b me">400 no cartão azul em 4x<small>18:03</small></div>
                    <div className="b bot">💳 <strong>Compra no cartão registrada!</strong><br />Cartão Azul · 4x de R$ 100,00<br />1ª parcela na fatura de outubro<small>18:03</small></div>
                    <div className="b me">farmácia 42,90<small>20:15</small></div>
                    <div className="b bot">✅ <strong>Lançamento registrado!</strong><br />Farmácia · R$ 42,90 · Saúde<small>20:15</small></div>
                  </div>
                </div>
                <div className="chip c1"><span className="dot" style={{ background: "rgba(16,185,129,.18)" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></span><span><span className="k">Sobra do mês</span><span className="v">R$ 612,40</span></span></div>
                <div className="chip c2"><span className="dot" style={{ background: "rgba(167,139,250,.18)" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/></svg></span><span><span className="k">Parcelas em novembro</span><span className="v">R$ 520,00</span></span></div>
                <div className="chip c3"><span className="dot" style={{ background: "rgba(251,191,36,.16)" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span><span><span className="k">Internet vence em 3 dias</span><span className="v">R$ 99,90</span></span></div>
              </div>
            </div>
          </div>
        </section>

  
        <section className="stats" aria-label="Números do endividamento no Brasil">
          <div className="wrap">
            <div className="stat"><div className="num"><em>80,9%</em></div><p>das famílias brasileiras estão endividadas. É o maior número já registrado.</p></div>
            <div className="stat"><div className="num"><em>8</em> em 10</div><p>têm o cartão de crédito como a principal dívida. Parcela pequena, somada, vira bola de neve.</p></div>
            <div className="stat"><div className="num"><em>+400%</em></div><p>ao ano é o juro do rotativo do cartão. Uma fatura esquecida custa caro.</p></div>
          </div>
          <div className="wrap src">Fonte: pesquisa Peic da CNC (abril/2026) e Banco Central, divulgados pela Agência Senado.</div>
        </section>

  
        <section className="sec" id="dores">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow pain">Você se reconhece?</span>
              <h2>Não é falta de dinheiro. É falta de enxergar para onde ele vai.</h2>
              <p>Se pelo menos uma dessas situações já aconteceu com você, seu dinheiro está escapando sem você perceber.</p>
            </div>
            <div className="pains">
              <div className="pain-card"><span className="x"><svg width="14" height="14"><use href="#lp-xx"/></svg></span><h3>A fatura chega e você leva um susto</h3><p>Você não lembrava de metade das compras. E agora tem que pagar tudo de uma vez.</p></div>
              <div className="pain-card"><span className="x"><svg width="14" height="14"><use href="#lp-xx"/></svg></span><h3>As parcelas se acumulam sem você ver</h3><p>Cada compra em 10x parecia pouco. Juntas, já comem boa parte do seu salário dos próximos meses.</p></div>
              <div className="pain-card"><span className="x"><svg width="14" height="14"><use href="#lp-xx"/></svg></span><h3>Conta vencida, juros e multa</h3><p>Luz, internet, escola. Você tinha o dinheiro, só esqueceu o dia. E pagou mais caro.</p></div>
              <div className="pain-card"><span className="x"><svg width="14" height="14"><use href="#lp-xx"/></svg></span><h3>A planilha morreu na segunda semana</h3><p>Começou animado, mas parar para digitar cada gasto no computador ninguém aguenta.</p></div>
              <div className="pain-card"><span className="x"><svg width="14" height="14"><use href="#lp-xx"/></svg></span><h3>Baixou um app e nunca mais abriu</h3><p>Abrir o app, achar o botão, preencher o formulário… no terceiro dia você já desistiu.</p></div>
              <div className="pain-card"><span className="x"><svg width="14" height="14"><use href="#lp-xx"/></svg></span><h3>No fim do mês, a pergunta de sempre</h3><p>“Pra onde foi o meu dinheiro?” E ninguém sabe responder, nem você.</p></div>
            </div>
            <div className="turn">
              <p>Você não precisa de mais força de vontade. Precisa de um jeito que <strong>dê menos trabalho do que gastar.</strong> Mandar uma mensagem leva 5 segundos.</p>
              <Link className="btn btn-cta" href="/registrar">Quero resolver isso <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

  
        <section className="sec" id="diferenciais" style={{ paddingTop: "24px" }}>
          <div className="glow" style={{ width: "420px", height: "420px", left: "-160px", top: "200px", background: "#4f46e5" }}></div>
          <div className="wrap" style={{ position: "relative", zIndex: 1 }}>
            <div className="sec-head center">
              <span className="eyebrow">Por que o Contay funciona</span>
              <h2>Feito para quem já tentou se organizar e desistiu</h2>
              <p>O Contay entra na rotina que você já tem.</p>
            </div>

            <div className="diffs">
        
              <article className="diff">
                <div className="copy">
                  <span className="tag">Diferencial 1 · WhatsApp</span>
                  <h3>Lançou em 5 segundos, no app que você já abre o dia todo</h3>
                  <p>Escreva do seu jeito, como mandaria para um amigo. A inteligência artificial entende o valor, a categoria e a data, lança no app e responde confirmando.</p>
                  <p className="dor">Sem isso: você deixa para anotar depois e esquece. Gasto não anotado é dinheiro que some.</p>
                  <ul className="checks">
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Entende “gastei 32 na padaria” e “uber 18,50”</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Entende compra no cartão com parcelas: “400 em 4x”</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Cria a categoria que você pedir: “ração 80 categoria pet”</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Responde na hora confirmando o que foi lançado</li>
                  </ul>
                </div>
                <div className="msgs" aria-label="Exemplos de mensagens">
                  <div className="msg"><div className="you">Você: <b>“gastei 32 na padaria”</b></div><div className="ok">✓ Padaria · R$ 32,00 · Compra de alimentos</div></div>
                  <div className="msg"><div className="you">Você: <b>“uber 18,50”</b></div><div className="ok">✓ Uber · R$ 18,50 · Serviço</div></div>
                  <div className="msg"><div className="you">Você: <b>“cinema com a família 96”</b></div><div className="ok">✓ Cinema · R$ 96,00 · Lazer</div></div>
                  <div className="msg"><div className="you">Você: <b>“dentista 250 vence dia 15”</b></div><div className="ok">✓ Dentista · R$ 250,00 · Saúde · vence 15/10</div></div>
                </div>
              </article>

        
              <article className="diff flip">
                <div className="copy">
                  <span className="tag">Diferencial 2 · Cartões e parcelas</span>
                  <h3>Nenhuma parcela te pega de surpresa de novo</h3>
                  <p>Cada compra parcelada entra no cartão certo, e as parcelas que faltam já aparecem somadas nos próximos meses. Você define o dia de fechamento da fatura do seu banco e o app separa o que cai em cada fatura.</p>
                  <p className="dor">Sem isso: você só descobre quanto deve quando a fatura chega. Aí já é tarde.</p>
                  <ul className="checks">
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Vários cartões, cada um com seu fechamento e vencimento</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Quanto do mês que vem já está comprometido</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>No fechamento do mês, as parcelas restantes seguem para frente sozinhas</li>
                  </ul>
                </div>
                <div className="cardscene">
                  <div className="ccard" aria-hidden="true">
                    <div className="chipi"></div>
                    <span className="inst">parcela 2 de 4</span>
                    <div className="dig">•••• •••• •••• 4821</div>
                    <div className="nm">Cartão Azul</div>
                  </div>
                  <div className="months" aria-label="Parcelas previstas nos próximos meses (exemplo)">
                    <div className="mrow"><span className="m">out/26</span><span className="bar"><i style={{ width: "100%" }}></i></span><span className="val">R$ 640,00</span></div>
                    <div className="mrow"><span className="m">nov/26</span><span className="bar"><i style={{ width: "81%" }}></i></span><span className="val">R$ 520,00</span></div>
                    <div className="mrow"><span className="m">dez/26</span><span className="bar"><i style={{ width: "59%" }}></i></span><span className="val">R$ 380,00</span></div>
                    <div className="mrow"><span className="m">jan/27</span><span className="bar"><i style={{ width: "23%" }}></i></span><span className="val">R$ 150,00</span></div>
                    <span className="cap">Exemplo: parcelas que já estão contratadas, mês a mês.</span>
                  </div>
                </div>
              </article>

        
              <article className="diff">
                <div className="copy">
                  <span className="tag">Diferencial 3 · Clareza</span>
                  <h3>Veja quanto cada gasto come da sua renda</h3>
                  <p>Mercado, gasolina, lazer, saúde, contas fixas: cada categoria com a porcentagem que ela leva do que você ganha. Em segundos você enxerga onde cortar, no celular ou no computador.</p>
                  <p className="dor">Sem isso: você corta o cafezinho e continua no vermelho, porque o problema estava em outro lugar.</p>
                  <ul className="checks">
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Gráficos por categoria com % sobre a renda</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Limite por categoria com alerta antes de estourar</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Fechamento do mês com relatório em PDF</li>
                  </ul>
                </div>
                <div className="chart3d">
                  <div className="chart-card" role="img" aria-label="Exemplo de gráfico: contas fixas 32%, alimentação 18%, cartões 14%, gasolina 7%, lazer 5% da renda">
                    <div className="t">Outubro · exemplo</div>
                    <div className="big">Você já usou <b>76%</b> da sua renda</div>
                    <div className="meter"><i></i></div>
                    <div className="bars">
                      <div className="col"><span className="pct">32%</span><div className="iso" style={{ "--h": "140px", "--c0": "#93c5fd", "--c1": "#3b82f6", "--c2": "#1d4ed8", "--c3": "#1e3a8a" } as React.CSSProperties}></div></div>
                      <div className="col"><span className="pct">18%</span><div className="iso" style={{ "--h": "79px", "--c0": "#6ee7b7", "--c1": "#34d399", "--c2": "#059669", "--c3": "#065f46" } as React.CSSProperties}></div></div>
                      <div className="col"><span className="pct">14%</span><div className="iso" style={{ "--h": "61px", "--c0": "#ddd6fe", "--c1": "#a78bfa", "--c2": "#7c3aed", "--c3": "#5b21b6" } as React.CSSProperties}></div></div>
                      <div className="col"><span className="pct">7%</span><div className="iso" style={{ "--h": "31px", "--c0": "#fde68a", "--c1": "#fbbf24", "--c2": "#d97706", "--c3": "#92400e" } as React.CSSProperties}></div></div>
                      <div className="col"><span className="pct">5%</span><div className="iso" style={{ "--h": "22px", "--c0": "#fbcfe8", "--c1": "#f472b6", "--c2": "#db2777", "--c3": "#9d174d" } as React.CSSProperties}></div></div>
                    </div>
                    <div className="labels"><span>Contas fixas</span><span>Alimen&shy;tação</span><span>Cartões</span><span>Gasolina</span><span>Lazer</span></div>
                    <div className="note">Mês que vem já tem <b>R$ 520,00</b> em parcelas de cartão.</div>
                  </div>
                </div>
              </article>

              <article className="diff flip">
                <div className="copy">
                  <span className="tag">Diferencial 4 · App no celular</span>
                  <h3>Você lança pelo WhatsApp e acompanha tudo no app do seu celular</h3>
                  <p>O Contay também é um app completo. Abra pelo navegador, adicione à tela inicial e ele passa a abrir como aplicativo, sem baixar nada da loja. No painel você vê quanto da renda já está comprometido, confere cada gasto e cuida de cartões, contas fixas e metas.</p>
                  <p className="dor">Sem isso: você anota, mas nunca olha o resultado. E o que você não enxerga continua escapando.</p>
                  <ul className="checks">
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Ícone na tela inicial, abre em tela cheia como um app</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Lance, edite e apague gastos direto no app, com ou sem WhatsApp</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Modo discreto: um toque esconde os valores da tela</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>A mesma conta no celular e no computador</li>
                  </ul>
                </div>
                <div className="appscene">
                  <div className="appshots">
                    <div className="appphone back">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/landing/app-categorias.webp" width={390} height={800} loading="lazy" alt="Tela do app Contay no celular com o gráfico de gastos por categoria" />
                    </div>
                    <div className="appphone">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/landing/app-painel.webp" width={390} height={800} loading="lazy" alt="Tela inicial do app Contay no celular: total comprometido no mês, porcentagem da renda e menu com Painel, Lançamentos, Cartões, Investimentos, Contas fixas e Fechamento" />
                    </div>
                  </div>
                  <div className="cap">Telas reais do app, com dados de exemplo.</div>
                </div>
              </article>
            </div>
          </div>
        </section>

  
        <section className="sec" id="comparacao" style={{ paddingTop: "24px" }}>
          <div className="wrap">
            <div className="sec-head center">
              <span className="eyebrow">Compare</span>
              <h2>Planilha, app comum ou Contay?</h2>
              <p>Todo mundo já tentou algum desses. Veja por que só um deles cabe no seu dia a dia.</p>
            </div>
            <div className="cmp">
              <div className="cmp-head"><div></div><div>Planilha</div><div>App de finanças comum</div><div className="us">Contay</div></div>
              <div className="cmp-row"><div className="f">Para lançar um gasto</div><div className="cmp-cells">
                <div className="cell"><span className="who">Planilha</span>Abrir o computador e digitar</div>
                <div className="cell"><span className="who">App comum</span>Abrir o app e preencher um formulário</div>
                <div className="cell us"><span className="who">Contay</span>Mandar uma mensagem no WhatsApp</div></div></div>
              <div className="cmp-row"><div className="f">Parcelas do cartão nos próximos meses</div><div className="cmp-cells">
                <div className="cell"><span className="who">Planilha</span>Fórmula feita à mão</div>
                <div className="cell"><span className="who">App comum</span>Muitas vezes só no plano mais caro</div>
                <div className="cell us"><span className="who">Contay</span>Somadas sozinhas, mês a mês</div></div></div>
              <div className="cmp-row"><div className="f">Fechamento da fatura do seu banco</div><div className="cmp-cells">
                <div className="cell"><span className="who">Planilha</span>Você calcula</div>
                <div className="cell"><span className="who">App comum</span>Varia de app para app</div>
                <div className="cell us"><span className="who">Contay</span>Você escolhe o dia e ele separa</div></div></div>
              <div className="cmp-row"><div className="f">Acesso à sua conta do banco</div><div className="cmp-cells">
                <div className="cell"><span className="who">Planilha</span>Não precisa</div>
                <div className="cell"><span className="who">App comum</span>Os planos automáticos se conectam ao seu banco</div>
                <div className="cell us"><span className="who">Contay</span>Nunca. Você só manda a mensagem</div></div></div>
              <div className="cmp-row"><div className="f">Forma de pagar</div><div className="cmp-cells">
                <div className="cell"><span className="who">Planilha</span>Grátis, mas dá trabalho manter</div>
                <div className="cell"><span className="who">App comum</span>Em geral cartão de crédito ou plano anual</div>
                <div className="cell us"><span className="who">Contay</span>Pix ou cartão de crédito, mensal e sem fidelidade</div></div></div>
            </div>
          </div>
        </section>

  
        <section className="sec" id="recursos" style={{ paddingTop: "24px" }}>
          <div className="wrap">
            <div className="sec-head center">
              <span className="eyebrow">Tudo incluído</span>
              <h2>Do cafezinho às parcelas do cartão, tudo num só lugar</h2>
            </div>
            <div className="feats">
              <div className="feat"><div className="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg></div><h3>Gastos do dia a dia</h3><p>Data da compra, vencimento, produto ou serviço e categoria: alimentação, saúde, lazer, compras pessoais, viagem, gasolina.</p></div>
              <div className="feat"><div className="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg></div><h3>Contas fixas</h3><p>Aluguel, internet, escola. Cadastre uma vez, com descrição e valor, e acrescente quantas quiser.</p></div>
              <div className="feat"><div className="ico g"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></div><h3>Investimentos e metas</h3><p>Registre seus aportes e acompanhe cada meta com barra de progresso até o objetivo.</p></div>
              <div className="feat"><div className="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5"/><circle cx="12" cy="12" r="3.5"/></svg></div><h3>Limites com alerta</h3><p>Defina quanto quer gastar em cada categoria e receba aviso antes de estourar.</p></div>
              <div className="feat"><div className="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div><h3>Fechamento do mês + PDF</h3><p>Quando o mês termina, o app pergunta se você quer encerrar. Resumo por categoria, parcelas que ainda faltam e relatório em PDF.</p></div>
              <div className="feat"><div className="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/></svg></div><h3>Manual e suporte no WhatsApp</h3><p>Ao entrar você recebe o manual em PDF. Ficou com dúvida? Pergunte no mesmo WhatsApp e a resposta vem na hora.</p></div>
              <div className="feat"><div className="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a9 9 0 0 1-2.2 3.3M6.3 6.3C4.2 7.8 3 10.2 3 12c0 2 4 7 9 7 1.6 0 3-.4 4.3-1.1"/></svg></div><h3>Modo discreto</h3><p>Um toque esconde todos os valores da tela. Ideal para abrir o app em público.</p></div>
              <div className="feat"><div className="ico g"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></div><h3>Dados protegidos</h3><p>Cada conta isolada, senha criptografada e tratamento de dados de acordo com a LGPD.</p></div>
            </div>
          </div>
        </section>

  
        <section className="sec" id="como-funciona" style={{ paddingTop: "24px" }}>
          <div className="wrap">
            <div className="sec-head center">
              <span className="eyebrow">Como funciona</span>
              <h2>Em 3 passos você começa hoje</h2>
            </div>
            <div className="steps">
              <div className="step"><div className="n">1</div><h3>Crie sua conta</h3><p>Nome, e-mail, WhatsApp e CPF. Leva menos de um minuto.</p></div>
              <div className="step"><div className="n">2</div><h3>Pague com Pix ou cartão</h3><p>No cartão de crédito a mensalidade é cobrada sozinha todo mês. Pagou, o acesso é liberado em segundos e o manual chega no seu WhatsApp.</p></div>
              <div className="step"><div className="n">3</div><h3>Mande seu primeiro gasto</h3><p>Pelo WhatsApp ou direto no app. Ele organiza, soma e mostra para onde vai o seu dinheiro.</p></div>
            </div>
          </div>
        </section>

  
        <section className="sec" id="preco" style={{ paddingTop: "24px" }}>
          <div className="wrap">
            <div className="price-wrap">
              <div>
                <div className="sec-head" style={{ marginBottom: "24px" }}>
                  <span className="eyebrow pain">Faça a conta</span>
                  <h2>Quanto custa continuar sem controle?</h2>
                  <p>O descontrole cobra todo mês, só que escondido. Compare:</p>
                </div>
                <div className="anchor">
                  <div className="it"><span>Uma conta paga com atraso (multa + juros)</span><b>dinheiro jogado fora</b></div>
                  <div className="it"><span>Uma fatura de R$ 1.000 que cai no rotativo por um mês</span><b>mais de R$ 100 em juros</b></div>
                  <div className="it"><span>Parcelas esquecidas que apertam o mês seguinte</span><b>cheque especial</b></div>
                  <div className="it ok"><span>Saber para onde vai cada real, todo mês</span><b>menos de R$ 1 por dia</b></div>
                  <span className="foot">Juros do rotativo acima de 400% ao ano segundo o Banco Central; o valor exato varia por banco.</span>
                </div>
              </div>
              <div className="plan-scene">
                <div className="plan">
                  <div className="row"><strong style={{ color: "var(--text)", fontSize: "19px" }}>Contay</strong><span className="pill">Plano único</span></div>
                  <div className="amount"><span className="rs">R$</span><span className="v">{PRICE_NUMBER}</span><span className="per">/mês</span></div>
                  <div className="day">Menos de R$ 1 por dia para ter controle total.</div>
                  <ul className="checks">
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Lançamento pelo WhatsApp com inteligência artificial</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Cartões, parcelas e fechamento de fatura</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Contas fixas, investimentos e metas</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Gráficos com % da renda e limites com alerta</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Fechamento do mês e relatório em PDF</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Celular e computador, lançamentos ilimitados</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Manual em PDF e suporte pelo WhatsApp</li>
                    <li><svg width="18" height="18"><use href="#lp-ck"/></svg>Pague com Pix ou cartão de crédito recorrente</li>
                  </ul>
                  <Link className="btn btn-cta" href="/registrar">Quero esse app <span aria-hidden="true">→</span></Link>
                  <p className="fine">Pix ou cartão de crédito (cobrança automática), todo mês no dia em que você contratou. Sem fidelidade.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

  
        <section className="sec" id="duvidas" style={{ paddingTop: "24px" }}>
          <div className="wrap">
            <div className="sec-head center"><span className="eyebrow">Dúvidas</span><h2>Perguntas frequentes</h2></div>
            <div className="faq">
              <details><summary>Como funciona o lançamento pelo WhatsApp?<span className="pl" aria-hidden="true">+</span></summary><p>No cadastro você informa seu WhatsApp. Depois é só mandar uma mensagem para o número do Contay, do jeito que você fala: “gastei 30 na padaria”, “paguei 200 de luz”, “400 no cartão em 4x”. A inteligência artificial entende o valor, a categoria e as parcelas, lança no app e responde confirmando.</p></details>
              <details><summary>Preciso dar a senha do meu banco?<span className="pl" aria-hidden="true">+</span></summary><p>Não. O Contay não se conecta à sua conta bancária. Você informa os gastos pelo WhatsApp ou pelo app, e só você decide o que entra.</p></details>
              <details><summary>Preciso instalar alguma coisa?<span className="pl" aria-hidden="true">+</span></summary><p>Não precisa baixar nada da loja. O Contay abre no navegador do celular ou do computador. Para ter o ícone na tela inicial e abrir como aplicativo: no Android (Chrome), toque no menu e em “Adicionar à tela inicial”; no iPhone (Safari), toque em Compartilhar e em “Adicionar à Tela de Início”.</p></details>
              <details><summary>Como é feita a cobrança?<span className="pl" aria-hidden="true">+</span></summary><p>{PRICE} por mês, no Pix ou no cartão de crédito, você escolhe. No cartão, a mensalidade é cobrada automaticamente todo mês, no mesmo dia em que você contratou. No Pix, alguns dias antes do vencimento aparece um aviso dentro do app com o Pix pronto para pagar. Dá para trocar do Pix para o cartão quando quiser.</p></details>
              <details><summary>E se eu atrasar o pagamento?<span className="pl" aria-hidden="true">+</span></summary><p>Você tem 3 dias de tolerância depois do vencimento. Depois disso o acesso fica pausado, sem perder nenhum dado, e volta automaticamente assim que o pagamento é confirmado.</p></details>
              <details><summary>Tem fidelidade? Posso cancelar?<span className="pl" aria-hidden="true">+</span></summary><p>Não tem fidelidade. Para cancelar, é só falar com o nosso suporte pelo WhatsApp. Você continua usando até o fim do mês que já pagou.</p></details>
              <details><summary>E se eu tiver dúvida para usar?<span className="pl" aria-hidden="true">+</span></summary><p>Pergunte no mesmo WhatsApp em que você lança os gastos, por exemplo “como cadastro um cartão?”. A resposta vem na hora, com base no manual. Quando o caso precisa de uma pessoa, um atendente continua a conversa. O <Link href="/manual">manual completo</Link> também fica disponível no app, em Ajuda.</p></details>
              <details><summary>Meus dados ficam seguros?<span className="pl" aria-hidden="true">+</span></summary><p>Sim. Cada conta é isolada no banco de dados, a senha é guardada criptografada e seus lançamentos não são vendidos nem repassados a anunciantes. Para a cobrança, só nome, CPF, e-mail e WhatsApp vão para o Asaas, a instituição que processa o pagamento. Os dados do cartão são digitados direto na página segura do Asaas: o Contay não vê nem guarda.</p></details>
            </div>
          </div>
        </section>

  
        <section className="sec" id="privacidade" style={{ paddingTop: "24px" }}>
          <div className="wrap">
            <div className="sec-head center">
              <span className="eyebrow">Privacidade e proteção de dados</span>
              <h2>Seu dinheiro é assunto seu</h2>
              <p>O Contay segue a LGPD, a lei brasileira de proteção de dados. Na prática, isso quer dizer:</p>
            </div>
            <div className="feats three">
              <div className="feat"><div className="ico g"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></div><h3>Só você vê os seus gastos</h3><p>Cada conta fica isolada das outras. Nenhum outro cliente enxerga os seus lançamentos, e a sua senha é guardada embaralhada: nem a gente consegue ler.</p></div>
              <div className="feat"><div className="ico g"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a9 9 0 0 1-2.2 3.3M6.3 6.3C4.2 7.8 3 10.2 3 12c0 2 4 7 9 7 1.6 0 3-.4 4.3-1.1" /></svg></div><h3>Ninguém fica olhando a sua vida financeira</h3><p>O painel da nossa equipe mostra só o seu cadastro e a situação da assinatura. Acesso técnico só acontece quando é preciso corrigir um problema ou te dar suporte.</p></div>
              <div className="feat"><div className="ico g"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" /></svg></div><h3>Sem senha de banco</h3><p>O Contay não se conecta à sua conta bancária e nunca pede senha de banco. Só entra no app o que você mesmo lançar.</p></div>
              <div className="feat"><div className="ico g"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg></div><h3>Não vendemos os seus dados</h3><p>Seus dados financeiros não são vendidos nem vão para anunciantes. Eles só passam pelos serviços que fazem o Contay funcionar. Para a cobrança, só nome, CPF, e-mail e WhatsApp seguem para o Asaas.</p></div>
              <div className="feat"><div className="ico g"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19" /><path d="M7 15h3" /></svg></div><h3>Seu cartão não passa por nós</h3><p>Se pagar com cartão de crédito, os dados são digitados direto na página segura do Asaas. O Contay não vê nem guarda o número do cartão.</p></div>
              <div className="feat"><div className="ico g"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg></div><h3>A lei está do seu lado</h3><p>A LGPD garante que você pode pedir uma cópia dos seus dados, corrigir o que estiver errado ou apagar a sua conta quando quiser. É só falar com o suporte.</p></div>
            </div>
            <p className="priv-note">
              Os gastos que você manda pelo WhatsApp passam pelo número de atendimento do Contay e por serviços de tecnologia, incluindo inteligência artificial do Google, que leem a mensagem para fazer o lançamento. Os detalhes estão nos <Link href="/termos">Termos de Uso e Política de Privacidade</Link>.
            </p>
          </div>
        </section>

        <section className="sec" style={{ paddingTop: "8px" }}>
          <div className="wrap">
            <div className="final">
              <h2>Daqui a 30 dias você pode estar no mesmo lugar. Ou pode saber exatamente para onde foi cada real.</h2>
              <p>Crie sua conta, pague com Pix ou cartão e mande seu primeiro gasto pelo WhatsApp em menos de 5 minutos.</p>
              <Link className="btn btn-cta" href="/registrar">Quero ter controle agora <span aria-hidden="true">→</span></Link>
              <div className="fine">{PRICE}/mês · Pix ou cartão de crédito · sem fidelidade</div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <a className="logo" href="#topo" style={{ fontSize: "15px" }}><LogoSymbol size={26} /><span>Con<b>tay</b></span></a>
          <div style={{ display: "flex", gap: "18px" }}>
            <Link href="/manual">Manual</Link>
            <Link href="/termos">Termos e Privacidade</Link>
            <Link href="/login">Entrar</Link>
          </div>
          <div>© 2026 Contay</div>
        </div>
      </footer>

      <LandingEffects />
    </div>
  );
}
