// components/SyncDashboard.tsx
"use client";

import { useState, useRef } from "react";

// ─── 型定義 ────────────────────────────────────────────────

type Mood = {
  emoji: string;
  label: string;
  accent: string;  // テキスト・ボーダー色
  bg: string;      // 背景色
};

type User = {
  name: string;
  avatar: string;
  mood: Mood;
  status: string;
  lastSeen: string;
};

// ─── 定数データ ────────────────────────────────────────────

const MOODS: Mood[] = [
  { emoji: "😊", label: "うれしい",   accent: "#E8835A", bg: "#FFF0E8" },
  { emoji: "😌", label: "おだやか",   accent: "#7AAD72", bg: "#EDF6EB" },
  { emoji: "🥰", label: "あいしてる", accent: "#D97B6C", bg: "#FBE8E6" },
  { emoji: "😴", label: "つかれた",   accent: "#8B7BA8", bg: "#F0EBF8" },
  { emoji: "🤔", label: "かんがえ中", accent: "#B8943A", bg: "#FBF3E0" },
  { emoji: "😢", label: "さみしい",   accent: "#6A9CC4", bg: "#E7F2FB" },
  { emoji: "🔥", label: "げんき！",   accent: "#D4533A", bg: "#FCE8E5" },
  { emoji: "🌿", label: "のんびり",   accent: "#5A9E7A", bg: "#E5F5EE" },
];

const STATUS_OPTIONS = [
  "おはよう ☀️",
  "コーヒータイム ☕",
  "仕事中 💻",
  "お昼ごはん 🍱",
  "休憩中 🛋️",
  "外出中 🚶",
  "帰宅したよ 🏠",
  "おやすみ 🌙",
];

const INITIAL_ME: User = {
  name: "あなた",
  avatar: "🌸",
  mood: MOODS[0],
  status: "おはよう ☀️",
  lastSeen: "たった今",
};

const INITIAL_PARTNER: User = {
  name: "パートナー",
  avatar: "🌿",
  mood: MOODS[1],
  status: "コーヒータイム ☕",
  lastSeen: "3分前",
};

// ─── RippleButton ─────────────────────────────────────────

function RippleButton({
  onClick,
  children,
  className = "",
  style,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [ripples, setRipples] = useState<number[]>([]);
  const ref = useRef(0);

  const handleClick = () => {
    const id = ref.current++;
    setRipples((r) => [...r, id]);
    setTimeout(() => setRipples((r) => r.filter((x) => x !== id)), 700);
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {ripples.map((id) => (
        <span
          key={id}
          className="absolute inset-0 m-auto w-4 h-4 rounded-full animate-ripple"
          style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
        />
      ))}
      {children}
    </button>
  );
}

// ─── Toast ────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(-12px)",
      }}
    >
      <div
        className="text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg whitespace-nowrap"
        style={{ backgroundColor: "var(--terra-400)", color: "#FFFBF5" }}
      >
        {message}
      </div>
    </div>
  );
}

// ─── MoodPicker ───────────────────────────────────────────

