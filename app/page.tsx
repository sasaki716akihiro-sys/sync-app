"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { logout } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";

// ─── Supabaseクライアントはモジュールレベルで1度だけ生成 ──────
// コンポーネント内で生成すると再レンダリングのたびに新インスタンスが
// 作られ、Realtimeの購読が切れる原因になる
const supabase = createClient();

// ─── 型 ──────────────────────────────────────────────────
type Kimochi = "circle" | "triangle" | "cross" | null;
type Screen  = "home" | "settings";

interface SyncRow {
  couple_id:       string;
  user_email:      string;
  kimochi:         Kimochi;
  kimochi_date:    string | null;
  last_sync_date:  string | null;
  sync_goal:       number;
  is_moon_day:     boolean;
  moon_start:      number | null;
  moon_end:        number | null;
  moon_year:       number | null;
  moon_month:      number | null;
  // ── ムーンデイ予測用 ──
  cycle_days:      number | null;  // 自動計算された平均周期
  period_days:     number | null;  // 自動計算された平均期間
  last_start_date: string | null;  // 直近の開始日 YYYY-MM-DD
  period_history:  PeriodRecord[] | null; // 直近3回分の履歴
  // ── リマインド設定 ──
  reminder_weekday: number | null; // 平日リマインド時刻（時）例: 17
  reminder_weekend: number | null; // 休日リマインド時刻（時）例: 19
  // ── キモチ履歴（週次ふりかえり用） ──
  kimochi_log: KimochiLogEntry[] | null;
}

// 生理履歴の1件
interface PeriodRecord {
  start: string; // YYYY-MM-DD
  end:   string; // YYYY-MM-DD
}

// キモチ履歴の1件（週次ふりかえり用）
interface KimochiLogEntry {
  date:           string;  // YYYY-MM-DD
  my_kimochi:     Kimochi;
  partner_kimochi:Kimochi;
}

// ─── 週次ふりかえりロジック ────────────────────────────────
// 気持ちの距離：0=完全一致 1=近い 2=ズレあり
function kimochiDistance(a: Kimochi, b: Kimochi): number {
  if (!a || !b) return 3; // 未回答
  if (a === b) return 0;
  const order: Record<NonNullable<Kimochi>, number> = { circle:0, triangle:1, cross:2 };
  return Math.abs(order[a] - order[b]);
}

// 今週の月曜〜今日の日付範囲を返す
function getThisWeekRange(): { start: string; end: string } {
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = today.getDay(); // 0=日 1=月 ... 6=土
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  return {
    start: getLocalDateStr(monday),
    end:   getLocalDateStr(today),
  };
}

const DOW_LABEL = ["日","月","火","水","木","金","土"];

function analyzeWeeklyLog(log: KimochiLogEntry[]): {
  syncCount:  number;
  closeDays:  string[];   // 気持ちが近かった日（曜日ラベル）
} {
  const { start, end } = getThisWeekRange();
  const thisWeek = log.filter(e => e.date >= start && e.date <= end);
  const syncCount = thisWeek.filter(e => e.my_kimochi === "circle" && e.partner_kimochi === "circle").length;
  const closeDays = thisWeek
    .filter(e => kimochiDistance(e.my_kimochi, e.partner_kimochi) <= 1)
    .map(e => {
      const d = new Date(e.date);
      return DOW_LABEL[d.getDay()] + "曜";
    });
  return { syncCount, closeDays };
}

// 今日リマインド時刻を返す（平日/休日）
function getTodayReminderHour(weekday: number, weekend: number): number {
  const dow = new Date().getDay();
  return (dow === 0 || dow === 6) ? weekend : weekday;
}

// キモチログに今日の記録を追加（最大28件保持）
function addKimochiLog(
  log: KimochiLogEntry[],
  date: string,
  myK: Kimochi,
  partnerK: Kimochi
): KimochiLogEntry[] {
  const filtered = log.filter(e => e.date !== date); // 同日は上書き
  const next = [...filtered, { date, my_kimochi: myK, partner_kimochi: partnerK }];
  next.sort((a,b) => a.date.localeCompare(b.date));
  return next.slice(-28); // 最大4週分
}

// ─── クールダウン日数 ────────────────────────────────────
function getCooldownDays(goal: number): number {
  if (goal === 1) return 20;
  if (goal === 2) return 10;
  if (goal === 3) return 7;
  if (goal === 4) return 3;
  return Math.max(1, Math.floor(20 / goal));
}

// ─── メッセージバリエーション ────────────────────────────
const MESSAGES = {
  bothTriangle: [
    { title: "ふたりともハグしたい日だね 🤗", body: "くっついてぼーっとしよう。それだけで十分だよ。" },
    { title: "ソファでゆっくりしようか 🛋️",   body: "今夜は近くにいるだけでいいよね。" },
    { title: "今夜はおだやかに過ごそう 🌿",    body: "ハグしながら好きな音楽でもかけようか。" },
  ],
  mixTriangleCross: [
    { title: "教えてくれてありがとう 💬",       body: "今夜は無理せず、近くにいるだけでいいよ。" },
    { title: "ゆっくりコーヒーでも飲もう ☕",   body: "隣に座ってのんびりしよう。それが一番だよ。" },
    { title: "お互いの時間を大切にしようね 🌙", body: "そばにいるだけで、ちゃんと伝わってるよ。" },
  ],
  oneCircleOneCross: [
    { title: "今夜はゆっくり休んでね 🌿",      body: "教えてくれてありがとう。また今度一緒に楽しもう 💤" },
    { title: "おやすみ、ゆっくり充電してね 🌙", body: "今日は無理せず。また元気な顔見せてね。" },
    { title: "休むのも大事だよ 🍵",             body: "ゆっくりコーヒーでも飲んで、のんびり休んでね。" },
  ],
  bothCross: [
    { title: "今日はふたりでのんびりしよう 💤", body: "たまにはゆっくり休む夜もいいよね。おやすみ 🌙" },
    { title: "今夜はそれぞれ充電しよう 🔋",     body: "また元気なときに、ゆっくり話そうね。" },
    { title: "ゆっくりお茶でも飲もうか 🍵",     body: "今日は無理せず、ふたりで休む日にしよう。" },
  ],
  circleTriangle: [
    { title: "ハグしながらいい夜にしよう 🤗",   body: "そばにいるだけでうれしいよ。ゆっくり過ごそう。" },
    { title: "ゆっくりコーヒーでも飲もうか ☕", body: "近くにいてくれるだけで十分。今夜はのんびりしよう。" },
    { title: "今夜はふたりでまったりしよう 🛋️", body: "気持ちを教えてくれてありがとう。" },
  ],
};

