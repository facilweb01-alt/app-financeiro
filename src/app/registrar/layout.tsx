import { connection } from "next/server";
import { CookieBanner, MetaPixel } from "@/components/tracking/MetaPixel";
import { metaPixelId } from "@/lib/metaPixelId";

// A página de cadastro é um componente de navegador; este layout existe só
// para ler o ID do pixel no servidor e ligar a medição de anúncios (que só
// funciona para quem aceitou os cookies — ver components/tracking).
export default async function RegistrarLayout({ children }: { children: React.ReactNode }) {
  // Lê a variável a cada visita (e não na hora do build).
  await connection();
  const pixelId = metaPixelId();
  return (
    <>
      {children}
      <MetaPixel pixelId={pixelId} />
      <CookieBanner pixelId={pixelId} />
    </>
  );
}
