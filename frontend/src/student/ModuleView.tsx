import { useEffect, useState } from "react";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Heading from "../ui/Heading.tsx";
import InlineText from "../ui/InlineText.tsx";
import MathText from "../ui/MathText.tsx";
import QuestionConversation from "../ui/QuestionConversation.tsx";
import Markdown from "../ui/Markdown.tsx";
import { CheckIcon, PencilIcon } from "../ui/icons.tsx";
import { CARD, GRADED_CARD_SHADOW, INPUT, TINT } from "../ui/styles.ts";
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
  locked,
}: {
  module: Omit<Module, "status"> | null;
  index: number;
  total: number;
  locked: boolean;
}) {
  if (!module) {
    return (
      <section className={`${CARD} p-6`}>
        <p className="m-0 text-sm text-muted">No lesson selected.</p>
      </section>
    );
  }
  return (
    <Lesson
      key={module.id}
      module={module}
      index={index}
      total={total}
      locked={locked}
    />
  );
}

function Lesson({
  module,
  index,
  total,
  locked,
}: {
  module: Omit<Module, "status">;
  index: number;
  total: number;
  locked: boolean;
}) {
  const [full, setFull] = useState<StudentModule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [work, setWork] = useState<Record<string, StudentWork>>({});
  const { setActiveQuestion } = useWorkspace();
  const { record } = useStudentActivity();

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setError(null);
    Promise.all([
      api.getModule(module.id, { signal }),
      api.getStudentWork(module.id, { signal }),
    ])
      .then(([m, savedWork]) => {
        if (!signal.aborted) {
          setFull(m as StudentModule); // students always get the student aggregate
          setWork(
            Object.fromEntries(
              savedWork.map((entry) => [entry.questionId, entry]),
            ),
          );
        }
      })
      .catch((err) => {
        if (!signal.aborted)
          setError(
            err instanceof Error ? err.message : "Could not load this lesson",
          );
      });
    return () => {
      controller.abort();
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
      <section className={`flex flex-col gap-3 ${CARD} p-6 sm:p-7`}>
        <div className="flex items-start justify-between gap-3">
          <Heading as="h1" variant="title" className="min-w-0 flex-1">
            {module.title}
          </Heading>
          <span className="flex-none rounded-lg border border-border bg-surface-soft px-2.5 py-1 text-xs font-semibold text-ink">
            Lesson {index + 1} of {total}
          </span>
        </div>
        {locked && (
          <div
            className={`flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm font-semibold ${TINT.mint}`}
            role="status"
          >
            <CheckIcon className="size-4" />
            Lesson complete. Reopen it below to make changes.
          </div>
        )}
        {intro && (
          <div className="max-w-2xl text-[15px] leading-relaxed text-ink">
            <Markdown text={intro} />
          </div>
        )}
      </section>

      {error && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}
          role="alert"
        >
          <span>{error}</span>
          <Button
            size="sm"
            variant="peach"
            onClick={() => setVersion((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      )}

      {!full && !error && <ModuleContentSkeleton />}

      {full?.sections.map((section, i) => (
        <SectionView
          key={section.id}
          section={section}
          moduleId={module.id}
          index={i}
          questionStart={full.sections
            .slice(0, i)
            .reduce(
              (count, previous) =>
                count +
                previous.items.filter((item) => item.itemType === "question")
                  .length,
              0,
            )}
          work={work}
          locked={locked}
        />
      ))}

      {full?.sections.some((section) =>
        section.questions.some((question) => question.kind === "code"),
      ) && (
        <Playground
          language={playgroundLanguage}
          initialCode={playgroundCode}
        />
      )}
    </div>
  );
}

function ModuleContentSkeleton() {
  const pulse = "animate-pulse rounded-lg bg-surface-soft motion-reduce:animate-none";
  return (
    <div
      className="flex flex-col gap-5"
      aria-busy="true"
      aria-label="Loading lesson content"
    >
      <div className="flex items-center gap-3">
        <div className={`size-8 rounded-full ${pulse}`} />
        <div className={`h-5 w-40 ${pulse}`} />
      </div>

      <section className={`flex flex-col gap-3 p-6 sm:p-7 ${CARD}`}>
        <div className={`h-5 w-3/4 ${pulse}`} />
        <div className={`h-4 w-full ${pulse}`} />
        <div className={`h-4 w-5/6 ${pulse}`} />
        <div className={`h-4 w-2/3 ${pulse}`} />
      </section>

      <section className={`flex flex-col gap-4 p-5 ${CARD}`}>
        <div className="flex items-center gap-3">
          <div className={`size-9 rounded-xl ${pulse}`} />
          <div className={`h-5 w-28 ${pulse}`} />
        </div>
        <div className={`h-4 w-full ${pulse}`} />
        <div className={`h-4 w-4/5 ${pulse}`} />
        <div className={`h-10 w-28 ${pulse}`} />
      </section>
    </div>
  );
}

function Playground({
  language,
  initialCode,
}: {
  language: string;
  initialCode: string;
}) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <CodeEditor
        editor={{ key: "playground", label: "the playground" }}
        filename="playground"
        language={language}
        initialCode={initialCode}
        prompt="Playground"
        instructions="Try out anything from this lesson here. It isn’t part of an exercise."
      />
    );
  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-3 p-5 ${CARD}`}
    >
      <div className="flex flex-col gap-1">
        <Heading>Playground</Heading>
        <p className="m-0 text-sm text-muted">
          Try out anything from this lesson.
        </p>
      </div>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open playground
      </Button>
    </section>
  );
}

function SectionView({
  section,
  moduleId,
  index,
  questionStart,
  work,
  locked,
}: {
  section: StudentSection;
  moduleId: string;
  index: number;
  questionStart: number;
  work: Record<string, StudentWork>;
  locked: boolean;
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
  const questionNumberAt = (itemIndex: number) =>
    questionStart +
    ordered
      .slice(0, itemIndex + 1)
      .filter((item) => item.type === "question").length;
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
        <div className="flex min-w-0">
          <h2
            id={`section-${section.id}`}
            className="m-0! truncate font-display! text-[19px]! leading-tight! font-semibold! tracking-[-0.02em]!"
          >
            {section.title}
          </h2>
        </div>
      </header>

      {ordered.map((item, itemIndex) =>
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
            questionNumber={questionNumberAt(itemIndex)}
            moduleId={moduleId}
            sectionId={section.id}
            savedWork={work[item.value.id]}
            locked={locked}
          />
        ),
      )}
    </section>
  );
}

function QuestionView({
  question,
  questionNumber,
  moduleId,
  sectionId,
  savedWork,
  locked,
}: {
  question: StudentQuestion;
  questionNumber: number;
  moduleId: string;
  sectionId: string;
  savedWork?: StudentWork;
  locked: boolean;
}) {
  if (question.kind === "code" && question.codeExercise)
    return (
      <>
        <CodeQuestion
          question={question}
          questionNumber={questionNumber}
          moduleId={moduleId}
          sectionId={sectionId}
          savedWork={savedWork}
          locked={locked}
        />
        <QuestionConversation questionId={question.id} />
      </>
    );
  if (question.kind === "math")
    return (
      <>
        <MathQuestion
          question={question}
          questionNumber={questionNumber}
          moduleId={moduleId}
          sectionId={sectionId}
          savedWork={savedWork}
          locked={locked}
        />
        <QuestionConversation questionId={question.id} />
      </>
    );
  return (
    <>
      <AnswerQuestion
        question={question}
        questionNumber={questionNumber}
        moduleId={moduleId}
        sectionId={sectionId}
        savedWork={savedWork}
        locked={locked}
      />
      <QuestionConversation questionId={question.id} />
    </>
  );
}

/** "Write a function `double(n)` that returns…" -> a short, plain-text name for the exercise. */
const shortLabel = (prompt: string) => {
  const plain = prompt.replace(/`/g, "");
  return plain.length > 48 ? `${plain.slice(0, 47).trimEnd()}…` : plain;
};

