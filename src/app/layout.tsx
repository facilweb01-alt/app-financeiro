import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { publicAppUrl } from "@/lib/appUrl";

export const metadata: Metadata = {
  // Base dos links absolutos (imagem de compartilhamento, canonical).
  metadataBase: new URL(publicAppUrl()),
  title: "Contay",
  description: "Controle financeiro pessoal — lançamentos, cartões, investimentos e contas fixas.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Contay",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a1128",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-navy-950 text-navy-100 font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
