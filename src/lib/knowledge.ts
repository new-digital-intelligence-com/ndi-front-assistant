// Knowledge gaps: Ellie learns from the questions she could not answer, under staff control.
//
//   conversation ends → ElevenLabs' post-call analysis fills "unanswered_question" → post-call
//   webhook → knowledge_gaps → /admin "Knowledge" tab: Claude groups repeats and suggests wording
//   → staff edit and approve → knowledge_faq → published to Ellie as one document,
//   "CDA approved FAQ", which is always in her context (usage mode "prompt")
//
// Nothing reaches Ellie without a staff member approving it. Claude's suggestion is only a starting
// point: where it would need a CDA fact it cannot know, it writes [check: …], and an answer still
// holding such a marker cannot be approved.

import { anthropicConfigured, askClaude, parseJsonObject } from "./anthropic";
import { conversationChannel } from "./customers";
import { closeFeedback, draftStats, openFeedback, weekScore, type DraftCounts, type FeedbackItem } from "./feedback";
import { supabaseRest as rest } from "./supabase";

const q = encodeURIComponent;
const API = "https://api.elevenlabs.io/v1/convai";
export const DOC_NAME = "CDA approved FAQ";
/** Ellie's live branch ("Main", 100% of traffic). */
const BRANCH_ID = process.env.ELEVENLABS_BRANCH_ID || "agtbrch_9301m2p375xzetbbsyymxnbnsf1s";
const MAX_GAPS_PER_CONVERSATION = 5;
const MAX_QUESTION = 300;
const MAX_ANSWER = 1_500;
/** Ellie's other documents; far fewer on the agent means something is wrong, so nothing is changed. */
const MIN_OTHER_DOCUMENTS = 5;

export type Gap = { id: number; conversation_id: string | null; channel: string | null; question: string; created_at: string };
export type Faq = { id: number; question: string; answer: string; approved_by: string | null; updated_at: string };
export type Published = { document_id: string | null; entries: number; published_at: string | null };
export type GapGroup = { question: string; answer: string; ids: number[] };

export const UNFINISHED = /\[check/i;

// --- from the post-call webhook ------------------------------------------------------------------

/** "Q1 | Q2" from ElevenLabs' analysis → one row per question. Empty and filler values are ignored. */
export function splitQuestions(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [
    ...new Set(
      value
        .split("|")
        .map((question) => question.trim().replace(/\s+/g, " "))
        .filter((question) => question.length >= 6 && !/^(none|n\/a|null|nothing|no questions?)\.?$/i.test(question))
        .map((question) => question.slice(0, MAX_QUESTION)),
    ),
  ].slice(0, MAX_GAPS_PER_CONVERSATION);
}

export async function recordGaps(conversationId: string, value: unknown, isPhoneCall = false): Promise<number> {
  const questions = splitQuestions(value);
  if (!questions.length) return 0;
  const channel = await conversationChannel(conversationId, isPhoneCall).catch(() => null);
  await rest("knowledge_gaps?on_conflict=conversation_id,question", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify(questions.map((question) => ({ conversation_id: conversationId, channel, question }))),
  });
  return questions.length;
}

// --- what the admin page shows ------------------------------------------------------------------

export type KnowledgeState = {
  gaps: Gap[];
  feedback: FeedbackItem[];
  score: { likes: number; dislikes: number };
  drafts: { email: DraftCounts; aida: DraftCounts };
  faq: Faq[];
  published: Published;
};

export async function knowledgeState(): Promise<KnowledgeState> {
  const [gaps, feedback, score, drafts, faq, published] = await Promise.all([
    rest<Gap[]>("knowledge_gaps?status=eq.open&select=id,conversation_id,channel,question,created_at&order=created_at.desc&limit=200"),
    openFeedback(),
    weekScore(),
    draftStats(),
    rest<Faq[]>("knowledge_faq?select=id,question,answer,approved_by,updated_at&order=id.asc"),
    rest<Published[]>("knowledge_publish?id=eq.1&select=document_id,entries,published_at"),
  ]);
  return { gaps, feedback, score, drafts, faq, published: published[0] ?? { document_id: null, entries: 0, published_at: null } };
}

const GROUP_SYSTEM = `You help CDA customer care staff (CDA: UK kitchen appliance brand) improve their virtual assistant.
You get questions customers asked that the assistant could not answer, each with an id.
Group the questions that ask the same thing. For each group:
- "question": the question once, clear and general, in British English, no personal details
- "answer": a suggested answer of 1 to 3 sentences for staff to check. Never invent CDA-specific facts
  (prices, policies, phone numbers, opening hours, model details, delivery areas, availability, dates),
  and never say whether CDA does or does not offer something: you do not know. Wherever such a fact is
  needed, write [check: what staff must confirm] in its place. If the whole answer depends on it, the
  answer is only the [check: …].
- "ids": the ids of every question in the group
Most asked first. Reply with JSON only: {"groups":[{"question":"...","answer":"...","ids":[1,2]}]}`;

