import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

// Public documentation of the demo: every channel, module and feature, in plain words. No password
// (see src/proxy.ts) and therefore no secrets: no keys, passwords, tokens or private settings.

export const metadata: Metadata = {
  title: "Documentation – CDA Customer Assistant Demo",
  description: "How the CDA multi-channel customer assistant demo works: Clara, every channel, customer memory, Aida, admin, learning and mood.",
};

const SECTIONS: { id: string; title: string }[] = [
  { id: "overview", title: "Overview" },
  { id: "ellie", title: "Clara, the AI agent" },
  { id: "website", title: "Website" },
  { id: "phone", title: "Phone" },
  { id: "email", title: "Email" },
  { id: "messaging", title: "Telegram, Instagram, Messenger" },
  { id: "alexa", title: "Alexa" },
  { id: "more-channels", title: "Intercom, widget and QR code" },
  { id: "memory", title: "Customer memory" },
  { id: "aida", title: "Aida rooms (live copilot)" },
  { id: "admin", title: "Admin page" },
  { id: "calls", title: "Outbound call list" },
  { id: "learning", title: "Clara learns" },
  { id: "mood", title: "Customer mood (sentiment)" },
  { id: "security", title: "Security and privacy" },
  { id: "stack", title: "Technology and costs" },
  { id: "glossary", title: "Glossary" },
];

