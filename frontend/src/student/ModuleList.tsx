import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import type { Module } from "../../../shared/types";

export default function ModuleList() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const classroomId = user?.classroomId;
    if (!classroomId) return;
    api
      .listModules(classroomId)
      .then(setModules)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load modules"),
      );
  }, [user?.classroomId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!modules)
    return <p className="text-sm text-gray-500">Loading modules…</p>;
  if (!modules.length)
    return <p className="text-sm text-gray-500">No modules yet.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {modules.map((m) => (
        <Link
          key={m.id}
          to={`/student/module/${m.id}`}
          className="rounded border bg-white p-4 hover:border-blue-400"
        >
          <h3 className="font-semibold">{m.title}</h3>
          {m.content && (
            <p className="mt-1 text-sm text-gray-600 line-clamp-2">
              {m.content}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