/** Claude groups repeated questions and suggests wording. Nothing is stored: staff decide. */
export async function groupGaps(gaps: Gap[]): Promise<GapGroup[]> {
  if (!gaps.length) return [];
  if (!anthropicConfigured()) return gaps.map((gap) => ({ question: gap.question, answer: "", ids: [gap.id] }));
  const known = new Set(gaps.map((gap) => gap.id));
  const text = await askClaude({
    system: GROUP_SYSTEM,
    prompt: gaps.slice(0, 80).map((gap) => `${gap.id}: ${gap.question}`).join("\n"),
    maxTokens: 3_000,
  });
  const parsed = parseJsonObject<{ groups?: { question?: unknown; answer?: unknown; ids?: unknown }[] }>(text);
  const groups: GapGroup[] = [];
  const placed = new Set<number>();
  for (const group of parsed?.groups ?? []) {
    const ids = (Array.isArray(group.ids) ? group.ids : []).map(Number).filter((id) => known.has(id) && !placed.has(id));
    if (!ids.length || typeof group.question !== "string") continue;
    ids.forEach((id) => placed.add(id));
    groups.push({
      question: group.question.trim().slice(0, MAX_QUESTION),
      answer: typeof group.answer === "string" ? group.answer.trim().slice(0, MAX_ANSWER) : "",
      ids,
    });
  }
  // Anything Claude left out is still shown, on its own.
  for (const gap of gaps) if (!placed.has(gap.id)) groups.push({ question: gap.question, answer: "", ids: [gap.id] });
  return groups;
}

const GENERAL_SYSTEM = `You turn one customer's case into a general FAQ entry for CDA's virtual assistant
(CDA: UK kitchen appliance brand). You get the customer's question, the assistant's first answer, and
either the answer CDA staff sent instead (facts confirmed by staff) or what the customer said was wrong.
Write:
- "question": the general question, clear, in British English, no personal details
- "answer": 1 to 3 sentences for any customer, using the facts staff gave. Leave out names, order or
  serial numbers, addresses, this customer's dates and anything true only for them. Without a staff
  answer, never invent CDA facts: write [check: what staff must confirm] where one is needed.
Reply with JSON only: {"question":"...","answer":"..."}`;

/** One customer's case → a question and answer fit for everyone. Null when Claude is unsure. */
export async function generalise(input: {
  question: unknown;
  originalAnswer: unknown;
  correctedAnswer: unknown;
  comment: unknown;
}): Promise<{ question: string; answer: string } | null> {
  if (!anthropicConfigured()) return null;
  const part = (label: string, value: unknown) => (typeof value === "string" && value.trim() ? `${label}: ${value.trim().slice(0, 2_000)}` : "");
  const text = await askClaude({
    system: GENERAL_SYSTEM,
    prompt: [
      part("Customer asked", input.question),
      part("Assistant answered", input.originalAnswer),
      part("CDA staff sent instead", input.correctedAnswer),
      part("Customer said about the answer", input.comment),
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxTokens: 600,
    timeoutMs: 20_000,
  });
  const parsed = parseJsonObject<{ question?: unknown; answer?: unknown }>(text);
  if (typeof parsed?.question !== "string" || typeof parsed.answer !== "string") return null;
  return { question: parsed.question.trim().slice(0, MAX_QUESTION), answer: parsed.answer.trim().slice(0, MAX_ANSWER) };
}

// --- what staff decide ----------------------------------------------------------------------------

function clean(question: unknown, answer: unknown): { question: string; answer: string } | string {
  const q1 = typeof question === "string" ? question.trim().slice(0, MAX_QUESTION) : "";
  const a1 = typeof answer === "string" ? answer.trim().slice(0, MAX_ANSWER) : "";
  if (q1.length < 6) return "Write the question.";
  if (a1.length < 2) return "Write the answer Ellie should give.";
  if (UNFINISHED.test(a1)) return "Replace every [check: …] with the real fact before approving.";
  return { question: q1, answer: a1 };
}

const ids = (value: unknown): number[] =>
  (Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 200);

/** Approves an answer (for gaps, feedback, or on its own) and publishes the document. Error text or null. */
export async function approve(input: {
  question: unknown;
  answer: unknown;
  gapIds?: unknown;
  feedbackIds?: unknown;
  approvedBy?: string | null;
}): Promise<string | null> {
  const entry = clean(input.question, input.answer);
  if (typeof entry === "string") return entry;
  const [faq] = await rest<Faq[]>("knowledge_faq", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({ ...entry, approved_by: input.approvedBy ?? null }),
  });
  const gapIds = ids(input.gapIds);
  if (gapIds.length) {
    await rest(`knowledge_gaps?id=in.(${gapIds.join(",")})`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ status: "answered", faq_id: faq.id }),
    });
  }
  await closeFeedback(ids(input.feedbackIds), "answered", faq.id);
  await publish();
  return null;
}

