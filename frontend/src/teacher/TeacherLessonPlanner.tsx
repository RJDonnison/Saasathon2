import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Heading from "../ui/Heading.tsx";
import { BookIcon, SparklesIcon } from "../ui/icons.tsx";
import { INPUT, TINT } from "../ui/styles.ts";
import { createBlankModuleDocument } from "./moduleBuilderDocument.ts";
import type {
  AiLessonPlanRequest,
  LessonPlanDocument,
  LessonPlanSequenceItem,
  LessonPlanStatus,
  ModuleBuilderDocument,
  TeacherLessonPlan,
  MyClassroom,
} from "../../../shared/types";

const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REFERENCE_TEXT_CHARS = 10_000;
const MAX_REFERENCE_FILES = 5;

interface PlanningReference {
  id: string;
  name: string;
  text: string;
}

async function readPlanningReference(file: File): Promise<string> {
  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    throw new Error(`${file.name} is over the 10 MB limit.`);
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
    const [pdfjsLib, pdfWorker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    if (pdf.numPages > 60) throw new Error(`${file.name} is over the 60 page limit.`);
    const pages: string[] = [];
    let charCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages && charCount < MAX_REFERENCE_TEXT_CHARS; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .flatMap((item) => "str" in item ? [item.str] : [])
        .join(" ");
      pages.push(text);
      charCount += text.length;
    }
    const extracted = pages.join("\n\n").trim().slice(0, MAX_REFERENCE_TEXT_CHARS);
    if (!extracted) throw new Error(`${file.name} has no selectable text. Scanned PDFs need OCR before they can be used as context.`);
    return extracted;
  }
  if (!/\.(txt|md|markdown)$/i.test(file.name)) {
    throw new Error(`${file.name} is not supported. Choose a PDF, TXT, or Markdown file.`);
  }
  const text = (await file.text()).trim().slice(0, MAX_REFERENCE_TEXT_CHARS);
  if (!text) throw new Error(`${file.name} is empty.`);
  return text;
}

const EMPTY_SEQUENCE: LessonPlanSequenceItem[] = [
  { phase: "Connect", duration: "", teacherMoves: "", studentTask: "", support: "" },
  { phase: "Explore", duration: "", teacherMoves: "", studentTask: "", support: "" },
  { phase: "Reflect", duration: "", teacherMoves: "", studentTask: "", support: "" },
];

function blankDocument(): LessonPlanDocument {
  return {
    title: "", framework: "NZC / Te Mātaiaho", yearLevel: "", learningArea: "",
    curriculumFocus: "", walt: "", wilf: "", tib: "", keyCompetencies: [],
    culturalContext: "", priorLearning: "", learnerNeeds: "", resources: "",
    sequence: EMPTY_SEQUENCE.map((item) => ({ ...item })), assessmentEvidence: "",
    relieverBriefing: "", reflection: "",
  };
}

function TextField({ label, value, onChange, multiline = false, rows = 3, hint, maxLength }: {
  label: string; value: string; onChange: (value: string) => void;
  multiline?: boolean; rows?: number; hint?: string; maxLength?: number;
}) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium text-ink">
    {label}{hint && <span className="font-normal text-muted">{hint}</span>}
    {multiline
      ? <textarea className={`${INPUT} min-h-24 w-full resize-y py-2.5`} rows={rows} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
      : <input className={`${INPUT} h-10 w-full`} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}
  </label>;
}

