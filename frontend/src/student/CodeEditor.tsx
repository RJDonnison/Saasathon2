import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import type { GradeCodeTestResult } from "../../../shared/types";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Dot from "../ui/Dot.tsx";
import Eyebrow from "../ui/Eyebrow.tsx";
import InlineText from "../ui/InlineText.tsx";
import { PlayIcon, SparklesIcon, XIcon } from "../ui/icons.tsx";
import { CARD } from "../ui/styles.ts";
import { useWorkspace, type EditorInfo } from "./useWorkspace.ts";

const EXTENSION: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
};
// Monaco is substantial; lesson pages load it only when a code segment is actually rendered.
const MonacoEditor = lazy(() => import("@monaco-editor/react"));

// Monaco owns the editing experience (syntax highlighting, keyboard navigation and its gutter). Editor text still
// lives in the workspace so the tutor can inspect it, and Monaco decorations mark the line the tutor points to.
export default function CodeEditor({
  editor,
  filename,
  language,
  initialCode,
  prompt,
  instructions,
}: {
  editor: EditorInfo;
  /** Shown in the window title bar, without extension. */
  filename: string;
  language: string;
  initialCode: string;
  /** The task, and any extra detail, shown above the editor. */
  prompt?: string;
  instructions?: string;
}) {
  const {
    codes,
    setCode,
    setRunError,
    setActive,
    highlight,
    clearHighlight,
    requestHelp,
  } = useWorkspace();
  const [output, setOutput] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tested, setTested] = useState(false);
  const [testResults, setTestResults] = useState<GradeCodeTestResult[] | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const monacoEditor = useRef<Parameters<OnMount>[0] | null>(null);
  const decorations = useRef<ReturnType<
    Parameters<OnMount>[0]["createDecorationsCollection"]
  > | null>(null);

  const code = codes[editor.key] ?? initialCode;
  const mine = highlight?.editorKey === editor.key ? highlight : null;

  // Register the starter code so the tutor can see it before the student has typed anything.
  useEffect(() => {
    if (!(editor.key in codes)) setCode(editor.key, initialCode);
  }, [codes, editor.key, initialCode, setCode]);

  // Bring the highlighted line into view and tint it. Re-runs per request (nonce), so pointing at the
  // same line twice still scrolls.
  const spotLine = mine?.line;
  const spotNonce = mine?.nonce;
  useEffect(() => {
    if (!mounted || !monacoEditor.current || !decorations.current) return;
    if (!mine) {
      decorations.current.set([]);
      return;
    }
    decorations.current.set([
      {
        range: {
          startLineNumber: mine.line,
          startColumn: 1,
          endLineNumber: mine.endLine,
          endColumn: 1,
        },
        options: { isWholeLine: true, className: "bg-peach/60" },
      },
    ]);
    monacoEditor.current.revealLineInCenter(mine.line);
    monacoEditor.current
      .getDomNode()
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [mine, mounted, spotLine, spotNonce]);

  const onMount: OnMount = (instance) => {
    monacoEditor.current = instance;
    decorations.current = instance.createDecorationsCollection();
    instance.onDidFocusEditorText(() => setActive(editor));
    setMounted(true);
  };

  async function runTests() {
    setActive(editor);
    setRunning(true);
    setTested(true);
    try {
      const grade = await api.gradeCode({
        exerciseId: editor.exerciseId!,
        code,
      });
      const testSummary = grade.results
        ?.map(
          (result) =>
            `${result.name}: ${result.passed ? "passed" : "needs work"}`,
        )
        .join("\n");
      const message = grade.error
        ? grade.error
        : grade.passed
          ? "All checks passed. Nice work!"
          : "Some checks did not pass. Use the results above to focus on one behavior at a time.";
      setFailed(!grade.passed || !!grade.error);
      setTestResults(grade.results ?? null);
      setOutput(message);
      // The tutor gets only authored names and outcomes, never inputs or expected values.
      setRunError(editor.key, testSummary ?? message);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tests could not run";
      setFailed(true);
      setOutput(message);
      setRunError(editor.key, message);
    } finally {
      setRunning(false);
    }
  }

  async function runCode() {
    setActive(editor);
    setRunning(true);
    setTested(false);
    setTestResults(null);
    try {
      const res = await api.runCode({
        code,
        language,
        ...(editor.exerciseId ? { exerciseId: editor.exerciseId } : {}),
      });
      const failed = res.exitCode !== 0;
      const output =
        [res.stdout, res.stderr].filter(Boolean).join("\n") ||
        (failed
          ? "Execution failed with no output."
          : "Program finished with no output.");
      setFailed(failed);
      setOutput(output);
      setRunError(editor.key, failed ? output : undefined);
    } catch (err) {
      const output = err instanceof Error ? err.message : "Run failed";
      setFailed(true);
      setOutput(output);
      setRunError(editor.key, output);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className="flex h-11 items-center justify-between border-b border-border bg-surface-soft px-4">
        <span className="text-[11px] font-medium tracking-wide text-muted font-mono">
          {filename}.{EXTENSION[language] ?? "txt"}
        </span>
        <Eyebrow>{language}</Eyebrow>
      </div>

      {(prompt || instructions) && (
        <div className="flex flex-col gap-1.5 border-b border-border px-5 py-4 text-sm leading-relaxed">
          {prompt && (
            <p className="m-0 font-medium text-ink">
              <InlineText text={prompt} />
            </p>
          )}
          {instructions && (
            <p className="m-0 whitespace-pre-line text-muted">
              <InlineText text={instructions} />
            </p>
          )}
        </div>
      )}

      {mine && (
        <div
          role="status"
          className="flex items-start gap-3 border-b border-border bg-peach px-4 py-2.5 text-peach-ink"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] leading-snug">
            <strong className="font-semibold">
              {mine.endLine > mine.line
                ? `Lines ${mine.line}–${mine.endLine}`
                : `Line ${mine.line}`}
            </strong>
            {mine.note && <span>{mine.note}</span>}
          </span>
          <Button
            size="icon-sm"
            variant="peach"
            aria-label="Dismiss highlight"
            onClick={clearHighlight}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      )}

      <div className="h-[26rem] min-h-28 overflow-hidden bg-surface">
        <Suspense
          fallback={
            <div className="grid h-full place-items-center text-sm text-muted">
              Loading editor…
            </div>
          }
        >
          <MonacoEditor
            height="100%"
            defaultLanguage={language}
            language={language}
            value={code}
            theme="vs"
            onMount={onMount}
            onChange={(value) => {
              setCode(editor.key, value ?? "");
              setTested(false);
              setTestResults(null);
              // A run error only applies to the exact code that produced it.
              setRunError(editor.key);
              // Line numbers shift as they edit, so an old highlight would point at the wrong place.
              if (mine) clearHighlight();
            }}
            options={{
              ariaLabel: `Code editor: ${editor.label}`,
              automaticLayout: true,
              // The card and editor wrapper are overflow-hidden, which clips suggestion/hover widgets that extend past
              // the editor. Fixed positioning lets them render above the prompt, eyebrow and header instead.
              fixedOverflowWidgets: true,
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              lineHeight: 24,
              minimap: { enabled: false },
              padding: { top: 12, bottom: 12 },
              scrollBeyondLastLine: false,
              // Only consume the wheel while the editor can still scroll in that direction; at its top/bottom (or when
              // the code fits) the event falls through to the page, like any nested scroller.
              scrollbar: { alwaysConsumeMouseWheel: false },
              tabSize: 2,
              wordWrap: "off",
            }}
          />
        </Suspense>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft px-4 py-3">
        <span className="flex items-center gap-2 text-xs text-muted">
          <Dot live={running} />
          {running
            ? "Checking…"
            : editor.exerciseId
              ? "Ready to check"
              : "Ready to run"}
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          {failed && output && (
            <Button
              size="sm"
              variant="peach"
              className="border-peach-ink/45 text-ink"
              onClick={() => requestHelp(editor, output)}
            >
              <SparklesIcon className="size-3.5" />
              Get a hint
            </Button>
          )}
          <Button size="sm" onClick={runCode} disabled={running}>
            <PlayIcon className="size-3.5" />
            Run code
          </Button>
          {editor.exerciseId && (
            <Button
              variant="primary"
              size="sm"
              onClick={runTests}
              disabled={running}
            >
              <PlayIcon className="size-3.5" />
              Check
            </Button>
          )}
        </div>
      </div>

      {testResults && (
        <div
          className="flex flex-col gap-2 border-t border-border bg-surface px-5 py-4"
          role="status"
        >
          <Eyebrow>Check results</Eyebrow>
          <div className="flex flex-col gap-2">
            {testResults.map((result) => (
              <div
                key={result.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-soft px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-ink">{result.name}</span>
                <span
                  className={`flex-none rounded-full px-2 py-1 text-xs font-semibold ${result.passed ? "bg-mint text-mint-ink" : "border border-peach-ink/35 bg-peach text-ink"}`}
                >
                  {result.passed ? "Passed" : "Try again"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {output !== null && (
        <div
          className="flex flex-col gap-2.5 border-t border-border bg-surface-soft px-5 py-4"
          role="status"
        >
          <Eyebrow className={failed ? "text-peach-ink" : "text-subtle"}>
            {tested
              ? failed
                ? "Review your code"
                : "Check complete"
              : failed
                ? "Error"
                : "Output"}
          </Eyebrow>
          <pre className="m-0 max-h-52 overflow-auto text-[13px] leading-6 whitespace-pre-wrap text-ink font-mono">
            {output}
          </pre>
        </div>
      )}
    </section>
  );
}