export async function dismiss(gapIds: unknown, feedbackIds?: unknown): Promise<void> {
  const list = ids(gapIds);
  if (list.length) {
    await rest(`knowledge_gaps?id=in.(${list.join(",")})`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ status: "dismissed" }),
    });
  }
  await closeFeedback(ids(feedbackIds), "dismissed");
}

export async function updateFaq(id: unknown, question: unknown, answer: unknown): Promise<string | null> {
  const entry = clean(question, answer);
  if (typeof entry === "string") return entry;
  await rest(`knowledge_faq?id=eq.${Number(id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ ...entry, updated_at: new Date().toISOString() }),
  });
  await publish();
  return null;
}

export async function deleteFaq(id: unknown): Promise<void> {
  await rest(`knowledge_faq?id=eq.${Number(id)}`, { method: "DELETE", prefer: "return=minimal" });
  await publish();
}

// --- publishing to Ellie ------------------------------------------------------------------------------

type KnowledgeRef = { type: string; name: string; id: string; usage_mode?: string };

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !process.env.ELEVENLABS_AGENT_ID) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set");
  return key;
}

async function elevenLabs<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": apiKey(), "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs ${init.method ?? "GET"} ${path} failed with ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

function documentText(entries: Faq[]): string {
  return [
    `${DOC_NAME}`,
    "",
    "Answers written and approved by CDA customer care staff for questions customers asked.",
    "They are correct and current: when a customer asks one of these questions, give this answer.",
    "If another document says something different, this document is right.",
    "",
    ...entries.flatMap((entry) => [`Q: ${entry.question}`, `A: ${entry.answer}`, ""]),
  ].join("\n");
}

type AgentKnowledge = { conversation_config: { agent: { prompt: { knowledge_base?: KnowledgeRef[] } } }; branch_id?: string | null };

/**
 * The agents that get the approved answers: Ellie, and Aida, whose drafts for staff should say the
 * same. Each is changed on its live branch; for Ellie that is known, for Aida it is read.
 */
function agentsToTeach(): { id: string; branch: string | null }[] {
  const agents = [{ id: process.env.ELEVENLABS_AGENT_ID ?? "", branch: BRANCH_ID as string | null }];
  if (process.env.AIDA_AGENT_ID) agents.push({ id: process.env.AIDA_AGENT_ID, branch: null });
  return agents.filter((agent) => agent.id);
}

/**
 * Rebuilds the document from every approved answer and swaps it in on Ellie and Aida: a new document
 * is created, each agent's list gets it in place of the old one, and the old one is deleted. Only
 * the entry named "CDA approved FAQ" is touched; every other document is kept exactly as it is.
 */
export async function publish(): Promise<Published> {
  const entries = await rest<Faq[]>("knowledge_faq?select=id,question,answer,approved_by,updated_at&order=id.asc");

  // Read every agent first: if one looks wrong, nothing is changed anywhere.
  const agents = await Promise.all(
    agentsToTeach().map(async ({ id, branch }) => {
      const agent = await elevenLabs<AgentKnowledge>(`/agents/${id}${branch ? `?branch_id=${branch}` : ""}`);
      const path = `/agents/${id}${(branch ?? agent.branch_id) ? `?branch_id=${branch ?? agent.branch_id}` : ""}`;
      const current = agent.conversation_config.agent.prompt.knowledge_base ?? [];
      const others = current.filter((doc) => doc.name !== DOC_NAME);
      if (others.length < MIN_OTHER_DOCUMENTS) throw new Error(`Agent ${id} has only ${others.length} other documents; not changing its knowledge`);
      return { path, others, old: current.filter((doc) => doc.name === DOC_NAME) };
    }),
  );

  let documentId: string | null = null;
  if (entries.length) {
    const created = await elevenLabs<{ id: string }>("/knowledge-base/text", {
      method: "POST",
      body: JSON.stringify({ text: documentText(entries), name: DOC_NAME }),
    });
    documentId = created.id;
  }

  // Always in the agent's context ("prompt"), so an approved answer works in the very next
  // conversation without waiting for search indexing. The document stays small: one line per answer.
  for (const agent of agents) {
    const next = documentId ? [...agent.others, { type: "text", name: DOC_NAME, id: documentId, usage_mode: "prompt" }] : agent.others;
    await elevenLabs(agent.path, {
      method: "PATCH",
      body: JSON.stringify({ conversation_config: { agent: { prompt: { knowledge_base: next } } } }),
    });
  }

  const old = new Set(agents.flatMap((agent) => agent.old.map((doc) => doc.id)));
  for (const id of old) {
    await elevenLabs(`/knowledge-base/${q(id)}`, { method: "DELETE" }).catch((error) =>
      console.error("old FAQ document could not be deleted", id, error),
    );
  }

  const published: Published = { document_id: documentId, entries: entries.length, published_at: new Date().toISOString() };
  await rest("knowledge_publish?on_conflict=id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ id: 1, ...published }),
  });
  return published;
}
