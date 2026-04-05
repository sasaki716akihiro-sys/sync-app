// ================================================================
// slideTemplates.ts — Sync Couple Instagram 投稿テンプレート定義
//
// ── データ構造 ────────────────────────────────────────────────
//   TEMPLATE_PATTERNS[theme][categoryKey].patterns[]
//   └ theme      : 'sympathy' | 'benefit' | 'feature'
//   └ category   : テーマ内のサブカテゴリ（例: 'mismatch'）
//   └ patterns[] : SlideData[][] 各パターン（5枚構成）
//
// ── パターンの追加方法 ────────────────────────────────────────
//   TEMPLATE_PATTERNS[テーマ][カテゴリ].patterns に
//   SlideData[] をひとつ push するだけ。
//   5枚構成: [0]表紙 [1]問題提起 [2]共感/解決 [3]紹介 [4]CTA
//
// ── AI生成への差し込みポイント ─────────────────────────────────
//   generateCopy() の中身だけ差し替えれば完了。
//   呼び出し元 (page.tsx) は一切変更不要。
// ================================================================

// ── 型定義 ────────────────────────────────────────────────────

export type SlideLayout = 'cover' | 'detail' | 'screenshot'

export type SlideData = {
  heading: string
  body: string
  note: string
  /** テンプレートが推奨するレイアウト。未指定時は位置から自動決定 */
  layout?: SlideLayout
  /** スクリーンショットレイアウト用の画像URL（page.tsx 側で設定） */
  screenshotUrl?: string
}

export type TemplateType = 'sympathy' | 'benefit' | 'feature'

export type PatternCategory = {
  label: string
  patterns: SlideData[][]
}

export type TemplateCategories = Record<string, PatternCategory>

// ── テンプレートメタ情報 ──────────────────────────────────────

export const TEMPLATE_META: Record<TemplateType, { label: string; description: string }> = {
  sympathy: { label: '共感系投稿', description: 'すれ違い・気持ちへの共感から始まる5枚構成' },
  benefit:  { label: 'ベネフィット訴求', description: 'アプリで得られる変化・効果を伝える5枚構成' },
  feature:  { label: '機能紹介投稿', description: 'アプリの機能を具体的に紹介する5枚構成' },
}

// ================================================================
// TEMPLATE_PATTERNS — 文言データ本体
// ================================================================

