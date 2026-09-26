import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import { useLiveSession } from '../useLiveSession.ts'
import {
  emitAcknowledgeHand,
  onModuleChanged,
  onModuleDeleted,
  onPresenceUpdate,
  onRaisedHandsUpdate,
  onStudentActivityUpdate,
} from '../socket.ts'
import AnswerKeyPanel from './AnswerKeyPanel.tsx'
import ClassroomGrid from './ClassroomGrid.tsx'
import CodeTestPanel from './CodeTestPanel.tsx'
import StudentDetailPanel from './StudentDetailPanel.tsx'
import AnnouncementsCard from './AnnouncementsCard.tsx'
import LessonPlanner from './LessonPlanner.tsx'
import LiveLessonControl from './LiveLessonControl.tsx'
import NewLessonForm from './NewLessonForm.tsx'
import RaiseHandAlert from './RaiseHandAlert.tsx'
import Button from '../ui/Button.tsx'
import Card from '../ui/Card.tsx'
import Heading from '../ui/Heading.tsx'
import { BookIcon, UsersIcon } from '../ui/icons.tsx'
import { INPUT, TINT } from '../ui/styles.ts'
import type { Classroom, ClassroomInvitation, Module, StudentActivitySnapshot, User } from '../../../shared/types'
import type { RaisedHand } from '../../../shared/events'

const INVITATION_LABEL: Record<ClassroomInvitation['status'], string> = {
  pending: 'Invited, waiting for a reply',
  accepted: 'Joined',
  declined: 'Declined',
}

