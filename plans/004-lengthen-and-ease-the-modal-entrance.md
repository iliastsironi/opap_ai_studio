# 004 — Give the modal entrance a proper duration and curve

- **Status**: TODO
- **Commit**: 1bbbbf8
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Depends on**: plan 003 (needs the `ease-out` token)
- **Estimated scope**: 1 file, 2 lines

## Problem

Every dialog in the app goes through `src/components/ui/Modal.tsx`, and both its
layers animate for 150ms on Tailwind's default curve:

```jsx
/* src/components/ui/Modal.tsx:100 — current (backdrop) */
className={`fixed inset-0 ${LAYER_CLASSES[layer]} bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 transition-opacity duration-150 starting:opacity-0`}
```

```jsx
/* src/components/ui/Modal.tsx:106 — current (panel) */
className={`bg-white rounded-2xl shadow-xl w-full ${SIZE_CLASSES[size]} overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col transition-all duration-150 starting:opacity-0 starting:scale-95`}
```

150ms is the budget for a dropdown. A modal is a larger, more disruptive surface
and its budget is **200–500ms**; at 150ms it snaps in rather than arriving, which
reads as cheap on a dialog carrying a whole shift-closing form.

Two things here are already **correct and must not be changed**:

- `starting:opacity-0 starting:scale-95` uses `@starting-style`, which is the
  right way to animate an entrance without JS, and `scale-95` correctly avoids
  scaling from nothing.
- The panel has no `transform-origin` override, so it scales from its centre.
  That is correct for a modal — modals appear centred and are explicitly exempt
  from the scale-from-trigger rule.

## Target

```jsx
/* target — src/components/ui/Modal.tsx:100 (backdrop) */
className={`fixed inset-0 ${LAYER_CLASSES[layer]} bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 transition-opacity duration-200 ease-out starting:opacity-0`}
```

```jsx
/* target — src/components/ui/Modal.tsx:106 (panel) */
className={`bg-white rounded-2xl shadow-xl w-full ${SIZE_CLASSES[size]} overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col transition-[opacity,transform] duration-200 ease-out starting:opacity-0 starting:scale-95`}
```

Three changes per line:

1. `duration-150` → `duration-200` — into the modal band, at its fast end,
   because this app opens dialogs constantly and 300ms+ would start to drag.
2. add `ease-out` — which, after plan 003, resolves to
   `cubic-bezier(0.23, 1, 0.32, 1)` rather than Tailwind's default.
3. on the panel only, `transition-all` → `transition-[opacity,transform]` —
   opacity and transform are the only properties that change, and `all` would
   also animate the `max-h` and layout properties this panel carries.

## Repo conventions to follow

- Modal variants are composed from the `LAYER_CLASSES` / `SIZE_CLASSES` maps at
  the top of the file; motion classes live inline on the element, not in those
  maps. Keep it that way.
- Arbitrary-value transition properties are not yet used in this repo, so
  `transition-[opacity,transform]` is new. It is standard Tailwind v4 syntax and
  needs no config.
- Exemplar for scoping a transition to what actually changes:
  `src/components/ui/StatCard.tsx:110` (`transition-colors transition-shadow`).

## Steps

1. Confirm plan 003 is DONE — `grep -n "ease-out" src/index.css` must show the
   `--ease-out` token. If it is missing, STOP: this plan would silently apply
   Tailwind's weak default curve instead.
2. Open `src/components/ui/Modal.tsx`.
3. On line 100 (backdrop): change `duration-150` to `duration-200 ease-out`.
4. On line 106 (panel): change `transition-all duration-150` to
   `transition-[opacity,transform] duration-200 ease-out`.
5. Change nothing else in the file.

## Boundaries

- Do NOT remove or alter `starting:opacity-0` or `starting:scale-95`.
- Do NOT add a `transform-origin` / `origin-*` class — centre is correct here.
- Do NOT change `SIZE_CLASSES`, `LAYER_CLASSES`, the close-button markup, or the
  focus handling.
- Do NOT apply this to `ConfirmDialog` or any other component — they render
  through this Modal and inherit the change.
- Do NOT exceed `duration-300` — above that a dialog this frequent starts to
  feel slow.
- If lines 100 and 106 do not match the current code quoted above (drift since
  commit 1bbbbf8), STOP and report.

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` → exit 0.
  - `npx vitest run` → all pass.
  - `npx vite build` → succeeds.
- **Feel check**: run `npm run dev`, sign in, and open several dialogs — the
  shift-closing wizard, a confirm dialog, the «Προθεσμία» modal in Εθνικό
  Λαχείο:
  - The panel should *arrive* rather than snap — noticeably softer than before,
    without feeling slow.
  - In DevTools → **Animations**, set playback speed to 10% and reopen a modal.
    Confirm the panel scales from 95% to 100% while fading, both finishing
    together, and that it decelerates into place rather than moving at a
    constant rate.
  - Open and immediately close a dialog repeatedly. Because these are CSS
    transitions, the motion should retarget smoothly rather than restarting.
  - With *prefers-reduced-motion* emulated (after plan 002), the panel should
    fade without scaling.
- **Done when**: both lines match the target exactly, all three mechanical
  checks pass, and the 10%-speed replay shows a decelerating entrance.
