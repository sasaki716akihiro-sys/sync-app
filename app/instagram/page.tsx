'use client'

import { useRef, useState } from 'react'
import SlidePreview from './SlidePreview'
import {
  SlideData,
  SlideLayout,
  TemplateType,
  TEMPLATE_META,
  TEMPLATE_SLIDES,
  generateCopy,
  getCategories,
} from './slideTemplates'

// ── Types ──────────────────────────────────────────────────────────────────

type SlideItem = SlideData & { id: number; bgImage: string; layout: SlideLayout }

type BgImage = { id: string; name: string; url: string }

// version フィールドで旧形式の下書きを安全に移行する
type DraftData = {
  version: 3
  theme: string
  activeTemplate: TemplateType
  selectedCategory: Partial<Record<TemplateType, string>>
  slidesData: Array<{ heading: string; body: string; note: string; bgImage: string; layout: SlideLayout }>
  caption: string
  hashtags: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_BG_URL = '/instagram/背景画像.png'
const DEFAULT_BG: BgImage = { id: 'preset_0', name: '背景画像', url: DEFAULT_BG_URL }

const THUMB_W = 148
const THUMB_SCALE = THUMB_W / 1080
const THUMB_H = Math.round(1350 * THUMB_SCALE)

const PREVIEW_W = 486
const PREVIEW_SCALE = PREVIEW_W / 1080
const PREVIEW_H = Math.round(1350 * PREVIEW_SCALE)

// 書き出し確認モーダル用スケール
const MODAL_W = 190
const MODAL_SCALE = MODAL_W / 1080
const MODAL_H = Math.round(1350 * MODAL_SCALE)

// ── ID ─────────────────────────────────────────────────────────────────────

let _idSeed = 10
function makeSlide(data: SlideData, bgImage = DEFAULT_BG_URL, isFirst = false): SlideItem {
  const layout: SlideLayout = data.layout ?? (isFirst ? 'cover' : 'detail')
  return { ...data, layout, id: _idSeed++, bgImage }
}
function makeDefaultSlides(type: TemplateType, bgImage = DEFAULT_BG_URL): SlideItem[] {
  return TEMPLATE_SLIDES[type].map((s, i) => makeSlide(s, bgImage, i === 0))
}

// ── モジュールレベルで初期状態を確定 ──────────────────────────────────────
const _initSlides = makeDefaultSlides('sympathy')
const _initSelectedId = _initSlides[0].id

// ── Draft ──────────────────────────────────────────────────────────────────

const DRAFT_KEY = 'instagram-tool-draft'

function saveDraft(d: DraftData) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* ignore */ }
}

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // 旧形式・v2 を v3 に移行
    return {
      version: 3,
      theme: parsed.theme ?? '',
      activeTemplate: parsed.activeTemplate ?? 'sympathy',
      selectedCategory: parsed.selectedCategory ?? {},
      slidesData: (parsed.slidesData ?? []).map((s: SlideData & { bgImage?: string; layout?: SlideLayout }, i: number) => ({
        heading: s.heading ?? '',
        body: s.body ?? '',
        note: s.note ?? '',
        bgImage: s.bgImage ?? DEFAULT_BG_URL,
        layout: s.layout ?? (i === 0 ? 'cover' : 'detail'),
      })),
      caption: parsed.caption ?? '',
      hashtags: parsed.hashtags ?? '',
    }
  } catch { return null }
}

// ── ファイル名生成 ──────────────────────────────────────────────────────────

function buildFileName(type: TemplateType, index: number, ext: string): string {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const names: Record<TemplateType, string> = {
    sympathy: '共感系投稿',
    benefit: 'ベネフィット訴求',
    feature: '機能紹介投稿',
  }
  return `${date}_${names[type]}_${String(index + 1).padStart(2, '0')}.${ext}`
}

// ── Canvas ユーティリティ ───────────────────────────────────────────────────

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('canvas.toBlob failed'))
    }, 'image/png')
  })
}

// ── Caption / Hashtag モック ────────────────────────────────────────────────

