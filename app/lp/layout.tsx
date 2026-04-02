import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://synccoupleapp.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Sync Couple — ふたりの気持ちをやさしくつなぐアプリ",
  description:
    "毎日1タップで、パートナーとの気持ちをシンクロ。生理周期の共有やリアルタイム通知で、夫婦のすれ違いをやさしく減らします。インストール不要・完全無料。",
  openGraph: {
    title: "Sync Couple — ふたりの気持ちをやさしくつなぐアプリ",
    description:
      "毎日1タップで、パートナーとの気持ちをシンクロ。夫婦のすれ違いをやさしく減らします。インストール不要・完全無料。",
    url: `${siteUrl}/lp`,
    siteName: "Sync Couple",
    images: [
      {
        url: "/images/hero-main.png",
        width: 1200,
        height: 630,
        alt: "Sync Couple — ふたりのきもち",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sync Couple — ふたりの気持ちをやさしくつなぐアプリ",
    description:
      "毎日1タップで、パートナーとの気持ちをシンクロ。夫婦のすれ違いをやさしく減らします。",
    images: ["/images/hero-main.png"],
  },
};

export default function LpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
