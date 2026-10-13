# 002 — Respect `prefers-reduced-motion`

- **Status**: DONE
- **Commit**: 1bbbbf8
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 1 CSS file (new block in `src/index.css`), no component changes

## Problem

The app has **zero** `prefers-reduced-motion` handling. Searching `src/` and
`index.html` for `prefers-reduced-motion`, `motion-reduce:`, `motion-safe:` or
`useReducedMotion` returns nothing.

Against that, 36 **perpetual** animations run across the app:

| Utility | Count | Notable sites |
| --- | --- | --- |
| `animate-spin` | 22 | loading spinners throughout |
| `animate-pulse` | 9 | `src/components/layout/Topbar.tsx:76`, `src/components/modules/VltManager.tsx:232`, `src/components/modules/OpapGamesManager.tsx:152`, `src/components/admin/OrganizationSettings.tsx:96`, `src/components/common/LoadingSkeleton.tsx:5` |
| `animate-bounce` | 3 | `src/components/copilot/CopilotPage.tsx:315,316,317` (typing indicator) |
| `animate-ping` | 2 | `src/components/ui/Badge.tsx:94` |

Several are not transient. The green "live" dot in the Topbar pulses on every
screen, for the whole session:

```jsx
/* src/components/layout/Topbar.tsx:76 — current */
<span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
```

For a user with vestibular sensitivity, continuous motion that cannot be escaped
is the worst category of animation problem — worse than a one-off transition
that ignores the preference. Staff use this app for a whole shift.

## Target

A single global block in `src/index.css` that honours the preference without
removing all feedback. Reduced motion means *fewer and gentler*, not zero: keep
opacity and colour changes, drop movement and looping.

```css
/* target — append to src/index.css */

/* Users who ask for reduced motion get the information, not the movement:
   colour and opacity transitions stay (they explain state changes), looping
   and travelling animations stop. Spinners keep a slow, non-rotating pulse so
   "still loading" is still legible. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Loading indicators must still read as "working". Replace rotation and
     travel with a gentle opacity pulse that does not move anything. */
  .animate-spin,
  .animate-ping,
  .animate-bounce {
    animation: reduced-motion-pulse 1.6s ease-in-out infinite !important;
  }

  .animate-pulse {
    animation: reduced-motion-pulse 2.4s ease-in-out infinite !important;
  }
}

@keyframes reduced-motion-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
```

Note the deliberate exception: the blanket rule kills *all* animation, then
spinners and status dots are given back a non-moving opacity pulse. Without that
exception a loading spinner would freeze mid-rotation and read as a hung screen.

## Repo conventions to follow

- Global CSS lives in `src/index.css`. It already carries app-wide rules of this
  shape — see the `input[type='number']` spinner suppression at
  `src/index.css:48-56` and the `@media print` block at `src/index.css:61`.
- That file documents *why* for each block in a comment above it. Match that
  tone: explain the reasoning, not the mechanics.
- Tailwind v4 is imported at `src/index.css:1` via `@import "tailwindcss";`.
  Plain CSS after that point is fine and is how the file already works.
- Put the new block after the existing `@theme` block and before the
  `@media print` block, so screen rules stay grouped together.

## Steps

1. Open `src/index.css`.
2. Insert the `@media (prefers-reduced-motion: reduce)` block and the
   `@keyframes reduced-motion-pulse` definition from **Target** above, placing
   them after the design-conventions comment block (which ends around line 35)
   and before the `.print-only` rule at line 38.
3. Keep the explanatory comment — this file documents its reasoning throughout.
4. Change nothing in any `.tsx` file. No component needs to know about this.

## Boundaries

- Do NOT remove or change any `animate-*` class in any component.
- Do NOT add a JS-side `useReducedMotion` hook — there is no motion library in
  use (`motion` is in `package.json` but imported by zero files), so CSS is the
  whole surface.
- Do NOT touch the `@media print` block.
- Do NOT add dependencies.
- If `src/index.css` does not look as described (drift since commit 1bbbbf8),
  STOP and report.

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` → exit 0 (no TS touched, but confirm nothing broke).
  - `npx vite build` → succeeds, and the built CSS contains
    `prefers-reduced-motion`:
    `npx vite build && grep -c "prefers-reduced-motion" dist/assets/*.css` → ≥ 1.
- **Feel check**: run `npm run dev`, then in Chrome DevTools open the **Rendering**
  panel and set *Emulate CSS media feature prefers-reduced-motion* to
  `reduce`. With it on:
  - The Topbar's green "live" dot stops pulsing in size and instead fades gently
    — it must still be visibly "alive", not frozen.
  - Load a screen that shows a spinner (switch to «Αναφορές & Analytics» and
    watch the module load). The spinner must **not** freeze mid-rotation; it
    should fade in and out so the screen still reads as loading.
  - Open any modal. It should appear without the scale/slide, but still fade —
    comprehension preserved, movement removed.
  - Hover a button. The colour change should be effectively instant, not absent.
  - Set the setting back to *No emulation* and confirm all normal motion returns.
- **Done when**: with reduced motion emulated, nothing in the UI travels or
  rotates, every loading indicator still communicates activity, and no element
  becomes invisible or frozen.
