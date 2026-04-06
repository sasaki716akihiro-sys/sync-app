import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー — Sync Couple",
  description: "Sync Couple における個人情報の取り扱いについて説明します。",
};

export default function PrivacyPage() {
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
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">プライバシーポリシー</h1>
        <p className="text-sm text-gray-500 mb-10">最終更新日：2026年4月6日</p>

        <div className="prose prose-sm md:prose-base max-w-none space-y-8 text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">1. 取得する情報</h2>
            <p>当サービスでは、以下の情報を取得します。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>メールアドレス（アカウント登録時）</li>
              <li>カップルID・パートナー情報</li>
              <li>毎日の気持ち（キモチ）の選択データ</li>
              <li>生理周期に関する記録（ユーザーが任意で入力した場合）</li>
              <li>リマインダー設定（通知時刻など）</li>
              <li>アクセスログ（IPアドレス、ブラウザ情報など）</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">2. 利用目的</h2>
            <p>取得した情報は以下の目的に使用します。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>サービスの提供・運営</li>
              <li>パートナーとのデータ同期機能の実現</li>
              <li>プッシュ通知の送信</li>
              <li>サービス改善・不具合対応</li>
              <li>お問い合わせへの対応</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">3. 第三者提供</h2>
            <p>当サービスは、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>ユーザーの同意がある場合</li>
              <li>法令に基づく開示が必要な場合</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">4. 外部サービスの利用</h2>
            <p>当サービスは、データの保存・認証にSupabase（Supabase, Inc.）を利用しています。データはSupabaseのサーバーに暗号化して保存されます。詳細はSupabaseのプライバシーポリシーをご参照ください。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">5. 生理周期データについて</h2>
            <p>生理周期データはセンシティブな個人情報です。当サービスでは以下の方針で取り扱います。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>詳細な日付・記録はご本人のみが閲覧できます</li>
              <li>パートナーには「体調に配慮が必要な時期かもしれない」という抽象的な表示のみが届きます</li>
              <li>第三者への提供は一切行いません</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">6. Cookie・ローカルストレージの利用</h2>
            <p>当サービスは、認証セッションの維持にCookieを使用します。ブラウザの設定でCookieを無効にするとサービスが正常に動作しない場合があります。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">7. データの保管期間・削除</h2>
            <p>ユーザーが退会した場合、アカウントおよび関連するデータは削除されます。削除の依頼は下記お問い合わせ先にご連絡ください。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">8. セキュリティ</h2>
            <p>当サービスは、個人情報への不正アクセス・紛失・改ざんを防ぐため、Supabaseの暗号化ストレージおよびSSL通信を使用しています。ただし、インターネット上の完全な安全性を保証するものではありません。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">9. 本ポリシーの変更</h2>
            <p>本ポリシーは必要に応じて変更することがあります。重要な変更がある場合はサービス上でお知らせします。</p>
          </section>

          <section className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">お問い合わせ</h2>
            <p className="text-sm">個人情報の取り扱いに関するお問い合わせは以下までご連絡ください。</p>
            <p className="text-sm mt-1">メール：<a href="mailto:info@synccoupleapp.com" className="text-rose-500 hover:underline">info@synccoupleapp.com</a></p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 py-8 text-center text-xs text-gray-400">
        © 2025 Sync Couple. All rights reserved.
      </footer>
    </div>
  );
}
