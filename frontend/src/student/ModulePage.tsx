import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.ts";
import type { StudentModule } from "../../../shared/types";
import ExercisePanel from "./ExercisePanel.tsx";

export default function ModulePage() {
  const { id } = useParams();
  const [module, setModule] = useState<StudentModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setModule(null);
    setError(null);
    api
      .getModule(id)
      .then((m) => setModule(m as StudentModule))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load module"),
      );
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!module) return <p className="text-sm text-gray-500">Loading module…</p>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{module.title}</h1>
        {module.content && (
          <p className="mt-1 text-sm text-gray-600">{module.content}</p>
        )}
      </header>

      {module.sections.map((section) => (
        <section key={section.id} className="rounded border bg-white p-4">
          <h2 className="font-semibold">{section.title}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {section.blocks.map((block) => (
              <p key={block.id} className="text-sm text-gray-700">
                {typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content)}
              </p>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {section.questions.map((q) => (
              <div key={q.id} className="rounded border p-3">
                <p className="text-sm font-medium">{q.prompt}</p>
                {q.kind !== "code" && (
                  <p className="mt-1 text-xs text-gray-400">
                    (answering coming soon)
                  </p>
                )}
                {q.kind === "code" && q.codeExercise && (
                  <div className="mt-3">
                    <ExercisePanel exercise={q.codeExercise} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
