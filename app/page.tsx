"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  cycle_days:      number | null;  // 生理周期（日数）
  period_days:     number | null;  // 生理期間（日数）
  last_start_date: string | null;  // 直近の開始日 YYYY-MM-DD
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
  const particles = Array.from({ length: 48 }, (_, i) => {
    const angle = (i/48)*360, dist = 80+Math.random()*120;
    return { id:i, color:FW_COLORS[i%FW_COLORS.length],
      emoji: i%8===0 ? FW_EMOJIS[Math.floor(i/8)%FW_EMOJIS.length] : null,
      tx: Math.cos((angle*Math.PI)/180)*dist,
      ty: Math.sin((angle*Math.PI)/180)*dist-60,
      delay: Math.random()*0.6, size: 10+Math.random()*14 };
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
        {particles.map(p=>(
          <div key={p.id} className="absolute top-1/2 left-1/2 rounded-full flex items-center justify-center"
            style={{ width:p.emoji?p.size*1.6:p.size, height:p.emoji?p.size*1.6:p.size,
              backgroundColor:p.emoji?"transparent":p.color, fontSize:p.emoji?p.size:undefined,
              ["--tx" as string]:`${p.tx}px`, ["--ty" as string]:`${p.ty}px`,
              animation:`fw 1.2s ${p.delay}s ease-out both`,
              marginLeft:-(p.size/2), marginTop:-(p.size/2) }}>
            {p.emoji}
          </div>
        ))}
      </div>
      <div className="absolute flex flex-col items-center gap-2 px-8 py-5 rounded-3xl shadow-2xl"
        style={{ backgroundColor:"rgba(255,255,255,0.93)", border:"2px solid #FFB085", animation:"fw-msg 3.8s ease-out both" }}>
        <span style={{ fontSize:40 }}>💛</span>
        <p className="text-xl font-bold text-center" style={{ color:"#D97B6C" }}>Perfect Sync 💛</p>
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
  const msg = isHappy ? { title:"Perfect Sync 💛", body:"ふたりの気持ちがそろったね。素敵な夜を 🌙✨" } : pickMessage(me, partner);
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

// ─── ムーンデイカレンダー ────────────────────────────────
// moon_start / moon_end は YYYYMMDD 形式の整数で管理
// 例：2026年3月16日 → 20260316
// → 月をまたぐ期間も年月日の大小比較だけで正しく判定できる
const MONTH_NAMES = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

function toYMD(year: number, month: number, day: number): number {
  return year * 10000 + (month + 1) * 100 + day; // month は 0-indexed
}
function ymdYear(ymd: number)  { return Math.floor(ymd / 10000); }
function ymdMonth(ymd: number) { return Math.floor((ymd % 10000) / 100) - 1; } // 0-indexed
function ymdDay(ymd: number)   { return ymd % 100; }
function ymdLabel(ymd: number) {
  return `${ymdMonth(ymd)+1}月${ymdDay(ymd)}日`;
}

function MoonCalendar({ year, month, startYMD, endYMD, onSelectStart, onSelectEnd,
  predictStartYMD, predictEndYMD }: {
  year:number; month:number;
  startYMD:number|null; endYMD:number|null;
  onSelectStart:(ymd:number)=>void; onSelectEnd:(ymd:number)=>void;
  predictStartYMD?:number|null; predictEndYMD?:number|null;
}) {
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const firstDow    = new Date(year, month, 1).getDay();
  const cells: (number|null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({length:daysInMonth}, (_,i) => i+1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const handleDay = (d: number) => {
    const ymd = toYMD(year, month, d);
    if (startYMD === null || (startYMD !== null && endYMD !== null)) {
      onSelectStart(ymd);
    } else {
      if (ymd < startYMD) onSelectStart(ymd);
      else onSelectEnd(ymd);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {["日","月","火","水","木","金","土"].map(d=>(
          <div key={d} className="text-center"
            style={{ fontSize:10, color:"#C4A898", fontWeight:600, paddingBottom:4 }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d,i) => {
          if (!d) return <div key={i}/>;
          const ymd    = toYMD(year, month, d);
          const active = (startYMD !== null && endYMD !== null && ymd >= startYMD && ymd <= endYMD)
                      || ymd === startYMD || ymd === endYMD;
          const isEdge = ymd === startYMD || ymd === endYMD;
          // 予測期間（薄いオレンジ・点線枠）
          const isPredicted = !active
            && predictStartYMD != null && predictEndYMD != null
            && ymd >= predictStartYMD && ymd <= predictEndYMD;
          const isPredictEdge = ymd === predictStartYMD || ymd === predictEndYMD;
          return (
            <button key={i} onClick={()=>handleDay(d)}
              className="flex items-center justify-center rounded-full transition-all duration-150 active:scale-90 mx-auto"
              style={{ width:32, height:32,
                backgroundColor: active ? "#C4B4E0" : isPredicted ? "rgba(255,176,100,0.18)" : "transparent",
                color:           active ? "#fff" : isPredicted ? "#C47840" : "#4A3728",
                fontWeight:      (isEdge || isPredictEdge) ? 700 : 400,
                fontSize:        13,
                outline:         isEdge ? "2px solid #8B7BA8"
                               : isPredictEdge ? "2px dashed #FFB085"
                               : isPredicted   ? "1px dashed #FFB085"
                               : "none",
                outlineOffset:   1 }}>
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 設定画面 ────────────────────────────────────────────
function SettingsScreen({ onBack, initialCoupleId, syncGoal, setSyncGoal,
  moonStart, setMoonStart, moonEnd, setMoonEnd,
  moonYear, moonMonth, setMoonYear, setMoonMonth,
  cycleDays, setCycleDays, periodDays, setPeriodDays, lastStartDate,
  onSave, saving, onMoonDateChange, onGoalChange, onCycleChange }: {
  onBack:()=>void;
  initialCoupleId:string;
  syncGoal:number; setSyncGoal:(n:number)=>void;
  moonStart:number|null; setMoonStart:(d:number|null)=>void;
  moonEnd:number|null;   setMoonEnd:(d:number|null)=>void;
  moonYear:number; moonMonth:number;
  setMoonYear:(n:number)=>void; setMoonMonth:(n:number)=>void;
  cycleDays:number; setCycleDays:(n:number)=>void;
  periodDays:number; setPeriodDays:(n:number)=>void;
  lastStartDate:string|null;
  onSave:(coupleId:string)=>void; saving:boolean;
  onMoonDateChange:(start:number|null, end:number|null)=>void;
  onGoalChange:(newGoal:number)=>void;
  onCycleChange:(cycle:number, period:number)=>void;
}) {
  const [localCoupleId, setLocalCoupleId] = useState(initialCoupleId);
  const cooldownDays = getCooldownDays(syncGoal);

  // ── 次回ムーンデイ予測計算 ──────────────────────────────
  // lastStartDate + cycleDays = 次回開始日
  // 次回開始日 + periodDays  = 次回終了日
  const { predictStartYMD, predictEndYMD } = (() => {
    if (!lastStartDate || !cycleDays || !periodDays) {
      return { predictStartYMD: null, predictEndYMD: null };
    }
    const base = new Date(lastStartDate);
    base.setHours(0, 0, 0, 0);
    const nextStart = new Date(base);
    nextStart.setDate(nextStart.getDate() + cycleDays);
    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + periodDays - 1);
    return {
      predictStartYMD: toYMD(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate()),
      predictEndYMD:   toYMD(nextEnd.getFullYear(),   nextEnd.getMonth(),   nextEnd.getDate()),
    };
  })();

  const predictLabel = predictStartYMD && predictEndYMD
    ? `次回予測：${ymdLabel(predictStartYMD)} 〜 ${ymdLabel(predictEndYMD)}`
    : null;
  const prevMonth = () => {
    if (moonMonth===0){ setMoonMonth(11); setMoonYear(moonYear-1); }
    else setMoonMonth(moonMonth-1);
  };
  const nextMonth = () => {
    if (moonMonth===11){ setMoonMonth(0); setMoonYear(moonYear+1); }
    else setMoonMonth(moonMonth+1);
  };

  // ラベルは YYYYMMDD から年月日を復元して表示
  const rangeLabel = moonStart
    ? moonEnd
      ? `${ymdLabel(moonStart)} 〜 ${ymdLabel(moonEnd)}`
      : `${ymdLabel(moonStart)} 〜 （終了日を選んでね）`
    : "期間を選んでね";

  // カレンダー操作ハンドラ（YYYYMMDD で保存）
  const handleSelectStart = (ymd: number) => {
    setMoonStart(ymd);
    setMoonEnd(null);
    // 年・月も calendar ナビゲーションの値で更新
    setMoonYear(ymdYear(ymd));
    setMoonMonth(ymdMonth(ymd));
    onMoonDateChange(ymd, null);
  };
  const handleSelectEnd = (ymd: number) => {
    setMoonEnd(ymd);
    onMoonDateChange(moonStart, ymd);
  };
  const handleReset = () => {
    setMoonStart(null);
    setMoonEnd(null);
    onMoonDateChange(null, null);
  };

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor:"#FFFBF5", color:"#4A3728" }}>
      <div className="flex items-center gap-3 px-4 py-5 sticky top-0 z-10"
        style={{ backgroundColor:"rgba(255,251,245,0.95)", borderBottom:"1px solid #FDEBD0", backdropFilter:"blur(8px)" }}>
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>←</button>
        <h1 className="font-bold text-base flex-1" style={{ color:"#8B4513" }}>設定・ふたりのルール</h1>
        <button onClick={()=>onSave(localCoupleId)} disabled={saving}
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

        {/* ムーンデイ */}
        <div className="rounded-3xl overflow-hidden" style={{ border:"1.5px solid #FDEBD0" }}>
          <div className="px-5 py-3.5" style={{ backgroundColor:"rgba(255,245,228,0.9)" }}>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize:16 }}>🌙</span>
              <p className="font-bold text-sm" style={{ color:"#B86540" }}>ムーンデイ（体調管理期間）</p>
            </div>
            <p style={{ fontSize:11, color:"#C4A898", marginTop:2 }}>
              期間を選ぶと自動でお休みモードになるよ
            </p>
          </div>
          <div className="px-4 py-4" style={{ backgroundColor:"rgba(255,255,255,0.80)" }}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>‹</button>
              <p className="font-bold text-sm" style={{ color:"#4A3728" }}>{moonYear}年 {MONTH_NAMES[moonMonth]}</p>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ backgroundColor:"#FFE0CC", color:"#B86540" }}>›</button>
            </div>
            <MoonCalendar year={moonYear} month={moonMonth}
              startYMD={moonStart} endYMD={moonEnd}
              onSelectStart={handleSelectStart}
              onSelectEnd={handleSelectEnd}
              predictStartYMD={predictStartYMD}
              predictEndYMD={predictEndYMD}/>
            {/* 凡例 */}
            <div className="flex items-center gap-3 mt-2 px-1">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor:"#C4B4E0" }}/>
                <span style={{ fontSize:10, color:"#8B7BA8" }}>選択済み</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor:"rgba(255,176,100,0.35)", border:"1px dashed #FFB085" }}/>
                <span style={{ fontSize:10, color:"#C47840" }}>次回予測</span>
              </div>
            </div>
            <div className="mt-3 px-4 py-3 rounded-2xl flex items-center justify-between gap-2"
              style={{ backgroundColor:moonStart?"rgba(196,180,224,0.2)":"rgba(253,235,208,0.5)", border:"1px solid #D4C4F0" }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize:14 }}>🌙</span>
                <p style={{ fontSize:11, color:"#8B7BA8" }}>{rangeLabel}</p>
              </div>
              {moonStart && (
                <button onClick={handleReset} style={{ fontSize:10, color:"#C4A898" }}>リセット</button>
              )}
            </div>
            {predictLabel && (
              <div className="mt-2 px-4 py-2.5 rounded-2xl flex items-center gap-2"
                style={{ backgroundColor:"rgba(255,176,100,0.12)", border:"1.5px dashed #FFB085" }}>
                <span style={{ fontSize:14 }}>🔮</span>
                <p style={{ fontSize:11, color:"#C47840", fontWeight:600 }}>{predictLabel}</p>
              </div>
            )}

            {/* 周期・期間の設定 */}
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-xs font-bold px-1" style={{ color:"#B86540" }}>予測のための設定</p>
              <div className="grid grid-cols-2 gap-3">
                {/* 生理周期 */}
                <div className="flex flex-col gap-1.5 px-3 py-3 rounded-2xl"
                  style={{ backgroundColor:"rgba(255,245,228,0.8)", border:"1px solid #FDEBD0" }}>
                  <p style={{ fontSize:10, color:"#B86540", fontWeight:600 }}>🔄 生理周期</p>
                  <div className="flex items-center justify-between">
                    <button onClick={()=>{ const v=Math.max(20,cycleDays-1); setCycleDays(v); onCycleChange(v, periodDays); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold active:scale-90"
                      style={{ backgroundColor:"#FFE0CC", color:"#B86540", fontSize:16 }}>−</button>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-bold" style={{ fontSize:22, color:"#D97B6C" }}>{cycleDays}</span>
                      <span style={{ fontSize:10, color:"#C4A898" }}>日</span>
                    </div>
                    <button onClick={()=>{ const v=Math.min(45,cycleDays+1); setCycleDays(v); onCycleChange(v, periodDays); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold active:scale-90"
                      style={{ backgroundColor:"#FFE0CC", color:"#B86540", fontSize:16 }}>＋</button>
                  </div>
                </div>
                {/* 生理期間 */}
                <div className="flex flex-col gap-1.5 px-3 py-3 rounded-2xl"
                  style={{ backgroundColor:"rgba(255,245,228,0.8)", border:"1px solid #FDEBD0" }}>
                  <p style={{ fontSize:10, color:"#B86540", fontWeight:600 }}>📅 生理期間</p>
                  <div className="flex items-center justify-between">
                    <button onClick={()=>{ const v=Math.max(2,periodDays-1); setPeriodDays(v); onCycleChange(cycleDays, v); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold active:scale-90"
                      style={{ backgroundColor:"#FFE0CC", color:"#B86540", fontSize:16 }}>−</button>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-bold" style={{ fontSize:22, color:"#D97B6C" }}>{periodDays}</span>
                      <span style={{ fontSize:10, color:"#C4A898" }}>日</span>
                    </div>
                    <button onClick={()=>{ const v=Math.min(10,periodDays+1); setPeriodDays(v); onCycleChange(cycleDays, v); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold active:scale-90"
                      style={{ backgroundColor:"#FFE0CC", color:"#B86540", fontSize:16 }}>＋</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-8"/>
      </div>
    </div>
  );
}

// ─── ローディング ────────────────────────────────────────
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
  const [moonStart, setMoonStart] = useState<number|null>(null);
  const [moonEnd,   setMoonEnd]   = useState<number|null>(null);
  const now = new Date();
  const [moonYear,  setMoonYear]  = useState(now.getFullYear());
  const [moonMonth, setMoonMonth] = useState(now.getMonth());
  // ── ムーンデイ予測用 ──────────────────────────────────────
  const [cycleDays,     setCycleDays]     = useState(28);
  const [periodDays,    setPeriodDays]    = useState(5);
  const [lastStartDate, setLastStartDate_moon] = useState<string|null>(null);

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

  // ── syncData から派生する値（★ 毎レンダーで再計算） ──────
  // myEmail で厳格に仕分け → ミラーリング不可能
  const myRow      = syncData.find(r => r.user_email === myEmail) ?? null;
  const partnerRow = syncData.find(r => r.user_email !== myEmail && r.user_email !== "") ?? null;

  const myKimochi: Kimochi = myRow?.kimochi_date?.substring(0,10) === today
    ? normalizeKimochi(myRow.kimochi) : null;
  const partnerKimochi: Kimochi = partnerRow?.kimochi_date?.substring(0,10) === today
    ? normalizeKimochi(partnerRow.kimochi) : null;

  // ── ★ カレンダーは「日付データがある方の行」を優先して表示 ──
  // 「キモチは別々、カレンダーは一緒」
  // 優先順位: 自分の行に月日データがあれば自分 → なければパートナーの行を使う
  const moonRow = (myRow?.moon_start != null ? myRow : null)
               ?? (partnerRow?.moon_start != null ? partnerRow : null);
  const activeMoonStart = moonStart;   // 設定UIの入力値（編集中）
  const activeMoonEnd   = moonEnd;
  const activeMoonYear  = moonYear;
  const activeMoonMonth = moonMonth;

  // isInMoonPeriod は syncData 由来の moonRow で判定
  // → パートナーが設定を変更した瞬間に自動反映される
  const todayDate  = now.getDate(), todayYear = now.getFullYear(), todayMonth = now.getMonth();
  // ★ YYYYMMDD で比較 → 月が違うのに同じ日番号でマッチする誤判定を防ぐ
  const todayYMD = toYMD(todayYear, todayMonth, todayDate); // month は 0-indexed を渡す
  const isInMoonPeriod = moonRow != null
    && moonRow.moon_start != null && moonRow.moon_end != null
    && todayYMD >= moonRow.moon_start
    && todayYMD <= moonRow.moon_end;

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
  // moonStart/End は設定UI の編集用 state として保持
  // 表示判定（isInMoonPeriod）は syncData の moonRow から派生させるため
  // ここでは自分の行の値をそのまま入力欄に反映するだけでよい
  const applyMySettings = useCallback((row: SyncRow, allRows?: SyncRow[]) => {
    setSyncGoal(row.sync_goal ?? 4);
    setLastSyncDate(row.last_sync_date ?? null);
    // ムーンデイ予測フィールド
    if (row.cycle_days  != null) setCycleDays(row.cycle_days);
    if (row.period_days != null) setPeriodDays(row.period_days);
    if (row.last_start_date != null) setLastStartDate_moon(row.last_start_date);

    // 自分の行に月データがあればそれを使用、なければパートナーの行を参照
    const moonSource = row.moon_start != null
      ? row
      : allRows?.find(r => r.user_email !== row.user_email && r.moon_start != null) ?? row;

    setMoonStart(moonSource.moon_start ?? null);
    setMoonEnd(moonSource.moon_end ?? null);
    if (moonSource.moon_year  != null) setMoonYear(moonSource.moon_year);
    if (moonSource.moon_month != null) setMoonMonth(moonSource.moon_month);
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
    if (myR) applyMySettings(myR, data as SyncRow[]);

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
      setLoading(true);
      loadAll(coupleId, myEmail).finally(() => setLoading(false));
    } else if (myEmail) {
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
          if (newRow.couple_id !== coupleId) return;

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
            // パートナーの行：moon データがあれば設定 state に反映
            if (newRow.moon_start != null) {
              setMoonStart(newRow.moon_start);
              setMoonEnd(newRow.moon_end ?? null);
              if (newRow.moon_year  != null) setMoonYear(newRow.moon_year);
              if (newRow.moon_month != null) setMoonMonth(newRow.moon_month);
            }
            // ★ パートナーの sync_goal が変わったら自分の画面にも反映
            if (newRow.sync_goal != null) {
              setSyncGoal(newRow.sync_goal);
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

  // ─── 6. キモチ選択ハンドラ ─────────────────────────────────
  const handleKimochiSelect = useCallback(async (val: Kimochi) => {
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
        if (val === "circle" && prevP === "circle") {
          setShowFireworks(true);
          const syncDate = todayStr;
          setLastSyncDate(syncDate);
          saveMyKimochi(val, syncDate);
        }
      }
      return current;
    });
  }, [saveMyKimochi, myEmail, pop]);

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

  // ─── 8. 設定保存 ──────────────────────────────────────────
  const handleSaveSettings = useCallback(async (newCoupleId: string) => {
    setSaving(true);
    setCoupleId(newCoupleId);
    localStorage.setItem("sync_couple_id", newCoupleId);
    if (newCoupleId && myEmail) {
      await supabase.from("sync_status").upsert({
        couple_id:  newCoupleId, user_email: myEmail,
        sync_goal:  syncGoal,
        moon_start: moonStart,  moon_end:   moonEnd,
        moon_year:  moonYear,   moon_month: moonMonth,
        updated_at: new Date().toISOString(),
      }, { onConflict: "couple_id,user_email" });
    }
    setSaving(false);
    pop("設定を保存したよ 💾");
    setScreen("home");
  }, [syncGoal, moonStart, moonEnd, moonYear, moonMonth, myEmail, pop]);

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

  // ─── 9b. 周期・期間の即時保存 ─────────────────────────────
  const handleCycleChange = useCallback(async (cycle: number, period: number) => {
    if (!coupleId || !myEmail) return;
    await supabase.from("sync_status").upsert({
      couple_id:   coupleId,
      user_email:  myEmail,
      cycle_days:  cycle,
      period_days: period,
      updated_at:  new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
  }, [coupleId, myEmail]);

  // ─── 9. ムーンデイ日程の即時保存（YYYYMMDD形式）─────────
  const handleMoonDateChange = useCallback(async (
    start: number|null, end: number|null
  ) => {
    if (!coupleId || !myEmail) return;
    const year  = start ? ymdYear(start)  : end ? ymdYear(end)  : moonYear;
    const month = start ? ymdMonth(start) : end ? ymdMonth(end) : moonMonth;
    // start が確定したら last_start_date も保存
    const lastStart = start
      ? `${ymdYear(start)}-${String(ymdMonth(start)+1).padStart(2,"0")}-${String(ymdDay(start)).padStart(2,"0")}`
      : null;
    if (lastStart) setLastStartDate_moon(lastStart);
    await supabase.from("sync_status").upsert({
      couple_id:       coupleId,
      user_email:      myEmail,
      moon_start:      start,
      moon_end:        end,
      moon_year:       year,
      moon_month:      month,
      ...(lastStart ? { last_start_date: lastStart } : {}),
      updated_at:      new Date().toISOString(),
    }, { onConflict: "couple_id,user_email" });
  }, [coupleId, myEmail, moonYear, moonMonth]);

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

  // ─── 画面分岐 ─────────────────────────────────────────────
  if (screen === "settings") {
    return (
      <SettingsScreen
        onBack={()=>setScreen("home")}
        initialCoupleId={coupleId}
        syncGoal={syncGoal}   setSyncGoal={setSyncGoal}
        moonStart={moonStart} setMoonStart={setMoonStart}
        moonEnd={moonEnd}     setMoonEnd={setMoonEnd}
        moonYear={moonYear}   moonMonth={moonMonth}
        setMoonYear={setMoonYear} setMoonMonth={setMoonMonth}
        cycleDays={cycleDays}   setCycleDays={setCycleDays}
        periodDays={periodDays} setPeriodDays={setPeriodDays}
        lastStartDate={lastStartDate}
        onSave={handleSaveSettings} saving={saving}
        onMoonDateChange={handleMoonDateChange}
        onGoalChange={handleGoalChange}
        onCycleChange={handleCycleChange}
      />
    );
  }

  if (loading) return <LoadingScreen />;
  if (!coupleId) return <NoCoupleIdScreen onGoSettings={()=>setScreen("settings")} />;

  return (
    <main className="min-h-dvh flex flex-col items-center" style={{ backgroundColor:"#FFFBF5", color:"#4A3728" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      <Toast msg={toast.msg} on={toast.on}/>
      {showFireworks && <Fireworks onDone={()=>setShowFireworks(false)}/>}

      <div className="w-full max-w-sm flex flex-col px-4 py-8 gap-5">

        {/* ヘッダー */}
        <header className="flex flex-col items-center gap-2">
          <div className="w-full flex items-center justify-between">
            <div className="w-9"/>
            <h1 className="text-2xl font-bold" style={{ color:"#8B4513" }}>Sync Weather</h1>
            <div className="flex items-center gap-2">
              <button onClick={()=>setScreen("settings")}
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-sm"
                style={{ backgroundColor:"rgba(255,255,255,0.85)", border:"1px solid #FDEBD0", fontSize:18 }}>⚙️</button>
              <form action={logout}>
                <button type="submit"
                  className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-sm text-xs font-bold"
                  style={{ backgroundColor:"rgba(255,255,255,0.85)", border:"1px solid #FDEBD0", color:"#C4A898" }}
                  title="ログアウト">出</button>
              </form>
            </div>
          </div>
          <p style={{ fontSize:10, color:"#C4A898" }}>ID: {coupleId}</p>
        </header>

        {/* 今月目標バッジ */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
          style={{ backgroundColor:"rgba(255,255,255,0.7)", border:"1px solid #FDEBD0" }}>
          <span style={{ fontSize:18 }}>🎯</span>
          <p className="text-xs" style={{ color:"#9A7B6A" }}>今月の目標：</p>
          <p className="text-sm font-bold" style={{ color:"#D97B6C" }}>{syncGoal} 回</p>
          <span style={{ fontSize:12, color:"#C4A898" }}>（Sync後 {cooldownDays}日お休み）</span>
          {isInMoonPeriod && (
            <><div className="flex-1"/>
              <span className="text-xs px-2 py-1 rounded-full font-semibold"
                style={{ backgroundColor:"rgba(196,180,224,0.3)", color:"#8B7BA8" }}>🌙 ムーンデイ中</span></>
          )}
        </div>

        <div className="h-px" style={{ backgroundColor:"#FDEBD0" }}/>

        {/* ── 完全2択分岐 ─────────────────────────────────────
            isInCooldown=true  → SyncSuccessCard のみ（ボタンなし）
            isInCooldown=false → キモチ確認フロー
        ───────────────────────────────────────────────────── */}
        {isInCooldown ? (

          <div className="flex flex-col gap-3">
            <div className="flex items-center px-1">
              <span style={{ fontSize:18, marginRight:6 }}>✨</span>
              <h2 className="text-sm font-bold" style={{ color:"#B86540" }}>
                {isSyncToday ? "Perfect Sync 達成！" : "ふたりの準備期間"}
              </h2>
            </div>
            <SyncSuccessCard
              isSyncToday={isSyncToday}
              remainingDays={remainingDays}
              totalDays={cooldownDays}
              lastSyncDate={lastSyncDate!}
              onReset={handleCooldownReset}/>
          </div>

        ) : (

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize:18 }}>🌅</span>
                <h2 className="text-sm font-bold" style={{ color:"#B86540" }}>17時のキモチ確認</h2>
              </div>
              {!is17 && (
                <button onClick={()=>{ setIs17(true); pop("17時になりました 🌅"); }}
                  className="px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform"
                  style={{ backgroundColor:"#FFE0CC", color:"#B86540", border:"1.5px solid #FFB085" }}>
                  🕔 17時にする
                </button>
              )}
              {is17 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor:"#FBE8E6", color:"#D97B6C" }}>🌅 17時です</span>
              )}
            </div>

            {isInMoonPeriod ? (
              <div className="rounded-3xl p-5 flex flex-col items-center gap-2 text-center"
                style={{ backgroundColor:"rgba(240,235,248,0.8)", border:"1.5px solid #D4C4F0" }}>
                <span style={{ fontSize:28 }}>🌙</span>
                <p className="font-semibold text-sm" style={{ color:"#8B7BA8" }}>ムーンデイ期間中</p>
                <p className="text-xs leading-relaxed" style={{ color:"#A898C0" }}>
                  現在は無理せず休む期間です。<br/>キモチ確認はお休みしています 💜
                </p>
              </div>

            ) : !is17 ? (
              <div className="rounded-3xl p-5 flex flex-col items-center gap-2 text-center"
                style={{ backgroundColor:"rgba(255,255,255,0.6)", border:"1.5px dashed #FFE0CC" }}>
                <span style={{ fontSize:28 }}>🕓</span>
                <p className="text-sm font-medium" style={{ color:"#C4A898" }}>17時になると確認エリアが開くよ</p>
                <p style={{ fontSize:11, color:"#D4C4A8" }}>テストボタンで確認できます</p>
              </div>

            ) : (
              <>
                <div className="rounded-3xl overflow-hidden"
                  style={{ border:"1.5px solid #FFE0CC", boxShadow:"0 4px 20px rgba(255,176,133,0.15)" }}>
                  <div className="px-4 py-4 flex flex-col gap-4"
                    style={{ backgroundColor:"rgba(255,255,255,0.75)" }}>
                    {/* ★ myEmail で仕分けた myRow の値を表示 */}
                    <KimochiRow
                      label="あなた" avatar="🌸"
                      selected={myKimochi}
                      onSelect={handleKimochiSelect}
                      disabled={false}
                    />
                    {/* ★ myEmail で仕分けた partnerRow の値を表示 */}
                    <KimochiRow
                      key={`partner-${partnerKimochi ?? "none"}`}
                      label="パートナー" avatar="🌿"
                      selected={partnerKimochi}
                      onSelect={()=>{}}
                      disabled={true}
                      note={partnerKimochi ? "✓ 選択済み" : "（待っているよ…）"}
                    />
                    {(!myKimochi || !partnerKimochi) && (
                      <p className="text-center text-xs pb-1" style={{ color:"#C4A898" }}>
                        {!myKimochi
                          ? "あなたのキモチを選んでね 🌸"
                          : "パートナーの選択を待っているよ… 🌿"}
                      </p>
                    )}
                  </div>
                </div>

                {showMatch && myKimochi && partnerKimochi && (
                  <MatchBanner me={myKimochi} partner={partnerKimochi} onClose={resetKimochi}/>
                )}
              </>
            )}
          </div>
        )}

        <div className="h-8"/>
      </div>
    </main>
  );
}
