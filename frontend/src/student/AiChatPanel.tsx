import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";

// PLACEHOLDER: hits the MOCKED /api/ai/hint (returns a canned reply; no AI is called).
export default function AiChatPanel() {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<
    { from: "me" | "ai"; text: string }[]
  >([]);

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (!user || !question.trim()) return;
    const q = question;
    setQuestion("");
    setMessages((m) => [...m, { from: "me", text: q }]);
    try {
      // moduleId is hardcoded until this panel is wired to the current module (ModulePage).
      const { reply } = await api.aiHint({
        moduleId: "module-1",
        studentId: user.id,
        question: q,
      });
      setMessages((m) => [...m, { from: "ai", text: reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          from: "ai",
          text: err instanceof Error ? err.message : "Request failed",
        },
      ]);
    }
  }

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">AI helper</h2>
      <ul className="mb-2 space-y-1 text-sm">
        {messages.map((m, i) => (
          <li
            key={i}
            className={m.from === "me" ? "text-gray-900" : "text-blue-700"}
          >
            <strong>{m.from === "me" ? "You" : "AI"}:</strong> {m.text}
          </li>
        ))}
      </ul>
      <form onSubmit={ask} className="flex gap-2">
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask for a hint…"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
