# Animation plans

Produced by an animation audit of the codebase at commit `1bbbbf8`, against
Emil Kowalski's motion philosophy. Each plan is self-contained: exact file
paths, current code, target values, boundaries and a feel check. An executor
needs no context beyond the plan file it is given.

**These plans change motion only.** None of them alters markup, behaviour, data
or copy.

## Plans

| # | Title | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| [001](001-replace-transition-all-with-transition-colors.md) | Replace `transition-all` with `transition-colors` where only colours change | HIGH | Performance | **DONE** |
| [002](002-respect-prefers-reduced-motion.md) | Respect `prefers-reduced-motion` | HIGH | Accessibility | **DONE** |
| [003](003-add-motion-tokens.md) | Add easing and duration tokens to the theme | MEDIUM | Cohesion & tokens | TODO |
| [004](004-lengthen-and-ease-the-modal-entrance.md) | Give the modal entrance a proper duration and curve | MEDIUM | Easing & duration | TODO |
| [005](005-add-press-feedback-to-buttons.md) | Give buttons press feedback | MEDIUM | Physicality | TODO |

## Recommended order

```
001 ─┐
002 ─┤  independent, run in any order or in parallel
003 ─┴─→ 004
         005
```

1. **001** and **002** first. They are independent of everything else and carry
   the most value: 001 is a mechanical correctness fix across ~74 sites, 002
   closes a real accessibility gap affecting 36 perpetual animations.
2. **003** next. It adds the easing tokens and changes nothing on its own.
3. **004** and **005** last, in either order. **Both depend on 003** — each uses
   the `ease-out` token, and running either first would silently apply
   Tailwind's weak default curve instead. Both plans open with a step that
   checks for the token and stops if it is missing.

001 and 004 both touch `transition-all`, but on different files
(`src/components/ui/Modal.tsx` is explicitly out of scope for 001), so there is
no conflict.

## Context the plans assume

- **Stack**: React + Vite + Tailwind v4.3.3. Motion is entirely Tailwind utility
  classes — no `@keyframes` of the app's own, no motion library.
- **`motion` (Framer Motion) is in `package.json` and imported by zero files.**
  Nothing in these plans uses it. Worth removing separately.
- **Personality**: a crisp operational dashboard used on phones in shops during
  shifts, not a playful consumer app. Motion should stay quick and
  non-decorative. Tailwind v4 gates `hover:` behind `@media (hover: hover)`, so
  on the phones staff use, hover states never fire — which is why press feedback
  (005) matters more here than it would elsewhere.

## Missed opportunities — not planned, recorded

Additive rather than corrective. None has a plan; raise one if wanted.

- **P&L month stepper** (`src/components/pnl/PnlWorkspace.tsx`) — stepping
  ◀ / ▶ re-renders the whole sheet instantly. A short directional slide would
  explain where the new month came from. Used rarely enough to afford it.
- **Shift submission** — the app's most consequential action, performed once per
  shift, currently completes with no confirming motion at all.
- **Report tab switches** (`src/components/modules/ReportsManager.tsx`) —
  content teleports between the five tabs. Deliberately *not* recommended: these
  are hit tens of times a day, and at that frequency the guidance is to reduce
  motion, not add it.

## Findings rejected during the audit

Recorded so they are not re-raised:

- **Ungated `hover:` motion** — Tailwind v4 wraps the `hover:` variant in
  `@media (hover: hover)`, so the four `hover:translate-x-0.5` instances in
  `src/components/admin/DashboardOverview.tsx` already cannot fire on touch.
- **Modal scales from centre** — correct. Modals are exempt from the
  scale-from-trigger rule; only trigger-anchored surfaces (popovers, dropdowns,
  tooltips) need `transform-origin`.
- **Modal entry via `@starting-style`** — already the recommended approach for a
  JS-free entrance, and `scale-95` correctly avoids appearing from nothing.
- **`scale(0)` anywhere** — none found.
