"use client";

import { LinkedText } from "../LinkedText";
import {
  BadgeCheck,
  BookOpenCheck,
  Camera,
  CircleCheck,
  CircleHelp,
  Headset,
  Mail,
  MessageSquareWarning,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  ThumbsDown,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DraftWeek, FeedbackCard, type DraftCounts, type FeedbackItem } from "./FeedbackCard";
import { Empty, SectionTabs, useSectionPath } from "./ui";

// Clara learns from the questions she could not answer and from feedback on her answers. Both arrive
// here by themselves: unanswered questions and what customers said come from ElevenLabs' post-call
// analysis, 👎 from the website chat, and corrections from staff editing Aida's or Clara's drafts.
// Staff write or fix the answer and approve it, and it is published as "NDI approved FAQ" at once.
//
// Three tabs, each at its own address: what to answer (/admin/knowledge), feedback and corrections
// (/admin/knowledge/feedback) and the approved answers (/admin/knowledge/approved).

type KnowledgeView = "questions" | "feedback" | "approved";

const VIEWS: { id: KnowledgeView; href: string; label: string; short: string; icon: LucideIcon; hint: string }[] = [
  {
    id: "questions",
    href: "/admin/knowledge",
    label: "To answer",
    short: "To answer",
    icon: CircleHelp,
    hint: "After every conversation, on every channel, the questions Clara could not answer appear here. Write the right answer and approve it: Clara and Aida use it from their next conversation on.",
  },
  {
    id: "feedback",
    href: "/admin/knowledge/feedback",
    label: "Feedback",
    short: "Feedback",
    icon: MessageSquareWarning,
    hint: "What customers thought of Clara's answers, and the facts staff corrected in drafts. Turn one into an answer for everyone, or dismiss it when Clara was right.",
  },
  {
    id: "approved",
    href: "/admin/knowledge/approved",
    label: "Approved answers",
    short: "Approved",
    icon: BadgeCheck,
    hint: "Published as “NDI approved FAQ” in Clara's and Aida's knowledge. Edit or delete an answer, or add one yourself.",
  },
];

const viewFromPath = (pathname: string): KnowledgeView =>
  pathname.startsWith("/admin/knowledge/feedback") ? "feedback" : pathname.startsWith("/admin/knowledge/approved") ? "approved" : "questions";

const FIELD =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10";
const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50";
const GHOST =
  "inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-muted transition hover:border-heading hover:text-heading disabled:opacity-50";
const DARK =
  "inline-flex items-center gap-1.5 rounded-full bg-heading px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-50";

type Gap = { id: number; conversation_id: string | null; channel: string | null; question: string; created_at: string };
type Faq = { id: number; question: string; answer: string; approved_by: string | null; updated_at: string };
type Published = { document_id: string | null; entries: number; published_at: string | null };
type Group = { question: string; answer: string; ids: number[] };
type Score = { likes: number; dislikes: number };
type State = {
  gaps: Gap[];
  feedback: FeedbackItem[];
  score: Score;
  drafts: { email: DraftCounts; aida: DraftCounts; social: DraftCounts; instagram: DraftCounts; messenger: DraftCounts };
  faq: Faq[];
  published: Published;
};

const CHANNELS: Record<string, string> = {
  website: "Website",
  telegram: "Telegram",
  email: "Email",
  instagram: "Instagram",
  messenger: "Messenger",
  phone: "Phone",
  aida: "Aida room",
};

/** A feedback card's title; its icon and its "Style only" or "Corrected" chip say the rest. */
function sourceLabel(item: FeedbackItem): string {
  if (item.source === "chat") return "Website chat";
  if (item.source === "said") return `Said by the customer · ${item.channel ? CHANNELS[item.channel] ?? item.channel : "unknown channel"}`;
  const did = item.kind === "style" ? "reworded" : "corrected";
  if (item.source === "aida") return `Staff ${did} Aida's draft`;
  if (item.source === "social") return `Staff ${did} Clara's ${CHANNELS[item.channel ?? ""] ?? "Instagram or Messenger"} draft`;
  return `Staff ${did} Clara's email draft`;
}

