"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email    = formData.get("email")    as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "メールアドレスかパスワードが違います 🌸" };
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const email    = formData.get("email")    as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    if (error.message.includes("already registered"))
      return { error: "このメールアドレスはすでに登録されています。" };
    return { error: "登録に失敗しました。もう一度お試しください。" };
  }
  return { success: "確認メールを送りました 💌 メールをチェックしてね。" };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}