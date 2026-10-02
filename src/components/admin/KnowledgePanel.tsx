"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Ellie learns from the questions she could not answer and from feedback on her answers. Both arrive
// here by themselves: unanswered questions and what customers said come from ElevenLabs' post-call
// analysis, 👎 from the website chat, and corrections from staff editing Aida's or Ellie's drafts.
// Staff write or fix the answer and approve it, and it is published as "CDA approved FAQ" at once.

type Gap = { id: number; conversation_id: string | null; channel: string | null; question: string; created_at: string };
type Faq = { id: number; question: string; answer: string; approved_by: string | null; updated_at: string };
type Published = { document_id: string | null; entries: number; published_at: string | null };
type Group = { question: string; answer: string; ids: number[] };
type FeedbackItem = {
  id: number;
  kind: "feedback" | "correction" | "style";
  source: "chat" | "said" | "aida" | "email";
  channel: string | null;
  question: string | null;
  original_answer: string | null;
  comment: string | null;
  corrected_answer: string | null;
  created_at: string;
};
type Score = { likes: number; dislikes: number };
type DraftCounts = { total: number; unchanged: number; polished: number; corrected: number; declined: number; discarded: number };
type State = {
  gaps: Gap[];
  feedback: FeedbackItem[];
  score: Score;
  drafts: { email: DraftCounts; aida: DraftCounts };
  faq: Faq[];
  published: Published;
};

/** "18 of 20 sent unchanged · 1 style edit · 1 corrected", or null when there were none this week. */
function draftLine(counts: DraftCounts | undefined, notSent: "declined" | "discarded"): string | null {
  if (!counts?.total) return null;
  const parts = [`${counts.unchanged} of ${counts.total} sent unchanged`];
  if (counts.polished) parts.push(`${counts.polished} style edit${counts.polished === 1 ? "" : "s"}`);
  if (counts.corrected) parts.push(`${counts.corrected} corrected`);
  if (counts[notSent]) parts.push(`${counts[notSent]} ${notSent === "declined" ? "declined" : "not sent"}`);
  return parts.join(" · ");
}

const CHANNELS: Record<string, string> = {
  website: "Website",
  telegram: "Telegram",
  email: "Email",
  instagram: "Instagram",
  messenger: "Messenger",
  phone: "Phone",
  alexa: "Alexa",
  aida: "Aida room",
};

function sourceLabel(item: FeedbackItem): string {
  if (item.source === "chat") return "👎 Website chat";
  if (item.source === "said") return `💬 Said by the customer · ${item.channel ? CHANNELS[item.channel] ?? item.channel : "unknown channel"}`;
  const style = item.kind === "style";
  if (item.source === "aida") return style ? "✏️ Staff reworded Aida's draft · style only" : "✏️ Staff corrected Aida's draft";
  return style ? "✏️ Staff reworded Ellie's email draft · style only" : "✏️ Staff corrected Ellie's email draft";
}

