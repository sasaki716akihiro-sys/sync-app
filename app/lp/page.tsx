"use client";

import { useState } from "react";
import {
  Heart, Sparkles, Clock, MessageCircle, VolumeX, AlertCircle,
  Users, HelpCircle, Shuffle, Feather, TrendingUp,
  UserPlus, Link2, MousePointerClick, Star, ChevronDown,
  ArrowRight, Shield, CheckCircle2, Bell, Calendar,
  Smartphone, Check, Menu, X,
} from "lucide-react";

// ─── データ ────────────────────────────────────────────────────────
const problems = [
  { Icon: Clock,          title: "タイミングがわからない",      desc: "忙しそうで声をかけるきっかけが見つからない" },
  { Icon: VolumeX,        title: "言葉にできない",              desc: "気持ちはあっても、うまく伝えられないことがある" },
  { Icon: MessageCircle,  title: "「大丈夫」で流してしまう",    desc: "体調が悪くても、心配させたくなくて黙ってしまう" },
  { Icon: AlertCircle,    title: "すれ違いが積み重なる",         desc: "小さなズレが続いて、気づいたら距離が広がっていた" },
  { Icon: Users,          title: "心に余裕がなくなってきた",     desc: "子育てや仕事で、気持ちを伝え合う余白がない" },
  { Icon: HelpCircle,     title: "相手の気持ちがわからない",    desc: "最近、パートナーが何を考えているかわからない" },
];

const benefits = [
  { Icon: Shuffle,         title: "すれ違いが減る",     desc: "お互いの状態がわかるから、声をかけるタイミングが自然につかめます。" },
  { Icon: MessageCircle,   title: "会話のきっかけに",   desc: "「今日△だったんだね」がやさしい会話の入り口になります。" },
  { Icon: Feather,         title: "プレッシャーなし",   desc: "毎日1タップだけ。言葉にしなくていい、やさしい仕組みです。" },
  { Icon: TrendingUp,      title: "習慣になる設計",     desc: "週ごとのふりかえりで、ふたりの感情パターンが見えてきます。" },
];

const voices = [
  { name: "A.M さん（30代・2児の母）",    text: "「機嫌が悪い」じゃなくて「体調がつらい時期」って伝わるようになって、夫の対応がやさしくなりました。" },
  { name: "T.K さん（30代・共働き夫婦）", text: "忙しくて会話が減っていたんですが、毎晩「今日何だった？」が自然な習慣になりました。" },
  { name: "Y.S さん（40代・単身赴任中）", text: "遠くにいてもパートナーの状態が見えるのが、とても安心感につながっています。" },
];

const faqs = [
  { q: "データは安全ですか？",                  a: "データはSupabaseに暗号化して保存されます。第三者に情報が漏れる仕組みは一切ありません。" },
  { q: "無料で使えますか？",                    a: "現在は完全無料です。今後プレミアム機能を追加予定ですが、基本機能は無料を維持します。" },
  { q: "パートナーとどうやってつながりますか？", a: "アプリ内でカップルIDを発行し、パートナーに共有するだけ。専用アプリ不要で、ブラウザから1分でペアリングできます。" },
  { q: "生理日情報はパートナーに丸見えですか？", a: "パートナーには「少しデリケートな時期かも」というやさしい表示のみ。詳細な日付は本人だけが確認できます。" },
  { q: "通知はどんなタイミングで届きますか？",   a: "パートナーがキモチを選んだタイミングでプッシュ通知が届きます。ブラウザの通知許可をオンにするだけで使えます。" },
  { q: "スマートフォン以外でも使えますか？",     a: "WebアプリなのでiPhone・Android・PCのブラウザからご利用いただけます。アプリのインストールは不要です。" },
];

// ─── ミニCTAコンポーネント ─────────────────────────────────────────
function MiniCta({ label }: { label: string }) {
  return (
    <div className="text-center mt-10 md:mt-14">
      <a
        href="/login"
        className="inline-flex items-center gap-2 bg-rose-500 text-white font-bold px-8 py-3.5 rounded-full hover:bg-rose-600 hover:shadow-lg hover:-translate-y-0.5 transition-all"
      >
        {label} <ArrowRight size={16} />
      </a>
    </div>
  );
}

