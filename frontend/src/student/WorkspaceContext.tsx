import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  WorkspaceContext,
  type CodeHighlight,
  type EditorInfo,
  type HelpRequest,
  type WorkspaceState,
} from "./useWorkspace.ts";

export function WorkspaceProvider({
  moduleId,
  children,
}: {
  moduleId: string | null;
  children: ReactNode;
}) {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [active, setActiveEditor] = useState<EditorInfo | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<CodeHighlight | null>(null);
  const [helpRequest, setHelpRequest] = useState<HelpRequest | null>(null);
  const nonce = useRef(0);

  const [seenModule, setSeenModule] = useState(moduleId);
  if (seenModule !== moduleId) {
    setSeenModule(moduleId);
    setActiveEditor(null);
    setActiveQuestionId(null);
    setHighlight(null);
    setHelpRequest(null);
    setRunErrors({});
  }

  const setCode = useCallback(
    (key: string, code: string) =>
      setCodes((current) =>
        current[key] === code ? current : { ...current, [key]: code },
      ),
    [],
  );
  const setRunError = useCallback((key: string, error?: string) => {
    setRunErrors((errors) => {
      if (error)
        return errors[key] === error ? errors : { ...errors, [key]: error };
      if (!(key in errors)) return errors;
      const { [key]: _, ...remaining } = errors;
      return remaining;
    });
  }, []);
  const setActive = useCallback((editor: EditorInfo) => {
    setActiveQuestionId(null);
    setActiveEditor((current) =>
      current?.key === editor.key && current.label === editor.label
        ? current
        : editor,
    );
  }, []);
  const setActiveQuestion = useCallback((questionId: string) => {
    setActiveEditor(null);
    setActiveQuestionId(questionId);
  }, []);
  const showHighlight = useCallback(
    (h: Omit<CodeHighlight, "nonce">) =>
      setHighlight({ ...h, nonce: ++nonce.current }),
    [],
  );
  const clearHighlight = useCallback(() => setHighlight(null), []);
  const requestHelp = useCallback(
    (editor: EditorInfo, error?: string) => {
      setActive(editor);
      setHelpRequest({ nonce: ++nonce.current, error });
    },
    [setActive],
  );

  const value = useMemo<WorkspaceState>(
    () => ({
      codes,
      setCode,
      runErrors,
      setRunError,
      active,
      setActive,
      activeQuestionId,
      setActiveQuestion,
      highlight,
      showHighlight,
      clearHighlight,
      helpRequest,
      requestHelp,
    }),
    [
      codes,
      setCode,
      runErrors,
      setRunError,
      active,
      setActive,
      activeQuestionId,
      setActiveQuestion,
      highlight,
      showHighlight,
      clearHighlight,
      helpRequest,
      requestHelp,
    ],
  );
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
