import type { LessonSummary, ProgressStatus } from '../../../shared/types'

export const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Done',
}

/** Where to pick up: the lesson already under way, else the first one not finished, else nothing (all done). */
export function pickCurrent(lessons: LessonSummary[]): LessonSummary | null {
  return lessons.find((l) => l.status === 'in_progress') ?? lessons.find((l) => l.status !== 'completed') ?? null
}

/** A one-line, plain-text preview of a lesson's Markdown intro. */
export function introSnippet(content: string, max = 140): string {
  const plain = content
    .replace(/^#{1,6}[ \t]+.*$/gm, '')
    .replace(/[`*_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
