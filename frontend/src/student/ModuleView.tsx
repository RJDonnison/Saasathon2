import type { Module } from "../../../shared/types";

// PLACEHOLDER: shows the module's title and intro only (no sections/questions yet).
export default function ModuleView({ module }: { module: Module | null }) {
  return (
    <section className="rounded-2xl border border-[#dfe5d8] bg-white p-5 shadow-sm">
      <h2 className="mb-2 font-semibold text-[#20271f]">
        {module ? `Module: ${module.title}` : "No module selected"}
      </h2>
      {module && (
        <p className="whitespace-pre-wrap text-sm text-[#697266]">
          {module.content}
        </p>
      )}
    </section>
  );
}
