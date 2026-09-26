import { useEffect, useState } from "react";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Eyebrow from "../ui/Eyebrow.tsx";
import Heading from "../ui/Heading.tsx";
import InlineText from "../ui/InlineText.tsx";
import MathText from "../ui/MathText.tsx";
import Markdown from "../ui/Markdown.tsx";
import { BookIcon, PencilIcon } from "../ui/icons.tsx";
import { CARD, INPUT, TINT } from "../ui/styles.ts";
import CodeEditor from "./CodeEditor.tsx";
import { onModuleChanged } from "../socket.ts";
import { useWorkspace } from "./useWorkspace.ts";
import { useStudentActivity } from "./useStudentActivity.ts";
import type {
  Module,
  SectionBlock,
  StudentModule,
  StudentQuestion,
  StudentSection,
  StudentWork,
} from "../../../shared/types";
import { ArithmeticError, parseArithmetic } from "../../../math/arithmetic";

/** Only Markdown text blocks are authored today; a bare string of any other type is shown as text too. */
const blockText = (b: SectionBlock) =>
  typeof b.content === "string" ? b.content : null;

/**
 * One lesson: the intro, then section items in their teacher-authored mixed order.
 */
export default function ModuleView({
  module,
  index,
  total,
}: {
  module: Module | null;
  index: number;
  total: number;
}) {
  if (!module) {
    return (
      <section className={`${CARD} p-6`}>
        <p className="m-0 text-sm text-muted">No lesson selected.</p>
      </section>
    );
  }
  return <Lesson key={module.id} module={module} index={index} total={total} />;
}

