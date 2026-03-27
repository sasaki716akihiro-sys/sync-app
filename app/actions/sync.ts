"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * Sync目標をカップル両行に書き込む（RLSバイパス）
 * ブラウザクライアントはパートナー行に書けないためサーバー側で実行。
 */
export async function updateSyncGoal(
  coupleId: string,
  myEmail: string,
  partnerEmail: string | null,
  newGoal: number
): Promise<{ ok: boolean; error?: string }> {
  if (!coupleId?.trim() || !myEmail) return { ok: false, error: "invalid args" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email !== myEmail) return { ok: false, error: "unauthorized" };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // フォールバック：自分の行だけ通常クライアントで更新
    const { error } = await supabase.from("sync_status").upsert(
      { couple_id: coupleId, user_email: myEmail, sync_goal: newGoal, updated_at: new Date().toISOString() },
      { onConflict: "couple_id,user_email" }
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const rows = [
    { couple_id: coupleId, user_email: myEmail,      sync_goal: newGoal, updated_at: new Date().toISOString() },
    ...(partnerEmail ? [{ couple_id: coupleId, user_email: partnerEmail, sync_goal: newGoal, updated_at: new Date().toISOString() }] : []),
  ];

  const { error } = await admin
    .from("sync_status")
    .upsert(rows, { onConflict: "couple_id,user_email" });

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * パートナーの生理期間を書き込む（RLSバイパス）
 * 自分以外の行に書くためサーバー側で実行。
 */
export async function updatePartnerPeriod(
  coupleId: string,
  myEmail: string,
  partnerEmail: string,
  moonStart: number | null,
  moonEnd: number | null,
  periodHistory: { start: string; end: string; created_at?: string }[] | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!coupleId?.trim() || !myEmail || !partnerEmail) return { ok: false, error: "invalid args" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email !== myEmail) return { ok: false, error: "unauthorized" };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY が未設定" };
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const payload: Record<string, unknown> = {
    couple_id:  coupleId,
    user_email: partnerEmail,
    moon_start: moonStart,
    moon_end:   moonEnd,
    updated_at: new Date().toISOString(),
  };
  if (periodHistory !== undefined) payload.period_history = periodHistory;

  const { error } = await admin
    .from("sync_status")
    .upsert(payload, { onConflict: "couple_id,user_email" });

  return error ? { ok: false, error: error.message } : { ok: true };
}

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
