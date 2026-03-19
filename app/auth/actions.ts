"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type ActionResult =
  | { status: "error";   message: string }
  | { status: "success"; message?: string };

// ── ログイン ───────────────────────────────────────────
export async function login(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();

  const email    = formData.get("email")    as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { status: "error", message: "メールアドレスとパスワードを入力してください。" };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("[Auth] login error:", error.message);
    if (error.message.includes("Invalid login credentials")) {
      return { status: "error", message: "メールアドレスかパスワードが違います 🌸" };
    }
    return { status: "error", message: `ログインに失敗しました: ${error.message}` };
  }

  return { status: "success" };
}

// ── 新規登録 ───────────────────────────────────────────
export async function signup(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();

  const email    = formData.get("email")    as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { status: "error", message: "メールアドレスとパスワードを入力してください。" };
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
      return { status: "error", message: "このメールアドレスはすでに登録されています。" };
    }
    return { status: "error", message: `登録に失敗しました: ${error.message}` };
  }

  return { status: "success", message: "確認メールを送りました 💌 メールをチェックしてね。" };
}

// ── ログアウト ─────────────────────────────────────────
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}