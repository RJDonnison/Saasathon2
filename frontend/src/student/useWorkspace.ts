import { createContext, useContext } from "react";

export interface EditorInfo {
  key: string;
  label: string;
  exerciseId?: string;
  questionId?: string;
}

export interface CodeHighlight {
  editorKey: string;
  line: number;
  endLine: number;
  note: string;
  nonce: number;
}

export interface HelpRequest {
  nonce: number;
  error?: string;
}

export interface WorkspaceState {
  codes: Record<string, string>;
  setCode: (key: string, code: string) => void;
  runErrors: Record<string, string>;
  setRunError: (key: string, error?: string) => void;
  active: EditorInfo | null;
  setActive: (editor: EditorInfo) => void;
  /** The math question the student last focused; it takes priority over stale editor context in the tutor. */
  activeQuestionId: string | null;
  setActiveQuestion: (questionId: string) => void;
  highlight: CodeHighlight | null;
  showHighlight: (h: Omit<CodeHighlight, "nonce">) => void;
  clearHighlight: () => void;
  helpRequest: HelpRequest | null;
  requestHelp: (editor: EditorInfo, error?: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
