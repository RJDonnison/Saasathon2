import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.ts'
import { BellIcon } from '../ui/icons.tsx'
import { FOCUS_RING } from '../ui/styles.ts'

/** Header bell: links to the student home, where pending invitations are answered, with a count badge. */
export default function InvitationBell() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const load = () => void api.myInvitations().then((list) => setCount(list.length)).catch(() => {})
    load()
    const interval = window.setInterval(load, 30000)
    return () => window.clearInterval(interval)
  }, [])
  return (
    <Link
      to="/student"
      aria-label={count ? `${count} pending invitation${count === 1 ? '' : 's'}` : 'No pending invitations'}
      className={`relative inline-grid size-[38px] place-items-center rounded-[9px] border border-border bg-surface text-ink hover:bg-surface-soft ${FOCUS_RING}`}
    >
      <BellIcon className="size-[18px]" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] leading-5 font-semibold text-white">{count}</span>
      )}
    </Link>
  )
}
