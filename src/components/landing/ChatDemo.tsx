"use client";

import { useEffect, useRef, useState } from "react";

// Demonstração animada do lançamento pelo WhatsApp (página de vendas,
// Diferencial 1). A pessoa escolhe um exemplo e vê, em sequência: a mensagem
// dela, o Contay "digitando", a resposta e o que aparece no app.
//
// - É ilustrativa (o aviso fica logo abaixo): os textos seguem o que o Contay
//   de verdade entende e responde (gasto do dia, compra parcelada no cartão,
//   categoria nova e dúvida respondida com o manual).
// - Sem JavaScript, ou com "reduzir movimento" ligado, o primeiro exemplo
//   aparece inteiro e parado; as abas continuam trocando o exemplo.
// - Passa sozinha de um exemplo para o outro enquanto está na tela e a pessoa
//   ainda não tocou em nenhuma aba.

type AppRow = { label: string; detail: string; value: string };

type Scenario = {
  key: string;
  tab: string;
  me: string;
  time: string;
  botTitle: string;
  botLines: string[];
  appTitle: string;
  appRows: AppRow[];
  appFoot: { label: string; value: string };
};

const SCENARIOS: Scenario[] = [
  {
    key: "gasto",
    tab: "Gasto do dia",
    me: "gastei 45 no mercado",
    time: "12:41",
    botTitle: "✅ Lançamento registrado!",
    botLines: ["Mercado · R$ 45,00", "Categoria: Compra de alimentos"],
    appTitle: "Lançamentos de hoje",
    appRows: [{ label: "Mercado", detail: "Compra de alimentos", value: "R$ 45,00" }],
    appFoot: { label: "Compra de alimentos no mês", value: "R$ 612,00" },
  },
  {
    key: "parcelado",
    tab: "Compra parcelada",
    me: "400 no cartão azul em 4x",
    time: "18:03",
    botTitle: "💳 Compra no cartão registrada!",
    botLines: ["Cartão Azul · 4x de R$ 100,00", "1ª parcela na fatura de novembro"],
    appTitle: "Parcelas nos próximos meses",
    appRows: [
      { label: "Novembro", detail: "Cartão Azul · parcela 1/4", value: "R$ 100,00" },
      { label: "Dezembro", detail: "Cartão Azul · parcela 2/4", value: "R$ 100,00" },
      { label: "Janeiro", detail: "Cartão Azul · parcela 3/4", value: "R$ 100,00" },
    ],
    appFoot: { label: "Ainda a vencer desta compra", value: "R$ 400,00" },
  },
  {
    key: "categoria",
    tab: "Categoria nova",
    me: "ração 80 categoria pet",
    time: "09:12",
    botTitle: "✅ Lançamento registrado!",
    botLines: ["Ração · R$ 80,00", "Categoria nova criada: Pet"],
    appTitle: "Gastos por categoria",
    appRows: [
      { label: "Pet", detail: "categoria criada agora", value: "R$ 80,00" },
      { label: "Compra de alimentos", detail: "no mês", value: "R$ 612,00" },
    ],
    appFoot: { label: "Você cria quantas categorias quiser", value: "" },
  },
  {
    key: "duvida",
    tab: "Tirar dúvida",
    me: "como cadastro um cartão?",
    time: "20:15",
    botTitle: "No app, toque em Cartões e em Novo cartão.",
    botLines: ["Informe o nome, o dia do fechamento e o dia do vencimento.", "📘 Manual completo: contay.com.br/manual"],
    appTitle: "Suporte na mesma conversa",
    appRows: [
      { label: "Resposta na hora", detail: "com base no manual do Contay", value: "" },
      { label: "Precisa de uma pessoa?", detail: "um atendente continua a conversa", value: "" },
    ],
    appFoot: { label: "Sem abrir chamado, sem esperar e-mail", value: "" },
  },
];

// Fases de cada exemplo: 0 nada · 1 mensagem da pessoa · 2 digitando · 3 resposta · 4 app atualizado
const FINAL_PHASE = 4;
const PHASE_DELAYS = [450, 800, 1100, 600]; // tempo até a fase seguinte
const NEXT_SCENARIO_AFTER = 4200;