const UNFINISHED = /\[check/i;

type FeedbackTab = "customer" | "aida" | "email" | "instagram" | "messenger";

/**
 * Customer feedback (👎 in the chat, complaints said in any conversation) and the kinds of staff correction,
 * Instagram and Messenger each in their own panel (the user's request, 4 Oct 2026).
 */
const FEEDBACK_TABS: { id: FeedbackTab; label: string; detail: string; icon: LucideIcon; match: (item: FeedbackItem) => boolean }[] = [
  { id: "customer", label: "Customer feedback", detail: "👎 in the chat, and complaints", icon: ThumbsDown, match: (item) => item.source === "chat" || item.source === "said" },
  { id: "aida", label: "Aida corrections", detail: "Staff changed Aida's drafts", icon: Headset, match: (item) => item.source === "aida" },
  { id: "email", label: "Email corrections", detail: "Staff changed Clara's email drafts", icon: Mail, match: (item) => item.source === "email" },
  {
    id: "instagram",
    label: "Instagram corrections",
    detail: "Staff changed Clara's Instagram drafts",
    icon: Camera,
    match: (item) => item.source === "social" && item.channel !== "messenger",
  },
  {
    id: "messenger",
    label: "Messenger corrections",
    detail: "Staff changed Clara's Messenger drafts",
    icon: MessageCircle,
    match: (item) => item.source === "social" && item.channel === "messenger",
  },
];

/** Each staff-corrections tab's weekly line: whose drafts, and what not sending one is called. */
const DRAFT_LINES: Record<
  Exclude<FeedbackTab, "customer">,
  { title: string; key: "aida" | "email" | "instagram" | "messenger"; notSent: "declined" | "discarded" }
> = {
  aida: { title: "Aida's drafts in rooms", key: "aida", notSent: "declined" },
  email: { title: "Clara's email drafts", key: "email", notSent: "discarded" },
  instagram: { title: "Clara's Instagram drafts", key: "instagram", notSent: "discarded" },
  messenger: { title: "Clara's Messenger drafts", key: "messenger", notSent: "discarded" },
};

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
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const view = viewFromPath(useSectionPath("/admin/knowledge"));

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
            loaded.feedback.some((item) => FEEDBACK_TABS.find((info) => info.id === tab)?.match(item));
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
    return <p className="text-sm text-muted">{error ?? "Loading…"}</p>;
  }

  const counts: Record<KnowledgeView, number> = { questions: state.gaps.length, feedback: state.feedback.length, approved: state.faq.length };
  const current = VIEWS.find((item) => item.id === view) ?? VIEWS[0];
  const feedbackShown = state.feedback.filter((item) => FEEDBACK_TABS.find((tabInfo) => tabInfo.id === feedbackTab)?.match(item));
  const needle = search.trim().toLowerCase();
  const faqShown = needle
    ? state.faq.filter((entry) => `${entry.question}\n${entry.answer}`.toLowerCase().includes(needle))
    : state.faq;

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-red-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </p>
      )}
      {notice && <p className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">{notice}</p>}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-heading">
              NDI approved FAQ: {state.published.entries} answer{state.published.entries === 1 ? "" : "s"} in Clara&apos;s knowledge
            </p>
            <p className="text-xs text-muted">
              {state.published.published_at ? `Published ${when(state.published.published_at)}` : "Not published yet"} · Nothing
              reaches Clara or Aida without your approval.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.faq.length !== state.published.entries && (
            <button
              type="button"
              onClick={() => void change("publish", { action: "publish" }, "Published to Clara.")}
              disabled={busy !== null}
              className={PRIMARY}
            >
              Publish again
            </button>
          )}
          <button type="button" onClick={() => void load()} className={GHOST}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
          </button>
        </div>
      </section>

      <SectionTabs
        label="Knowledge"
        tabs={VIEWS.map((item) => ({
          href: item.href,
          label: item.label,
          short: item.short,
          icon: item.icon,
          count: counts[item.id],
          highlight: item.id !== "approved",
        }))}
        active={current.href}
      />

      <p key={view} className="animate-fade-up text-sm text-muted">
        {current.hint}
      </p>

      {view === "questions" && (
        <section className="space-y-3">
          {state.gaps.length > 1 && (
            <div className="flex justify-end">
              <button type="button" onClick={() => void group()} disabled={busy !== null} className={DARK}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {busy === "group" ? "Claude is reading…" : "Group and suggest answers"}
              </button>
            </div>
          )}
          {cards.length === 0 && (
            <Empty icon={CircleCheck} title="Nothing to answer" text="New questions appear here a minute after a conversation ends." />
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
              <article key={key} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-semibold text-brand-dark">
                    Asked {card.ids.length} time{card.ids.length === 1 ? "" : "s"}
                  </span>
                  {channels.map((channel) => (
                    <span key={channel} className="rounded-full bg-surface px-2.5 py-0.5 font-medium text-heading">
                      {channel}
                    </span>
                  ))}
                  {latest && <span className="ml-1">last {when(latest)}</span>}
                </div>
                {card.ids.length > 1 && asked.length > 0 && (
                  <p className="text-xs italic text-muted">“{asked.map((gap) => gap.question).join("” · “")}”</p>
                )}
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Question</span>
                  <input value={draft.question} onChange={(event) => setDraft("question", event.target.value)} className={`mt-1 font-semibold ${FIELD}`} />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">The answer Clara should give</span>
                  <textarea
                    value={draft.answer}
                    onChange={(event) => setDraft("answer", event.target.value)}
                    placeholder="Write the right answer…"
                    rows={3}
                    className={`mt-1 ${FIELD}`}
                  />
                </label>
                {unfinished && <p className="text-xs text-brand">Replace every [check: …] with the real fact before approving.</p>}
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void change(`dismiss-${key}`, { action: "dismiss", gapIds: card.ids })}
                    disabled={busy !== null}
                    className={GHOST}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void change(
                        `approve-${key}`,
                        { action: "approve", question: draft.question, answer: draft.answer, gapIds: card.ids },
                        "Approved. Clara uses this answer from her next conversation.",
                      )
                    }
                    disabled={busy !== null || !draft.answer.trim() || unfinished}
                    className={PRIMARY}
                  >
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {busy === `approve-${key}` ? "Teaching Clara…" : "Approve and teach Clara"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {view === "feedback" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <div role="tablist" aria-label="Kinds of feedback" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {FEEDBACK_TABS.map((tabInfo) => {
                const count = state.feedback.filter(tabInfo.match).length;
                const active = feedbackTab === tabInfo.id;
                const Icon = tabInfo.icon;
                return (
                  <button
                    key={tabInfo.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFeedbackTab(tabInfo.id)}
                    className={`flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition lg:w-full ${
                      active ? "bg-white shadow-sm ring-1 ring-brand/30" : "hover:bg-white/70"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        active ? "bg-brand text-white" : "bg-white text-ink shadow-sm"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-sm font-semibold text-heading">{tabInfo.label}</span>
                      <span className="hidden text-[11px] text-muted lg:block">{tabInfo.detail}</span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${count ? "bg-brand text-white" : "bg-surface text-muted"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="rounded-2xl bg-white p-3 text-xs shadow-sm">
              <p className="font-semibold text-heading">Website chat, this week</p>
              <p className="mt-0.5 text-muted">
                {state.score.likes} 👍 · {state.score.dislikes} 👎
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            {feedbackTab !== "customer" && (
              <DraftWeek
                icon={FEEDBACK_TABS.find((tabInfo) => tabInfo.id === feedbackTab)?.icon ?? Mail}
                title={DRAFT_LINES[feedbackTab].title}
                counts={state.drafts?.[DRAFT_LINES[feedbackTab].key]}
                notSent={DRAFT_LINES[feedbackTab].notSent}
              />
            )}

            {feedbackShown.length === 0 && (
              <Empty icon={CircleCheck} title="Nothing open" text="New feedback and corrections appear here by themselves." />
            )}

            {feedbackShown.map((item) => {
              const key = `f-${item.id}`;
              const draft = drafts[key] ?? {
                question: (item.question ?? "").slice(0, 300),
                answer: item.kind !== "feedback" ? item.corrected_answer ?? "" : "",
              };
              const unfinished = UNFINISHED.test(draft.answer);
              const setDraft = (field: "question" | "answer", value: string) =>
                setDrafts((current) => ({ ...current, [key]: { ...draft, [field]: value } }));
              return (
                <FeedbackCard
                  key={key}
                  cardKey={key}
                  item={item}
                  title={sourceLabel(item)}
                  who={item.source === "aida" ? "Aida" : "Clara"}
                  draft={draft}
                  onDraft={setDraft}
                  unfinished={unfinished}
                  busy={busy}
                  onGeneral={() => void makeGeneral(item, key)}
                  onDismiss={() => void change(`dismiss-${key}`, { action: "dismiss", feedbackIds: [item.id] })}
                  onApprove={() =>
                    void change(
                      `approve-${key}`,
                      { action: "approve", question: draft.question, answer: draft.answer, feedbackIds: [item.id] },
                      "Approved. Clara uses this answer from her next conversation.",
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {view === "approved" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the approved answers"
                aria-label="Search the approved answers"
                className={`pl-9 ${FIELD}`}
              />
            </div>
            <button type="button" onClick={() => setAdding((open) => !open)} className={adding ? GHOST : PRIMARY}>
              {adding ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              {adding ? "Close" : "Add an answer"}
            </button>
          </div>

          {adding && (
            <article className="animate-fade-up space-y-2.5 rounded-2xl border-2 border-dashed border-brand/30 bg-white p-4">
              <p className="text-sm font-semibold text-heading">A new answer for Clara</p>
              <input
                value={manual.question}
                onChange={(event) => setManual((current) => ({ ...current, question: event.target.value }))}
                placeholder="Question, e.g. Can an AI Employee work in German and French?"
                className={FIELD}
              />
              <textarea
                value={manual.answer}
                onChange={(event) => setManual((current) => ({ ...current, answer: event.target.value }))}
                placeholder="The answer Clara should give"
                rows={3}
                className={FIELD}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy !== null || !manual.question.trim() || !manual.answer.trim()}
                  onClick={async () => {
                    const saved = await change("add", { action: "add", ...manual }, "Added. Clara uses this answer from her next conversation.");
                    if (saved) {
                      setManual({ question: "", answer: "" });
                      setAdding(false);
                    }
                  }}
                  className={PRIMARY}
                >
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Add and teach Clara
                </button>
              </div>
            </article>
          )}

          {state.faq.length === 0 && (
            <Empty
              icon={BookOpenCheck}
              title="No approved answers yet"
              text="Approve an answer under To answer or Feedback, or add one yourself."
            />
          )}
          {state.faq.length > 0 && faqShown.length === 0 && (
            <p className="rounded-2xl bg-white p-4 text-sm text-muted shadow-sm">No approved answer matches “{search.trim()}”.</p>
          )}

          {faqShown.map((entry) => {
            const edit = editing[entry.id];
            const stopEditing = () =>
              setEditing((current) => {
                const next = { ...current };
                delete next[entry.id];
                return next;
              });
            return (
              <article key={entry.id} className="space-y-2 rounded-2xl bg-white p-4 text-sm shadow-sm">
                {edit ? (
                  <>
                    <input
                      value={edit.question}
                      onChange={(event) => setEditing((current) => ({ ...current, [entry.id]: { ...edit, question: event.target.value } }))}
                      className={`font-semibold ${FIELD}`}
                    />
                    <textarea
                      value={edit.answer}
                      onChange={(event) => setEditing((current) => ({ ...current, [entry.id]: { ...edit, answer: event.target.value } }))}
                      rows={3}
                      className={FIELD}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={stopEditing} className={GHOST}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={async () => {
                          const saved = await change(`update-${entry.id}`, { action: "update", id: entry.id, ...edit }, "Updated. Clara uses the new wording now.");
                          if (saved) stopEditing();
                        }}
                        className={PRIMARY}
                      >
                        Save
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-heading">{entry.question}</p>
                    <p className="whitespace-pre-wrap text-ink">
                      <LinkedText text={entry.answer} />
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs text-muted">
                      <span>
                        {entry.approved_by ? `Approved by ${entry.approved_by} · ` : ""}
                        {when(entry.updated_at)}
                      </span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing((current) => ({ ...current, [entry.id]: { question: entry.question, answer: entry.answer } }))}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-heading transition hover:bg-surface"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void change(`delete-${entry.id}`, { action: "delete", id: entry.id }, "Removed from Clara's knowledge.")}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-brand transition hover:bg-brand-soft disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                        </button>
                      </span>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
