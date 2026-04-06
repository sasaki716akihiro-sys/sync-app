"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { logout } from "@/app/auth/actions";
import { checkConnection, disconnectCouple, issueInviteCode, joinWithInviteCode } from "@/app/actions/invite";
import { fetchCoupleRows, updateSyncGoal, updatePartnerPeriod, updateTreeData } from "@/app/actions/sync";
import { createClient } from "@/lib/supabase/client";
import { getSyncMessage, getWaitingMessage, type SyncMessage } from "@/lib/syncMessages";

// ─── Supabaseクライアントはモジュールレベルで1度だけ生成 ──────
// コンポーネント内で生成すると再レンダリングのたびに新インスタンスが
// 作られ、Realtimeの購読が切れる原因になる
const supabase = createClient();

// ─── Web Push ─────────────────────────────────────────────
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// Base64URL → Uint8Array（applicationServerKey用）
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output  = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// ─── 型 ──────────────────────────────────────────────────
type Kimochi = "circle" | "triangle" | "cross" | null;
type Screen  = "home" | "settings" | "connect";

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
  // ── キモチ履歴（週次ふりかえり用） ──
  kimochi_log: KimochiLogEntry[] | null;
  // ── プッシュ通知 ──
  push_subscription: { endpoint?: string } | null;
  // ── 夫婦の木 ──
  tree_points:          number | null;
  tree_level:           number | null;
  tree_last_point_date: string | null;
}

// 生理履歴の1件
interface PeriodRecord {
  start:      string;  // YYYY-MM-DD
  end:        string;  // YYYY-MM-DD
  created_at?: string; // ISO 8601 — ない場合は start で代用（旧データ互換）
}

// キモチ履歴の1件（週次ふりかえり用）
interface KimochiLogEntry {
  date:           string;  // YYYY-MM-DD
  my_kimochi:     Kimochi;
  partner_kimochi:Kimochi;
  is_sync?:       boolean; // Perfect Sync が確定した日
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

// 今週月曜〜今日の日別エントリを返す
function getWeeklyEntries(
  log: KimochiLogEntry[]
): { date: string; dow: string; kimochi: Kimochi }[] {
  const { start } = getThisWeekRange();
  const todayStr = getLocalDateStr();
  const entries: { date: string; dow: string; kimochi: Kimochi }[] = [];
  const d = new Date(start + "T00:00:00");
  while (getLocalDateStr(d) <= todayStr) {
    const dateStr = getLocalDateStr(d);
    const found = log.find(e => e.date === dateStr);
    entries.push({ date: dateStr, dow: DOW_LABEL[d.getDay()], kimochi: found?.my_kimochi ?? null });
    d.setDate(d.getDate() + 1);
  }
  return entries;
}

// キモチログに今日の記録を追加（最大28件保持）
function addKimochiLog(
  log: KimochiLogEntry[],
  date: string,
  myK: Kimochi,
): KimochiLogEntry[] {
  const filtered = log.filter(e => e.date !== date); // 同日は上書き
  const next = [...filtered, { date, my_kimochi: myK, partner_kimochi: null }];
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

// ─── メッセージバリエーション（将来のSync機能用に保持） ──
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

// ─── 夫婦の木 ─────────────────────────────────────────────
const TREE_LEVELS = [
  { level:1, minPoints:0,  name:"たね",         title:"はじめの一歩",          emoji:"🌰", bg:"#F5ECD8" },
  { level:2, minPoints:5,  name:"ふたば",        title:"気持ちを向け合うふたり", emoji:"🌱", bg:"#DFF2DF" },
  { level:3, minPoints:12, name:"若葉",           title:"すこし通じたふたり",     emoji:"🌿", bg:"#D5EDCF" },
  { level:4, minPoints:22, name:"小さな木",       title:"いい感じのふたり",       emoji:"🌳", bg:"#CAE8C4" },
  { level:5, minPoints:35, name:"青々とした木",   title:"あうんの呼吸",           emoji:"🌲", bg:"#BEE3B8" },
  { level:6, minPoints:50, name:"花が咲く木",     title:"心が近づいたふたり",     emoji:"🌸", bg:"#F5DFF0" },
  { level:7, minPoints:70, name:"実をつけた木",   title:"ぬくもり夫婦",           emoji:"🍎", bg:"#F5E5D5" },
] as const;

type TreeLevelData = typeof TREE_LEVELS[number];

const TREE_LEVELUP_MESSAGES: Record<number, string> = {
  2: "ふたりの歩みが、少しずつ重なり始めているよ。",
  3: "気持ちを伝え合う習慣が、やさしく根付いてきたね。",
  4: "ふたりのリズムが、だんだん合ってきた気がするよ。",
  5: "少しずつ、ふたりのタイミングが重なってきています。",
  6: "ふたりの心が、静かに近づいていっているよ。",
  7: "ふたりで育てた木が、こんなに大きく実をつけたね。",
};

function getTreeLevelData(points: number): TreeLevelData {
  let current: TreeLevelData = TREE_LEVELS[0];
  for (const lvl of TREE_LEVELS) {
    if (points >= lvl.minPoints) current = lvl;
  }
  return current;
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
  onBack, syncGoal, setSyncGoal,
  initialConfirmedStart, initialConfirmedEnd,
  periodHistory,
  onSave, saving, onConfirmStart, onConfirmEnd, onResetPeriod, onDeleteHistory,
  onGoalChange,
  isConnected, partnerEmail, onDisconnect,
  partnerMoonStart, partnerMoonEnd, partnerPeriodHistory,
  onConfirmPartnerStart, onConfirmPartnerEnd, onResetPartnerPeriod, onDeletePartnerHistory,
}: {
  onBack:()=>void;
  syncGoal:number; setSyncGoal:(n:number)=>void;
  initialConfirmedStart: number | null;
  initialConfirmedEnd:   number | null;
  periodHistory: PeriodRecord[] | null;
  onSave:(cStart:number|null, cEnd:number|null)=>void; saving:boolean;
  onConfirmStart:(start:number)=>Promise<void>;
  onConfirmEnd:(end:number)=>Promise<void>;
  onResetPeriod:()=>Promise<void>;
  onDeleteHistory:(start:string)=>Promise<void>;
  onGoalChange:(newGoal:number)=>void;
  isConnected: boolean;
  partnerEmail: string | null;
  onDisconnect: () => Promise<void>;
  partnerMoonStart: number | null;
  partnerMoonEnd:   number | null;
  partnerPeriodHistory: PeriodRecord[] | null;
  onConfirmPartnerStart:(start:number)=>Promise<void>;
  onConfirmPartnerEnd:(end:number)=>Promise<void>;
  onResetPartnerPeriod:()=>Promise<void>;
  onDeletePartnerHistory:(start:string)=>Promise<void>;
}) {
  const [confirming,            setConfirming]            = useState(false);
  const [resetting,             setResetting]             = useState(false);
  const [showResetConfirm,      setShowResetConfirm]      = useState(false);
  const [showAllHistory,        setShowAllHistory]        = useState(false);
  const [deletingStart,         setDeletingStart]         = useState<string | null>(null);
  const [deleting,              setDeleting]              = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting,         setDisconnecting]         = useState(false);
  const HISTORY_LIMIT = 3;
  const cooldownDays = getCooldownDays(syncGoal);

  // ── 生理期間：共有カレンダー ──────────────────────────────
  // 自分の moon_start がなくてパートナーにある場合、パートナーのデータを編集する
  const usePartnerPeriod = isConnected && !initialConfirmedStart && !!partnerMoonStart;
  const activeInitStart  = usePartnerPeriod ? (partnerMoonStart ?? null) : initialConfirmedStart;
  const activeInitEnd    = usePartnerPeriod ? (partnerMoonEnd   ?? null) : initialConfirmedEnd;
  const activePeriodHistory = usePartnerPeriod ? partnerPeriodHistory : periodHistory;

  const _now = new Date();
  const [confirmedStart, setConfirmedStart] = useState<number | null>(activeInitStart);
  const [confirmedEnd,   setConfirmedEnd]   = useState<number | null>(activeInitEnd);
  const [draftDate,      setDraftDate]      = useState<number | null>(null);
  const _effectiveStart = activeInitStart;
  const _initYear  = _effectiveStart ? Math.floor(_effectiveStart / 10000)                    : _now.getFullYear();
  const _initMonth = _effectiveStart ? Math.floor((_effectiveStart % 10000) / 100) - 1        : _now.getMonth();
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

  // 開始日確定（自分 or パートナー行に書く）
  const handleConfirmStart = async () => {
    if (!draftDate || confirming) return;
    setConfirming(true);
    await (usePartnerPeriod ? onConfirmPartnerStart : onConfirmStart)(draftDate);
    setConfirmedStart(draftDate);
    setConfirmedEnd(null);
    setDraftDate(null);
    setConfirming(false);
  };

  // 終了日確定
  const handleConfirmEnd = async () => {
    if (!draftDate || confirming) return;
    if (confirmedStart && draftDate < confirmedStart) return;
    setConfirming(true);
    await (usePartnerPeriod ? onConfirmPartnerEnd : onConfirmEnd)(draftDate);
    setConfirmedEnd(draftDate);
    setDraftDate(null);
    setConfirming(false);
  };

