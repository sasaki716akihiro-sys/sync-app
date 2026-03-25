"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { logout } from "@/app/auth/actions";
import { checkConnection, disconnectCouple, issueInviteCode, joinWithInviteCode } from "@/app/actions/invite";
import { fetchCoupleRows } from "@/app/actions/sync";
import { createClient } from "@/lib/supabase/client";

// ─── Supabaseクライアントはモジュールレベルで1度だけ生成 ──────
// コンポーネント内で生成すると再レンダリングのたびに新インスタンスが
// 作られ、Realtimeの購読が切れる原因になる
const supabase = createClient();

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
  // ── リマインド設定 ──
  reminder_weekday: number | null; // 平日リマインド時刻（時）例: 17
  reminder_weekend: number | null; // 休日リマインド時刻（時）例: 19
  // ── キモチ履歴（週次ふりかえり用） ──
  kimochi_log: KimochiLogEntry[] | null;
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
  closeDays:  string[];   // キモチを選んだ日（曜日ラベル）
} {
  const { start, end } = getThisWeekRange();
  const thisWeek = log.filter(e => e.date >= start && e.date <= end);
  const syncCount = thisWeek.filter(e => e.my_kimochi === "circle").length;
  const closeDays = thisWeek
    .filter(e => e.my_kimochi !== null)
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
  reminderWeekday, setReminderWeekday, reminderWeekend, setReminderWeekend,
  onSave, saving, onConfirmStart, onConfirmEnd, onResetPeriod, onDeleteHistory,
  onGoalChange, onReminderChange,
  isConnected, partnerEmail, onDisconnect,
}: {
  onBack:()=>void;
  syncGoal:number; setSyncGoal:(n:number)=>void;
  initialConfirmedStart: number | null;
  initialConfirmedEnd:   number | null;
  periodHistory: PeriodRecord[] | null;
  reminderWeekday:number; setReminderWeekday:(n:number)=>void;
  reminderWeekend:number; setReminderWeekend:(n:number)=>void;
  onSave:(cStart:number|null, cEnd:number|null)=>void; saving:boolean;
  onConfirmStart:(start:number)=>Promise<void>;
  onConfirmEnd:(end:number)=>Promise<void>;
  onResetPeriod:()=>Promise<void>;
  onDeleteHistory:(start:string)=>Promise<void>;
  onGoalChange:(newGoal:number)=>void;
  onReminderChange:(weekday:number, weekend:number)=>void;
  isConnected: boolean;
  partnerEmail: string | null;
  onDisconnect: () => Promise<void>;
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

  // ── 生理期間 ─────────────────────────────────────────────
  // YYYYMMDD 整数で管理（例: 2026年3月17日 → 20260317）
  const _now = new Date();
  // confirmed は initial props（DB読み込み値）で初期化
  const [confirmedStart, setConfirmedStart] = useState<number | null>(initialConfirmedStart);
  const [confirmedEnd,   setConfirmedEnd]   = useState<number | null>(initialConfirmedEnd);
  const [draftDate,      setDraftDate]      = useState<number | null>(null);
  // カレンダーの表示月：記録があればその月、なければ今月
  const _effectiveStart = initialConfirmedStart;
  const _initYear  = _effectiveStart
    ? Math.floor(_effectiveStart / 10000)
    : _now.getFullYear();
  const _initMonth = _effectiveStart
    ? Math.floor((_effectiveStart % 10000) / 100) - 1
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

  // ── 次回予測計算 ─────────────────────────────────────────
  const _parseYMD  = (s: string) => parseInt(s.replace(/-/g, ""), 10);
  const _daysDiff  = (from: string, to: string) =>
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  const _durDays   = (r: PeriodRecord) => _daysDiff(r.start, r.end) + 1;
  const _addDays   = (dateStr: string, days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return getLocalDateStr(d);
  };
  const _completed = (periodHistory ?? [])
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
        <button onClick={()=>onSave(confirmedStart, confirmedEnd)} disabled={saving}
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
        {periodHistory && periodHistory.length > 0 && (
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
              {(showAllHistory ? periodHistory : periodHistory.slice(0, HISTORY_LIMIT)).map((rec) => (
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
                            await onDeleteHistory(rec.start);
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
              {periodHistory.length > HISTORY_LIMIT && (
                <button
                  onClick={() => setShowAllHistory(v => !v)}
                  className="mt-1 py-2 rounded-2xl text-xs font-semibold active:scale-95 transition-transform"
                  style={{ color:"#8B7BA8", backgroundColor:"rgba(139,123,168,0.07)", border:"1px solid #E0D4F0" }}>
                  {showAllHistory
                    ? "折りたたむ ▲"
                    : `すべて見る（残り ${periodHistory.length - HISTORY_LIMIT} 件）▼`}
                </button>
              )}
            </div>
          </div>
        )}

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

  // ハイフンなしの生コード（最大7文字）を state に保持
  // ※ハイフンを onChange 内で挿入すると Android IME がカーソルジャンプを
  //   「未確定文字の再送」と解釈して同じ文字が二重入力されるバグが発生するため、
  //   state の変換は最小限にしてカーソル位置を変えない
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 7);
    setInputCode(raw);
  };

  // 表示用のみハイフンを付ける（state には反映しない）
  const displayInputValue = inputCode.length > 4
    ? `${inputCode.slice(0, 4)}-${inputCode.slice(4)}`
    : inputCode;

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
              value={displayInputValue}
              onChange={handleInputChange}
              placeholder="XXXX-XXX"
              maxLength={8}
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



// ─── メインページ ─────────────────────────────────────────
export default function Home() {
  const [myEmail,      setMyEmail]      = useState("");
  const [loading,      setLoading]      = useState(true);
  const [screen,       setScreen]       = useState<Screen>("home");
  const [saving,       setSaving]       = useState(false);
  const [coupleId,     setCoupleId]     = useState("");
  const [isConnected,  setIsConnected]  = useState(false);
  const [partnerEmail, setPartnerEmail] = useState<string | null>(null);

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
  const [is17, setIs17] = useState(false);

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

  const myKimochi: Kimochi = myRow?.kimochi_date?.substring(0,10) === today
    ? normalizeKimochi(myRow.kimochi) : null;

  const partnerKimochi: Kimochi = partnerRow?.kimochi_date?.substring(0,10) === today
    ? normalizeKimochi(partnerRow.kimochi) : null;

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
    if (row.reminder_weekday != null) setReminderWeekday(row.reminder_weekday);
    if (row.reminder_weekend != null) setReminderWeekend(row.reminder_weekend);
    setReminderLoaded(true);
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
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [coupleId, myEmail, mergeRow, applyMySettings]);

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

  // ─── 3. リマインド時刻を過ぎたら自動的にキモチ選択を解放 ──
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
    if (isInPeriod) return; // お休みモード中は入力ブロック
    await saveMyKimochi(val);
    await saveKimochiLog(val);
    pop("キモチを更新したよ 🌸");
  }, [saveMyKimochi, saveKimochiLog, pop, isInPeriod]);

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
    pop("生理終了日を記録したよ 🌙");
  }, [coupleId, myEmail, savedMoonStart, myRow, pop]);

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

  // ─── 9c. リマインド設定の即時保存 ──────────────────────────
  const handleReminderChange = useCallback(async (weekday: number, weekend: number) => {
    if (!coupleId || !myEmail) return;
    await supabase.from("sync_status").upsert(
      { couple_id: coupleId, user_email: myEmail,
        reminder_weekday: weekday, reminder_weekend: weekend,
        updated_at: new Date().toISOString() },
      { onConflict: "couple_id,user_email" }
    );
  }, [coupleId, myEmail]);

  // ─── 9a. Sync目標の即時保存（9c の前に番号を詰める）─────


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
        reminderWeekday={reminderWeekday} setReminderWeekday={setReminderWeekday}
        reminderWeekend={reminderWeekend} setReminderWeekend={setReminderWeekend}
        onReminderChange={handleReminderChange}
        isConnected={isConnected}
        partnerEmail={partnerEmail}
        onDisconnect={handleDisconnect}
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
          {/* 目標サマリー */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ backgroundColor:"rgba(255,255,255,0.7)", border:"1px solid #FDEBD0" }}>
            <span style={{ fontSize:11, color:"#C4A898" }}>🎯</span>
            <span style={{ fontSize:10, color:"#9A7B6A" }}>目標 {syncGoal}回 / 月</span>
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

        {isInPeriod ? (
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
                      言いにくい日も、選ぶだけでいいよ ☁️
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

                  {/* パートナーのキモチ（接続中のみ）*/}
                  {isConnected && (
                    <div className="px-4 pt-3 pb-4"
                      style={{ borderTop:"1px solid #F0F7EE", backgroundColor:"rgba(245,252,245,0.9)" }}>
                      <div className="flex items-center gap-1.5 mb-3">
                        <span style={{ fontSize:14 }}>🌿</span>
                        <span className="text-xs font-bold" style={{ color:"#5A9E7A" }}>パートナーのキモチ</span>
                        {partnerKimochi ? (
                          <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor:"rgba(90,158,122,0.12)", color:"#5A9E7A" }}>
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
                        selected={partnerKimochi}
                        onSelect={() => {}}
                        disabled={true}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ④ 週次ふりかえりカード ─────────────────────── */}
        {(() => {
          const { syncCount, closeDays } = analyzeWeeklyLog(kimochiLog);
          const reminderHour = getTodayReminderHour(reminderWeekday, reminderWeekend);
          const isWeekend = new Date().getDay()===0 || new Date().getDay()===6;
          if (kimochiLog.length === 0) return null;
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
                  <span style={{ fontSize:20 }}>☀️</span>
                  <p style={{ fontSize:13, color:"#4A3728", fontWeight:600 }}>
                    今週は{syncCount > 0 ? `${syncCount}回 ○を選んだよ` : "まだ○なし。今日が最初の一歩 🌱"}
                  </p>
                </div>
                {closeDays.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize:18 }}>📝</span>
                    <p style={{ fontSize:12, color:"#9A7B6A" }}>
                      キモチを記録した日：{closeDays.slice(0,3).join("・")}
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
