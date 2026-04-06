import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約 — Sync Couple",
  description: "Sync Couple サービスの利用規約です。",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-800" style={{ fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif" }}>

      {/* ヘッダー */}
      <header className="border-b border-rose-100 bg-white/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/lp" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="Sync Couple" className="w-8 h-8 rounded-xl object-cover" />
            <span className="font-bold text-gray-900 text-lg tracking-tight">Sync Couple</span>
          </Link>
          <Link href="/lp" className="text-sm text-rose-500 hover:text-rose-600 font-medium">← トップに戻る</Link>
        </div>
      </header>

      {/* 本文 */}
      <main className="max-w-3xl mx-auto px-5 py-12 md:py-16">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">利用規約</h1>
        <p className="text-sm text-gray-500 mb-10">最終更新日：2026年4月6日</p>

        <div className="prose prose-sm md:prose-base max-w-none space-y-8 text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第1条（適用）</h2>
            <p>本利用規約（以下「本規約」）は、Sync Couple（以下「当サービス」）の利用に関する条件を定めるものです。ユーザーは、本規約に同意のうえ当サービスをご利用ください。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第2条（利用登録）</h2>
            <p>当サービスへの登録は、本規約に同意したうえで所定の方法により申請し、運営者が承認した時点で完了します。以下に該当する場合、登録を拒否することがあります。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>虚偽の情報を申請した場合</li>
              <li>過去に本規約違反等により利用停止処分を受けた場合</li>
              <li>その他、運営者が不適切と判断した場合</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第3条（禁止事項）</h2>
            <p>ユーザーは以下の行為を行ってはなりません。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>法令または公序良俗に違反する行為</li>
              <li>他のユーザーまたは第三者の権利を侵害する行為</li>
              <li>当サービスの運営を妨害する行為</li>
              <li>不正アクセスまたはこれに類する行為</li>
              <li>当サービスを商業目的で無断利用する行為</li>
              <li>その他、運営者が不適切と判断する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第4条（サービスの提供・変更・停止）</h2>
            <p>運営者は、事前の通知なくサービスの内容を変更・追加・停止することがあります。これによりユーザーに損害が生じても、運営者は責任を負いません。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第5条（個人情報の取り扱い）</h2>
            <p>個人情報の取り扱いについては、別途定める<Link href="/privacy" className="text-rose-500 hover:underline">プライバシーポリシー</Link>に従います。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第6条（免責事項）</h2>
            <p>当サービスは現状のまま提供されます。運営者は、当サービスの完全性・正確性・有用性について保証しません。当サービスの利用により生じた損害について、運営者は一切の責任を負いません。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第7条（サービスの利用料金）</h2>
            <p>当サービスは現在無料で提供しています。今後、有料プランを追加する場合は、事前にユーザーへ通知します。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第8条（退会）</h2>
            <p>ユーザーはいつでも所定の手続きにより退会できます。退会後はアカウントおよびデータが削除されます。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第9条（規約の変更）</h2>
            <p>運営者は、必要と判断した場合、本規約を変更することができます。変更後の規約は当サービス上に掲示した時点から効力を生じます。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">第10条（準拠法・管轄）</h2>
            <p>本規約の解釈は日本法に準拠します。紛争が生じた場合、東京地方裁判所を第一審の専属的合意管轄とします。</p>
          </section>

          <section className="border-t border-gray-200 pt-6">
            <p className="text-sm text-gray-500">お問い合わせ：<a href="https://docs.google.com/forms/d/e/1FAIpQLSdeRI32etS8-oM9DFp_xm-eyvP312w0ONt9vVYD3uiLsjM1Yw/viewform" target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:underline">お問い合わせフォーム</a></p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 py-8 text-center text-xs text-gray-400">
        © 2025 Sync Couple. All rights reserved.
      </footer>
    </div>
  );
}