export function ChatDemo() {
  const [index, setIndex] = useState(0);
  // Começa completo: é o que o servidor entrega e o que fica sem JavaScript.
  const [phase, setPhase] = useState(FINAL_PHASE);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const [animate, setAnimate] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Só anima se a pessoa não pediu "reduzir movimento".
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Lido depois de montar: a preferência só existe no navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnimate(!reduce);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => setInView(entries[0].isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Primeira vez que entra na tela: toca o primeiro exemplo do começo.
  useEffect(() => {
    if (!animate || !inView || started.current) return;
    started.current = true;
    setPhase(0);
  }, [animate, inView]);

  // Avança as fases e, no fim, passa para o próximo exemplo (se ninguém tocou).
  useEffect(() => {
    if (!animate || !inView) return;
    if (phase < FINAL_PHASE) {
      const t = setTimeout(() => setPhase((p) => Math.min(FINAL_PHASE, p + 1)), PHASE_DELAYS[phase]);
      return () => clearTimeout(t);
    }
    if (!auto || !started.current) return;
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % SCENARIOS.length);
      setPhase(0);
    }, NEXT_SCENARIO_AFTER);
    return () => clearTimeout(t);
  }, [animate, inView, phase, auto]);

  const choose = (i: number) => {
    setAuto(false);
    started.current = true;
    setIndex(i);
    setPhase(animate ? 0 : FINAL_PHASE);
  };

  const s = SCENARIOS[index];

  return (
    <div className="demo" ref={rootRef} data-testid="chat-demo" data-phase={phase} data-scenario={s.key}>
      <div className="demo-tabs" role="tablist" aria-label="Exemplos de mensagens para o Contay">
        {SCENARIOS.map((sc, i) => (
          <button
            key={sc.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`demo-tab${i === index ? " on" : ""}`}
            onClick={() => choose(i)}
          >
            {sc.tab}
          </button>
        ))}
      </div>

      <div className="demo-phone" role="tabpanel" aria-live="polite">
        <div className="chat-head">
          <span className="demo-avatar" aria-hidden="true">C</span>
          <div>
            <div className="n">Contay</div>
            <div className="s">{phase === 2 ? "digitando…" : "online"}</div>
          </div>
        </div>
        <div className="chat demo-chat">
          {phase >= 1 && (
            <div className="b me demo-in" key={`${s.key}-me`}>
              {s.me}
              <small>{s.time} ✓✓</small>
            </div>
          )}
          {phase === 2 && (
            <div className="b bot demo-typing demo-in" aria-label="Contay está digitando" key={`${s.key}-typing`}>
              <i></i>
              <i></i>
              <i></i>
            </div>
          )}
          {phase >= 3 && (
            <div className="b bot demo-in" key={`${s.key}-bot`}>
              <strong>{s.botTitle}</strong>
              {s.botLines.map((line) => (
                <span className="demo-line" key={line}>
                  {line}
                </span>
              ))}
              <small>{s.time}</small>
            </div>
          )}
        </div>
      </div>

      <div className={`demo-app${phase >= FINAL_PHASE ? " on" : ""}`} aria-hidden={phase < FINAL_PHASE}>
        <div className="demo-app-head">
          <span className="demo-dot" aria-hidden="true"></span>
          No app, na mesma hora
        </div>
        <div className="demo-app-title">{s.appTitle}</div>
        <ul>
          {s.appRows.map((row) => (
            <li key={row.label}>
              <span>
                <b>{row.label}</b>
                <em>{row.detail}</em>
              </span>
              {row.value && <strong>{row.value}</strong>}
            </li>
          ))}
        </ul>
        <div className="demo-app-foot">
          <span>{s.appFoot.label}</span>
          {s.appFoot.value && <b>{s.appFoot.value}</b>}
        </div>
      </div>

      <p className="demo-note">Demonstração ilustrativa. Os valores são exemplos.</p>
    </div>
  );
}
