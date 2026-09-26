import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Heading from './Heading.tsx'

// Lesson text is teacher-authored Markdown. react-markdown never emits raw HTML, so nothing here can inject markup.
// Headings use <Heading> and code uses the same dark panel as run output, so lessons match the rest of the app.
const isBlockCode = (className: string | undefined, children: unknown) =>
  /language-/.test(className ?? '') || String(children).includes('\n')

const components: Components = {
  h1: ({ children }) => <Heading as="h3" className="text-ink">{children}</Heading>,
  h2: ({ children }) => <Heading as="h3" className="text-ink">{children}</Heading>,
  h3: ({ children }) => <h4 className="m-0 text-[15px] font-semibold text-ink font-display">{children}</h4>,
  h4: ({ children }) => <h4 className="m-0 text-[15px] font-semibold text-ink font-display">{children}</h4>,
  p: ({ children }) => <p className="m-0">{children}</p>,
  ul: ({ children }) => <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-mint-ink! underline underline-offset-2">
      {children}
    </a>
  ),
  hr: () => <hr className="m-0 border-border" />,
  blockquote: ({ children }) => <blockquote className="m-0 border-l-2 border-accent pl-4 text-muted">{children}</blockquote>,
  pre: ({ children }) => (
    <pre className="m-0 overflow-x-auto rounded-xl bg-ink px-4 py-3.5 text-[13px] leading-6 text-surface-soft font-mono">{children}</pre>
  ),
  code: ({ className, children }) =>
    isBlockCode(className, children) ? (
      <code className="font-mono">{children}</code>
    ) : (
      <code className="rounded-[5px] border border-border bg-surface-soft px-[0.35em] py-[0.05em] text-[0.9em] font-medium text-ink font-mono">
        {children}
      </code>
    ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-left text-[13.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border bg-surface-soft px-3 py-2 font-semibold text-ink">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-3 py-2 [tr:last-child_&]:border-b-0">{children}</td>,
}

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3.5 text-[15px] leading-relaxed text-muted">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
