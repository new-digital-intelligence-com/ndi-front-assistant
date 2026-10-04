"use client";

import {
  BadgeCheck,
  Bot,
  Camera,
  GraduationCap,
  Headset,
  Mail,
  MessageCircle,
  MessageSquareWarning,
  Sparkles,
  ThumbsDown,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { wordDiff, type DiffPart } from "@/lib/textDiff";
import { LinkedText } from "../LinkedText";

// One piece of feedback on /admin/knowledge/feedback, and the week's numbers above them (the user's request,
// 4 Oct 2026: "bigger and better"). A correction shows what Clara (or Aida) wrote and what staff sent side by
// side, with the words staff took out and put in marked, then a large box to teach Clara the right answer.

export type FeedbackItem = {
  id: number;
  kind: "feedback" | "correction" | "style";
  source: "chat" | "said" | "aida" | "email" | "social";
  channel: string | null;
  question: string | null;
  original_answer: string | null;
  comment: string | null;
  corrected_answer: string | null;
  created_at: string;
};

export type DraftCounts = { total: number; unchanged: number; polished: number; corrected: number; declined: number; discarded: number };

const FIELD =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10";
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted";

const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The card's icon: where the feedback came from. */
function sourceIcon(item: FeedbackItem): ReactNode {
  const props = { className: "h-5 w-5", "aria-hidden": true } as const;
  if (item.source === "chat") return <ThumbsDown {...props} />;
  if (item.source === "said") return <MessageSquareWarning {...props} />;
  if (item.source === "aida") return <Headset {...props} />;
  if (item.source === "email") return <Mail {...props} />;
  return item.channel === "messenger" ? <MessageCircle {...props} /> : <Camera {...props} />;
}

const KIND: Record<FeedbackItem["kind"], { label: string; style: string }> = {
  correction: { label: "Corrected: a fact changed", style: "bg-amber-100 text-amber-900" },
  style: { label: "Style only", style: "bg-surface text-heading ring-1 ring-line" },
  feedback: { label: "Customer feedback", style: "bg-red-50 text-brand-dark" },
};

/** What Clara wrote and what staff sent, side by side, the changed words marked. */
function Compare({ before, after, beforeLabel }: { before: string; after: string; beforeLabel: string }) {
  const diff = useMemo(() => wordDiff(before, after), [before, after]);
  const show = (parts: DiffPart[] | undefined, whole: string, mark: "out" | "in") =>
    parts
      ? parts.map((part, index) =>
          !part.changed ? (
            <LinkedText key={index} text={part.text} previews={false} />
          ) : mark === "out" ? (
            <del key={index} className="rounded bg-red-100 px-0.5 text-red-800 decoration-red-500/70">
              <LinkedText text={part.text} previews={false} />
            </del>
          ) : (
            <ins key={index} className="rounded bg-green-200 px-0.5 text-green-950 no-underline">
              <LinkedText text={part.text} previews={false} />
            </ins>
          ),
        )
      : <LinkedText text={whole} previews={false} />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Block icon={Bot} label={beforeLabel} note={diff ? "taken out in red" : undefined} tone="neutral">
        {show(diff?.before, before, "out")}
      </Block>
      <Block icon={UserCheck} label="Staff sent" note={diff ? "added in green" : undefined} tone="green">
        {show(diff?.after, after, "in")}
      </Block>
    </div>
  );
}