function buildCaption(theme: string, type: TemplateType): string {
  const intro = theme.trim() ? `${theme}\n\n` : ''
  const bodies: Record<TemplateType, string> = {
    sympathy:
      `${intro}パートナーとのすれ違い、感じたことはありませんか？\n\n言葉にできなくても、気持ちは伝わります。\n「ふたりのきもち」は毎日ひとつの気持ちを選ぶだけで\nパートナーとつながれるアプリです。\n\nまずは無料で試してみてください。`,
    benefit:
      `${intro}毎日たった3秒で、ふたりの気持ちがつながります。\n\n忙しい毎日でも、すれ違いを防ぐ小さな習慣を。\n「ふたりのきもち」をぜひ試してみてください。`,
    feature:
      `${intro}「ふたりのきもち」の3つの特徴をご紹介します。\n\n①気持ちを○△✕で選んで共有\n②リアルタイムでパートナーに届く\n③28日間の気持ちログと生理周期記録\n\n無料でダウンロードできます。`,
  }
  return bodies[type]
}

function buildHashtags(type: TemplateType): string {
  const common =
    '#ふたりのきもち #カップルアプリ #夫婦アプリ #夫婦時間 #共働き夫婦 #子育て夫婦 #パートナー #夫婦円満 #カップル'
  const extra: Record<TemplateType, string> = {
    sympathy: '#気持ちが伝わる #すれ違い #夫婦のすれ違い #パートナーシップ #夫婦コミュニケーション',
    benefit: '#夫婦コミュニケーション #毎日の習慣 #カップルの習慣 #夫婦改善',
    feature: '#アプリ紹介 #夫婦アプリ紹介 #気持ちの記録 #カップルアプリ紹介',
  }
  return `${common} ${extra[type]}`
}

// ── 文字数カラー ───────────────────────────────────────────────────────────

function charColor(len: number, limit: number): string {
  if (len <= limit * 0.8) return '#b0a0c8'
  if (len <= limit) return '#d4900a'
  if (len <= limit * 1.25) return '#e05030'
  return '#c02020'
}

// ══════════════════════════════════════════════════════════════════════════
// メインコンポーネント
// ══════════════════════════════════════════════════════════════════════════

