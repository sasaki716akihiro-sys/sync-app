// ─── SyncMessages ──────────────────────────────────────────────────────────
// ふたりのキモチの組み合わせに応じたメッセージを返すユーティリティ

export type SyncType =
  | "perfect"
  | "sync_soso"
  | "sync_tired"
  | "slight_gap"
  | "big_gap"
  | "both_low"
  | "waiting";

export interface SyncMessage {
  type: SyncType;
  message: string;
  actionSuggestion: string | null;
}

type Kimochi = "circle" | "triangle" | "cross" | null;

// ランダムに1つ選ぶ
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const MESSAGES: Record<
  Exclude<SyncType, "perfect">,
  { messages: string[]; actions: string[] | null }
> = {
  sync_soso: {
    messages: [
      "ふたりとも、ちょっと疲れてるのかな",
      "ふたりとも、ちょっとしんどい日かな",
      "おたがいゆるゆるな日もあるよね",
    ],
    actions: [
      "一緒にのんびりする時間、つくってみて 🛋️",
      "今夜は無理せず早めに休もう 🌙",
      "話すだけでも、少し楽になるかも ☕",
    ],
  },
  sync_tired: {
    messages: [
      "ふたりともお疲れみたい。無理しないでね",
      "今日はゆっくりしていいよ",
      "ふたりとも疲れてるね。今日はゆっくりしてね",
    ],
    actions: [
      "今日は何もしなくていい日にしよう 🌙",
      "早めに休んで、明日また話そう 💤",
      "ゆっくりお風呂に入ってみて 🛁",
    ],
  },
  slight_gap: {
    messages: [
      "ちょっとズレてる日もあるよ、大丈夫",
      "今日は少しキモチが違うみたい",
      "今日は少しだけ歩幅が違うみたい。無理しなくていいよ",
    ],
    actions: [
      "今日どうだった？って聞いてみるのもいいかも 💬",
      "小さなことを話すだけで変わるかも ☕",
      "今夜少しだけ時間をつくってみて 🌿",
    ],
  },
  big_gap: {
    messages: [
      "今日はキモチに差があるね",
      "どちらかが疲れているかも。気にかけてあげて",
      "今日はそっとそばにいてあげるだけでいいかも",
    ],
    actions: [
      "無理に合わせなくていい。そっとそばにいよう 🌙",
      "「今日しんどい？」って一言かけてみて 💬",
      "今夜は相手のペースに合わせてみて 🌿",
    ],
  },
  both_low: {
    messages: [
      "ふたりともちょっとお疲れ気味だね",
      "今日はふたりとも元気がないかも",
      "無理してないかな。今日はそれぞれゆっくりしてね",
    ],
    actions: [
      "あったかいもの飲んで帰ろう ☕",
      "今夜はゆっくり過ごしてね 🛋️",
      "ふたりで休む日があってもいいよ 🌙",
    ],
  },
  waiting: {
    messages: [
      "あなたの気持ちも、よければ選んでみてね",
      "今日の気持ちを、そっと添えてみて",
      "ふたりが揃うと、今日の状態が見えてくるよ",
    ],
    actions: null,
  },
};

export function getSyncMessage(
  myKimochi: Kimochi,
  partnerKimochi: Kimochi
): SyncMessage {
  // どちらかが未入力ならメッセージなし
  if (!myKimochi || !partnerKimochi) {
    return { type: "waiting", message: "", actionSuggestion: null };
  }

  // Perfect Sync
  if (myKimochi === "circle" && partnerKimochi === "circle") {
    return { type: "perfect", message: "", actionSuggestion: null };
  }

  let type: Exclude<SyncType, "perfect" | "waiting">;

  if (myKimochi === "triangle" && partnerKimochi === "triangle") {
    type = "sync_soso";
  } else if (myKimochi === "cross" && partnerKimochi === "cross") {
    type = "sync_tired";
  } else if (
    (myKimochi === "circle" && partnerKimochi === "triangle") ||
    (myKimochi === "triangle" && partnerKimochi === "circle")
  ) {
    type = "slight_gap";
  } else if (
    (myKimochi === "circle" && partnerKimochi === "cross") ||
    (myKimochi === "cross" && partnerKimochi === "circle")
  ) {
    type = "big_gap";
  } else {
    // △ と × の組み合わせ
    type = "both_low";
  }

  const def = MESSAGES[type];
  const action = def.actions ? pick(def.actions) : null;

  return {
    type,
    message: pick(def.messages),
    actionSuggestion: action,
  };
}

export function getWaitingMessage(): SyncMessage {
  const def = MESSAGES.waiting;
  return {
    type: "waiting",
    message: pick(def.messages),
    actionSuggestion: null,
  };
}
