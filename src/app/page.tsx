import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/dal";
import { LandingPage } from "@/components/landing/LandingPage";
import { CookieBanner, MetaPixel } from "@/components/tracking/MetaPixel";
import { metaPixelId } from "@/lib/metaPixelId";
import { registerHrefWithSource } from "@/lib/business/signupSource";

export const metadata: Metadata = {
  title: "Contay — controle financeiro pelo WhatsApp",
  description:
    "Controle seus gastos e as parcelas do cartão mandando um áudio, texto ou foto do cupom no WhatsApp. Teste 7 dias grátis, sem cartão. Plano anual de R$ 97.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Contay — saiba para onde vai cada real",
    description:
      "Gastos e parcelas do cartão pelo WhatsApp, por áudio, texto ou foto. Teste 7 dias grátis, sem cartão.",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
    locale: "pt_BR",
    type: "website",
  },
};

// "/" é a página de vendas para quem não está logado; quem já tem sessão vai
// direto para o app.
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getOptionalSession();
  if (session) redirect("/dashboard");
  const pixelId = metaPixelId();
  // Quem chega por um anúncio traz "utm_*" no endereço; os botões de cadastro
  // levam isso adiante para o cadastro saber de qual anúncio a pessoa veio.
  const registerHref = registerHrefWithSource(await searchParams);
  return (
    <>
      <LandingPage pixelId={pixelId} registerHref={registerHref} />
      <MetaPixel pixelId={pixelId} events={[{ name: "ViewContent", params: { content_name: "Página de vendas" } }]} />
      <CookieBanner pixelId={pixelId} />
    </>
  );
}
