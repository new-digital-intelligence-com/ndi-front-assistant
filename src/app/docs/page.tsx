import {
  Activity,
  ArrowDown,
  ArrowRight,
  AudioLines,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  CheckCheck,
  Clapperboard,
  Database,
  FileText,
  Funnel,
  Hand,
  Headset,
  Inbox,
  KeyRound,
  List as ListIcon,
  ListChecks,
  Mail,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Mic,
  Monitor,
  MousePointerClick,
  Music,
  PenLine,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
  Repeat,
  ScanSearch,
  Search,
  Send,
  Server,
  Share2,
  Smile,
  Sparkles,
  UserSearch,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { NdiLogo } from "@/components/NdiLogo";

// Public documentation of NDI's assistant: every channel, module and feature in plain words, kept short, with a
// diagram of how each one works and which part does each step (the user's request, 4 Oct 2026). No password
// (see src/proxy.ts) and therefore no secrets: no keys, passwords, tokens or private settings.

export const metadata: Metadata = {
  title: "Documentation – NDI Assistant",
  description: "How NDI's multi-channel assistant works: Clara, every channel, customer memory, calls, Aida, the staff console, learning and mood.",
};

const SECTIONS: { id: string; title: string }[] = [
  { id: "overview", title: "Overview" },
  { id: "clara", title: "Clara, the AI agent" },
  { id: "channels", title: "Channels" },
  { id: "memory", title: "Customer memory" },
  { id: "calls", title: "Calls and hand-overs" },
  { id: "aida", title: "Aida rooms" },
  { id: "console", title: "Staff console" },
  { id: "learning", title: "Clara learns" },
  { id: "mood", title: "Customer mood" },
  { id: "security", title: "Security and privacy" },
  { id: "stack", title: "Technology and costs" },
];

/** The parts that do the work, each with its colour in every diagram and in the technology table. */
type Part =
  | "customer"
  | "clara"
  | "aida"
  | "elevenlabs"
  | "app"
  | "db"
  | "staff"
  | "claude"
  | "gmail"
  | "meta"
  | "twilio"
  | "telegram"
  | "livekit"
  | "anam"
  | "youtube";

const PARTS: Record<Part, { label: string; tile: string; chip: string }> = {
  customer: { label: "Customer", tile: "bg-slate-600 text-white", chip: "bg-slate-100 text-slate-700" },
  clara: { label: "Clara · ElevenLabs", tile: "bg-brand text-white", chip: "bg-red-50 text-brand-dark" },
  aida: { label: "Aida · ElevenLabs", tile: "bg-orange-500 text-white", chip: "bg-orange-50 text-orange-800" },
  elevenlabs: { label: "ElevenLabs", tile: "bg-zinc-800 text-white", chip: "bg-zinc-100 text-zinc-800" },
  app: { label: "NDI web app", tile: "bg-emerald-600 text-white", chip: "bg-emerald-50 text-emerald-800" },
  db: { label: "Database", tile: "bg-cyan-700 text-white", chip: "bg-cyan-50 text-cyan-800" },
  staff: { label: "NDI staff", tile: "bg-amber-500 text-white", chip: "bg-amber-50 text-amber-900" },
  claude: { label: "Claude", tile: "bg-stone-600 text-white", chip: "bg-stone-100 text-stone-700" },
  gmail: { label: "Gmail", tile: "bg-blue-600 text-white", chip: "bg-blue-50 text-blue-800" },
  meta: { label: "Meta", tile: "bg-indigo-600 text-white", chip: "bg-indigo-50 text-indigo-800" },
  twilio: { label: "Twilio", tile: "bg-violet-600 text-white", chip: "bg-violet-50 text-violet-800" },
  telegram: { label: "Telegram", tile: "bg-sky-500 text-white", chip: "bg-sky-50 text-sky-800" },
  livekit: { label: "LiveKit", tile: "bg-sky-700 text-white", chip: "bg-sky-50 text-sky-900" },
  anam: { label: "Anam", tile: "bg-fuchsia-600 text-white", chip: "bg-fuchsia-50 text-fuchsia-800" },
  youtube: { label: "YouTube", tile: "bg-white text-red-600 ring-1 ring-red-200", chip: "bg-red-50 text-red-800" },
};

/** One step of a diagram, or several at the same point: alternatives ("or") or all of them ("and"). */
type Box = { icon: LucideIcon; title: string; text?: string; part: Part };
type Step = Box | { or: Box[] } | { and: Box[] };

const CONSOLE: { icon: LucideIcon; name: string; text: string }[] = [
  { icon: Headset, name: "Aida rooms", text: "Create, join and close rooms; read and email closed ones." },
  {
    icon: Users,
    name: "Customers",
    text: "People: search the customers and open one for their channels, mood, history and an AI insight. Overview: the numbers per channel and a summary of the week.",
  },
  { icon: Smile, name: "Mood", text: "Overview, Follow-up, and Emails & Aida calls." },
  { icon: PhoneOutgoing, name: "Calls", text: "Outgoing (call lists), Incoming (calls to NDI) and Hand-over team, with the live view of every call." },
  { icon: BookOpen, name: "Knowledge", text: "To answer, Feedback and Approved answers." },
  { icon: Inbox, name: "Replies", text: "Email, Instagram and Messenger, one tab each: automatic or draft, and the drafts waiting." },
];

export default function DocsPage() {
  return (
    <div className="flex-1 bg-surface">
      <header className="border-b border-line bg-white bg-[radial-gradient(700px_260px_at_100%_0%,rgb(254_1_0/0.07),transparent_70%)]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div className="flex flex-wrap items-end gap-4">
            <NdiLogo className="h-16 w-auto" />
            <span className="text-lg font-semibold tracking-tight text-heading">Assistant · Documentation</span>
          </div>
          <p className="mt-4 max-w-3xl text-ink">
            One AI assistant, <strong className="text-heading">Clara</strong>, answers NDI&apos;s customers on the website, the phone,
            email, Telegram, Instagram and Messenger, remembers them across all of them, and hands over to NDI staff, helped by{" "}
            <strong className="text-heading">Aida</strong>, a copilot that suggests what to say.
          </p>
          <p className="mt-2 text-xs text-muted">
            NDI (New Digital Intelligence) runs it for itself: a live example of NDI&apos;s Multi-Channel Front Office Assistant.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Documentation sections" className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">On this page</p>
          <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm lg:block lg:space-y-1">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-heading hover:text-brand">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-6 hidden text-xs text-muted lg:block">
            Try it: the customer site at{" "}
            <Link className="underline" href="/">
              /
            </Link>{" "}
            and the staff console at{" "}
            <Link className="underline" href="/admin">
              /admin
            </Link>{" "}
            (both password protected).
          </p>
        </nav>

        <main className="min-w-0 space-y-6">
          <Section id="overview" title="Overview">
            <P>
              Every channel leads to the same agent, Clara, with the same instructions, the same knowledge of NDI and the same memory
              of each customer. NDI staff follow conversations and calls in the staff console and take over when a person is
              needed.
            </P>
            <Diagram
              title="How it fits together"
              steps={[
                { icon: Users, title: "A customer writes or calls", text: "on any channel", part: "customer" },
                { icon: Bot, title: "Clara answers", text: "with NDI's knowledge and what she remembers", part: "clara" },
                { icon: Server, title: "The web app connects it all", text: "channels, memory, calls, learning, mood", part: "app" },
                { icon: Headset, title: "Staff follow and take over", text: "in the staff console, helped by Aida", part: "staff" },
              ]}
            />
            <Table
              head={["Channel", "How the customer reaches Clara"]}
              rows={[
                ["Website", "Chat (with photos and PDFs), voice call or video avatar in the browser"],
                ["Phone", "Calls NDI's number +41 44 513 70 94, or Clara calls them from a staff call list"],
                ["Email", "Writes to contact@new-digital-intelligence.com and gets the answer in the same thread"],
                ["Telegram", "Messages NDI's bot @ndi2026bot"],
                ["Instagram", "Sends a direct message to @new_digital_intelligence"],
                ["Facebook Messenger", "Messages the Facebook Page “New Digital Intelligence”"],
                ["Hosted page, QR code, widget", "ElevenLabs' own talk-to page and chat bubble"],
                ["Live call with staff", "An Aida room: the customer talks with NDI staff, Aida suggests the answers"],
              ]}
            />
            <List
              items={[
                <>
                  <B>Customer site</B> (site password): chat at <code>/</code>, voice call at <code>/voice</code>, video avatar at{" "}
                  <code>/avatar</code>, live call with staff at <code>/aida</code>, and the customer account.
                </>,
                <>
                  <B>Staff console</B> at <code>/admin</code> (staff password).
                </>,
                <>
                  <B>This documentation</B> at <code>/docs</code>, open to everyone.
                </>,
              ]}
            />
          </Section>

          <Section id="clara" title="Clara, the AI agent">
            <P>
              Clara explains NDI and its AI Employees, helps visitors find the AI Employee that fits their process, shares the link
              to book a meeting or a demo with Michael Burian, NDI&apos;s CEO (or collects the details for the team), and passes the
              customer to a person when needed.
            </P>
            <Diagram
              title="One answer, step by step"
              steps={[
                { icon: MessageSquare, title: "A message or a call", part: "customer" },
                { icon: UserSearch, title: "Who is this customer?", text: "earlier notes and interests", part: "app" },
                { icon: Search, title: "Search NDI's knowledge", text: "documents, demo videos, approved answers", part: "elevenlabs" },
                { icon: Sparkles, title: "Clara writes the answer", text: "in the customer's language", part: "clara" },
                { icon: Send, title: "Answer on the same channel", part: "customer" },
              ]}
            />
            <Table
              head={["", ""]}
              rows={[
                ["Platform", "ElevenLabs Agents: one agent for every channel"],
                ["Model", "Gemini 3.7 Flash, temperature 0 (the same question gets the same answer)"],
                ["Voice", "Katie X, a clear British voice, in every language"],
                ["Languages", "English, German, Italian and French; on a call she follows the customer from one to another"],
                ["Knowledge", "NDI's documents (the AI Employees and more), NDI's demo videos, and the answers staff approved"],
                ["Files", "In the website chat she reads photos and PDFs, such as a process description or an RFP"],
                ["Tools", "Recognise the customer, link a channel to their account, hand a call over to a colleague, end a call, detect voicemail and language"],
              ]}
            />
            <List
              items={[
                "She answers only from NDI's knowledge. When she does not know, she says so and offers the NDI team; the question goes to staff (see Clara learns).",
                "She never invents prices, clients or dates, never asks for passwords or card details, and never says a meeting is booked when it is not.",
                "Short spoken answers on the phone and the avatar, plain text in messages, one reply per email. She ignores robots and newsletters.",
                "When a customer is upset she apologises once, slows down, gives one clear next step and offers a person.",
              ]}
            />
          </Section>

          <Section id="channels" title="Channels">
            <H3>Website</H3>
            <Diagram
              title="Chat, voice and avatar"
              steps={[
                { icon: Monitor, title: "The customer opens a page", text: "chat, voice or avatar", part: "customer" },
                { icon: KeyRound, title: "A one-time link", text: "and who the visitor is", part: "app" },
                {
                  or: [
                    { icon: Bot, title: "Chat or voice with Clara", part: "clara" },
                    { icon: Video, title: "Video avatar: Clara face to face", part: "anam" },
                  ],
                },
                { icon: Database, title: "Remembered for next time", part: "db" },
              ]}
            />
            <List
              items={[
                "Four pages, one per way of talking: Chat (/), Voice call (/voice), Video avatar (/avatar) and Live call with staff (/aida). Voice and avatar run in English, German, Italian or French.",
                "Chat answers have 👍 / 👎 buttons, and any conversation can be emailed to the customer.",
                "A customer account (email and password) lets Clara recognise the customer everywhere: they link Telegram, Instagram, Messenger or another email with a short code, and add their phone number.",
                "Every web address, email address and booking link is clickable, and a YouTube link shows the video's picture and title.",
              ]}
            />

            <H3>Phone</H3>
            <Diagram
              title="A call to NDI"
              steps={[
                { icon: Phone, title: "The customer calls", text: "+41 44 513 70 94", part: "customer" },
                { icon: PhoneIncoming, title: "NDI's number", text: "passes the call to Clara", part: "twilio" },
                { icon: UserSearch, title: "Who is calling?", text: "by the saved phone number", part: "app" },
                { icon: Bot, title: "Clara answers by voice", text: "and greets them by name", part: "clara" },
                {
                  or: [
                    { icon: CheckCheck, title: "Clara helps to the end", part: "clara" },
                    { icon: Headset, title: "Hand-over to a colleague", part: "staff" },
                  ],
                },
              ]}
            />
            <P>Clara also calls customers from the staff call list (see Calls and hand-overs).</P>

            <H3>Email</H3>
            <Diagram
              title="An email"
              steps={[
                { icon: Mail, title: "The customer emails NDI", part: "customer" },
                { icon: Inbox, title: "Gmail tells the app at once", part: "gmail" },
                { icon: Funnel, title: "Robots skipped, mood rated", text: "the mood by Claude", part: "app" },
                { icon: Bot, title: "Clara writes the answer", part: "clara" },
                {
                  or: [
                    { icon: Send, title: "Sent in the same thread", part: "gmail" },
                    { icon: PenLine, title: "Draft for staff (always if upset)", part: "staff" },
                  ],
                },
              ]}
            />
            <List
              items={[
                "Automatic or draft: staff choose on the Replies page. An upset customer's email always waits as a draft, and staff get an alert.",
                "Each email gets a Gmail label: Replied, Draft ready, Skipped, Failed or Upset customer.",
                "Clara reads up to 6,000 characters of an email (not the attachments), and never answers mail older than 24 hours.",
              ]}
            />

            <H3>Instagram and Messenger</H3>
            <Diagram
              title="A direct message"
              steps={[
                { icon: MessageCircle, title: "The customer sends a message", part: "customer" },
                { icon: Share2, title: "Meta tells the app", part: "meta" },
                { icon: Server, title: "The app passes it to Clara", part: "app" },
                { icon: Bot, title: "Clara writes the answer", part: "clara" },
                {
                  or: [
                    { icon: Send, title: "Sent at once", part: "meta" },
                    { icon: PenLine, title: "Draft on the Replies page", part: "staff" },
                  ],
                },
              ]}
            />
            <List
              items={[
                "Automatic or draft, for each of the two, on the Replies page. Staff read the customer's message, change the draft if needed and send it, or discard it.",
                "Meta takes a reply only within 24 hours of the customer's last message, so each draft shows “Reply before …”.",
                "A person's messages stay in one conversation for 10 minutes, and “typing…” shows while Clara writes. Instagram answers are plain text up to 1,000 characters; long Messenger answers are split. Photos and files are not passed on.",
              ]}
            />

            <H3>Telegram</H3>
            <Diagram
              title="A Telegram message"
              steps={[
                { icon: MessageCircle, title: "The customer messages @ndi2026bot", part: "customer" },
                { icon: Send, title: "Telegram", text: "ElevenLabs' own connection", part: "telegram" },
                { icon: Bot, title: "Clara answers in the chat", part: "clara" },
              ]}
            />
            <P>Every private message is answered; in groups, only mentions and replies.</P>

            <H3>Hosted page, QR code, widget and demo videos</H3>
            <Diagram
              title="Demo videos"
              steps={[
                { icon: Clapperboard, title: "A new video on NDI's YouTube", part: "youtube" },
                { icon: ListIcon, title: "/demos lists every video", text: "checked every hour", part: "app" },
                { icon: RefreshCw, title: "Clara's knowledge reads it again", part: "elevenlabs" },
                { icon: Bot, title: "Clara shares the right link", part: "clara" },
              ]}
            />
            <P>
              ElevenLabs also gives Clara a talk-to page (voice and text), a QR code that opens it, and a chat bubble any website can
              add.
            </P>
          </Section>

          <Section id="memory" title="Customer memory">
            <P>
              Clara recognises the same person on every channel and remembers what they asked before. She never asks anyone to
              identify themselves: someone she cannot place is simply helped.
            </P>
            <Diagram
              title="Before and after every conversation"
              steps={[
                { icon: MessagesSquare, title: "A conversation starts", part: "customer" },
                { icon: UserSearch, title: "Who is this?", text: "account, number, email or sender", part: "app" },
                { icon: Bot, title: "Clara greets them by name", text: "and uses what she knows", part: "clara" },
                { icon: FileText, title: "The conversation ends", text: "ElevenLabs sums it up", part: "elevenlabs" },
                { icon: Database, title: "Note, interests and mood saved", part: "db" },
              ]}
            />
            <List
              items={[
                "Recognised by: the account or the browser (website), the saved number (phone), the address (email), the sender (Telegram, Instagram, Messenger), the account (Aida rooms).",
                "Linking a channel: the account gives a short code (for example NDI-4F2K9M) that the customer sends from the other channel. A code works once, for 30 minutes.",
                "Interests (the AI Employee or topic, company and role, numbers, timing) are kept, so Clara never asks twice.",
                "Stored: who each conversation belongs to, one short note per conversation, interests and mood scores. Full transcripts stay in ElevenLabs.",
              ]}
            />
          </Section>

          <Section id="calls" title="Calls and hand-overs">
            <H3>Clara calls customers</H3>
            <Diagram
              title="A call list (Calls → Outgoing)"
              steps={[
                { icon: ListChecks, title: "Staff start a call list", text: "numbers, names, instructions", part: "staff" },
                { icon: Server, title: "One number at a time", part: "app" },
                { icon: PhoneOutgoing, title: "Clara calls from NDI's number", text: "and says why she is calling", part: "clara" },
                { icon: Phone, title: "The customer answers", part: "customer" },
                {
                  or: [
                    { icon: CheckCheck, title: "Reached ✓, with a summary", part: "app" },
                    { icon: Repeat, title: "No answer: up to 3 tries", part: "app" },
                  ],
                },
              ]}
            />
            <List
              items={[
                "Her greeting: “Hello Sam, this is Clara, the virtual assistant from NDI. I'm calling about your demo request for the AI SDR. Have you got a moment?”",
                "No answer or busy: she tries again a minute later, up to 3 times. On voicemail she leaves a short message.",
                "Calls to NDI appear on Calls → Incoming as they start, and stay in the recent calls with Clara's summary.",
              ]}
            />

            <H3>Hand-over to a colleague</H3>
            <Diagram
              title="From Clara to a colleague, live"
              steps={[
                { icon: Bot, title: "Clara: “connecting you now”", part: "clara" },
                { icon: Music, title: "Customer on hold, colleague rung", part: "twilio" },
                { icon: Hand, title: "The colleague presses a key", text: "after hearing what Clara learnt", part: "staff" },
                { icon: Users, title: "They talk", text: "Twilio writes it down", part: "twilio" },
                { icon: FileText, title: "A note of what was agreed", text: "by Claude, kept with the customer", part: "db" },
              ]}
            />
            <List
              items={[
                "Calls to NDI: when the caller wants a person, or needs a quote, a proposal or a contract, the colleagues of the hand-over team are rung one after another until one takes the call.",
                "Call lists: staff choose a colleague for a number and, if they like, when to hand over (for example “when they want a demo”).",
                "If nobody takes the call, the customer hears that NDI will call back.",
              ]}
            />

            <H3>Following a call live</H3>
            <Diagram
              title="Open live call"
              steps={[
                { icon: MousePointerClick, title: "Staff press Open live call", part: "staff" },
                { icon: Server, title: "The app asks Twilio", part: "app" },
                { icon: AudioLines, title: "The call's sound and words", part: "twilio" },
                { icon: Activity, title: "Bars and text on screen", part: "app" },
                { icon: Sparkles, title: "Aida suggests, during a hand-over", part: "aida" },
              ]}
            />
            <List
              items={[
                "Two moving bars show who is talking (the call is not played or recorded here), and what each side says is written as they speak.",
                "It runs only while a staff member has the view open, and stops 15 seconds after it is closed.",
                "After the call, View conversation shows the whole call in writing, with Clara's summary.",
              ]}
            />
          </Section>

          <Section id="aida" title="Aida rooms">
            <P>A live call between NDI staff and a customer, by voice and chat, with Aida drafting the answers for staff.</P>
            <Diagram
              title="An Aida room"
              steps={[
                { icon: Users, title: "Customer and staff in one room", text: "voice and chat", part: "livekit" },
                { icon: Mic, title: "Each browser writes its own words", part: "elevenlabs" },
                { icon: Sparkles, title: "Aida drafts a reply", text: "mood rated by Claude", part: "aida" },
                { icon: CheckCheck, title: "Staff send, edit or decline", part: "staff" },
                { icon: MessageSquare, title: "The customer gets the answer", part: "customer" },
              ]}
            />
            <List
              items={[
                "Staff join from the staff console and see everything, including drafts and moods. The customer joins from the Live call page (/aida) or an invite link, and never sees drafts or moods.",
                "A signed-in customer is recognised: Aida gets what NDI knows about them, and the call goes into their memory.",
                "When the customer is frustrated, Aida's next draft opens with an apology. Closed rooms stay readable and can be emailed; rooms close by themselves after 4 hours.",
              ]}
            />
          </Section>

          <Section id="console" title="Staff console">
            <P>
              At /admin, with the staff password (the site password does not open it). Each section and each tab has its own
              address, and a section stays open in the background, so moving to another one never drops a staff member out of a
              call.
            </P>
            <div className="grid gap-3 sm:grid-cols-2">
              {CONSOLE.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.name} className="flex gap-3 rounded-xl bg-surface p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-heading text-white">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-heading">{item.name}</p>
                      <p className="text-sm text-ink">{item.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section id="learning" title="Clara learns">
            <P>Clara gets better from real conversations, and nothing reaches her without a staff member approving it.</P>
            <Diagram
              title="From conversations to a better Clara"
              steps={[
                { icon: MessagesSquare, title: "Conversations on every channel", part: "customer" },
                {
                  and: [
                    { icon: ScanSearch, title: "Unanswered questions and feedback", part: "elevenlabs" },
                    { icon: PenLine, title: "Drafts staff changed", part: "app" },
                  ],
                },
                { icon: BookOpen, title: "The Knowledge page", text: "grouped, with suggested answers", part: "app" },
                { icon: BadgeCheck, title: "Staff approve the answer", part: "staff" },
                { icon: Bot, title: "Clara and Aida use it at once", text: "“NDI approved FAQ”", part: "clara" },
              ]}
            />
            <List
              items={[
                "To answer: the questions Clara could not answer, grouped, with a suggested answer that marks [check: …] wherever an NDI fact is needed.",
                "Feedback: 👍 / 👎 in the website chat, what customers say about an answer, and every draft staff changed (Aida, email, Instagram, Messenger, each in its own panel). A correction shows Clara's text and the staff's side by side: taken out in red, added in green.",
                "Approved answers: everything Clara has been taught, searchable, and staff can add their own. A “right first time” score shows how many drafts went out unchanged.",
              ]}
            />
          </Section>

          <Section id="mood" title="Customer mood">
            <Diagram
              title="From a feeling to a follow-up"
              steps={[
                { icon: MessageSquare, title: "A conversation or an email", part: "customer" },
                {
                  or: [
                    { icon: Activity, title: "Voice and website: scored by ElevenLabs", part: "elevenlabs" },
                    { icon: Activity, title: "Email, messages, rooms: rated by Claude", part: "claude" },
                  ],
                },
                { icon: Database, title: "Saved with the customer", part: "db" },
                {
                  and: [
                    { icon: Bell, title: "Alert email to staff", part: "staff" },
                    { icon: ListChecks, title: "Mood page and follow-up list", part: "staff" },
                  ],
                },
              ]}
            />
            <List
              items={[
                "Every conversation gets a mood (positive, neutral or negative), a sentiment from −1 to +1 and a frustration from 0 to 100%, overall and per message.",
                "Staff get an email within a minute when a customer was upset or Clara promised that the team will get back to them. Upset emails are never answered automatically.",
                "Mood page: Overview (7 or 30 days, per channel and per day), Follow-up (the unhappy conversations, waiting ones first) and Emails & Aida calls. Moods are for staff only.",
              ]}
            />
          </Section>

          <Section id="security" title="Security and privacy">
            <List
              items={[
                "Two separate passwords: one for the customer site, one for the staff console.",
                "Every service that calls the web app proves who it is (ElevenLabs, Google, Meta, Twilio), and keys live only in the server's settings, never in the code.",
                "Customer passwords are never stored, only a scrambled form (scrypt); after 5 wrong passwords an email is locked for 15 minutes.",
                "Only the server reads the database. For memory it keeps short notes and scores, not message texts; full transcripts stay in ElevenLabs.",
              ]}
            />
          </Section>

          <Section id="stack" title="Technology and costs">
            <P>The colours match the diagrams above.</P>
            <Table
              head={["Service", "Used for", "Cost"]}
              rows={[
                [<Chip key="e" part="elevenlabs" />, "Clara and Aida: conversations, voice, transcription, knowledge, analysis, mood", "Creator plan: a voice or avatar minute ≈ 600 credits, a text reply ≈ 60–100"],
                [<Chip key="a" part="app" label="NDI web app · Next.js on Railway" />, "Customer site, staff console, channels, calls, daily jobs", "Railway plan"],
                [<Chip key="d" part="db" label="Database · Supabase" />, "Customers, memory, calls, rooms, knowledge, moods", "Team project"],
                [<Chip key="c" part="claude" />, "Insights, grouping questions, general answers, call reasons and notes, moods", "A fraction of a cent per use"],
                [<Chip key="t" part="twilio" />, "NDI's phone number, hand-overs and the live view of calls", "The number per month and calls per minute; live transcript $0.027, live sound $0.0044 a minute"],
                [<Chip key="l" part="livekit" />, "Voice and chat in Aida rooms", "Free plan, 5,000 minutes a month"],
                [<Chip key="n" part="anam" />, "The video avatar", "Free plan, 30 minutes a month"],
                [<Chip key="g" part="gmail" label="Gmail · Google Cloud" />, "The email channel", "Free tier"],
                [<Chip key="m" part="meta" label="Meta · Telegram" />, "Instagram, Messenger and Telegram", "Free"],
              ]}
            />
          </Section>

          <footer className="pb-6 text-center text-xs text-muted">NDI Assistant · NDI (New Digital Intelligence)</footer>
        </main>
      </div>
    </div>
  );
}

/** How a feature works: its steps left to right (top to bottom on a phone), each tagged with the part doing it. */
function Diagram({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <figure className="rounded-2xl bg-surface p-3 sm:p-4">
      <figcaption className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</figcaption>
      <ol className="flex flex-col gap-1 lg:flex-row lg:gap-0">
        {steps.map((step, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <li aria-hidden="true" className="flex shrink-0 justify-center text-muted lg:items-center lg:px-1">
                <ArrowDown className="h-4 w-4 lg:hidden" />
                <ArrowRight className="hidden h-4 w-4 lg:block" />
              </li>
            )}
            <li className="lg:min-w-0 lg:flex-1">
              {"or" in step ? <Together boxes={step.or} word="or" /> : "and" in step ? <Together boxes={step.and} word="and" /> : <StepBox box={step} />}
            </li>
          </Fragment>
        ))}
      </ol>
    </figure>
  );
}