const UNFINISHED = /\[check/i;

type FeedbackTab = "customer" | "aida" | "email";

/** Customer feedback (👎 in the chat, complaints said in any conversation) and the two kinds of staff correction. */
const FEEDBACK_TABS: { id: FeedbackTab; label: string; sources: FeedbackItem["source"][] }[] = [
  { id: "customer", label: "💬 Customer feedback", sources: ["chat", "said"] },
  { id: "aida", label: "📞 Aida corrections", sources: ["aida"] },
  { id: "email", label: "✉️ Email corrections", sources: ["email"] },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const keyOf = (group: Group) => group.ids.join("-");

export function KnowledgePanel({ staffToken, onSignOut }: { staffToken: string; onSignOut: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { question: string; answer: string }>>({});
  const [editing, setEditing] = useState<Record<number, { question: string; answer: string }>>({});
  const [manual, setManual] = useState({ question: "", answer: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedbackTab, setFeedbackTab] = useState<FeedbackTab>("customer");

  const call = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const response = await fetch(path, {
        ...init,
        headers: { "x-aida-staff": staffToken, "Content-Type": "application/json" },
      });
      if (response.status === 401) {
        onSignOut();
        return null;
      }
      const body = (await response.json().catch(() => ({}))) as Partial<State> & { groups?: Group[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
      return body;
    },
    [staffToken, onSignOut],
  );

  const load = useCallback(async () => {
    try {
      const body = await call("/api/admin/knowledge");
      if (body?.gaps && body.faq && body.published) {
        const loaded = body as State;
        setState(loaded);
        // Open on a tab that has something in it, rather than an empty one.
        setFeedbackTab((current) => {
          const has = (tab: FeedbackTab) =>
            loaded.feedback.some((item) => FEEDBACK_TABS.find((info) => info.id === tab)?.sources.includes(item.source));
          return has(current) ? current : FEEDBACK_TABS.find((info) => has(info.id))?.id ?? current;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the knowledge gaps.");
    }
  }, [call]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  /** Change something, then show the fresh state the server sends back. */
  async function change(label: string, payload: object, done?: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const body = await call("/api/admin/knowledge", { method: "POST", body: JSON.stringify(payload) });
      if (body?.gaps && body.faq && body.published) {
        setState(body as State);
        const open = new Set(body.gaps.map((gap) => gap.id));
        setGroups((current) => current?.map((group) => ({ ...group, ids: group.ids.filter((id) => open.has(id)) })).filter((group) => group.ids.length) ?? null);
        if (done) setNotice(done);
        return true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
    return false;
  }

  async function makeGeneral(item: FeedbackItem, key: string) {
    setBusy(`general-${key}`);
    setError(null);
    try {
      const body = (await call("/api/admin/knowledge/generalise", {
        method: "POST",
        body: JSON.stringify({
          question: item.question,
          originalAnswer: item.original_answer,
          correctedAnswer: item.corrected_answer,
          comment: item.comment,
        }),
      })) as { question?: string; answer?: string } | null;
      if (body?.question && body.answer) {
        const { question, answer } = body;
        setDrafts((current) => ({ ...current, [key]: { question, answer } }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claude could not write a general answer.");
    } finally {
      setBusy(null);
    }
  }

  async function group() {
    setBusy("group");
    setError(null);
    try {
      const body = await call("/api/admin/knowledge/group", { method: "POST" });
      if (body?.groups) {
        setGroups(body.groups);
        setDrafts({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claude could not group the questions.");
    } finally {
      setBusy(null);
    }
  }

  const gapsById = useMemo(() => new Map((state?.gaps ?? []).map((gap) => [gap.id, gap])), [state]);
  // Before Claude has grouped them, every question is its own card.
  const cards: Group[] = groups ?? (state?.gaps ?? []).map((gap) => ({ question: gap.question, answer: "", ids: [gap.id] }));

  if (!state) {
    return <p className="text-sm text-cda-text">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-cda-red-dark">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
      {notice && <p className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">{notice}</p>}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-cda-dark">Ellie learns from what she could not answer, and from feedback</h2>
            <p className="mt-1 text-sm text-cda-text">
              After every conversation, on every channel, the questions Ellie could not answer, what customers thought of her
              answers, and the facts staff corrected appear below. Write the right answer and approve it: Ellie and Aida use it
              from their next conversation on. Nothing reaches them without your approval.
            </p>
          </div>
          <button type="button" onClick={() => void load()} className="text-xs text-cda-text underline">
            Refresh
          </button>
        </div>
        <p className="mt-3 rounded-lg bg-cda-grey-light px-3 py-2 text-xs text-cda-dark">
          📚 <strong>CDA approved FAQ</strong> in Ellie&apos;s knowledge: {state.published.entries} answer
          {state.published.entries === 1 ? "" : "s"}
          {state.published.published_at ? ` · published ${when(state.published.published_at)}` : " · not published yet"}
          {state.faq.length !== state.published.entries && (
            <button
              type="button"
              onClick={() => void change("publish", { action: "publish" }, "Published to Ellie.")}
              disabled={busy !== null}
              className="ml-2 font-semibold text-cda-red underline"
            >
              Publish again
            </button>
          )}
        </p>
      </section>

      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-cda-dark">Questions Ellie could not answer ({state.gaps.length})</h2>
          {state.gaps.length > 1 && (
            <button
              type="button"
              onClick={() => void group()}
              disabled={busy !== null}
              className="rounded-full bg-cda-dark px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === "group" ? "Claude is reading…" : "✨ Group and suggest answers"}
            </button>
          )}
        </div>
        {cards.length === 0 && (
          <p className="text-sm text-cda-text">Nothing open. New questions appear here a minute after a conversation ends.</p>
        )}

        {cards.map((card) => {
          const key = keyOf(card);
          const draft = drafts[key] ?? { question: card.question, answer: card.answer };
          const asked = card.ids.map((id) => gapsById.get(id)).filter((gap): gap is Gap => Boolean(gap));
          const channels = [...new Set(asked.map((gap) => (gap.channel ? CHANNELS[gap.channel] ?? gap.channel : "Unknown")))];
          const latest = asked.map((gap) => gap.created_at).sort().at(-1);
          const unfinished = UNFINISHED.test(draft.answer);
          const setDraft = (field: "question" | "answer", value: string) =>
            setDrafts((current) => ({ ...current, [key]: { ...draft, [field]: value } }));
          return (
            <div key={key} className="space-y-2 rounded-lg border border-cda-grey p-3">
              <p className="text-xs text-cda-text">
                Asked {card.ids.length} time{card.ids.length === 1 ? "" : "s"} · {channels.join(", ")}
                {latest ? ` · last ${when(latest)}` : ""}
                {card.ids.length > 1 && asked.length > 0 && (
                  <span className="block italic">“{asked.map((gap) => gap.question).join("” · “")}”</span>
                )}
              </p>
              <input
                value={draft.question}
                onChange={(event) => setDraft("question", event.target.value)}
                className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm font-semibold"
              />
              <textarea
                value={draft.answer}
                onChange={(event) => setDraft("answer", event.target.value)}
                placeholder="The answer Ellie should give…"
                rows={3}
                className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
              />
              {unfinished && <p className="text-xs text-cda-red">Replace every [check: …] with the real fact before approving.</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void change(`dismiss-${key}`, { action: "dismiss", gapIds: card.ids })}
                  disabled={busy !== null}
                  className="rounded-full border border-cda-grey px-4 py-1.5 text-xs font-semibold text-cda-text disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void change(
                      `approve-${key}`,
                      { action: "approve", question: draft.question, answer: draft.answer, gapIds: card.ids },
                      "Approved. Ellie uses this answer from her next conversation.",
                    )
                  }
                  disabled={busy !== null || !draft.answer.trim() || unfinished}
                  className="rounded-full bg-cda-red px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === `approve-${key}` ? "Teaching Ellie…" : "Approve and teach Ellie"}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-cda-dark">Feedback and corrections ({state.feedback.length})</h2>
          <span className="rounded-full bg-cda-grey-light px-3 py-1 text-xs font-semibold text-cda-dark">
            This week: {state.score.likes} 👍 · {state.score.dislikes} 👎
          </span>
        </div>
        <p className="text-xs text-cda-text">
          Turn one into an answer for everyone, or dismiss it when Ellie was right.
        </p>

        <div className="flex flex-wrap gap-1 rounded-full bg-cda-grey-light p-1" role="tablist" aria-label="Kinds of feedback">
          {FEEDBACK_TABS.map((tabInfo) => {
            const count = state.feedback.filter((item) => tabInfo.sources.includes(item.source)).length;
            return (
              <button
                key={tabInfo.id}
                type="button"
                role="tab"
                aria-selected={feedbackTab === tabInfo.id}
                onClick={() => setFeedbackTab(tabInfo.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  feedbackTab === tabInfo.id ? "bg-white text-cda-dark shadow-sm" : "text-cda-text hover:text-cda-dark"
                }`}
              >
                {tabInfo.label} ({count})
              </button>
            );
          })}
        </div>

        {feedbackTab === "customer" && (
          <p className="text-xs text-cda-text">👎 under an answer in the website chat, and complaints customers made in any conversation.</p>
        )}
        {feedbackTab !== "customer" && (
          <div className="rounded-lg bg-cda-grey-light px-3 py-2 text-xs">
            <p className="font-semibold text-cda-dark">
              {feedbackTab === "aida" ? "📞 Aida's drafts in rooms" : "✉️ Ellie's email drafts"}, this week
            </p>
            <p className="text-cda-text">
              {(feedbackTab === "aida" ? draftLine(state.drafts?.aida, "declined") : draftLine(state.drafts?.email, "discarded")) ??
                "None yet."}
            </p>
            <p className="mt-1 text-cda-text">
              Every draft staff changed is below. <strong>Corrected</strong>: a fact changed, worth teaching Ellie.{" "}
              <strong>Style only</strong>: just reworded, usually dismissed.
            </p>
          </div>
        )}

        {(() => {
          const shown = state.feedback.filter((item) =>
            FEEDBACK_TABS.find((tabInfo) => tabInfo.id === feedbackTab)?.sources.includes(item.source),
          );
          return shown.length === 0 ? <p className="text-sm text-cda-text">Nothing open.</p> : null;
        })()}

        {state.feedback
          .filter((item) => FEEDBACK_TABS.find((tabInfo) => tabInfo.id === feedbackTab)?.sources.includes(item.source))
          .map((item) => {
          const key = `f-${item.id}`;
          const draft = drafts[key] ?? {
            question: (item.question ?? "").slice(0, 300),
            answer: item.kind !== "feedback" ? item.corrected_answer ?? "" : "",
          };
          const unfinished = UNFINISHED.test(draft.answer);
          const setDraft = (field: "question" | "answer", value: string) =>
            setDrafts((current) => ({ ...current, [key]: { ...draft, [field]: value } }));
          const who = item.source === "aida" ? "Aida" : "Ellie";
          return (
            <div key={key} className="space-y-2 rounded-lg border border-cda-grey p-3">
              <p className="text-xs text-cda-text">
                <span className="font-semibold text-cda-dark">{sourceLabel(item)}</span> · {when(item.created_at)}
              </p>
              {item.question && (
                <p className="text-sm">
                  <span className="text-xs font-semibold text-cda-text">Customer asked: </span>
                  {item.question}
                </p>
              )}
              {item.original_answer && (
                <p className="rounded-md bg-cda-grey-light p-2 text-sm text-cda-text">
                  <span className="text-xs font-semibold">{who} answered: </span>
                  {item.original_answer}
                </p>
              )}
              {item.comment && (
                <p className="rounded-md bg-red-50 p-2 text-sm text-cda-red-dark">
                  <span className="text-xs font-semibold">Customer said: </span>
                  {item.comment}
                </p>
              )}
              {item.corrected_answer && (
                <p className="rounded-md bg-green-50 p-2 text-sm text-green-900">
                  <span className="text-xs font-semibold">Staff sent instead: </span>
                  {item.corrected_answer}
                </p>
              )}
              <input
                value={draft.question}
                onChange={(event) => setDraft("question", event.target.value)}
                placeholder="The question, for everyone"
                className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm font-semibold"
              />
              <textarea
                value={draft.answer}
                onChange={(event) => setDraft("answer", event.target.value)}
                placeholder="The right answer Ellie should give from now on…"
                rows={3}
                className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
              />
              {unfinished && <p className="text-xs text-cda-red">Replace every [check: …] with the real fact before approving.</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void makeGeneral(item, key)}
                  disabled={busy !== null}
                  className="rounded-full border border-cda-dark px-4 py-1.5 text-xs font-semibold text-cda-dark disabled:opacity-50"
                >
                  {busy === `general-${key}` ? "Claude is writing…" : "✨ Make it a general answer"}
                </button>
                <button
                  type="button"
                  onClick={() => void change(`dismiss-${key}`, { action: "dismiss", feedbackIds: [item.id] })}
                  disabled={busy !== null}
                  className="rounded-full border border-cda-grey px-4 py-1.5 text-xs font-semibold text-cda-text disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void change(
                      `approve-${key}`,
                      { action: "approve", question: draft.question, answer: draft.answer, feedbackIds: [item.id] },
                      "Approved. Ellie uses this answer from her next conversation.",
                    )
                  }
                  disabled={busy !== null || !draft.question.trim() || !draft.answer.trim() || unfinished}
                  className="rounded-full bg-cda-red px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === `approve-${key}` ? "Teaching Ellie…" : "Approve and teach Ellie"}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-cda-dark">Approved answers ({state.faq.length})</h2>
        {state.faq.length === 0 && <p className="text-sm text-cda-text">None yet.</p>}
        {state.faq.map((entry) => {
          const edit = editing[entry.id];
          return (
            <div key={entry.id} className="space-y-1 rounded-lg bg-cda-grey-light p-3 text-sm">
              {edit ? (
                <>
                  <input
                    value={edit.question}
                    onChange={(event) => setEditing((current) => ({ ...current, [entry.id]: { ...edit, question: event.target.value } }))}
                    className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm font-semibold"
                  />
                  <textarea
                    value={edit.answer}
                    onChange={(event) => setEditing((current) => ({ ...current, [entry.id]: { ...edit, answer: event.target.value } }))}
                    rows={3}
                    className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing((current) => {
                        const next = { ...current };
                        delete next[entry.id];
                        return next;
                      })}
                      className="text-xs text-cda-text underline"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={async () => {
                        const saved = await change(`update-${entry.id}`, { action: "update", id: entry.id, ...edit }, "Updated. Ellie uses the new wording now.");
                        if (saved) setEditing((current) => {
                          const next = { ...current };
                          delete next[entry.id];
                          return next;
                        });
                      }}
                      className="rounded-full bg-cda-red px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold text-cda-dark">{entry.question}</p>
                  <p className="whitespace-pre-wrap text-cda-dark">{entry.answer}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cda-text">
                    <span>
                      {entry.approved_by ? `Approved by ${entry.approved_by} · ` : ""}
                      {when(entry.updated_at)}
                    </span>
                    <span className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEditing((current) => ({ ...current, [entry.id]: { question: entry.question, answer: entry.answer } }))}
                        className="underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void change(`delete-${entry.id}`, { action: "delete", id: entry.id }, "Removed from Ellie's knowledge.")}
                        className="text-cda-red underline"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}

        <details className="rounded-lg border border-dashed border-cda-grey p-3">
          <summary className="cursor-pointer text-sm font-semibold text-cda-dark">+ Add an answer yourself</summary>
          <div className="mt-2 space-y-2">
            <input
              value={manual.question}
              onChange={(event) => setManual((current) => ({ ...current, question: event.target.value }))}
              placeholder="Question, e.g. Do CDA ovens come with a plug fitted?"
              className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
            />
            <textarea
              value={manual.answer}
              onChange={(event) => setManual((current) => ({ ...current, answer: event.target.value }))}
              placeholder="The answer Ellie should give"
              rows={3}
              className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy !== null || !manual.question.trim() || !manual.answer.trim()}
                onClick={async () => {
                  const saved = await change("add", { action: "add", ...manual }, "Added. Ellie uses this answer from her next conversation.");
                  if (saved) setManual({ question: "", answer: "" });
                }}
                className="rounded-full bg-cda-red px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Add and teach Ellie
              </button>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
