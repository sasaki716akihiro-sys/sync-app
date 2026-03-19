// app/layout.tsx
import type { Metadata } from "next";
import { Lora, Nunito } from "next/font/google";
import "./globals.css";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  weight: ["400", "500", "600", "700"],
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Sync — ふたりのきもち",
  description: "パートナーとの気持ちをシンクロさせるアプリ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${lora.variable} ${nunito.variable}`}>
      <body style={{ backgroundColor: "var(--bg-main)", color: "var(--text-main)" }}>
        {children}
      </body>
    </html>
  );
}