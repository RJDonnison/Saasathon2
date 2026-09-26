import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import type { GradeCodeTestResult } from "../../../shared/types";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Markdown from "../ui/Markdown.tsx";
import { CodeIcon, PlayIcon, SparklesIcon, XIcon } from "../ui/icons.tsx";
import { GRADED_CARD_SHADOW, GRADED_FEEDBACK } from "../ui/styles.ts";
import { useWorkspace, type EditorInfo } from "./useWorkspace.ts";
import { useStudentActivity } from "./useStudentActivity.ts";

const EXTENSION: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
};
// Monaco is substantial; lesson pages load it only when a code segment is actually rendered.
const MonacoEditor = lazy(() => import("@monaco-editor/react"));

function lineFromError(output: string, code: string): number | null {
  const match = output.match(/File ["'][^"']+["'], line (\d+)/i)
    ?? output.match(/(?:<anonymous>|main\.(?:js|ts|py)|stdin)[^:\n]*:(\d+)(?::\d+)?/i)
    ?? output.match(/\bline\s+(\d+)\b/i);
  const line = match ? Number(match[1]) : NaN;
  return Number.isInteger(line) && line > 0 && line <= code.split(/\r?\n/).length
    ? line
    : null;
}

// Monaco owns the editing experience (syntax highlighting, keyboard navigation and its gutter). Editor text still
// lives in the workspace so the tutor can inspect it, and Monaco decorations mark the line the tutor points to.
export default function CodeEditor({
  editor,
  filename,
  language,
  initialCode,
  prompt,
  instructions,
  questionNumber,
  moduleId,
  sectionId,
  readOnly = false,
}: {
  editor: EditorInfo;
  /** Shown in the window title bar, without extension. */
  filename: string;
  language: string;
  initialCode: string;
  /** The task, and any extra detail, shown above the editor. */
  prompt?: string;
  instructions?: string;
  /** The lesson-wide number shown in a code-question header. */
  questionNumber?: number;
  /** Present for a lesson exercise; omitted by the free playground. */
  moduleId?: string;
  sectionId?: string;
  readOnly?: boolean;
}) {
  const {
    codes,
    setCode,
    setRunError,
    setActive,
    active,
    highlight,
    clearHighlight,
    requestHelp,
  } = useWorkspace();
  const { record, saveWork } = useStudentActivity();
  const [output, setOutput] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [tested, setTested] = useState(false);
  const [testResults, setTestResults] = useState<GradeCodeTestResult[] | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [edited, setEdited] = useState(false);
  const [reportedWriting, setReportedWriting] = useState(false);
  const monacoEditor = useRef<Parameters<OnMount>[0] | null>(null);
  const latestCode = useRef("");
  const decorations = useRef<ReturnType<
    Parameters<OnMount>[0]["createDecorationsCollection"]
  > | null>(null);

  const code = codes[editor.key] ?? initialCode;
  const mine = highlight?.editorKey === editor.key ? highlight : null;
  const isOpen = active?.key === editor.key;

  useEffect(() => {
    latestCode.current = code;
  }, [code]);

  useEffect(() => {
    if (!edited || !moduleId || !sectionId || !editor.questionId) return;
    const saveLatest = () =>
      saveWork({
        moduleId,
        sectionId,
        questionId: editor.questionId!,
        kind: "code",
        value: latestCode.current,
      });
    // A throttle (rather than a debounced save) keeps the teacher's live view moving while the student types.
    saveLatest();
    const timer = window.setInterval(saveLatest, 2_500);
    return () => {
      window.clearInterval(timer);
      saveLatest();
    };
  }, [edited, editor.questionId, moduleId, saveWork, sectionId]);

  function report(type: "writing_code" | "running_code" | "checking_code") {
    if (!moduleId || !sectionId || !editor.questionId) return;
    record({ moduleId, sectionId, questionId: editor.questionId, type });
  }
  function startWriting() {
    if (reportedWriting) return;
    setReportedWriting(true);
    report("writing_code");
  }

  // Register the starter code so the tutor can see it before the student has typed anything.
  useEffect(() => {
    if (!(editor.key in codes)) setCode(editor.key, initialCode);
  }, [codes, editor.key, initialCode, setCode]);

  // Bring the highlighted line into view and tint it. Re-runs per request (nonce), so pointing at the
  // same line twice still scrolls.
  const spotLine = mine?.line;
  const spotNonce = mine?.nonce;
  const guidedLine = mine?.line ?? errorLine;
  const guidedEndLine = mine?.endLine ?? errorLine;
  useEffect(() => {
    if (!mounted || !monacoEditor.current || !decorations.current) return;
    if (guidedLine === null || guidedEndLine === null) {
      decorations.current.set([]);
      return;
    }
    decorations.current.set([
      {
        range: {
          startLineNumber: guidedLine,
          startColumn: 1,
          endLineNumber: guidedEndLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: "bg-peach/35",
          linesDecorationsClassName: "bg-peach-ink/35",
        },
      },
    ]);
    // Wait a beat: on small screens the editor's pane is switched in at the same moment, and Monaco needs its size.
    const instance = monacoEditor.current;
    const timer = window.setTimeout(() => {
      instance.layout();
      instance.revealLineInCenter(guidedLine);
      instance
        .getDomNode()
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [errorLine, guidedEndLine, guidedLine, mine, mounted, spotLine, spotNonce]);

  const onMount: OnMount = (instance) => {
    monacoEditor.current = instance;
    decorations.current = instance.createDecorationsCollection();
    instance.onDidFocusEditorText(() => {
      setActive(editor);
      startWriting();
    });
    setMounted(true);
  };

  async function runTests() {
    setActive(editor);
    report("checking_code");
    setRunning(true);
    setTested(true);
    setErrorLine(null);
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
      setErrorLine(!grade.passed || !!grade.error ? lineFromError(message, code) : null);
      // The tutor gets only authored names and outcomes, never inputs or expected values.
      setRunError(editor.key, testSummary ?? message);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tests could not run";
      setFailed(true);
      setOutput(message);
      setErrorLine(lineFromError(message, code));
      setRunError(editor.key, message);
    } finally {
      setRunning(false);
      setReportedWriting(false);
    }
  }

  async function runCode() {
    setActive(editor);
    report("running_code");
    setRunning(true);
    setTested(false);
    setTestResults(null);
    setErrorLine(null);
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
      setErrorLine(failed ? lineFromError(output, code) : null);
      setRunError(editor.key, failed ? output : undefined);
      // Keep a record of runs on real exercises (not the playground) so the student's class page and their
      // teacher can see how the work is going. Best effort: a failed save must not disturb the run.
      if (editor.exerciseId) {
        void api
          .createSubmission({
            codeExerciseId: editor.exerciseId,
            code,
            stdout: res.stdout,
            stderr: res.stderr,
          })
          .catch((err) => console.warn("Could not save this run:", err));
      }
    } catch (err) {
      const output = err instanceof Error ? err.message : "Run failed";
      setFailed(true);
      setOutput(output);
      setErrorLine(lineFromError(output, code));
      setRunError(editor.key, output);
    } finally {
      setRunning(false);
      setReportedWriting(false);
    }
  }

  return (
    <Card
      title={
        editor.exerciseId && questionNumber
          ? `Question ${questionNumber}`
          : "Playground"
      }
      icon={<CodeIcon className="size-[18px]" />}
      tint="peach"
      className={
        tested
          ? failed
            ? GRADED_CARD_SHADOW.incorrect
            : GRADED_CARD_SHADOW.correct
          : ""
      }
      bodyClassName="flex flex-col gap-4 p-5 sm:p-6"
    >
      {(prompt || instructions) && (
        <div className="flex flex-col gap-2.5">
          <span className="w-fit rounded-lg border border-border bg-surface-soft px-2.5 py-1 text-xs font-semibold text-ink capitalize">
            {language}
          </span>
          {prompt && (
            <Markdown
              text={prompt}
              className="text-[17px] leading-snug font-semibold text-ink"
            />
          )}
          {instructions && (
            <Markdown
              text={instructions}
              className="text-[15px] leading-relaxed text-ink"
            />
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-soft px-4 py-3">
          <span className="min-w-0 truncate text-[13px] font-medium text-ink font-mono">
            {filename}.{EXTENSION[language] ?? "txt"}
          </span>
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isOpen ? (
                <>
                  <Button
                    size="sm"
                    onClick={() =>
                      requestHelp(
                        editor,
                        failed ? (output ?? undefined) : undefined,
                      )
                    }
                  >
                    <SparklesIcon className="size-3.5" /> Find the error
                  </Button>
                  <Button
                    variant={editor.exerciseId ? "default" : "primary"}
                    onClick={runCode}
                    disabled={running}
                  >
                    <PlayIcon className="size-3.5" />{" "}
                    {running && !tested ? "Running…" : "Run"}
                  </Button>
                  {editor.exerciseId && (
                    <Button
                      variant="primary"
                      onClick={runTests}
                      disabled={running}
                    >
                      <PlayIcon className="size-3.5" />{" "}
                      {running && tested ? "Checking…" : "Check"}
                    </Button>
                  )}
                </>
              ) : (
                <Button variant="primary" onClick={() => setActive(editor)}>
                  Open editor
                </Button>
              )}
            </div>
          )}
        </div>

        {(mine || errorLine !== null) && (
          <div
            role="status"
            className="flex items-start gap-3 border-b border-border bg-peach px-4 py-2.5 text-peach-ink"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] leading-snug">
              <strong className="font-semibold">
                {mine && mine.endLine > mine.line
                  ? `Lines ${mine.line}–${mine.endLine}`
                  : `Line ${mine?.line ?? errorLine}`}
              </strong>
              {mine?.note ? <span>{mine.note}</span> : <span>The error output points to this line.</span>}
            </span>
            <Button
              size="icon-sm"
              variant="peach"
              aria-label="Dismiss highlight"
              onClick={() => {
                clearHighlight();
                setErrorLine(null);
              }}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        )}

        {readOnly ? (
          <pre className="m-0 max-h-96 overflow-auto bg-surface px-5 py-4 text-[13px] leading-6 text-ink font-mono">
            <code>{code}</code>
          </pre>
        ) : isOpen ? (
          <div className="h-[22rem] min-h-28 overflow-hidden bg-surface">
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
                  setEdited(true);
                  startWriting();
                  setTested(false);
                  setTestResults(null);
                  setErrorLine(null);
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
                  readOnly,
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
        ) : (
          <div className="flex min-h-28 items-center justify-center bg-surface px-4 py-8 text-center text-sm text-muted">
            Open this editor to write, run, or check your code.
          </div>
        )}

        {testResults && (
          <div
            className="flex flex-col gap-2 border-t border-border bg-surface px-5 py-4"
            role="status"
          >
            <div className="flex flex-col gap-2">
              {testResults.map((result) => (
                <div
                  key={result.name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-soft px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-ink">
                    {result.name}
                  </span>
                  <span
                    className={`flex-none rounded-full px-2 py-1 text-xs font-semibold ${result.passed ? GRADED_FEEDBACK.correct : GRADED_FEEDBACK.incorrect}`}
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
            className={`flex flex-col gap-2 border-t px-5 py-4 ${failed ? "border-peach-ink/15 bg-peach/20" : "border-border bg-surface-soft"}`}
            role="status"
          >
            <span className="text-[13px] font-medium text-muted">
              {tested
                ? failed
                  ? "Review your code"
                  : "Check complete"
                : failed
                  ? "Error"
                  : "Output"}
            </span>
            <pre
              className={`m-0 max-h-52 overflow-auto text-[13px] leading-6 whitespace-pre-wrap font-mono ${failed ? "text-peach-ink" : "text-ink"}`}
            >
              {output}
            </pre>
            {failed && tested && errorLine === null && (
              <p className="m-0 text-xs leading-relaxed text-muted">
                The checks show what needs another look. Choose “Find the error” for a guided hint and line to inspect.
              </p>
            )}
          </div>
        )}
      </section>
    </Card>
  );
}
