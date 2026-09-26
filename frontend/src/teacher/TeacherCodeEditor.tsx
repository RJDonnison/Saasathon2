import { type ComponentType, useEffect, useState } from "react";
import { INPUT } from "../ui/styles.ts";

type MonacoEditor = typeof import("@monaco-editor/react").default;

const modes: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
};

/** A teacher-only editor. It deliberately does not connect to the student workspace. */
export default function TeacherCodeEditor({
  label,
  value,
  language,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  language: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [opened, setOpened] = useState(false);
  const [Editor, setEditor] = useState<ComponentType<
    React.ComponentProps<MonacoEditor>
  > | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!opened || Editor || failed) return;
    void import("@monaco-editor/react")
      .then((module) => setEditor(() => module.default))
      .catch(() => setFailed(true));
  }, [opened, Editor, failed]);

  if (!opened) {
    return (
      <button
        type="button"
        className="self-start text-sm! font-semibold! text-accent hover:text-ink"
        onClick={() => setOpened(true)}
        aria-label={`Open ${label} code editor`}
      >
        Open code editor
      </button>
    );
  }

  if (!Editor || failed) {
    return (
      <div className="flex flex-col gap-2">
        {failed && (
          <span className="text-xs text-peach-ink">
            Advanced editor could not load; use the text editor below.
          </span>
        )}
        <textarea
          aria-label={label}
          className={`${INPUT} min-h-36 py-2.5 font-mono! text-[13px]!`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="h-72 overflow-hidden rounded-[10px] border border-border">
      <Editor
        height="100%"
        language={modes[language] ?? "plaintext"}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        loading={
          <textarea
            aria-label={label}
            className={`${INPUT} h-full py-2.5 font-mono! text-[13px]!`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
          />
        }
        options={{
          ariaLabel: label,
          automaticLayout: true,
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          lineHeight: 24,
          minimap: { enabled: false },
          padding: { top: 12, bottom: 12 },
          scrollBeyondLastLine: false,
          tabSize: 2,
        }}
      />
    </div>
  );
}
