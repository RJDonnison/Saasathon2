import type { Module } from '../../../shared/types'
import Eyebrow from '../ui/Eyebrow.tsx'
import Heading from '../ui/Heading.tsx'
import InlineText from '../ui/InlineText.tsx'
import { BookIcon } from '../ui/icons.tsx'
import { CARD, TINT } from '../ui/styles.ts'

// PLACEHOLDER content: shows the module's title and intro only (no sections/questions yet).
export default function ModuleView({ module, index, total }: { module: Module | null; index: number; total: number }) {
  if (!module) {
    return (
      <section className={`${CARD} p-6`}>
        <p className="m-0 text-sm text-muted">No lesson selected.</p>
      </section>
    )
  }
  // Older intros start with a markdown "# Title" line that just repeats the heading.
  const intro = module.content.replace(/^#{1,6}[ \t]+.*\n+/, '').trim()
  return (
    <section className={`relative overflow-hidden ${CARD} p-6 sm:p-7`}>
      <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-accent/15 blur-2xl" />
      <div className="relative flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span className={`grid size-11 flex-none place-items-center rounded-2xl ${TINT.mint}`}>
            <BookIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-2.5">
            <Eyebrow>
              Lesson {String(index + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
            </Eyebrow>
            <Heading variant="title">{module.title}</Heading>
          </div>
        </div>
        {intro && (
          <p className="m-0 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line text-muted">
            <InlineText text={intro} />
          </p>
        )}
      </div>
    </section>
  )
}
