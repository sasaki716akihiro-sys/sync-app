"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// ── ログイン ───────────────────────────────────────────
// redirect() は useTransition 内で呼ぶと無音で止まるため
// 成功時は { success: true } を返してクライアント側でルーティングする
export async function login(formData: FormData) {
  const supabase = await createClient();

  const email    = formData.get("email")    as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("[Auth] login error:", error.message);
    if (error.message.includes("Invalid login credentials")) {
      return { error: "メールアドレスかパスワードが違います 🌸" };
    }
    return { error: `ログインに失敗しました: ${error.message}` };
  }

  // ✅ redirect() を使わずに成功を返す → クライアント側で router.push("/")
  return { success: true as const };
}

// ── 新規登録 ───────────────────────────────────────────
export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email    = formData.get("email")    as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    console.error("[Auth] signup error:", error.message);
    if (error.message.includes("already registered")) {
      return { error: "このメールアドレスはすでに登録されています。" };
    }
    return { error: `登録に失敗しました: ${error.message}` };
  }

  return { success: false as const, message: "確認メールを送りました 💌 メールをチェックしてね。" };
}

// ── ログアウト ─────────────────────────────────────────
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}