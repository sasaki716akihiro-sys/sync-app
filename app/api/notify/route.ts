import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import webpush from "web-push";

const VAPID_PUBLIC_KEY  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT ?? "mailto:example@example.com";

export async function POST(req: NextRequest) {
  // 認証チェック
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!VAPID_PRIVATE_KEY) {
    console.error("[Push] VAPID_PRIVATE_KEY が未設定");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[Push] SUPABASE_SERVICE_ROLE_KEY が未設定");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { coupleId } = body as { coupleId?: string };
  if (!coupleId?.trim()) {
    return NextResponse.json({ error: "missing coupleId" }, { status: 400 });
  }

  // 自分がそのcouple_idに属するか確認（RLS経由で検証）
  const { data: membership } = await supabase
    .from("sync_status")
    .select("couple_id")
    .eq("couple_id", coupleId.trim())
    .eq("user_email", user.email)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  // パートナーの push_subscription を admin クライアントで取得
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: rows } = await admin
    .from("sync_status")
    .select("user_email, push_subscription")
    .eq("couple_id", coupleId.trim());

  const partnerRow = rows?.find(r => r.user_email !== user.email);
  if (!partnerRow?.push_subscription) {
    return NextResponse.json({ ok: true, skipped: "no partner subscription" });
  }

  // Web Push 送信
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification(
      partnerRow.push_subscription as webpush.PushSubscription,
      JSON.stringify({
        title: "ふたりのきもち",
        body: "パートナーがキモチを更新したよ 🌸",
      })
    );
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    // 410 Gone / 404: サブスクリプションが失効 → DBをクリア
    if (err.statusCode === 410 || err.statusCode === 404) {
      await admin
        .from("sync_status")
        .update({ push_subscription: null })
        .eq("couple_id", coupleId.trim())
        .eq("user_email", partnerRow.user_email);
      return NextResponse.json({ ok: true, skipped: "subscription expired, cleared" });
    }
    console.error("[Push] sendNotification failed:", err.message);
    return NextResponse.json({ error: "push failed" }, { status: 500 });
  }
}
