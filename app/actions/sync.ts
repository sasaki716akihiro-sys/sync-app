"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * サービスロールキーを使ってRLSをバイパスし、
 * 同じcouple_idを持つすべての行を返す。
 *
 * RLSが "SELECT: user_email = auth.email()" のような
 * 自分の行しか読めないポリシーの場合でも、
 * パートナーの行を確実に取得できる。
 *
 * セキュリティ: 呼び出しにはSupabaseの有効なセッションが必要。
 */
export async function fetchCoupleRows(
  coupleId: string
): Promise<Record<string, unknown>[] | null> {
  if (!coupleId?.trim()) return null;

  // 認証チェック（未認証ユーザーからの呼び出しを拒否）
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  // サービスロールキーが未設定の場合はスキップ（フォールバック：クライアント側クエリ）
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[Sync Server] SUPABASE_SERVICE_ROLE_KEY が未設定。" +
        "Vercel環境変数に追加するとRLSをバイパスできます。"
    );
    return null;
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient
    .from("sync_status")
    .select("*")
    .eq("couple_id", coupleId.trim());

  if (error) {
    console.error("[Sync Server] fetchCoupleRows error:", error.message);
    return null;
  }

  console.log(
    "[Sync Server] fetchCoupleRows:",
    data?.length ?? 0,
    "行取得 coupleId=",
    coupleId.trim(),
    "呼び出し元=",
    user.email
  );
  return data;
}
