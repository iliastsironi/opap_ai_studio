# 005 — Give buttons press feedback

- **Status**: TODO
- **Commit**: 1bbbbf8
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Depends on**: plan 003 (uses the `ease-out` token)
- **Estimated scope**: 1 shared component + ~6 primary action buttons

## Problem

Only 8 elements in the whole app respond to being pressed. `active:scale-95`
appears at:

```
src/components/common/ErrorBoundary.tsx:76
src/components/shifts/ShiftDetailsModal.tsx:1014
src/components/shifts/ShiftClosingWizard.tsx:2772
src/components/shifts/ShiftClosingWizard.tsx:3352
src/components/shifts/ShiftReceiptPrintView.tsx:580
src/components/shifts/ShiftReceiptPrintView.tsx:606
src/components/shifts/CashDenominationCounter.tsx:179
src/components/shifts/CashDenominationCounter.tsx:222
```

Everything else — every `IconButton` in every table row, every primary action —
has only a hover state:

```jsx
/* src/components/ui/IconButton.tsx:56 — current */
className={`inline-flex items-center justify-center ${SIZE_CLASSES[size]} shrink-0 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1 ${TONE_CLASSES[tone]} ${className}`}
```

This matters more here than in a desktop app. Tailwind v4 wraps `hover:` in
`@media (hover: hover)`, so on the phones your staff actually use **the hover
state never fires at all**. Press feedback is the only thing that confirms a tap
landed on the right control — and these are people tapping row actions in dense
tables while counting cash.

## Target

`IconButton` gains press feedback for every use at once:

```jsx
/* target — src/components/ui/IconButton.tsx:56 */
className={`inline-flex items-center justify-center ${SIZE_CLASSES[size]} shrink-0 rounded-lg transition-colors transition-transform duration-150 ease-out active:scale-[0.97] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1 ${TONE_CLASSES[tone]} ${className}`}
```

Values, not approximations:

- **`scale(0.97)`** — the audit's press-feedback value. Subtle enough to read as
  physical rather than as the button shrinking.
- **150ms, `ease-out`** — inside the 100–160ms button-press budget, using the
  token from plan 003.
- **`disabled:active:scale-100`** — a disabled button must not respond to being
  pressed.

The eight existing sites use `active:scale-95` (0.95). That is inside the
acceptable 0.95–0.98 range, so **leave them alone** — churning them to 0.97 is
not worth the diff, and the difference is imperceptible.

Then add the same `active:scale-[0.97]` to the primary submit buttons that carry
the app's most consequential actions and currently have no press state:

- `src/components/shifts/ShiftOpeningModal.tsx` — the open-shift submit button
- `src/components/pnl/PnlWorkspace.tsx` — the month-stepper buttons
  (`aria-label="Προηγούμενος μήνας"` / `"Επόμενος μήνας"`)
- `src/components/ui/Modal.tsx` — the footer's `ModalActions` save button
  (`src/components/ui/Modal.tsx:196` onwards)

Find them with:

```bash
grep -rn "type=\"submit\"\|bg-indigo-600 hover:bg-indigo-700" src/components/ | grep -v "active:scale"
```

## Repo conventions to follow

- `IconButton` is the shared row-action component
  (`src/components/ui/IconButton.tsx`) — changing it there covers every table in
  the app, which is why it is step 1.
- Tone variants live in the `TONE_CLASSES` map; motion goes on the base class
  string, not into the map. See how `transition-colors` is already placed at
  line 56.
- Exemplar of the pattern done correctly in this repo:
  `src/components/shifts/CashDenominationCounter.tsx:179` — a small square
  stepper button with `active:scale-95`.
- Arbitrary scale values use bracket syntax: `active:scale-[0.97]`. Tailwind has
  no built-in `scale-97`.

## Steps

1. Confirm plan 003 is DONE — `grep -n "ease-out" src/index.css` must show the
   token. If missing, STOP.
2. Edit `src/components/ui/IconButton.tsx:56` to the target class string above.
3. Run the grep from **Target** and, for each primary/submit button it returns
   that has no `active:` state, add `active:scale-[0.97]` and — only if the
   element lacks any transition — `transition-transform duration-150 ease-out`.
   Most already carry `transition-colors` or `transition-all`, in which case add
   only the `active:` class.
4. Do not add press feedback to: text links, table rows, tab buttons, or
   anything inside `ShiftReceiptPrintView`'s print output.

## Boundaries

- Do NOT change the eight existing `active:scale-95` sites.
- Do NOT change `SIZE_CLASSES`, `ICON_SIZE_CLASSES` or `TONE_CLASSES`.
- Do NOT add press feedback to non-interactive elements or to whole rows.
- Do NOT use a scale below 0.95 — anything stronger reads as the button
  collapsing.
- Do NOT add dependencies.
- If `src/components/ui/IconButton.tsx:56` does not match the current code
  quoted above (drift since commit 1bbbbf8), STOP and report.

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` → exit 0.
  - `npx vitest run` → all pass.
  - `npx vite build` → succeeds.
- **Feel check**: run `npm run dev`, sign in, open «Βάρδιες & Ταμείο»:
  - Press and hold a row-action icon button. It should dip slightly and hold
    there, returning when released — not flicker.
  - **Test on a touch viewport.** In DevTools, toggle device emulation to a
    phone and tap the same buttons. Since `hover:` does not fire there, this
    press state is the only feedback — confirm it is clearly visible.
  - Press a disabled button (any row action on a submitted shift). It must not
    scale at all.
  - In DevTools → Animations at 10% speed, confirm the dip is a smooth
    deceleration rather than a linear snap.
  - With *prefers-reduced-motion* emulated (after plan 002), the scale should be
    suppressed while the colour change remains.
- **Done when**: every `IconButton` in the app responds to press, disabled ones
  do not, the three mechanical checks pass, and the effect is clearly felt on a
  simulated phone.
