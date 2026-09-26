import { useCallback } from "react";
import { api } from "../api.ts";
import type {
  RecordStudentActivityRequest,
  SaveStudentWorkRequest,
} from "../../../shared/types";

/** Fire-and-forget progress reporting. The saved lesson remains usable if the network briefly drops. */
export function useStudentActivity() {
  const record = useCallback((body: RecordStudentActivityRequest) => {
    void api.recordStudentActivity(body).catch((error) =>
      console.warn("[activity] could not record progress", error),
    );
  }, []);
  const saveWork = useCallback((body: SaveStudentWorkRequest) => {
    void api.saveStudentWork(body).catch((error) =>
      console.warn("[activity] could not save draft", error),
    );
  }, []);
  return { record, saveWork };
}