function CodeQuestion({
  question,
  questionNumber,
  moduleId,
  sectionId,
  savedWork,
  locked,
}: {
  question: StudentQuestion;
  questionNumber: number;
  moduleId: string;
  sectionId: string;
  savedWork?: StudentWork;
  locked: boolean;
}) {
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
      questionNumber={questionNumber}
      instructions={ex.instructions}
      moduleId={moduleId}
      sectionId={sectionId}
      readOnly={locked}
    />
  );
}

function AnswerQuestion({
  question,
  questionNumber,
  moduleId,
  sectionId,
  savedWork,
  locked,
}: {
  question: StudentQuestion;
  questionNumber: number;
  moduleId: string;
  sectionId: string;
  savedWork?: StudentWork;
  locked: boolean;
}) {
  const [answer, setAnswer] = useState(savedWork?.answer ?? "");
  const [edited, setEdited] = useState(false);
  const [reported, setReported] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<boolean | null | undefined>(() =>
    savedWork?.checkedAt ? savedWork.isCorrect : undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const { record, saveWork } = useStudentActivity();

  const startAnswering = () => {
    if (reported) return;
    setReported(true);
    record({
      moduleId,
      sectionId,
      questionId: question.id,
      type: "answering_question",
    });
  };

  useEffect(() => {
    if (!edited) return;
    const timer = window.setTimeout(
      () =>
        saveWork({
          moduleId,
          sectionId,
          questionId: question.id,
          kind: "answer",
          value: answer,
        }),
      650,
    );
    return () => window.clearTimeout(timer);
  }, [answer, edited, moduleId, question.id, saveWork, sectionId]);

  async function check() {
    if (!answer.trim()) return;
    setEdited(false);
    record({
      moduleId,
      sectionId,
      questionId: question.id,
      type: "checking_answer",
    });
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
      title={`Question ${questionNumber}`}
      icon={<PencilIcon className="size-[18px]" />}
      tint="peach"
      className={
        result === true
          ? GRADED_CARD_SHADOW.correct
          : result === false
            ? GRADED_CARD_SHADOW.incorrect
            : ""
      }
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
              className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-sm transition ${
                answer === o.text
                  ? result === true
                    ? "border-mint-ink/35 bg-mint text-mint-ink"
                    : result === false
                      ? "border-peach-ink/35 bg-peach text-peach-ink"
                      : "border-mint-ink/25 bg-mint/30 text-ink"
                  : "border-border bg-surface hover:bg-surface-soft"
              }`}
            >
              <input
                type="radio"
                disabled={locked}
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
            disabled={locked}
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
          disabled={locked || checking || !answer.trim()}
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
                ? "Incorrect."
                : "This question does not have a defined answer yet."}
          </p>
        )}
        {locked && result === undefined && (
          <p className="m-0 text-sm font-medium text-muted">Not checked.</p>
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

function MathQuestion({
  question,
  questionNumber,
  moduleId,
  sectionId,
  savedWork,
  locked,
}: {
  question: StudentQuestion;
  questionNumber: number;
  moduleId: string;
  sectionId: string;
  savedWork?: StudentWork;
  locked: boolean;
}) {
  const { setActiveQuestion } = useWorkspace();
  const [answer, setAnswer] = useState(savedWork?.answer ?? "");
  const [edited, setEdited] = useState(false);
  const [reported, setReported] = useState(false);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(() =>
    savedWork?.checkedAt ? savedWork.isCorrect : null,
  );
  const [checking, setChecking] = useState(false);
  const { record, saveWork } = useStudentActivity();

  const startAnswering = () => {
    if (reported) return;
    setReported(true);
    record({
      moduleId,
      sectionId,
      questionId: question.id,
      type: "answering_question",
    });
  };

  useEffect(() => {
    if (!edited) return;
    const timer = window.setTimeout(
      () =>
        saveWork({
          moduleId,
          sectionId,
          questionId: question.id,
          kind: "answer",
          value: answer,
        }),
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
    record({
      moduleId,
      sectionId,
      questionId: question.id,
      type: "checking_answer",
    });
    if (!answer.trim()) {
      setSyntaxError("Enter an answer before checking it.");
      return;
    }
    setEdited(false);
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
      title={`Math question ${questionNumber}`}
      icon={<PencilIcon className="size-[18px]" />}
      tint="peach"
      className={
        isCorrect === true
          ? GRADED_CARD_SHADOW.correct
          : isCorrect === false
            ? GRADED_CARD_SHADOW.incorrect
            : ""
      }
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
        disabled={locked}
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
          disabled={locked || checking}
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
          {isCorrect ? "Correct." : "Incorrect."}
        </p>
      )}
      {locked && isCorrect === null && (
        <p className="m-0! text-sm font-semibold! text-muted">
          Not checked.
        </p>
      )}
    </Card>
  );
}
