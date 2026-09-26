import { Link, Outlet } from 'react-router-dom'

/** Public, read-only preview for seeing the student screens without Supabase sign-in. */
export default function StudentDemoLayout() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/student-demo" className="inline-flex items-center gap-2.5 font-display! text-[23px]! font-bold! tracking-[-1.3px]" aria-label="Student demo home">
            <img src="/favicon.svg" alt="" className="size-[33px] rounded-[10px]" />
            <span>loop<span className="text-accent">.</span></span>
          </Link>
          <span className="rounded-full bg-mint px-2.5 py-1.5 text-[10px] font-medium tracking-[0.12em] text-mint-ink">STUDENT DEMO</span>
          <span className="ml-auto text-xs text-muted">Preview only · no sign-in required</span>
        </div>
      </header>
      <main className="w-full px-4 py-7 sm:px-6 lg:py-9"><Outlet /></main>
    </div>
  )
}
