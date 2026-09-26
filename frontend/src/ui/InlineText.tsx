import { Fragment } from 'react'

/**
 * Renders plain text with just `code` and **bold** spans (what tutor replies and lesson intros use).
 * Everything else stays literal text, so nothing here can inject HTML.
 */
export default function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className={`inline-block max-w-full overflow-x-auto rounded-[5px] border border-border bg-surface-soft px-[0.35em] py-[0.05em] align-bottom text-[0.9em] font-medium whitespace-nowrap font-mono`}
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}
