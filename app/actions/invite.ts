"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// ─── 文字セット（O/0, I/1/l, S/5, B/8 を除いた見間違いしにくい文字）───
const SAFE_CHARS = "ACDEFGHJKMNPQRTUVWXY234679";

function generateRawCode(length = 7): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  }
  return code;
}

// "ABCDEFG" → "ABCD-EFG"
function formatInviteCode(raw: string): string {
  const c = raw.replace(/-/g, "").toUpperCase();
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

// 入力値を正規化（ハイフン除去・大文字化・空白除去）
function normalizeCode(input: string): string {
  return input.trim().replace(/-/g, "").toUpperCase();
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY が未設定です");
  return createAdminClient(url, key);
}

async function getAuthEmail(): Promise<string | null> {
  try {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

// ─── 型 ──────────────────────────────────────────────────
export type IssueResult =
  | { ok: true;  displayCode: string; expiresAt: string }
  | { ok: false; error: string };

export type JoinResult =
  | { ok: true;  coupleId: string; partnerEmail: string }
  | { ok: false; error: string };

export type ConnectionResult =
  | { connected: true;  coupleId: string; partnerEmail: string }
  | { connected: false };

// ─── 招待コード発行 ──────────────────────────────────────
export async function issueInviteCode(): Promise<IssueResult> {
  const email = await getAuthEmail();
  if (!email) return { ok: false, error: "ログインが必要です" };

  let admin;
  try { admin = getAdmin(); }
  catch (e) { return { ok: false, error: String(e) }; }

  // すでに接続済みの場合は拒否
  const { data: alreadyConn } = await admin
    .from("couples")
    .select("id")
    .or(`member_a.eq.${email},member_b.eq.${email}`)
    .eq("status", "connected")
    .maybeSingle();
  if (alreadyConn) return { ok: false, error: "すでにパートナーと接続済みです" };

  // pending の couple が既にあれば有効な招待コードを返す
  const { data: pendingCouple } = await admin
    .from("couples")
    .select("id")
    .eq("member_a", email)
    .eq("status", "pending")
    .maybeSingle();

  let coupleId: string;

  if (pendingCouple) {
    coupleId = pendingCouple.id;
    const { data: existingInvite } = await admin
      .from("invites")
      .select("code, expires_at")
      .eq("couple_id", coupleId)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existingInvite) {
      return {
        ok: true,
        displayCode: formatInviteCode(existingInvite.code),
        expiresAt:   existingInvite.expires_at,
      };
    }
  } else {
    const { data: newCouple, error: ce } = await admin
      .from("couples")
      .insert({ member_a: email, status: "pending" })
      .select("id")
      .single();
    if (ce || !newCouple) {
      console.error("[Invite] couples insert:", ce);
      return { ok: false, error: "招待コードの発行に失敗しました" };
    }
    coupleId = newCouple.id;
  }

  // ユニークなコードを最大10回試行
  let rawCode = "";
  for (let i = 0; i < 10; i++) {
    const candidate = generateRawCode();
    const { data: exists } = await admin
      .from("invites").select("code").eq("code", candidate).maybeSingle();
    if (!exists) { rawCode = candidate; break; }
  }
  if (!rawCode) return { ok: false, error: "コードの生成に失敗しました。もう一度お試しください" };

  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString(); // 48時間有効
  const { error: ie } = await admin.from("invites").insert({
    code:       rawCode,
    couple_id:  coupleId,
    created_by: email,
    used:       false,
    expires_at: expiresAt,
  });
  if (ie) {
    console.error("[Invite] invites insert:", ie);
    return { ok: false, error: "招待コードの発行に失敗しました" };
  }

  return { ok: true, displayCode: formatInviteCode(rawCode), expiresAt };
}

// ─── 招待コードで接続 ────────────────────────────────────
export async function joinWithInviteCode(rawInput: string): Promise<JoinResult> {
  const email = await getAuthEmail();
  if (!email) return { ok: false, error: "ログインが必要です" };

  const code = normalizeCode(rawInput);
  if (code.length < 6) return { ok: false, error: "招待コードは7文字で入力してください" };

  let admin;
  try { admin = getAdmin(); }
  catch (e) { return { ok: false, error: String(e) }; }

  // すでに接続済みなら拒否
  const { data: alreadyConn } = await admin
    .from("couples")
    .select("id")
    .or(`member_a.eq.${email},member_b.eq.${email}`)
    .eq("status", "connected")
    .maybeSingle();
  if (alreadyConn) return { ok: false, error: "すでにパートナーと接続済みです" };

  // 招待コードを取得・検証
  const { data: invite } = await admin
    .from("invites")
    .select("code, couple_id, created_by, used, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!invite)                                   return { ok: false, error: "招待コードが見つかりません" };
  if (invite.used)                               return { ok: false, error: "このコードはすでに使用済みです" };
  if (new Date(invite.expires_at) < new Date()) return { ok: false, error: "この招待コードは有効期限切れです" };
  if (invite.created_by === email)               return { ok: false, error: "自分が発行したコードは使えません" };

  // couple を取得・検証
  const { data: couple } = await admin
    .from("couples")
    .select("id, member_a, member_b, status")
    .eq("id", invite.couple_id)
    .maybeSingle();

  if (!couple)                                       return { ok: false, error: "招待コードが無効です" };
  if (couple.status === "connected" || couple.member_b) return { ok: false, error: "このグループはすでに満員です" };

  const coupleId     = couple.id as string;
  const partnerEmail = couple.member_a as string;

  // couple を接続済みに更新
  const { error: ue } = await admin
    .from("couples")
    .update({ member_b: email, status: "connected", updated_at: new Date().toISOString() })
    .eq("id", coupleId);
  if (ue) {
    console.error("[Invite] couple update:", ue);
    return { ok: false, error: "接続処理に失敗しました" };
  }

  // 招待コードを使用済みに
  await admin.from("invites")
    .update({ used: true, used_by: email })
    .eq("code", code);

  // sync_status のデータ移行 ─────────────────────────────
  // 自分（B）の既存行を新しい coupleId でコピー
  const { data: bRow } = await admin
    .from("sync_status").select("*")
    .eq("couple_id", email).eq("user_email", email).maybeSingle();
  if (bRow) {
    const { couple_id: _old, ...rest } = bRow as Record<string, unknown>;
    void _old;
    await admin.from("sync_status")
      .upsert({ ...rest, couple_id: coupleId }, { onConflict: "couple_id,user_email" });
  }

  // パートナー（A）の既存行を新しい coupleId でコピー
  const { data: aRow } = await admin
    .from("sync_status").select("*")
    .eq("couple_id", partnerEmail).eq("user_email", partnerEmail).maybeSingle();
  if (aRow) {
    const { couple_id: _old, ...rest } = aRow as Record<string, unknown>;
    void _old;
    await admin.from("sync_status")
      .upsert({ ...rest, couple_id: coupleId }, { onConflict: "couple_id,user_email" });
  }

  console.log("[Invite] connected:", email, "←→", partnerEmail, "coupleId=", coupleId);
  return { ok: true, coupleId, partnerEmail };
}

// ─── 接続状態確認 ────────────────────────────────────────
export async function checkConnection(): Promise<ConnectionResult> {
  const email = await getAuthEmail();
  if (!email) return { connected: false };

  let admin;
  try { admin = getAdmin(); }
  catch { return { connected: false }; }

  const { data: couple } = await admin
    .from("couples")
    .select("id, member_a, member_b, status")
    .or(`member_a.eq.${email},member_b.eq.${email}`)
    .eq("status", "connected")
    .maybeSingle();

  if (!couple) return { connected: false };

  const partnerEmail = (couple.member_a === email ? couple.member_b : couple.member_a) as string;
  if (!partnerEmail) return { connected: false };

  return { connected: true, coupleId: couple.id as string, partnerEmail };
}