function StatusLabel({ status }: { status: LessonPlanStatus }) {
  const label = status === "taught" ? "Taught" : status === "planned" ? "Planned" : "Draft";
  const tint = status === "taught" ? TINT.mint : status === "planned" ? TINT.lavender : "bg-surface-soft text-muted";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tint}`}>{label}</span>;
}

export default function TeacherLessonPlanner() {
  const { user, switchClassroom } = useAuth();
  const navigate = useNavigate();
  const { classroomId } = useParams();
  const [plans, setPlans] = useState<TeacherLessonPlan[]>([]);
  const [classrooms, setClassrooms] = useState<MyClassroom[]>([]);
  const [document, setDocument] = useState<LessonPlanDocument>(blankDocument);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<LessonPlanStatus>("draft");
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [lessonDate, setLessonDate] = useState("");
  const [topic, setTopic] = useState("");
  const [classContext, setClassContext] = useState("");
  const [references, setReferences] = useState<PlanningReference[]>([]);
  const [readingReferences, setReadingReferences] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([api.listTeacherLessonPlans(), api.myClassrooms()]).then(([items, rooms]) => {
      if (active) {
        setPlans(items.filter((plan) => plan.classroomId === classroomId));
        setClassrooms(rooms.filter((room) => room.role === "teacher"));
      }
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Could not load lesson plans");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classroomId]);

  useEffect(() => {
    setSelectedId(null);
    setDocument(blankDocument());
    setStatus("draft");
    setModuleId(null);
    setLessonDate("");
    setTopic("");
    setReferences([]);
  }, [classroomId]);

  async function addReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    if (references.length + files.length > MAX_REFERENCE_FILES) {
      setError(`Add up to ${MAX_REFERENCE_FILES} reference files.`);
      return;
    }
    setError(null);
    setReadingReferences(true);
    try {
      const additions: PlanningReference[] = [];
      for (const file of files) {
        additions.push({ id: crypto.randomUUID(), name: file.name, text: await readPlanningReference(file) });
      }
      setReferences((current) => [...current, ...additions]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that reference file");
    } finally {
      setReadingReferences(false);
    }
  }

  function update<K extends keyof LessonPlanDocument>(key: K, value: LessonPlanDocument[K]) {
    setDocument((current) => ({ ...current, [key]: value }));
  }

  function newPlan() {
    setSelectedId(null);
    setDocument(blankDocument());
    setStatus("draft");
    setModuleId(null);
    setLessonDate("");
    setTopic("");
    setReferences([]);
    setNotice(null);
  }

  function openPlan(plan: TeacherLessonPlan) {
    setSelectedId(plan.id);
    setDocument(plan.document);
    setStatus(plan.status);
    setModuleId(plan.moduleId);
    setLessonDate(plan.lessonDate ?? "");
    setTopic(plan.document.title);
    setReferences([]);
    setNotice(null);
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    const request: AiLessonPlanRequest = {
      topic: topic.trim(), framework: document.framework, yearLevel: document.yearLevel,
      learningArea: document.learningArea, curriculumFocus: document.curriculumFocus,
      classContext: [
        classContext.trim(),
        ...references.map((reference) => `Attached reference: ${reference.name}\n${reference.text}`),
        document.priorLearning && `Prior learning: ${document.priorLearning}`,
        document.learnerNeeds && `Learner needs: ${document.learnerNeeds}`,
      ].filter(Boolean).join("\n\n").slice(0, 11_000),
    };
    try {
      const result = await api.aiLessonPlan(request);
      setDocument(result.document);
      setStatus("draft");
      setModuleId(null);
      setSelectedId(null);
      setNotice("Draft ready. Review the curriculum reference and adapt it for your learners before saving.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft this lesson");
    } finally { setBusy(false); }
  }

  async function save(nextStatus = status): Promise<TeacherLessonPlan | null> {
    if (!document.title.trim()) { setError("Add a lesson title before saving."); return null; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const body = { document, status: nextStatus, lessonDate: lessonDate || null, moduleId };
      const saved = selectedId
        ? await api.updateTeacherLessonPlan(selectedId, body)
        : await api.createTeacherLessonPlan(body);
      setSelectedId(saved.id); setStatus(saved.status); setPlans((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setModuleId(saved.moduleId);
      setNotice(nextStatus === "taught" ? "Lesson marked as taught. Add what you noticed and the next step for next time." : "Lesson plan saved to this classroom.");
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this lesson plan");
      return null;
    } finally { setBusy(false); }
  }

  async function buildStudentModule() {
    if (!selectedId) return;
    setError(null); setNotice(null); setBusy(true);
    try {
      const plan = await save();
      if (!plan) return;
      if (!plan.document.sequence.some((item) => item.studentTask.trim())) {
        setError("Add at least one student activity to the lesson sequence before building a module.");
        return;
      }
      if (user && user.classroomId !== plan.classroomId) await switchClassroom(plan.classroomId);
      if (plan.moduleId) {
        navigate(`/teacher/modules/${plan.moduleId}`, { state: { fromLessonPlan: true } });
        return;
      }
      const moduleDocument = createBlankModuleDocument();
      moduleDocument.title = plan.document.title;
      moduleDocument.content = [
        plan.document.walt && `Learning intention: ${plan.document.walt}`,
        plan.document.wilf && `Success looks like: ${plan.document.wilf}`,
        plan.document.tib && `Why we are learning this: ${plan.document.tib}`,
      ].filter(Boolean).join("\n\n");
      moduleDocument.sections = plan.document.sequence.filter((item) => item.studentTask.trim()).map((item, index) => ({
        id: crypto.randomUUID(),
        title: item.phase.trim() || `Learning activity ${index + 1}`,
        items: [{
          id: crypto.randomUUID(), type: "block" as const, blockType: "markdown",
          content: [item.duration && `**Time:** ${item.duration}`, item.studentTask.trim()].filter(Boolean).join("\n\n"),
        }],
      }));
      const activityList = plan.document.sequence
        .filter((item) => item.studentTask.trim())
        .map((item, index) => `${index + 1}. ${item.phase || "Activity"}: ${item.studentTask}`)
        .join("\n");
      const planContext = [
        plan.document.learningArea,
        plan.document.title,
        plan.document.walt,
        plan.document.wilf,
        plan.document.curriculumFocus,
        activityList,
      ].join("\n");
      const pythonLesson = /\bpython\b|\.py\b|python\s*3/i.test(planContext);
      const programmingLesson = pythonLesson || /\b(programming|coding|computer science|javascript|typescript|for loop|while loop|variables?|print to (the )?console)\b/i.test(planContext);
      const request = [
        "Turn this saved teaching plan into a complete, engaging STUDENT-FACING learning module. Students will read and complete it themselves.",
        `Year level / phase: ${plan.document.yearLevel || "Use the age level implied by the plan"}`,
        `Learning area: ${plan.document.learningArea || "Use the lesson topic"}`,
        `Curriculum focus: ${plan.document.curriculumFocus || "Use the learning intention"}`,
        `WALT: ${plan.document.walt || "Derive a clear learning intention from the activities"}`,
        `WILF: ${plan.document.wilf || "Write simple success criteria students can check"}`,
        `Student activities from the plan:\n${activityList}`,
        "Build the complete student lesson for this learning area, not just a programming activity. Turn every listed student activity into clear learner-facing steps, add a short explanation or example where it helps, and include a concrete piece of work students can produce. Keep the learning intention and success criteria visible. Make each task and question use the subject's real ideas, vocabulary, and way of working. Do not use generic reflection as the only practice.",
        "Adapt practice to the subject: for English or literacy, interpret or create a text and use evidence; for maths, solve a problem and explain the method; for science, predict, observe, interpret data, or explain evidence; for social sciences, examine a source, place, event, or perspective and justify an idea; for languages or Te Reo Māori, use vocabulary in a meaningful context; for arts or design, create or critique work using relevant choices; for health or PE, apply learning to a practical decision or movement task. For any other subject, use its normal tools, vocabulary, and kind of student work.",
        "Include at least one multiple-choice question, one short-answer question, and one long-answer question. Base each on the lesson focus and include correct/model answers only for multiple choice and short answer. Long-answer questions are reflective or explain-your-thinking responses and must not have an answer key.",
        pythonLesson
          ? "Make the questions specific to the lesson. Do not add code questions yourself; the app will add beginner Python exercises for variables and printing, for loops, and while loops."
          : programmingLesson
            ? "Make the questions and practice specific to the programming lesson. Include at least one runnable code exercise with a small starter skeleton, clear student instructions, and 2 or 3 deterministic tests."
            : "Make the questions and practice specific to this learning area and the lesson activities. Do not add an unrelated coding exercise.",
        "Do not include teacher moves, differentiation notes, learner needs, teacher-only hints, or reliever instructions. Keep the module as an unpublished draft for teacher review.",
      ].join("\n\n");
      const generated = await api.aiModuleSuggestions({ request, document: moduleDocument });
      let studentDocument = generated.suggestions.find((suggestion) => suggestion.document)?.document;
      if (!studentDocument) {
        throw new Error(generated.warning ?? "The AI could not prepare a complete student module. Try again or add more detail to the lesson plan.");
      }
      const requiredKinds = ["mcq", "short", "long"];
      const subject = planContext;
      if (programmingLesson && !pythonLesson) requiredKinds.push("code");
      if (/\b(math|mathematics|algebra|geometry|statistics|numeracy)\b/i.test(subject)) requiredKinds.push("math");
      const missingKinds = (document: ModuleBuilderDocument) => {
        const questionKinds = new Set(document.sections.flatMap((section) =>
          section.items.filter((item) => item.type === "question").map((item) => item.kind),
        ));
        return requiredKinds.filter((kind) => !questionKinds.has(kind as "mcq" | "short" | "long" | "code" | "math"));
      };
      let missing = missingKinds(studentDocument);
      if (missing.length) {
        try {
          const repair = await api.aiModuleSuggestions({
            document: studentDocument,
            request: `Revise this student-facing module and return the complete updated document. It is missing these required question types: ${missing.join(", ")}. Add each missing type as a real, topic-specific student activity while preserving the existing material. For a code question, add a runnable ${/python/i.test(subject) ? "Python" : "JavaScript"} exercise with clear starter code, student instructions, and 2 or 3 deterministic tests. For a long answer, ask students to explain their thinking and leave answerKey null. Keep it student-facing and do not add teacher notes.`,
          });
          const repairedDocument = repair.suggestions.find((suggestion) => suggestion.document)?.document;
          if (repairedDocument) studentDocument = repairedDocument;
        } catch {
          // Keep the complete first draft available for teacher review if repair is unavailable.
        }
        missing = missingKinds(studentDocument);
      }
      if (pythonLesson) {
        const question = (
          prompt: string,
          instructions: string,
          starterCode: string,
          tests: Array<{ name: string; args: unknown[]; expected: unknown }>,
        ) => ({
          id: crypto.randomUUID(),
          type: "question" as const,
          kind: "code" as const,
          prompt,
          answerKey: null,
          options: [],
          language: "python",
          instructions,
          starterCode,
          functionName: "solution",
          hiddenCode: "",
          checks: [],
          tests: tests.map((test) => ({ id: crypto.randomUUID(), ...test })),
        });
        studentDocument.sections.push({
          id: crypto.randomUUID(),
          title: "Python practice",
          items: [
            question(
              "Variables and printing: finish `solution(name)` so it builds a greeting in a variable, prints it, and returns the same text. For example, `solution(\"Ari\")` should print and return `Hello, Ari!`.",
              "Use a variable to store the greeting. Print it with `print(...)`, then return it so the checker can check your result.",
              'def solution(name):\n    greeting = ""  # Build a greeting using name\n    print(greeting)\n    return greeting\n',
              [
                { name: "A name", args: ["Ari"], expected: "Hello, Ari!" },
                { name: "Another name", args: ["Mina"], expected: "Hello, Mina!" },
              ],
            ),
            question(
              "For loop: finish `solution(n)` so it uses a `for` loop to add every whole number from 1 through n, then returns the total.",
              "Start a total at 0. Use `for number in range(1, n + 1):` and add each number to the total.",
              "def solution(n):\n    total = 0\n    # Add a for loop here\n    return total\n",
              [
                { name: "Adds through four", args: [4], expected: 10 },
                { name: "Adds through one", args: [1], expected: 1 },
                { name: "Zero", args: [0], expected: 0 },
              ],
            ),
            question(
              "While loop: finish `solution(n)` so it uses a `while` loop to build and return a countdown list from n down to 1. For n = 3, return `[3, 2, 1]`.",
              "Create an empty list and a counter. While the counter is at least 1, add it to the list and subtract 1.",
              "def solution(n):\n    countdown = []\n    current = n\n    # Add a while loop here\n    return countdown\n",
              [
                { name: "Counts down from three", args: [3], expected: [3, 2, 1] },
                { name: "Counts down from one", args: [1], expected: [1] },
                { name: "Zero", args: [0], expected: [] },
              ],
            ),
          ],
        });
      }
      missing = missingKinds(studentDocument);
      const plannerWarning = missing.length
        ? `The AI could not add ${missing.join(", ")} practice automatically. The module draft is ready to review; add the missing item with the builder controls before publishing.`
        : undefined;
      const created = await api.createBuilderModule(studentDocument);
      let moduleWarning = plannerWarning;
      let planLinked = false;
      try {
        await api.linkTeacherLessonPlanModule(plan.id, created.module.id);
        planLinked = true;
      } catch (err) {
        const detail = err instanceof Error ? err.message : "the plan link failed";
        moduleWarning = [plannerWarning, `The student module draft was created, but its lesson-plan link could not be saved: ${detail}`].filter(Boolean).join(" ");
      }
      const linkedPlan = { ...plan, moduleId: planLinked ? created.module.id : null };
      setModuleId(linkedPlan.moduleId);
      setPlans((items) => [linkedPlan, ...items.filter((item) => item.id !== linkedPlan.id)]);
      navigate(`/teacher/modules/${created.module.id}`, { state: { plannerWarning: moduleWarning, fromLessonPlan: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the student module builder");
    } finally { setBusy(false); }
  }

  function editSequence(index: number, key: keyof LessonPlanSequenceItem, value: string) {
    setDocument((current) => ({ ...current, sequence: current.sequence.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  }

  const selectedPlan = plans.find((plan) => plan.id === selectedId) ?? null;
  const activeClassName = classrooms.find((classroom) => classroom.id === user?.classroomId)?.name ?? "your active classroom";

  if (!user?.classroomId) return <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
    <Heading as="h1" variant="title">Plan a lesson</Heading>
    <p className="m-0 text-sm text-muted">Create or open a classroom first, then your plans can be saved with that class.</p>
    <Link to="/teacher" className="w-fit text-sm! font-semibold! text-mint-ink underline">Back to teacher home</Link>
  </main>;

  return <main className="mx-auto flex max-w-[1120px] flex-col gap-6 pb-10">
    <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
      <div className="flex flex-col gap-2">
        <Link to={`/teacher/class/${classroomId}/manage`} className="w-fit text-sm! font-medium! text-muted underline">← {activeClassName}</Link>
        <p className="m-0 text-[13px] text-muted">{selectedPlan ? `Editing a plan for ${selectedPlan.classroomName}` : `New plans go to ${activeClassName}`}</p>
        <Heading as="h1" variant="title">Make the next lesson easier to teach</Heading>
        <p className="m-0 max-w-2xl text-sm text-muted">Build a clear teaching record and a useful handover for anyone covering the class.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedId && <Button onClick={() => window.print()}>Print / save PDF</Button>}
        <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save plan"}</Button>
      </div>
    </header>

    {error && <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`} role="alert">{error}</p>}
    {notice && <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.mint}`} role="status">{notice}</p>}

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] print:block">
      <div className="flex min-w-0 flex-col gap-5">
        <Card title="Start with your class" eyebrow="AI draft, ready for your edits" icon={<SparklesIcon className="size-[18px]" />} tint="lavender" className="print:hidden">
          <form onSubmit={(event) => void generate(event)} className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="What are you teaching?" value={topic} onChange={setTopic} />
              <TextField label="Year level or phase" value={document.yearLevel} onChange={(value) => update("yearLevel", value)} />
              <TextField label="Learning area" value={document.learningArea} onChange={(value) => update("learningArea", value)} />
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">Curriculum framework
                <select className={`${INPUT} h-10`} value={document.framework} onChange={(event) => update("framework", event.target.value)}>
                  <option>NZC / Te Mātaiaho</option><option>Te Marautanga o Aotearoa</option><option>NCEA (transition)</option><option>NZCE / NZACE</option><option>Other / school framework</option>
                </select>
              </label>
            </div>
            <TextField label="Curriculum progress outcome or reference" hint="Paste the wording your school uses. The AI will not invent an official reference." value={document.curriculumFocus} onChange={(value) => update("curriculumFocus", value)} multiline rows={2} />
            <TextField label="Class context for the draft" hint="What have they learned already? What should a reliever know?" value={classContext} onChange={setClassContext} multiline rows={2} maxLength={1200} />
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-ink">Reference files</span>
                  <span className="text-xs text-muted">Add PDFs or TXT/Markdown notes for the AI to use as source material. Text is extracted in your browser and is not saved with the lesson plan.</span>
                </div>
                <label className={`${INPUT} inline-flex h-10 cursor-pointer items-center gap-2 text-sm`}>
                  {readingReferences ? "Reading files…" : "Add files"}
                  <input className="sr-only" type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" multiple disabled={readingReferences || references.length >= MAX_REFERENCE_FILES} onChange={(event) => void addReferences(event)} />
                </label>
              </div>
              {references.map((reference) => <div key={reference.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                <span className="min-w-0 truncate">{reference.name} · {reference.text.length.toLocaleString()} characters</span>
                <Button size="sm" onClick={() => setReferences((items) => items.filter((item) => item.id !== reference.id))}>Remove</Button>
              </div>)}
              <p className="m-0 text-xs text-muted">Up to {MAX_REFERENCE_FILES} files, 10 MB each. PDF text is capped before it is sent with the draft request. Scanned PDFs without selectable text are not supported yet.</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="m-0 max-w-xl text-xs text-muted">AI suggestions are a starting point. Check the curriculum reference and local tikanga before using them.</p>
              <Button type="submit" variant="primary" disabled={busy || !topic.trim()}>{busy ? "Drafting…" : "Draft with AI"}</Button>
            </div>
          </form>
        </Card>

        <Card title="Your teaching plan" eyebrow="Edit every part before sharing" icon={<BookIcon className="size-[18px]" />}>
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <TextField label="Lesson title" value={document.title} onChange={(value) => update("title", value)} />
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">Lesson date<input type="date" className={`${INPUT} h-10`} value={lessonDate} onChange={(event) => setLessonDate(event.target.value)} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">Record as<select className={`${INPUT} h-10`} value={status} onChange={(event) => setStatus(event.target.value as LessonPlanStatus)}><option value="draft">Draft</option><option value="planned">Planned</option><option value="taught">Taught</option></select></label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Curriculum focus" value={document.curriculumFocus} onChange={(value) => update("curriculumFocus", value)} multiline />
              <TextField label="WALT · What are we learning to?" value={document.walt} onChange={(value) => update("walt", value)} multiline />
              <TextField label="WILF · What success looks like" value={document.wilf} onChange={(value) => update("wilf", value)} multiline />
              <TextField label="TIB · Why this matters" value={document.tib} onChange={(value) => update("tib", value)} multiline />
            </div>
            <TextField label="Key competencies" hint="Separate with commas. Choose the ones that fit this lesson." value={document.keyCompetencies.join(", ")} onChange={(value) => update("keyCompetencies", value.split(",").map((part) => part.trim()).filter(Boolean))} />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Cultural and local context" value={document.culturalContext} onChange={(value) => update("culturalContext", value)} multiline />
              <TextField label="Prior learning" hint="What students have already practised" value={document.priorLearning} onChange={(value) => update("priorLearning", value)} multiline />
              <TextField label="Learner needs and differentiation" value={document.learnerNeeds} onChange={(value) => update("learnerNeeds", value)} multiline />
              <TextField label="Resources and preparation" value={document.resources} onChange={(value) => update("resources", value)} multiline />
            </div>

            <section className="flex flex-col gap-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3"><Heading as="h2">Lesson sequence</Heading><span className="print:hidden"><Button size="sm" disabled={document.sequence.length >= 10} onClick={() => update("sequence", [...document.sequence, { phase: "", duration: "", teacherMoves: "", studentTask: "", support: "" }])}>＋ Add step</Button></span></div>
              {document.sequence.map((item, index) => <article key={index} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                  <TextField label={`Day, lesson or phase ${index + 1}`} value={item.phase} onChange={(value) => editSequence(index, "phase", value)} />
                  <TextField label="Time" value={item.duration} onChange={(value) => editSequence(index, "duration", value)} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Teacher moves" value={item.teacherMoves} onChange={(value) => editSequence(index, "teacherMoves", value)} multiline rows={2} />
                  <TextField label="What students do" value={item.studentTask} onChange={(value) => editSequence(index, "studentTask", value)} multiline rows={2} />
                </div>
                <TextField label="Support or extension" value={item.support} onChange={(value) => editSequence(index, "support", value)} multiline rows={2} />
                {document.sequence.length > 1 && <span className="print:hidden"><Button size="sm" className="self-start" onClick={() => update("sequence", document.sequence.filter((_, itemIndex) => itemIndex !== index))}>Remove step</Button></span>}
              </article>)}
            </section>

            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Assessment evidence" hint="What will you notice, collect or listen for?" value={document.assessmentEvidence} onChange={(value) => update("assessmentEvidence", value)} multiline />
              <TextField label="Reliever briefing" hint="What to do, where students are up to, and what not to reteach" value={document.relieverBriefing} onChange={(value) => update("relieverBriefing", value)} multiline />
            </div>
            <TextField label="Reflection and next steps" hint="Complete after the lesson to track what was taught and what comes next." value={document.reflection} onChange={(value) => update("reflection", value)} multiline />
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 print:hidden">
              {selectedId && <Button onClick={() => void buildStudentModule()} disabled={busy || (!moduleId && !document.sequence.some((item) => item.studentTask.trim()))}>{moduleId ? "Open student module" : busy ? "Building student module…" : "Build student module"}</Button>}
              {selectedId && status !== "taught" && <Button onClick={() => void save("taught")} disabled={busy}>Mark as taught</Button>}
              {selectedId && <Button onClick={() => window.print()}>Print / save PDF</Button>}
              <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save plan"}</Button>
            </div>
          </div>
        </Card>
      </div>

      <aside className="flex flex-col gap-4 print:hidden">
        <Card title="Saved plans" eyebrow={activeClassName} action={<Button size="sm" onClick={newPlan}>New</Button>}>
          {loading ? <p className="m-0 text-sm text-muted">Loading your plans…</p> : plans.length === 0 ? <p className="m-0 text-sm text-muted">Saved plans will appear here. Start with an AI draft or write one yourself.</p> : <div className="flex flex-col divide-y divide-border">
            {plans.map((plan) => <button key={plan.id} onClick={() => openPlan(plan)} className={`flex w-full flex-col gap-2 py-3 text-left first:pt-0 last:pb-0 ${selectedId === plan.id ? "text-ink" : "text-muted"}`}>
              <span className="flex w-full items-start justify-between gap-2"><strong className="text-sm font-medium text-ink">{plan.document.title}</strong><StatusLabel status={plan.status} /></span>
              <span className="text-xs">{plan.document.learningArea || "No learning area"}{plan.lessonDate ? ` · ${new Date(`${plan.lessonDate}T00:00:00`).toLocaleDateString()}` : ""}</span>
            </button>)}
          </div>}
        </Card>
        <section className="rounded-2xl border border-border bg-surface-soft p-5">
          <p className="m-0 text-sm font-semibold text-ink">A handover that travels</p>
          <p className="mt-2! mb-0! text-sm! text-muted">Prior learning, learner needs, the lesson sequence and the next step stay together. Print it for a reliever, or build a student module from the activities and review it before publishing.</p>
        </section>
      </aside>
    </div>
  </main>;
}
