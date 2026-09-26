import { Fragment } from "react";
import katex from "katex";

/** Renders only $...$ and $$...$$ spans; all surrounding authored text remains React text. */
export default function MathText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return (
    <>
      {parts.map((part, index) => {
        const display = part.startsWith("$$") && part.endsWith("$$");
        const inline = !display && part.startsWith("$") && part.endsWith("$");
        if (!display && !inline) return <Fragment key={index}>{part}</Fragment>;
        const latex = part.slice(display ? 2 : 1, display ? -2 : -1);
        const html = katex.renderToString(latex, {
          displayMode: display,
          throwOnError: false,
          trust: false,
        });
        return (
          <span
            key={index}
            className={display ? "block overflow-x-auto" : "inline"}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </>
  );
}
