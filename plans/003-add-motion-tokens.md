# 003 — Add easing and duration tokens to the theme

- **Status**: DONE
- **Commit**: 1bbbbf8
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`src/index.css`), additive only

## Problem

`src/index.css` documents every design convention this app has — colour roles,
the card recipe, the button shadow rule — and says nothing about motion. There
are no easing or duration tokens, and the app uses almost no explicit easing:

```
ease-in-out    2 occurrences   (the only easing classes in src/)
duration-150  17
duration-200   3
duration-300   1
```

Everything else inherits Tailwind's default transition timing function,
`cubic-bezier(0.4, 0, 0.2, 1)` — a symmetric ease-in-out. Applied to entrances
and exits it starts slow, which delays exactly the moment the user is watching.
Deliberate UI motion wants a strong ease-out instead.

This plan adds the vocabulary. Plans 004 and 005 consume it; neither can be done
properly first.

## Target

Append to the existing `@theme` block in `src/index.css`:

```css
/* target — inside the existing @theme block */
@theme {
  --text-micro: 0.6875rem; /* 11px — existing, leave as is */
  --text-micro--line-height: 1rem;

  /* Motion. Tailwind's built-in curves are symmetric and too weak for
     deliberate UI motion: entrances that start slow delay the moment the
     user is actually watching. These override the built-in `ease-out` and
     `ease-in-out` utilities on purpose.
       ease-out     entering, exiting, and the default for anything uncertain
       ease-in-out  something already on screen moving to a new position
       ease-drawer  iOS-like curve for sheets and drawers
     `ease-in` is deliberately not given a token: starting slow is wrong for
     every interaction in this app. */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

In Tailwind v4 the `--ease-*` namespace backs the `ease-*` utilities, so these
three definitions **override the built-in `ease-out` and `ease-in-out`** and add
a new `ease-drawer`. That override is the point. It affects the two existing
`ease-in-out` usages, which is intended and desirable.

Duration budgets for the rest of this work (from the audit playbook — do not
approximate these elsewhere):

| Element | Duration |
| --- | --- |
| Button press feedback | 100–160ms |
| Tooltips, small popovers | 125–200ms |
| Dropdowns, selects | 150–250ms |
| Modals, drawers | 200–500ms |

No duration tokens are added: Tailwind's `duration-*` scale already covers these
and the app uses it.

## Repo conventions to follow

- The `@theme` block already exists at `src/index.css:7-10`. Extend it; do not
  create a second one.
- Every block in that file carries a comment explaining *why* it exists — see
  the `--text-micro` comment at `src/index.css:3-6`, which explains what the
  token replaced and why. Match that voice.
- This app has no custom colour tokens on purpose (`src/index.css:20-28`
  explains the plain-Tailwind-palette decision). Adding motion tokens is not a
  contradiction — easing has no Tailwind equivalent worth keeping — but keep the
  set small for the same reason.

## Steps

1. Open `src/index.css`.
2. Add the three `--ease-*` declarations and their explanatory comment inside
   the existing `@theme` block, after the two `--text-micro` lines.
3. Change nothing else. No component consumes these yet — plans 004 and 005 do
   that.

## Boundaries

- Do NOT add duration tokens; Tailwind's scale is sufficient.
- Do NOT add an `--ease-in` token.
- Do NOT add colour, spacing, or any other token.
- Do NOT update components in this plan, including the two existing
  `ease-in-out` usages — they pick up the stronger curve automatically.
- Do NOT create a second `@theme` block or a separate tokens file.
- If `src/index.css` does not match the structure described (drift since commit
  1bbbbf8), STOP and report.

## Verification

- **Mechanical**:
  - `npx vite build` → succeeds.
  - The custom curve reaches the output:
    `npx vite build && grep -c "0.23, 1, 0.32, 1\|0.23,1,0.32,1" dist/assets/*.css` → ≥ 1.
    (If it returns 0, the token is defined but unused — that is expected until
    plan 004 lands. Confirm instead that `grep -c "ease-out" dist/assets/*.css`
    reflects the new value by inspecting the generated `--ease-out` custom
    property.)
  - `npx tsc --noEmit` → exit 0.
- **Feel check**: run `npm run dev` and find the two existing `ease-in-out`
  usages (`grep -rn "ease-in-out" src/`). Trigger each:
  - The motion should now feel more decisive — faster at the start of the
    movement, settling more gently at the end.
  - Nothing should feel *slower*; duration has not changed, only the curve.
- **Done when**: the three tokens exist in the `@theme` block with their
  comment, the build succeeds, and the two pre-existing `ease-in-out` elements
  visibly use the stronger curve.
