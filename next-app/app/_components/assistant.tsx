import { useEffect, useRef, useState } from "react";
import { api, errorMessage, send } from "./client";
import { Paperclip, Send, Sparkles, Trash2, X } from "lucide-react";
import { attachmentTypes } from "./imports";

type SavedMessage = { role: "user" | "assistant"; text: string };
type Message = SavedMessage | { role: "error"; text: string };
type ProposedAction = {
  operation: string;
  summary: string;
  token: string;
  impact?: Record<string, number> | null;
  confirmationPhrase?: string | null;
  expiresInSeconds: number;
};
type AssistantResult = { answer: string; action?: ProposedAction };


export function Assistant({ eventId, close, onAttach, onChanged }: {
  eventId: string;
  close: () => void;
  onAttach?: (file: File) => void;
  onChanged?: () => Promise<unknown>;
}) {
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [loadingHistory, setLoadingHistory] = useState(true);
  const [proposal, setProposal] = useState<ProposedAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
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
                setProposal(null); setConfirmation("");
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
        {proposal && (
          <div className="ai-proposal" role="region" aria-label="Review proposed administrative change">
            <div className="ai-proposal-title">Review before applying</div>
            <p>{proposal.summary}</p>
            {proposal.impact && (
              <dl className="ai-proposal-impact">
                {Object.entries(proposal.impact).map(([name, number]) => (
                  <div key={name}><dt>{name.replaceAll(/([A-Z])/g, " $1")}</dt><dd>{number}</dd></div>
                ))}
              </dl>
            )}
            <small className="micro">Nothing changes until an administrator approves this proposal. A newer workspace revision invalidates it.</small>
            {proposal.confirmationPhrase && (
              <label className="ai-confirm-label">
                Type <strong>{proposal.confirmationPhrase}</strong> to authorize
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={proposal.confirmationPhrase}
                  aria-label="Approval phrase" autoComplete="off" />
              </label>
            )}
            <div className="ai-proposal-actions">
              <button type="button" className="button primary" disabled={busy ||
                (!!proposal.confirmationPhrase && confirmation !== proposal.confirmationPhrase)}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const applied = await send<{ ok: boolean; result: { operation: string } }>(
                      "/ai/actions/execute", { token: proposal.token, confirmation });
                    if (!applied.ok) throw Error("The action was not confirmed.");
                    setProposal(null); setConfirmation("");
                    try { await onChanged?.(); }
                    catch { /* The database commit succeeded; the normal refresh can retry. */ }
                    setMessages(old => [...old, { role: "assistant", text:
                      "Completed and audited: " + applied.result.operation.replaceAll("_", " ") + "." }]);
                  } catch (error) {
                    setMessages(old => [...old, { role: "error", text: errorMessage(error) }]);
                  } finally { setBusy(false); }
                }}>Apply reviewed change</button>
              <button type="button" className="button" disabled={busy}
                onClick={() => { setProposal(null); setConfirmation(""); }}>Cancel</button>
            </div>
          </div>
        )}
        {busy && <p className="micro">Checking authorized records…</p>}
        <span ref={bottom} />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!question.trim() || busy || loadingHistory) return;
          const text = question;
          setQuestion("");
          setProposal(null); setConfirmation("");
          setMessages((old) => [...old, { role: "user", text }]);
          setBusy(true);
          try {
            const result = await send<AssistantResult>("/ai/ask", { eventId, question: text });
            setProposal(result.action || null);
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
      <small>Answers use authorized records. Administrative changes require review and confirmation.</small>
    </section>
  );
}
