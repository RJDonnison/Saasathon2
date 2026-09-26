import type { Module } from '../../../shared/types'

// PLACEHOLDER: shows the module's title and intro only (no sections/questions yet).
export default function ModuleView({ module }: { module: Module | null }) {
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">{module ? `Module: ${module.title}` : 'No module selected'}</h2>
      {module && <p className="text-sm whitespace-pre-wrap text-gray-600">{module.content}</p>}
    </section>
  )
}
