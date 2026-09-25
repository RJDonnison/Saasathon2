// PLACEHOLDER: a local, unsaved notes area.
export default function ScratchPad() {
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">Scratch pad</h2>
      <textarea className="h-24 w-full rounded border p-2 text-sm" placeholder="Jot down notes…" />
    </section>
  )
}
