import type { ModuleBuilderDocument } from "../../../shared/types";

const id = () => crypto.randomUUID();

/** A new, unsaved lesson document suitable for the module builder and its AI assistant. */
export function createBlankModuleDocument(): ModuleBuilderDocument {
  return {
    title: "Untitled module",
    content: "",
    status: "draft",
    sections: [{ id: id(), title: "Section 1", items: [] }],
  };
}
