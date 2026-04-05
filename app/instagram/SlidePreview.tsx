'use client'

import { forwardRef } from 'react'
import { SlideData, SlideLayout } from './slideTemplates'

type Props = {
  slide: SlideData
  index: number
  total: number
  bgImage: string
  layout: SlideLayout
  showSafeArea?: boolean
}

// 文字数に応じてフォントサイズを自動縮小
function calcFontSize(text: string, base: number, limit: number): number {
  const len = text.replace(/\n/g, '').length
  if (len <= limit) return base
  return Math.max(Math.round(base * (limit / len)), Math.floor(base * 0.62))
}

function calcLineHeight(text: string, base: number, limit: number): number {
  const len = text.replace(/\n/g, '').length
  if (len <= limit) return base
  return Math.max(1.5, base - (len - limit) * 0.008)
}

const SlidePreview = forwardRef<HTMLDivElement, Props>(
  ({ slide, index, total, bgImage, layout, showSafeArea = false }, ref) => {
    const isCover = layout === 'cover'
    const isScreenshot = layout === 'screenshot'

    const headingSize = isCover
      ? calcFontSize(slide.heading, 78, 16)
      : calcFontSize(slide.heading, 56, 22)
    const bodySize = isCover
      ? calcFontSize(slide.body, 42, 30)
      : calcFontSize(slide.body, 40, 70)
    const headingLH = isCover
      ? calcLineHeight(slide.heading, 1.65, 16)
      : calcLineHeight(slide.heading, 1.55, 22)
    const bodyLH = isCover
      ? calcLineHeight(slide.body, 1.9, 30)
      : calcLineHeight(slide.body, 2.0, 70)

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1350,
          position: 'relative',
          overflow: 'hidden',
          fontFamily: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
          flexShrink: 0,
        }}
      >
        {/* 背景画像 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgImage}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          crossOrigin="anonymous"
        />

        {/* オーバーレイ */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isScreenshot
              ? 'rgba(255,255,255,0.72)'
              : isCover
                ? 'rgba(255,255,255,0.28)'
                : 'rgba(255,255,255,0.38)',
          }}
        />

        {/* 安全エリアガイド */}
        {showSafeArea && (
          <div
            style={{
              position: 'absolute',
              top: 90,
              left: 70,
              right: 70,
              bottom: 140,
              border: '3px dashed rgba(155,127,200,0.55)',
              borderRadius: 16,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -32,
                left: 0,
                fontSize: 22,
                color: 'rgba(155,127,200,0.8)',
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              安全エリア
            </span>
          </div>
        )}

        {isCover ? (
          /* ── 表紙レイアウト ── */
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center',
              padding: '140px 100px', textAlign: 'center', gap: 52,
            }}
          >
            <div style={{ width: 64, height: 4, borderRadius: 2, background: 'linear-gradient(90deg,#c4b5d8,#9b7fc8)' }} />
            {slide.heading && (
              <h2 style={{ fontSize: headingSize, fontWeight: 700, lineHeight: headingLH, color: '#3d2c4e', letterSpacing: '0.06em', whiteSpace: 'pre-wrap', margin: 0 }}>
                {slide.heading}
              </h2>
            )}
            {slide.body && (
              <p style={{ fontSize: bodySize, fontWeight: 400, lineHeight: bodyLH, color: '#5a4e6e', whiteSpace: 'pre-wrap', margin: 0, letterSpacing: '0.03em' }}>
                {slide.body}
              </p>
            )}
            {slide.note && (
              <p style={{ fontSize: 30, fontWeight: 400, lineHeight: 1.7, color: '#9b7fc8', whiteSpace: 'pre-wrap', margin: 0 }}>
                {slide.note}
              </p>
            )}
          </div>

        ) : isScreenshot ? (
          /* ── スクリーンショットレイアウト ── */
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center',
              padding: '100px 80px 140px', textAlign: 'center', gap: 48,
            }}
          >
            {slide.heading && (
              <h2 style={{ fontSize: headingSize, fontWeight: 700, lineHeight: headingLH, color: '#3d2c4e', letterSpacing: '0.05em', whiteSpace: 'pre-wrap', margin: 0 }}>
                {slide.heading}
              </h2>
            )}

            {/* スマホフレーム */}
            <div
              style={{
                width: 460,
                height: 620,
                borderRadius: 48,
                border: '10px solid #3d2c4e',
                overflow: 'hidden',
                background: '#f8f5ff',
                boxShadow: '0 20px 72px rgba(61,44,78,0.32)',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {/* ノッチ */}
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 120, height: 20, background: '#3d2c4e', borderRadius: '0 0 14px 14px',
                zIndex: 2,
              }} />
              {slide.screenshotUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={slide.screenshotUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 20, color: '#c4b5d8',
                }}>
                  <div style={{ fontSize: 56 }}>📱</div>
                  <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.5 }}>
                    スクリーンショットを<br />アップロード
                  </div>
                </div>
              )}
            </div>

            {slide.note && (
              <p style={{ fontSize: 30, fontWeight: 400, lineHeight: 1.75, color: '#7c6f8e', whiteSpace: 'pre-wrap', margin: 0 }}>
                {slide.note}
              </p>
            )}
          </div>

        ) : (
          /* ── 説明スライドレイアウト ── */
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center',
              padding: '130px 90px 120px', textAlign: 'center', gap: 56,
            }}
          >
            {slide.heading && (
              <h2 style={{ fontSize: headingSize, fontWeight: 700, lineHeight: headingLH, color: '#3d2c4e', letterSpacing: '0.05em', whiteSpace: 'pre-wrap', margin: 0 }}>
                {slide.heading}
              </h2>
            )}
            {slide.heading && slide.body && (
              <div style={{ width: 48, height: 3, borderRadius: 2, background: 'rgba(155,127,200,0.5)', flexShrink: 0 }} />
            )}
            {slide.body && (
              <p style={{ fontSize: bodySize, fontWeight: 400, lineHeight: bodyLH, color: '#4a4458', whiteSpace: 'pre-wrap', margin: 0, letterSpacing: '0.03em' }}>
                {slide.body}
              </p>
            )}
            {slide.note && (
              <p style={{ fontSize: 30, fontWeight: 400, lineHeight: 1.75, color: '#7c6f8e', whiteSpace: 'pre-wrap', margin: 0 }}>
                {slide.note}
              </p>
            )}
          </div>
        )}

        {/* ページドット */}
        <div style={{ position: 'absolute', bottom: 62, right: 80, display: 'flex', gap: 10, alignItems: 'center' }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ width: i === index ? 28 : 10, height: 10, borderRadius: 5, background: i === index ? '#9b7fc8' : 'rgba(155,127,200,0.3)' }} />
          ))}
        </div>

        {/* ロゴ */}
        <div style={{ position: 'absolute', bottom: 58, left: 80, fontSize: 26, color: '#9b7fc8', fontWeight: 600, letterSpacing: '0.08em' }}>
          ふたりのきもち
        </div>
      </div>
    )
  }
)

SlidePreview.displayName = 'SlidePreview'
export default SlidePreview