function StepBox({ box }: { box: Box }) {
  const Icon = box.icon;
  return (
    <div className="flex h-full flex-col gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2.5 lg:flex-col lg:items-start">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${PARTS[box.part].tile}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold leading-snug text-heading">{box.title}</p>
      </div>
      {box.text && <p className="text-xs leading-relaxed text-muted">{box.text}</p>}
      <Chip part={box.part} className="mt-auto self-start" />
    </div>
  );
}

/** Several boxes at the same point of a diagram: alternatives ("or") or all of them ("and"). */
function Together({ boxes, word }: { boxes: Box[]; word: "or" | "and" }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
      {boxes.map((box, index) => {
        const Icon = box.icon;
        return (
          <Fragment key={index}>
            {index > 0 && <p className="text-center text-[10px] font-bold uppercase tracking-wide text-muted">{word}</p>}
            <div className="flex items-start gap-2 rounded-lg bg-surface p-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${PARTS[box.part].tile}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-snug text-heading">{box.title}</p>
                <Chip part={box.part} className="mt-1" />
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function Chip({ part, label, className = "" }: { part: Part; label?: string; className?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${PARTS[part].chip} ${className}`}>
      {label ?? PARTS[part].label}
    </span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-heading">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink">{children}</div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-base font-semibold text-heading">{children}</h3>;
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-heading">{children}</strong>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  const hasHead = head.some(Boolean);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {hasHead && (
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={index} className="border-b border-line px-3 py-2 text-left font-semibold text-heading">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top">
              {row.map((cell, index) => (
                <td key={index} className={`border-b border-surface px-3 py-2 ${index === 0 ? "font-medium text-heading" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
