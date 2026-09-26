import { transform } from "sucrase";
import type { CodeCheck } from "../../../shared/types";

export type RunLanguage = "javascript" | "typescript";

export interface RunOutcome {
  passed: boolean;
  message: string | null;
}

export interface RunOutput {
  stdout: string;
  stderr: string;
  outcomes: RunOutcome[] | null;
  crash: string | null;
  timedOut: boolean;
}

export interface RunOptions {
  code: string;
  language: RunLanguage;
  checks?: CodeCheck[];
  timeoutMs?: number;
}

/**
 * Worker prelude: a console shim that stringifies arguments (JSON.stringify with a String
 * fallback) and forwards each call to the main thread as one log line, plus the assertion
 * helper the generated checks use.
 */
const CONSOLE_SHIM = `
const __stringify = (value) => {
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
};
const __send = (level) => (...args) => {
  self.postMessage({ type: "log", level, text: args.map(__stringify).join(" ") });
};
const console = {
  log: __send("log"),
  info: __send("log"),
  debug: __send("log"),
  warn: __send("error"),
  error: __send("error"),
};
`;

const CHECK_HARNESS = `
const __outcomes = [];
function expect(actual) {
  return {
    toBe(expected) {
      if (!Object.is(actual, expected)) throw new Error("expected " + JSON.stringify(expected) + " but got " + JSON.stringify(actual));
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("expected " + JSON.stringify(expected) + " but got " + JSON.stringify(actual));
    },
  };
}
function __run(index, fn) {
  try { fn(); __outcomes[index] = { passed: true, message: null }; }
  catch (e) { __outcomes[index] = { passed: false, message: e instanceof Error ? e.message : String(e) }; }
}
`;

/**
 * Assembles the worker source. Every fragment is joined with an explicit "\n" so a trailing
 * line comment in student or check code cannot comment out the next emitted line.
 */
function buildWorkerSource(
  code: string,
  language: RunLanguage,
  checks: CodeCheck[] | undefined,
): string {
  const prepare = (source: string) =>
    language === "typescript"
      ? transform(source, { transforms: ["typescript"] }).code
      : source;

  const hasChecks = Boolean(checks?.length);
  const parts: string[] = [CONSOLE_SHIM];
  if (hasChecks) parts.push(CHECK_HARNESS);

  parts.push("let __crash = null;", "try {", prepare(code));
  if (hasChecks) {
    checks!.forEach((check, index) => {
      parts.push(`__run(${index}, function () {`, prepare(check.code), "});");
    });
  }
  parts.push(
    "} catch (e) {",
    '  __crash = e instanceof Error ? e.name + ": " + e.message : String(e);',
    "}",
  );
  if (hasChecks) {
    parts.push(
      `for (let i = 0; i < ${checks!.length}; i++) {`,
      '  if (!__outcomes[i]) __outcomes[i] = { passed: false, message: __crash ? "your code crashed before this check ran: " + __crash : "check did not run" };',
      "}",
      'self.postMessage({ type: "done", outcomes: __outcomes, crash: __crash });',
    );
  } else {
    parts.push('self.postMessage({ type: "done", crash: __crash });');
  }
  return parts.join("\n");
}

/** Runs student code (and optional checks) in a throwaway Web Worker and collects the output. */
export async function runCode(opts: RunOptions): Promise<RunOutput> {
  const { code, language, checks, timeoutMs = 5000 } = opts;
  const source = buildWorkerSource(
    code,
    language,
    checks?.length ? checks : undefined,
  );

  const url = URL.createObjectURL(
    new Blob([source], { type: "application/javascript" }),
  );
  let worker: Worker;
  try {
    worker = new Worker(url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error instanceof Error ? error : new Error(String(error));
  }

  return new Promise<RunOutput>((resolve) => {
    const logs: { level: "log" | "error"; text: string }[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Always terminates the worker and revokes the URL exactly once.
    const finish = (output: Omit<RunOutput, "stdout" | "stderr">) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        stdout: logs
          .filter((l) => l.level === "log")
          .map((l) => l.text)
          .join("\n"),
        stderr: logs
          .filter((l) => l.level === "error")
          .map((l) => l.text)
          .join("\n"),
        ...output,
      });
    };

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        level?: string;
        text?: string;
        outcomes?: unknown;
        crash?: unknown;
      };
      if (data?.type === "log" && typeof data.text === "string") {
        logs.push({
          level: data.level === "error" ? "error" : "log",
          text: data.text,
        });
      } else if (data?.type === "done") {
        finish({
          outcomes:
            checks?.length && Array.isArray(data.outcomes)
              ? (data.outcomes as RunOutcome[])
              : null,
          crash: typeof data.crash === "string" ? data.crash : null,
          timedOut: false,
        });
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      finish({
        outcomes: null,
        crash: event.message || "Worker crashed",
        timedOut: false,
      });
    };
    timer = setTimeout(() => {
      finish({ outcomes: null, crash: null, timedOut: true });
    }, timeoutMs);
  });
}
