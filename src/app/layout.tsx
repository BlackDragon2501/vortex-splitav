import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vórtex Split AV - Corta y une video y audio, sin límites",
  description: "Vórtex Split AV, de Vortex Company: corta y une video o audio por rangos de tiempo exactos con FFmpeg WebAssembly corriendo dentro de tu navegador. Tus archivos nunca salen de tu equipo. Gratis, sin anuncios y 100% local.",
  keywords: ["Vórtex Split AV", "cortar video", "unir videos", "cortar audio", "FFmpeg WebAssembly", "editor video online", "sin anuncios"],
  authors: [{ name: "Vortex Company" }],
  icons: {
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#161616"/><circle cx="24" cy="24" r="17" fill="none" stroke="#8b5cf6" stroke-width="3.5"/><path d="M24 10a14 14 0 1 1-9.9 4.1" fill="none" stroke="#a78bfa" stroke-width="3.5" stroke-linecap="round"/><path d="M24 17a7 7 0 1 0 7 7" fill="none" stroke="#a78bfa" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="24" r="3" fill="#a78bfa"/></svg>`
      ),
  },
  openGraph: {
    title: "Vórtex Split AV - Corta y une video y audio, sin límites",
    description: "Vórtex Split AV, de Vortex Company: corta y une video o audio por rangos de tiempo exactos con FFmpeg WebAssembly corriendo dentro de tu navegador. Tus archivos nunca salen de tu equipo. Gratis, sin anuncios y 100% local.",
    siteName: "Vórtex Split AV - Corta y une video y audio, sin límites",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0f10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-[#0f0f10] text-[#ececf1]">{children}</body>
    </html>
  );
}