// ─── メインコンポーネント ──────────────────────────────────────────
export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="min-h-screen bg-white text-gray-800"
      style={{ fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif" }}
    >

      {/* ══ ナビゲーション ══════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-rose-100">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Sync Couple" className="w-8 h-8 rounded-xl object-cover" />
            <span className="font-bold text-gray-900 text-lg tracking-tight">Sync Couple</span>
          </a>

          {/* PC: アンカーメニュー */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-gray-500 text-sm font-medium hover:text-rose-500 transition-colors">特徴</a>
            <a href="#howto"    className="text-gray-500 text-sm font-medium hover:text-rose-500 transition-colors">使い方</a>
            <a href="#faq"      className="text-gray-500 text-sm font-medium hover:text-rose-500 transition-colors">FAQ</a>
            <a href="/login" className="bg-rose-500 text-white text-sm font-bold px-4 py-2 rounded-full hover:bg-rose-600 transition-colors">
              無料で始める
            </a>
          </div>

          {/* スマホ: CTAボタン + ハンバーガー */}
          <div className="flex md:hidden items-center gap-2">
            <a href="/login" className="bg-rose-500 text-white text-sm font-bold px-4 py-2 rounded-full hover:bg-rose-600 transition-colors">
              無料で始める
            </a>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 text-gray-600 hover:text-rose-500 transition-colors"
              aria-label="メニュー"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* スマホ: ドロップダウンメニュー */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-rose-100 px-5 py-3 flex flex-col">
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-gray-700 text-sm font-medium py-3 border-b border-gray-100">特徴</a>
            <a href="#howto"    onClick={() => setMenuOpen(false)} className="text-gray-700 text-sm font-medium py-3 border-b border-gray-100">使い方</a>
            <a href="#faq"      onClick={() => setMenuOpen(false)} className="text-gray-700 text-sm font-medium py-3">FAQ</a>
          </div>
        )}
      </nav>

      {/* ══ 1. ファーストビュー ══════════════════════════════════ */}
      <section className="pt-20 pb-12 md:pt-24 md:pb-20 relative overflow-hidden bg-gradient-to-br from-rose-50 via-white to-violet-50">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-rose-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-violet-100/50 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto px-5 relative">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-14">

            {/* テキスト */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-600 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
                <Sparkles size={12} /> 夫婦向けコミュニケーションアプリ
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-[1.25] mb-3">
                ふたりの気持ち、<br />
                <span className="text-rose-500">もっとそっと</span><br />
                つながる。
              </h1>
              <p className="text-rose-600 font-semibold text-sm mb-3">
                言いにくい気持ちや体調を、やさしく共有できる夫婦向けアプリ
              </p>
              <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6 max-w-md mx-auto lg:mx-0 text-pretty">
                言いたいけど、言えない。伝わってほしいけど、伝えられない。<br className="hidden sm:block" />
                Sync Couple は、夫婦のすれ違いをやさしく減らします。
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-5">
                <a
                  href="/login"
                  className="bg-rose-500 text-white font-bold px-7 py-4 rounded-2xl hover:bg-rose-600 hover:shadow-lg hover:-translate-y-0.5 transition-all text-center flex items-center justify-center gap-2"
                >
                  今すぐ無料で始める <ArrowRight size={16} />
                </a>
                <a
                  href="#features"
                  className="border-2 border-rose-200 text-rose-600 font-semibold px-7 py-4 rounded-2xl hover:bg-rose-50 transition-colors text-center"
                >
                  機能を見る
                </a>
              </div>

              {/* ベネフィットチップ */}
              <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                {[
                  { Icon: Smartphone, label: "インストール不要" },
                  { Icon: Check,      label: "1日1タップでOK" },
                  { Icon: Heart,      label: "やさしくつながる" },
                ].map(({ Icon, label }, i) => (
                  <div
                    key={i}
                    className="inline-flex items-center gap-1.5 bg-white border border-rose-100 text-gray-600 text-xs px-3 py-1.5 rounded-full shadow-sm"
                  >
                    <Icon size={12} className="text-rose-400" /> {label}
                  </div>
                ))}
              </div>
            </div>

            {/* ヒーロービジュアル */}
            <div className="flex-1 flex justify-center lg:justify-end">
              <div className="relative">

                {/* メイン画像 */}
                <div className="w-72 md:w-96 rounded-3xl overflow-hidden shadow-2xl border border-rose-100/60"
                  style={{ boxShadow: "0 20px 60px -10px rgba(251,113,133,0.25), 0 8px 24px -4px rgba(0,0,0,0.08)" }}>
                  <img
                    src="/images/hero-main.png"
                    alt="今日のふたりの状態 — Sync Couple"
                    className="w-full block"
                  />
                </div>

                {/* 通知チップ（右上）— スマホでは非表示 */}
                <div className="hidden sm:flex absolute -top-3 -right-3 bg-white rounded-2xl px-3 py-2 shadow-lg border border-gray-100 items-center gap-2 whitespace-nowrap">
                  <div className="w-6 h-6 bg-rose-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bell size={12} className="text-rose-500" strokeWidth={1.5} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700">パートナーが伝えてくれた</span>
                </div>

                {/* 生理カレンダーチップ（左下）— スマホでは非表示 */}
                <div className="hidden sm:flex absolute -bottom-3 -left-3 bg-white rounded-2xl px-3 py-2 shadow-lg border border-violet-100 items-center gap-2 whitespace-nowrap">
                  <div className="w-6 h-6 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Calendar size={12} className="text-violet-500" strokeWidth={1.5} />
                  </div>
                  <span className="text-xs font-semibold text-violet-700">生理周期を自動予測</span>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ 2. よくある悩み ════════════════════════════════════ */}
      <section className="py-12 md:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-8 md:mb-12">
            <p className="text-rose-500 font-bold text-xs mb-2 tracking-widest uppercase">Problem</p>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-bold text-gray-900 text-balance">こんなこと、ありませんか</h2>
            <p className="text-gray-600 mt-2 text-sm">忙しいふたりの間に、少しずつすれ違いが生まれていませんか。</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {problems.map(({ Icon, title, desc }, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100 flex items-start gap-4 hover:shadow-md transition-shadow"
              >
                <div className="w-9 h-9 md:w-10 md:h-10 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon size={17} className="text-rose-400" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm mb-1">{title}</p>
                  <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8 py-4 md:py-5 bg-white rounded-2xl border border-rose-100 max-w-2xl mx-auto px-6">
            <p className="text-gray-700 text-sm leading-relaxed">
              Sync Couple は、そういった「言えない気持ち」を<br className="hidden sm:block" />
              <span className="text-rose-500 font-bold">やさしくシェアできる仕組み</span>をつくりました。
            </p>
          </div>
        </div>
      </section>

      {/* ══ 3. Sync Coupleでできること ═══════════════════════════ */}
      <section id="features" className="py-12 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-10 md:mb-16">
            <p className="text-rose-500 font-bold text-xs mb-2 tracking-widest uppercase">Features</p>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-bold text-gray-900 text-balance">Sync Couple でできること</h2>
          </div>

          <div className="space-y-14 md:space-y-20">

            {/* ── Feature 1: キモチ選択 ── */}
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <div className="flex-1 order-2 md:order-1">
                <div className="inline-flex items-center gap-2 bg-rose-100 text-rose-600 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
                  01 / 今日のキモチ
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">今日のキモチを選ぶだけ</h3>
                <p className="text-gray-600 leading-relaxed mb-4 text-sm md:text-base">
                  ○・△・✕の3つから今日の気持ちを選ぶだけ。長い文章を書かなくても、今日の調子がパートナーに届きます。ふたりの気持ちが一致したとき、特別な演出でお知らせします。
                </p>
                <ul className="space-y-2.5">
                  {[
                    "毎日たった1タップで完了",
                    "パートナーの状態をリアルタイム確認",
                    "気持ちが一致したら「パーフェクトシンク！」",
                  ].map((t, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={12} className="text-rose-500" />
                      </div>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* スクショ 1 */}
              <div className="flex-1 order-1 md:order-2 flex justify-center">
                <div className="relative" style={{ width: "260px", height: "390px" }}>
                  {/* Perfect Sync（後ろ・右） */}
                  <div className="absolute right-0 top-8 w-40 bg-gray-900 rounded-[2rem] p-1 shadow-xl rotate-3 z-0">
                    <div className="rounded-[1.6rem] overflow-hidden">
                      <img src="/images/ss-perfect-sync.png" alt="パーフェクトシンク演出" className="w-full block" />
                    </div>
                  </div>
                  {/* キモチ選択（前・左） */}
                  <div className="absolute left-0 top-0 w-44 bg-gray-900 rounded-[2rem] p-1 shadow-2xl -rotate-1 z-10">
                    <div className="rounded-[1.7rem] overflow-hidden">
                      <img src="/images/ss-kimochi.png" alt="キモチ選択画面" className="w-full block" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* ── Feature 2: 生理期間 ── */}
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
              {/* スクショ 2 */}
              <div className="flex-1 flex justify-center">
                <div className="w-48 md:w-52 bg-gray-900 rounded-[2.5rem] p-1 shadow-2xl">
                  <div className="rounded-[2rem] overflow-hidden">
                    <img src="/images/ss-calendar.png" alt="生理カレンダー画面" className="w-full block" />
                  </div>
                </div>
              </div>

              <div className="flex-1">
                <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-600 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
                  02 / 生理期間共有
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">生理期間をやさしく共有</h3>
                <p className="text-gray-600 leading-relaxed mb-4 text-sm md:text-base">
                  生理開始日を記録するだけで、次回以降の周期を自動計算。パートナーには「今がどんな時期か」がやさしく伝わります。「なんか機嫌悪い？」のすれ違いを未然に防ぎます。
                </p>
                <ul className="space-y-2.5">
                  {[
                    "周期を自動計算・次回を予測",
                    "パートナーへのやさしい表示のみ（詳細は非公開）",
                    "過去の記録から傾向を分析",
                  ].map((t, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 bg-violet-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={12} className="text-violet-500" />
                      </div>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* ── Feature 3: 通知 ── */}
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <div className="flex-1 order-2 md:order-1">
                <div className="inline-flex items-center gap-2 bg-rose-100 text-rose-600 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
                  03 / 通知機能
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">パートナーが選んだら、すぐ通知</h3>
                <p className="text-gray-600 leading-relaxed mb-4 text-sm md:text-base">
                  パートナーがキモチを選んだタイミングで、プッシュ通知が届きます。「早く選んで」ではなく、「相手が気持ちを伝えたよ」というやさしいお知らせ。通知を許可するだけで、すぐ使えます。
                </p>
                <ul className="space-y-2.5">
                  {[
                    "パートナーがキモチを選んだらすぐ通知",
                    "通知の許可だけで設定完了・時刻設定不要",
                    "アプリを開いていなくても届く",
                  ].map((t, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={12} className="text-rose-500" />
                      </div>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* モックアップ 3 */}
              <div className="flex-1 order-1 md:order-2 flex justify-center">
                <div className="w-56 md:w-60 space-y-3">
                  {/* ロック画面通知 */}
                  <div className="bg-gray-900 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="px-5 pt-5 pb-2 text-center">
                      <p className="text-gray-500 text-xs mb-1">4月1日 月曜日</p>
                      <p className="text-white text-4xl font-thin mb-3">21:07</p>
                    </div>
                    <div className="mx-3 mb-4 bg-white/15 backdrop-blur-sm rounded-2xl p-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-9 h-9 bg-rose-500 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Heart size={15} className="text-white fill-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-0.5">
                            <p className="text-white text-xs font-bold">Sync Couple</p>
                            <p className="text-gray-400 text-xs">今</p>
                          </div>
                          <p className="text-gray-200 text-xs">相手が気持ちを伝えました 💌</p>
                          <p className="text-gray-400 text-xs mt-0.5">あなたもキモチを選んでみましょう</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 通知許可バナー */}
                  <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Bell size={18} className="text-rose-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-gray-800">通知を受け取る</p>
                      <p className="text-xs text-gray-500 mt-0.5">許可するだけで設定完了</p>
                    </div>
                    <div className="bg-rose-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-full">
                      許可
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <MiniCta label="まずは無料で試してみる" />
        </div>
      </section>

      {/* ══ 4. 使い方 ═══════════════════════════════════════════ */}
      <section id="howto" className="py-12 md:py-20 bg-rose-50">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-10 md:mb-14">
            <p className="text-rose-500 font-bold text-xs mb-2 tracking-widest uppercase">How to Use</p>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-bold text-gray-900 text-balance">たった3ステップで始められる</h2>
            <p className="text-gray-600 text-sm mt-2">インストール不要。ブラウザから今すぐ始められます。</p>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-3 gap-4 md:gap-8 relative">
            <div className="hidden md:block absolute top-10 left-[22%] right-[22%] border-t-2 border-dashed border-rose-200 pointer-events-none" />
            {[
              { Icon: UserPlus,          step: "01", title: "アカウント作成",       desc: "メールアドレスだけで登録完了。無料でお使いいただけます。" },
              { Icon: Link2,             step: "02", title: "パートナーとつながる", desc: "カップルIDを発行してパートナーに共有。1分でペアリングできます。" },
              { Icon: MousePointerClick, step: "03", title: "毎日タップするだけ",   desc: "今日のキモチを選ぶだけ。あとはアプリがそっとつないでくれます。" },
            ].map(({ Icon, step, title, desc }, i) => (
              <div key={i} className="relative z-10 text-center">
                <div className="w-14 h-14 md:w-20 md:h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-5 shadow-md border border-rose-100">
                  <Icon size={22} className="text-rose-400 md:hidden" strokeWidth={1.5} />
                  <Icon size={28} className="text-rose-400 hidden md:block" strokeWidth={1.5} />
                </div>
                <div className="inline-block bg-rose-500 text-white text-xs font-bold px-2 py-1 md:px-3 rounded-full mb-2 md:mb-3">
                  STEP {step}
                </div>
                <h3 className="text-xs md:text-base font-bold text-gray-900 mb-1 md:mb-2">{title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed hidden md:block max-w-xs mx-auto">{desc}</p>
              </div>
            ))}
          </div>

          {/* スマホ用：説明テキストを別行に表示 */}
          <div className="md:hidden mt-6 space-y-3">
            {[
              { step: "01", title: "アカウント作成",       desc: "メールアドレスだけで登録完了。無料でお使いいただけます。" },
              { step: "02", title: "パートナーとつながる", desc: "カップルIDを発行してパートナーに共有。1分でペアリングできます。" },
              { step: "03", title: "毎日タップするだけ",   desc: "今日のキモチを選ぶだけ。あとはアプリがそっとつないでくれます。" },
            ].map(({ step, title, desc }, i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-rose-100 text-sm text-gray-600 leading-relaxed">
                <span className="text-rose-500 font-bold mr-2">STEP {step}：{title}</span>{desc}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ 5. ベネフィット ══════════════════════════════════════ */}
      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-8 md:mb-14">
            <p className="text-rose-500 font-bold text-xs mb-2 tracking-widest uppercase">Benefits</p>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-bold text-gray-900 text-balance">ふたりの関係が、少しずつ変わる</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
            {benefits.map(({ Icon, title, desc }, i) => (
              <div key={i} className="bg-rose-50 border border-rose-100 rounded-2xl p-4 md:p-6 text-center hover:shadow-md transition-shadow">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-3 md:mb-4 shadow-sm border border-rose-100">
                  <Icon size={20} className="text-rose-400" strokeWidth={1.5} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1 md:mb-2 text-sm md:text-base">{title}</h3>
                <p className="text-gray-600 text-xs md:text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <MiniCta label="今すぐ無料で始める" />
        </div>
      </section>

      {/* ══ ユーザーの声（PC のみ表示） ══════════════════════════ */}
      <section className="hidden md:block py-20 bg-gradient-to-br from-rose-50 to-violet-50">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-12">
            <p className="text-rose-500 font-bold text-xs mb-2 tracking-widest uppercase">Voice</p>
            <h2 className="text-3xl font-bold text-gray-900">使ってみた方の声</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {voices.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} size={14} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-4">「{item.text}」</p>
                <p className="text-gray-400 text-xs border-t border-gray-100 pt-3">{item.name}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-400 text-xs mt-6">
            ※ 掲載はサービス開発時のヒアリングを元にした仮の声です
          </p>
        </div>
      </section>

      {/* ══ 6. FAQ ══════════════════════════════════════════════ */}
      <section id="faq" className="py-12 md:py-20 bg-white">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-8 md:mb-12">
            <p className="text-rose-500 font-bold text-xs mb-2 tracking-widest uppercase">FAQ</p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">よくある質問</h2>
          </div>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className={`border rounded-2xl overflow-hidden transition-colors ${
                  openFaq === i ? "border-rose-200 bg-rose-50/40" : "border-gray-200 bg-white"
                }`}
              >
                <button
                  className="w-full flex items-center justify-between p-4 md:p-5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className="font-medium text-gray-800 pr-4 text-sm">{faq.q}</span>
                  <ChevronDown
                    size={18}
                    className={`text-rose-400 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-4 md:px-5 pb-4 md:pb-5 border-t border-rose-100">
                    <p className="text-gray-600 text-sm leading-relaxed pt-3">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ 7. CTA ══════════════════════════════════════════════ */}
      <section id="register" className="py-16 md:py-24 bg-gradient-to-br from-rose-500 to-rose-600 text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/5 rounded-full pointer-events-none" />

        <div className="max-w-2xl mx-auto px-5 text-center relative">
          <div className="mx-auto mb-5 w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden shadow-lg">
            <img src="/icon-192.png" alt="Sync Couple" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl md:text-4xl font-bold mb-3 md:mb-4">今日から、少しずつ。</h2>
          <p className="text-rose-100 text-sm md:text-lg mb-8 md:mb-10 leading-relaxed text-pretty">
            毎日1タップで、ふたりの気持ちがやさしくつながる。<br className="hidden sm:block" />
            Sync Couple で、新しいコミュニケーションを始めませんか。
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/login"
              className="bg-white text-rose-600 font-bold px-10 py-4 rounded-2xl hover:bg-rose-50 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-base md:text-lg"
            >
              今すぐ無料で始める <ArrowRight size={18} />
            </a>
          </div>
          <p className="text-rose-100/80 text-xs mt-4">
            インストール不要 · クレジットカード不要 · 1分で登録完了
          </p>
        </div>
      </section>

      {/* ══ 8. フッター ══════════════════════════════════════════ */}
      <footer className="bg-gray-900 text-gray-400 py-12 md:py-14">
        <div className="max-w-5xl mx-auto px-5">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 md:gap-10 mb-8 md:mb-10">
            <div>
              <a href="#" className="flex items-center gap-2 mb-4">
                <img src="/icon-192.png" alt="Sync Couple" className="w-9 h-9 rounded-xl object-cover" />
                <span className="font-bold text-white text-xl">Sync Couple</span>
              </a>
              <p className="text-sm leading-relaxed max-w-xs text-gray-500">
                夫婦の気持ちをやさしくつなぐアプリ。<br />
                言えなかったことを、少しずつ。
              </p>
            </div>

            <div className="flex gap-10 md:gap-12">
              <div>
                <p className="text-white font-semibold mb-4 text-sm">サービス</p>
                <ul className="space-y-2.5 text-sm">
                  <li><a href="#features" className="hover:text-white transition-colors">機能紹介</a></li>
                  <li><a href="#howto"    className="hover:text-white transition-colors">使い方</a></li>
                  <li><a href="/login"   className="hover:text-white transition-colors">アプリを始める</a></li>
                </ul>
              </div>
              <div>
                <p className="text-white font-semibold mb-4 text-sm">法的情報</p>
                <ul className="space-y-2.5 text-sm">
                  <li><a href="/terms" className="hover:text-white transition-colors">利用規約</a></li>
                  <li><a href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</a></li>
                  <li><a href="/tokushoho" className="hover:text-white transition-colors">特定商取引法に基づく表記</a></li>
                  <li><a href="https://docs.google.com/forms/d/e/1FAIpQLSdeRI32etS8-oM9DFp_xm-eyvP312w0ONt9vVYD3uiLsjM1Yw/viewform" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">お問い合わせ</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-600">© 2025 Sync Couple. All rights reserved.</p>
            <a
              href="/login"
              className="bg-rose-500 text-white text-sm font-bold px-6 py-2.5 rounded-full hover:bg-rose-600 transition-colors flex items-center gap-2"
            >
              今すぐ始める <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