export const TEMPLATE_PATTERNS: Record<TemplateType, TemplateCategories> = {

  // ══════════════════════════════════════════════════════════════
  // 共感系投稿
  // ══════════════════════════════════════════════════════════════
  sympathy: {

    mismatch: {
      label: 'すれ違い型',
      patterns: [
        // パターン1
        [
          { heading: 'パートナーと\nすれ違っていませんか？', body: '', note: '' },
          { heading: 'こんな経験、\nありませんか？', body: '忙しくて話す時間がない\n言葉にできない気持ちが積もる\n\n「怒ってる？」って聞けない夜', note: '' },
          { heading: 'すれ違いは\nふたりのせいじゃない', body: '現代の共働き・子育て夫婦の多くが\n同じ悩みを抱えています\n\n気持ちを伝える余裕がないだけ', note: '' },
          { heading: '「ふたりのきもち」は\nその問題を解決します', body: '毎日○△✕を選ぶだけ\nパートナーに気持ちが届く\n\n言葉がなくてもつながれる', note: '' },
          { heading: 'まずは今日\n試してみませんか？', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
        // パターン2
        [
          { heading: '気持ちのズレが\n気になる日がある', body: '', note: '' },
          { heading: '同じ話題で\nいつもすれ違ってしまう', body: '相手が何を考えているか分からない\n自分の言いたいことも\nうまく伝えられない', note: '' },
          { heading: 'ズレが生まれるのは\n自然なこと', body: 'それでも\nお互いを大切にしたい気持ちは\nふたりに共通してある', note: '' },
          { heading: '毎日のきもちを\n選んで共有するだけで', body: '相手の状態が見える\n「今日はしんどそうだな」と\n気づけるようになる', note: '' },
          { heading: 'まずは試してみてください', body: '', note: '無料で使えます' },
        ],
        // パターン3
        [
          { heading: 'ふたりの会話が\n減っていませんか？', body: '', note: '' },
          { heading: 'いつの間にか\n話さなくなっていた', body: '忙しさを言い訳に\n「後で話せばいい」が続いて\n\n気づいたら何週間も経っていた', note: '' },
          { heading: '会話がなくても\nつながれる方法がある', body: '言葉じゃなくて気持ちを届ける\n○△✕の3択なら\n忙しい日でも続けられる', note: '' },
          { heading: '毎日の小さな共有が\nふたりの関係を守る', body: 'パートナーの状態が見えると\n自然に思いやりが生まれる', note: '' },
          { heading: 'まずは今日\n選んでみてください', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
      ],
    },

    hard_to_say: {
      label: '言いにくさ型',
      patterns: [
        // パターン1
        [
          { heading: '言葉にできない\n気持ちがある', body: '', note: '' },
          { heading: '「大丈夫？」って\n聞けない夜がある', body: 'パートナーの顔が曇っているのに\n声をかけられなかった\n\nそのままお互い黙ってしまう', note: '' },
          { heading: '気持ちは\n言葉がなくても\n伝えられる', body: '「いい感じ」「まあまあ」「しんどい」\nたった3つを選ぶだけで\nパートナーに届く', note: '' },
          { heading: '選んだ気持ちが\nリアルタイムで届く', body: '相手がいつ選んだかわかる\nふたりが同じ日に○を選んだら\nパーフェクトシンクでお祝い', note: '' },
          { heading: '今日から\n始めてみませんか？', body: '', note: '無料で使えます' },
        ],
        // パターン2
        [
          { heading: '伝えたいのに\n言葉が出てこない', body: '', note: '' },
          { heading: '怒っているわけじゃないのに\n怒っていると思われる', body: '疲れているだけなのに\n冷たくしているように見えてしまう\n\nそういう日がある', note: '' },
          { heading: '言葉がなくても\n気持ちは届けられる', body: '○△✕の三択なら\n今の状態を正直に選べる\n\n詳しく説明しなくていい', note: '' },
          { heading: '気持ちを受け取った\nパートナーが変わる', body: '「今日はしんどいんだな」と\n分かるだけで十分\n\nそれだけで変わる', note: '' },
          { heading: '今夜から\n始めてみませんか？', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
        // パターン3
        [
          { heading: '黙っていても\n分かってほしい日がある', body: '', note: '' },
          { heading: '言葉にするより先に\n気持ちが顔に出てしまう', body: '「どうしたの？」と聞かれても\n「別に」としか答えられない\n\nでも本当は気づいてほしい', note: '' },
          { heading: '「別に」をやめなくていい', body: '○△✕で気持ちを届ければ\nパートナーには伝わる\n\n言葉を探さなくていい', note: '' },
          { heading: 'シンプルだから\n続けられる', body: '朝でも夜でも\n3秒あればOK\n\n習慣になると自然と届け合える', note: '' },
          { heading: 'まず今日\nひとつ選んでみて', body: '', note: '無料で使えます' },
        ],
      ],
    },

    want_understood: {
      label: '察してほしい型',
      patterns: [
        // パターン1
        [
          { heading: 'もっと気にかけて\nほしいと思うことがある', body: '', note: '' },
          { heading: '「分かってほしい」\nと思うことがある', body: '頑張っているのに気づいてもらえない\n言い出せなくて\nモヤモヤが残る', note: '' },
          { heading: '「察してほしい」は\n難しい', body: 'でも相手の状態が見えれば\n自然と気にかけられる\n\nそういう仕組みがあればいい', note: '' },
          { heading: '「ふたりのきもち」なら', body: '毎日○△✕を選ぶだけで\nパートナーにあなたの状態が届く\n\n言わなくても気づいてもらえる', note: '' },
          { heading: 'まずは今日\n選んでみてください', body: '', note: '無料で使えます' },
        ],
        // パターン2
        [
          { heading: 'ちゃんと見てほしい\nそう思う日がある', body: '', note: '' },
          { heading: '「私のこと\n気にしてる？」', body: '言葉にするほどのことじゃないけど\n心の中でそう思う\n\n言えないまま夜が終わる', note: '' },
          { heading: '気にかけてほしいのは\n当然の気持ち', body: 'パートナーもきっと\nあなたを大切に思っている\n\n気づく「きっかけ」がないだけ', note: '' },
          { heading: '毎日の気持ちを\n共有する習慣が', body: '相手を気にかける\nきっかけを作る\n\n小さな通知が変えていく', note: '' },
          { heading: '試してみませんか？', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
        // パターン3
        [
          { heading: '気づいてもらえると\nうれしい', body: '', note: '' },
          { heading: '今日ちょっと\nしんどかったな', body: 'でも言い出すタイミングがなくて\nそのまま眠ってしまった\n\nそんな日が続いている', note: '' },
          { heading: '伝えることへの\nハードルを下げたい', body: '「しんどい」を選ぶだけで\n気づいてもらえる\n\nそれだけでいい', note: '' },
          { heading: 'パートナーが\nそっと声をかけてくれる', body: '「今日しんどそうだったね」\n一言が嬉しい\n\nアプリがきっかけを作る', note: '' },
          { heading: '今日から\n始めてみませんか？', body: '', note: '無料で使えます' },
        ],
      ],
    },

    childcare: {
      label: '子育てで余裕がない型',
      patterns: [
        // パターン1
        [
          { heading: '忙しくても\n気持ちは伝えたい', body: '', note: '' },
          { heading: '共働き・子育て夫婦の\nリアルな悩み', body: '仕事と育児で手いっぱい\n話し合いの時間がとれない\n\nそれでも相手を大切にしたい', note: '' },
          { heading: '時間がなくても\nできる関係づくり', body: '毎日1分もかからない\n気持ちの共有が\nふたりのリズムを整える', note: '' },
          { heading: '「ふたりのきもち」\nなら続けられる', body: '通知でリマインド\n28日間の記録で振り返れる\n\n習慣になるから効果が出る', note: '' },
          { heading: 'まず1週間\n続けてみてください', body: '', note: 'App Store / Google Play で\n「ふたりのきもち」を検索' },
        ],
        // パターン2
        [
          { heading: '子育てで余裕がなくても\nつながっていたい', body: '', note: '' },
          { heading: '子どもが最優先で\nふたりの時間が消えていく', body: '「最近ちゃんと話せていない」\n気づけば何週間も経っていた\n\nそれが続くとどうなるか不安', note: '' },
          { heading: '子育て中こそ\nふたりの関係を守りたい', body: 'お互いの状態をちゃんと知っていれば\n寄り添える\n\n手間はかけずに確認できる', note: '' },
          { heading: '毎日○△✕を選ぶだけ', body: '「今日しんどそうだな」\nそれが分かるだけで\nふたりの空気が変わる', note: '' },
          { heading: '今日から\n始めてみませんか？', body: '', note: '無料で使えます' },
        ],
        // パターン3
        [
          { heading: 'ふたりでいることを\n忘れていませんか？', body: '', note: '' },
          { heading: '子どもが生まれてから\nパートナーへの気遣いが減った', body: '育児に追われて\n「パートナーとふたりの時間」が\nなくなっていた', note: '' },
          { heading: 'それは\nあなたが悪いわけじゃない', body: '子育ては本当に大変\n余裕がなくて当たり前\n\nでも少しだけ工夫できる', note: '' },
          { heading: '3秒でできる\nふたりのつながり', body: '○△✕を選ぶだけで\n「今日どうだった？」が伝わる\n\nそれだけでいい', note: '' },
          { heading: 'まず今日\n選んでみてください', body: '', note: '「ふたりのきもち」は無料です' },
        ],
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════
  // ベネフィット訴求
  // ══════════════════════════════════════════════════════════════
  benefit: {

    gentle_share: {
      label: '気持ちをやさしく共有できる型',
      patterns: [
        // パターン1
        [
          { heading: '毎日3秒で\nふたりがつながる', body: '', note: '' },
          { heading: '忙しい毎日に\n埋もれる気持ち', body: '疲れた、しんどい、伝えたい\nでも時間も言葉も見つからない\n\nそのまま朝になってしまう', note: '' },
          { heading: 'すれ違いは\n悪意じゃなく\n余裕のなさから', body: 'お互いの状態が見えれば\n自然とやさしくなれる\n\n小さな気持ちの共有がふたりを変える', note: '' },
          { heading: '「ふたりのきもち」で\nできること', body: '○△✕を選んで気持ちを共有\nふたり同時に○で\nパーフェクトシンクをお祝い', note: '' },
          { heading: '小さな習慣が\nふたりを変える', body: '', note: '今日から無料で始めてみよう' },
        ],
        // パターン2
        [
          { heading: '気持ちは\nやさしく伝えられる', body: '', note: '' },
          { heading: '「元気？」の一言が\n言い出せない日がある', body: '相手も疲れているから\n自分のことを話すのが申し訳なくて\n\nそれでも誰かに知ってほしい', note: '' },
          { heading: 'やさしく伝える\n方法がある', body: '○△✕の三択なら\n「しんどい」と伝えることへの\n心理的ハードルが下がる', note: '' },
          { heading: '受け取ったパートナーが\nそっと声をかけてくれる', body: 'ねぎらいの一言が\n自然と生まれる\n\nアプリが作るやさしさの連鎖', note: '' },
          { heading: 'まず今日\n選んでみてください', body: '', note: '無料で使えます' },
        ],
        // パターン3
        [
          { heading: 'ふたりの空気が\n変わる', body: '', note: '' },
          { heading: '「なんとなく\nギスギスしてる」', body: '特別なことがあったわけじゃない\nでもなんかかみ合わない\n\nそういう日が続いていた', note: '' },
          { heading: 'お互いの状態を\n知るだけで変わる', body: '「今日しんどかったんだな」\nそれが分かるだけで\n自然とやさしくなれる', note: '' },
          { heading: '毎日3秒の\n気持ちの共有', body: 'それだけでふたりの空気が\n少しずつ変わっていく\n\n試してみる価値がある', note: '' },
          { heading: '今日から\n始めてみませんか？', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
      ],
    },

    reduce_mismatch: {
      label: 'すれ違いを減らせる型',
      patterns: [
        // パターン1
        [
          { heading: 'ふたりが\nつながる瞬間がある', body: '', note: '' },
          { heading: 'バラバラな毎日でも\n気持ちは同じだった', body: '朝と夜、別々の場所で\n同じ「○」を選んでいた\n\nそれだけで嬉しくなれる', note: '' },
          { heading: 'パーフェクトシンクが\n起きたとき', body: 'ふたり同時に○を選んだ日\n特別な演出でお祝いしてくれる\n\n小さな喜びが積み重なる', note: '' },
          { heading: '毎日の記録が\nふたりの財産になる', body: '28日間の気持ちの変化が見える\n「あの時しんどかったんだ」と\n気づいてあげられる', note: '' },
          { heading: '今すぐ\n始めてみませんか？', body: '', note: '無料でダウンロードできます' },
        ],
        // パターン2
        [
          { heading: 'すれ違いを\n減らす方法がある', body: '', note: '' },
          { heading: '「なんか最近\nかみ合わないな」', body: '悪いことをしているわけじゃない\nでもお互いの状態が\n噛み合っていない', note: '' },
          { heading: '相手の状態が見えると\nすれ違いが減る', body: '「今日しんどそうだから\nそっとしておこう」\n\nそれだけで大きく変わる', note: '' },
          { heading: '毎日の気持ちを\n共有するだけで', body: '自然に相手を\n思いやれるようになる\n\n口で言わなくてもいい', note: '' },
          { heading: 'まずは試してみて', body: '', note: '「ふたりのきもち」は無料です' },
        ],
        // パターン3
        [
          { heading: '毎日の記録が\nすれ違いを防ぐ', body: '', note: '' },
          { heading: 'すれ違いやすい\n時期がある', body: '体調や仕事の波で\n気持ちが乱れやすい日がある\n\nそれに気づかないまま過ごしている', note: '' },
          { heading: '記録すると\n見えてくるものがある', body: '「この時期はいつも\nしんどくなりやすい」\n\n分かれば準備できる', note: '' },
          { heading: '28日間の気持ちログで\nふたりのリズムが見える', body: 'すれ違いやすい時期を\n事前に知っておくだけで\n関係が変わる', note: '' },
          { heading: '記録を始めてみませんか？', body: '', note: '無料で使えます' },
        ],
      ],
    },

    nonverbal: {
      label: '言葉にしなくても伝えやすい型',
      patterns: [
        // パターン1
        [
          { heading: '使い始めて\n夫婦が変わった', body: '', note: '' },
          { heading: '以前はこうでした', body: '気持ちを言葉にできなくて\nすれ違うことが多かった\n\n「また後で」が積み重なっていた', note: '' },
          { heading: '「ふたりのきもち」を\n使い始めてから', body: '毎日気持ちを選ぶだけで\n相手の状態がわかるようになった\n\n声のかけ方が変わった', note: '' },
          { heading: '変わったのは\nふたりの意識', body: 'アプリはきっかけに過ぎない\n大切なのは相手を気にする習慣\n\n毎日3秒が作るもの', note: '' },
          { heading: 'あなたのふたりも\n変えてみませんか？', body: '', note: '無料で使えます' },
        ],
        // パターン2
        [
          { heading: '言葉にしなくても\n伝わるものがある', body: '', note: '' },
          { heading: 'うまく言語化できなくて\nモヤモヤが残ることがある', body: '伝えたい気持ちはあるのに\n言葉にすると\nなんか違う', note: '' },
          { heading: '三択なら\n正直に選べる', body: '○いい感じ　△まあまあ　✕しんどい\nこれだけで十分\n\n言葉じゃなくて気持ちが伝わる', note: '' },
          { heading: '受け取ったパートナーが\n気持ちをくみ取ってくれる', body: '「なんか分かる」\nその積み重ねが\nふたりの信頼になる', note: '' },
          { heading: '今日から\n始めてみませんか？', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
        // パターン3
        [
          { heading: '言葉じゃなくて\n気持ちで伝える', body: '', note: '' },
          { heading: '説明するのが\n面倒な日がある', body: '「今日どうだった？」と聞かれても\n話す気力がない\n\nでも何も言わないと心配される', note: '' },
          { heading: '「しんどい」の一択で\n十分伝わる', body: '長い説明はいらない\n○△✕を選ぶだけで\nパートナーには届く', note: '' },
          { heading: 'それだけで\n十分なことがある', body: '「今日はそっとしておこう」\nパートナーが自然に気を使ってくれる\n\n言葉がなくてもつながれる', note: '' },
          { heading: 'まずは一度\n試してみてください', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════
  // 機能紹介投稿（スクリーンショット対応）
  // ══════════════════════════════════════════════════════════════
  feature: {

    kimochi: {
      label: 'キモチ選択',
      patterns: [
        // パターン1
        [
          { heading: 'きもちを選ぶのは\nたった3秒', body: '', note: '' },
          { heading: '○△✕の3択から\n今日の気持ちを選ぶ', body: '', note: 'アイコンをタップするだけ', layout: 'screenshot' },
          { heading: '選んだ気持ちが\nパートナーに届く', body: '', note: 'リアルタイムで通知が届きます', layout: 'screenshot' },
          { heading: 'ふたり同時に○を選んだら\nパーフェクトシンク！', body: '', note: '特別な演出でお祝いします', layout: 'screenshot' },
          { heading: 'まずは試してみて', body: '', note: '無料で使えます' },
        ],
        // パターン2
        [
          { heading: '今日の気持ちを\n選ぶだけでいい', body: '', note: '' },
          { heading: '朝でも夜でも\nいつでもOK', body: '', note: 'タップするだけ、3秒でできます', layout: 'screenshot' },
          { heading: 'パートナーの気持ちも\nすぐに分かる', body: '', note: 'お互いの状態がリアルタイムで見えます', layout: 'screenshot' },
          { heading: '選び忘れても\nやさしくリマインド', body: '', note: '通知で毎日続けられます', layout: 'screenshot' },
          { heading: 'まず1週間\n試してみてください', body: '', note: 'App Store / Google Play で\n「ふたりのきもち」を検索' },
        ],
        // パターン3
        [
          { heading: '3つの気持ちで\nふたりがつながる', body: '', note: '' },
          { heading: '○いい感じ\n△まあまあ\n✕しんどい', body: '', note: '今日はどれに近いですか？', layout: 'screenshot' },
          { heading: 'パートナーの\n今日の気持ちが見える', body: '', note: '共有されたらすぐに分かります', layout: 'screenshot' },
          { heading: 'ふたりの気持ちが\n重なった日は', body: '', note: 'パーフェクトシンクでお祝い', layout: 'screenshot' },
          { heading: '今日から\n気持ちを届けてみて', body: '', note: '無料で使えます' },
        ],
      ],
    },

    cycle: {
      label: '生理共有',
      patterns: [
        // パターン1
        [
          { heading: '生理周期を\nパートナーと共有する', body: '', note: '' },
          { heading: '生理の開始日を\n記録するだけ', body: '', note: 'かんたんな操作で記録できます', layout: 'screenshot' },
          { heading: 'パートナーに\n周期が届く', body: '', note: '事前に体調の変化を知ってもらえます', layout: 'screenshot' },
          { heading: 'ふたりのリズムが\n見えてくる', body: '', note: '28日間の気持ちの推移も確認できます', layout: 'screenshot' },
          { heading: '記録を始めてみませんか？', body: '', note: '無料で使えます' },
        ],
        // パターン2
        [
          { heading: '体調の変化を\n分かってもらえる', body: '', note: '' },
          { heading: '生理前後の体調変化を\nパートナーに知ってほしい', body: 'でもわざわざ言い出すのが\n難しい日もある\n\nそんなとき', note: '' },
          { heading: '周期を登録するだけで\nパートナーに届く', body: '', note: '言葉にしなくても伝わります', layout: 'screenshot' },
          { heading: '「今その時期か」と\n自然に気づいてもらえる', body: '', note: '思いやりが自然に生まれます', layout: 'screenshot' },
          { heading: '今月から\n記録を始めてみて', body: '', note: '無料で使えます' },
        ],
        // パターン3
        [
          { heading: '生理周期の記録が\nふたりの関係を変える', body: '', note: '' },
          { heading: '体調の波が\n気持ちに影響する', body: '月に一度\n気持ちが揺れやすくなる時期がある\n\nそれをパートナーに知ってもらいたい', note: '' },
          { heading: 'カレンダーに\n記録するだけ', body: '', note: '開始日を入力するだけで管理できます', layout: 'screenshot' },
          { heading: 'ふたりで\n体調の変化を共有できる', body: '', note: '事前に分かると思いやりが変わります', layout: 'screenshot' },
          { heading: 'まずは記録を\n始めてみてください', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
      ],
    },

    notification: {
      label: '通知機能',
      patterns: [
        // パターン1
        [
          { heading: 'やさしい通知が\nふたりをつなぐ', body: '', note: '' },
          { heading: '毎日決まった時間に\nやさしくお知らせ', body: '', note: '選び忘れを防いでくれます', layout: 'screenshot' },
          { heading: 'パートナーが選んだら\n通知が届く', body: '', note: 'お互いの状態をリアルタイムで把握', layout: 'screenshot' },
          { heading: 'パーフェクトシンクも\n通知でお知らせ', body: '', note: '特別な日を一緒に喜べます', layout: 'screenshot' },
          { heading: '通知をオンにして\n使い始めよう', body: '', note: '無料で使えます' },
        ],
        // パターン2
        [
          { heading: '通知ひとつが\n関係を変える', body: '', note: '' },
          { heading: '忙しくて\nすっかり忘れてしまう', body: '「今日選んだっけ？」\n後で振り返ると\nずっと選んでいなかった', note: '' },
          { heading: '続けるための\n仕組みがある', body: 'リマインド通知が\nやさしくお知らせ\n\n習慣になると自然に選べるようになる', note: '' },
          { heading: '通知の時間は\n自分で設定できる', body: '', note: '朝・夜、都合のいい時間に', layout: 'screenshot' },
          { heading: 'まずはインストールして\n設定してみてください', body: '', note: '無料で使えます' },
        ],
        // パターン3
        [
          { heading: '通知が\nふたりのリズムを作る', body: '', note: '' },
          { heading: '毎日のルーティンに\nきもちの共有を加えよう', body: '朝の支度、夜の就寝前\n1日の中のどこかで\n3秒だけ選ぶ', note: '' },
          { heading: 'リマインダーで\n忘れずに続けられる', body: '', note: '設定した時間にやさしく通知します', layout: 'screenshot' },
          { heading: 'パートナーが選んだら\nすぐ分かる', body: '', note: '「今日選んでくれたよ」の通知', layout: 'screenshot' },
          { heading: '習慣にすると\nもっと効果が出る', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
      ],
    },

    review: {
      label: 'ふりかえり',
      patterns: [
        // パターン1
        [
          { heading: '28日間の\nきもちを振り返る', body: '', note: '' },
          { heading: '毎日の気持ちが\nカレンダーに記録される', body: '', note: 'ひと目で振り返れます', layout: 'screenshot' },
          { heading: '生理周期と\n感情の変化が重なって見える', body: '', note: 'ふたりのリズムが分かります', layout: 'screenshot' },
          { heading: '週ごとの\n傾向も確認できる', body: '', note: 'すれ違いやすい時期を事前に把握', layout: 'screenshot' },
          { heading: '振り返りを\n始めてみませんか？', body: '', note: '無料で使えます' },
        ],
        // パターン2
        [
          { heading: '記録が\nふたりを助ける', body: '', note: '' },
          { heading: '「最近うまくいっていない」\n理由が分からない', body: '特定の時期に\nなぜか気持ちがかみ合わない\n\nそれに気づけていなかった', note: '' },
          { heading: '振り返ると\n見えてくることがある', body: '体調の周期と\n気持ちの揺れ動きが\n連動していることがある', note: '' },
          { heading: '28日間のログを\n見返してみると', body: '', note: 'パターンが見えてきます', layout: 'screenshot' },
          { heading: '今日から\n記録を始めてみて', body: '', note: '「ふたりのきもち」は無料で使えます' },
        ],
        // パターン3
        [
          { heading: '気持ちの記録が\n積み重なると', body: '', note: '' },
          { heading: '1ヶ月後に\n見えてくるもの', body: '毎日の「○△✕」が積み上がると\nふたりのリズムが分かってくる\n\nそれが関係づくりの土台になる', note: '' },
          { heading: 'ウィークリーレビューで\n週の傾向を確認', body: '', note: '先週はどんな気持ちの週でしたか？', layout: 'screenshot' },
          { heading: '28日ログで\n長期の流れも見える', body: '', note: '月のリズムが可視化されます', layout: 'screenshot' },
          { heading: '記録するほど\n精度が上がる', body: '', note: '今日から始めてみてください' },
        ],
      ],
    },

  },
}

// ── TEMPLATE_SLIDES — applyTemplate() のデフォルト文言 ──────────────────
// TEMPLATE_PATTERNS の各テーマ・最初のカテゴリ・最初のパターンから自動導出

function getDefaultSlides(type: TemplateType): SlideData[] {
  const firstCat = Object.values(TEMPLATE_PATTERNS[type])[0]
  return firstCat.patterns[0].map(s => ({ ...s }))
}

export const TEMPLATE_SLIDES: Record<TemplateType, SlideData[]> = {
  sympathy: getDefaultSlides('sympathy'),
  benefit:  getDefaultSlides('benefit'),
  feature:  getDefaultSlides('feature'),
}

// ── カテゴリ一覧を返すヘルパー（UIのカテゴリ選択に使用） ─────────────────

export function getCategories(type: TemplateType): Array<{ key: string; label: string }> {
  return Object.entries(TEMPLATE_PATTERNS[type]).map(([key, cat]) => ({
    key,
    label: cat.label,
  }))
}

// ── 重複回避ランダム選択 ──────────────────────────────────────────────────

const _lastUsed: Record<string, number> = {}  // key: `${type}_${categoryKey}`

function pickPattern(type: TemplateType, categoryKey?: string): SlideData[] {
  const cats = TEMPLATE_PATTERNS[type]
  const catKeys = Object.keys(cats)

  // カテゴリ未指定の場合はランダムに選ぶ
  const resolvedKey = categoryKey && cats[categoryKey]
    ? categoryKey
    : catKeys[Math.floor(Math.random() * catKeys.length)]

  const patterns = cats[resolvedKey].patterns
  const lastKey = `${type}_${resolvedKey}`
  const last = _lastUsed[lastKey] ?? -1

  // 直前と同じパターンを避けて選択
  const candidates = patterns.length > 1
    ? patterns.map((_, i) => i).filter(i => i !== last)
    : [0]

  const idx = candidates[Math.floor(Math.random() * candidates.length)]
  _lastUsed[lastKey] = idx

  return patterns[idx].map(s => ({ ...s }))
}

// ================================================================
// generateCopy — AI生成への差し込みポイント
// ================================================================
// 現在: pickPattern() でランダム選択（モック）
// 将来: この関数の中身を Claude API 等に差し替える
//
// 差し替え例:
//   const res = await fetch('/api/generate', {
//     method: 'POST',
//     body: JSON.stringify({ theme, type, categoryKey }),
//   })
//   return res.json() as SlideData[]
//
// 呼び出し元 (page.tsx) は SlideData[] を受け取るだけなので
// この関数だけ変えれば AI 生成に切り替わります。
// ================================================================
export async function generateCopy(
  theme: string,
  type: TemplateType,
  categoryKey?: string,
): Promise<SlideData[]> {
  const slides = pickPattern(type, categoryKey)

  // テーマが入力されていれば 1 枚目の見出しに反映
  if (theme.trim()) {
    slides[0] = { ...slides[0], heading: theme }
  }

  return slides
}
