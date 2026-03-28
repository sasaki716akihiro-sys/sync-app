// Supabase Edge Function: send-push
// sync_statusのkimochi更新をDBウェブフックで受け取り、
// パートナーのデバイスにWeb Push通知を送る

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(
  "mailto:noreply@sync-couple.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

Deno.serve(async (req) => {
  try {
    const body = await req.json();

    // DBウェブフックのペイロード形式: { type, table, record, old_record }
    const record = body?.record;
    if (!record?.couple_id || !record?.user_email) {
      return new Response("invalid payload", { status: 400 });
    }

    // kimochi が null または未入力の場合はスキップ
    if (!record.kimochi) {
      return new Response("no kimochi", { status: 200 });
    }

    // kimochi_date が今日でない場合はスキップ（古いデータの更新を無視）
    const today = new Date().toISOString().slice(0, 10); // UTC基準で近似
    const kimochiDate = (record.kimochi_date ?? "").slice(0, 10);
    if (kimochiDate !== today) {
      return new Response("not today", { status: 200 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // パートナーの行を取得
    const { data: partnerRows, error } = await admin
      .from("sync_status")
      .select("push_subscription, kimochi, kimochi_date")
      .eq("couple_id", record.couple_id)
      .neq("user_email", record.user_email);

    if (error || !partnerRows?.length) {
      return new Response("partner not found", { status: 200 });
    }

    const partner = partnerRows[0];

    // パートナーが通知登録していない場合はスキップ
    if (!partner.push_subscription) {
      return new Response("no subscription", { status: 200 });
    }

    // パートナーがすでに今日キモチを入力済みの場合は通知しない
    const partnerDate = (partner.kimochi_date ?? "").slice(0, 10);
    if (partnerDate === kimochiDate && partner.kimochi) {
      return new Response("partner already entered", { status: 200 });
    }

    // Web Push 送信
    await webpush.sendNotification(
      partner.push_subscription,
      JSON.stringify({
        title: "パートナーがキモチを入力したよ 💌",
        body: "あなたのキモチも教えてね 🌸",
      })
    );

    console.log("[send-push] 送信成功 →", record.couple_id);
    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("[send-push] error:", err);
    return new Response("error", { status: 500 });
  }
});
