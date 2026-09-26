import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Button from "./Button.tsx";
import { INPUT, TINT } from "./styles.ts";

type DialogRequest = {
  kind: "confirm" | "prompt";
  title: string;
  message?: string;
  confirmLabel?: string;
  initialValue?: string;
  resolve: (value: boolean | string | null) => void;
};

type DialogOptions = Omit<DialogRequest, "kind" | "resolve">;
type Toast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

type DialogApi = {
  confirm: (options: DialogOptions) => Promise<boolean>;
  prompt: (options: DialogOptions) => Promise<string | null>;
  toast: (message: string, tone?: "success" | "error") => void;
};

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastFocused = useRef<HTMLElement | null>(null);

  const close = useCallback((value: boolean | string | null) => {
    setDialog((current) => {
      current?.resolve(value);
      return null;
    });
    window.setTimeout(() => lastFocused.current?.focus(), 0);
  }, []);

  const open = useCallback((request: Omit<DialogRequest, "resolve">) => {
    lastFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return new Promise<boolean | string | null>((resolve) =>
      setDialog({ ...request, resolve }),
    );
  }, []);

  const toast = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(
        () => setToasts((current) => current.filter((item) => item.id !== id)),
        5000,
      );
    },
    [],
  );

  const value: DialogApi = {
    confirm: async (options) =>
      Boolean(await open({ ...options, kind: "confirm" })),
    prompt: async (options) => {
      const result = await open({ ...options, kind: "prompt" });
      return typeof result === "string" ? result : null;
    },
    toast,
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && <Dialog request={dialog} onClose={close} />}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={`rounded-xl px-4 py-3 text-sm shadow-lg ${item.tone === "error" ? TINT.peach : TINT.mint}`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </DialogContext.Provider>
  );
}

function Dialog({
  request,
  onClose,
}: {
  request: DialogRequest;
  onClose: (value: boolean | string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(request.initialValue ?? "");
  useEffect(() => {
    (inputRef.current ?? dialogRef.current)?.focus();
  }, []);
  const cancel = () => onClose(request.kind === "confirm" ? false : null);
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={request.message ? "app-dialog-message" : undefined}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
          if (event.key === "Tab") {
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
              'button, input, [href], [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable?.length) return;
            const items = [...focusable];
            const first = items[0];
            const last = items.at(-1)!;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <h2
            id="app-dialog-title"
            className="m-0! font-display! text-xl! font-semibold! text-ink"
          >
            {request.title}
          </h2>
          {request.message && (
            <p
              id="app-dialog-message"
              className="m-0 text-sm leading-relaxed text-muted"
            >
              {request.message}
            </p>
          )}
        </div>
        {request.kind === "prompt" && (
          <label className="flex flex-col gap-2 text-sm text-muted">
            {request.title}
            <input
              ref={inputRef}
              className={`${INPUT} h-10`}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onClose(value);
              }}
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={cancel}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => onClose(request.kind === "prompt" ? value : true)}
          >
            {request.confirmLabel ?? "Continue"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used inside DialogProvider");
  return context;
}
