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

    // kimochi が実際に変化した時だけ通知する
    // （kimochi_log や last_sync_date などの別フィールド更新で重複発火しないよう）
    const oldKimochi = body?.old_record?.kimochi;
    if (oldKimochi === record.kimochi) {
      return new Response("kimochi unchanged", { status: 200 });
    }

    // kimochi_date が今日でない場合はスキップ（古いデータの更新を無視）
    // JST (UTC+9) 基準で今日の日付を算出
    const now = new Date();
    now.setTime(now.getTime() + 9 * 60 * 60 * 1000);
    const today = now.toISOString().slice(0, 10);
    const kimochiDate = (record.kimochi_date ?? "").slice(0, 10);
    if (kimochiDate !== today) {
      return new Response("not today", { status: 200 });
    }

    // 直近5分以内に今日のkimochi更新が既にあった場合は重複通知を抑制
    // （例: ○→△の素早い変更で通知が連発しないように）
    const oldKimochiDate = (body?.old_record?.kimochi_date ?? "").slice(0, 10);
    const oldUpdatedAt   = body?.old_record?.updated_at;
    if (oldKimochi && oldKimochiDate === today && oldUpdatedAt) {
      const diffMs = Date.now() - new Date(oldUpdatedAt).getTime();
      if (diffMs < 5 * 60 * 1000) {
        return new Response("duplicate suppressed (5min)", { status: 200 });
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // パートナーの行を取得（自分の入力状況に関わらず通知するため push_subscription のみ取得）
    const { data: partnerRows, error } = await admin
      .from("sync_status")
      .select("push_subscription")
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

    // Web Push 送信
    try {
      await webpush.sendNotification(
        partner.push_subscription,
        JSON.stringify({
          title: "パートナーがキモチを入力しました 💌",
          body: "タップして確認しよう 🌸",
        })
      );
    } catch (pushErr: any) {
      // 410 Gone / 404 = サブスクリプション失効 → DBから削除して次回以降の無駄な送信を防ぐ
      if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
        await admin
          .from("sync_status")
          .update({ push_subscription: null })
          .eq("couple_id", record.couple_id)
          .neq("user_email", record.user_email);
        console.log("[send-push] 期限切れサブスクリプション削除 →", record.couple_id);
        return new Response("subscription expired, deleted", { status: 200 });
      }
      throw pushErr;
    }

    console.log("[send-push] 送信成功 →", record.couple_id);
    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("[send-push] error:", err);
    return new Response("error", { status: 500 });
  }
});
