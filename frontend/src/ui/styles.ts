// Shared Tailwind class strings for the signed-in screens (utilities only). All colours and the two display
// fonts come from app.css's @theme (canvas/surface/ink/muted/accent/mint/peach/lavender..., font-display/font-mono).
//
// WHY THE TRAILING `!` ON SOME UTILITIES: app.css (the landing page) has unlayered global element rules —
// h1/h2/h3 are landing-page sized, `p { margin-top: 0 }`, and `button, input, select { font: inherit }`.
// Unlayered CSS beats Tailwind's layered utilities, so on those elements size/weight/leading/margin utilities
// need Tailwind's important modifier (`text-sm!`) to apply. The Heading, Button and Input pieces below
// already do this; use them rather than raw <h1>/<button>/<input> styling. (No `mt-*` on a <p> either.)
//
// Write `!` utilities out LITERALLY in source (e.g. `font-mono!`, `text-sm!`). Tailwind finds classes by
// scanning text, so `${SOME_CONSTANT}!` never produces the important variant and the class is silently missing.

export type Tint = 'mint' | 'peach' | 'lavender'

/** Pastel background + readable ink; the colours live in app.css's @theme (--color-mint, --color-mint-ink, ...). */
export const TINT: Record<Tint, string> = {
  mint: 'bg-mint text-mint-ink',
  peach: 'bg-peach text-peach-ink',
  lavender: 'bg-lavender text-lavender-ink',
}

export const CARD =
  'rounded-2xl border border-border bg-surface shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_6%,transparent),0_16px_34px_-20px_color-mix(in_srgb,var(--color-ink)_30%,transparent)]'

/** More distinct success/failure elevation for a question after it has been graded. */
export const GRADED_CARD_SHADOW = {
  correct:
    '!shadow-[0_2px_5px_color-mix(in_srgb,var(--color-mint-ink)_16%,transparent),0_18px_38px_-14px_color-mix(in_srgb,var(--color-mint-ink)_38%,transparent),0_0_30px_-4px_color-mix(in_srgb,var(--color-mint)_92%,transparent)]',
  incorrect:
    '!shadow-[0_2px_5px_color-mix(in_srgb,var(--color-peach-ink)_16%,transparent),0_18px_38px_-14px_color-mix(in_srgb,var(--color-peach-ink)_38%,transparent),0_0_30px_-4px_color-mix(in_srgb,var(--color-peach)_92%,transparent)]',
} as const

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
export const FOCUS_RING = FOCUS

/** Text input / textarea skin (add `h-10` for an <input>, and a width: `w-full`, `flex-1`, `w-52`, ...). Font utilities are `!` because of `input { font: inherit }`. */
export const INPUT =
  'block rounded-[10px] border border-border bg-surface px-3 text-sm! leading-[1.4]! font-normal! text-ink transition placeholder:text-subtle focus:border-accent focus:ring-3 focus:ring-accent/25 focus:outline-none'
