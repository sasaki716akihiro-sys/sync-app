"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login as loginAction, signup as signupAction } from "@/app/auth/actions";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode,    setMode]    = useState<Mode>("login");
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        if (mode === "login") {
          const result = await loginAction(formData);

          // エラーの場合
          if ("error" in result && result.error) {
            console.error("[LoginPage] login failed:", result.error);
            setError(result.error);
            return;
          }

          // 成功：クライアント側でトップへ遷移
          if ("success" in result && result.success === true) {
            console.log("[LoginPage] login success → /");
            router.push("/");
            router.refresh();
            return;
          }

        } else {
          const result = await signupAction(formData);

          // エラーの場合
          if ("error" in result && result.error) {
            console.error("[LoginPage] signup failed:", result.error);
            setError(result.error);
            return;
          }

          // 成功：確認メール送信済み
          if ("message" in result) {
            setSuccess(result.message);
            return;
          }
        }

      } catch (err) {
        // 予期しない例外
        console.error("[LoginPage] unexpected error:", err);
        setError("予期しないエラーが発生しました。もう一度お試しください。");
      }
    });
  };

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "#FFFBF5" }}
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.5s ease-out both; }
      `}</style>

      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* ロゴ */}
        <div className="fade-up flex flex-col items-center gap-1 mb-2">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1"
            style={{ background: "linear-gradient(135deg,#FFE0CC,#FBE8E6)" }}
          >
            💛
          </div>
          <h1 className="text-3xl font-bold" style={{ color:"#8B4513" }}>Sync Weather</h1>
          <p className="text-sm" style={{ color:"#C4A898" }}>ふたりのきもちをつなげよう 🌤️</p>
        </div>

        {/* カード */}
        <div
          className="fade-up rounded-3xl overflow-hidden"
          style={{
            animationDelay: "80ms",
            backgroundColor: "rgba(255,255,255,0.85)",
            border: "1.5px solid #FDEBD0",
            boxShadow: "0 8px 32px rgba(255,176,133,0.18)",
          }}
        >
          {/* タブ */}
          <div className="grid grid-cols-2" style={{ borderBottom:"1.5px solid #FDEBD0" }}>
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="py-3.5 text-sm font-bold transition-all duration-200"
              style={{
                color:           mode === "login" ? "#B86540" : "#C4A898",
                backgroundColor: mode === "login" ? "rgba(255,224,204,0.45)" : "transparent",
                borderBottom:    mode === "login" ? "2px solid #D97B6C" : "2px solid transparent",
              }}
            >
              ログイン
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className="py-3.5 text-sm font-bold transition-all duration-200"
              style={{
                color:           mode === "signup" ? "#B86540" : "#C4A898",
                backgroundColor: mode === "signup" ? "rgba(255,224,204,0.45)" : "transparent",
                borderBottom:    mode === "signup" ? "2px solid #D97B6C" : "2px solid transparent",
              }}
            >
              新規登録
            </button>
          </div>

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-6">

            {/* メールアドレス */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold" style={{ color: "#B86540" }}>
                メールアドレス
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="hello@example.com"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all duration-200"
                style={{ backgroundColor: "#FFF5E4", border: "1.5px solid #FDEBD0", color: "#4A3728" }}
                onFocus={(e) => (e.currentTarget.style.border = "1.5px solid #D97B6C")}
                onBlur={(e)  => (e.currentTarget.style.border = "1.5px solid #FDEBD0")}
              />
            </div>

            {/* パスワード */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold" style={{ color: "#B86540" }}>
                パスワード
              </label>
              <input
                type="password"
                name="password"
                required
                minLength={6}
                placeholder="6文字以上"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all duration-200"
                style={{ backgroundColor: "#FFF5E4", border: "1.5px solid #FDEBD0", color: "#4A3728" }}
                onFocus={(e) => (e.currentTarget.style.border = "1.5px solid #D97B6C")}
                onBlur={(e)  => (e.currentTarget.style.border = "1.5px solid #FDEBD0")}
              />
            </div>

            {/* エラー */}
            {error && (
              <div
                className="px-4 py-3 rounded-2xl text-sm"
                style={{ backgroundColor: "#FCE8E5", color: "#D4533A", border: "1px solid #F0A898" }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* 成功 */}
            {success && (
              <div
                className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={{ backgroundColor: "#EDF6EB", color: "#5A9E7A", border: "1px solid #A8C9A0" }}
              >
                ✅ {success}
              </div>
            )}

            {/* ローディング中の補足 */}
            {isPending && (
              <p className="text-center text-xs" style={{ color: "#C4A898" }}>
                処理中です。しばらくお待ちください…
              </p>
            )}

            {/* 送信ボタン */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full py-4 rounded-2xl font-bold text-base text-white transition-all duration-150 active:scale-95"
              style={{
                background: isPending
                  ? "linear-gradient(135deg,#F5C4A8,#E8A882)"
                  : "linear-gradient(135deg,#F0A899,#D97B6C)",
                boxShadow: isPending ? "none" : "0 4px 16px rgba(217,123,108,0.30)",
                cursor: isPending ? "not-allowed" : "pointer",
              }}
            >
              {isPending
                ? "処理中..."
                : mode === "login"
                ? "ログイン 🌸"
                : "アカウントを作成 💌"}
            </button>
          </form>
        </div>

        {/* フッター */}
        <p
          className="fade-up text-center text-xs"
          style={{ animationDelay: "160ms", color: "#D4C4A8" }}
        >
          ふたりの大切な情報は安全に守られます 🔒
        </p>
      </div>
    </main>
  );
}
