import { useEffect, useRef, useState } from "react";
import { api, errorMessage, send } from "./client";
import { Paperclip, Send, Sparkles, Trash2, X } from "lucide-react";
import { attachmentTypes } from "./imports";

type SavedMessage = { role: "user" | "assistant"; text: string };
type Message = SavedMessage | { role: "error"; text: string };

export function Assistant({ eventId, close, onAttach }: { eventId: string; close: () => void; onAttach?: (file: File) => void }) {
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [loadingHistory, setLoadingHistory] = useState(true);
  const attachment = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let active = true;
    api<{ messages: SavedMessage[] }>("/ai/history")
      .then((result) => { if (active) setMessages(result.messages); })
      .catch((error) => {
        if (active) setMessages([{ role: "error", text: errorMessage(error) }]);
      })
      .finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottom.current?.scrollIntoView({ block: "end", behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, busy, loadingHistory]);
  return (
    <section className="assistant">
      <header>
        <div>
          <Sparkles size={18} />
          <strong>Ask Niyam</strong>
        </div>
        <div className="assistant-actions">
          <button
            className="icon"
            type="button"
            aria-label="Clear conversation"
            title="Clear saved conversation"
            disabled={busy || loadingHistory || !messages.length}
            onClick={async () => {
              if (!window.confirm("Clear your saved Ask Niyam conversation?")) return;
              try {
                await api("/ai/history", { method: "DELETE" });
                setMessages([]);
              } catch (error) {
                setMessages((old) => [...old, { role: "error", text: errorMessage(error) }]);
              }
            }}
          >
            <Trash2 size={16} />
          </button>
          <button className="icon" aria-label="Close assistant" onClick={close}>
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="chat-messages">
        {loadingHistory && <p className="micro">Loading your conversation…</p>}
        {!messages.length && !loadingHistory && (
          <div className="chat-empty">
            <Sparkles size={30} />
            <h3>Your examination assistant</h3>
            <p>
              Ask about your published schedule, faculty coverage, or the
              current examination.
            </p>
          </div>
        )}
        {messages.map((message, i) => (
          <p key={i} className={"message message-" + message.role}>
            {message.text}
          </p>
        ))}
        {busy && <p className="micro">Checking authorized records…</p>}
        <span ref={bottom} />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!question.trim() || busy || loadingHistory) return;
          const text = question;
          setQuestion("");
          setMessages((old) => [...old, { role: "user", text }]);
          setBusy(true);
          try {
            const result = await send<{ answer: string }>("/ai/ask", { eventId, question: text });
            setMessages((old) => [
              ...old,
              { role: "assistant", text: result.answer },
            ]);
          } catch (error) {
            setMessages((old) => [
              ...old,
              { role: "error", text: errorMessage(error) },
            ]);
          } finally {
            setBusy(false);
          }
        }}
      >
        {onAttach && (
          <>
            <input
              ref={attachment}
              type="file"
              accept={attachmentTypes}
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onAttach(file);
              }}
            />
            <button
              type="button"
              className="icon"
              aria-label="Attach a document"
              onClick={() => attachment.current?.click()}
            >
              <Paperclip size={17} />
            </button>
          </>
        )}
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your examination…"
          maxLength={600}
          disabled={busy || loadingHistory}
          aria-label="Message"
        />
        <button className="icon" disabled={busy || loadingHistory || !question.trim()} aria-label="Send message">
          <Send size={18} />
        </button>
      </form>
      <small>Answers use the records your role can access.</small>
    </section>
  );
}