export default function InstagramToolPage() {
  const [activeTemplate, setActiveTemplate] = useState<TemplateType>('sympathy')
  const [selectedCategory, setSelectedCategory] = useState<Partial<Record<TemplateType, string>>>({})
  const [slides, setSlides] = useState<SlideItem[]>(_initSlides)
  const [selectedId, setSelectedId] = useState<number>(_initSelectedId)
  const [theme, setTheme] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showSafeArea, setShowSafeArea] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [notice, setNotice] = useState('')

  // 背景画像管理
  const [bgImages, setBgImages] = useState<BgImage[]>([DEFAULT_BG])
  const [pickerSelId, setPickerSelId] = useState<string>('preset_0')

  // ダウンロード進捗
  const [dlProgress, setDlProgress] = useState<{ current: number; total: number } | null>(null)

  // オフスクリーンダウンロード用 ref (CSSスケールなし・1080×1350)
  const downloadRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const bgUploadRef = useRef<HTMLInputElement>(null)
  const screenshotUploadRef = useRef<HTMLInputElement>(null)

  // ── Derived ──────────────────────────────────────────────────────────
  const selectedIndex = Math.max(0, slides.findIndex(s => s.id === selectedId))
  const selectedSlide = slides[selectedIndex] ?? slides[0]

  // ── Slide handlers ───────────────────────────────────────────────────

  function updateSlide(id: number, field: keyof SlideData, value: string) {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  function addSlide() {
    if (slides.length >= 5) return
    const s = makeSlide({ heading: '', body: '', note: '' }, selectedSlide.bgImage)
    setSlides(prev => [...prev, s])
    setSelectedId(s.id)
  }

  function removeSlide(id: number) {
    if (slides.length <= 1) return
    const idx = slides.findIndex(s => s.id === id)
    const next = slides.filter(s => s.id !== id)
    downloadRefs.current.delete(id)
    setSlides(next)
    setSelectedId(next[Math.min(idx, next.length - 1)].id)
  }

  function duplicateSlide(id: number) {
    if (slides.length >= 5) return
    const idx = slides.findIndex(s => s.id === id)
    if (idx === -1) return
    const copy = makeSlide({ ...slides[idx] }, slides[idx].bgImage)
    const next = [...slides]
    next.splice(idx + 1, 0, copy)
    setSlides(next)
    setSelectedId(copy.id)
  }

  function moveSlide(id: number, dir: -1 | 1) {
    const idx = slides.findIndex(s => s.id === id)
    const to = idx + dir
    if (to < 0 || to >= slides.length) return
    const next = [...slides]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setSlides(next)
  }

  function applyTemplate(type: TemplateType) {
    const bg = slides[0]?.bgImage ?? DEFAULT_BG_URL
    const next = makeDefaultSlides(type, bg)
    setActiveTemplate(type)
    setSelectedCategory(prev => ({ ...prev, [type]: undefined }))
    setSlides(next)
    setSelectedId(next[0].id)
  }

  // ── 背景画像ハンドラー ────────────────────────────────────────────────

  function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const newBgs: BgImage[] = files.map(f => ({
      id: `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: f.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(f),
    }))
    setBgImages(prev => [...prev, ...newBgs])
    setPickerSelId(newBgs[newBgs.length - 1].id)
    // input リセット
    if (bgUploadRef.current) bgUploadRef.current.value = ''
  }

  function applyBgToSlide(slideId: number, bgUrl: string) {
    setSlides(prev => prev.map(s => s.id === slideId ? { ...s, bgImage: bgUrl } : s))
  }

  function applyBgToAll(bgUrl: string) {
    setSlides(prev => prev.map(s => ({ ...s, bgImage: bgUrl })))
  }

  // ── レイアウト / スクリーンショットハンドラー ─────────────────────────

  function setSlideLayout(id: number, layout: SlideLayout) {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, layout } : s))
  }

  function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setSlides(prev => prev.map(s => s.id === selectedId ? { ...s, screenshotUrl: url } : s))
    if (screenshotUploadRef.current) screenshotUploadRef.current.value = ''
  }

  // ── 文言生成 ─────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true)
    try {
      const catKey = selectedCategory[activeTemplate]
      const generated = await generateCopy(theme, activeTemplate, catKey)
      const bg = slides[0]?.bgImage ?? DEFAULT_BG_URL
      const next = generated.map((s, i) => makeSlide(s, bg, i === 0))
      setSlides(next)
      setSelectedId(next[0].id)
    } finally {
      setGenerating(false)
    }
  }

  // ── ダウンロード ─────────────────────────────────────────────────────

  async function captureSlide(id: number): Promise<HTMLCanvasElement | null> {
    const el = downloadRefs.current.get(id)
    if (!el) return null
    const html2canvas = (await import('html2canvas')).default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return html2canvas(el, {
      // scale: 2 で 2160×2700 出力 → Instagram でシャープに表示
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      width: 1080,
      height: 1350,
      x: 0,
      y: 0,
    } as any)
  }

  async function downloadSingleSlide(id: number, displayIndex: number) {
    setDlProgress({ current: 0, total: 1 })
    const canvas = await captureSlide(id)
    if (canvas) {
      const link = document.createElement('a')
      link.download = buildFileName(activeTemplate, displayIndex, 'png')
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    setDlProgress(null)
  }

  async function downloadAllZip() {
    setShowExportModal(false)
    setDlProgress({ current: 0, total: slides.length })
    try {
      const [{ default: JSZip }, html2canvasModule] = await Promise.all([
        import('jszip'),
        import('html2canvas'),
      ])
      const html2canvas = html2canvasModule.default
      const zip = new JSZip()

      for (let i = 0; i < slides.length; i++) {
        setDlProgress({ current: i + 1, total: slides.length })
        const el = downloadRefs.current.get(slides[i].id)
        if (!el) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: null,
          width: 1080,
          height: 1350,
          x: 0,
          y: 0,
        } as any)
        const blob = await canvasToBlob(canvas)
        zip.file(buildFileName(activeTemplate, i, 'png'), blob)
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const d = new Date()
      const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const names: Record<TemplateType, string> = { sympathy: '共感系投稿', benefit: 'ベネフィット訴求', feature: '機能紹介投稿' }
      const zipUrl = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.download = `${date}_${names[activeTemplate]}.zip`
      link.href = zipUrl
      link.click()
      setTimeout(() => URL.revokeObjectURL(zipUrl), 10000)
    } finally {
      setDlProgress(null)
    }
  }

  // ── 下書き保存 / 読込 ────────────────────────────────────────────────

  function handleSaveDraft() {
    saveDraft({
      version: 3,
      theme,
      activeTemplate,
      selectedCategory,
      slidesData: slides.map(({ id: _id, screenshotUrl: _ss, ...rest }) => rest),
      caption,
      hashtags,
    })
    showNotice('下書きを保存しました')
  }

  function handleLoadDraft() {
    const draft = loadDraft()
    if (!draft) { showNotice('下書きが見つかりません'); return }
    const next = draft.slidesData.map((d, i) => makeSlide(d, d.bgImage ?? DEFAULT_BG_URL, i === 0))
    const template: TemplateType = ['sympathy', 'benefit', 'feature'].includes(draft.activeTemplate)
      ? draft.activeTemplate : 'sympathy'
    setActiveTemplate(template)
    setSelectedCategory(draft.selectedCategory ?? {})
    setSlides(next)
    setSelectedId(next[0].id)
    setTheme(draft.theme ?? '')
    setCaption(draft.caption ?? '')
    setHashtags(draft.hashtags ?? '')
    showNotice('下書きを読み込みました')
  }

  function showNotice(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  // ── 選択中の背景画像 URL ──────────────────────────────────────────────
  const pickerBg = bgImages.find(b => b.id === pickerSelId) ?? bgImages[0]

  // ════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: '#f4f0fb', fontFamily: 'sans-serif' }}>

      {/* ── オフスクリーン: ダウンロード専用レンダリング ─────────────────
          ・CSSスケールなし・1080×1350 のネイティブサイズ
          ・html2canvas がこの要素を直接キャプチャ
          ・opacity:0 + position:fixed で視覚的に非表示           */}
      <div
        aria-hidden="true"
        style={{ position: 'fixed', top: 0, left: '-1200px', opacity: 0, pointerEvents: 'none', zIndex: 0 }}
      >
        {slides.map((slide, i) => (
          <SlidePreview
            key={slide.id}
            ref={el => {
              if (el) downloadRefs.current.set(slide.id, el)
              else downloadRefs.current.delete(slide.id)
            }}
            slide={slide}
            index={i}
            total={slides.length}
            bgImage={slide.bgImage}
            layout={slide.layout}
            showSafeArea={false}
          />
        ))}
      </div>

      {/* ── ヘッダー ── */}
      <div style={{ background: '#fff', borderBottom: '1.5px solid #ede8f8', padding: '13px 24px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>

          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#3d2c4e', margin: 0, marginRight: 4, whiteSpace: 'nowrap' }}>
            Instagram 投稿ツール
          </h1>

          {/* テンプレートタブ */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(Object.entries(TEMPLATE_META) as [TemplateType, typeof TEMPLATE_META[TemplateType]][]).map(([type, meta]) => (
              <button
                key={type}
                onClick={() => applyTemplate(type)}
                title={meta.description}
                style={{
                  padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
                  border: `1.5px solid ${activeTemplate === type ? '#9b7fc8' : '#ddd4f0'}`,
                  background: activeTemplate === type ? '#9b7fc8' : 'transparent',
                  color: activeTemplate === type ? '#fff' : '#9b7fc8',
                  cursor: 'pointer', fontSize: 12,
                  fontWeight: activeTemplate === type ? 600 : 400,
                }}
              >
                {meta.label}
              </button>
            ))}
          </div>

          {/* カテゴリ選択 */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#b0a0c8', whiteSpace: 'nowrap' }}>カテゴリ:</span>
            <button
              onClick={() => setSelectedCategory(prev => ({ ...prev, [activeTemplate]: undefined }))}
              style={{
                padding: '4px 10px', borderRadius: 14, whiteSpace: 'nowrap',
                border: `1.5px solid ${!selectedCategory[activeTemplate] ? '#9b7fc8' : '#e8e0f5'}`,
                background: !selectedCategory[activeTemplate] ? '#ede8f8' : 'transparent',
                color: !selectedCategory[activeTemplate] ? '#7c5fc8' : '#b0a0c8',
                cursor: 'pointer', fontSize: 11,
              }}
            >
              ランダム
            </button>
            {getCategories(activeTemplate).map(cat => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(prev => ({ ...prev, [activeTemplate]: cat.key }))}
                style={{
                  padding: '4px 10px', borderRadius: 14, whiteSpace: 'nowrap',
                  border: `1.5px solid ${selectedCategory[activeTemplate] === cat.key ? '#9b7fc8' : '#e8e0f5'}`,
                  background: selectedCategory[activeTemplate] === cat.key ? '#ede8f8' : 'transparent',
                  color: selectedCategory[activeTemplate] === cat.key ? '#7c5fc8' : '#b0a0c8',
                  cursor: 'pointer', fontSize: 11,
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* テーマ + 文言生成 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
            <input
              type="text"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="テーマを入力して文言生成…"
              style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #ddd4f0', fontSize: 13, width: 200, outline: 'none' }}
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: '7px 16px', borderRadius: 8, border: 'none',
                background: generating ? '#c4b5d8' : '#7c5fc8',
                color: '#fff', cursor: generating ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              {generating ? '生成中…' : '文言を生成'}
            </button>
          </div>

          {/* 書き出し確認 + 下書き */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {notice && <span style={{ fontSize: 12, color: '#9b7fc8', fontWeight: 600 }}>{notice}</span>}
            <button
              onClick={() => setShowExportModal(true)}
              style={{
                padding: '7px 16px', borderRadius: 8, border: 'none',
                background: '#3d2c4e', color: '#fff',
                cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              書き出し確認 →
            </button>
            <button onClick={handleSaveDraft} style={ghostBtn}>💾 保存</button>
            <button onClick={handleLoadDraft} style={ghostBtn}>📂 読込</button>
          </div>

        </div>
      </div>

      {/* ── メイン 3 カラム ── */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* ─── LEFT: スライド一覧 ─────────────────────────────────── */}
        <div style={{ width: THUMB_W + 24, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9b7fc8', letterSpacing: '0.06em', marginBottom: 10 }}>
            スライド一覧
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slides.map((slide, i) => {
              const isSel = slide.id === selectedId
              return (
                <button
                  key={slide.id}
                  onClick={() => setSelectedId(slide.id)}
                  style={{
                    position: 'relative', padding: 6, borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${isSel ? '#9b7fc8' : 'transparent'}`,
                    background: isSel ? '#ede8f8' : '#fff',
                    boxShadow: isSel ? '0 2px 10px rgba(155,127,200,0.28)' : '0 1px 4px rgba(0,0,0,0.07)',
                    transition: 'all 0.12s',
                    width: THUMB_W + 12,
                  }}
                >
                  <div style={{ width: THUMB_W, height: THUMB_H, overflow: 'hidden', borderRadius: 6 }}>
                    <div style={{ transform: `scale(${THUMB_SCALE})`, transformOrigin: 'top left', width: 1080, height: 1350 }}>
                      <SlidePreview
                        slide={slide} index={i} total={slides.length}
                        bgImage={slide.bgImage} layout={slide.layout} showSafeArea={false}
                      />
                    </div>
                  </div>
                  <div style={{
                    position: 'absolute', top: 8, left: 8,
                    background: i === 0 ? '#7c5fc8' : '#9b7fc8',
                    color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                  }}>
                    {i === 0 ? '表紙' : String(i + 1)}
                  </div>
                </button>
              )
            })}

            <button
              onClick={addSlide}
              disabled={slides.length >= 5}
              style={{
                padding: '10px 0', borderRadius: 10, width: THUMB_W + 12,
                border: '2px dashed #c4b5d8', background: 'transparent',
                color: '#9b7fc8', cursor: slides.length >= 5 ? 'not-allowed' : 'pointer',
                fontSize: 12, opacity: slides.length >= 5 ? 0.4 : 1,
              }}
            >
              ＋ 追加<br />
              <span style={{ fontSize: 10, opacity: 0.75 }}>{slides.length} / 5</span>
            </button>
          </div>
        </div>

        {/* ─── CENTER: 大きいプレビュー ────────────────────────────── */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ width: PREVIEW_W, height: PREVIEW_H, overflow: 'hidden', borderRadius: 14, boxShadow: '0 6px 28px rgba(0,0,0,0.14)' }}>
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left', width: 1080, height: 1350 }}>
              <SlidePreview
                slide={selectedSlide} index={selectedIndex} total={slides.length}
                bgImage={selectedSlide.bgImage} layout={selectedSlide.layout}
                showSafeArea={showSafeArea}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7c6f8e', cursor: 'pointer' }}>
              <input
                type="checkbox" checked={showSafeArea}
                onChange={e => setShowSafeArea(e.target.checked)}
                style={{ accentColor: '#9b7fc8', cursor: 'pointer' }}
              />
              安全エリアを表示
            </label>
            <button
              onClick={() => downloadSingleSlide(selectedSlide.id, selectedIndex)}
              disabled={dlProgress !== null}
              style={{
                padding: '7px 18px', borderRadius: 8, border: 'none',
                background: dlProgress !== null ? '#c4b5d8' : '#9b7fc8',
                color: '#fff', cursor: dlProgress !== null ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600,
              }}
            >
              このスライドをDL
            </button>
          </div>
        </div>

        {/* ─── RIGHT: 編集パネル ───────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* スライドテキスト編集 */}
          <div style={card}>
            <div style={cardLabel}>
              スライド {selectedIndex === 0 ? '（表紙）' : String(selectedIndex + 1)} を編集
            </div>
            <EditTextarea
              label="見出し"
              value={selectedSlide.heading}
              onChange={v => updateSlide(selectedSlide.id, 'heading', v)}
              rows={selectedIndex === 0 ? 3 : 2}
              placeholder={selectedIndex === 0 ? 'ふたりの気持ちは\nちゃんと届いてる' : '見出しテキスト'}
              limit={selectedIndex === 0 ? 16 : 22}
            />
            <EditTextarea
              label="本文"
              value={selectedSlide.body}
              onChange={v => updateSlide(selectedSlide.id, 'body', v)}
              rows={selectedIndex === 0 ? 2 : 5}
              placeholder={selectedIndex === 0 ? '（任意）短いサブコピー' : '本文テキスト\n改行は自由に使えます'}
              limit={selectedIndex === 0 ? 30 : 70}
            />
            <EditTextarea
              label="補足テキスト（小）"
              value={selectedSlide.note}
              onChange={v => updateSlide(selectedSlide.id, 'note', v)}
              rows={2}
              placeholder="任意"
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid #f0ebfc' }}>
              <SmBtn onClick={() => duplicateSlide(selectedSlide.id)} disabled={slides.length >= 5}>複製</SmBtn>
              <SmBtn onClick={() => moveSlide(selectedSlide.id, -1)} disabled={selectedIndex === 0}>↑ 上へ</SmBtn>
              <SmBtn onClick={() => moveSlide(selectedSlide.id, 1)} disabled={selectedIndex === slides.length - 1}>↓ 下へ</SmBtn>
              <SmBtn onClick={() => removeSlide(selectedSlide.id)} disabled={slides.length <= 1} danger>削除</SmBtn>
            </div>
          </div>

          {/* レイアウト切り替え */}
          <div style={card}>
            <div style={cardLabel}>レイアウト</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['cover', 'detail', 'screenshot'] as SlideLayout[]).map(lyt => {
                const labels: Record<SlideLayout, string> = { cover: '表紙', detail: '説明', screenshot: 'スクリーンショット' }
                const active = selectedSlide.layout === lyt
                return (
                  <button
                    key={lyt}
                    onClick={() => setSlideLayout(selectedSlide.id, lyt)}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12,
                      border: `1.5px solid ${active ? '#9b7fc8' : '#e8e0f5'}`,
                      background: active ? '#ede8f8' : 'transparent',
                      color: active ? '#7c5fc8' : '#b0a0c8',
                      cursor: 'pointer', fontWeight: active ? 600 : 400,
                    }}
                  >
                    {labels[lyt]}
                  </button>
                )
              })}
            </div>
            {selectedSlide.layout === 'screenshot' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedSlide.screenshotUrl && (
                  <img
                    src={selectedSlide.screenshotUrl}
                    alt="screenshot preview"
                    style={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 8, border: '1.5px solid #ede8f8' }}
                  />
                )}
                <button
                  onClick={() => screenshotUploadRef.current?.click()}
                  style={{ ...ghostBtn, textAlign: 'center' as const }}
                >
                  📱 {selectedSlide.screenshotUrl ? 'スクリーンショットを変更' : 'スクリーンショットをアップロード'}
                </button>
                <input
                  ref={screenshotUploadRef}
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotChange}
                  style={{ display: 'none' }}
                />
              </div>
            )}
          </div>

          {/* 背景画像管理 */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={cardLabel}>背景画像</div>
              <button onClick={() => bgUploadRef.current?.click()} style={ghostBtn}>
                ＋ 画像を追加
              </button>
              <input
                ref={bgUploadRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleBgUpload}
                style={{ display: 'none' }}
              />
            </div>

            {/* 画像一覧 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {bgImages.map(bg => (
                <button
                  key={bg.id}
                  title={bg.name}
                  onClick={() => setPickerSelId(bg.id)}
                  style={{
                    width: 48, height: 60, borderRadius: 6, overflow: 'hidden', padding: 0,
                    border: `2.5px solid ${pickerSelId === bg.id ? '#9b7fc8' : 'transparent'}`,
                    cursor: 'pointer', flexShrink: 0,
                    background: `url(${bg.url}) center/cover`,
                    boxShadow: pickerSelId === bg.id ? '0 0 0 1px #9b7fc8' : '0 1px 4px rgba(0,0,0,0.12)',
                  }}
                />
              ))}
            </div>

            {/* 適用ボタン */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => applyBgToSlide(selectedSlide.id, pickerBg.url)}
                style={{ ...ghostBtn, fontSize: 12, flex: 1 }}
              >
                このスライドに適用
              </button>
              <button
                onClick={() => applyBgToAll(pickerBg.url)}
                style={{ ...ghostBtn, fontSize: 12, flex: 1 }}
              >
                全スライドに適用
              </button>
            </div>
          </div>

          {/* キャプション */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={cardLabel}>投稿キャプション</div>
              <button onClick={() => setCaption(buildCaption(theme, activeTemplate))} style={ghostBtn}>
                ✨ 生成
              </button>
            </div>
            <EditTextarea
              label="" value={caption} onChange={setCaption} rows={5}
              placeholder="投稿キャプションを入力、または「生成」ボタンで作成…"
              limit={300} limitLabel="300字目安（2200字まで）"
            />
          </div>

          {/* ハッシュタグ */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={cardLabel}>ハッシュタグ</div>
              <button onClick={() => setHashtags(buildHashtags(activeTemplate))} style={ghostBtn}>
                ✨ 生成
              </button>
            </div>
            <EditTextarea
              label="" value={hashtags} onChange={setHashtags} rows={3}
              placeholder="#ふたりのきもち #夫婦アプリ …"
            />
            {hashtags && (
              <div style={{ fontSize: 11, color: (hashtags.match(/#\S+/g)?.length ?? 0) > 30 ? '#c02020' : '#b0a0c8' }}>
                {hashtags.match(/#\S+/g)?.length ?? 0} タグ（上限 30）
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── ダウンロード進捗インジケーター ── */}
      {dlProgress && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#fff', borderRadius: 14, padding: '14px 20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.16)', border: '1.5px solid #ede8f8',
          zIndex: 400, minWidth: 220,
        }}>
          <div style={{ fontSize: 13, color: '#3d2c4e', fontWeight: 600, marginBottom: 8 }}>
            書き出し中… {dlProgress.current} / {dlProgress.total}
          </div>
          <div style={{ background: '#f0ebfc', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{
              background: '#9b7fc8', height: '100%', borderRadius: 4,
              width: `${(dlProgress.current / dlProgress.total) * 100}%`,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 11, color: '#b0a0c8', marginTop: 6 }}>
            2160×2700px（高画質）で出力中
          </div>
        </div>
      )}

      {/* ── 書き出し確認モーダル ── */}
      {showExportModal && (
        <ExportModal
          slides={slides}
          activeTemplate={activeTemplate}
          onClose={() => setShowExportModal(false)}
          onExport={downloadAllZip}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// 書き出し確認モーダル
// ══════════════════════════════════════════════════════════════════════════

function ExportModal({
  slides,
  activeTemplate,
  onClose,
  onExport,
}: {
  slides: SlideItem[]
  activeTemplate: TemplateType
  onClose: () => void
  onExport: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(30,20,50,0.65)',
        zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, padding: '28px 28px 24px',
        maxWidth: '96vw', boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#3d2c4e', marginBottom: 6 }}>
          書き出し確認
        </div>
        <div style={{ fontSize: 12, color: '#9b7fc8', marginBottom: 20 }}>
          {TEMPLATE_META[activeTemplate].label} · {slides.length} 枚 · 2160×2700px（高画質PNG）
        </div>

        {/* スライドプレビュー一覧 */}
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {slides.map((slide, i) => {
            const hOver = (slide.heading.replace(/\n/g, '').length) > (slide.layout === 'cover' ? 16 : 22)
            const bOver = (slide.body.replace(/\n/g, '').length) > (slide.layout === 'cover' ? 30 : 70)
            const hasWarning = hOver || bOver
            return (
              <div key={slide.id} style={{ flexShrink: 0, textAlign: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: MODAL_W, height: MODAL_H, overflow: 'hidden', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
                    <div style={{ transform: `scale(${MODAL_SCALE})`, transformOrigin: 'top left', width: 1080, height: 1350 }}>
                      <SlidePreview
                        slide={slide} index={i} total={slides.length}
                        bgImage={slide.bgImage} layout={slide.layout} showSafeArea={false}
                      />
                    </div>
                  </div>
                  {hasWarning && (
                    <div style={{
                      position: 'absolute', top: 4, right: 4,
                      background: '#e05030', color: '#fff', borderRadius: 20,
                      padding: '2px 7px', fontSize: 10, fontWeight: 700,
                    }}>
                      文字量⚠️
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#7c6f8e', marginTop: 5 }}>
                  {i === 0 ? '表紙' : String(i + 1)}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ ...ghostBtn, padding: '9px 20px', fontSize: 13 }}>
            閉じる
          </button>
          <button
            onClick={onExport}
            style={{
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: '#3d2c4e', color: '#fff', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
            }}
          >
            ZIP で書き出す
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// 共通スタイル
// ══════════════════════════════════════════════════════════════════════════

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14,
  padding: '16px 16px 12px', border: '1.5px solid #ede8f8',
  display: 'flex', flexDirection: 'column', gap: 10,
}

const cardLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#9b7fc8', letterSpacing: '0.05em',
}

const ghostBtn: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 8,
  border: '1.5px solid #ddd4f0', background: 'transparent',
  color: '#7c6f8e', cursor: 'pointer', fontSize: 12, fontWeight: 500,
}

// ══════════════════════════════════════════════════════════════════════════
// サブコンポーネント
// ══════════════════════════════════════════════════════════════════════════

type EditTextareaProps = {
  label: string
  value: string
  onChange: (v: string) => void
  rows: number
  placeholder?: string
  limit?: number
  limitLabel?: string
}

function EditTextarea({ label, value, onChange, rows, placeholder, limit, limitLabel }: EditTextareaProps) {
  const len = value.replace(/\n/g, '').length
  const color = limit ? charColor(len, limit) : '#b0a0c8'
  const isOver = limit ? len > limit : false
  const isDanger = limit ? len > limit * 1.25 : false

  return (
    <div>
      {(label || limit) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'baseline' }}>
          {label && <label style={{ fontSize: 11, color: '#7c6f8e', fontWeight: 600 }}>{label}</label>}
          {limit && (
            <span style={{ fontSize: 10, color, fontWeight: isOver ? 700 : 400 }}>
              {len} / {limitLabel ?? limit}
              {isDanger ? ' ⚠️ 文字数超過' : isOver ? ' （自動縮小）' : ''}
            </span>
          )}
        </div>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 11px', borderRadius: 8,
          border: `1.5px solid ${isDanger ? '#e05030' : isOver ? '#f0b090' : '#ede8f8'}`,
          background: isDanger ? '#fff8f6' : isOver ? '#fffaf7' : '#fdfcff',
          fontSize: 13, lineHeight: 1.65, resize: 'vertical',
          boxSizing: 'border-box', outline: 'none', color: '#3d2c4e',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      />
    </div>
  )
}

type SmBtnProps = {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}

function SmBtn({ onClick, disabled, danger, children }: SmBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 12px', borderRadius: 6, fontSize: 12,
        border: `1.5px solid ${danger ? '#f0ddd4' : '#e8e0f5'}`,
        background: 'transparent',
        color: disabled ? '#ccc' : danger ? '#c89b7f' : '#7c6f8e',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}
