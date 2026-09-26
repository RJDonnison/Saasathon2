import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import {
  emitAcknowledgeHand,
  onPresenceUpdate,
  onRaisedHandsUpdate,
} from "../socket.ts";
import ClassroomGrid from "./ClassroomGrid.tsx";
import StudentDetailPanel from "./StudentDetailPanel.tsx";
import RaiseHandAlert from "./RaiseHandAlert.tsx";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Dot from "../ui/Dot.tsx";
import Eyebrow from "../ui/Eyebrow.tsx";
import Heading from "../ui/Heading.tsx";
import { HandIcon, PencilIcon, SparklesIcon, UsersIcon } from "../ui/icons.tsx";
import { CARD, INPUT, TINT, type Tint } from "../ui/styles.ts";
import type { Classroom, Module, User } from "../../../shared/types";
import type { RaisedHand } from "../../../shared/events";
import CodeTestPanel from "./CodeTestPanel.tsx";
import AnswerKeyPanel from "./AnswerKeyPanel.tsx";

function Stat({
  label,
  value,
  tint,
  icon,
}: {
  label: string;
  value: number | string;
  tint: Tint;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${CARD}`}
    >
      <span
        className={`grid size-9 flex-none place-items-center rounded-xl sm:size-11 sm:rounded-2xl ${TINT[tint]}`}
      >
        {icon}
      </span>
      <div className="flex flex-col gap-2">
        <div className="font-display text-2xl leading-none font-semibold tracking-tight sm:text-[28px]">
          {value}
        </div>
        <Eyebrow>{label}</Eyebrow>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted">
      {children}
    </span>
  );
}

export default function TeacherHome() {
  const { user } = useAuth();
  const [students, setStudents] = useState<User[] | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [hands, setHands] = useState<RaisedHand[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lesson, setLesson] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .getStudents(user.classroomId)
      .then((list) => {
        if (!cancelled) setStudents(list);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load your students",
          );
      });
    api
      .getClassroom(user.classroomId)
      .then((c) => {
        if (!cancelled) setClassroom(c);
      })
      .catch(() => {});
    api
      .listModules(user.classroomId)
      .then((m) => {
        if (!cancelled) setModules(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(
    () =>
      onPresenceUpdate((p) => {
        console.log("[teacher] presence_update", p);
        setOnline(new Set(p.onlineStudentIds));
      }),
    [],
  );

  useEffect(
    () =>
      onRaisedHandsUpdate((update) => {
        if (user && update.classroomId === user.classroomId) {
          setHands(update.hands);
        }
      }),
    [user],
  );

  async function createClassroom() {
    const name = window.prompt("Name your classroom");
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const code = `LOOP${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const room = await api.createClassroom(name.trim(), code);
      window.alert(`Classroom created. Join code: ${room.roomCode}`);
      window.location.assign("/teacher");
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Could not create classroom",
      );
    } finally {
      setCreating(false);
    }
  }

  const byId = useMemo(
    () => new Map((students ?? []).map((s) => [s.id, s])),
    [students],
  );
  const onlineCount = (students ?? []).filter((s) => online.has(s.id)).length;
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Eyebrow>Teacher dashboard</Eyebrow>
          <Heading as="h1" variant="title">
            Your classroom, at a glance.
          </Heading>
          <p className="m-0 text-[15px] text-muted">
            See who is learning, where they need support, and what they are
            asking.
          </p>
          {classroom && (
            <div className="flex flex-wrap gap-2">
              <Chip>{classroom.name}</Chip>
              <Chip>
                Join code{" "}
                <strong className="font-mono font-medium text-ink">
                  {classroom.roomCode}
                </strong>
              </Chip>
            </div>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={creating}
          onClick={() => void createClassroom()}
        >
          {creating ? "Creating…" : "＋ Create classroom"}
        </Button>
      </div>

      <Card
        title="Modules"
        eyebrow="Curriculum"
        bodyClassName="flex flex-col gap-3 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm text-muted">
            Create drafts privately, then publish changes live.
          </p>
          <Link
            className="rounded-xl bg-accent px-3 py-2 text-sm! font-semibold! text-white"
            to="/teacher/modules/new"
          >
            + New module
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {modules.map((module) => (
            <Link
              key={module.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm! font-semibold! text-ink hover:bg-surface-soft"
              to={`/teacher/modules/${module.id}`}
            >
              <span>{module.title}</span>
              <span className="text-xs! font-normal! text-muted">
                {module.status === "draft" ? "Draft" : "Published"}
              </span>
            </Link>
          ))}
        </div>
      </Card>

      {error && (
        <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>
          {error}
        </p>
      )}

      {/*
        Two columns on large screens: [stats + roll call] | [raised hands + detail]. The column wrappers are
        `contents` below lg, so on a phone the order is stats, raised hands, students, detail: the urgent
        thing (a raised hand) is never buried under a long student list.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="order-1 grid grid-cols-3 gap-3 sm:gap-4">
            <Stat
              label="Students"
              value={students?.length ?? "–"}
              tint="lavender"
              icon={<UsersIcon className="size-[18px] sm:size-5" />}
            />
            <Stat
              label="Online"
              value={students ? onlineCount : "–"}
              tint="mint"
              icon={<Dot live />}
            />
            <Stat
              label="Hands"
              value={hands.length}
              tint="peach"
              icon={<HandIcon className="size-[18px] sm:size-5" />}
            />
          </div>
          <div className="order-3 min-w-0">
            <ClassroomGrid
              students={students}
              online={online}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="order-2 min-w-0">
            <RaiseHandAlert
              hands={hands}
              nameOf={(id) => byId.get(id)?.name ?? "A student"}
              onHelp={(id) => user && emitAcknowledgeHand(id, user.classroomId)}
              onSelect={setSelectedId}
            />
          </div>
          <div className="order-4 min-w-0">
            <StudentDetailPanel
              student={selected}
              online={selected ? online.has(selected.id) : false}
            />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CodeTestPanel modules={modules} />
        <AnswerKeyPanel modules={modules} />
        <Card
          title="Plan a lesson"
          eyebrow="Lesson planner"
          icon={<PencilIcon className="size-[18px]" />}
          tint="lavender"
          bodyClassName="flex flex-col gap-4 p-5"
        >
          <label className="flex flex-col gap-2 text-[13px] text-muted">
            Topic
            <input
              className={`${INPUT} h-10`}
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              placeholder="For example, loops and repetition"
            />
          </label>
          <label className="flex flex-col gap-2 text-[13px] text-muted">
            Level
            <select className={`${INPUT} h-10`} defaultValue="beginner">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <div>
            <Button
              variant="primary"
              onClick={() =>
                window.alert(
                  "Lesson drafting needs the AI lesson service, which is not connected yet.",
                )
              }
            >
              Draft lesson plan
            </Button>
          </div>
          <p className="m-0 text-xs leading-relaxed text-muted">
            AI lesson planning is not connected in this demo yet. Current
            lessons: {modules.length}.
          </p>
        </Card>

        <Card
          title="Guide the way students learn"
          eyebrow="AI helper"
          icon={<SparklesIcon className="size-[18px]" />}
          tint="mint"
          bodyClassName="flex flex-col gap-4 p-5"
        >
          <p className="m-0 text-sm leading-relaxed text-muted">
            The student helper gives hints, never answers. Classroom-specific
            settings need somewhere to be stored before they can change how it
            responds.
          </p>
          <div className="grid gap-x-4 gap-y-3 text-[13px] text-muted sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="strictness"
                defaultChecked
                className="accent-accent"
              />{" "}
              Hints only
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="strictness" className="accent-accent" />{" "}
              Explanations allowed
            </label>
            <label className="flex flex-col gap-2">
              Focus topics
              <input
                className={`${INPUT} h-10 opacity-65`}
                placeholder="Variables, loops, functions"
                disabled
              />
            </label>
            <label className="flex flex-col gap-2">
              Custom instruction
              <input
                className={`${INPUT} h-10 opacity-65`}
                placeholder="Add a classroom note"
                disabled
              />
            </label>
          </div>
        </Card>
      </div>
    </div>
  );
}
