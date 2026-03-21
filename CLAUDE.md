# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Build for production
npm run lint     # Run ESLint
```

Requires `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
```

## Architecture

**Sync Couple (ふたりのきもち)** — A couples' emotional sync app built with Next.js 14 + Supabase + Tailwind CSS.

### Core concept

Two partners share a `couple_id`. Each day they independently select a mood (○ circle / △ triangle / ✕ cross). When both select ○, a "Perfect Sync" is triggered. The app also tracks menstrual cycles and weekly emotional patterns.

### Key files

- **`app/page.tsx`** — The entire app UI (~1900 lines, single client component). Contains all screens, business logic, Supabase subscriptions, and animations.
- **`app/login/page.tsx`** — Auth UI (email/password).
- **`app/auth/actions.ts`** — Server actions: `signIn`, `signUp`, `logout`.
- **`app/auth/callback/route.ts`** — OAuth session exchange after redirect.
- **`middleware.ts`** — Redirects unauthenticated users to `/login`; authenticated users away from `/login`.
- **`lib/supabase/client.ts`** / **`server.ts`** — Browser and SSR Supabase clients.

### Data model (Supabase `sync_table`)

One row per user. Partners share the same `couple_id` and different `user_email`.

Key columns: `couple_id`, `user_email`, `kimochi` (circle/triangle/cross/null), `kimochi_date`, `last_sync_date`, `sync_goal`, `moon_start/end/year/month` (YYYYMMDD ints), `period_history` (JSONB), `kimochi_log` (JSONB, 28-day history), `reminder_weekday/weekend` (hour 0–23).

### Data flow in `app/page.tsx`

1. On mount: fetch authenticated user email, load all rows matching `couple_id`.
2. `myRow` = row where `user_email` matches; `partnerRow` = the other row with same `couple_id`.
3. Supabase Realtime subscription keeps both rows in sync without page refresh.
4. Derived state: today's moods, cycle predictions, cooldown timers, weekly emotion analysis.

### Screens

- **LoadingScreen** — Initial load
- **NoCoupleIdScreen** — No `couple_id` set yet
- **HomeScreen** — Mood selection, partner status, match banner, moon calendar, weekly review
- **SettingsScreen** — Couple ID, sync goals, reminders, period cycle tracking

### Animations

Custom Tailwind animations defined in `tailwind.config.ts`: `heartbeat`, `fadeUp`, `pop`, `float`, `ripple`. Dynamic animation-delay classes (`animation-delay-100` … `500`) are safelisted.

### Localization

The app is in Japanese. Date handling uses a custom `getLocalDateStr()` to avoid UTC offset issues. Timezone-aware logic is critical — do not use plain `new Date().toISOString()` for local dates.