function MoodPicker({
  current,
  onSelect,
  onClose,
}: {
  current: Mood;
  onSelect: (m: Mood) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(139,69,19,0.18)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-sm rounded-t-3xl p-6 pb-10 shadow-2xl animate-fadeUp"
        style={{ backgroundColor: "var(--bg-main)" }}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ backgroundColor: "var(--peach-100)" }}
        />
        <h3
          className="text-center font-semibold mb-5 text-base"
          style={{ fontFamily: "var(--font-lora, serif)", color: "var(--terra-400)" }}
        >
          いまのきもちは？
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {MOODS.map((m) => (
            <button
              key={m.label}
              onClick={() => { onSelect(m); onClose(); }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all duration-150 active:scale-90"
              style={{
                backgroundColor: m.bg,
                outline: m.label === current.label ? `2px solid ${m.accent}` : "none",
              }}
            >
              <span className="text-2xl">{m.emoji}</span>
              <span
                className="text-center leading-tight"
                style={{ fontSize: "10px", fontWeight: 600, color: m.accent }}
              >
                {m.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── StatusPicker ─────────────────────────────────────────

function StatusPicker({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (s: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(139,69,19,0.18)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-sm rounded-t-3xl p-6 pb-10 shadow-2xl animate-fadeUp"
        style={{ backgroundColor: "var(--bg-main)" }}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ backgroundColor: "var(--peach-100)" }}
        />
        <h3
          className="text-center font-semibold mb-4 text-base"
          style={{ fontFamily: "var(--font-lora, serif)", color: "var(--terra-400)" }}
        >
          ステータスを変える
        </h3>
        <div className="flex flex-col gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { onSelect(s); onClose(); }}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-150 active:scale-95"
              style={{
                backgroundColor: s === current ? "var(--peach-100)" : "rgba(255,255,255,0.7)",
                color: s === current ? "var(--terra-400)" : "var(--text-sub)",
                fontWeight: s === current ? 700 : 500,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── UserCard ─────────────────────────────────────────────

function UserCard({
  user,
  isMe,
  onMoodTap,
}: {
  user: User;
  isMe: boolean;
  onMoodTap?: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 p-4 rounded-3xl transition-all duration-300"
      style={{
        backgroundColor: isMe ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.65)",
        border: `1.5px solid ${isMe ? "var(--peach-100)" : "var(--border)"}`,
        boxShadow: isMe ? "0 4px 20px rgba(255,176,133,0.25)" : "0 2px 10px rgba(212,132,90,0.10)",
      }}
    >
      {/* Avatar */}
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${isMe ? "animate-float" : ""}`}
        style={{ backgroundColor: user.mood.bg }}
      >
        {user.avatar}
      </div>

      {/* 名前 */}
      <p
        className="text-sm font-semibold tracking-wide"
        style={{ fontFamily: "var(--font-lora, serif)", color: "var(--terra-400)" }}
      >
        {user.name}
      </p>

      {/* 気分チップ */}
      <button
        onClick={isMe ? onMoodTap : undefined}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95"
        style={{
          backgroundColor: user.mood.bg,
          color: user.mood.accent,
          border: `1.5px solid ${user.mood.accent}40`,
          cursor: isMe ? "pointer" : "default",
        }}
      >
        <span className="text-base leading-none">{user.mood.emoji}</span>
        <span>{user.mood.label}</span>
        {isMe && <span style={{ fontSize: 10, opacity: 0.5 }}>▼</span>}
      </button>

      {/* ステータス */}
      <p className="text-xs font-medium" style={{ color: "var(--text-sub)" }}>
        {user.status}
      </p>

      {/* 最終確認 */}
      <p style={{ fontSize: 10, color: "var(--text-muted)" }}>
        {user.lastSeen}
      </p>
    </div>
  );
}

// ─── メイン ───────────────────────────────────────────────

export default function SyncDashboard() {
  const [me, setMe] = useState<User>(INITIAL_ME);
  const [partner] = useState<User>(INITIAL_PARTNER);

  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [thanksSent, setThanksSent] = useState(0);
  const [heartKey, setHeartKey] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: "" });

  const showToast = (msg: string) => {
    setToast({ visible: true, message: msg });
    setTimeout(() => setToast({ visible: false, message: "" }), 2200);
  };

  const handleThanks = () => {
    setThanksSent((n) => n + 1);
    setHeartKey((n) => n + 1);
    showToast("ありがとうを送ったよ 💌");
  };

  const handleMoodSelect = (mood: Mood) => {
    setMe((prev) => ({ ...prev, mood, lastSeen: "たった今" }));
    showToast(`気分を「${mood.label}」に更新したよ`);
  };

  const handleStatusSelect = (status: string) => {
    setMe((prev) => ({ ...prev, status, lastSeen: "たった今" }));
    showToast("ステータスを更新したよ ✨");
  };

  const syncLevel = Math.min(100, 55 + thanksSent * 9);

  const fadeCard = {
    opacity: 0,
    animationFillMode: "forwards" as const,
  };

  return (
    <>
      <Toast message={toast.message} visible={toast.visible} />

      {showMoodPicker && (
        <MoodPicker
          current={me.mood}
          onSelect={handleMoodSelect}
          onClose={() => setShowMoodPicker(false)}
        />
      )}
      {showStatusPicker && (
        <StatusPicker
          current={me.status}
          onSelect={handleStatusSelect}
          onClose={() => setShowStatusPicker(false)}
        />
      )}

      <div className="w-full max-w-sm min-h-dvh flex flex-col px-4 py-8 gap-5">

        {/* ── ヘッダー ── */}
        <header
          className="flex items-center justify-between animate-fadeUp anim-delay-100"
          style={fadeCard}
        >
          <div>
            <p
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Today
            </p>
            <h1
              className="text-2xl font-bold leading-tight"
              style={{ fontFamily: "var(--font-lora, serif)", color: "var(--terra-500)" }}
            >
              Sync
            </h1>
          </div>

          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              backgroundColor: "rgba(255,255,255,0.75)",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--sage-300)", animation: "pulse 2s infinite" }}
            />
            <span className="text-xs font-semibold" style={{ color: "var(--text-sub)" }}>
              つながってる
            </span>
          </div>
        </header>

        {/* ── Sync レベル ── */}
        <div
          className="rounded-3xl p-5 animate-fadeUp anim-delay-200"
          style={{
            ...fadeCard,
            backgroundColor: "rgba(255,255,255,0.75)",
            border: "1.5px solid var(--border)",
            boxShadow: "0 2px 12px rgba(212,132,90,0.08)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-bold tracking-wide uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Sync レベル
            </span>
            <span className="text-sm font-bold" style={{ color: "var(--terra-400)" }}>
              {syncLevel}%
            </span>
          </div>
          <div
            className="h-2.5 rounded-full overflow-hidden"
            style={{ backgroundColor: "#FDEBD0" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${syncLevel}%`,
                background: "linear-gradient(90deg, #FFB085, #D4845A)",
              }}
            />
          </div>
          <p
            className="text-center mt-2"
            style={{ fontSize: 10, color: "var(--text-muted)" }}
          >
            ありがとうを送るとレベルが上がるよ 💛
          </p>
        </div>

        {/* ── ユーザーカード ── */}
        <div
          className="grid grid-cols-2 gap-3 animate-fadeUp anim-delay-300"
          style={fadeCard}
        >
          <UserCard user={me} isMe onMoodTap={() => setShowMoodPicker(true)} />
          <UserCard user={partner} isMe={false} />
        </div>

        {/* ── アクション ── */}
        <div
          className="flex flex-col gap-3 animate-fadeUp anim-delay-400"
          style={fadeCard}
        >
          {/* ありがとうボタン */}
          <div className="relative">
            {heartKey > 0 && (
              <span
                key={heartKey}
                className="absolute -top-3 -right-3 text-xl animate-pop pointer-events-none z-10"
                style={{ animationFillMode: "forwards" }}
              >
                ❤️
              </span>
            )}
            <RippleButton
              onClick={handleThanks}
              className="w-full py-4 rounded-3xl font-bold text-base text-white active:scale-95 transition-transform duration-150"
              style={{
                background: "linear-gradient(135deg, #F0A899 0%, #D97B6C 100%)",
                boxShadow: "0 6px 20px rgba(217,123,108,0.30)",
              }}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl animate-heartbeat">💌</span>
                ありがとうを送る
                {thanksSent > 0 && (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
                  >
                    ×{thanksSent}
                  </span>
                )}
              </span>
            </RippleButton>
          </div>

          {/* 気分 & ステータス */}
          <div className="grid grid-cols-2 gap-3">
            <RippleButton
              onClick={() => setShowMoodPicker(true)}
              className="py-3.5 rounded-2xl font-semibold text-sm active:scale-95 transition-transform duration-150"
              style={{
                backgroundColor: me.mood.bg,
                color: me.mood.accent,
                border: `1.5px solid ${me.mood.accent}30`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              <span className="flex flex-col items-center gap-1">
                <span className="text-xl">{me.mood.emoji}</span>
                <span style={{ fontSize: 11 }}>気分を変える</span>
              </span>
            </RippleButton>

            <RippleButton
              onClick={() => setShowStatusPicker(true)}
              className="py-3.5 rounded-2xl font-semibold text-sm active:scale-95 transition-transform duration-150"
              style={{
                backgroundColor: "rgba(255,255,255,0.85)",
                color: "var(--text-sub)",
                border: "1.5px solid var(--border)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              <span className="flex flex-col items-center gap-1">
                <span className="text-xl">📍</span>
                <span style={{ fontSize: 11 }}>ステータス変更</span>
              </span>
            </RippleButton>
          </div>
        </div>

        {/* ── 最近のできごと ── */}
        <div
          className="animate-fadeUp anim-delay-500"
          style={fadeCard}
        >
          <h2
            className="text-sm font-semibold mb-3 px-1"
            style={{ fontFamily: "var(--font-lora, serif)", color: "var(--text-sub)" }}
          >
            最近のできごと
          </h2>
          <div className="flex flex-col gap-2">
            {[
              { icon: "💌", text: `${partner.name}がありがとうを送ってくれた`, time: "10分前", bg: "#FBE8E6" },
              { icon: "😌", text: `${partner.name}の気分が「おだやか」になった`, time: "32分前", bg: "#EDF6EB" },
              { icon: "📍", text: `${partner.name}が「コーヒータイム」に`, time: "1時間前", bg: "#FFF0E8" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-2xl"
                style={{
                  backgroundColor: "rgba(255,255,255,0.65)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: item.bg }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium leading-snug"
                    style={{ color: "var(--text-main)" }}
                  >
                    {item.text}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    {item.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="h-4" />
      </div>
    </>
  );
}
```

---

## ✅ チェックリスト（貼り付け後に確認）
```
□ tailwind.config.ts の content に "./app/**" と "./components/**" が両方ある
□ app/globals.css の1〜3行目が @tailwind base / components / utilities
□ app/layout.tsx で import "./globals.css" している
□ npm run dev を再起動した（設定ファイル変更後は再起動必須）