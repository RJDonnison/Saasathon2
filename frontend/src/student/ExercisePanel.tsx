import { useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "../api.ts";
import {
  runCode as runInBrowser,
  type RunLanguage,
} from "../execution/runInBrowser.ts";
import type {
  CodeExercise,
  RunChecksResponse,
  SubmitCheckResult,
} from "../../../shared/types";

export default function ExercisePanel({
  exercise,
}: {
  exercise: CodeExercise;
}) {
  const [code, setCode] = useState(exercise.starterCode);
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<RunChecksResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const language: RunLanguage =
    exercise.language === "typescript" ? "typescript" : "javascript";
  const checks = exercise.checks ?? [];

  const run = async () => {
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const result = await runInBrowser({ code, language });
      setOutput(
        [result.stdout, result.stderr].filter(Boolean).join("\n") ||
          "(no output)",
      );
      if (result.timedOut)
        setError("Execution timed out after 5s (possible infinite loop)");
      else if (result.crash) setError(result.crash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setError(null);
    setCheckResult(null);
    try {
      const result = await runInBrowser({ code, language, checks });
      if (result.timedOut) {
        setError("Execution timed out after 5s (possible infinite loop)");
        return;
      }
      if (!result.outcomes) {
        setError("Checks could not run");
        return;
      }
      const outcomes = result.outcomes;
      const results: SubmitCheckResult[] = checks.map((c, index) => ({
        checkId: c.id,
        passed: outcomes[index]?.passed ?? false,
        message: outcomes[index]?.message ?? null,
      }));
      setCheckResult(
        await api.checkCode({
          codeExerciseId: exercise.id,
          code,
          results,
          stdout: result.stdout,
          stderr: result.stderr,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  const showCheckButton = checks.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {exercise.instructions && (
        <p className="text-sm text-gray-600">{exercise.instructions}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={run}
          disabled={running || checking}
          className="rounded bg-blue-600 px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {running ? "Running…" : "Run"}
        </button>
        {showCheckButton && (
          <button
            onClick={check}
            disabled={running || checking}
            className="rounded bg-green-600 px-4 py-1 text-sm text-white disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Editor
        height="300px"
        language={language}
        theme="vs-dark"
        value={code}
        onChange={(value) => setCode(value ?? "")}
        options={{
          fontSize: 14,
          minimap: { enabled: true },
          automaticLayout: true,
        }}
      />

      {output !== null && (
        <pre className="overflow-auto whitespace-pre-wrap rounded bg-gray-900 p-3 font-mono text-xs text-gray-100">
          {output}
        </pre>
      )}

      {checkResult && (
        <div className="flex flex-col gap-2">
          {checkResult.passed ? (
            <p className="rounded bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
              All {checkResult.results.length} checks passed
            </p>
          ) : (
            <p className="rounded bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {checkResult.results.filter((r) => !r.passed).length} of{" "}
              {checkResult.results.length} checks failed
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {checkResult.results.map((r) => (
              <li key={r.checkId} className="rounded border p-2 text-sm">
                <div className="flex items-start gap-2">
                  <span
                    className={r.passed ? "text-green-600" : "text-red-600"}
                  >
                    {r.passed ? "✓" : "✗"}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-gray-500">
                      {r.description}
                    </span>
                    {!r.passed && r.message && (
                      <code className="font-mono text-xs text-red-600">
                        {r.message}
                      </code>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