function pickMessage(me: Kimochi, partner: Kimochi) {
  const arr =
    (me==="circle"&&partner==="triangle")||(me==="triangle"&&partner==="circle") ? MESSAGES.circleTriangle   :
    me==="triangle"&&partner==="triangle"                                         ? MESSAGES.bothTriangle     :
    me==="cross"&&partner==="cross"                                               ? MESSAGES.bothCross        :
    (me==="triangle"&&partner==="cross")||(me==="cross"&&partner==="triangle")   ? MESSAGES.mixTriangleCross :
                                                                                    MESSAGES.oneCircleOneCross;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── 花火 ────────────────────────────────────────────────
const FW_COLORS = ["#FFB085","#F0A899","#D97B6C","#FFE066","#A8D8A8","#B8D4F5","#F5C4E8","#FFD700"];
const FW_EMOJIS = ["✨","🎉","💛","🌟","💕","🎊","🌸","⭐"];

function Fireworks({ onDone }: { onDone: () => void }) {
  // ハート形の座標を生成（媒介変数表示）
  const heartParticles = Array.from({ length: 60 }, (_, i) => {
    const t = (i / 60) * 2 * Math.PI;
    // ハートの媒介変数式（サイズ調整）
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
    const scale = 8 + Math.random() * 4; // 拡散距離
    return {
      id:    i,
      color: FW_COLORS[i % FW_COLORS.length],
      tx:    hx * scale,
      ty:    hy * scale,
      delay: Math.random() * 0.5,
      size:  6 + Math.random() * 10,
      isHeart: i % 5 === 0,
    };
  });

  useEffect(() => { const t = setTimeout(onDone, 3800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{ backgroundColor:"rgba(255,251,245,0.88)" }}>
      <style>{`
        @keyframes fw{0%{transform:translate(0,0) scale(.2);opacity:1}70%{opacity:1}100%{transform:translate(var(--tx),var(--ty)) scale(1);opacity:0}}
        @keyframes fw-msg{0%{opacity:0;transform:scale(.7) translateY(10px)}30%{opacity:1;transform:scale(1.08) translateY(0)}80%{opacity:1}100%{opacity:0}}
      `}</style>
      <div className="relative w-40 h-40">
        {heartParticles.map(p=>(
          <div key={p.id} className="absolute top-1/2 left-1/2 flex items-center justify-center"
            style={{
              width:  p.isHeart ? p.size * 1.8 : p.size,
              height: p.isHeart ? p.size * 1.8 : p.size,
              borderRadius: p.isHeart ? "0" : "50%",
              backgroundColor: p.isHeart ? "transparent" : p.color,
              fontSize: p.isHeart ? p.size * 1.2 : undefined,
              ["--tx" as string]: `${p.tx}px`,
              ["--ty" as string]: `${p.ty}px`,
              animation: `fw 1.4s ${p.delay}s ease-out both`,
              marginLeft: -(p.size / 2),
              marginTop:  -(p.size / 2),
            }}>
            {p.isHeart ? "🩷" : null}
          </div>
        ))}
      </div>
      {/* ★ ハート絵文字・テキスト内のハートを削除 */}
      <div className="absolute flex flex-col items-center gap-2 px-8 py-5 rounded-3xl shadow-2xl"
        style={{ backgroundColor:"rgba(255,255,255,0.93)", border:"2px solid #FFB085", animation:"fw-msg 3.8s ease-out both" }}>
        <p className="text-xl font-bold text-center" style={{ color:"#D97B6C" }}>Perfect Sync ✨</p>
        <p className="text-sm text-center" style={{ color:"#9A7B6A" }}>ふたりの気持ちがそろったね</p>
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────
function Toast({ msg, on }: { msg:string; on:boolean }) {
  return (
    <div className="fixed top-6 left-1/2 z-40 pointer-events-none transition-all duration-300"
      style={{ transform:`translateX(-50%) translateY(${on?0:-12}px)`, opacity:on?1:0 }}>
      <div className="text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg whitespace-nowrap"
        style={{ backgroundColor:"#B86540", color:"#FFFBF5" }}>{msg}</div>
    </div>
  );
}

// ─── kimochi 正規化（空白・大文字を吸収し確実に比較できる値に変換）──
function normalizeKimochi(val: unknown): Kimochi {
  if (!val || typeof val !== "string") return null;
  const s = val.trim().toLowerCase();
  if (s === "circle" || s === "triangle" || s === "cross") return s as Kimochi;
  console.warn("[Sync] 不明な kimochi 値:", JSON.stringify(val));
  return null;
}

// ─── ローカル日付文字列 "YYYY-MM-DD" を返す ──────────────
// toISOString() は UTC なので JST（UTC+9）では日付がズレる
function getLocalDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── キモチ選択行 ────────────────────────────────────────
const KIMOCHI_OPTIONS = [
  { value:"circle"   as Kimochi, emoji:"○", weather:"☀️", color:"#D97B6C", bg:"#FBE8E6", glow:"rgba(217,123,108,0.25)" },
  { value:"triangle" as Kimochi, emoji:"△", weather:"☁️", color:"#B8943A", bg:"#FBF3E0", glow:"rgba(184,148,58,0.25)"  },
  { value:"cross"    as Kimochi, emoji:"✕", weather:"🌧️", color:"#8B7BA8", bg:"#F0EBF8", glow:"rgba(139,123,168,0.25)" },
];

function KimochiRow({ label, avatar, selected, onSelect, disabled, note }: {
  label:string; avatar:string; selected:Kimochi;
  onSelect:(v:Kimochi)=>void; disabled?:boolean; note?:string;
}) {
  const normalized = normalizeKimochi(selected);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize:16 }}>{avatar}</span>
        <span className="text-xs font-bold" style={{ color:"#B86540" }}>{label}</span>
        {note && <span style={{ fontSize:9, color:"#C4A898" }}>{note}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KIMOCHI_OPTIONS.map(opt => {
          const isSelected = normalized === opt.value;
          return (
            <button key={opt.value}
              onClick={() => !disabled && onSelect(opt.value)}
              className="relative overflow-hidden rounded-2xl"
              style={{
                height:          64,
                backgroundColor: isSelected ? opt.bg : "rgba(255,255,255,0.6)",
                border:          isSelected ? `2px solid ${opt.color}` : "1.5px solid #FDEBD0",
                boxShadow:       isSelected ? `0 4px 16px ${opt.glow}` : "none",
                transform:       isSelected ? "scale(1.06)" : "scale(1)",
                transition:      "all 0.18s ease",
                opacity:         disabled ? (isSelected ? 1 : 0.45) : 1,
                cursor:          disabled ? "default" : "pointer",
              }}>
              {/* 背景天気アイコン（半透明） */}
              <span
                aria-hidden="true"
                style={{
                  position:  "absolute",
                  right:     -4,
                  bottom:    -6,
                  fontSize:  38,
                  opacity:   isSelected ? 0.22 : 0.13,
                  userSelect:"none",
                  lineHeight:1,
                  transition:"opacity 0.18s ease",
                }}>
                {opt.weather}
              </span>
              {/* メインの記号 */}
              <span
                style={{
                  position:   "absolute",
                  inset:      0,
                  display:    "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize:   32,
                  fontWeight: 700,
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  color:      isSelected ? opt.color : "#C4B8A8",
                  transition: "color 0.18s ease",
                  lineHeight: 1,
                }}>
                {opt.emoji}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── マッチング結果バナー ────────────────────────────────
function MatchBanner({ me, partner, onClose }: { me:Kimochi; partner:Kimochi; onClose:()=>void }) {
  const isHappy = me==="circle" && partner==="circle";
  // ★ useRef で初回マウント時のメッセージを固定
  // 　 再レンダリングのたびに Math.random() が呼ばれてメッセージが変わるのを防ぐ
  const msgRef = useRef(
    isHappy
      ? { title:"Perfect Sync ✨", body:"ふたりの気持ちがそろったね。素敵な夜を 🌙✨" }
      : pickMessage(me, partner)
  );
  const msg = msgRef.current;
  const pal = isHappy
    ? { bg:"linear-gradient(135deg,#FBE8E6,#FFF0E8)", border:"#F0A899", icon:"💛", text:"#D97B6C" }
    : (me==="cross"||partner==="cross")
      ? { bg:"linear-gradient(135deg,#F0EBF8,#EDF6EB)", border:"#C4B4E0", icon:"🌙", text:"#8B7BA8" }
      : { bg:"linear-gradient(135deg,#FBF3E0,#FFF0E8)", border:"#E8C880", icon:"🤗", text:"#B8943A" };
  return (
    <div className="rounded-3xl p-5 flex flex-col gap-2 relative"
      style={{ background:pal.bg, border:`2px solid ${pal.border}`, boxShadow:`0 6px 24px ${pal.border}40` }}>
      <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-xs"
        style={{ backgroundColor:"rgba(255,255,255,0.7)", color:"#C4A898" }}>✕</button>
      <div className="flex items-center gap-2">
        <span style={{ fontSize:26 }}>{pal.icon}</span>
        <p className="font-bold text-base leading-tight" style={{ color:pal.text }}>{msg.title}</p>
      </div>
      <p className="text-sm leading-relaxed" style={{ color:"#9A7B6A" }}>{msg.body}</p>
    </div>
  );
}

// ─── Perfect Sync カード（当日〜お休み期間 統合） ────────────
function SyncSuccessCard({ isSyncToday, remainingDays, totalDays, lastSyncDate, onReset }: {
  isSyncToday:boolean; remainingDays:number; totalDays:number;
  lastSyncDate:string; onReset:()=>void;
}) {
  const d = new Date(lastSyncDate);
  const dateLabel = `${d.getMonth()+1}月${d.getDate()}日`;
  const nextDate  = new Date(lastSyncDate);
  nextDate.setDate(nextDate.getDate() + totalDays);
  const nextLabel = `${nextDate.getMonth()+1}月${nextDate.getDate()}日`;
  const progress  = Math.max(0, Math.min(100, ((totalDays - remainingDays) / totalDays) * 100));

  // 待機期間終了日時 = lastSyncDate から totalDays 日後の 0:00
  const cooldownEnd = new Date(lastSyncDate);
  cooldownEnd.setDate(cooldownEnd.getDate() + totalDays);
  cooldownEnd.setHours(0, 0, 0, 0);

  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, cooldownEnd.getTime() - Date.now())
  );
  useEffect(() => {
    const id = setInterval(() => {
      const end = new Date(lastSyncDate);
      end.setDate(end.getDate() + totalDays);
      end.setHours(0, 0, 0, 0);
      setTimeLeft(Math.max(0, end.getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [lastSyncDate, totalDays]);

  const totalSecs = Math.floor(timeLeft / 1000);
  const days    = Math.floor(totalSecs / 86400);
  const hours   = Math.floor((totalSecs % 86400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="rounded-3xl overflow-hidden"
      style={{ border:`2px solid ${isSyncToday ? "#F0A899" : "#FFD580"}`,
        boxShadow:`0 6px 28px ${isSyncToday ? "rgba(240,168,153,0.30)" : "rgba(255,200,80,0.20)"}` }}>

      {/* ヘッダー */}
      <div className="px-5 py-6 flex flex-col items-center gap-2 text-center"
        style={{ background:"linear-gradient(135deg,#FFE066 0%,#FFB085 45%,#F0A899 100%)" }}>
        <span style={{ fontSize: isSyncToday ? 44 : 32 }}>
          {isSyncToday ? "💛" : "🌸"}
        </span>
        <p className="font-bold" style={{ fontSize: isSyncToday ? 20 : 16,
          color:"#fff", textShadow:"0 1px 6px rgba(0,0,0,0.18)" }}>
          {isSyncToday ? "Perfect Sync！おめでとう ✨" : "ふたりの準備期間中 🌙"}
        </p>
        <p style={{ fontSize:13, color:"rgba(255,255,255,0.92)", fontWeight:600 }}>
          {isSyncToday
            ? "今夜はふたりだけの特別な時間を大切にしようね 🌙"
            : `${dateLabel} にPerfect Syncしたよ ✨`}
        </p>
      </div>

      {/* ボディ */}
      <div className="px-5 py-5 flex flex-col gap-4"
        style={{ background:"linear-gradient(180deg,rgba(255,250,235,0.98),rgba(255,238,225,0.98))" }}>

        {isSyncToday ? (
          /* 当日：お祝いメッセージ */
          <div className="px-4 py-4 rounded-2xl text-center"
            style={{ background:"linear-gradient(135deg,#FFF8D0,#FFE8E0)", border:"1.5px solid #F5C890" }}>
            <p style={{ fontSize:24, marginBottom:6 }}>🎉</p>
            <p className="font-bold text-sm" style={{ color:"#C4603A" }}>キモチが通じ合ったよ</p>
            <p style={{ fontSize:12, color:"#B86540", marginTop:6, lineHeight:1.8 }}>
              {dateLabel} に気持ちがそろったね。<br/>ふたりだけの素敵な夜を過ごしてね 🌹
            </p>
          </div>
        ) : (
          /* 翌日以降：カウントダウン＋プログレス */
          <>
            <div className="flex flex-col items-center gap-1 py-2">
              <p style={{ fontSize:11, color:"#C4A898" }}>次のSyncまで：あと</p>
              <div className="flex items-end gap-1">
                <span className="font-bold" style={{ fontSize:56, color:"#D97B6C", lineHeight:1 }}>
                  {remainingDays}
                </span>
                <span className="pb-2 font-semibold" style={{ color:"#E8A882", fontSize:20 }}>日</span>
              </div>
              <p style={{ fontSize:11, color:"#C4A898" }}>{nextLabel} からまた選べるよ 🌿</p>
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <span style={{ fontSize:10, color:"#C4A898" }}>{dateLabel}（Sync日）</span>
                <span style={{ fontSize:10, color:"#C4A898" }}>{nextLabel}（次のSync）</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor:"#FDEBD0" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width:`${progress}%`, background:"linear-gradient(90deg,#FFE066,#FFB085,#D4845A)" }}/>
              </div>
            </div>
            <div className="px-4 py-3 rounded-2xl text-center"
              style={{ backgroundColor:"rgba(255,230,200,0.40)", border:"1px solid #FFD090" }}>
              <p style={{ fontSize:12, color:"#B86540", lineHeight:1.8 }}>
                次のふたりの特別な時間まで、<br/>毎日のちいさな幸せを大切にしようね 🌿
              </p>
            </div>
          </>
        )}

        {/* ⏱ 待機期間終了までのカウントダウン */}
        <div className="flex flex-col items-center gap-1.5 py-3 rounded-2xl"
          style={{ backgroundColor:"rgba(255,255,255,0.70)", border:"1.5px solid #FFD090" }}>
          <p style={{ fontSize:10, color:"#C4A898", letterSpacing:"0.05em" }}>
            待機期間終了まで
          </p>
          <div className="flex items-end gap-1.5">
            {[
              { val: days,    unit: "日" },
              { val: hours,   unit: "時" },
              { val: minutes, unit: "分" },
              { val: seconds, unit: "秒" },
            ].map(({ val, unit }, i) => (
              <div key={i} className="flex items-end gap-0.5">
                <span className="font-bold tabular-nums"
                  style={{ fontSize: i === 0 ? 32 : 26, color:"#D97B6C", lineHeight:1 }}>
                  {pad(val)}
                </span>
                <span className="pb-0.5 text-xs font-semibold" style={{ color:"#E8A882" }}>{unit}</span>
                {i < 3 && (
                  <span className="pb-1 font-bold" style={{ color:"#E8C8A0", fontSize:16, marginLeft:3 }}>:</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* リセットボタン */}
        <button onClick={onReset}
          className="w-full py-3 rounded-2xl font-semibold text-sm active:scale-95 transition-transform"
          style={{ backgroundColor:"rgba(255,255,255,0.85)", color:"#B86540", border:"1.5px solid #F0C8A0" }}>
          待機期間を終了する
        </button>
      </div>
    </div>
  );
}

// ─── 設定画面 ────────────────────────────────────────────
function SettingsScreen({
  onBack, initialCoupleId, syncGoal, setSyncGoal,
  initialConfirmedStart, initialConfirmedEnd,
  reminderWeekday, setReminderWeekday, reminderWeekend, setReminderWeekend,
  onSave, saving, onConfirmStart, onConfirmEnd, onResetPeriod,
  onGoalChange, onReminderChange,
}: {
  onBack:()=>void;
  initialCoupleId:string;
  syncGoal:number; setSyncGoal:(n:number)=>void;
  initialConfirmedStart: number | null;
  initialConfirmedEnd:   number | null;
  reminderWeekday:number; setReminderWeekday:(n:number)=>void;
  reminderWeekend:number; setReminderWeekend:(n:number)=>void;
  onSave:(coupleId:string, cStart:number|null, cEnd:number|null)=>void; saving:boolean;
  onConfirmStart:(start:number)=>Promise<void>;
  onConfirmEnd:(end:number)=>Promise<void>;
  onResetPeriod:()=>Promise<void>;
  onGoalChange:(newGoal:number)=>void;
  onReminderChange:(weekday:number, weekend:number)=>void;
}) {
  const [localCoupleId,    setLocalCoupleId]    = useState(initialCoupleId);
  const [confirming,       setConfirming]       = useState(false);
  const [resetting,        setResetting]        = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const cooldownDays = getCooldownDays(syncGoal);

  // ── 生理期間 ─────────────────────────────────────────────
  // YYYYMMDD 整数で管理（例: 2026年3月17日 → 20260317）
  const _now = new Date();
  // confirmed は initial props（DB読み込み値）で初期化
  const [confirmedStart, setConfirmedStart] = useState<number | null>(initialConfirmedStart);
  const [confirmedEnd,   setConfirmedEnd]   = useState<number | null>(initialConfirmedEnd);
  const [draftDate,      setDraftDate]      = useState<number | null>(null);
  // カレンダーの表示月：confirmed があればその月、なければ今月
  const _initYear  = initialConfirmedStart
    ? Math.floor(initialConfirmedStart / 10000)
    : _now.getFullYear();
  const _initMonth = initialConfirmedStart
    ? Math.floor((initialConfirmedStart % 10000) / 100) - 1
    : _now.getMonth();
  const [calYear,  setCalYear]  = useState(_initYear);
  const [calMonth, setCalMonth] = useState(_initMonth);

  // 小さなYMDヘルパー（このコンポーネント内だけで使う）
  const _toYMD = (y: number, m: number, d: number) => y * 10000 + (m + 1) * 100 + d;
  const _ymdLabel = (ymd: number) => {
    const m = Math.floor((ymd % 10000) / 100);
    const d = ymd % 100;
    return `${m}月${d}日`;
  };

  // 月ナビゲーション
  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  // 日付タップハンドラ（フェーズ共通：タップした日を draft に）
  const handleDayTap = (day: number) => {
    setDraftDate(_toYMD(calYear, calMonth, day));
  };

  // 開始日確定
  const handleConfirmStart = async () => {
    if (!draftDate || confirming) return;
    setConfirming(true);
    await onConfirmStart(draftDate);
    setConfirmedStart(draftDate);
    setConfirmedEnd(null); // 新しい開始のため終了日リセット
    setDraftDate(null);
    setConfirming(false);
  };

  // 終了日確定
  const handleConfirmEnd = async () => {
    if (!draftDate || confirming) return;
    if (confirmedStart && draftDate < confirmedStart) return;
    setConfirming(true);
    await onConfirmEnd(draftDate);
    setConfirmedEnd(draftDate);
    setDraftDate(null);
    setConfirming(false);
  };

  // リセット押下：DB削除 → ローカルstateをすべてクリア
  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    await onResetPeriod();
    setConfirmedStart(null);
    setConfirmedEnd(null);
    setDraftDate(null);
    setShowResetConfirm(false);
    setResetting(false);
  };


  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor:"#FFFBF5", color:"#4A3728" }}>
      <div className="flex items-center gap-3 px-4 py-5 sticky top-0 z-10"
        style={{ backgroundColor:"rgba(255,251,245,0.95)", borderBottom:"1px solid #FDEBD0", backdropFilter:"blur(8px)" }}>
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>←</button>
        <h1 className="font-bold text-base flex-1" style={{ color:"#8B4513" }}>設定・ふたりのルール</h1>
        <button onClick={()=>onSave(localCoupleId, confirmedStart, confirmedEnd)} disabled={saving}
          className="px-4 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
          style={{ backgroundColor:saving?"#FDEBD0":"#D97B6C", color:"white" }}>
          {saving ? "保存中…" : "保存 💾"}
        </button>
      </div>

      <div className="flex flex-col px-4 py-5 gap-5 max-w-sm w-full mx-auto">

        {/* カップルID */}
        <div className="rounded-3xl overflow-hidden" style={{ border:"1.5px solid #FDEBD0" }}>
          <div className="px-5 py-3.5" style={{ backgroundColor:"rgba(255,245,228,0.9)" }}>
            <p className="font-bold text-sm" style={{ color:"#B86540" }}>💑 カップルID</p>
            <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>ふたりで同じIDを設定してつながろう</p>
          </div>
          <div className="px-5 py-4" style={{ backgroundColor:"rgba(255,255,255,0.75)" }}>
            <input
              value={localCoupleId}
              onChange={e=>setLocalCoupleId(e.target.value.trim())}
              placeholder="例：akihiro-and-partner"
              className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
              style={{ backgroundColor:"#FFF5E4", border:"1.5px solid #FDEBD0", color:"#4A3728" }}
              onFocus={e=>e.currentTarget.style.border="1.5px solid #D97B6C"}
              onBlur={e=>e.currentTarget.style.border="1.5px solid #FDEBD0"}
            />
            <p style={{ fontSize:10, color:"#C4A898", marginTop:6 }}>※ パートナーと同じIDを入力すると、キモチが共有されます</p>
          </div>
        </div>

        {/* Sync目標 */}
        <div className="rounded-3xl overflow-hidden" style={{ border:"1.5px solid #FDEBD0" }}>
          <div className="px-5 py-3.5" style={{ backgroundColor:"rgba(255,245,228,0.9)" }}>
            <p className="font-bold text-sm" style={{ color:"#B86540" }}>🎯 今月のSync目標</p>
            <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>ふたりで話し合って決めよう</p>
          </div>
          <div className="px-5 py-5 flex flex-col items-center gap-4" style={{ backgroundColor:"rgba(255,255,255,0.75)" }}>
            <div className="flex items-center gap-6">
              <button onClick={()=>{ const v=Math.max(1,syncGoal-1); setSyncGoal(v); onGoalChange(v); }}
                className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-2xl active:scale-90 transition-transform shadow-sm"
                style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>−</button>
              <div className="flex flex-col items-center">
                <span className="font-bold" style={{ fontSize:48, color:"#D97B6C", lineHeight:1 }}>{syncGoal}</span>
                <span className="text-sm" style={{ color:"#C4A898" }}>回 / 月</span>
              </div>
              <button onClick={()=>{ const v=Math.min(20,syncGoal+1); setSyncGoal(v); onGoalChange(v); }}
                className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-2xl active:scale-90 transition-transform shadow-sm"
                style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>＋</button>
            </div>
            <div className="w-full px-4 py-3 rounded-2xl flex items-center gap-2"
              style={{ backgroundColor:"rgba(255,224,204,0.35)", border:"1px solid #FFE0CC" }}>
              <span style={{ fontSize:16 }}>⏳</span>
              <p style={{ fontSize:11, color:"#B86540" }}>
                Sync後は <span style={{ fontWeight:700 }}>{cooldownDays}日間</span> お休み期間になるよ
              </p>
            </div>
          </div>
        </div>

        {/* 生理期間 */}
        <div className="rounded-3xl overflow-hidden" style={{ border:"1.5px solid #FDEBD0" }}>
          {/* ヘッダー */}
          <div className="px-5 py-3.5" style={{ backgroundColor:"rgba(255,245,228,0.9)" }}>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize:16 }}>🌙</span>
              <p className="font-bold text-sm" style={{ color:"#B86540" }}>生理期間（自動お休みモード）</p>
            </div>
            <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
              開始日を記録すると自動でお休みモードになるよ
            </p>
          </div>

          {/* カレンダーエリア */}
          <div className="px-4 py-4" style={{ backgroundColor:"rgba(255,255,255,0.80)" }}>

            {/* 月ナビゲーション */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>‹</button>
              <p className="font-bold text-sm" style={{ color:"#4A3728" }}>
                {calYear}年 {calMonth + 1}月
              </p>
              <button onClick={nextMonth}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>›</button>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 mb-1">
              {["日","月","火","水","木","金","土"].map(d => (
                <div key={d} className="text-center"
                  style={{ fontSize:10, color:"#C4A898", fontWeight:600, paddingBottom:4 }}>{d}</div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-y-1">
              {(() => {
                const firstDow  = new Date(calYear, calMonth, 1).getDay();
                const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                const cells: (number | null)[] = [
                  ...Array(firstDow).fill(null),
                  ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
                ];
                while (cells.length % 7 !== 0) cells.push(null);

                return cells.map((d, i) => {
                  if (d == null) return <div key={i} />;
                  const ymd = _toYMD(calYear, calMonth, d);

                  // フェーズ別のカレンダー表示
                  // phase 0: 開始日選択中 / phase 1: 生理中・終了日選択中 / phase 2: 確定済み
                  const phase = !confirmedStart ? "start" : !confirmedEnd ? "end" : "done";
                  const activeSt  = phase === "start" ? draftDate  : confirmedStart;
                  const activeEnd = phase === "start" ? null
                                 : phase === "end"    ? draftDate
                                 :                      confirmedEnd;

                  const isEdge  = (activeSt  !== null && ymd === activeSt)
                               || (activeEnd !== null && ymd === activeEnd);
                  const isRange = activeSt !== null && activeEnd !== null
                    && ymd > activeSt && ymd < activeEnd;

                  const edgeBg    = (ymd === confirmedStart) ? "#6B5A90" : "#8B7BA8";
                  const edgeLine  = (ymd === confirmedStart) ? "#6B5A90" : "#8B7BA8";
                  const rangeBg   = phase === "done" ? "rgba(139,123,168,0.28)" : "rgba(196,180,224,0.35)";
                  const rangeText = phase === "done" ? "#5A4A80" : "#6B5A8A";

                  return (
                    <button key={i}
                      onClick={() => handleDayTap(d)}
                      className="flex items-center justify-center rounded-full mx-auto active:scale-90 transition-all duration-150"
                      style={{
                        width:           32,
                        height:          32,
                        fontSize:        13,
                        fontWeight:      isEdge ? 700 : 400,
                        backgroundColor: isEdge  ? edgeBg
                                       : isRange ? rangeBg
                                       : "transparent",
                        color:           isEdge  ? "#fff"
                                       : isRange ? rangeText
                                       : "#4A3728",
                        outline:         isEdge  ? `2px solid ${edgeLine}` : "none",
                        outlineOffset:   1,
                      }}>
                      {d}
                    </button>
                  );
                });
              })()}
            </div>

            {/* フェーズ別：状態表示 & 確定ボタン */}
            {!confirmedStart ? (
              /* Phase 0: 開始日選択 */
              <>
                <div className="mt-4 px-4 py-3 rounded-2xl"
                  style={{ backgroundColor:"rgba(253,235,208,0.5)", border:"1px solid #FDEBD0" }}>
                  <p style={{ fontSize:11, color:"#C4A898" }}>
                    🌙 開始日をタップして選んでね
                  </p>
                </div>
                {draftDate && (
                  <button onClick={handleConfirmStart} disabled={confirming}
                    className="mt-3 w-full py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
                    style={{ backgroundColor: confirming ? "#F4A8B8" : "#C46880", color:"#fff" }}>
                    {confirming ? "保存中…" : `${_ymdLabel(draftDate)} から開始する 🌸`}
                  </button>
                )}
              </>
            ) : !confirmedEnd ? (
              /* Phase 1: 生理中 → 終了日選択 */
              <>
                <div className="mt-4 px-4 py-3 rounded-2xl"
                  style={{ backgroundColor:"rgba(255,182,193,0.2)", border:"1px solid #F4A8B8" }}>
                  <p style={{ fontSize:11, color:"#C46880", fontWeight:600 }}>
                    🌸 いま生理中です（{_ymdLabel(confirmedStart)}〜）
                  </p>
                  <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
                    終わったら、その日をタップしてね
                  </p>
                </div>
                {draftDate && draftDate >= confirmedStart && (
                  <button onClick={handleConfirmEnd} disabled={confirming}
                    className="mt-3 w-full py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
                    style={{ backgroundColor: confirming ? "#C4B4E0" : "#8B7BA8", color:"#fff" }}>
                    {confirming ? "保存中…" : `${_ymdLabel(draftDate)} を終了日にする 🌙`}
                  </button>
                )}
                <div className="mt-2 flex justify-end">
                  {!showResetConfirm && (
                    <button onClick={() => setShowResetConfirm(true)}
                      style={{ fontSize:10, color:"#C4A898" }}>リセット</button>
                  )}
                </div>
                {showResetConfirm && (
                  <div className="mt-2 px-4 py-3 rounded-2xl flex items-center justify-between gap-3"
                    style={{ backgroundColor:"rgba(255,100,80,0.07)", border:"1px solid rgba(217,123,108,0.35)" }}>
                    <p style={{ fontSize:11, color:"#D97B6C" }}>本当にリセットしますか？</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowResetConfirm(false)}
                        className="px-3 py-1.5 rounded-xl text-xs"
                        style={{ backgroundColor:"rgba(255,255,255,0.8)", color:"#9A7B6A", border:"1px solid #FDEBD0" }}>
                        キャンセル
                      </button>
                      <button onClick={handleReset} disabled={resetting}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                        style={{ backgroundColor: resetting ? "#FDEBD0" : "#D97B6C", color:"#fff" }}>
                        {resetting ? "…" : "消す"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Phase 2: 開始・終了どちらも記録済み */
              <>
                <div className="mt-4 px-4 py-3 rounded-2xl flex items-center justify-between gap-2"
                  style={{ backgroundColor:"rgba(139,123,168,0.1)", border:"1px solid #C4B4E0" }}>
                  <p style={{ fontSize:11, color:"#6B5A90", fontWeight:600 }}>
                    ✓ {_ymdLabel(confirmedStart)} 〜 {_ymdLabel(confirmedEnd)} を記録済み
                  </p>
                  {!showResetConfirm && (
                    <button onClick={() => setShowResetConfirm(true)}
                      style={{ fontSize:10, color:"#C4A898", whiteSpace:"nowrap", flexShrink:0 }}>
                      リセット
                    </button>
                  )}
                </div>
                {showResetConfirm && (
                  <div className="mt-2 px-4 py-3 rounded-2xl flex items-center justify-between gap-3"
                    style={{ backgroundColor:"rgba(255,100,80,0.07)", border:"1px solid rgba(217,123,108,0.35)" }}>
                    <p style={{ fontSize:11, color:"#D97B6C" }}>本当にリセットしますか？</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowResetConfirm(false)}
                        className="px-3 py-1.5 rounded-xl text-xs"
                        style={{ backgroundColor:"rgba(255,255,255,0.8)", color:"#9A7B6A", border:"1px solid #FDEBD0" }}>
                        キャンセル
                      </button>
                      <button onClick={handleReset} disabled={resetting}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                        style={{ backgroundColor: resetting ? "#FDEBD0" : "#D97B6C", color:"#fff" }}>
                        {resetting ? "…" : "消す"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </div>

        {/* リマインド設定 */}
        <div className="rounded-3xl overflow-hidden" style={{ border:"1.5px solid #FDEBD0" }}>
          <div className="px-5 py-3.5" style={{ backgroundColor:"rgba(255,245,228,0.9)" }}>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize:16 }}>🔔</span>
              <p className="font-bold text-sm" style={{ color:"#B86540" }}>キモチ確認のリマインド時刻</p>
            </div>
            <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
              平日と休日で別々に設定できるよ
            </p>
          </div>
          <div className="px-5 py-4 flex flex-col gap-4" style={{ backgroundColor:"rgba(255,255,255,0.75)" }}>
            {[
              { label:"平日（月〜金）", value: reminderWeekday, setValue: (v:number) => { setReminderWeekday(v); onReminderChange(v, reminderWeekend); } },
              { label:"休日（土・日）", value: reminderWeekend, setValue: (v:number) => { setReminderWeekend(v); onReminderChange(reminderWeekday, v); } },
            ].map(({ label, value, setValue }) => (
              <div key={label} className="flex items-center justify-between">
                <p style={{ fontSize:12, color:"#9A7B6A", fontWeight:600 }}>{label}</p>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setValue(Math.max(0, value-1))}
                    className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                    style={{ backgroundColor:"#FFE0CC", color:"#B86540", fontSize:16, fontWeight:700 }}>−</button>
                  <div className="flex items-baseline gap-0.5 w-16 justify-center">
                    <span className="font-bold" style={{ fontSize:24, color:"#D97B6C" }}>
                      {String(value).padStart(2,"0")}
                    </span>
                    <span style={{ fontSize:11, color:"#C4A898" }}>:00</span>
                  </div>
                  <button onClick={()=>setValue(Math.min(23, value+1))}
                    className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                    style={{ backgroundColor:"#FFE0CC", color:"#B86540", fontSize:16, fontWeight:700 }}>＋</button>
                </div>
              </div>
            ))}
            <div className="px-4 py-2.5 rounded-2xl text-center"
              style={{ backgroundColor:"rgba(255,224,204,0.3)", border:"1px solid #FFE0CC" }}>
              <p style={{ fontSize:11, color:"#B86540" }}>
                今日（{new Date().getDay()===0||new Date().getDay()===6?"休日":"平日"}）は&nbsp;
                <span style={{ fontWeight:700 }}>
                  {String(getTodayReminderHour(reminderWeekday, reminderWeekend)).padStart(2,"0")}:00
                </span>
                &nbsp;に確認しよう 🔔
              </p>
            </div>
          </div>
        </div>

        <div className="h-8"/>
      </div>
    </div>
  );
}
function LoadingScreen() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3" style={{ backgroundColor:"#FFFBF5" }}>
      <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
        style={{ background:"linear-gradient(135deg,#FFE0CC,#FBE8E6)" }}>💛</div>
      <p className="text-sm font-medium" style={{ color:"#C4A898" }}>よみこみ中…</p>
    </div>
  );
}

// ─── カップルID未設定 ─────────────────────────────────────
function NoCoupleIdScreen({ onGoSettings }: { onGoSettings:()=>void }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 gap-5" style={{ backgroundColor:"#FFFBF5" }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
        style={{ background:"linear-gradient(135deg,#FFE0CC,#FBE8E6)" }}>💑</div>
      <div className="text-center flex flex-col gap-2">
        <p className="font-bold text-base" style={{ color:"#B86540" }}>カップルIDを設定しよう</p>
        <p className="text-sm leading-relaxed" style={{ color:"#C4A898" }}>
          パートナーとつながるために、<br/>ふたりで同じカップルIDを設定してね 🌸
        </p>
      </div>
      <button onClick={onGoSettings}
        className="px-8 py-3.5 rounded-2xl font-bold text-white active:scale-95 transition-transform"
        style={{ background:"linear-gradient(135deg,#F0A899,#D97B6C)", boxShadow:"0 4px 16px rgba(217,123,108,0.3)" }}>
        設定する ⚙️
      </button>
    </div>
  );
}



// ─── メインページ ─────────────────────────────────────────
export default function Home() {
  const [myEmail,  setMyEmail]  = useState("");
  const [loading,  setLoading]  = useState(true);
  const [screen,   setScreen]   = useState<Screen>("home");
  const [saving,   setSaving]   = useState(false);
  const [coupleId, setCoupleId] = useState("");

  // ── ★ source of truth: DBの行をそのまま保持 ─────────────
  // myRow / partnerRow は myEmail で毎回派生させる
  // → どのタイミングでも必ず正しい仕分けになる
  const [syncData, setSyncData] = useState<SyncRow[]>([]);

  // ── 設定（自分の行から初期値をロード・設定画面で編集） ──
  const [coupleIdInput, setCoupleIdInput] = useState("");
  const [syncGoal,  setSyncGoal]  = useState(4);
  const now = new Date();
  // ── リマインド設定 ────────────────────────────────────────
  const [reminderWeekday, setReminderWeekday] = useState(17);
  const [reminderWeekend, setReminderWeekend] = useState(19);
  // Supabaseから実際の設定値を受け取ったかどうか（デフォルト値での誤判定防止）
  const [reminderLoaded, setReminderLoaded] = useState(false);
  // ── キモチ履歴（週次ふりかえり） ─────────────────────────
  const [kimochiLog, setKimochiLog] = useState<KimochiLogEntry[]>([]);

  // ── UI状態 ──
  const [is17,          setIs17]          = useState(false);
  const [showMatch,     setShowMatch]     = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [lastSyncDate,  setLastSyncDate]  = useState<string|null>(null);

  // ── Toast ──
  const [toast, setToast] = useState({on:false, msg:""});
  const pop = useCallback((msg:string) => {
    setToast({on:true, msg});
    setTimeout(()=>setToast({on:false, msg:""}), 2200);
  }, []);

  const today = getLocalDateStr();

  // ── Ref（コールバック内で最新値を参照） ──────────────────
  const todayRef        = useRef(today);
  const lastSyncDateRef = useRef<string|null>(null);
  useEffect(() => { lastSyncDateRef.current = lastSyncDate; }, [lastSyncDate]);
  // パートナーのメールを ref で保持（handleReminderChange の stale closure 対策）
  const partnerEmailRef = useRef<string|null>(null);

  // ── syncData から派生する値（★ 毎レンダーで再計算） ──────
  // myEmail で厳格に仕分け → ミラーリング不可能
  const myRow = syncData.find(
    r => r.user_email === myEmail && r.couple_id === coupleId
  ) ?? null;

  // ★ パートナー判定：以下をすべて満たす行のみ
  //   1. coupleId が完全一致（別IDの残骸を拾わない）
  //   2. user_email が自分ではない（自分自身を相手扱いしない）
  //   3. user_email が空文字でない
  const partnerRow = syncData.find(
    r => r.couple_id === coupleId.trim()
      && r.user_email !== myEmail
      && r.user_email !== ""
  ) ?? null;

  // ── 生理期間（syncData の myRow から派生 → Realtime と常に同期） ─
  const savedMoonStart = myRow?.moon_start ?? null;
  const savedMoonEnd   = myRow?.moon_end   ?? null;
  // ── 生理期間中判定（useCallback より前に置き、stale closure を防ぐ） ─
  const todayInt   = parseInt(today.replace(/-/g, ""), 10);
  const isInPeriod =
    savedMoonStart !== null && (
      savedMoonEnd === null ||                                    // 開始後・未終了 → ずっとON
      (todayInt >= savedMoonStart && todayInt <= savedMoonEnd)   // 範囲内
    );

  // ── パートナーの生理期間中判定 ─────────────────────────────
  const partnerMoonStart = partnerRow?.moon_start ?? null;
  const partnerMoonEnd   = partnerRow?.moon_end   ?? null;
  const partnerIsInPeriod =
    partnerMoonStart !== null && (
      partnerMoonEnd === null ||
      (todayInt >= partnerMoonStart && todayInt <= partnerMoonEnd)
    );

  // ── 気づかいカード文言（パートナーが生理中のとき表示） ────────
  const partnerCarePatterns = [
    { emoji: "🌿", title: "今日はゆっくり見守ろう",         message: "近くにいるだけで十分だよ" },
    { emoji: "☕", title: "無理に合わせなくて大丈夫",       message: "やさしく過ごしてあげよう" },
    { emoji: "🌙", title: "今日は静かに寄り添おう",         message: "そっと気にかけてあげてね" },
    { emoji: "🍵", title: "近くにいるだけでも十分だよ",     message: "無理せず、やさしく過ごそう" },
    { emoji: "🌸", title: "相手のペースを大切にしよう",     message: "今日はそっと見守る日にしよう" },
  ];
  const partnerCare = partnerCarePatterns[todayInt % partnerCarePatterns.length];

  // ── 生理何日目か（1-based）としんどさレベル ───────────────
  const periodDayCount = (() => {
    if (!savedMoonStart) return 0;
    const sy = Math.floor(savedMoonStart / 10000);
    const sm = Math.floor((savedMoonStart % 10000) / 100) - 1;
    const sd = savedMoonStart % 100;
    const start = new Date(sy, sm, sd); start.setHours(0,0,0,0);
    const now   = new Date();           now.setHours(0,0,0,0);
    return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1);
  })();
  const periodLevel = periodDayCount <= 2 ? "max" : periodDayCount <= 4 ? "mid" : "low";
  const periodPatterns = {
    max: [
      { emoji: "🤒", title: "今日はかなりしんどい日かも",     message: "今日はできるだけゆっくりしてね" },
      { emoji: "🤒", title: "まずは休むことを優先しよう",     message: "あたたかくして過ごせたら十分だよ" },
      { emoji: "🤒", title: "無理せずゆっくりしたい日",       message: "無理を減らして過ごそう" },
      { emoji: "🤒", title: "今日はがんばりすぎなくて大丈夫", message: "少しでも楽に過ごせますように" },
    ],
    mid: [
      { emoji: "😵", title: "少ししんどさが残る頃",           message: "できることだけで十分だよ" },
      { emoji: "😵", title: "今日は落ち着いて過ごしたいね",   message: "ひと息つきながらいこう" },
      { emoji: "😵", title: "無理のない一日にしよう",         message: "落ち着ける時間を大切にしよう" },
      { emoji: "😵", title: "ゆるやかに整えていく日",         message: "ゆっくりペースで大丈夫だよ" },
    ],
    low: [
      { emoji: "😌", title: "少しずつ楽になってくる頃",       message: "自分のペースで過ごそう" },
      { emoji: "😌", title: "今日は穏やかに過ごせそう",       message: "気負わずゆるくいけたら十分" },
      { emoji: "😌", title: "やさしく日常に戻していこう",     message: "ほっとできる時間を持てるといいね" },
      { emoji: "😌", title: "すこし軽くなってくるタイミング", message: "穏やかに過ごせますように" },
    ],
  };
  // periodDayCount でインデックスを固定し、当日中は同じ文言が出るようにする
  const periodCopyList = periodPatterns[periodLevel];
  const periodCopy = periodCopyList[periodDayCount % periodCopyList.length];

  const myKimochi: Kimochi = myRow?.kimochi_date?.substring(0,10) === today
    ? normalizeKimochi(myRow.kimochi) : null;
  const partnerKimochi: Kimochi = partnerRow?.kimochi_date?.substring(0,10) === today
    ? normalizeKimochi(partnerRow.kimochi) : null;

  // partnerEmailRef を最新の partnerRow に追従させる
  useEffect(() => { partnerEmailRef.current = partnerRow?.user_email ?? null; }, [partnerRow]);

  // ─── syncData を更新する共通関数 ─────────────────────────
  // 同じ user_email の行だけ差し替え、他の行はそのまま残す
  const mergeRow = useCallback((newRow: SyncRow) => {
    setSyncData(prev => {
      const exists = prev.some(r => r.user_email === newRow.user_email);
      if (exists) {
        return prev.map(r =>
          r.user_email === newRow.user_email ? { ...r, ...newRow } : r
        );
      }
      return [...prev, newRow]; // 新規行（初回INSERT）
    });
  }, []);

  // ─── 自分の行から設定値をstateに反映 ─────────────────────
  const applyMySettings = useCallback((row: SyncRow) => {
    setSyncGoal(row.sync_goal ?? 4);
    setLastSyncDate(row.last_sync_date ?? null);
    if (row.reminder_weekday != null) setReminderWeekday(row.reminder_weekday);
    if (row.reminder_weekend != null) setReminderWeekend(row.reminder_weekend);
    setReminderLoaded(true);
    if (row.kimochi_log) setKimochiLog(row.kimochi_log);
    // 生理期間は syncData → myRow から派生するため、ここでの個別セットは不要
  }, []);

  // ─── 全行ロード ───────────────────────────────────────────
  const loadAll = useCallback(async (cid: string, email: string) => {
    if (!cid || !email) return;
    const { data, error } = await supabase
      .from("sync_status").select("*").eq("couple_id", cid);
    if (error) { console.error("[Sync] loadAll:", error); return; }
    if (!data?.length) return;

    // syncData にすべての行をセット（仕分けはレンダー時に myEmail で行う）
    setSyncData(data as SyncRow[]);

    // 自分の行から設定値を復元（全行渡してパートナーの月データも参照）
    const myR = (data as SyncRow[]).find(r => r.user_email === email);
    if (myR) applyMySettings(myR);

    // 自分のリマインド設定が未設定の場合、パートナーの値をフォールバックとして使う
    // （片方が先に設定済みの場合に初回表示から一致させる）
    const pR2 = (data as SyncRow[]).find(r => r.user_email !== email && r.user_email !== "");
    if (myR?.reminder_weekday == null && pR2?.reminder_weekday != null) {
      setReminderWeekday(pR2.reminder_weekday);
    }
    if (myR?.reminder_weekend == null && pR2?.reminder_weekend != null) {
      setReminderWeekend(pR2.reminder_weekend);
    }

    // 両方選択済みならマッチ・is17 復元
    const todayStr = todayRef.current;
    const myK = myR?.kimochi_date?.substring(0,10) === todayStr
      ? normalizeKimochi(myR.kimochi) : null;
    const pR = (data as SyncRow[]).find(r => r.user_email !== email && r.user_email !== "");
    const pK = pR?.kimochi_date?.substring(0,10) === todayStr
      ? normalizeKimochi(pR.kimochi) : null;
    if (myK && pK) { setShowMatch(true); setIs17(true); }
    if (pK) setIs17(true);
  }, [applyMySettings]);

  // ─── 1. 初期化 ────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setMyEmail(data.user.email);
    });
    const saved = localStorage.getItem("sync_couple_id") || "";
    setCoupleId(saved);
    setCoupleIdInput(saved);
  }, []);

  // ─── 2. coupleId + email 揃ったら初期ロード ───────────────
  useEffect(() => {
    if (coupleId && myEmail) {
      // ★ coupleId が変わったら古い syncData を必ずクリア（別IDの残骸を防ぐ）
      setSyncData([]);
      setLoading(true);
      loadAll(coupleId, myEmail).finally(() => setLoading(false));
    } else if (myEmail) {
      setSyncData([]); // coupleId 未設定時もクリア
      setLoading(false);
    }
  }, [coupleId, myEmail, loadAll]);

  // ─── 3. Realtime購読 ──────────────────────────────────────
  useEffect(() => {
    if (!coupleId || !myEmail) return;

    const channel = supabase
      .channel(`room_${coupleId}_${myEmail}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_status" },
        (payload) => {
          const newRow = payload.new as SyncRow;
          if (!newRow?.user_email) return;
          // ★ coupleId の完全一致（trim済み）を厳格にチェック
          if (newRow.couple_id?.trim() !== coupleId.trim()) return;

          console.log("[Sync] realtime:",
            newRow.user_email === myEmail ? "【自分】" : "【パートナー】",
            newRow.user_email, "kimochi=", newRow.kimochi);

          // ★ syncData を差し替えるだけ
          // → myRow/partnerRow はレンダー時に myEmail で再計算される
          mergeRow(newRow);

          if (newRow.user_email === myEmail) {
            // 自分の行：設定値を反映
            applyMySettings(newRow);
          } else {
            // パートナーの行：月経データは syncData → moonRow 派生で自動反映されるため手動同期不要
            // ★ パートナーの sync_goal が変わったら自分の画面にも反映
            if (newRow.sync_goal != null) {
              setSyncGoal(newRow.sync_goal);
            }
            // ★ パートナーのリマインド設定が変わったら自分の画面にも即反映（カップル共有設定）
            if (newRow.reminder_weekday != null) setReminderWeekday(newRow.reminder_weekday);
            if (newRow.reminder_weekend != null) {
              setReminderWeekend(newRow.reminder_weekend);
              setReminderLoaded(true); // 時刻自動解放チェックを有効化
            }

            // パートナーの行：通知 & マッチ判定
            const partnerK = normalizeKimochi(
              newRow.kimochi_date?.substring(0,10) === todayRef.current
                ? newRow.kimochi : null
            );
            if (partnerK) {
              setIs17(true);
              pop("パートナーがキモチを更新したよ 🌿");

              // マッチ判定：syncData の最新 myRow を参照
              setSyncData(current => {
                const latestMyRow = current.find(r => r.user_email === myEmail);
                const myK = latestMyRow?.kimochi_date?.substring(0,10) === todayRef.current
                  ? normalizeKimochi(latestMyRow.kimochi) : null;
                if (myK && partnerK) {
                  setShowMatch(true);
                  if (myK === "circle" && partnerK === "circle") {
                    setShowFireworks(true);
                    const syncDate = todayRef.current;
                    setLastSyncDate(syncDate);
                    supabase.from("sync_status").upsert({
                      couple_id:      coupleId,
                      user_email:     myEmail,
                      last_sync_date: syncDate,
                      updated_at:     new Date().toISOString(),
                    }, { onConflict: "couple_id,user_email" });
                  }
                }
                return current; // state は変えない
              });
            }
          }
        }
      )
      .subscribe(status => console.log(`[Sync] channel: ${status}`));

    return () => { supabase.removeChannel(channel); };
  }, [coupleId, myEmail, mergeRow, applyMySettings, pop]);

  // ─── 4. ポーリング（kimochi のみ・設定値は触らない） ────────
  useEffect(() => {
    if (!coupleId || !myEmail) return;

    // select で取得する部分型を定義
    type PollRow = Pick<SyncRow, "user_email" | "kimochi" | "kimochi_date" | "last_sync_date">;

    const poll = async () => {
      const { data } = await supabase
        .from("sync_status")
        .select("user_email, kimochi, kimochi_date, last_sync_date")
        .eq("couple_id", coupleId);
      if (!data?.length) return;

      const pR = (data as PollRow[]).find(r => r.user_email !== myEmail && r.user_email !== "");
      if (!pR) return;

      const todayStr   = todayRef.current;
      const isToday    = pR.kimochi_date?.substring(0,10) === todayStr;
      const newPartnerK: Kimochi = normalizeKimochi(isToday ? pR.kimochi : null);

      // 前回と変化があった時だけ更新
      setSyncData(prev => {
        const existing = prev.find(r => r.user_email === pR.user_email);
        const prevK = existing?.kimochi_date?.substring(0,10) === todayStr
          ? normalizeKimochi(existing.kimochi) : null;

        if (prevK === newPartnerK) return prev; // 変化なし

        console.log("[Sync] polling partner:", prevK, "→", newPartnerK);

        if (newPartnerK) {
          setIs17(true);
          if (!prevK) pop("パートナーがキモチを選んだよ 🌿");
        }

        // マッチ判定
        const myR = prev.find(r => r.user_email === myEmail);
        const myK = myR?.kimochi_date?.substring(0,10) === todayStr
          ? normalizeKimochi(myR.kimochi) : null;
        if (myK && newPartnerK) {
          setShowMatch(true);
          if (myK === "circle" && newPartnerK === "circle") {
            setShowFireworks(true);
            const syncDate = todayStr;
            setLastSyncDate(syncDate);
            supabase.from("sync_status").upsert({
              couple_id:  coupleId,
              user_email: myEmail,
              last_sync_date: syncDate,
              updated_at: new Date().toISOString(),
            }, { onConflict: "couple_id,user_email" });
          }
        }

        // syncData の partner 行を更新
        const exists = prev.some(r => r.user_email === pR.user_email);
        if (exists) {
          return prev.map(r => r.user_email === pR.user_email
            ? { ...r, kimochi: pR.kimochi, kimochi_date: pR.kimochi_date } : r);
        }
        return [...prev, pR as unknown as SyncRow];
      });
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [coupleId, myEmail, pop]);

  // ─── 4b. リマインド時刻を過ぎたら自動的にキモチ選択を解放 ──
  // ・reminderLoaded が true になるまで実行しない
  //   （Supabase読み込み前のデフォルト値 17/19 での誤判定を防ぐ）
  // ・設定変更直後に即チェック → 設定→ホーム遷移で即時反映
  // ・1分ごとに再チェック → リマインド時刻になった瞬間に自動解放
  // ・is17 を true にするだけ（false に戻す処理はしない）
  useEffect(() => {
    if (!reminderLoaded) return;
    const unlock = () => {
      const rHour = getTodayReminderHour(reminderWeekday, reminderWeekend);
      if (new Date().getHours() >= rHour) setIs17(true);
    };
    unlock();
    const id = setInterval(unlock, 60_000);
    return () => clearInterval(id);
  }, [reminderWeekday, reminderWeekend, reminderLoaded]);

  // ─── 5. キモチ保存 ────────────────────────────────────────
  const saveMyKimochi = useCallback(async (val: Kimochi, newLastSync?: string) => {
    if (!coupleId || !myEmail) return;

    const payload = {
      couple_id:      coupleId,
      user_email:     myEmail,
      kimochi:        val,
      kimochi_date:   getLocalDateStr(),
      last_sync_date: newLastSync ?? lastSyncDateRef.current,
      updated_at:     new Date().toISOString(),
    };

    // 楽観的更新：syncData を即座に更新
    mergeRow({ ...payload } as unknown as SyncRow);

    const { error } = await supabase.from("sync_status")
      .upsert(payload, { onConflict: "couple_id,user_email" });
    if (error) console.error("[Sync] upsert:", error);
    else       console.log("[Sync] upsert成功:", val);
  }, [coupleId, myEmail, mergeRow]);

  // ─── 5b. キモチログ保存（6より前に定義が必要） ────────────
  const saveKimochiLog = useCallback(async (myK: Kimochi, partnerK: Kimochi) => {
    if (!coupleId || !myEmail || !myK || !partnerK) return;
    const date = getLocalDateStr();
    const newLog = addKimochiLog(kimochiLog, date, myK, partnerK);
    setKimochiLog(newLog);
    await supabase.from("sync_status").upsert({
      couple_id:   coupleId,
      user_email:  myEmail,
      kimochi_log: newLog,
      updated_at:  new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
  }, [coupleId, myEmail, kimochiLog]);

  // ─── 6. キモチ選択ハンドラ ─────────────────────────────────
  const handleKimochiSelect = useCallback(async (val: Kimochi) => {
    if (isInPeriod) return; // お休みモード中は入力ガード
    setShowMatch(false);
    setShowFireworks(false);
    await saveMyKimochi(val);
    pop("キモチを更新したよ 🌸");

    // パートナーも選択済みならマッチ判定
    setSyncData(current => {
      const todayStr = todayRef.current;
      const pRow = current.find(r => r.user_email !== myEmail && r.user_email !== "");
      const prevP = pRow?.kimochi_date?.substring(0,10) === todayStr
        ? normalizeKimochi(pRow.kimochi) : null;
      if (val && prevP) {
        setShowMatch(true);
        // ★ ログに記録（両方選択済み）
        saveKimochiLog(val, prevP);
        if (val === "circle" && prevP === "circle") {
          setShowFireworks(true);
          const syncDate = todayStr;
          setLastSyncDate(syncDate);
          saveMyKimochi(val, syncDate);
        }
      }
      return current;
    });
  }, [saveMyKimochi, saveKimochiLog, myEmail, pop, isInPeriod]);

  // ─── 7. クールダウンリセット ───────────────────────────────
  const handleCooldownReset = useCallback(async () => {
    setLastSyncDate(null);
    if (coupleId && myEmail) {
      await supabase.from("sync_status").upsert({
        couple_id: coupleId, user_email: myEmail,
        last_sync_date: null, updated_at: new Date().toISOString(),
      }, { onConflict: "couple_id,user_email" });
    }
    pop("クールダウンをリセットしました");
  }, [coupleId, myEmail, pop]);

  // ─── 8b. 生理開始日の記録 ────────────────────────────────
  const handleConfirmStart = useCallback(async (start: number) => {
    if (!coupleId || !myEmail) return;
    await supabase.from("sync_status").upsert({
      couple_id:  coupleId,
      user_email: myEmail,
      moon_start: start,
      moon_end:   null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
    setSyncData(prev => prev.map(r =>
      r.user_email === myEmail ? { ...r, moon_start: start, moon_end: null } : r
    ));
    pop("生理開始日を記録したよ 🌸");
  }, [coupleId, myEmail, pop]);

  // ─── 8c. 生理終了日の記録 ────────────────────────────────
  const handleConfirmEnd = useCallback(async (end: number) => {
    if (!coupleId || !myEmail) return;
    await supabase.from("sync_status").upsert({
      couple_id:  coupleId,
      user_email: myEmail,
      moon_end:   end,
      updated_at: new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
    setSyncData(prev => prev.map(r =>
      r.user_email === myEmail ? { ...r, moon_end: end } : r
    ));
    pop("生理終了日を記録したよ 🌙");
  }, [coupleId, myEmail, pop]);

  const handleResetPeriod = useCallback(async () => {
    if (!coupleId || !myEmail) return;
    await supabase.from("sync_status").upsert({
      couple_id:  coupleId,
      user_email: myEmail,
      moon_start: null,
      moon_end:   null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
    setSyncData(prev => prev.map(r =>
      r.user_email === myEmail ? { ...r, moon_start: null, moon_end: null } : r
    ));
    pop("生理期間をリセットしたよ 🗑️");
  }, [coupleId, myEmail, pop]);

  // ─── 8. 設定保存 ─────────────────────────────────────────
  const handleSaveSettings = useCallback(async (
    newCoupleId: string,
    cStart: number | null,
    cEnd:   number | null,
  ) => {
    setSaving(true);
    setCoupleId(newCoupleId);
    localStorage.setItem("sync_couple_id", newCoupleId);
    if (newCoupleId && myEmail) {
      await supabase.from("sync_status").upsert({
        couple_id:  newCoupleId,
        user_email: myEmail,
        sync_goal:  syncGoal,
        moon_start: cStart,
        moon_end:   cEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: "couple_id,user_email" });
      setSyncData(prev => prev.map(r =>
        r.user_email === myEmail ? { ...r, moon_start: cStart, moon_end: cEnd } : r
      ));
    }
    setSaving(false);
    pop("設定を保存したよ 💾");
    setScreen("home");
  }, [syncGoal, myEmail, pop]);

  // ─── 9a. Sync目標の即時保存 ───────────────────────────────
  const handleGoalChange = useCallback(async (newGoal: number) => {
    if (!coupleId || !myEmail) return;
    await supabase.from("sync_status").upsert({
      couple_id:  coupleId,
      user_email: myEmail,
      sync_goal:  newGoal,
      updated_at: new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
  }, [coupleId, myEmail]);

  // ─── 9c. リマインド設定の即時保存（カップル共有設定：両行に書き込む） ──
  const handleReminderChange = useCallback(async (weekday: number, weekend: number) => {
    if (!coupleId || !myEmail) return;
    const payload = {
      reminder_weekday: weekday,
      reminder_weekend: weekend,
      updated_at:       new Date().toISOString(),
    };
    // 自分の行に保存
    await supabase.from("sync_status").upsert(
      { couple_id: coupleId, user_email: myEmail, ...payload },
      { onConflict: "couple_id,user_email" }
    );
    // パートナーが接続済みなら相手の行にも同じ値を保存（DB レベルで一致させる）
    const partnerEmail = partnerEmailRef.current;
    if (partnerEmail) {
      await supabase.from("sync_status").upsert(
        { couple_id: coupleId, user_email: partnerEmail, ...payload },
        { onConflict: "couple_id,user_email" }
      );
    }
  }, [coupleId, myEmail]);

  // ─── 9a. Sync目標の即時保存（9c の前に番号を詰める）─────

  // ─── 計算 ─────────────────────────────────────────────────
  const cooldownDays = getCooldownDays(syncGoal);
  const getRemainingDays = () => {
    if (!lastSyncDate) return 0;
    const sync = new Date(lastSyncDate); sync.setHours(0,0,0,0);
    const todayD = new Date(); todayD.setHours(0,0,0,0);
    return Math.max(0, cooldownDays - Math.floor((todayD.getTime()-sync.getTime())/86400000));
  };
  const remainingDays = getRemainingDays();
  const todayStr2  = getLocalDateStr();
  const isSyncToday = !!lastSyncDate && lastSyncDate.substring(0,10) === todayStr2;
  const isInCooldown = isSyncToday || remainingDays > 0;

  const resetKimochi = () => {
    setShowMatch(false);
    if (!isInCooldown) setIs17(false);
    // syncData の myRow の kimochi をリセット
    setSyncData(prev => prev.map(r =>
      r.user_email === myEmail ? { ...r, kimochi: null, kimochi_date: null } : r
    ));
  };

  // ── 週次ふりかえり用：自分＋パートナーのキモチログをマージ ───
  // パートナーのログはパートナー視点（my↔partner が逆）なので反転して統合する
  // これにより、どちらの端末から見ても同じふりかえり内容になる
  const mergedKimochiLog: KimochiLogEntry[] = (() => {
    const myLog = kimochiLog;
    const partnerLog = partnerRow?.kimochi_log ?? [];
    const map = new Map<string, KimochiLogEntry>();
    // 自分のログを優先
    for (const e of myLog) map.set(e.date, e);
    // パートナーのログで自分に無い日を補完（my↔partner を反転）
    for (const e of partnerLog) {
      if (!map.has(e.date)) {
        map.set(e.date, {
          date:            e.date,
          my_kimochi:      e.partner_kimochi,
          partner_kimochi: e.my_kimochi,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  })();

  // ─── 画面分岐 ─────────────────────────────────────────────
  if (screen === "settings") {
    return (
      <SettingsScreen
        onBack={()=>setScreen("home")}
        initialCoupleId={coupleId}
        syncGoal={syncGoal}   setSyncGoal={setSyncGoal}
        initialConfirmedStart={savedMoonStart}
        initialConfirmedEnd={savedMoonEnd}
        onSave={handleSaveSettings} saving={saving}
        onConfirmStart={handleConfirmStart}
        onConfirmEnd={handleConfirmEnd}
        onResetPeriod={handleResetPeriod}
        onGoalChange={handleGoalChange}
        reminderWeekday={reminderWeekday} setReminderWeekday={setReminderWeekday}
        reminderWeekend={reminderWeekend} setReminderWeekend={setReminderWeekend}
        onReminderChange={handleReminderChange}
      />
    );
  }

  if (loading) return <LoadingScreen />;
  if (!coupleId) return <NoCoupleIdScreen onGoSettings={()=>setScreen("settings")} />;

  // ── 状態ラベル ─────────────────────────────────────────
  const myStatus     = myKimochi      ? "回答済み" : is17 ? "未回答" : "待機中";
  const partnerStatus = partnerKimochi ? "回答済み" : "まだ選んでいないよ";

  return (
    <main className="min-h-dvh flex flex-col items-center"
      style={{ backgroundColor:"#FFFBF5", color:"#4A3728" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      <Toast msg={toast.msg} on={toast.on}/>
      {showFireworks && <Fireworks onDone={()=>setShowFireworks(false)}/>}

      <div className="w-full max-w-sm flex flex-col px-4 pt-6 pb-10 gap-4">

        {/* ── ① ヘッダー ─────────────────────────────── */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-bold" style={{ fontSize:20, color:"#8B4513", lineHeight:1.2 }}>
              Sync Couple
            </h1>
            <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
              ふたりの気持ちを、やさしく共有
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>setScreen("settings")}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ backgroundColor:"rgba(255,255,255,0.85)", border:"1px solid #FDEBD0", fontSize:18 }}>
              ⚙️
            </button>
            <form action={logout}>
              <button type="submit"
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform text-xs font-bold"
                style={{ backgroundColor:"rgba(255,255,255,0.85)", border:"1px solid #FDEBD0", color:"#C4A898" }}
                title="ログアウト">出</button>
            </form>
          </div>
        </header>

        {/* ── ② 状態バー（接続・目標・生理期間） ────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* ★ 接続状態：partnerRow の有無で3段階に判定 */}
          {!coupleId ? (
            // 未設定
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor:"rgba(200,200,200,0.15)", border:"1px solid #D4D0CC" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", backgroundColor:"#B0A898", display:"inline-block" }}/>
              <span style={{ fontSize:10, color:"#9A8E84", fontWeight:600 }}>IDを設定してください</span>
            </div>
          ) : !partnerRow ? (
            // 接続待ち（自分だけ設定済み）
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor:"rgba(255,196,80,0.15)", border:"1px solid #F0C840" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", backgroundColor:"#C8A020",
                animation:"pulse 1.5s infinite", display:"inline-block" }}/>
              <span style={{ fontSize:10, color:"#9A7820", fontWeight:600 }}>パートナーの接続待ち…</span>
            </div>
          ) : (
            // 接続完了
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor:"rgba(122,173,114,0.15)", border:"1px solid #A8C9A0" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", backgroundColor:"#5A9E7A", display:"inline-block" }}/>
              <span style={{ fontSize:10, color:"#5A9E7A", fontWeight:600 }}>パートナーと接続中</span>
            </div>
          )}
          {/* 目標サマリー */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ backgroundColor:"rgba(255,255,255,0.7)", border:"1px solid #FDEBD0" }}>
            <span style={{ fontSize:11, color:"#C4A898" }}>🎯</span>
            <span style={{ fontSize:10, color:"#9A7B6A" }}>目標 {syncGoal}回 / お休み{cooldownDays}日</span>
          </div>
          {/* 生理期間中バッジ */}
          {isInPeriod && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full"
              style={{ backgroundColor:"rgba(255,182,193,0.2)", border:"1px solid #F4A8B8" }}>
              <span style={{ fontSize:11 }}>🌸</span>
              <span style={{ fontSize:10, color:"#C46880", fontWeight:600 }}>お休みモード中</span>
            </div>
          )}
        </div>

        {/* ── ③ メインカード：状態別に完全分岐 ─────────── */}

        {isInCooldown ? (
          /* === Perfect Sync / 待機期間 === */
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold px-1" style={{ color:"#B86540" }}>
              {isSyncToday ? "✨ Perfect Sync 達成！" : "🌿 ふたりの準備期間"}
            </p>
            <SyncSuccessCard
              isSyncToday={isSyncToday}
              remainingDays={remainingDays}
              totalDays={cooldownDays}
              lastSyncDate={lastSyncDate!}
              onReset={handleCooldownReset}/>
          </div>

        ) : isInPeriod ? (
          /* === 自分が生理期間中：お休みモードカード === */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-0.5">
              <p className="font-bold" style={{ fontSize:16, color:"#4A3728" }}>
                今日はお休みモード 🌸
              </p>
            </div>
            <div className="rounded-3xl px-5 py-5"
              style={{ backgroundColor:"rgba(255,242,246,0.95)", border:"1.5px solid #F4A8B8", boxShadow:"0 4px 24px rgba(255,176,193,0.18)" }}>
              {/* 日数バッジ */}
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full mb-3"
                style={{ backgroundColor:"rgba(244,168,184,0.25)", border:"1px solid #F4A8B8" }}>
                <span style={{ fontSize:11, color:"#C46880", fontWeight:600 }}>
                  生理 {periodDayCount} 日目
                </span>
              </div>
              {/* 絵文字 + テキスト */}
              <div className="flex items-start gap-3">
                <span style={{ fontSize:44, lineHeight:1, flexShrink:0 }}>{periodCopy!.emoji}</span>
                <div className="flex flex-col gap-1.5">
                  <p className="font-bold leading-snug" style={{ fontSize:15, color:"#4A3728" }}>
                    {periodCopy!.title}
                  </p>
                  <p style={{ fontSize:12, color:"#9A7B6A", lineHeight:1.6 }}>
                    {periodCopy!.message}
                  </p>
                </div>
              </div>
            </div>
          </div>

        ) : partnerIsInPeriod ? (
          /* === パートナーが生理期間中：気づかいカード === */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-0.5">
              <div>
                <p className="font-bold" style={{ fontSize:16, color:"#4A3728" }}>
                  今日のキモチを選んでね
                </p>
                <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
                  言いにくい日も、選ぶだけでOK ☁️
                </p>
              </div>
            </div>
            {/* パートナーお休みバッジ */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
              style={{ backgroundColor:"rgba(255,182,193,0.15)", border:"1px solid #F4A8B8" }}>
              <span style={{ fontSize:14 }}>🌸</span>
              <span style={{ fontSize:11, color:"#C46880", fontWeight:600 }}>
                パートナーは今日お休みモードです
              </span>
            </div>
            {/* 気づかいカード */}
            <div className="rounded-3xl px-5 py-5"
              style={{ backgroundColor:"rgba(245,248,255,0.95)", border:"1.5px solid #C8D8F0", boxShadow:"0 4px 24px rgba(180,200,240,0.18)" }}>
              <div className="flex items-start gap-3">
                <span style={{ fontSize:44, lineHeight:1, flexShrink:0 }}>{partnerCare.emoji}</span>
                <div className="flex flex-col gap-1.5">
                  <p className="font-bold leading-snug" style={{ fontSize:15, color:"#3A4A6A" }}>
                    {partnerCare.title}
                  </p>
                  <p style={{ fontSize:12, color:"#7A8A9A", lineHeight:1.6 }}>
                    {partnerCare.message}
                  </p>
                </div>
              </div>
            </div>
            {/* 自分のキモチ選択は通常通り表示 */}
            <div className="rounded-3xl overflow-hidden"
              style={{ backgroundColor:"rgba(255,255,255,0.85)", border:"1.5px solid #FFE0CC", boxShadow:"0 2px 12px rgba(255,176,120,0.1)" }}>
              <div className="px-4 pt-4 pb-4">
                <p className="text-xs font-bold mb-3" style={{ color:"#B86540" }}>あなたのキモチ</p>
                <KimochiRow
                  key={`my-${myKimochi ?? "none"}`}
                  label="" avatar=""
                  selected={myKimochi}
                  onSelect={handleKimochiSelect}
                  disabled={false}
                />
              </div>
            </div>
          </div>

        ) : (
          /* === 通常：キモチ確認 === */
          <div className="flex flex-col gap-3">

            {/* ヘッダー行：タイトル＋リマインド時刻バッジ */}
            {(() => {
              const rHour = getTodayReminderHour(reminderWeekday, reminderWeekend);
              const rLabel = `${String(rHour).padStart(2,"0")}時`;
              return (
                <div className="flex items-center justify-between px-0.5">
                  <div>
                    <p className="font-bold" style={{ fontSize:16, color:"#4A3728" }}>
                      今日のキモチを選んでね
                    </p>
                    <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
                      言いにくい日も、選ぶだけでOK ☁️
                    </p>
                  </div>
                  {!is17 ? (
                    <button onClick={()=>{ setIs17(true); pop(`${rLabel}になりました 🌅`); }}
                      className="px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform flex-shrink-0"
                      style={{ backgroundColor:"#FFE0CC", color:"#B86540", border:"1.5px solid #FFB085" }}>
                      🕔 {rLabel}にする
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor:"#FBE8E6", color:"#D97B6C" }}>🌅 {rLabel}</span>
                  )}
                </div>
              );
            })()}

            {!is17 ? (
              /* リマインド時刻前：待機プレート */
              <div className="rounded-3xl px-5 py-6 flex flex-col items-center gap-2 text-center"
                style={{ backgroundColor:"rgba(255,255,255,0.6)", border:"1.5px dashed #FFE0CC" }}>
                <span style={{ fontSize:32 }}>🕓</span>
                <p className="font-semibold text-sm" style={{ color:"#B86540" }}>
                  {String(getTodayReminderHour(reminderWeekday, reminderWeekend)).padStart(2,"0")}時になったらキモチを選べるよ
                </p>
                <p style={{ fontSize:11, color:"#C4A898" }}>
                  上のボタンで今すぐ確認できます
                </p>
              </div>

            ) : (
              <>
                {/* ─ メインカード ─ */}
                <div className="rounded-3xl overflow-hidden"
                  style={{ border:"1.5px solid #FFE0CC", boxShadow:"0 4px 24px rgba(255,176,133,0.18)" }}>
                  {/* あなたのキモチ */}
                  <div className="px-4 pt-4 pb-3"
                    style={{ backgroundColor:"rgba(255,255,255,0.82)" }}>
                    <div className="flex items-center gap-1.5 mb-3">
                      <span style={{ fontSize:14 }}>🌸</span>
                      <span className="text-xs font-bold" style={{ color:"#B86540" }}>あなたのキモチ</span>
                      {myKimochi ? (
                        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor:"rgba(217,123,108,0.12)", color:"#D97B6C" }}>
                          ✓ 選択済み
                        </span>
                      ) : (
                        <span className="ml-auto text-xs" style={{ color:"#C4A898" }}>
                          まだ選んでいないよ
                        </span>
                      )}
                    </div>
                    <KimochiRow
                      label="" avatar=""
                      selected={myKimochi}
                      onSelect={handleKimochiSelect}
                      disabled={false}
                    />
                  </div>
                  <div className="h-px" style={{ backgroundColor:"#FDEBD0" }}/>
                  {/* パートナーのキモチ */}
                  <div className="px-4 pt-3 pb-4"
                    style={{ backgroundColor:"rgba(255,248,240,0.7)" }}>
                    <div className="flex items-center gap-1.5 mb-3">
                      <span style={{ fontSize:14 }}>🌿</span>
                      <span className="text-xs font-bold" style={{ color:"#7AAD72" }}>パートナーのキモチ</span>
                      {partnerKimochi ? (
                        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor:"rgba(122,173,114,0.15)", color:"#5A9E7A" }}>
                          ✓ 回答済み
                        </span>
                      ) : (
                        <span className="ml-auto text-xs flex items-center gap-1" style={{ color:"#C4A898" }}>
                          <span style={{ animation:"pulse 1.5s infinite", display:"inline-block" }}>●</span>
                          待ち中…
                        </span>
                      )}
                    </div>
                    <KimochiRow
                      key={`partner-${partnerKimochi ?? "none"}`}
                      label="" avatar=""
                      selected={partnerKimochi}
                      onSelect={()=>{}}
                      disabled={true}
                    />
                  </div>
                </div>
                {/* マッチバナー */}
                {showMatch && myKimochi && partnerKimochi && (
                  <MatchBanner me={myKimochi} partner={partnerKimochi} onClose={resetKimochi}/>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ④ 週次ふりかえりカード ─────────────────────── */}
        {(() => {
          const { syncCount, closeDays } = analyzeWeeklyLog(mergedKimochiLog);
          const reminderHour = getTodayReminderHour(reminderWeekday, reminderWeekend);
          const isWeekend = new Date().getDay()===0 || new Date().getDay()===6;
          if (mergedKimochiLog.length === 0) return null;
          return (
            <div className="rounded-3xl overflow-hidden"
              style={{ border:"1.5px solid #FDEBD0", boxShadow:"0 2px 12px rgba(255,176,133,0.08)" }}>
              <div className="px-4 py-3 flex items-center gap-2"
                style={{ backgroundColor:"rgba(255,245,228,0.8)" }}>
                <span style={{ fontSize:16 }}>📅</span>
                <p className="font-bold text-sm" style={{ color:"#B86540" }}>今週のふりかえり</p>
                <div className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full"
                  style={{ backgroundColor:"rgba(255,224,204,0.5)", border:"1px solid #FFD090" }}>
                  <span style={{ fontSize:10 }}>🔔</span>
                  <span style={{ fontSize:10, color:"#B86540" }}>
                    今日 {String(reminderHour).padStart(2,"0")}:00（{isWeekend?"休日":"平日"}）
                  </span>
                </div>
              </div>
              <div className="px-4 py-4 flex flex-col gap-2.5"
                style={{ backgroundColor:"rgba(255,255,255,0.75)" }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize:20 }}>✨</span>
                  <p style={{ fontSize:13, color:"#4A3728", fontWeight:600 }}>
                    今週は{syncCount > 0 ? `${syncCount}回 Syncできたよ` : "まだSyncなし。今日が最初の一歩 🌱"}
                  </p>
                </div>
                {closeDays.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize:18 }}>🩷</span>
                    <p style={{ fontSize:12, color:"#9A7B6A" }}>
                      気持ちが近かった日：{closeDays.slice(0,3).join("・")}
                    </p>
                  </div>
                )}
                <p className="text-center" style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
                  今週もおつかれさま 🌿
                </p>
              </div>
            </div>
          );
        })()}

        <div className="h-4"/>
      </div>
    </main>
  );
}
