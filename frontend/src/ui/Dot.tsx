/** Presence dot: green with a soft halo when live, grey otherwise. */
export default function Dot({ live = false }: { live?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2 flex-none rounded-full ${live ? 'bg-accent ring-3 ring-accent/30' : 'bg-subtle/40'}`}
    />
  )
}
