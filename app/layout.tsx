import type { Metadata, Viewport } from "next";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cyberpunk Lore",
  description: "An unofficial, fan-made timeline of the Cyberpunk world for people who watched Edgerunners.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07070b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="scanlines antialiased">{children}</body>
    </html>
  );
}
