import { Fragment } from "react";
import katex from "katex";

/**
 * Renders plain text with code, bold and inline math spans (what tutor replies and lesson intros use).
 * Everything else stays literal text, so nothing here can inject HTML.
 */
export default function InlineText({ text }: { text: string }) {
  const parts = text.split(
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|\$[^$\n]+?\$|\\\([^\\\n]+?\\\))/g,
  );
  return (
    <>
      {parts.map((part, i) => {
        const dollarMath =
          part.length > 2 && part.startsWith("$") && part.endsWith("$");
        const parenMath =
          part.length > 4 && part.startsWith("\\(") && part.endsWith("\\)");
        if (dollarMath || parenMath) {
          const latex = part.slice(dollarMath ? 1 : 2, dollarMath ? -1 : -2);
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(latex, {
                  throwOnError: false,
                  trust: false,
                }),
              }}
            />
          );
        }
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className={`inline-block max-w-full overflow-x-auto rounded-[5px] border border-border bg-surface-soft px-[0.35em] py-[0.05em] align-bottom text-[0.9em] font-medium whitespace-nowrap font-mono`}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