function Block({
  icon: Icon,
  label,
  note,
  tone,
  children,
}: {
  icon: LucideIcon;
  label: string;
  note?: string;
  tone: "neutral" | "green" | "red";
  children: ReactNode;
}) {
  const frame = {
    neutral: "border-line bg-surface text-ink",
    green: "border-green-200 bg-green-50 text-green-950",
    red: "border-red-200 bg-red-50 text-brand-dark",
  }[tone];
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border ${frame}`}>
      <h4 className="flex items-center justify-between gap-2 border-b border-current/10 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-80">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </span>
        {note && <span className="text-[11px] opacity-70">{note}</span>}
      </h4>
      <p className="whitespace-pre-wrap break-words px-4 py-3.5 text-[15px] leading-relaxed">{children}</p>
    </section>
  );
}

export function FeedbackCard({
  item,
  title,
  who,
  draft,
  onDraft,
  unfinished,
  busy,
  cardKey,
  onGeneral,
  onDismiss,
  onApprove,
}: {
  item: FeedbackItem;
  title: string;
  who: string;
  draft: { question: string; answer: string };
  onDraft: (field: "question" | "answer", value: string) => void;
  unfinished: boolean;
  busy: string | null;
  cardKey: string;
  onGeneral: () => void;
  onDismiss: () => void;
  onApprove: () => void;
}) {
  const kind = KIND[item.kind];
  const answerRows = Math.min(16, Math.max(5, draft.answer.split("\n").length + Math.ceil(draft.answer.length / 110)));
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-heading text-white">{sourceIcon(item)}</span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-heading">{title}</p>
            <p className="text-xs text-muted">{when(item.created_at)}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${kind.style}`}>{kind.label}</span>
      </header>

      <div className="space-y-5 p-5">
        {item.question && (
          <section>
            <h4 className={LABEL}>The customer asked</h4>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-2xl bg-surface px-4 py-3 text-[15px] leading-relaxed text-heading">
              <LinkedText text={item.question} previews={false} />
            </p>
          </section>
        )}

        {item.kind === "feedback" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {item.original_answer && (
              <Block icon={Bot} label={`${who} answered`} tone="neutral">
                <LinkedText text={item.original_answer} previews={false} />
              </Block>
            )}
            {item.comment && (
              <Block icon={ThumbsDown} label="The customer said" tone="red">
                <LinkedText text={item.comment} previews={false} />
              </Block>
            )}
          </div>
        ) : (
          <Compare before={item.original_answer ?? ""} after={item.corrected_answer ?? ""} beforeLabel={`${who} wrote`} />
        )}

        <section className="rounded-2xl border border-brand/20 bg-brand-soft/40 p-4 sm:p-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-heading">
            <GraduationCap className="h-4 w-4 text-brand" aria-hidden="true" />
            Teach Clara: one answer for every customer
          </h4>
          <p className="mt-1 text-xs text-muted">
            An approved answer goes into Clara&apos;s and Aida&apos;s knowledge (“NDI approved FAQ”) at once. Leave out this
            customer&apos;s details, or let Claude write it for everyone.
          </p>
          <label className="mt-4 block">
            <span className={LABEL}>Question</span>
            <input
              value={draft.question}
              onChange={(event) => onDraft("question", event.target.value)}
              placeholder="The question, for everyone"
              className={`${FIELD} mt-1 text-[15px] font-semibold`}
            />
          </label>
          <label className="mt-3 block">
            <span className={LABEL}>Answer</span>
            <textarea
              value={draft.answer}
              onChange={(event) => onDraft("answer", event.target.value)}
              placeholder="The right answer Clara should give from now on…"
              rows={answerRows}
              className={`${FIELD} field-sizing-content mt-1 max-h-[32rem] min-h-36 text-[15px] leading-relaxed`}
            />
          </label>
          {unfinished && <p className="mt-2 text-sm font-semibold text-brand">Replace every [check: …] with the real fact before approving.</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onGeneral}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-full bg-heading px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {busy === `general-${cardKey}` ? "Claude is writing…" : "Make it a general answer"}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={busy !== null}
              className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-muted transition hover:border-heading hover:text-heading disabled:opacity-50"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy !== null || !draft.question.trim() || !draft.answer.trim() || unfinished}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              {busy === `approve-${cardKey}` ? "Teaching Clara…" : "Approve and teach Clara"}
            </button>
          </div>
        </section>
      </div>
    </article>
  );
}

/** The week's drafts on one channel: how many went out as Clara wrote them, and what staff changed. */
export function DraftWeek({
  icon: Icon,
  title,
  counts,
  notSent,
}: {
  icon: LucideIcon;
  title: string;
  counts: DraftCounts | undefined;
  notSent: "declined" | "discarded";
}) {
  const total = counts?.total ?? 0;
  const right = total ? Math.round(((counts?.unchanged ?? 0) / total) * 100) : null;
  const tiles: [string, number, string][] = [
    ["Drafts", total, "text-heading"],
    ["Sent unchanged", counts?.unchanged ?? 0, "text-green-700"],
    ["Style edits", counts?.polished ?? 0, "text-heading"],
    ["Corrected", counts?.corrected ?? 0, "text-amber-700"],
    [notSent === "declined" ? "Declined" : "Not sent", counts?.[notSent] ?? 0, "text-muted"],
  ];
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-heading">{title}</h3>
            <p className="text-xs text-muted">The last 7 days. Every draft staff changed is below.</p>
          </div>
        </div>
        {right !== null && (
          <div className="w-full max-w-xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-heading">Right first time</span>
              <span className="font-bold text-heading">{right}%</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${right}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className="rounded-xl bg-surface px-4 py-3">
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        <strong className="text-heading">Corrected</strong>: a fact changed, worth teaching Clara. <strong className="text-heading">Style only</strong>:
        just reworded, usually dismissed.
      </p>
    </section>
  );
}
