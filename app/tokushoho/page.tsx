import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 — Sync Couple",
  description: "Sync Couple の特定商取引法に基づく表記です。",
};

// ── 表示データ ────────────────────────────────────────────
const items: { label: string; value: string | React.ReactNode }[] = [
  { label: "販売業者", value: "Sync Couple 運営者" },
  { label: "代表者", value: "非公開（請求があれば遅滞なく開示します）" },
  { label: "所在地", value: "非公開（請求があれば遅滞なく開示します）" },
  { label: "電話番号", value: "非公開（請求があれば遅滞なく開示します）" },
  {
    label: "お問い合わせ先",
    value: (
      <a href="mailto:info@synccoupleapp.com" className="text-rose-500 hover:underline">
        info@synccoupleapp.com
      </a>
    ),
  },
  { label: "サービス名", value: "Sync Couple（ふたりのきもち）" },
  { label: "サービスURL", value: "https://synccoupleapp.com" },
  {
    label: "販売価格",
    value: "現在は無料で提供しています。今後、有料プランを追加する場合は事前にユーザーへ通知します。",
  },
  { label: "支払い方法", value: "現在は無料のため、お支払いは発生しません。" },
  { label: "支払い時期", value: "現在は無料のため、該当しません。" },
  {
    label: "サービス提供時期",
    value: "利用登録完了後、直ちにご利用いただけます。",
  },
  {
    label: "返金・キャンセル",
    value:
      "デジタルサービスの性質上、提供開始後の返金はお受けしかねます。退会はいつでも可能です。",
  },
  {
    label: "動作環境",
    value:
      "インターネット接続環境・最新のWebブラウザ（Chrome / Safari / Firefox 等）が必要です。アプリのインストールは不要です。",
  },
];

export default function TokushohoPage() {
  return (
    <div
      className="min-h-screen bg-white text-gray-800"
      style={{ fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif" }}
    >
      {/* ヘッダー */}
      <header className="border-b border-rose-100 bg-white/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/lp" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="Sync Couple" className="w-8 h-8 rounded-xl object-cover" />
            <span className="font-bold text-gray-900 text-lg tracking-tight">Sync Couple</span>
          </Link>
          <Link href="/lp" className="text-sm text-rose-500 hover:text-rose-600 font-medium">
            ← トップに戻る
          </Link>
        </div>
      </header>

      {/* 本文 */}
      <main className="max-w-3xl mx-auto px-5 py-12 md:py-16">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          特定商取引法に基づく表記
        </h1>
        <p className="text-sm text-gray-500 mb-10">最終更新日：2025年1月1日</p>

        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          {items.map(({ label, value }, i) => (
            <div
              key={i}
              className={`flex flex-col sm:flex-row ${
                i !== items.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <dt className="sm:w-48 shrink-0 px-5 py-4 bg-gray-50 text-sm font-semibold text-gray-700">
                {label}
              </dt>
              <dd className="flex-1 px-5 py-4 text-sm text-gray-700 leading-relaxed">{value}</dd>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-gray-500 leading-relaxed">
          代表者・所在地・電話番号の開示をご希望の場合は、
          <a href="mailto:info@synccoupleapp.com" className="text-rose-500 hover:underline">
            info@synccoupleapp.com
          </a>
          までご連絡ください。遅滞なく開示いたします。
        </p>
      </main>

      <footer className="border-t border-gray-100 py-8 text-center text-xs text-gray-400">
        © 2025 Sync Couple. All rights reserved.
      </footer>
    </div>
  );
}