export default function TeacherHome() {
  const { user, createClassroom: createClassroomFor } = useAuth()
  const navigate = useNavigate()
  const { session, setSession } = useLiveSession()
  const [students, setStudents] = useState<User[] | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [hands, setHands] = useState<RaisedHand[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [invitations, setInvitations] = useState<ClassroomInvitation[]>([])
  const [inviteText, setInviteText] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [activity, setActivity] = useState<Record<string, StudentActivitySnapshot>>({})

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api
      .getStudents(user.classroomId)
      .then((list) => {
        if (!cancelled) setStudents(list)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your students')
      })
    api
      .getClassroom(user.classroomId)
      .then((c) => {
        if (!cancelled) setClassroom(c)
      })
      .catch(() => {})
    api
      .listModules(user.classroomId)
      .then((m) => {
        if (!cancelled) setModules(m)
      })
      .catch(() => {})
    api
      .getClassroomStudentActivity(user.classroomId)
      .then((snapshots) => {
        if (!cancelled)
          setActivity(Object.fromEntries(snapshots.map((snapshot) => [snapshot.studentId, snapshot])));
      })
      .catch(() => {})
    // Poll so a student's answer (accepted / declined) shows up without a refresh; a student who joins also
    // triggers a presence_update, which refreshes the student grid.
    const loadInvitations = () => {
      void api
        .getInvitations(user.classroomId)
        .then((list) => {
          if (!cancelled) setInvitations(list)
        })
        .catch(() => {})
    }
    const inviteInterval = window.setInterval(loadInvitations, 15000)
    loadInvitations()
    return () => {
      cancelled = true
      window.clearInterval(inviteInterval)
    }
  }, [user])

  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      void api
        .listModules(user.classroomId)
        .then(setModules)
        .catch(() => {});
    };
    const changed = onModuleChanged(refresh);
    const deleted = onModuleDeleted(refresh);
    return () => {
      changed();
      deleted();
    };
  }, [user]);

  useEffect(
    () =>
      onStudentActivityUpdate((update) => {
        if (!user || update.classroomId !== user.classroomId) return;
        setActivity((current) => {
          const previous = current[update.studentId] ?? {
            studentId: update.studentId,
            active: null,
            recent: [],
            work: [],
          };
          const recent = update.activity
            ? [update.activity, ...previous.recent.filter((entry) => entry.id !== update.activity!.id)].slice(0, 6)
            : previous.recent;
          const work = update.work
            ? [update.work, ...previous.work.filter((entry) => entry.questionId !== update.work!.questionId)]
            : previous.work;
          return { ...current, [update.studentId]: { ...previous, active: update.active, recent, work } };
        });
      }),
    [user],
  );

  useEffect(
    () =>
      onPresenceUpdate((p) => {
        console.log('[teacher] presence_update', p)
        setOnline(new Set(p.onlineStudentIds))
        if (user && p.classroomId === user.classroomId) {
          void api.getStudents(user.classroomId).then(setStudents).catch(() => {})
        }
      }),
    [user],
  )

  useEffect(
    () =>
      onRaisedHandsUpdate((update) => {
        if (user && update.classroomId === user.classroomId) setHands(update.hands)
      }),
    [user],
  )

  async function createClassroom() {
    const name = window.prompt('Name your classroom')
    if (!name?.trim()) return
    setCreating(true)
    try {
      // The new classroom becomes the active one; the profile change reloads this dashboard for it.
      setStudents(null)
      setInvitations([])
      await createClassroomFor(name.trim())
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not create classroom')
    } finally {
      setCreating(false)
    }
  }

  async function inviteStudents(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const entries = inviteText.split(/[\n;]+/).map((line) => line.trim()).filter(Boolean)
    const invitees = entries.map((line) => {
      const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase()
      const name = email ? line.replace(email, '').replace(/^[\s<,]+|[\s>,]+$/g, '').trim() : ''
      return email ? { email, ...(name ? { name } : {}) } : null
    })
    if (invitees.some((invitee) => invitee === null)) {
      setInviteMessage('Check the list. Add one school email per line, or a name followed by an email.')
      return
    }
    setInviteBusy(true)
    setInviteMessage(null)
    try {
      const { invitations: sent, skipped } = await api.inviteStudents(user.classroomId, {
        students: invitees.filter((invitee): invitee is NonNullable<typeof invitee> => invitee !== null),
      })
      setInvitations(await api.getInvitations(user.classroomId))
      setInviteText('')
      const parts = []
      if (sent.length) parts.push(`${sent.length} invitation${sent.length === 1 ? '' : 's'} sent. Students see them when they sign in with that email and choose whether to join.`)
      if (skipped.length) parts.push(`Already in this class: ${skipped.join(', ')}.`)
      setInviteMessage(parts.join(' '))
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : 'Could not send invitations')
    } finally {
      setInviteBusy(false)
    }
  }

  async function removeInvitation(invitation: ClassroomInvitation) {
    const who = invitation.studentName || invitation.email
    const prompt = invitation.status === 'accepted' ? `Remove ${who} from this classroom?` : `Cancel the invitation to ${who}?`
    if (!user || !window.confirm(prompt)) return
    try {
      await api.removeInvitation(user.classroomId, invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      setStudents(await api.getStudents(user.classroomId))
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : 'Could not remove invitation')
    }
  }

  const byId = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students])
  const onlineCount = (students ?? []).filter((s) => online.has(s.id)).length
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const firstName = user?.name.trim().split(/\s+/)[0] || 'there'
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const studentCount = students?.length ?? 0

  return (
    <div className="mx-auto flex max-w-[1020px] flex-col gap-6 sm:gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
       <div className="flex flex-col gap-2">
        <p className="m-0 text-[13px] font-medium text-muted">{today}</p>
        <Heading as="h1" variant="title" className="text-[34px]! sm:text-[38px]!">
          {greeting}, {firstName}
        </Heading>
        <p className="m-0 text-[15px] text-muted">
          {students === null
            ? 'Loading your classroom…'
            : `${studentCount} student${studentCount === 1 ? '' : 's'} in ${classroom?.name ?? 'your classroom'}, ${onlineCount} online and ${hands.length} hand${hands.length === 1 ? '' : 's'} raised.`}
        </p>
       </div>
        <Button disabled={creating} onClick={() => void createClassroom()}>
          {creating ? 'Creating…' : '＋ New classroom'}
        </Button>
      </div>

      {error && <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}

      <LiveLessonControl
        classroomId={user!.classroomId}
        classroomName={classroom?.name ?? 'your classroom'}
        lessons={modules.filter((m) => m.status === 'published')}
        session={session}
        onSession={setSession}
        online={onlineCount}
        students={studentCount}
        hands={hands.length}
      />

      {/*
        Two columns on large screens: [students + lessons] | [raised hands, detail, invitations]. The column wrappers
        are `contents` below lg, so on a phone the order is raised hands, students, detail, invitations, lessons: the
        urgent thing (a raised hand) is never buried under a long student list.
      */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.95fr)]">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-2 min-w-0">
            <ClassroomGrid
              students={students}
              online={online}
              selectedId={selectedId}
              onSelect={setSelectedId}
              activity={activity}
            />
          </div>
          <div className="order-5 min-w-0">
            <Card
              title="Lessons"
              eyebrow="Your modules"
              icon={<BookIcon className="size-[18px]" />}
              tint="mint"
              bodyClassName="flex flex-col divide-y divide-border"
            >
              {modules.length === 0 ? (
                <p className="m-0 px-5 py-4 text-sm text-muted">No lessons yet. Lessons you create appear here for your students.</p>
              ) : (
                modules.map((m, i) => (
                  <Link
                    key={m.id}
                    to={`/teacher/modules/${m.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 text-ink transition hover:bg-surface-soft"
                  >
                    <span className="grid size-8 flex-none place-items-center rounded-full border border-border bg-surface text-[13px] font-semibold text-muted">{i + 1}</span>
                    <strong className="min-w-0 flex-1 truncate text-[14px]!">{m.title}</strong>
                    <span className="flex-none text-xs! font-normal! text-muted">{m.status === 'draft' ? 'Draft' : 'Published'}</span>
                  </Link>
                ))
              )}
              <div className="px-5 py-3.5">
                <Link
                  to="/teacher/modules/new"
                  className="inline-flex text-sm! font-semibold! text-ink underline underline-offset-4"
                >
                  + Build a module
                </Link>
              </div>
              <NewLessonForm onCreated={(lesson) => setModules((current) => [...current, lesson])} />
            </Card>
          </div>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-1 min-w-0">
            <RaiseHandAlert
              hands={hands}
              nameOf={(id) => byId.get(id)?.name ?? 'A student'}
              onHelp={(id) => {
                setSelectedId(id)
                if (user) emitAcknowledgeHand(id, user.classroomId)
                const active = activity[id]?.active
                if (!active) return
                const question = active.questionId ? `?questionId=${encodeURIComponent(active.questionId)}` : ''
                navigate(`/teacher/student-work/${id}/${active.moduleId}${question}`)
              }}
              onSelect={setSelectedId}
              activity={activity}
            />
          </div>
          <div className="order-3 min-w-0">
            <StudentDetailPanel student={selected} online={selected ? online.has(selected.id) : false} classroomId={user!.classroomId} lessons={modules} />
          </div>
          <div className="order-4 min-w-0">
            <AnnouncementsCard key={user!.classroomId} classroomId={user!.classroomId} />
          </div>
          <div className="order-6 min-w-0">
      <Card
        title="Invite students"
        eyebrow="Class invitations"
        icon={<UsersIcon className="size-[18px]" />}
        tint="lavender"
        bodyClassName="flex flex-col gap-4 p-5"
      >
        <p className="m-0 text-sm leading-relaxed text-muted">
          Paste school email addresses, one per line. Nobody is added automatically: each student sees the invitation when they sign in with a matching Google account and chooses to accept or decline.
        </p>
        <form onSubmit={(event) => void inviteStudents(event)} className="flex flex-col gap-3">
          <textarea
            className={`${INPUT} min-h-28 resize-y py-3`}
            value={inviteText}
            onChange={(event) => setInviteText(event.target.value)}
            placeholder={'alex@school.edu\nsam@school.edu\nTaylor Lee <taylor@school.edu>'}
            aria-label="Student school email addresses"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={inviteBusy || !inviteText.trim()}>
              {inviteBusy ? 'Sending invitations…' : 'Send invitations'}
            </Button>
            {inviteMessage && <span role="status" className="text-sm text-muted">{inviteMessage}</span>}
          </div>
        </form>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {invitations.length === 0 ? (
            <p className="m-0 px-4 py-3 text-sm text-muted">No invitations yet. Invite students above.</p>
          ) : invitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-medium text-ink">{invitation.studentName || invitation.email}</p>
                {invitation.studentName && <p className="m-0 truncate text-xs text-muted">{invitation.email}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">{INVITATION_LABEL[invitation.status]}</span>
                <Button size="sm" onClick={() => void removeInvitation(invitation)}>{invitation.status === 'accepted' ? 'Remove' : 'Cancel'}</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
          </div>
        </div>
      </div>

      <LessonPlanner />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <CodeTestPanel modules={modules} />
        <AnswerKeyPanel modules={modules} />
      </div>
    </div>
  )
}