  // リセット押下：DB削除 → ローカルstateをすべてクリア
  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    await (usePartnerPeriod ? onResetPartnerPeriod : onResetPeriod)();
    setConfirmedStart(null);
    setConfirmedEnd(null);
    setDraftDate(null);
    setShowResetConfirm(false);
    setResetting(false);
  };

  // ── 次回予測計算（アクティブな履歴を使用）────────────────────
  const _parseYMD  = (s: string) => parseInt(s.replace(/-/g, ""), 10);
  const _daysDiff  = (from: string, to: string) =>
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  const _durDays   = (r: PeriodRecord) => _daysDiff(r.start, r.end) + 1;
  const _addDays   = (dateStr: string, days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return getLocalDateStr(d);
  };
  const _completed = (activePeriodHistory ?? [])
    .filter(r => r.start && r.end)
    .sort((a, b) => (b.start > a.start ? 1 : b.start < a.start ? -1 : 0));
  const predN = _completed.length;

  let predStartInt: number | null = null;
  let predEndInt:   number | null = null;
  let predIsRef    = true;
  let predLabel    = "";
  let predNote     = "";

  if (predN >= 1) {
    const top3 = _completed.slice(0, 3);
    let cycleUsed: number;
    let durUsed:   number;
    if (predN === 1) {
      cycleUsed = 28; durUsed = _durDays(top3[0]);
      predIsRef = true;
      predLabel = "参考表示（履歴1件）";
      predNote  = "履歴が3件たまると、正式な予測に切り替わります";
    } else if (predN === 2) {
      cycleUsed = _daysDiff(top3[1].start, top3[0].start);
      durUsed   = Math.round((_durDays(top3[0]) + _durDays(top3[1])) / 2);
      predIsRef = true;
      predLabel = "参考表示（履歴2件）";
      predNote  = "あと1件で、より安定した予測になります";
    } else {
      const c1  = _daysDiff(top3[1].start, top3[0].start);
      const c2  = _daysDiff(top3[2].start, top3[1].start);
      cycleUsed = Math.round((c1 + c2) / 2);
      const durs = [_durDays(top3[0]), _durDays(top3[1]), _durDays(top3[2])].sort((a, b) => a - b);
      durUsed   = durs[1];
      predIsRef = false;
      predLabel = "正式予測（直近3件）";
      predNote  = "直近3件の履歴から計算しています";
    }
    const ns  = _addDays(top3[0].start, cycleUsed);
    const ne  = _addDays(ns, durUsed - 1);
    predStartInt = _parseYMD(ns);
    predEndInt   = _parseYMD(ne);
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor:"#FFFBF5", color:"#4A3728" }}>
      <div className="flex items-center gap-3 px-4 py-5 sticky top-0 z-10"
        style={{ backgroundColor:"rgba(255,251,245,0.95)", borderBottom:"1px solid #FDEBD0", backdropFilter:"blur(8px)" }}>
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>←</button>
        <h1 className="font-bold text-base flex-1" style={{ color:"#8B4513" }}>設定・ふたりのルール</h1>
        <button onClick={()=>onSave(usePartnerPeriod ? null : confirmedStart, usePartnerPeriod ? null : confirmedEnd)} disabled={saving}
          className="px-4 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
          style={{ backgroundColor:saving?"#FDEBD0":"#D97B6C", color:"white" }}>
          {saving ? "保存中…" : "保存 💾"}
        </button>
      </div>

      <div className="flex flex-col px-4 py-5 gap-5 max-w-sm w-full mx-auto">

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
                  // phase 0: 開始日選択中 / phase 1: 生理中・終了日選択中 / phase 2: 確定済み / partner: パートナー記録中
                  const phase = !confirmedStart ? "start" : !confirmedEnd ? "end" : "done";
                  const activeSt  = phase === "start"  ? draftDate  : confirmedStart;
                  const activeEnd = phase === "start"  ? null
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

                  // 次回予測ハイライト（現在の記録より低優先）
                  const isPredEdge  = !isEdge && !isRange && predStartInt !== null
                    && (ymd === predStartInt || (predEndInt !== null && ymd === predEndInt));
                  const isPredRange = !isEdge && !isRange && !isPredEdge
                    && predStartInt !== null && predEndInt !== null
                    && ymd > predStartInt && ymd < predEndInt;

                  return (
                    <button key={i}
                      onClick={() => handleDayTap(d)}
                      className="flex items-center justify-center rounded-full mx-auto active:scale-90 transition-all duration-150"
                      style={{
                        width:           32,
                        height:          32,
                        fontSize:        13,
                        fontWeight:      isEdge ? 700 : isPredEdge ? 600 : 400,
                        backgroundColor: isEdge      ? edgeBg
                                       : isRange     ? rangeBg
                                       : isPredEdge  ? (predIsRef ? "rgba(220,140,80,0.65)" : "#C87840")
                                       : isPredRange ? "rgba(255,190,120,0.22)"
                                       : "transparent",
                        color:           isEdge      ? "#fff"
                                       : isRange     ? rangeText
                                       : isPredEdge  ? "#fff"
                                       : isPredRange ? "#B86540"
                                       : "#4A3728",
                        outline:         isEdge     ? `2px solid ${edgeLine}`
                                       : isPredEdge ? `2px dashed ${predIsRef ? "rgba(200,120,60,0.55)" : "#C87840"}`
                                       : "none",
                        outlineOffset:   1,
                      }}>
                      {d}
                    </button>
                  );
                });
              })()}
            </div>

            {/* カレンダー凡例 */}
            {predStartInt !== null && (
              <div className="flex items-center gap-3 mt-2 mb-1 px-1 flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor:"#8B7BA8" }}/>
                  <span style={{ fontSize:9, color:"#A898C4" }}>今回</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: predIsRef ? "rgba(220,140,80,0.65)" : "#C87840",
                             outline: `1.5px dashed ${predIsRef ? "rgba(200,120,60,0.55)" : "#C87840"}`,
                             outlineOffset:1 }}/>
                  <span style={{ fontSize:9, color:"#C4A898" }}>
                    次回予測{predIsRef ? "（参考）" : ""}
                  </span>
                </div>
              </div>
            )}

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
                  <div className="mt-2 px-4 py-3 rounded-2xl flex flex-col gap-2"
                    style={{ backgroundColor:"rgba(255,100,80,0.07)", border:"1px solid rgba(217,123,108,0.35)" }}>
                    <p style={{ fontSize:11, color:"#D97B6C" }}>今の記録だけを消します。過去の履歴は残ります。</p>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setShowResetConfirm(false)}
                        className="px-3 py-1.5 rounded-xl text-xs"
                        style={{ backgroundColor:"rgba(255,255,255,0.8)", color:"#9A7B6A", border:"1px solid #FDEBD0" }}>
                        キャンセル
                      </button>
                      <button onClick={handleReset} disabled={resetting}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                        style={{ backgroundColor: resetting ? "#FDEBD0" : "#D97B6C", color:"#fff" }}>
                        {resetting ? "…" : "リセットする"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Phase 2: 開始・終了どちらも記録済み */
              <>
                {/* 記録済みバッジ */}
                <div className="mt-4 px-4 py-3 rounded-2xl"
                  style={{ backgroundColor:"rgba(139,123,168,0.1)", border:"1px solid #C4B4E0" }}>
                  <p style={{ fontSize:11, color:"#6B5A90", fontWeight:600 }}>
                    ✓ {_ymdLabel(confirmedStart)} 〜 {_ymdLabel(confirmedEnd)} を記録済み
                  </p>
                  <p style={{ fontSize:10, color:"#C4A898", marginTop:2 }}>
                    履歴に保存されました
                  </p>
                </div>
                {/* 次の生理を記録する */}
                <button
                  onClick={() => { setConfirmedStart(null); setConfirmedEnd(null); setDraftDate(null); }}
                  className="mt-3 w-full py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
                  style={{ backgroundColor:"#C46880", color:"#fff" }}>
                  次の生理を記録する 🌸
                </button>
                {/* リセット（current のみ削除） */}
                <div className="mt-2 flex justify-end">
                  {!showResetConfirm && (
                    <button onClick={() => setShowResetConfirm(true)}
                      style={{ fontSize:10, color:"#C4A898" }}>この記録を消す</button>
                  )}
                </div>
                {showResetConfirm && (
                  <div className="mt-2 px-4 py-3 rounded-2xl flex flex-col gap-2"
                    style={{ backgroundColor:"rgba(255,100,80,0.07)", border:"1px solid rgba(217,123,108,0.35)" }}>
                    <p style={{ fontSize:11, color:"#D97B6C" }}>今の記録だけを消します。過去の履歴は残ります。</p>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setShowResetConfirm(false)}
                        className="px-3 py-1.5 rounded-xl text-xs"
                        style={{ backgroundColor:"rgba(255,255,255,0.8)", color:"#9A7B6A", border:"1px solid #FDEBD0" }}>
                        キャンセル
                      </button>
                      <button onClick={handleReset} disabled={resetting}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                        style={{ backgroundColor: resetting ? "#FDEBD0" : "#D97B6C", color:"#fff" }}>
                        {resetting ? "…" : "リセットする"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 次回予測 コンパクト表示 */}
            {predStartInt !== null && predEndInt !== null && (
              <div className="mt-3 px-4 py-2.5 rounded-2xl"
                style={{
                  backgroundColor: predIsRef ? "rgba(255,200,140,0.15)" : "rgba(200,120,60,0.1)",
                  border: predIsRef ? "1px dashed rgba(200,140,80,0.45)" : "1px solid rgba(200,120,60,0.35)",
                }}>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p style={{ fontSize:12, color: predIsRef ? "#C07838" : "#A06030", fontWeight:600 }}>
                    🔮 次回予測：{_ymdLabel(predStartInt)}ごろ〜{_ymdLabel(predEndInt)}ごろ
                  </p>
                  <span className="px-2 py-0.5 rounded-full"
                    style={{
                      fontSize:9, fontWeight:700,
                      backgroundColor: predIsRef ? "rgba(220,140,80,0.2)" : "rgba(200,120,60,0.15)",
                      color: predIsRef ? "#C07838" : "#A06030",
                    }}>
                    {predIsRef ? "参考" : "正式"}
                  </span>
                </div>
                <p style={{ fontSize:10, color:"#C4A898", marginTop:2 }}>
                  {predLabel}　{predNote}
                </p>
              </div>
            )}

          </div>
        </div>

        {/* 記録済み履歴 */}
        {activePeriodHistory && activePeriodHistory.length > 0 && (
          <div className="rounded-3xl overflow-hidden" style={{ border:"1.5px solid #E8D8F0" }}>
            <div className="px-5 py-3.5" style={{ backgroundColor:"rgba(240,232,250,0.7)" }}>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize:16 }}>🗓️</span>
                <p className="font-bold text-sm" style={{ color:"#6B5A90" }}>記録済み履歴</p>
              </div>
              <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
                リセットしても、ここには残ります
              </p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-2" style={{ backgroundColor:"rgba(255,255,255,0.75)" }}>
              {(showAllHistory ? activePeriodHistory! : activePeriodHistory!.slice(0, HISTORY_LIMIT)).map((rec) => (
                <div key={rec.start}>
                  {deletingStart === rec.start ? (
                    /* 削除確認インライン */
                    <div className="px-3 py-2.5 rounded-2xl flex flex-col gap-2"
                      style={{ backgroundColor:"rgba(255,100,80,0.07)", border:"1px solid rgba(217,123,108,0.35)" }}>
                      <p style={{ fontSize:11, color:"#D97B6C", fontWeight:600 }}>
                        {rec.start} 〜 {rec.end} を削除しますか？
                      </p>
                      <p style={{ fontSize:10, color:"#C4A898" }}>
                        削除すると、今後の予測や自動計算には使われなくなります
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setDeletingStart(null)}
                          className="px-3 py-1.5 rounded-xl text-xs"
                          style={{ backgroundColor:"rgba(255,255,255,0.8)", color:"#9A7B6A", border:"1px solid #FDEBD0" }}>
                          キャンセル
                        </button>
                        <button
                          onClick={async () => {
                            setDeleting(true);
                            await (usePartnerPeriod ? onDeletePartnerHistory : onDeleteHistory)(rec.start);
                            setDeletingStart(null);
                            setDeleting(false);
                          }}
                          disabled={deleting}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                          style={{ backgroundColor: deleting ? "#FDEBD0" : "#D97B6C", color:"#fff" }}>
                          {deleting ? "…" : "削除する"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 通常表示 */
                    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
                      style={{ backgroundColor:"rgba(139,123,168,0.08)", border:"1px solid #E0D4F0" }}>
                      <span style={{ fontSize:12 }}>🌸</span>
                      <span className="flex-1" style={{ fontSize:12, color:"#6B5A90", fontWeight:500 }}>
                        {rec.start} 〜 {rec.end}
                      </span>
                      <button
                        onClick={() => setDeletingStart(rec.start)}
                        className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                        style={{ backgroundColor:"rgba(217,123,108,0.12)", color:"#D97B6C", fontSize:12, flexShrink:0 }}>
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {activePeriodHistory!.length > HISTORY_LIMIT && (
                <button
                  onClick={() => setShowAllHistory(v => !v)}
                  className="mt-1 py-2 rounded-2xl text-xs font-semibold active:scale-95 transition-transform"
                  style={{ color:"#8B7BA8", backgroundColor:"rgba(139,123,168,0.07)", border:"1px solid #E0D4F0" }}>
                  {showAllHistory
                    ? "折りたたむ ▲"
                    : `すべて見る（残り ${activePeriodHistory!.length - HISTORY_LIMIT} 件）▼`}
                </button>
              )}
            </div>
          </div>
        )}



        {/* ── パートナー接続 ─────────────────────────────── */}
        {isConnected && (
          <div className="rounded-3xl px-5 py-5 flex flex-col gap-3"
            style={{ backgroundColor:"rgba(255,255,255,0.85)", border:"1.5px solid #FDEBD0", boxShadow:"0 2px 12px rgba(255,200,150,0.10)" }}>
            <p className="font-bold text-sm" style={{ color:"#8B4513" }}>🔗 パートナー接続</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
              style={{ backgroundColor:"rgba(122,173,114,0.12)", border:"1px solid #A8C9A0" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", backgroundColor:"#5A9E7A", display:"inline-block", flexShrink:0 }}/>
              <span style={{ fontSize:12, color:"#4A7A5A", wordBreak:"break-all" }}>{partnerEmail}</span>
            </div>
            {!showDisconnectConfirm ? (
              <button onClick={()=>setShowDisconnectConfirm(true)}
                className="w-full py-2.5 rounded-2xl text-sm font-bold active:scale-95 transition-transform"
                style={{ backgroundColor:"rgba(255,230,230,0.7)", border:"1px solid #F4A8A8", color:"#C45050" }}>
                接続を解除する
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-2xl px-4 py-3"
                style={{ backgroundColor:"rgba(255,240,240,0.8)", border:"1px solid #F4A8A8" }}>
                <p className="text-xs text-center font-bold" style={{ color:"#C45050" }}>本当に解除しますか？</p>
                <p className="text-xs text-center" style={{ color:"#9A7B6A" }}>解除後はお互いのデータが見えなくなります</p>
                <div className="flex gap-2">
                  <button onClick={()=>setShowDisconnectConfirm(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                    style={{ backgroundColor:"rgba(255,255,255,0.9)", border:"1px solid #FDEBD0", color:"#9A7B6A" }}>
                    キャンセル
                  </button>
                  <button
                    disabled={disconnecting}
                    onClick={async()=>{
                      setDisconnecting(true);
                      await onDisconnect();
                      setDisconnecting(false);
                      setShowDisconnectConfirm(false);
                    }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                    style={{ backgroundColor:"#F4A8A8", color:"#fff" }}>
                    {disconnecting ? "解除中…" : "解除する"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* お問い合わせ */}
        <div className="rounded-3xl overflow-hidden" style={{ border:"1.5px solid #FDEBD0" }}>
          <div className="px-5 py-3.5" style={{ backgroundColor:"rgba(255,245,228,0.9)" }}>
            <p className="font-bold text-sm" style={{ color:"#B86540" }}>✉️ お問い合わせ</p>
          </div>
          <div className="px-5 py-5" style={{ backgroundColor:"rgba(255,255,255,0.75)" }}>
            <p className="text-xs leading-relaxed mb-3" style={{ color:"#9A7B6A" }}>
              ご意見・ご要望・不具合のご報告はこちらからお気軽にどうぞ。
            </p>
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSdeRI32etS8-oM9DFp_xm-eyvP312w0ONt9vVYD3uiLsjM1Yw/viewform"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-2.5 rounded-2xl text-sm font-bold text-center active:scale-95 transition-transform"
              style={{ backgroundColor:"#FFF5E0", color:"#B86540", border:"1px solid #F5CBA7" }}
            >
              お問い合わせフォームを開く
            </a>
          </div>
        </div>

        {/* 退会 */}
        <WithdrawSection />

        <div className="h-8"/>
      </div>
    </div>
  );
}

function WithdrawSection() {
  const [showConfirm1, setShowConfirm1] = useState(false);
  const [showConfirm2, setShowConfirm2] = useState(false);
  const [withdrawing,  setWithdrawing]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const handleWithdraw = async () => {
    setWithdrawing(true);
    setError(null);
    const { deleteAccount } = await import("@/app/auth/actions");
    const result = await deleteAccount();
    if (result && result.status === "error") {
      setError(result.message);
      setWithdrawing(false);
      setShowConfirm2(false);
    }
    // 成功時は deleteAccount 内で /login にリダイレクトされる
  };

  return (
    <div className="rounded-3xl overflow-hidden" style={{ border:"1.5px solid #FDEBD0" }}>
      <div className="px-5 py-3.5" style={{ backgroundColor:"rgba(255,245,228,0.9)" }}>
        <p className="font-bold text-sm" style={{ color:"#B86540" }}>🚪 退会</p>
      </div>
      <div className="px-5 py-5 flex flex-col gap-3" style={{ backgroundColor:"rgba(255,255,255,0.75)" }}>
        {error && (
          <p className="text-xs text-center px-3 py-2 rounded-xl" style={{ backgroundColor:"#FCE8E5", color:"#D4533A" }}>
            ⚠️ {error}
          </p>
        )}
        {!showConfirm1 && !showConfirm2 && (
          <>
            <p className="text-xs leading-relaxed" style={{ color:"#9A7B6A" }}>
              退会するとアカウントとすべてのデータが削除されます。この操作は取り消せません。
            </p>
            <button
              onClick={() => setShowConfirm1(true)}
              className="w-full py-2.5 rounded-2xl text-sm font-bold active:scale-95 transition-transform"
              style={{ backgroundColor:"#FFF0F0", color:"#C0392B", border:"1px solid #F4A8A8" }}
            >
              退会する
            </button>
          </>
        )}
        {showConfirm1 && !showConfirm2 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-center font-bold" style={{ color:"#C0392B" }}>本当に退会しますか？</p>
            <p className="text-xs text-center" style={{ color:"#9A7B6A" }}>すべてのデータが完全に削除されます</p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm1(false)}
                className="flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                style={{ backgroundColor:"rgba(255,255,255,0.9)", border:"1px solid #FDEBD0", color:"#9A7B6A" }}>
                キャンセル
              </button>
              <button onClick={() => { setShowConfirm1(false); setShowConfirm2(true); }}
                className="flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                style={{ backgroundColor:"#F4A8A8", color:"#fff" }}>
                次へ
              </button>
            </div>
          </div>
        )}
        {showConfirm2 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-center font-bold" style={{ color:"#C0392B" }}>最終確認</p>
            <p className="text-xs text-center" style={{ color:"#9A7B6A" }}>この操作は取り消せません。退会を実行しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm2(false)} disabled={withdrawing}
                className="flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                style={{ backgroundColor:"rgba(255,255,255,0.9)", border:"1px solid #FDEBD0", color:"#9A7B6A" }}>
                キャンセル
              </button>
              <button onClick={handleWithdraw} disabled={withdrawing}
                className="flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                style={{ backgroundColor:"#C0392B", color:"#fff" }}>
                {withdrawing ? "処理中…" : "退会する"}
              </button>
            </div>
          </div>
        )}
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

// ─── Perfect Sync 花火オーバーレイ ───────────────────────────
function PerfectSyncOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = ["#FFD700","#FF6B9D","#FF8C42","#7EC8E3","#A8E6CF","#FFB7C5","#C3A6FF"];

  // 花火バースト位置（固定）
  const bursts = [
    { x:18, y:16, c:"#FFD700", d:0    },
    { x:80, y:12, c:"#FF6B9D", d:0.22 },
    { x:50, y:25, c:"#C3A6FF", d:0.10 },
    { x:12, y:64, c:"#7EC8E3", d:0.42 },
    { x:84, y:60, c:"#A8E6CF", d:0.33 },
    { x:50, y:78, c:"#FF8C42", d:0.58 },
  ];
  const DIST   = 52;
  const ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);

  // コンフェッティ（決定論的）
  const confetti = Array.from({ length: 28 }, (_, i) => ({
    x:   (i * 41 + 3) % 96,
    d:   (i * 0.11) % 1.8,
    dur: 2.2 + (i * 0.19) % 1.2,
    sz:  6 + (i * 7) % 10,
    c:   colors[i % colors.length],
    sq:  i % 3 !== 0,
  }));

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor:"rgba(10,5,20,0.88)", backdropFilter:"blur(4px)" }}
      onClick={onClose}>
      <style>{`
        @keyframes ps_burst {
          0%   { transform:translate(0,0) scale(1); opacity:1; }
          100% { transform:translate(var(--ptx),var(--pty)) scale(0); opacity:0; }
        }
        @keyframes ps_ring {
          0%   { transform:scale(0); opacity:0.85; }
          100% { transform:scale(5); opacity:0; }
        }
        @keyframes ps_confetti {
          0%   { transform:translateY(-20px) rotate(0deg); opacity:1; }
          80%  { opacity:1; }
          100% { transform:translateY(105vh) rotate(800deg); opacity:0; }
        }
        @keyframes ps_pop {
          0%   { transform:scale(0.2) rotate(-10deg); opacity:0; }
          65%  { transform:scale(1.14) rotate(2deg);  opacity:1; }
          100% { transform:scale(1)   rotate(0deg);   opacity:1; }
        }
        @keyframes ps_glow {
          0%,100% { filter:drop-shadow(0 0 18px rgba(255,220,80,0.8)); }
          50%     { filter:drop-shadow(0 0 36px rgba(255,140,100,1)); }
        }
      `}</style>

      {/* コンフェッティ */}
      {confetti.map((c, i) => (
        <div key={i} className="absolute pointer-events-none"
          style={{
            left:`${c.x}%`, top:"-12px",
            width:c.sz, height:c.sz,
            borderRadius: c.sq ? "2px" : "50%",
            backgroundColor: c.c,
            animation:`ps_confetti ${c.dur}s ease-in ${c.d}s infinite`,
          }}/>
      ))}

      {/* 花火バースト */}
      {bursts.map((b, bi) => (
        <div key={bi} className="absolute pointer-events-none"
          style={{ left:`${b.x}%`, top:`${b.y}%` }}>
          <div style={{
            position:"absolute", left:-16, top:-16, width:32, height:32,
            border:`3px solid ${b.c}`, borderRadius:"50%",
            animation:`ps_ring 1.1s ease-out ${b.d}s 2 forwards`,
          }}/>
          {ANGLES.map((angle, ai) => {
            const rad = angle * Math.PI / 180;
            const tx  = Math.round(Math.cos(rad) * DIST);
            const ty  = Math.round(Math.sin(rad) * DIST);
            return (
              <div key={ai} style={{
                position:"absolute", width:7, height:7, borderRadius:"50%",
                backgroundColor: b.c,
                ["--ptx" as string]: `${tx}px`,
                ["--pty" as string]: `${ty}px`,
                animation:`ps_burst 1.1s ease-out ${b.d + ai * 0.018}s 2 forwards`,
              }}/>
            );
          })}
        </div>
      ))}

      {/* メインテキスト */}
      <div className="relative z-10 flex flex-col items-center gap-4 text-center px-8 pointer-events-none select-none"
        style={{ animation:"ps_pop 0.65s cubic-bezier(0.34,1.56,0.64,1) 0.15s both" }}>
        <span style={{ fontSize:76, animation:"ps_glow 2s ease-in-out 0.8s infinite" }}>💛</span>
        <p style={{
          fontSize:38, fontWeight:900, letterSpacing:"0.02em", lineHeight:1.1,
          background:"linear-gradient(135deg,#FFE566 0%,#FFB085 50%,#FF6B9D 100%)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        }}>
          Perfect Sync
        </p>
        <p style={{ fontSize:17, color:"rgba(255,255,255,0.95)", fontWeight:600 }}>
          ✨ ふたりの気持ちがそろったよ ✨
        </p>
        <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginTop:4 }}>
          タップで閉じる
        </p>
      </div>
    </div>
  );
}

// ─── 接続画面 ─────────────────────────────────────────────
function ConnectScreen({
  onBack,
  onConnected,
}: {
  onBack: () => void;
  onConnected: (coupleId: string, partnerEmail: string) => void;
}) {
  const [displayCode,   setDisplayCode]   = useState<string | null>(null);
  const [expiresAt,     setExpiresAt]     = useState<string | null>(null);
  const [inputCode,     setInputCode]     = useState("");
  const [issuing,       setIssuing]       = useState(false);
  const [joining,       setJoining]       = useState(false);
  const [issueError,    setIssueError]    = useState<string | null>(null);
  const [joinError,     setJoinError]     = useState<string | null>(null);
  const [copied,        setCopied]        = useState(false);
  const codeInputRef    = useRef<HTMLInputElement>(null);

  const handleIssue = async () => {
    setIssuing(true);
    setIssueError(null);
    const res = await issueInviteCode();
    setIssuing(false);
    if (res.ok) {
      setDisplayCode(res.displayCode);
      setExpiresAt(res.expiresAt);
    } else {
      setIssueError(res.error);
    }
  };

  const handleCopy = async () => {
    if (!displayCode) return;
    try {
      await navigator.clipboard.writeText(displayCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // 招待コード入力：iOS/Android IME 二重入力対策
  // controlled input（value=state）のままだと、IME変換中に onChange をスキップすると
  // React が古い value で DOM をリセットし、compositionEnd 時には DOM が空になってしまう。
  // → uncontrolled（ref でDOMを直接操作）にして IME 変換中は React に触らせない。
  const isComposingCode = useRef(false);
  const toRaw = (v: string) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 7);
  const commitCode = () => {
    const el = codeInputRef.current;
    if (!el) return;
    const raw = toRaw(el.value);
    el.value = raw; // DOM を直接整形（maxLength ガード）
    setInputCode(raw);
  };
  const handleInputChange = () => {
    if (isComposingCode.current) return;
    commitCode();
  };
  const handleCompositionEnd = () => {
    isComposingCode.current = false;
    commitCode();
  };

  const handleJoin = async () => {
    const trimmed = inputCode.trim();
    if (!trimmed) return;
    setJoining(true);
    setJoinError(null);
    const res = await joinWithInviteCode(trimmed);
    setJoining(false);
    if (res.ok) {
      onConnected(res.coupleId, res.partnerEmail);
    } else {
      setJoinError(res.error);
    }
  };

  const expiryLabel = expiresAt
    ? (() => {
        const d = new Date(expiresAt);
        return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:00まで有効`;
      })()
    : null;

  const joinReady = inputCode.length >= 7 && !joining;

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: "#FFFBF5", color: "#4A3728" }}>
      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-5 sticky top-0 z-10"
        style={{ backgroundColor: "rgba(255,251,245,0.95)", borderBottom: "1px solid #FDEBD0", backdropFilter: "blur(8px)" }}>
        <button onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ backgroundColor: "#FFE0CC", color: "#B86540" }}>←</button>
        <h1 className="font-bold text-base flex-1" style={{ color: "#8B4513" }}>パートナーと接続する</h1>
      </div>

      <div className="flex flex-col px-4 py-5 gap-6 max-w-sm w-full mx-auto">

        {/* 招待コード発行 */}
        <div className="rounded-3xl overflow-hidden" style={{ border: "1.5px solid #FDEBD0" }}>
          <div className="px-5 py-3.5" style={{ backgroundColor: "rgba(255,245,228,0.9)" }}>
            <p className="font-bold text-sm" style={{ color: "#B86540" }}>🔑 招待コードを発行する</p>
            <p style={{ fontSize: 11, color: "#C4A898", marginTop: 2 }}>コードをパートナーに共有してね</p>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3" style={{ backgroundColor: "rgba(255,255,255,0.75)" }}>
            {!displayCode ? (
              <>
                <button onClick={handleIssue} disabled={issuing}
                  className="w-full py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
                  style={{ background: issuing ? "#FDEBD0" : "linear-gradient(135deg,#F0A899,#D97B6C)", color: issuing ? "#C4A898" : "white" }}>
                  {issuing ? "発行中…" : "招待コードを発行する"}
                </button>
                {issueError && <p style={{ fontSize: 12, color: "#D97B6C" }}>⚠️ {issueError}</p>}
              </>
            ) : (
              <>
                {/* コード表示 */}
                <div className="flex items-center justify-between px-4 py-4 rounded-2xl"
                  style={{ backgroundColor: "#FFF5E4", border: "2px solid #FFD090" }}>
                  <span className="font-bold" style={{ fontSize: 28, color: "#B86540", letterSpacing: "0.12em" }}>
                    {displayCode}
                  </span>
                  <button onClick={handleCopy}
                    className="px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                    style={{ backgroundColor: copied ? "#A8D8A0" : "#FFE0CC", color: copied ? "#2A8A4A" : "#B86540" }}>
                    {copied ? "✓ コピー済み" : "📋 コピー"}
                  </button>
                </div>
                {expiryLabel && (
                  <p className="text-center" style={{ fontSize: 11, color: "#C4A898" }}>⏰ {expiryLabel}</p>
                )}
                <button onClick={handleIssue} disabled={issuing}
                  className="w-full py-2.5 rounded-2xl text-xs font-semibold active:scale-95 transition-transform"
                  style={{ backgroundColor: "rgba(255,255,255,0.85)", color: "#B86540", border: "1.5px solid #FDEBD0" }}>
                  🔄 新しいコードを発行する
                </button>
                {issueError && <p style={{ fontSize: 12, color: "#D97B6C" }}>⚠️ {issueError}</p>}
              </>
            )}
          </div>
        </div>

        {/* 区切り */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ backgroundColor: "#FDEBD0" }} />
          <span style={{ fontSize: 12, color: "#C4A898" }}>または</span>
          <div className="flex-1 h-px" style={{ backgroundColor: "#FDEBD0" }} />
        </div>

        {/* 招待コード入力 */}
        <div className="rounded-3xl overflow-hidden" style={{ border: "1.5px solid #FDEBD0" }}>
          <div className="px-5 py-3.5" style={{ backgroundColor: "rgba(255,245,228,0.9)" }}>
            <p className="font-bold text-sm" style={{ color: "#B86540" }}>📩 招待コードを入力する</p>
            <p style={{ fontSize: 11, color: "#C4A898", marginTop: 2 }}>パートナーから受け取ったコードを入力してね</p>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3" style={{ backgroundColor: "rgba(255,255,255,0.75)" }}>
            <input
              ref={codeInputRef}
              defaultValue=""
              onChange={handleInputChange}
              onCompositionStart={() => { isComposingCode.current = true; }}
              onCompositionEnd={handleCompositionEnd}
              placeholder="XXXXXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              className="w-full px-4 py-3 rounded-2xl text-center font-bold outline-none"
              style={{ backgroundColor: "#FFF5E4", border: "1.5px solid #FDEBD0", color: "#4A3728",
                fontSize: 22, letterSpacing: "0.15em" }}
              onFocus={e => (e.currentTarget.style.border = "1.5px solid #D97B6C")}
              onBlur={e  => (e.currentTarget.style.border = "1.5px solid #FDEBD0")}
            />
            <button onClick={handleJoin} disabled={!joinReady}
              className="w-full py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
              style={{
                background: joinReady
                  ? "linear-gradient(135deg,#9AC88A,#6EA86A)"
                  : "#FDEBD0",
                color: joinReady ? "white" : "#C4A898",
              }}>
              {joining ? "接続中…" : "接続する 🌿"}
            </button>
            {joinError && <p style={{ fontSize: 12, color: "#D97B6C" }}>⚠️ {joinError}</p>}
          </div>
        </div>

      </div>
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



// ─── 夫婦の木エリア ───────────────────────────────────────
const TREE_SUBTEXTS: Record<number, string> = {
  1: "ふたりで続けた気持ちが、少しずつ育っていくよ",
  2: "小さな芽が、ふたりの手で育ち始めているよ",
  3: "やさしい葉が、ふたりの日々をそっと包んでいるよ",
  4: "すくすく育つ木が、ふたりの積み重ねを教えてくれるよ",
  5: "青々と茂る葉が、ふたりの絆の深さを映しているよ",
  6: "花が咲いたよ。ふたりの想いが、こんなに色づいた",
  7: "実をつけた木。ふたりで育てた、大切な時間のかたち",
};

// ─── 成長段階別SVGイラスト ────────────────────────────────
function TreeVisual({ level }: { level: number }) {
  // レベルごとの背景色・影
  const bgMap: Record<number, string> = {
    1:"#EAE0CA", 2:"#D5ECBC", 3:"#C5E5A8",
    4:"#B2DC98", 5:"#A0D080", 6:"#C8DEB0", 7:"#B8D4A0",
  };
  const shadowMap: Record<number, string> = {
    1:"0 4px 18px rgba(120,90,50,0.18)",
    2:"0 4px 20px rgba(80,150,50,0.14)",
    3:"0 4px 20px rgba(70,140,45,0.16)",
    4:"0 4px 22px rgba(60,135,35,0.18)",
    5:"0 4px 24px rgba(50,125,30,0.20)",
    6:"0 4px 24px rgba(60,130,40,0.18)",
    7:"0 4px 24px rgba(50,125,30,0.20)",
  };
  const soilYMap: Record<number, number> = {
    1:62, 2:70, 3:72, 4:76, 5:78, 6:78, 7:78,
  };
  const bg     = bgMap[level]     ?? "#EAE0CA";
  const shadow = shadowMap[level] ?? shadowMap[1];
  const sy     = soilYMap[level]  ?? 78; // soil top y
  const sh     = 100 - sy;               // soil height

  return (
    <div style={{ width:110, height:110, borderRadius:"50%", overflow:"hidden",
      backgroundColor:bg, boxShadow:shadow, flexShrink:0 }}>
      <svg width="110" height="110" viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">

        {/* ── 土（全レベル共通） ── */}
        <rect x="0" y={sy} width="110" height={sh} fill="rgba(105,70,35,0.22)"/>
        <line x1="0" y1={sy} x2="110" y2={sy}
          stroke="rgba(105,70,35,0.40)" strokeWidth="1.8"/>

        {/* ── Lv1 たね ── */}
        {level === 1 && <>
          {/* 種（縦長の楕円、地面に半分埋まった位置） */}
          <ellipse cx="55" cy="58" rx="12" ry="16" fill="#6B3E1C"/>
          {/* 光沢 */}
          <ellipse cx="50" cy="51" rx="4" ry="5" fill="rgba(200,155,95,0.44)"/>
        </>}

        {/* ── Lv2 ふたば ── */}
        {level === 2 && <>
          {/* 茎 */}
          <line x1="55" y1="70" x2="55" y2="50"
            stroke="#6A9840" strokeWidth="3" strokeLinecap="round"/>
          {/* 左葉 */}
          <ellipse cx="44" cy="53" rx="13" ry="7.5" fill="#8ACC58"
            transform="rotate(-38,44,53)"/>
          {/* 右葉 */}
          <ellipse cx="66" cy="53" rx="13" ry="7.5" fill="#8ACC58"
            transform="rotate(38,66,53)"/>
          {/* 葉脈（左） */}
          <line x1="44" y1="50" x2="39" y2="43"
            stroke="rgba(255,255,255,0.38)" strokeWidth="1.2" strokeLinecap="round"/>
          {/* 葉脈（右） */}
          <line x1="66" y1="50" x2="71" y2="43"
            stroke="rgba(255,255,255,0.38)" strokeWidth="1.2" strokeLinecap="round"/>
        </>}

        {/* ── Lv3 若葉 ── */}
        {level === 3 && <>
          {/* 茎（高め） */}
          <line x1="55" y1="72" x2="55" y2="36"
            stroke="#589038" strokeWidth="2.8" strokeLinecap="round"/>
          {/* 下の葉ペア */}
          <ellipse cx="43" cy="64" rx="14" ry="7.5" fill="#88C850"
            transform="rotate(-42,43,64)"/>
          <ellipse cx="67" cy="64" rx="14" ry="7.5" fill="#88C850"
            transform="rotate(42,67,64)"/>
          {/* 上の葉ペア */}
          <ellipse cx="43" cy="52" rx="13" ry="7" fill="#78BC48"
            transform="rotate(-30,43,52)"/>
          <ellipse cx="67" cy="52" rx="13" ry="7" fill="#78BC48"
            transform="rotate(30,67,52)"/>
          {/* 頂点の葉 */}
          <ellipse cx="55" cy="36" rx="9" ry="12" fill="#8CCC58"/>
        </>}

        {/* ── Lv4 小さな木 ── */}
        {level === 4 && <>
          {/* 幹 */}
          <rect x="50" y="62" width="10" height="16" fill="#8B6040" rx="4"/>
          <line x1="53.5" y1="64" x2="53.5" y2="75"
            stroke="rgba(255,255,255,0.18)" strokeWidth="1.8" strokeLinecap="round"/>
          {/* 樹冠 */}
          <circle cx="55" cy="50" r="22" fill="#6AB840"/>
          <circle cx="40" cy="56" r="16" fill="#72C048"/>
          <circle cx="70" cy="56" r="16" fill="#72C048"/>
          <circle cx="55" cy="35" r="16" fill="#80CC58"/>
          <circle cx="46" cy="46" r="12" fill="#78C850"/>
          <circle cx="64" cy="46" r="12" fill="#78C850"/>
        </>}

        {/* ── Lv5 青々とした木 ── */}
        {level === 5 && <>
          {/* 幹（太め） */}
          <rect x="49" y="60" width="12" height="20" fill="#7A5038" rx="5"/>
          <line x1="53" y1="62" x2="53" y2="77"
            stroke="rgba(255,255,255,0.16)" strokeWidth="1.8" strokeLinecap="round"/>
          {/* 樹冠（大きく、重なり豊か） */}
          <circle cx="55" cy="46" r="26" fill="#60A838"/>
          <circle cx="36" cy="55" r="19" fill="#68B040"/>
          <circle cx="74" cy="55" r="19" fill="#68B040"/>
          <circle cx="55" cy="30" r="17" fill="#78BE50"/>
          <circle cx="42" cy="40" r="15" fill="#70B848"/>
          <circle cx="68" cy="40" r="15" fill="#70B848"/>
          <circle cx="55" cy="48" r="15" fill="#78C050"/>
        </>}

        {/* ── Lv6 花が咲く木 ── */}
        {level === 6 && <>
          {/* 幹 */}
          <rect x="49" y="60" width="12" height="20" fill="#7A5038" rx="5"/>
          <line x1="53" y1="62" x2="53" y2="77"
            stroke="rgba(255,255,255,0.16)" strokeWidth="1.8" strokeLinecap="round"/>
          {/* 樹冠 */}
          <circle cx="55" cy="46" r="26" fill="#60A838"/>
          <circle cx="36" cy="55" r="19" fill="#68B040"/>
          <circle cx="74" cy="55" r="19" fill="#68B040"/>
          <circle cx="55" cy="30" r="17" fill="#78BE50"/>
          <circle cx="42" cy="40" r="15" fill="#70B848"/>
          <circle cx="68" cy="40" r="15" fill="#70B848"/>
          <circle cx="55" cy="48" r="15" fill="#78C050"/>
          {/* 花（白い外側＋淡い中心） */}
          <circle cx="42" cy="40" r="5.5" fill="white" opacity="0.92"/>
          <circle cx="42" cy="40" r="2.5" fill="#FFB8C8" opacity="0.85"/>
          <circle cx="68" cy="38" r="5" fill="white" opacity="0.88"/>
          <circle cx="68" cy="38" r="2.2" fill="#FFE8C0" opacity="0.82"/>
          <circle cx="55" cy="28" r="5" fill="white" opacity="0.90"/>
          <circle cx="55" cy="28" r="2.2" fill="#FFF0B8" opacity="0.84"/>
          <circle cx="48" cy="53" r="4.5" fill="white" opacity="0.86"/>
          <circle cx="48" cy="53" r="2" fill="#FFB8C8" opacity="0.78"/>
          <circle cx="65" cy="55" r="4.5" fill="white" opacity="0.86"/>
          <circle cx="65" cy="55" r="2" fill="#FFE0B0" opacity="0.78"/>
        </>}

        {/* ── Lv7 実をつけた木 ── */}
        {level === 7 && <>
          {/* 幹 */}
          <rect x="49" y="60" width="12" height="20" fill="#7A5038" rx="5"/>
          <line x1="53" y1="62" x2="53" y2="77"
            stroke="rgba(255,255,255,0.16)" strokeWidth="1.8" strokeLinecap="round"/>
          {/* 樹冠 */}
          <circle cx="55" cy="46" r="26" fill="#60A838"/>
          <circle cx="36" cy="55" r="19" fill="#68B040"/>
          <circle cx="74" cy="55" r="19" fill="#68B040"/>
          <circle cx="55" cy="30" r="17" fill="#78BE50"/>
          <circle cx="42" cy="40" r="15" fill="#70B848"/>
          <circle cx="68" cy="40" r="15" fill="#70B848"/>
          <circle cx="55" cy="48" r="15" fill="#78C050"/>
          {/* 花（控えめに） */}
          <circle cx="44" cy="36" r="4.5" fill="white" opacity="0.82"/>
          <circle cx="44" cy="36" r="2" fill="#FFB8C8" opacity="0.75"/>
          <circle cx="66" cy="32" r="4" fill="white" opacity="0.80"/>
          <circle cx="66" cy="32" r="1.8" fill="#FFE8C0" opacity="0.72"/>
          {/* 実（丸くてやさしい色） */}
          <circle cx="40" cy="53" r="6" fill="#E06848"/>
          <circle cx="40" cy="53" r="4" fill="#EE7858"/>
          <circle cx="38" cy="51" r="1.8" fill="rgba(255,255,255,0.52)"/>
          <circle cx="68" cy="50" r="5.5" fill="#D87040"/>
          <circle cx="68" cy="50" r="3.8" fill="#E88050"/>
          <circle cx="66" cy="48" r="1.6" fill="rgba(255,255,255,0.52)"/>
          <circle cx="53" cy="57" r="5.5" fill="#E06848"/>
          <circle cx="53" cy="57" r="3.8" fill="#EE7858"/>
          <circle cx="51" cy="55" r="1.6" fill="rgba(255,255,255,0.52)"/>
          <circle cx="66" cy="60" r="5" fill="#D87040"/>
          <circle cx="66" cy="60" r="3.5" fill="#E88050"/>
          <circle cx="64" cy="58" r="1.4" fill="rgba(255,255,255,0.52)"/>
        </>}

      </svg>
    </div>
  );
}

function TreeCard({ treeData }: { treeData: TreeLevelData }) {
  const subtext  = TREE_SUBTEXTS[treeData.level] ?? "";
  const isSeed   = treeData.level === 1;
  const nameColor   = isSeed ? "#6A4820" : "#3A6420";
  const labelColor  = isSeed ? "#8C7248" : "#7A9E58";
  const badgeBg     = isSeed ? "rgba(185,148,88,0.18)"  : "rgba(140,200,100,0.18)";
  const badgeBorder = isSeed ? "rgba(170,135,80,0.32)"  : "rgba(130,190,90,0.32)";
  const badgeColor  = isSeed ? "#7A5830"                : "#5A8A38";
  const textColor   = isSeed ? "#9A7E5A"                : "#849E68";

  return (
    <div className="flex flex-col items-center px-4 gap-5"
      style={{ paddingTop:28, paddingBottom:28 }}>

      {/* ラベル */}
      <p style={{ fontSize:11, color:labelColor, fontWeight:600, letterSpacing:"0.10em" }}>
        ふたりの木
      </p>

      {/* 木のビジュアル（主役） */}
      <TreeVisual level={treeData.level} />

      {/* 木の名前 */}
      <div className="flex flex-col items-center gap-1.5">
        <p className="font-bold" style={{ fontSize:22, color:nameColor, lineHeight:1 }}>
          {treeData.name}
        </p>
        {/* 称号（補助） */}
        <span className="px-3.5 py-1 rounded-full"
          style={{ fontSize:11, color:badgeColor, backgroundColor:badgeBg,
            border:`1px solid ${badgeBorder}`, fontWeight:600 }}>
          {treeData.title}
        </span>
      </div>

      {/* 補足文 */}
      <p style={{ fontSize:11, color:textColor, textAlign:"center", lineHeight:1.9 }}>
        {subtext}
      </p>
    </div>
  );
}

// ─── 木のレベルアップモーダル ─────────────────────────────
function TreeLevelUpModal({ treeData, onClose }: {
  treeData: TreeLevelData; onClose: () => void;
}) {
  const message = TREE_LEVELUP_MESSAGES[treeData.level] ?? "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor:"rgba(20,40,10,0.45)", backdropFilter:"blur(5px)" }}>
      <div className="w-full max-w-xs rounded-3xl overflow-hidden"
        style={{ backgroundColor:"#FAFFF5", boxShadow:"0 20px 60px rgba(20,50,10,0.32)" }}>
        {/* ヘッダー */}
        <div className="px-6 py-7 flex flex-col items-center gap-3 text-center"
          style={{ background:"linear-gradient(160deg,#E8F8D0,#D0EDB8)" }}>
          <span style={{ fontSize:60, lineHeight:1 }}>{treeData.emoji}</span>
          <p className="font-bold" style={{ fontSize:18, color:"#3A6818", lineHeight:1.3 }}>
            夫婦の木が育ちました
          </p>
        </div>
        {/* ボディ */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="rounded-2xl px-4 py-3 flex flex-col gap-0.5 text-center"
            style={{ backgroundColor:"rgba(195,238,165,0.35)", border:"1px solid #A8D880" }}>
            <p style={{ fontSize:10, color:"#6A9840", fontWeight:700, letterSpacing:"0.06em" }}>
              新しい称号
            </p>
            <p className="font-bold" style={{ fontSize:15, color:"#3A6818" }}>{treeData.title}</p>
          </div>
          <p className="text-sm text-center leading-relaxed" style={{ color:"#7A9868" }}>
            {message}
          </p>
          <button onClick={onClose}
            className="w-full py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
            style={{ background:"linear-gradient(135deg,#7AC050,#5A9838)", color:"#FAFFF5",
              boxShadow:"0 4px 16px rgba(80,152,40,0.38)" }}>
            やったね 🌟
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────
export default function Home() {
  const [myEmail,      setMyEmail]      = useState("");
  const [loading,      setLoading]      = useState(true);
  const [screen,       setScreen]       = useState<Screen>("home");
  const [saving,       setSaving]       = useState(false);
  const [coupleId,     setCoupleId]     = useState("");
  const [isConnected,     setIsConnected]     = useState(false);
  const [partnerEmail,    setPartnerEmail]    = useState<string | null>(null);
  const [showPerfectSync, setShowPerfectSync] = useState(false);
  const [syncMessage,     setSyncMessage]     = useState<SyncMessage | null>(null);
  const [showTreeLevelUp, setShowTreeLevelUp] = useState(false);
  const [treeLevelUpInfo, setTreeLevelUpInfo] = useState<TreeLevelData | null>(null);

  // ── ★ source of truth: DBの行をそのまま保持 ─────────────
  // myRow / partnerRow は myEmail で毎回派生させる
  // → どのタイミングでも必ず正しい仕分けになる
  const [syncData, setSyncData] = useState<SyncRow[]>([]);

  // ── 設定（自分の行から初期値をロード・設定画面で編集） ──
  const [coupleIdInput, setCoupleIdInput] = useState("");
  const [syncGoal,  setSyncGoal]  = useState(4);
  const now = new Date();
  // ── キモチ履歴（週次ふりかえり） ─────────────────────────
  const [kimochiLog, setKimochiLog] = useState<KimochiLogEntry[]>([]);
  // ── Push通知許可状態 ──
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");

  // ── UI状態 ──（リマインド機能削除につきキモチ選択は常時解放）
  const is17 = true;

  // ── Toast ──
  const [toast, setToast] = useState({on:false, msg:""});
  const pop = useCallback((msg:string) => {
    setToast({on:true, msg});
    setTimeout(()=>setToast({on:false, msg:""}), 2200);
  }, []);

  const today = getLocalDateStr();

  // ── Ref（コールバック内で最新値を参照） ──────────────────
  const todayRef = useRef(today);

  // ── syncData から派生する値（★ 毎レンダーで再計算） ──────
  // myEmail で厳格に仕分け → ミラーリング不可能
  const myRow = syncData.find(
    r => r.user_email === myEmail && r.couple_id === coupleId
  ) ?? null;

  // push_subscription のエンドポイント文字列（プリミティブにすることで useEffect の無限ループを防ぐ）
  const myPushEndpoint = (myRow?.push_subscription as { endpoint?: string } | null)?.endpoint ?? null;

  // ── 夫婦の木：派生値 ─────────────────────────────────────
  const treePoints        = myRow?.tree_points          ?? 0;
  const treeLastPointDate = myRow?.tree_last_point_date ?? null;
  const currentTreeData   = getTreeLevelData(treePoints);

  // パートナーの行（接続中のみ）
  const partnerRow = (isConnected && myEmail)
    ? (syncData.find(r => r.user_email !== myEmail && r.couple_id === coupleId) ?? null)
    : null;

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

  // ─── パートナーの生理期間判定 ──────────────────────────────
  const partnerMoonStart = partnerRow?.moon_start ?? null;
  const partnerMoonEnd   = partnerRow?.moon_end   ?? null;
  const isPartnerInPeriod = isConnected && partnerMoonStart !== null && (
    partnerMoonEnd === null ||
    (todayInt >= partnerMoonStart && todayInt <= partnerMoonEnd)
  );
  const partnerPeriodDayCount = (() => {
    if (!partnerMoonStart) return 0;
    const sy = Math.floor(partnerMoonStart / 10000);
    const sm = Math.floor((partnerMoonStart % 10000) / 100) - 1;
    const sd = partnerMoonStart % 100;
    const start = new Date(sy, sm, sd); start.setHours(0,0,0,0);
    const now2  = new Date();           now2.setHours(0,0,0,0);
    return Math.max(1, Math.floor((now2.getTime() - start.getTime()) / 86400000) + 1);
  })();
  const partnerPeriodLevel = partnerPeriodDayCount <= 2 ? "max" : partnerPeriodDayCount <= 4 ? "mid" : "low";
  const partnerPeriodPatterns = {
    max: [
      { emoji: "🤍", title: "今日はかなりつらい日かも",     message: "家のことは少し任せて、ゆっくり休ませてあげてね" },
      { emoji: "🤍", title: "一番しんどい時期だよ",         message: "無理に動かさず、そっとそばにいてあげてね" },
      { emoji: "🤍", title: "今日は体がきつい頃だよ",       message: "あたたかくして、横になれる時間を作ってあげよう" },
      { emoji: "🤍", title: "今が一番大変な日かも",         message: "会話より休息を優先できる日かもしれないよ" },
    ],
    mid: [
      { emoji: "🌸", title: "まだしんどさが残る頃かも",     message: "家事や負担、少し代われると助かるかもしれないよ" },
      { emoji: "🌸", title: "もうひと息の時期だよ",         message: "大丈夫？のひとことだけでも十分だよ" },
      { emoji: "🌸", title: "少しずつ楽になってくる頃だよ", message: "安心して過ごせるよう、そばにいてあげてね" },
      { emoji: "🌸", title: "回復途中の大切な時期だよ",     message: "引き続き、無理させないように気にかけてあげてね" },
    ],
    low: [
      { emoji: "🌿", title: "だいぶ落ち着いてきた頃かな",   message: "ひとこと気にかけるだけでも、十分伝わるよ" },
      { emoji: "🌿", title: "ほぼ終わりに近づいてるよ",     message: "お疲れさまって、伝えてあげてね" },
      { emoji: "🌿", title: "もうすぐ楽になる頃だよ",       message: "いつも通りに笑顔で過ごせるといいね" },
      { emoji: "🌿", title: "回復してきている頃だよ",       message: "無理しすぎないよう、やさしく接してあげてね" },
    ],
  };
  const partnerPeriodCopyList = partnerPeriodPatterns[partnerPeriodLevel];
  const partnerPeriodCopy = partnerPeriodCopyList[partnerPeriodDayCount % partnerPeriodCopyList.length];
  const partnerCareFooter = partnerPeriodLevel === "max"
    ? "今日はSyncより休息優先 🤍"
    : partnerPeriodLevel === "mid"
    ? "今日はそっと気づかう日 🌸"
    : "今日は無理せず一緒に 🌿";

  const myKimochi: Kimochi = myRow?.kimochi_date?.substring(0,10) === today
    ? normalizeKimochi(myRow.kimochi) : null;

  const partnerKimochi: Kimochi = partnerRow?.kimochi_date?.substring(0,10) === today
    ? normalizeKimochi(partnerRow.kimochi) : null;

  // ─── クールダウン（お休み期間）状態の派生 ─────────────────
  const lastSyncDate   = myRow?.last_sync_date ?? null;
  const cooldownDays   = getCooldownDays(syncGoal);
  const cooldownEndMs  = lastSyncDate ? (() => {
    const d = new Date(lastSyncDate);
    d.setDate(d.getDate() + cooldownDays);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })() : 0;
  const isInCooldown   = !!lastSyncDate && Date.now() < cooldownEndMs;
  const isSyncToday    = lastSyncDate === today;
  const remainingDays  = isInCooldown
    ? Math.max(0, Math.ceil((cooldownEndMs - new Date().setHours(0,0,0,0)) / 86400000))
    : 0;

  // ─── Perfect Sync 検知：両者が○になった瞬間に花火 + last_sync_date 保存 ─
  const savingLastSyncRef = useRef(false);
  useEffect(() => {
    if (myKimochi !== "circle" || partnerKimochi !== "circle") return;

    // 花火オーバーレイ（セッション中1回）
    const key = `ps_shown_${today}`;
    if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      setShowPerfectSync(true);
    }

    // last_sync_date を今日の日付で保存（まだ保存されていない場合のみ）
    if (
      coupleId && myEmail &&
      myRow?.last_sync_date !== today &&
      !savingLastSyncRef.current
    ) {
      savingLastSyncRef.current = true;
      supabase.from("sync_status").upsert({
        couple_id:      coupleId,
        user_email:     myEmail,
        last_sync_date: today,
        updated_at:     new Date().toISOString(),
      }, { onConflict: "couple_id,user_email" }).then(({ error }) => {
        savingLastSyncRef.current = false;
        if (error) console.error("[Sync] last_sync_date save:", error);
      });
      // 楽観的更新
      setSyncData(prev => prev.map(r =>
        r.user_email === myEmail ? { ...r, last_sync_date: today } : r
      ));
    }
  }, [myKimochi, partnerKimochi, today, coupleId, myEmail, myRow?.last_sync_date]);

  // ─── 夫婦の木：ポイント加算（両者入力完了時・1日1回）─────────
  const savingTreeRef = useRef(false);
  useEffect(() => {
    if (!myKimochi || !partnerKimochi) return;
    if (treeLastPointDate === today) return;
    if (!coupleId || !myEmail || !isConnected) return;
    if (savingTreeRef.current) return;

    const isPerfectSync = myKimochi === "circle" && partnerKimochi === "circle";
    const addedPoints = 1 + (isPerfectSync ? 3 : 0);
    const newPoints   = treePoints + addedPoints;
    const oldLvl      = getTreeLevelData(treePoints);
    const newLvl      = getTreeLevelData(newPoints);

    // レベルアップ演出（セッション中1回）
    if (newLvl.level > oldLvl.level) {
      const key = `tree_levelup_${today}_${newLvl.level}`;
      if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        setTreeLevelUpInfo(newLvl);
        setShowTreeLevelUp(true);
      }
    }

    savingTreeRef.current = true;

    // 楽観的更新（両行を同じ値に）
    setSyncData(prev => prev.map(r =>
      r.couple_id === coupleId
        ? { ...r, tree_points: newPoints, tree_level: newLvl.level, tree_last_point_date: today }
        : r
    ));

    updateTreeData(coupleId, myEmail, partnerRow?.user_email ?? null, newPoints, newLvl.level, today)
      .finally(() => { savingTreeRef.current = false; });
  }, [myKimochi, partnerKimochi, today, treePoints, treeLastPointDate, coupleId, myEmail, isConnected, partnerRow?.user_email]);

  // ─── SyncMessage 更新 ─────────────────────────────────────
  useEffect(() => {
    if (!isConnected) { setSyncMessage(null); return; }

    if (myKimochi && partnerKimochi) {
      // 両者入力済み：組み合わせメッセージ（perfect は花火に任せてnull）
      const result = getSyncMessage(myKimochi, partnerKimochi);
      setSyncMessage(result.type === "perfect" ? null : result);
    } else if (!myKimochi && partnerKimochi) {
      // 相手だけ入力済み
      setSyncMessage(getWaitingMessage());
    } else {
      setSyncMessage(null);
    }
  }, [myKimochi, partnerKimochi, isConnected]);

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
    if (row.kimochi_log) setKimochiLog(row.kimochi_log);
  }, []);

  // ─── 全行ロード ───────────────────────────────────────────
  // 接続中: サーバーアクション(RLSバイパス)で両者の行を取得
  // ソロ:   自分の行のみ
  const loadAll = useCallback(async (cid: string, email: string, connected: boolean) => {
    if (!cid || !email) return;

    if (connected) {
      const rows = await fetchCoupleRows(cid);
      if (rows?.length) {
        setSyncData(rows as unknown as SyncRow[]);
        const mine = (rows as unknown as SyncRow[]).find(r => r.user_email === email);
        if (mine) applyMySettings(mine);
      }
      return;
    }

    const { data, error } = await supabase
      .from("sync_status")
      .select("*")
      .eq("couple_id", cid)
      .eq("user_email", email);
    if (error) { console.error("[Sync] loadAll:", error); return; }
    if (!data?.length) return;

    setSyncData(data as SyncRow[]);
    applyMySettings(data[0] as SyncRow);
  }, [applyMySettings]);

  // ─── 1. 初期化 ─────────────────────────────────────────────
  // checkConnection でDB接続状態を確認し、coupleId を決定する
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) { setLoading(false); return; }

      const conn = await checkConnection();

      // React 18 は async コールバック内の setState を自動バッチ処理するため
      // myEmail と coupleId は同一レンダーで反映される
      setMyEmail(email);
      if (conn.connected) {
        setIsConnected(true);
        setPartnerEmail(conn.partnerEmail);
        setCoupleId(conn.coupleId);
        setCoupleIdInput(conn.coupleId);
        localStorage.setItem("sync_couple_id", conn.coupleId);
      } else {
        setIsConnected(false);
        setPartnerEmail(null);
        const cid = email; // ソロモード: メールを coupleId に使用
        localStorage.setItem("sync_couple_id", cid);
        setCoupleId(cid);
        setCoupleIdInput(cid);
      }
    })();
  }, []);

  // ─── 1b. 未接続の間だけ5秒ごとに接続確認をポーリング ────────
  useEffect(() => {
    if (!myEmail || isConnected) return;
    const id = setInterval(async () => {
      const conn = await checkConnection();
      if (conn.connected) {
        setIsConnected(true);
        setPartnerEmail(conn.partnerEmail);
        setCoupleId(conn.coupleId);
        setCoupleIdInput(conn.coupleId);
        localStorage.setItem("sync_couple_id", conn.coupleId);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [myEmail, isConnected]);

  // ─── 1c. 接続中の間も30秒ごとに確認（パートナー側の解除を検知）─
  useEffect(() => {
    if (!myEmail || !isConnected) return;
    const id = setInterval(async () => {
      const conn = await checkConnection();
      if (!conn.connected) {
        setIsConnected(false);
        setPartnerEmail(null);
        const cid = myEmail;
        setCoupleId(cid);
        setCoupleIdInput(cid);
        localStorage.setItem("sync_couple_id", cid);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [myEmail, isConnected]);

  // ─── 1e. Web Push — SW登録 & 現在の通知許可状態を確認 ──────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      setNotifPermission("unsupported"); return;
    }
    setNotifPermission(Notification.permission);
    navigator.serviceWorker.register("/sw.js").catch(e =>
      console.error("[Push] SW register failed:", e)
    );
  }, []);

  // ─── 1f. Push subscription をDBに保存する関数（ボタン押下時に呼ぶ）──
  const registerPushSubscription = useCallback(async () => {
    if (!coupleId || !myEmail || !VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // Uint8Array のまま渡す（iOS互換）
        const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: key as unknown as ArrayBuffer,
        });
      }
      const { error } = await supabase.from("sync_status").upsert({
        couple_id:         coupleId,
        user_email:        myEmail,
        push_subscription: sub.toJSON(),
        updated_at:        new Date().toISOString(),
      }, { onConflict: "couple_id,user_email" });
      if (error) throw error;
      setNotifPermission("granted");
      pop("通知を設定したよ 🔔");
    } catch (e) {
      console.error("[Push] subscription failed:", e);
      pop("通知の設定に失敗しました");
    }
  }, [coupleId, myEmail, pop]);

  const handleEnableNotif = useCallback(async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === "granted") await registerPushSubscription();
  }, [registerPushSubscription]);

  // ─── 1f-2. 許可済みの場合はアプリ起動時に自動で購読を登録/更新 ──
  // 別デバイスで登録済みのサブスクリプションを上書きしないよう、
  // 「このブラウザのエンドポイントがDBと異なる場合のみ保存」する
  useEffect(() => {
    if (!coupleId || !myEmail) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();

        // このデバイスにサブスクリプションがなく、DBに別デバイスの登録がある → 上書きしない
        if (!sub && myPushEndpoint) return;

        // DBと同じエンドポイント → 再保存不要
        if (sub && myPushEndpoint === sub.endpoint) return;

        // 上記以外（初回登録 or エンドポイント更新）→ 保存
        await registerPushSubscription();
      } catch (e) {
        console.error("[Push] auto-register check failed:", e);
      }
    })();
  }, [coupleId, myEmail, myPushEndpoint, registerPushSubscription]);

  // ─── 1d. Realtime subscription（sync_status の変更をリアルタイム受信）─
  useEffect(() => {
    if (!coupleId || !myEmail) return;

    const channel = supabase
      .channel(`sync_status:${coupleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_status", filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as SyncRow;
          mergeRow(row);
          // 自分の行が更新された場合は設定値も反映
          if (row.user_email === myEmail) applyMySettings(row);
          // パートナー行のsync_goal更新も反映（両行は常に同じ値で書き込まれる）
          else if (row.sync_goal != null) setSyncGoal(row.sync_goal);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [coupleId, myEmail, mergeRow, applyMySettings]);

  // ─── 1e. 接続中は15秒ごとにパートナー行をポーリング（Realtime補完）──
  // Realtime が届かない場合でも最大15秒で同期される
  // 自分の行には触れない（楽観的更新を保護）
  useEffect(() => {
    if (!myEmail || !isConnected || !coupleId) return;
    const id = setInterval(async () => {
      const rows = await fetchCoupleRows(coupleId);
      if (!rows?.length) return;
      for (const row of rows as unknown as SyncRow[]) {
        if (row.user_email !== myEmail) mergeRow(row);
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [myEmail, isConnected, coupleId, mergeRow]);

  // ─── 1f. 生理期間 broadcast チャンネル（即時同期） ──────────
  const periodChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!coupleId || !myEmail || !isConnected) return;
    const channel = supabase
      .channel(`period_sync:${coupleId}`)
      .on("broadcast", { event: "period_updated" }, async () => {
        const rows = await fetchCoupleRows(coupleId);
        if (!rows?.length) return;
        for (const row of rows as unknown as SyncRow[]) {
          if (row.user_email !== myEmail) mergeRow(row as SyncRow);
        }
      })
      .subscribe();
    periodChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); periodChannelRef.current = null; };
  }, [coupleId, myEmail, isConnected, mergeRow]);

  const broadcastPeriodUpdate = useCallback(() => {
    periodChannelRef.current?.send({ type: "broadcast", event: "period_updated", payload: {} });
  }, []);

  // ─── パートナー生理ハンドラ ─────────────────────────────────
  const handleConfirmPartnerStart = useCallback(async (start: number) => {
    if (!coupleId || !myEmail || !partnerRow?.user_email) return;
    await updatePartnerPeriod(coupleId, myEmail, partnerRow.user_email, start, null, partnerRow.period_history ?? null);
    setSyncData(prev => prev.map(r =>
      r.user_email === partnerRow.user_email ? { ...r, moon_start: start, moon_end: null } : r
    ));
    broadcastPeriodUpdate();
    pop("パートナーの生理開始日を記録したよ 🫶");
  }, [coupleId, myEmail, partnerRow, broadcastPeriodUpdate, pop]);

  const handleConfirmPartnerEnd = useCallback(async (end: number) => {
    if (!coupleId || !myEmail || !partnerRow?.user_email || !partnerRow.moon_start) return;
    const toDateStr = (n: number) => {
      const y = Math.floor(n/10000);
      const m = String(Math.floor((n%10000)/100)).padStart(2,"0");
      const d = String(n%100).padStart(2,"0");
      return `${y}-${m}-${d}`;
    };
    const startStr = toDateStr(partnerRow.moon_start);
    const endStr   = toDateStr(end);
    const now = new Date().toISOString();
    const existing = partnerRow.period_history ?? [];
    const newHistory = existing.some(r=>r.start===startStr)
      ? existing.map(r=>r.start===startStr?{...r,end:endStr,created_at:now}:r)
      : [...existing,{start:startStr,end:endStr,created_at:now}];
    await updatePartnerPeriod(coupleId, myEmail, partnerRow.user_email, partnerRow.moon_start, end, newHistory);
    setSyncData(prev => prev.map(r =>
      r.user_email === partnerRow.user_email ? { ...r, moon_end: end, period_history: newHistory } : r
    ));
    broadcastPeriodUpdate();
    pop("パートナーの生理終了日を記録したよ 🫶");
  }, [coupleId, myEmail, partnerRow, broadcastPeriodUpdate, pop]);

  const handleResetPartnerPeriod = useCallback(async () => {
    if (!coupleId || !myEmail || !partnerRow?.user_email) return;
    await updatePartnerPeriod(coupleId, myEmail, partnerRow.user_email, null, null, partnerRow.period_history ?? null);
    setSyncData(prev => prev.map(r =>
      r.user_email === partnerRow.user_email ? { ...r, moon_start: null, moon_end: null } : r
    ));
    broadcastPeriodUpdate();
    pop("パートナーの生理期間をリセットしたよ 🗑️");
  }, [coupleId, myEmail, partnerRow, broadcastPeriodUpdate, pop]);

  const handleDeletePartnerHistory = useCallback(async (startToDelete: string) => {
    if (!coupleId || !myEmail || !partnerRow?.user_email) return;
    const newHistory = (partnerRow.period_history ?? []).filter(r=>r.start!==startToDelete);
    await updatePartnerPeriod(coupleId, myEmail, partnerRow.user_email, partnerRow.moon_start ?? null, partnerRow.moon_end ?? null, newHistory);
    setSyncData(prev => prev.map(r =>
      r.user_email === partnerRow.user_email ? { ...r, period_history: newHistory } : r
    ));
    broadcastPeriodUpdate();
    pop("パートナーの履歴を削除したよ 🗑️");
  }, [coupleId, myEmail, partnerRow, broadcastPeriodUpdate, pop]);

  // ─── handleDisconnect ──────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    const res = await disconnectCouple();
    if (!res.ok) { alert(res.error); return; }
    setIsConnected(false);
    setPartnerEmail(null);
    const cid = myEmail;
    setCoupleId(cid);
    setCoupleIdInput(cid);
    localStorage.setItem("sync_couple_id", cid);
    setScreen("home");
  }, [myEmail]);

  // ─── handleResetSync：お休み期間を終了して再選択可能にする ─
  const handleResetSync = useCallback(async () => {
    if (!coupleId || !myEmail) return;

    // last_sync_date を null にする前に、その日を kimochi_log に is_sync: true で記録
    const syncDate = myRow?.last_sync_date;
    if (syncDate) {
      const updatedLog: KimochiLogEntry[] = kimochiLog.some(e => e.date === syncDate)
        ? kimochiLog.map(e => e.date === syncDate ? { ...e, is_sync: true } : e)
        : [...kimochiLog, { date: syncDate, my_kimochi: "circle", partner_kimochi: null, is_sync: true }];
      setKimochiLog(updatedLog);
      await supabase.from("sync_status").upsert({
        couple_id: coupleId, user_email: myEmail,
        kimochi_log: updatedLog, updated_at: new Date().toISOString(),
      }, { onConflict: "couple_id,user_email" });
    }

    const { error } = await supabase.from("sync_status").upsert({
      couple_id:      coupleId,
      user_email:     myEmail,
      last_sync_date: null,
      kimochi:        null,
      kimochi_date:   null,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
    if (!error) {
      // kimochi も一緒にリセットしないと Perfect Sync 検知 Effect が
      // 即座に再発火して last_sync_date: today を書き戻してしまう
      setSyncData(prev => prev.map(r =>
        r.user_email === myEmail
          ? { ...r, last_sync_date: null, kimochi: null, kimochi_date: null }
          : r
      ));
    }
  }, [coupleId, myEmail, myRow?.last_sync_date, kimochiLog]);

  // ─── 2. coupleId + email 揃ったら初期ロード ───────────────
  useEffect(() => {
    if (coupleId && myEmail) {
      // ★ coupleId が変わったら古い syncData を必ずクリア（別IDの残骸を防ぐ）
      setSyncData([]);
      setLoading(true);
      loadAll(coupleId, myEmail, isConnected).finally(() => setLoading(false));
    } else if (myEmail) {
      setSyncData([]); // coupleId 未設定時もクリア
      setLoading(false);
    }
  }, [coupleId, myEmail, isConnected, loadAll]);

  // ─── 5. キモチ保存 ────────────────────────────────────────
  const saveMyKimochi = useCallback(async (val: Kimochi) => {
    if (!coupleId || !myEmail) return;

    const payload = {
      couple_id:    coupleId,
      user_email:   myEmail,
      kimochi:      val,
      kimochi_date: getLocalDateStr(),
      updated_at:   new Date().toISOString(),
    };

    // 楽観的更新：syncData を即座に更新
    mergeRow({ ...payload } as unknown as SyncRow);

    const { error } = await supabase.from("sync_status")
      .upsert(payload, { onConflict: "couple_id,user_email" });
    if (error) console.error("[Sync] upsert:", error);
    else       console.log("[Sync] upsert成功:", val);
  }, [coupleId, myEmail, mergeRow]);

  // ─── 5b. キモチログ保存（6より前に定義が必要） ────────────
  const saveKimochiLog = useCallback(async (myK: Kimochi) => {
    if (!coupleId || !myEmail || !myK) return;
    const date = getLocalDateStr();
    const newLog = addKimochiLog(kimochiLog, date, myK);
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
    if (isInPeriod || isInCooldown || isPartnerInPeriod) return; // お休みモード中・クールダウン中・パートナー生理中は入力ブロック
    await saveMyKimochi(val);
    await saveKimochiLog(val);
    pop("キモチを更新したよ 🌸");
    // パートナーにプッシュ通知（fire-and-forget）
    if (coupleId) {
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId }),
      }).catch(e => console.error("[Push] notify failed:", e));
    }
  }, [saveMyKimochi, saveKimochiLog, pop, isInPeriod, isPartnerInPeriod, coupleId]);

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
    broadcastPeriodUpdate();
    pop("生理開始日を記録したよ 🌸");
  }, [coupleId, myEmail, pop, broadcastPeriodUpdate]);

  // ─── 8c. 生理終了日の記録 + period_history への追記 ─────
  const handleConfirmEnd = useCallback(async (end: number) => {
    if (!coupleId || !myEmail || !savedMoonStart) return;

    // YYYYMMDD 整数 → "YYYY-MM-DD" 文字列
    const toDateStr = (n: number) => {
      const y = Math.floor(n / 10000);
      const m = String(Math.floor((n % 10000) / 100)).padStart(2, "0");
      const d = String(n % 100).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    const startStr = toDateStr(savedMoonStart);
    const endStr   = toDateStr(end);

    // 既存履歴（同じ start がすでにあれば end を更新、なければ末尾に追加）
    const existing: PeriodRecord[] = myRow?.period_history ?? [];
    const now = new Date().toISOString();
    const newHistory: PeriodRecord[] = existing.some(r => r.start === startStr)
      ? existing.map(r => r.start === startStr ? { ...r, end: endStr, created_at: now } : r)
      : [...existing, { start: startStr, end: endStr, created_at: now }];

    await supabase.from("sync_status").upsert({
      couple_id:      coupleId,
      user_email:     myEmail,
      moon_end:       end,
      period_history: newHistory,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });

    setSyncData(prev => prev.map(r =>
      r.user_email === myEmail ? { ...r, moon_end: end, period_history: newHistory } : r
    ));
    broadcastPeriodUpdate();
    pop("生理終了日を記録したよ 🌙");
  }, [coupleId, myEmail, savedMoonStart, myRow, pop, broadcastPeriodUpdate]);

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
    broadcastPeriodUpdate();
    pop("生理期間をリセットしたよ 🗑️");
  }, [coupleId, myEmail, pop, broadcastPeriodUpdate]);

  // ─── 8d. 生理履歴削除 ───────────────────────────────────────
  const handleDeleteHistory = useCallback(async (startToDelete: string) => {
    if (!coupleId || !myEmail) return;
    const newHistory = (myRow?.period_history ?? []).filter(r => r.start !== startToDelete);
    await supabase.from("sync_status").upsert({
      couple_id:      coupleId,
      user_email:     myEmail,
      period_history: newHistory,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
    setSyncData(prev => prev.map(r =>
      r.user_email === myEmail ? { ...r, period_history: newHistory } : r
    ));
    pop("履歴を削除したよ 🗑️");
  }, [coupleId, myEmail, myRow, pop]);

  // ─── 接続完了ハンドラ ─────────────────────────────────────
  const handleConnected = useCallback((newCoupleId: string, newPartnerEmail: string) => {
    setIsConnected(true);
    setPartnerEmail(newPartnerEmail);
    setCoupleId(newCoupleId);
    setCoupleIdInput(newCoupleId);
    localStorage.setItem("sync_couple_id", newCoupleId);
    setScreen("home");
    pop("パートナーと接続できたよ 🌸");
    // coupleId が変わるので Effect 2 が自動的に loadAll を再実行する
  }, [pop]);

  // ─── 8. 設定保存 ─────────────────────────────────────────
  const handleSaveSettings = useCallback(async (
    cStart: number | null,
    cEnd:   number | null,
  ) => {
    setSaving(true);
    if (coupleId && myEmail) {
      await supabase.from("sync_status").upsert({
        couple_id:  coupleId,
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
  }, [coupleId, syncGoal, myEmail, pop]);

  // ─── 9a. Sync目標の即時保存（サーバーアクションで両行に書き込み）──
  const handleGoalChange = useCallback(async (newGoal: number) => {
    if (!coupleId || !myEmail) return;
    await updateSyncGoal(coupleId, myEmail, partnerRow?.user_email ?? null, newGoal);
  }, [coupleId, myEmail, partnerRow?.user_email]);

  // ─── 9a. ─────────────────────────────────────────────────


  // ─── 画面分岐 ─────────────────────────────────────────────
  if (screen === "settings") {
    return (
      <SettingsScreen
        onBack={()=>setScreen("home")}
        syncGoal={syncGoal}   setSyncGoal={setSyncGoal}
        initialConfirmedStart={savedMoonStart}
        initialConfirmedEnd={savedMoonEnd}
        periodHistory={(myRow?.period_history ?? []).length > 0 ? (myRow?.period_history ?? null) : null}
        onSave={handleSaveSettings} saving={saving}
        onConfirmStart={handleConfirmStart}
        onConfirmEnd={handleConfirmEnd}
        onResetPeriod={handleResetPeriod}
        onDeleteHistory={handleDeleteHistory}
        onGoalChange={handleGoalChange}
        isConnected={isConnected}
        partnerEmail={partnerEmail}
        onDisconnect={handleDisconnect}
        partnerMoonStart={partnerRow?.moon_start ?? null}
        partnerMoonEnd={partnerRow?.moon_end ?? null}
        partnerPeriodHistory={(partnerRow?.period_history ?? []).length > 0 ? (partnerRow?.period_history ?? null) : null}
        onConfirmPartnerStart={handleConfirmPartnerStart}
        onConfirmPartnerEnd={handleConfirmPartnerEnd}
        onResetPartnerPeriod={handleResetPartnerPeriod}
        onDeletePartnerHistory={handleDeletePartnerHistory}
      />
    );
  }

  if (loading) return <LoadingScreen />;

  if (screen === "connect") {
    return (
      <ConnectScreen
        onBack={() => setScreen("home")}
        onConnected={handleConnected}
      />
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center"
      style={{ backgroundColor:"#FFFBF5", color:"#4A3728" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      <Toast msg={toast.msg} on={toast.on}/>
      {showPerfectSync && <PerfectSyncOverlay onClose={() => setShowPerfectSync(false)} />}
      {showTreeLevelUp && treeLevelUpInfo && (
        <TreeLevelUpModal treeData={treeLevelUpInfo} onClose={() => setShowTreeLevelUp(false)} />
      )}

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

        {/* ── ② 状態バー ─────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 接続状態 */}
          {isConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor:"rgba(122,173,114,0.15)", border:"1px solid #A8C9A0" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", backgroundColor:"#5A9E7A", display:"inline-block" }}/>
              <span style={{ fontSize:10, color:"#5A9E7A", fontWeight:600 }}>接続中</span>
            </div>
          ) : (
            <button onClick={()=>setScreen("connect")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
              style={{ backgroundColor:"rgba(255,224,180,0.3)", border:"1px solid #FFD090" }}>
              <span style={{ fontSize:10, color:"#B86540", fontWeight:600 }}>🔗 パートナーと接続する</span>
            </button>
          )}
          {/* 目標サマリー（補助情報・生理期間中は非表示） */}
          {!isInPeriod && !isPartnerInPeriod && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{ backgroundColor:"rgba(255,255,255,0.5)", border:"1px solid #F5E8D8" }}>
              <span style={{ fontSize:10, color:"#D0BDB0" }}>目標 {syncGoal}回 / 月</span>
            </div>
          )}
          {/* 生理期間中バッジ */}
          {isInPeriod && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full"
              style={{ backgroundColor:"rgba(255,182,193,0.2)", border:"1px solid #F4A8B8" }}>
              <span style={{ fontSize:11 }}>🌸</span>
              <span style={{ fontSize:10, color:"#C46880", fontWeight:600 }}>お休みモード中</span>
            </div>
          )}
          {/* パートナー生理期間中バッジ */}
          {isConnected && isPartnerInPeriod && !isInPeriod && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full"
              style={{ backgroundColor:"rgba(255,182,193,0.2)", border:"1px solid #F4A8B8" }}>
              <span style={{ fontSize:11 }}>🌸</span>
              <span style={{ fontSize:10, color:"#C46880", fontWeight:600 }}>相手はお休みモード中</span>
            </div>
          )}
        </div>

        {/* ── ③ メインカード：状態別に完全分岐 ─────────── */}

        {isInPeriod ? (
          /* === 自分が生理期間中：お休みモードカード（本人向け） === */
          <div className="flex flex-col gap-3">
            {/* セクション見出し：本人向け「休んでいい」トーン */}
            <div className="px-0.5">
              <p className="font-bold" style={{ fontSize:16, color:"#4A3728" }}>
                今日はお休みモード 🌸
              </p>
              <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
                キモチの選択も、今日はお休みしているよ
              </p>
            </div>

            <div className="rounded-3xl overflow-hidden"
              style={{ border:"1.5px solid #F4A8B8", boxShadow:"0 4px 24px rgba(255,176,193,0.18)" }}>

              {/* ① 状況ラベル：誰の生理・何日目かを明示 */}
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ backgroundColor:"rgba(244,168,184,0.18)", borderBottom:"1px solid rgba(244,168,184,0.25)" }}>
                <span style={{ fontSize:12, color:"#C46880", fontWeight:700 }}>
                  あなたの生理 {periodDayCount}日目
                </span>
                <Image src={`/images/period-status-${periodLevel}.png`} alt="" width={40} height={40} style={{ mixBlendMode:"multiply", opacity:0.9 }} />
              </div>

              {/* ② 今日の結論 ＋ ③ 今日の提案（periodCopy を活用） */}
              <div className="px-5 py-4 flex flex-col gap-2"
                style={{ backgroundColor:"rgba(255,242,246,0.95)" }}>
                <p className="font-bold leading-snug" style={{ fontSize:15, color:"#4A3728" }}>
                  {periodCopy!.title}
                </p>
                <p style={{ fontSize:12, color:"#9A7B6A", lineHeight:1.7 }}>
                  {periodCopy!.message}
                </p>
              </div>

              {/* ④ 休息を許可するフッター（本人専用・責めない表現） */}
              <div className="px-5 pb-4"
                style={{ backgroundColor:"rgba(255,242,246,0.95)" }}>
                <div className="px-3 py-2.5 rounded-2xl text-center"
                  style={{ backgroundColor:"rgba(255,255,255,0.65)", border:"1px solid rgba(244,168,184,0.35)" }}>
                  <p style={{ fontSize:11, color:"#C46880" }}>
                    今日はできることだけで十分だよ。ゆっくり休んでね 🌸
                  </p>
                </div>
              </div>
            </div>
          </div>

        ) : isPartnerInPeriod ? (
          /* === パートナーが生理期間中：ケアカード（パートナー向け） === */
          <div className="flex flex-col gap-3">
            {/* セクション見出し：パートナー向け「気づかい」トーン */}
            <div className="px-0.5">
              <p className="font-bold" style={{ fontSize:16, color:"#4A3728" }}>
                今日はそっと気づかう日 🌸
              </p>
              <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
                {partnerPeriodLevel === "max"
                  ? "まず休めることを、いちばんに考えよう"
                  : partnerPeriodLevel === "mid"
                  ? "負担を少し軽くしてあげよう"
                  : "ひとこと気にかけながら過ごそう"}
              </p>
            </div>

            <div className="rounded-3xl overflow-hidden"
              style={{ border:"1.5px solid #F4A8B8", boxShadow:"0 4px 24px rgba(255,176,193,0.18)" }}>

              {/* ① 状況ラベル：パートナーの何日目かを明示 */}
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ backgroundColor:"rgba(244,168,184,0.18)", borderBottom:"1px solid rgba(244,168,184,0.25)" }}>
                <span style={{ fontSize:12, color:"#C46880", fontWeight:700 }}>
                  パートナーの生理 {partnerPeriodDayCount}日目
                </span>
                <Image src={`/images/period-status-${partnerPeriodLevel}.png`} alt="" width={40} height={40} style={{ mixBlendMode:"multiply", opacity:0.9 }} />
              </div>

              {/* ② 今日の結論 ＋ ③ 今日の提案（partnerPeriodCopy を活用） */}
              <div className="px-5 py-4 flex flex-col gap-2"
                style={{ backgroundColor:"rgba(255,242,246,0.95)" }}>
                <p className="font-bold leading-snug" style={{ fontSize:15, color:"#4A3728" }}>
                  {partnerPeriodCopy.title}
                </p>
                <p style={{ fontSize:12, color:"#9A7B6A", lineHeight:1.7 }}>
                  {partnerPeriodCopy.message}
                </p>
              </div>

              {/* ④ 気づかいを促すフッター（パートナー専用・レベル別短文） */}
              <div className="px-5 pb-4"
                style={{ backgroundColor:"rgba(255,242,246,0.95)" }}>
                <div className="px-3 py-2.5 rounded-2xl text-center"
                  style={{ backgroundColor:"rgba(255,255,255,0.65)", border:"1px solid rgba(244,168,184,0.35)" }}>
                  <p style={{ fontSize:11, color:"#C46880" }}>
                    {partnerCareFooter}
                  </p>
                </div>
              </div>
            </div>
          </div>

        ) : isInCooldown ? (
          /* === クールダウン中：お休み期間カード === */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-0.5">
              <p className="font-bold" style={{ fontSize:16, color:"#4A3728" }}>
                ふたりのお休み期間中 🌙
              </p>
            </div>
            <SyncSuccessCard
              isSyncToday={isSyncToday}
              remainingDays={remainingDays}
              totalDays={cooldownDays}
              lastSyncDate={lastSyncDate!}
              onReset={handleResetSync}
            />
          </div>

        ) : (
          /* === 通常：今日のふたりの状態 === */
          <div className="flex flex-col gap-3">

            {/* ヘッダー：入力誘導から状態表示へ */}
            <div className="px-0.5">
              <p className="font-bold" style={{ fontSize:16, color:"#4A3728" }}>
                今日のふたりの状態
              </p>
              <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
                ふたりの温度感が、ここに見えてくるよ
              </p>
            </div>

            <>
              {/* ─ メインカード：状態サマリー ＋ 選択UI ─ */}
              <div className="rounded-3xl overflow-hidden"
                style={{ border:"1.5px solid #FFE0CC", boxShadow:"0 4px 24px rgba(255,176,133,0.18)" }}>

                {/* 🆕 今日の状態ラベル（既存の state から導出のみ・ロジック変更なし） */}
                {isConnected && (() => {
                  let label: string = "";
                  let tc: string = "#9A7B6A";
                  let bc: string = "rgba(248,244,240,0.8)";
                  let bd: string = "#EDE0D0";

                  if (!myKimochi && !partnerKimochi) {
                    label = "まだ途中だよ";
                  } else if (myKimochi && !partnerKimochi) {
                    label = "パートナー待ちだよ";
                    tc = "#B86540"; bc = "rgba(255,242,225,0.8)"; bd = "#FFD090";
                  } else if (!myKimochi && partnerKimochi) {
                    label = "先に伝えてくれてるよ";
                    tc = "#5A9E7A"; bc = "rgba(220,245,232,0.8)"; bd = "#A8C9A0";
                  } else if (myKimochi === "circle" && partnerKimochi === "circle") {
                    label = "今日はシンクしたよ ✨";
                    tc = "#C4603A"; bc = "rgba(255,242,180,0.8)"; bd = "#FFD580";
                  } else if (syncMessage?.type === "sync_soso") {
                    label = "今日はのんびり日";
                    tc = "#B8943A"; bc = "rgba(255,248,220,0.8)"; bd = "#E8D890";
                  } else if (syncMessage?.type === "sync_tired") {
                    label = "今日はおつかれ気味";
                    tc = "#8B7BA8"; bc = "rgba(240,235,250,0.8)"; bd = "#D8C8F0";
                  } else if (syncMessage?.type === "slight_gap") {
                    label = "少しズレ気味かも";
                    tc = "#B8943A"; bc = "rgba(255,248,220,0.8)"; bd = "#E8D890";
                  } else if (syncMessage?.type === "big_gap") {
                    label = "歩幅が少し違う日";
                    tc = "#8B7BA8"; bc = "rgba(240,235,250,0.8)"; bd = "#D8C8F0";
                  } else if (syncMessage?.type === "both_low") {
                    label = "今日はしんどい日かも";
                    tc = "#8B7BA8"; bc = "rgba(240,235,250,0.8)"; bd = "#D8C8F0";
                  }

                  if (!label) return null;

                  return (
                    <div className="flex justify-center pt-3.5 pb-1"
                      style={{ backgroundColor: "rgba(255,252,248,0.98)" }}>
                      <span className="px-3.5 py-1 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: bc, border: `1px solid ${bd}`, color: tc }}>
                        {label}
                      </span>
                    </div>
                  );
                })()}

                {/* ① 今日の状態サマリー */}
                <div className="px-5 pt-3 pb-4 flex items-center justify-around"
                  style={{ backgroundColor:"rgba(255,252,248,0.98)" }}>

                  {/* あなたの状態 */}
                  <div className="flex flex-col items-center gap-1.5">
                    <span style={{ fontSize:11, color:"#B86540", fontWeight:600 }}>🌸 あなた</span>
                    <span style={{
                      fontSize:48, fontWeight:700, lineHeight:1,
                      color: myKimochi
                        ? (myKimochi==="circle" ? "#D97B6C" : myKimochi==="triangle" ? "#B8943A" : "#8B7BA8")
                        : "#E0D0C8",
                    }}>
                      {myKimochi==="circle" ? "○" : myKimochi==="triangle" ? "△" : myKimochi==="cross" ? "✕" : "—"}
                    </span>
                    <span style={{ fontSize:10, fontWeight:600, color: myKimochi ? "#D97B6C" : "#C4A898" }}>
                      {myKimochi ? "伝えたよ ✓" : "まだ選んでないよ"}
                    </span>
                  </div>

                  {/* 中央コネクター：2点＋ラインで関係を静かに表現 */}
                  <div className="flex items-center gap-1.5">
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      backgroundColor: myKimochi ? "#D4A090" : "#E0D4CC",
                      transition: "background-color 0.3s ease",
                    }}/>
                    <div style={{
                      width: 22, height: 1.5, borderRadius: 1,
                      backgroundColor: (myKimochi && partnerKimochi) ? "#DEC8A0" : "#EAE0D8",
                      transition: "background-color 0.3s ease",
                    }}/>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      backgroundColor: (isConnected && partnerKimochi) ? "#86B89A" : "#E0D4CC",
                      transition: "background-color 0.3s ease",
                    }}/>
                  </div>

                  {/* パートナーの状態 */}
                  {isConnected ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <span style={{ fontSize:11, color:"#5A9E7A", fontWeight:600 }}>🌿 パートナー</span>
                      <span style={{
                        fontSize:48, fontWeight:700, lineHeight:1,
                        color: partnerKimochi ? "#5A9E7A" : "#E0D0C8",
                      }}>
                        {partnerKimochi ? "✓" : "—"}
                      </span>
                      <span style={{ fontSize:10, fontWeight:600, color: partnerKimochi ? "#5A9E7A" : "#C4A898" }}>
                        {partnerKimochi ? "伝えてくれた ✓" : "まだみたい"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <span style={{ fontSize:11, color:"#C4A898", fontWeight:600 }}>パートナー</span>
                      <span style={{ fontSize:48, fontWeight:700, lineHeight:1, color:"#E0D0C8" }}>—</span>
                      <span style={{ fontSize:10, fontWeight:600, color:"#C4A898" }}>まだつながってないよ</span>
                    </div>
                  )}
                </div>

                {/* 区切り線 */}
                <div style={{ height:"1px", backgroundColor:"#F0E8D8", margin:"0 16px" }}/>

                {/* ② キモチ選択エリア（既存のKimochiRow、ラベルのみ変更） */}
                <div className="px-4 pt-3 pb-4"
                  style={{ backgroundColor:"rgba(255,255,255,0.82)" }}>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span style={{ fontSize:11, color:"#C4A898", fontWeight:600 }}>
                      {myKimochi ? "選びなおすこともできるよ" : "今日の気持ちを、そっと選んでみてね"}
                    </span>
                    {myKimochi && (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ backgroundColor:"rgba(217,123,108,0.12)", color:"#D97B6C" }}>
                        ✓ 伝えたよ
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
              </div>

              {/* ─ SyncMessage カード（今日のヒント・提案として役割明示） ─ */}
              {syncMessage && (
                <div className="rounded-2xl px-4 pt-3 pb-3.5 flex flex-col gap-1"
                  style={{
                    backgroundColor: "rgba(248,245,255,0.65)",
                    border: "1px solid #E4D8F5",
                  }}>
                  <p className="text-xs font-semibold" style={{ color: "#C0B0D8" }}>
                    今日のヒント
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "#7A5FA0" }}>
                    {syncMessage.message}
                  </p>
                  {syncMessage.actionSuggestion && (
                    <p className="text-xs" style={{ color: "#9E85C0" }}>
                      {syncMessage.actionSuggestion}
                    </p>
                  )}
                </div>
              )}
            </>
          </div>
        )}

        {/* ── 通知許可バナー ──────────────────────────────── */}
        {isConnected && notifPermission === "default" && (
          <button
            onClick={handleEnableNotif}
            className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-95 transition-transform"
            style={{ backgroundColor:"rgba(255,255,255,0.85)", border:"1.5px solid #FFD090" }}>
            <span style={{ fontSize:22 }}>🔔</span>
            <div className="text-left flex-1">
              <p className="text-xs font-bold" style={{ color:"#B86540" }}>通知を受け取る</p>
              <p style={{ fontSize:10, color:"#C4A898" }}>相手が気持ちを伝えたとき、通知でお知らせするよ</p>
            </div>
            <span style={{ fontSize:11, color:"#D97B6C", fontWeight:600 }}>許可する →</span>
          </button>
        )}

        {/* ── 夫婦の木カード ──────────────────────────────────── */}
        <TreeCard treeData={currentTreeData} />

        {/* ── ④ 週次ふりかえりカード（改善版：2段構成） ─────────── */}
        {(() => {
          const weekDays = getWeeklyEntries(kimochiLog);
          const hasAnyEntry = weekDays.some(d => d.kimochi !== null);
          const { start, end } = getThisWeekRange();
          const todayStr = getLocalDateStr();
          // is_sync フラグがあるログエントリ（リセット後も残る）
          const logSyncDates = kimochiLog
            .filter(e => e.is_sync && e.date >= start && e.date <= end)
            .map(e => e.date);
          // last_sync_date（まだリセットされていない場合のフォールバック）
          const syncDates = [
            ...logSyncDates,
            ...(lastSyncDate && lastSyncDate >= start && lastSyncDate <= end && !logSyncDates.includes(lastSyncDate)
              ? [lastSyncDate] : []),
          ];
          if (!hasAnyEntry && syncDates.length === 0) return null;

          // ─ 導出値（既存ロジックをそのまま活用） ────────────
          const entryCount = weekDays.filter(d => d.kimochi !== null).length;
          const lastEntryDay = [...weekDays].reverse().find(d => d.kimochi !== null);
          // 最後にSyncした日：今週内なら曜日、先週以前なら日付
          const lastSyncDisplay: string | null = (() => {
            if (syncDates.length > 0) {
              const last = [...syncDates].sort().at(-1)!;
              return DOW_LABEL[new Date(last + "T00:00:00").getDay()];
            }
            if (lastSyncDate) {
              const [, m, day] = lastSyncDate.split("-");
              return `${parseInt(m)}/${parseInt(day)}`;
            }
            return null;
          })();
          const syncDateSet = new Set(syncDates);

          // ─ スタイル定義 ──────────────────────────────────
          const kimochiStyle = (k: Kimochi): { sym: string; color: string; bg: string } => {
            if (k === "circle")   return { sym: "○", color: "#5A9E7A", bg: "rgba(90,158,122,0.07)"  };
            if (k === "triangle") return { sym: "△", color: "#D97B6C", bg: "rgba(217,123,108,0.07)" };
            if (k === "cross")    return { sym: "✕", color: "#B0A0B8", bg: "rgba(176,160,184,0.07)" };
            return { sym: "—", color: "#D8C8C0", bg: "transparent" };
          };

          return (
            <div className="rounded-3xl overflow-hidden"
              style={{ border:"1px solid #F0DFC8", boxShadow:"0 2px 8px rgba(255,176,133,0.06)" }}>

              {/* カードヘッダー */}
              <div className="px-4 py-2.5 flex items-center gap-2"
                style={{ backgroundColor:"rgba(255,248,235,0.75)" }}>
                <span style={{ fontSize:14 }}>📅</span>
                <p className="text-xs font-bold" style={{ color:"#C4A898" }}>今週のふりかえり</p>
              </div>

              <div className="px-4 py-3 flex flex-col gap-3"
                style={{ backgroundColor:"rgba(255,255,255,0.70)" }}>

                {/* ─ 上段：今週の要約（3項目） ─ */}
                <div className="flex items-center pb-3"
                  style={{ borderBottom:"1px solid #F5EDE0" }}>
                  {/* 今週の入力 */}
                  <div className="flex flex-col items-center gap-0.5 flex-1">
                    <span style={{ fontSize:9, color:"#C4A898", fontWeight:600 }}>今週の入力</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-bold" style={{ fontSize:16, color:"#B86540", lineHeight:1 }}>{entryCount}</span>
                      <span style={{ fontSize:10, color:"#C4A898", fontWeight:600 }}>日</span>
                    </div>
                  </div>
                  <div style={{ width:1, height:28, backgroundColor:"#F0E0D0", flexShrink:0 }}/>
                  {/* 最後の入力 */}
                  <div className="flex flex-col items-center gap-0.5 flex-1">
                    <span style={{ fontSize:9, color:"#C4A898", fontWeight:600 }}>最後の入力</span>
                    <span className="font-bold" style={{ fontSize:16, color: lastEntryDay ? "#B86540" : "#D8C8C0", lineHeight:1 }}>
                      {lastEntryDay ? lastEntryDay.dow : "—"}
                    </span>
                  </div>
                  <div style={{ width:1, height:28, backgroundColor:"#F0E0D0", flexShrink:0 }}/>
                  {/* 最後のSync */}
                  <div className="flex flex-col items-center gap-0.5 flex-1">
                    <span style={{ fontSize:9, color:"#C4A898", fontWeight:600 }}>最後のSync</span>
                    <span className="font-bold" style={{ fontSize:16, color: lastSyncDisplay ? "#5A9E7A" : "#D8C8C0", lineHeight:1 }}>
                      {lastSyncDisplay ?? "—"}
                    </span>
                  </div>
                </div>

                {/* ─ 下段：曜日ごとの自分の選択履歴（縦リスト） ─ */}
                <div className="flex flex-col gap-1">
                  {weekDays.map(({ date, dow, kimochi }) => {
                    const { sym, color, bg } = kimochiStyle(kimochi);
                    const isToday   = date === todayStr;
                    const isSyncDay = syncDateSet.has(date);
                    return (
                      <div key={date}
                        className="flex items-center gap-3 px-2 py-1 rounded-xl"
                        style={{ backgroundColor: kimochi ? bg : "transparent" }}>
                        {/* 曜日 */}
                        <span style={{
                          fontSize:11, fontWeight:600, width:16, textAlign:"center",
                          color: isToday ? "#B86540" : "#C4A898",
                        }}>
                          {dow}
                        </span>
                        {/* シンボル */}
                        <span style={{ fontSize:18, fontWeight:700, color, lineHeight:1, width:20, textAlign:"center" }}>
                          {sym}
                        </span>
                        {/* 右端バッジ */}
                        <div className="flex items-center gap-1.5 ml-auto">
                          {isSyncDay && (
                            <span className="px-2 py-0.5 rounded-full"
                              style={{ fontSize:9, fontWeight:700, backgroundColor:"rgba(90,158,122,0.13)", color:"#5A9E7A" }}>
                              ✨ Sync
                            </span>
                          )}
                          {isToday && (
                            <span style={{ fontSize:9, color:"#D0A898", fontWeight:600 }}>今日</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>
          );
        })()}

        <div className="h-4"/>
      </div>
    </main>
  );
}
