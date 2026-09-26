import { useState } from "react";
import Button from "../ui/Button.tsx";
import { INPUT, TINT } from "../ui/styles.ts";

export type EditableCodeTest = {
  name: string;
  args: unknown[];
  expected: unknown;
};

const scalarKinds = ["text", "number", "boolean", "empty", "null"] as const;
type ScalarKind = (typeof scalarKinds)[number];

const isScalar = (value: unknown) =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";
const kindFor = (value: unknown): ScalarKind =>
  value === null
    ? "null"
    : typeof value === "boolean"
      ? "boolean"
      : typeof value === "number"
        ? "number"
        : value === ""
          ? "empty"
          : "text";
const valueFor = (
  kind: ScalarKind,
  value: string,
  checked: boolean,
): unknown =>
  kind === "null"
    ? null
    : kind === "empty"
      ? ""
      : kind === "boolean"
        ? checked
        : kind === "number"
          ? Number(value)
          : value;

function ScalarValue({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const kind = kindFor(value);
  const text =
    typeof value === "number" || typeof value === "string" ? String(value) : "";
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <label className="flex flex-col gap-1 text-xs text-muted">
        {label} type
        <select
          className={`${INPUT} h-9`}
          value={kind}
          onChange={(event) =>
            onChange(valueFor(event.target.value as ScalarKind, "", false))
          }
        >
          {scalarKinds.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {kind === "boolean" ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />{" "}
          True
        </label>
      ) : kind === "text" || kind === "number" ? (
        <label className="flex flex-col gap-1 text-xs text-muted">
          {label}
          <input
            className={`${INPUT} h-9`}
            type={kind === "number" ? "number" : "text"}
            value={text}
            onChange={(event) =>
              onChange(valueFor(kind, event.target.value, false))
            }
          />
        </label>
      ) : (
        <span className="self-end pb-2 text-xs text-muted">
          {kind === "empty" ? "Empty string" : "Null"}
        </span>
      )}
    </div>
  );
}

export default function CodeTestEditor({
  test,
  onChange,
  onRemove,
  actions,
}: {
  test: EditableCodeTest;
  onChange: (test: EditableCodeTest) => void;
  onRemove?: () => void;
  actions?: React.ReactNode;
}) {
  const complex = !test.args.every(isScalar) || !isScalar(test.expected);
  const [advanced, setAdvanced] = useState(complex);
  const [rawArgs, setRawArgs] = useState(() => JSON.stringify(test.args));
  const [rawExpected, setRawExpected] = useState(() =>
    JSON.stringify(test.expected),
  );
  const [error, setError] = useState<string | null>(null);
  const updateTest = (patch: Partial<EditableCodeTest>) =>
    onChange({ ...test, ...patch });
  const applyJson = () => {
    try {
      const args: unknown = JSON.parse(rawArgs);
      const expected: unknown = JSON.parse(rawExpected);
      if (!Array.isArray(args))
        throw new Error("Arguments must be a JSON array.");
      updateTest({ args, expected });
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Enter valid JSON values.",
      );
    }
  };
  const updateArg = (index: number, value: unknown) =>
    updateTest({
      args: test.args.map((arg, current) => (current === index ? value : arg)),
    });
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-soft p-3">
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
          Test name
          <input
            className={`${INPUT} h-10`}
            value={test.name}
            onChange={(event) => updateTest({ name: event.target.value })}
          />
        </label>
        {actions}
        {onRemove && (
          <Button size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      {!advanced ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted">Function arguments</span>
            {test.args.map((arg, index) => (
              <div key={index} className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <ScalarValue
                    label={`Argument ${index + 1}`}
                    value={arg}
                    onChange={(value) => updateArg(index, value)}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    updateTest({
                      args: test.args.filter((_, current) => current !== index),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              className="self-start"
              onClick={() => updateTest({ args: [...test.args, ""] })}
            >
              + Add argument
            </Button>
          </div>
          <ScalarValue
            label="Expected result"
            value={test.expected}
            onChange={(expected) => updateTest({ expected })}
          />
        </>
      ) : (
        <p className={`m-0 rounded-xl px-3 py-2 text-xs ${TINT.lavender}`}>
          This test contains an array or object. Its JSON is preserved until you
          explicitly apply an edit.
        </p>
      )}
      <Button
        size="sm"
        className="self-start"
        onClick={() => {
          if (!advanced) {
            setRawArgs(JSON.stringify(test.args));
            setRawExpected(JSON.stringify(test.expected));
          }
          setAdvanced((current) => !current);
        }}
      >
        {advanced ? "Use simple values" : "Advanced JSON"}
      </Button>
      {advanced && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              JSON arguments
              <textarea
                className={`${INPUT} min-h-20 py-2 font-mono! text-[13px]!`}
                value={rawArgs}
                onChange={(event) => setRawArgs(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Expected JSON value
              <textarea
                className={`${INPUT} min-h-20 py-2 font-mono! text-[13px]!`}
                value={rawExpected}
                onChange={(event) => setRawExpected(event.target.value)}
              />
            </label>
          </div>
          <Button size="sm" className="self-start" onClick={applyJson}>
            Apply JSON
          </Button>
          {error && (
            <span role="alert" className="text-xs text-peach-ink">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