function Lesson({
  module,
  index,
  total,
}: {
  module: Module;
  index: number;
  total: number;
}) {
  const [full, setFull] = useState<StudentModule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [work, setWork] = useState<Record<string, StudentWork>>({});
  const { setActiveQuestion } = useWorkspace();
  const { record } = useStudentActivity();

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getModule(module.id), api.getStudentWork(module.id)])
      .then(([m, savedWork]) => {
        if (!cancelled) {
          setFull(m as StudentModule); // students always get the student aggregate
          setWork(Object.fromEntries(savedWork.map((entry) => [entry.questionId, entry])));
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load this lesson",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [module.id, version]);
  useEffect(() => {
    if (full) record({ moduleId: module.id, type: "viewing_lesson" });
  }, [full, module.id, record]);
  useEffect(
    () =>
      onModuleChanged((change) => {
        if (change.moduleId === module.id) setVersion((value) => value + 1);
      }),
    [module.id],
  );

  useEffect(() => {
    const firstMathQuestion = full?.sections
      .flatMap((section) => section.questions)
      .find((question) => question.kind === "math");
    if (firstMathQuestion) setActiveQuestion(firstMathQuestion.id);
  }, [full, setActiveQuestion]);

  // Older intros start with a markdown "# Title" line that just repeats the heading.
  const intro = module.content.replace(/^#{1,6}[ \t]+.*\n+/, "").trim();
  const playgroundLanguage =
    full?.sections
      .flatMap((section) => section.questions)
      .find((question) => question.codeExercise)?.codeExercise?.language ??
    "javascript";
  const playgroundCode =
    playgroundLanguage === "python"
      ? 'print("Hello, Python!")'
      : "console.log(1 + 2)";

  return (
    <div className="flex flex-col gap-6">
      <section className={`relative overflow-hidden ${CARD} p-6 sm:p-7`}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-accent/15 blur-2xl"
        />
        <div className="relative flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <span
              className={`grid size-11 flex-none place-items-center rounded-2xl ${TINT.mint}`}
            >
              <BookIcon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-2.5">
              <Eyebrow>
                Lesson {String(index + 1).padStart(2, "0")} of{" "}
                {String(total).padStart(2, "0")}
              </Eyebrow>
              <Heading variant="title">{module.title}</Heading>
            </div>
          </div>
          {intro && (
            <p className="m-0 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line text-muted">
              <MathText text={intro} />
            </p>
          )}
        </div>
      </section>

      {error && (
        <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>
          {error}
        </p>
      )}

      {!full && !error && (
        <div
          className="flex flex-col gap-4"
          aria-busy="true"
          aria-label="Loading the lesson"
        >
          <div className="h-40 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
          <div className="h-56 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
        </div>
      )}

      {full?.sections.map((section, i) => (
        <SectionView
          key={section.id}
          section={section}
          moduleId={module.id}
          index={i}
          work={work}
        />
      ))}

      {full?.sections.some((section) =>
        section.questions.some((question) => question.kind === "code"),
      ) && (
        <CodeEditor
          editor={{ key: "playground", label: "the playground" }}
          filename="playground"
          language={playgroundLanguage}
          initialCode={playgroundCode}
          prompt="Playground"
          instructions="Try out anything from this lesson here. It isn’t part of an exercise."
        />
      )}
    </div>
  );
}

function SectionView({
  section,
  moduleId,
  index,
  work,
}: {
  section: StudentSection;
  moduleId: string;
  index: number;
  work: Record<string, StudentWork>;
}) {
  const reading = section.blocks.filter((b) => blockText(b)?.trim());
  const questions = section.questions;
  const ordered = section.items
    .map((item) =>
      item.itemType === "block"
        ? {
            type: "block" as const,
            value: section.blocks.find((block) => block.id === item.itemId),
          }
        : {
            type: "question" as const,
            value: section.questions.find(
              (question) => question.id === item.itemId,
            ),
          },
    )
    .filter(
      (
        item,
      ): item is
        | { type: "block"; value: SectionBlock }
        | { type: "question"; value: StudentQuestion } => Boolean(item.value),
    );
  const kind =
    reading.length && questions.length
      ? "Read & practise"
      : questions.length
        ? "Practise"
        : "Read";
  return (
    <section
      aria-labelledby={`section-${section.id}`}
      className="flex flex-col gap-4"
    >
      <header className="flex items-center gap-3">
        <span
          className={`grid size-8 flex-none place-items-center rounded-full font-mono text-[11px] ${questions.length && !reading.length ? TINT.peach : TINT.mint}`}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Eyebrow>{kind}</Eyebrow>
          <h2
            id={`section-${section.id}`}
            className="m-0! truncate font-display! text-[19px]! leading-tight! font-semibold! tracking-[-0.02em]!"
          >
            {section.title}
          </h2>
        </div>
      </header>

      {ordered.map((item) =>
        item.type === "block" ? (
          blockText(item.value)?.trim() && (
            <article
              key={item.value.id}
              className={`flex flex-col gap-6 p-6 sm:p-7 ${CARD}`}
            >
              <Markdown text={blockText(item.value)!} />
            </article>
          )
        ) : (
          <QuestionView
            key={item.value.id}
            question={item.value}
            moduleId={moduleId}
            sectionId={section.id}
            savedWork={work[item.value.id]}
          />
        ),
      )}
    </section>
  );
}

function QuestionView({
  question,
  moduleId,
  sectionId,
  savedWork,
}: {
  question: StudentQuestion;
  moduleId: string;
  sectionId: string;
  savedWork?: StudentWork;
}) {
  if (question.kind === "code" && question.codeExercise)
    return <CodeQuestion question={question} moduleId={moduleId} sectionId={sectionId} savedWork={savedWork} />;
  if (question.kind === "math") return <MathQuestion question={question} moduleId={moduleId} sectionId={sectionId} savedWork={savedWork} />;
  return <AnswerQuestion question={question} moduleId={moduleId} sectionId={sectionId} savedWork={savedWork} />;
}

/** "Write a function `double(n)` that returns…" -> a short, plain-text name for the exercise. */
const shortLabel = (prompt: string) => {
  const plain = prompt.replace(/`/g, "");
  return plain.length > 48 ? `${plain.slice(0, 47).trimEnd()}…` : plain;
};

function CodeQuestion({ question, moduleId, sectionId, savedWork }: { question: StudentQuestion; moduleId: string; sectionId: string; savedWork?: StudentWork }) {
  const ex = question.codeExercise!;
  return (
    <CodeEditor
      editor={{
        key: ex.id,
        label: shortLabel(question.prompt),
        exerciseId: ex.id,
        questionId: question.id,
      }}
      filename="solution"
      language={ex.language}
      initialCode={savedWork?.code ?? ex.starterCode}
      prompt={question.prompt}
      instructions={ex.instructions}
      moduleId={moduleId}
      sectionId={sectionId}
    />
  );
}

function AnswerQuestion({ question, moduleId, sectionId, savedWork }: { question: StudentQuestion; moduleId: string; sectionId: string; savedWork?: StudentWork }) {
  const [answer, setAnswer] = useState(savedWork?.answer ?? "");
  const [edited, setEdited] = useState(false);
  const [reported, setReported] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<boolean | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const { record, saveWork } = useStudentActivity();

  const startAnswering = () => {
    if (reported) return;
    setReported(true);
    record({ moduleId, sectionId, questionId: question.id, type: "answering_question" });
  };

  useEffect(() => {
    if (!edited) return;
    const timer = window.setTimeout(
      () => saveWork({ moduleId, sectionId, questionId: question.id, kind: "answer", value: answer }),
      650,
    );
    return () => window.clearTimeout(timer);
  }, [answer, edited, moduleId, question.id, saveWork, sectionId]);

  async function check() {
    if (!answer.trim()) return;
    record({ moduleId, sectionId, questionId: question.id, type: "checking_answer" });
    setChecking(true);
    setError(null);
    try {
      const attempt = await api.createAttempt({
        questionId: question.id,
        answer,
      });
      setResult(attempt.isCorrect);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not check your answer",
      );
    } finally {
      setChecking(false);
      setReported(false);
    }
  }

  return (
    <Card
      title="Question"
      eyebrow="Check yourself"
      icon={<PencilIcon className="size-[18px]" />}
      tint="peach"
      bodyClassName="flex flex-col gap-4 p-5"
    >
      <p className="m-0! text-[15px] leading-relaxed text-ink">
        <InlineText text={question.prompt} />
      </p>
      {question.kind === "mcq" && question.options.length > 0 ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only">Choose an answer</legend>
          {question.options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-sm transition hover:bg-surface-soft has-checked:border-ink has-checked:bg-surface-soft"
            >
              <input
                type="radio"
                name={question.id}
                value={o.text}
                checked={answer === o.text}
                onChange={() => {
                  setAnswer(o.text);
                  setEdited(true);
                  startAnswering();
                  setResult(undefined);
                }}
                className="accent-ink"
              />
              <InlineText text={o.text} />
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <label className="sr-only" htmlFor={`answer-${question.id}`}>
            Your answer
          </label>
          <input
            id={`answer-${question.id}`}
            className={`${INPUT} h-10 w-full`}
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              setEdited(true);
              startAnswering();
              setResult(undefined);
            }}
            onFocus={startAnswering}
            placeholder="Type your answer"
          />
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void check()}
          disabled={checking || !answer.trim()}
        >
          {checking ? "Checking…" : "Check"}
        </Button>
        {result !== undefined && (
          <p
            className={`m-0 text-sm font-medium ${result === true ? "text-mint-ink" : result === false ? "text-peach-ink" : "text-muted"}`}
          >
            {result === true
              ? "Correct."
              : result === false
                ? "Not quite. Try again."
                : "This question does not have a defined answer yet."}
          </p>
        )}
      </div>
      {error && (
        <p className={`m-0 rounded-xl px-3 py-2 text-sm ${TINT.peach}`}>
          {error}
        </p>
      )}
    </Card>
  );
}

function MathQuestion({ question, moduleId, sectionId, savedWork }: { question: StudentQuestion; moduleId: string; sectionId: string; savedWork?: StudentWork }) {
  const { setActiveQuestion } = useWorkspace();
  const [answer, setAnswer] = useState(savedWork?.answer ?? "");
  const [edited, setEdited] = useState(false);
  const [reported, setReported] = useState(false);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const { record, saveWork } = useStudentActivity();

  const startAnswering = () => {
    if (reported) return;
    setReported(true);
    record({ moduleId, sectionId, questionId: question.id, type: "answering_question" });
  };

  useEffect(() => {
    if (!edited) return;
    const timer = window.setTimeout(
      () => saveWork({ moduleId, sectionId, questionId: question.id, kind: "answer", value: answer }),
      650,
    );
    return () => window.clearTimeout(timer);
  }, [answer, edited, moduleId, question.id, saveWork, sectionId]);

  const changeAnswer = (next: string) => {
    setActiveQuestion(question.id);
    setAnswer(next);
    setEdited(true);
    startAnswering();
    setIsCorrect(null);
    setSyntaxError(null);
  };

  const checkAnswer = async () => {
    setActiveQuestion(question.id);
    record({ moduleId, sectionId, questionId: question.id, type: "checking_answer" });
    if (!answer.trim()) {
      setSyntaxError("Enter an answer before checking it.");
      return;
    }
    try {
      parseArithmetic(answer);
      setSyntaxError(null);
      setChecking(true);
      const result = await api.validateMath({
        questionId: question.id,
        expression: answer,
      });
      setIsCorrect(result.isCorrect);
    } catch (error) {
      setSyntaxError(
        error instanceof ArithmeticError
          ? "Use numbers and +, -, *, /, ^, or parentheses."
          : "Could not check that answer. Try again.",
      );
    } finally {
      setChecking(false);
      setReported(false);
    }
  };

  return (
    <Card
      title="Math question"
      eyebrow="Solve it"
      icon={<PencilIcon className="size-[18px]" />}
      tint="peach"
      bodyClassName="flex flex-col gap-4 p-5"
    >
      <p className="m-0 text-[15px] leading-relaxed text-ink">
        <MathText text={question.prompt} />
      </p>
      <label className="sr-only" htmlFor={`answer-${question.id}`}>
        Your answer
      </label>
      <input
        id={`answer-${question.id}`}
        className={`${INPUT} h-10 w-full font-mono`}
        value={answer}
        onFocus={() => {
          setActiveQuestion(question.id);
          startAnswering();
        }}
        onChange={(event) => changeAnswer(event.target.value)}
        placeholder="Enter your answer"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={checking}
          onClick={() => void checkAnswer()}
        >
          {checking ? "Checking..." : "Check answer"}
        </Button>
        <p className="m-0 text-xs text-muted">
          You can use an arithmetic expression, too.
        </p>
      </div>
      {syntaxError && (
        <p className="m-0! text-xs text-peach-ink">{syntaxError}</p>
      )}
      {isCorrect !== null && (
        <p
          className={`m-0! text-sm font-semibold! ${isCorrect ? "text-mint-ink" : "text-peach-ink"}`}
        >
          {isCorrect
            ? "Correct! Nice work."
            : "Not quite. Check your calculation and try again."}
        </p>
      )}
    </Card>
  );
}