export default function DocsPage() {
  return (
    <div className="flex-1 bg-surface">
      <header className="bg-heading text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-md bg-brand px-2.5 py-1 text-xl font-extrabold tracking-wider">CDA</span>
            <span className="text-lg font-semibold">Customer Assistant · Documentation</span>
          </div>
          <p className="mt-3 max-w-3xl text-white/80">
            One AI assistant, <strong className="text-white">Clara</strong>, answers CDA customers on the website, the phone, email,
            Telegram, Instagram, Messenger, Alexa and Intercom, remembers them across all of them, and hands over to CDA staff
            with <strong className="text-white">Aida</strong>, a copilot that drafts answers during live calls.
          </p>
          <p className="mt-2 text-xs text-white/60">
            A demo built by NDI (New Digital Intelligence) for CDA, the UK kitchen appliance brand. Not an official CDA service.
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
            and the staff page at{" "}
            <Link className="underline" href="/admin">
              /admin
            </Link>{" "}
            (both password protected).
          </p>
        </nav>

        <main className="min-w-0 space-y-6">
          <Section id="overview" title="Overview">
            <P>
              CDA customers can reach the same assistant wherever they already are. Every channel ends up at one agent, Clara, on
              ElevenLabs Agents, with the same instructions, the same knowledge of CDA and the same memory of the customer. When a
              person is needed, CDA staff take over in an <A href="#aida">Aida room</A>, or check Clara&apos;s email answers first.
            </P>
            <Table
              head={["Channel", "What the customer does", "Status"]}
              rows={[
                ["Website", "Chat (with photos and PDFs), voice call or video avatar in the browser", "Live"],
                ["Phone", "Calls the demo number, or Clara calls them from a staff call list", "Live"],
                ["Email", "Emails the CDA demo mailbox and gets a reply in the same thread", "Live"],
                ["Telegram", "Messages the bot @CDA_2026_Support_Bot", "Live"],
                ["Instagram", "Sends a direct message to @new_digital_intelligence", "Live"],
                ["Facebook Messenger", "Messages the Facebook Page “New Digital Intelligence”", "Live"],
                ["Alexa", "“Alexa, ask cda assistant …” on an Echo or the Alexa app", "Live (development)"],
                ["Intercom", "Types in the chat bubble on the customer page", "Live"],
                ["Hosted page, QR code, widget", "ElevenLabs’ own page and chat bubble", "Live"],
                ["Slack, WhatsApp", "—", "Not built yet"],
              ]}
            />
            <Flow>{`Website chat / voice / avatar ─────┐
Phone (Twilio) ─────────────────────┤
Telegram ───────────────────────────┤
Email ─► Gmail ─► web app ──────────┤──►  Clara (ElevenLabs agent)  ──►  answer on the same channel
Instagram / Messenger ─► web app ───┤         │  knowledge base (RAG) · customer_lookup tool
Alexa ─► web app ───────────────────┤         │
Intercom / hosted page / widget ────┘         ▼
                                   web app (Next.js on Vercel)  ─  Supabase database
                                   customer memory · Aida rooms · admin · learning · mood`}</Flow>
            <P>The demo has three pages:</P>
            <List
              items={[
                <>
                  <B>Customer site</B> (<code>/</code>, site password): chat, voice, avatar, the Aida tab, the customer account and
                  links to every channel.
                </>,
                <>
                  <B>Staff page</B> (<code>/admin</code>, staff password): Aida rooms, customers, mood, call list, knowledge and the
                  email switch.
                </>,
                <>
                  <B>This documentation</B> (<code>/docs</code>, open to everyone).
                </>,
              ]}
            />
          </Section>

          <Section id="ellie" title="Clara, the AI agent">
            <P>
              Clara is CDA&apos;s virtual assistant. She answers questions about CDA appliances, warranties, spare parts, repairs and
              where to buy, collects the details CDA needs for a repair or a complaint, and passes the conversation to a person when
              needed.
            </P>
            <Table
              head={["", ""]}
              rows={[
                ["Platform", "ElevenLabs Agents (one agent for every channel)"],
                ["Language model", "Gemini 3.7 Flash, temperature 0 (the same question gets the same answer)"],
                ["Voice", "Shelley, a clear British voice, in every language"],
                ["Languages", "English by default and Polish; during a call she follows the customer between them by herself"],
                ["Speech to text", "ElevenLabs Scribe, real time"],
                ["Knowledge", "cda.co.uk pages and CDA PDFs (products, warranty, parts, FAQs, where to buy), searched on every turn, plus the “CDA approved FAQ” written by staff"],
                ["Files", "In the website chat she reads photos and PDFs, for example a receipt or a rating plate"],
                ["Tools", "customer_lookup (who is this customer?), customer_link (link a channel with a code), end call, voicemail detection, language detection"],
              ]}
            />
            <H3>Rules she follows</H3>
            <List
              items={[
                "She answers only from CDA's knowledge; when she does not know, she says so and points to the right place. Those questions are collected for staff (see Clara learns).",
                "Channel rules: short spoken answers on the phone, Alexa and the avatar; plain text on Instagram; one plain-text reply by email; she ignores robots and newsletters.",
                "Safety first: a smell of gas or any danger gets safety advice and the emergency number straight away.",
                "She never asks for card details or passwords, and never claims something is booked when it is not.",
                "When a customer is upset she apologises once, slows down, and offers a person (see Customer mood).",
                "She never asks customers to identify themselves: if she recognises them, she uses what she knows (see Customer memory).",
              ]}
            />
          </Section>

          <Section id="website" title="Website">
            <P>The customer site (password protected for the demo) has four tabs, all talking to the same Clara:</P>
            <Table
              head={["Tab", "What happens"]}
              rows={[
                ["💬 Chat", "Typed chat. The customer can attach photos or PDFs (a receipt, a rating plate); each answer has 👍 / 👎 buttons."],
                ["🎙️ Voice", "A spoken call with Clara in the browser, with a live transcript. English or Polish."],
                ["🧑‍💼 Avatar", "The same conversation with a video face (Anam avatar “Sofia”) that listens and speaks. Free plan: 3-minute calls."],
                ["📞 Aida", "A live call with CDA staff: open a room or join one with a code (see Aida rooms)."],
              ]}
            />
            <List
              items={[
                <>
                  <B>Customer account</B>: sign up with an email, then link Telegram, Instagram, Messenger or another email with a
                  short code, and add a phone number, so Clara recognises the customer everywhere.
                </>,
                <>
                  <B>Email me this conversation</B>: the transcript of a chat, voice or avatar conversation by email.
                </>,
                <>
                  <B>Channel links</B>: buttons that open email, the phone line, Telegram, Instagram and Messenger.
                </>,
                <>
                  <B>Intercom bubble</B>: a second way to chat, answered by Clara through Intercom.
                </>,
              ]}
            />
          </Section>

          <Section id="phone" title="Phone">
            <P>
              A real UK mobile number, bought on Twilio and connected natively to ElevenLabs. Customers call it and talk to Clara; she
              recognises them by the number saved in their account and greets them by name. She hangs up politely at the end and,
              when she calls out and reaches voicemail, leaves a short message.
            </P>
            <P>
              Clara also calls customers herself, from the staff <A href="#calls">call list</A>, with a greeting that says why she is
              calling.
            </P>
          </Section>

          <Section id="email" title="Email">
            <Flow>{`1. A customer emails the CDA demo mailbox (Gmail)
2. Google notifies the web app at once (Gmail watch + Pub/Sub)
3. Robots, codes, alerts and newsletters are skipped (no cost)
4. Claude rates the email's mood (see Customer mood)
5. The email goes to Clara through an ElevenLabs Custom Channel
6. Clara's answer is sent in the customer's thread (auto)
   or saved as a Gmail draft for staff (draft); an upset customer always gets a draft
7. The email is labelled in Gmail: Replied · Draft ready · Skipped · Failed · Upset customer`}</Flow>
            <List
              items={[
                "Auto or draft: staff switch it on /admin → Email. In draft mode staff open the email, check Clara's draft and press Send.",
                "What staff change in a draft is compared with what Clara wrote, and a real correction becomes a lesson (see Clara learns).",
                "Clara reads up to 6,000 characters of an email; she cannot open attachments. Mail older than 24 hours is never answered.",
                "The daily job renews Gmail's watch, so nothing is missed.",
              ]}
            />
          </Section>

          <Section id="messaging" title="Telegram, Instagram, Messenger">
            <Table
              head={["Channel", "How it reaches Clara", "Good to know"]}
              rows={[
                ["Telegram", "ElevenLabs' native Telegram integration: no code of ours in between", "Private chats get every message answered; in groups only mentions and replies. Text only."],
                ["Instagram", "Meta calls the web app, which passes the message to Clara (Custom Channel) and sends her answer with Instagram's API", "Plain text up to 1,000 characters. The token renews itself every 7 days."],
                ["Facebook Messenger", "Same as Instagram, with Messenger's API", "Long answers are split into several messages."],
              ]}
            />
            <P>
              On Instagram and Messenger one person&apos;s messages stay in one conversation for 10 minutes, and “typing…” shows while
              Clara writes. Photos and files are not passed on: Clara asks the customer to type the details.
            </P>
          </Section>

          <Section id="alexa" title="Alexa">
            <Flow>{`"Alexa, ask cda assistant why my oven shows F3"
   → Amazon → web app (checks Amazon's signature)
   → Clara through the "CDA Alexa" Custom Channel, marked [Alexa] so she answers in 1–3 short sentences
   → Alexa reads the answer out and the customer can ask a follow-up`}</Flow>
            <List
              items={[
                "The skill “CDA Assistant” is in development mode (the developer's own Amazon account); publishing it needs Amazon's certification.",
                "A question starts with a question word (why, how, what, where, can, my, it's…), as Alexa requires for free speech.",
                "Alexa speaks in its own voice, in English. The same Alexa account is remembered between conversations.",
              ]}
            />
          </Section>

          <Section id="more-channels" title="Intercom, widget and QR code">
            <List
              items={[
                <>
                  <B>Intercom</B>: the chat bubble on the customer page. Intercom sends the conversation to Clara through
                  ElevenLabs&apos; native Intercom integration, and staff see the same conversations in Intercom&apos;s inbox.
                </>,
                <>
                  <B>Hosted page and QR code</B>: ElevenLabs&apos; own talk-to page for Clara (voice and text), and a QR code that
                  opens it.
                </>,
                <>
                  <B>Widget</B>: ElevenLabs&apos; chat bubble, which any website can add with two lines of HTML.
                </>,
                <>
                  <B>Not built yet</B>: Slack (waiting for a workspace) and WhatsApp (parked).
                </>,
              ]}
            />
          </Section>

          <Section id="memory" title="Customer memory">
            <P>
              Clara recognises the same person on every channel and remembers what they asked before. She never asks anyone to
              identify themselves: someone she cannot place is simply helped.
            </P>
            <Flow>{`Start of every conversation → customer_lookup → known? greet by name, use the last notes and their appliances
End of every conversation   → post-call webhook  → one short note, the appliance model if mentioned, the mood`}</Flow>
            <Table
              head={["Channel", "How the person is recognised"]}
              rows={[
                ["Website", "Their account when signed in, otherwise this browser"],
                ["Phone", "Their own number (calls in and out), once saved in their account"],
                ["Email", "The sender's address"],
                ["Telegram", "The Telegram chat"],
                ["Instagram, Messenger", "The sender, kept by the web app"],
                ["Alexa", "The Alexa account"],
                ["Aida rooms", "The customer's account, when they join signed in"],
              ]}
            />
            <List
              items={[
                "Linking a channel: in their account the customer gets a short code (for example NDI-4F2K9M) and sends it from Telegram, Instagram, Messenger or another email address. One code works once, for 30 minutes.",
                "Appliances: when a model is known (a receipt, a photo of the rating plate, or what they said), it is saved, so Clara never asks for the model number twice.",
                "What is stored: which conversation belongs to whom, one short note per conversation, their appliances and the mood scores. Full transcripts stay in ElevenLabs.",
              ]}
            />
          </Section>

          <Section id="aida" title="Aida rooms (live copilot)">
            <P>
              A live call between CDA staff and a customer. Everyone can talk or type, the call is transcribed live, and{" "}
              <B>Aida</B>, a second agent, drafts a reply to each thing the customer says. Only staff see the drafts; they approve,
              edit or decline each one, and an approved draft is sent to the customer in the chat.
            </P>
            <Table
              head={["", "Gets in with", "Sees"]}
              rows={[
                ["Staff", "/admin → staff password → Aida rooms", "Everything, including Aida's drafts and the customer's mood"],
                ["Customer", "The Aida tab on the site, or an invite link with the room code", "Talk, chat and transcript — never drafts, never moods"],
              ]}
            />
            <List
              items={[
                "Voice and chat travel over LiveKit. Each browser transcribes only its own microphone (ElevenLabs Scribe), so every line is known to come from the person who said it.",
                "Aida runs in one staff browser (the first employee to join; the next takes over if they leave).",
                "A signed-in customer is recognised: Aida gets what CDA already knows about them, and the call is added to their memory.",
                "Live mood: each customer line gets a mood dot and the staff see a mood meter; when the customer is frustrated Aida's next draft opens with an apology (see Customer mood).",
                "Closing a room is final: its history stays readable and can be emailed. Rooms expire after 4 hours.",
                "What staff change in Aida's drafts is compared with what she wrote, and a real correction becomes a lesson (see Clara learns).",
              ]}
            />
          </Section>

          <Section id="admin" title="Admin page">
            <P>The staff side, at /admin, behind its own staff password (the customer site password does not open it).</P>
            <Table
              head={["Tab", "What staff do"]}
              rows={[
                ["📞 Aida rooms", "Create, join and close rooms; read and email closed ones."],
                ["👥 Customers", "Numbers per channel, a searchable customer list, and one customer's channels, history and measured mood. ✨ Ask Claude writes a summary, topics, products, mood, open issues and a next step; ✨ Summarise with Claude does the same for the whole week."],
                ["😊 Mood", "How customers felt, per channel and per day, and the unhappy conversations to follow up (see Customer mood)."],
                ["📲 Call list", "Phone numbers with instructions for Clara; Start calling and she phones them one by one (see Outbound call list)."],
                ["📚 Knowledge", "Questions Clara could not answer and feedback on her answers, on every channel; staff approve the right answer and Clara uses it at once (see Clara learns)."],
                ["✉️ Email", "Send Clara's email answers automatically, or leave them as drafts; the latest emails and what happened to each."],
              ]}
            />
            <P>The Claude insights are written only when a staff member clicks, and nothing is stored.</P>
          </Section>

          <Section id="calls" title="Outbound call list">
            <P>
              Staff type phone numbers, an optional name and <B>instructions for Clara</B> for each call (for example “their
              dishwasher warranty is not registered yet: explain the lifetime parts warranty and how to register”), then press{" "}
              <B>Start calling</B>.
            </P>
            <List
              items={[
                "Clara calls one number at a time from the demo line. Her greeting says why she is calling: “Hello Helmi, this is Clara, the virtual assistant from CDA. I'm calling about your dishwasher warranty. Have you got a moment?”",
                "No answer, busy or voicemail: she tries again a minute later, up to 3 times, then moves to the next number. On voicemail she leaves a short message.",
                "The page shows each call's status live (calling, try 1 of 3, reached ✓ with a summary, not reached). Stop lets the current call finish.",
                "She learns the instructions through customer_lookup at the start of the call, so no other channel is affected.",
              ]}
            />
          </Section>

          <Section id="learning" title="Clara learns">
            <P>Clara gets better from real conversations, but nothing reaches her without a staff member approving it.</P>
            <H3>Questions she could not answer</H3>
            <List
              items={[
                "After every conversation, ElevenLabs' analysis lists the questions Clara could not answer from CDA's knowledge. They appear on /admin → 📚 Knowledge with the channel.",
                "✨ Group and suggest answers: Claude merges questions that ask the same thing and suggests wording, marking [check: …] wherever a CDA fact is needed; it never invents one.",
                "Approve and teach Clara: the answer goes into the “CDA approved FAQ”, which is always in Clara's (and Aida's) context, so it works from her very next conversation.",
              ]}
            />
            <H3>Feedback and corrections</H3>
            <Table
              head={["Source", "How it arrives"]}
              rows={[
                ["👍 / 👎 in the website chat", "Under each answer; 👎 asks “What was wrong?”"],
                ["What the customer says, any channel", "“That's wrong”, “perfect, that solved it”: found by ElevenLabs' analysis after the conversation"],
                ["Aida rooms", "What staff sent compared with Aida's draft"],
                ["Email draft mode", "The reply staff sent compared with Clara's draft"],
              ]}
            />
            <P>
              A real correction (a changed fact, not just a new greeting) becomes a card; ✨ Make it a general answer turns it into a
              question and answer for everyone, without that customer&apos;s details. A “right first time” score counts how many of
              Clara&apos;s and Aida&apos;s drafts were sent unchanged.
            </P>
          </Section>

          <Section id="mood" title="Customer mood (sentiment)">
            <P>
              How customers feel, on every channel, measured and acted on. Five parts work together:
            </P>
            <Table
              head={["Part", "What it does"]}
              rows={[
                ["1. Measured mood", "ElevenLabs scores every voice and website conversation with Clara when it ends: a label (positive, neutral, negative), sentiment from −1 to +1 and frustration from 0 to 100%, overall and for each customer message. It does not score email, Instagram, Messenger or Alexa, so Claude rates those the same way, message by message. The scores are saved with the channel and the customer."],
                ["2. Staff alerts", "When a customer was upset, or Clara promised that the CDA team will get back to them, staff get an email within a minute: who, which channel, the summary and the exact message where the mood turned."],
                ["3. Live mood in Aida rooms", "Claude rates each customer line as it is said (about a second). Staff see a mood dot on every line and a mood meter; when the customer is frustrated, Aida is told before she drafts, so her draft opens with an apology and offers to escalate."],
                ["4. Upset emails", "Claude rates each incoming email before Clara sees it. An upset customer is never answered automatically: Clara's answer waits as a Gmail draft labelled “Clara/Upset customer”, and staff are alerted."],
                ["5. Clara reacts", "When a customer sounds frustrated, Clara apologises once, slows down, gives one clear next step and offers a person. Her promise of a follow-up is recorded and reaches staff through the alert."],
              ]}
            />
            <H3>The 😊 Mood tab on /admin</H3>
            <List
              items={[
                "The share of positive, neutral and negative conversations and the average frustration, for 7 or 30 days.",
                "Mood by channel, and conversations per day.",
                "The upset emails (sender, subject, why, Open in Gmail) and the frustrated lines in Aida rooms, listed one by one.",
                "Unhappy conversations: frustration of 60% or more, a very negative moment, or a promised follow-up. Each shows the customer, the channel, the message where it turned, a small mood curve and a Mark followed up button.",
                "Import past conversations fills in the last 30 days; opening the tab and a daily job bring in new ones (reading from ElevenLabs is free, Claude's rating costs a fraction of a cent).",
              ]}
            />
            <P>
              On a customer&apos;s page, each conversation gets a mood dot, and Claude&apos;s customer insight bases its mood on these
              measured scores. Moods are for staff only: a customer never sees one.
            </P>
          </Section>

          <Section id="security" title="Security and privacy">
            <List
              items={[
                "Two separate passwords: the site password for the customer site, and the staff password for /admin. Being on the site never makes anyone staff.",
                "Everything that calls the web app from outside proves who it is: ElevenLabs' tools send a secret, its webhooks are signed, Google, Meta and Amazon send their own proof, and the daily job has its own secret.",
                "Keys and passwords live only in Vercel and the servers' settings, never in the code (the repository is public).",
                "The database is locked down (row level security) and only the server reads it. No message text is stored for memory: short notes and scores only; transcripts stay in ElevenLabs.",
                "The demo uses fake customers only. For real customers, the use of Anthropic (Claude) for insights and mood would belong in the privacy notice.",
              ]}
            />
          </Section>

          <Section id="stack" title="Technology and costs">
            <Table
              head={["Service", "Used for", "Plan / cost"]}
              rows={[
                ["ElevenLabs Agents", "Clara and Aida: conversations, voice, speech to text, knowledge search, analysis, sentiment", "Creator plan; a voice or avatar minute ≈ 600 credits, a text reply ≈ 60–100"],
                ["Next.js on Vercel", "The web app: customer site, admin, channel connectors, webhooks, daily job", "Deploys from GitHub on every push"],
                ["Supabase", "Database: customers, memory, rooms, email log, knowledge, feedback, moods", "Free tier"],
                ["Anthropic Claude (Haiku)", "Insights, grouping questions, general answers, call reasons, email and Aida mood", "A fraction of a cent per use"],
                ["LiveKit Cloud", "Voice and chat in Aida rooms", "Free plan, 5,000 participant-minutes a month"],
                ["Anam", "The video avatar", "Free plan: 30 minutes a month, 3-minute calls"],
                ["Twilio", "The phone number (calls in and out)", "About $2.50 a month plus calls"],
                ["Google Cloud", "Gmail API and Pub/Sub for the email channel", "Free tier"],
                ["Meta, Amazon, Telegram, Intercom", "Instagram, Messenger, Alexa, Telegram and the Intercom bubble", "Free for the demo (Intercom trial)"],
              ]}
            />
          </Section>

          <Section id="glossary" title="Glossary">
            <Table
              head={["Word", "Meaning"]}
              rows={[
                ["Agent", "An AI assistant on ElevenLabs: Clara for customers, Aida for staff."],
                ["Channel", "A way a customer reaches Clara: website, phone, email, Telegram, Instagram, Messenger, Alexa, Intercom."],
                ["Custom Channel", "ElevenLabs' connector for channels it has no built-in support for; the web app passes messages in and sends answers out."],
                ["Webhook", "An address a service calls when something happens, for example ElevenLabs at the end of a conversation."],
                ["RAG", "Retrieval: Clara looks up the relevant parts of CDA's documents before answering."],
                ["Sentiment / frustration", "How positive (−1 to +1) and how frustrated (0 to 100%) a customer sounds."],
                ["Draft mode", "Clara's email answer waits in Gmail for staff to check and send."],
              ]}
            />
          </Section>

          <footer className="pb-6 text-center text-xs text-muted">
            CDA Customer Assistant demo · NDI (New Digital Intelligence) · Not an official CDA service
          </footer>
        </main>
      </div>
    </div>
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

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-brand underline underline-offset-2">
      {children}
    </a>
  );
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

function Flow({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-heading p-4 text-xs leading-relaxed text-white/90">
      <code>{children}</code>
    </pre>
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
