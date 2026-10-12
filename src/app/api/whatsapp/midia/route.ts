import * as z from "zod";
import { NextRequest, NextResponse } from "next/server";
import { buildMediaReply, type LaunchResult } from "@/lib/business/whatsappMedia";
import { MediaError, downloadMedia, interpretMedia, isMediaConfigured, senderAccess } from "@/lib/whatsapp/media";
import { POST as launch } from "../lancamento/route";

// Áudio e imagem pelo WhatsApp (11/10/2026).
//
// Quem chama: o n8n, quando a mensagem recebida do Z-API é um áudio ou uma
// imagem (nota, cupom, comprovante). Ele manda só o endereço do arquivo; o
// app baixa, pede à IA para ouvir/ler, grava o lançamento pelo MESMO caminho
// das mensagens de texto (/api/whatsapp/lancamento, com todas as regras:
// conta vinculada, teste grátis, cartão, parcelas, categoria, mês encerrado)
// e devolve em "reply" o texto pronto para o n8n responder no WhatsApp.
//
// Autenticação: a mesma do lançamento ("Authorization: Bearer
// <WHATSAPP_WEBHOOK_SECRET>"). Precisa de GEMINI_API_KEY no app; sem ela a
// rota responde 503 com um "reply" pedindo para mandar por texto.
//
// O arquivo não é guardado: fica só na memória durante a chamada.

export const maxDuration = 60;

const BodySchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((v) => /^\d{10,20}$/.test(v.replace(/\D/g, "")), "Telefone inválido."),
  kind: z.enum(["audio", "image"], { message: "Tipo precisa ser audio ou image." }),
  mediaUrl: z.string().trim().min(8, "Informe o endereço do arquivo.").max(2000, "Endereço do arquivo muito longo."),
  mimeType: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().slice(0, 100))),
  caption: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().slice(0, 500))),
});

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "Integração com WhatsApp ainda não configurada neste ambiente (WHATSAPP_WEBHOOK_SECRET ausente)." }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const providedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição precisa ser JSON." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const data = parsed.data;
  const kind = data.kind;

  if (!isMediaConfigured()) {
    return NextResponse.json(
      {
        error: "Áudio e imagem ainda não estão ligados neste ambiente (GEMINI_API_KEY ausente).",
        reply: `Ainda não consigo ${kind === "audio" ? "ouvir áudio" : "ler imagem"} por aqui. Mande o gasto por texto, por exemplo: “gastei 45 no mercado”.`,
      },
      { status: 503 }
    );
  }

  // Antes de gastar uma chamada à IA: quem mandou tem conta e acesso?
  const access = await senderAccess(data.phone);
  if (access === "sem_conta") {
    const error = "Nenhuma conta vinculada a este WhatsApp. No app, vá na aba Fechamento e toque em \"Vincular pelo WhatsApp\".";
    return NextResponse.json({ error, needsLink: true, reply: error }, { status: 404 });
  }
  if (access !== "ok") {
    const error =
      access === "teste_encerrado"
        ? "Seu teste grátis do Contay terminou. Para continuar lançando, assine em contay.com.br/assinatura (seus lançamentos estão guardados)."
        : "Acesso a esta conta não está ativo no momento.";
    return NextResponse.json({ error, ...(access === "teste_encerrado" ? { reason: "trial_ended" } : {}), reply: error }, { status: 403 });
  }

  let answer;
  try {
    const file = await downloadMedia(kind, data.mediaUrl, data.mimeType);
    answer = await interpretMedia({ kind, base64: file.base64, mime: file.mime, caption: data.caption });
  } catch (err) {
    if (err instanceof MediaError) {
      console.error(`[whatsapp-midia] ${err.where}: ${err.message}`);
      const reply =
        err.where === "arquivo"
          ? `Não consegui abrir ${kind === "audio" ? "esse áudio" : "essa imagem"} (${err.message.replace(/\.$/, "")}). Mande de novo ou escreva o gasto por texto.`
          : "Estou recebendo muitas mensagens agora e não consegui processar. Mande de novo em 1 minuto ou escreva o gasto por texto.";
      return NextResponse.json({ error: err.message, reply }, { status: err.where === "arquivo" ? 422 : 502 });
    }
    console.error("[whatsapp-midia] erro inesperado:", err);
    return NextResponse.json({ error: "Erro interno ao processar o arquivo.", reply: "Não consegui processar agora. Mande de novo em 1 minuto ou escreva o gasto por texto." }, { status: 500 });
  }

  if (answer.type !== "lancamento") {
    const outcome = answer.type === "duvida" ? "duvida" : "nada";
    return NextResponse.json(
      { ok: true, kind: outcome === "duvida" ? "duvida" : "nao_entendi", transcript: answer.transcript, reply: buildMediaReply({ kind, outcome, transcript: answer.transcript }) },
      { status: 200 }
    );
  }

  // Grava pelo mesmo caminho do texto: uma chamada interna ao endpoint de
  // lançamento, com o mesmo segredo e o remetente original.
  const inner = new NextRequest(new URL("/api/whatsapp/lancamento", request.url), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${expectedSecret}` },
    body: JSON.stringify({
      phone: data.phone,
      description: answer.description,
      amount: answer.amount,
      categoryKey: answer.categoryKey,
      categoryName: answer.categoryName,
      purchaseDate: answer.purchaseDate,
      dueDate: answer.dueDate,
      paymentMethod: answer.paymentMethod,
      cardName: answer.cardName,
      installments: answer.installments,
    }),
  });
  const res = await launch(inner);
  const body = (await res.json().catch(() => ({}))) as LaunchResult & { error?: string };
  if (res.status !== 201) {
    return NextResponse.json(
      {
        ...body,
        transcript: answer.transcript,
        reply: buildMediaReply({ kind, outcome: "erro", transcript: answer.transcript, error: body.error }),
      },
      { status: res.status }
    );
  }
  return NextResponse.json(
    { ...body, source: kind, transcript: answer.transcript, reply: buildMediaReply({ kind, outcome: "lancado", transcript: answer.transcript, launch: body }) },
    { status: 201 }
  );
}
