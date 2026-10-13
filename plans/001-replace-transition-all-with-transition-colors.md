# 001 — Replace `transition-all` with `transition-colors` where only colours change

- **Status**: DONE
- **Commit**: 1bbbbf8
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: ~74 occurrences across 24 files, one-line class edits only

## Problem

`transition-all` appears 155 times in `src/`. In ~74 of those the only thing that
changes on `hover:` / `focus:` / `disabled:` is a colour — background, text or
border. `transition-all` compiles to `transition-property: all`, which tells the
browser to animate *every* animatable property that changes, including layout
properties that run off the GPU.

Current, typical (`src/components/shifts/ShiftsManager.tsx`):

```jsx
className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition-all"
```

Only `background-color` and `color` change here, yet the browser is asked to
watch all of them. This matters most in the dense tables and the closing wizard,
where dozens of these sit in one scroll view and every hover re-evaluates.

The codebase already uses the correct utility 88 times, so this is drift from an
existing convention rather than a new idea.

## Target

Each affected element transitions only what actually changes:

```jsx
/* target */
className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition-colors"
```

`transition-colors` covers `color`, `background-color`, `border-color`,
`text-decoration-color`, `fill` and `stroke` — every colour case in this app.

Where a box-shadow also changes, add `transition-shadow` alongside it rather
than falling back to `transition-all`.

Where a `transform` genuinely changes (`hover:scale-*`, `hover:translate-*`,
`group-hover:translate-*`), **leave `transition-all` alone** — it is out of
scope for this plan. There are four such sites, all in
`src/components/admin/DashboardOverview.tsx` (lines 243, 257, 271, 285).

## Repo conventions to follow

- The correct utility is already the house pattern. Exemplar:
  `src/components/ui/IconButton.tsx:56` — a button whose tone classes change
  `text-*` and `bg-*` on hover, using `transition-colors` and nothing else.
- Colour-plus-shadow exemplar: `src/components/ui/StatCard.tsx:110` —
  `transition-colors transition-shadow` composed rather than `transition-all`.
- Class strings are plain Tailwind in `className`; there is no `cn()`/`clsx`
  helper in this repo. Edit the string in place.

## Steps

1. List the candidate sites:

   ```bash
   grep -rn "transition-all" src/ | grep -E "hover:(bg|text|border)-" | grep -vE "hover:(scale|translate|p[xy]?-|w-|h-)"
   ```

2. For each line returned, read the full `className` string and classify:
   - Only colour utilities change state (`hover:bg-*`, `hover:text-*`,
     `hover:border-*`, `focus:bg-*`, `disabled:bg-*`) → replace the single token
     `transition-all` with `transition-colors`.
   - A shadow also changes (`hover:shadow-*`) → replace with
     `transition-colors transition-shadow`.
   - A `transform` or any size/spacing utility also changes → **skip it**, leave
     `transition-all` as-is.
3. Do not touch the four transform sites in
   `src/components/admin/DashboardOverview.tsx` (243, 257, 271, 285).
4. Re-run the grep from step 1 and confirm every remaining hit is one you
   deliberately skipped in step 2.

## Boundaries

- Do NOT touch the 88 existing `transition-colors` usages.
- Do NOT change durations, easings, colours, or any non-motion class.
- Do NOT change markup or component structure — class strings only.
- Do NOT add dependencies.
- Do NOT touch `transition-opacity` (17 uses) or `transition-transform` (2) —
  both are already correctly scoped.
- If a line does not match the code described here (drift since commit 1bbbbf8),
  STOP and report rather than improvising.

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` → exit 0.
  - `npx vitest run` → all tests pass (144 at the time of writing).
  - `npx vite build` → succeeds.
  - `grep -rc "transition-all" src/ | awk -F: '{s+=$2} END {print s}'` → should
    drop from 155 to roughly 81.
- **Feel check**: run `npm run dev`, sign in, and open «Βάρδιες & Ταμείο»:
  - Hover table rows and the action buttons — the colour fade must look exactly
    as it did before. This change should be invisible; if any hover now feels
    *different*, something transform-related was changed by mistake.
  - Open the shift-closing wizard and hover its step buttons and primary
    actions — same check.
  - In DevTools → Performance, record a few seconds while hovering down a long
    table. There should be no layout thrash attributable to hover.
- **Done when**: the grep in step 4 returns only transform-animating sites, the
  three mechanical checks pass, and hovering looks unchanged to the eye.
