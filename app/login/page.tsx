"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router   = useRouter();
  const [mode,    setMode]    = useState<Mode>("login");
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email    = formData.get("email")    as string;
    const password = formData.get("password") as string;

    try {
      const supabase = createClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError("メールアドレスかパスワードが違います 🌸");
          return;
        }
        router.push("/");
        router.refresh();

      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          if (error.message.includes("already registered")) {
            setError("このメールアドレスはすでに登録されています。ログインタブからお試しください。");
          } else {
            setError(`登録に失敗しました: ${error.message}`);
          }
          return;
        }
        if (data.session) {
          // メール確認不要の設定：そのままログイン済みになる
          router.push("/");
          router.refresh();
        } else if ((data.user?.identities ?? []).length === 0) {
          // Supabase のユーザー列挙防止：すでに登録済みのアドレスでも成功を返す
          setError("このメールアドレスはすでに登録されています。ログインタブからお試しください。");
        } else {
          // メール確認が必要な設定：確認リンクをメールで送信済み
          setSuccess("確認メールを送りました 💌 届いたメールのリンクをクリックすると登録完了です。");
        }
      }

    } catch (err) {
      console.error("[LoginPage] unexpected error:", err);
      setError("予期しないエラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
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

        <div className="fade-up flex flex-col items-center gap-1 mb-2">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1"
            style={{ background: "linear-gradient(135deg,#FFE0CC,#FBE8E6)" }}
          >
            💛
          </div>
          <h1 className="text-3xl font-bold" style={{ color:"#8B4513" }}>Sync Couple</h1>
          <p className="text-sm" style={{ color:"#C4A898" }}>ふたりのきもちをつなげよう 🌤️</p>
        </div>

        <div
          className="fade-up rounded-3xl overflow-hidden"
          style={{
            animationDelay: "80ms",
            backgroundColor: "rgba(255,255,255,0.85)",
            border: "1.5px solid #FDEBD0",
            boxShadow: "0 8px 32px rgba(255,176,133,0.18)",
          }}
        >
          <div className="grid grid-cols-2" style={{ borderBottom:"1.5px solid #FDEBD0" }}>
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="py-3.5 text-sm font-bold"
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
              className="py-3.5 text-sm font-bold"
              style={{
                color:           mode === "signup" ? "#B86540" : "#C4A898",
                backgroundColor: mode === "signup" ? "rgba(255,224,204,0.45)" : "transparent",
                borderBottom:    mode === "signup" ? "2px solid #D97B6C" : "2px solid transparent",
              }}
            >
              新規登録
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-6">

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold" style={{ color: "#B86540" }}>
                メールアドレス
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="hello@example.com"
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
                style={{ backgroundColor: "#FFF5E4", border: "1.5px solid #FDEBD0", color: "#4A3728" }}
                onFocus={(e) => (e.currentTarget.style.border = "1.5px solid #D97B6C")}
                onBlur={(e)  => (e.currentTarget.style.border = "1.5px solid #FDEBD0")}
              />
            </div>

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
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
                style={{ backgroundColor: "#FFF5E4", border: "1.5px solid #FDEBD0", color: "#4A3728" }}
                onFocus={(e) => (e.currentTarget.style.border = "1.5px solid #D97B6C")}
                onBlur={(e)  => (e.currentTarget.style.border = "1.5px solid #FDEBD0")}
              />
            </div>

            {error && (
              <div
                className="px-4 py-3 rounded-2xl text-sm"
                style={{ backgroundColor: "#FCE8E5", color: "#D4533A", border: "1px solid #F0A898" }}
              >
                ⚠️ {error}
              </div>
            )}

            {success && (
              <div
                className="px-4 py-3 rounded-2xl text-sm"
                style={{ backgroundColor: "#EDF6EB", color: "#5A9E7A", border: "1px solid #A8C9A0" }}
              >
                ✅ {success}
              </div>
            )}

            {loading && (
              <p className="text-center text-xs" style={{ color: "#C4A898" }}>
                処理中です。しばらくお待ちください…
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base text-white"
              style={{
                background: loading
                  ? "linear-gradient(135deg,#F5C4A8,#E8A882)"
                  : "linear-gradient(135deg,#F0A899,#D97B6C)",
                boxShadow: loading ? "none" : "0 4px 16px rgba(217,123,108,0.30)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading
                ? "処理中..."
                : mode === "login"
                ? "ログイン 🌸"
                : "アカウントを作成 💌"}
            </button>

            {mode === "signup" && (
              <p className="text-center text-xs leading-relaxed" style={{ color: "#C4A898" }}>
                アカウントを作成することで、
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#D97B6C" }}>利用規約</a>
                および
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#D97B6C" }}>プライバシーポリシー</a>
                に同意したものとみなします。
              </p>
            )}
          </form>
        </div>

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
