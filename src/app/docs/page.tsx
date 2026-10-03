import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NdiLogo } from "@/components/NdiLogo";

// Public documentation of NDI's assistant: every channel, module and feature, in plain words. No
// password (see src/proxy.ts) and therefore no secrets: no keys, passwords, tokens or private settings.

export const metadata: Metadata = {
  title: "Documentation – NDI Assistant",
  description: "How NDI's multi-channel assistant works: Clara, every channel, customer memory, Aida, admin, learning and mood.",
};

const SECTIONS: { id: string; title: string }[] = [
  { id: "overview", title: "Overview" },
  { id: "clara", title: "Clara, the AI agent" },
  { id: "website", title: "Website" },
  { id: "phone", title: "Phone" },
  { id: "email", title: "Email" },
  { id: "messaging", title: "Telegram, Instagram, Messenger" },
  { id: "more-channels", title: "Widget, QR code and demo videos" },
  { id: "memory", title: "Customer memory" },
  { id: "aida", title: "Aida rooms (live copilot)" },
  { id: "admin", title: "Admin page" },
  { id: "calls", title: "Calls and hand-overs" },
  { id: "learning", title: "Clara learns" },
  { id: "mood", title: "Customer mood (sentiment)" },
  { id: "security", title: "Security and privacy" },
  { id: "stack", title: "Technology and costs" },
  { id: "glossary", title: "Glossary" },
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
            email, Telegram, Instagram and Messenger, remembers them across all of them, and hands over to NDI staff with{" "}
            <strong className="text-heading">Aida</strong>, a copilot that drafts answers during live calls.
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
              NDI&apos;s customers can reach the same assistant wherever they already are. Every channel ends up at one agent, Clara,
              on ElevenLabs Agents, with the same instructions, the same knowledge of NDI and the same memory of the customer. When a
              person is needed, NDI staff take over in an <A href="#aida">Aida room</A>, or check Clara&apos;s email answers first.
            </P>
            <Table
              head={["Channel", "What the customer does", "Status"]}
              rows={[
                ["Website", "Chat (with photos and PDFs), voice call or video avatar in the browser", "Live"],
                ["Phone", "Calls NDI's number, or Clara calls them from a staff call list", "Setting up"],
                ["Email", "Emails contact@new-digital-intelligence.com and gets a reply in the same thread", "Live"],
                ["Telegram", "Messages NDI's Telegram bot @ndi2026bot", "Live"],
                ["Instagram", "Sends a direct message to @new_digital_intelligence", "Live (shared with the CDA demo)"],
                ["Facebook Messenger", "Messages the Facebook Page “New Digital Intelligence”", "Live (shared with the CDA demo)"],
                ["Hosted page, QR code, widget", "ElevenLabs’ own page and chat bubble", "Live"],
                ["Slack, WhatsApp", "—", "Not built yet"],
              ]}
            />
            <Flow>{`Website chat / voice / avatar ─────┐
Phone (Twilio) ─────────────────────┤
Telegram ───────────────────────────┤
Email ─► Gmail ─► web app ──────────┤──►  Clara (ElevenLabs agent)  ──►  answer on the same channel
Instagram / Messenger ─► web app ───┤         │  knowledge base (RAG) · customer_lookup tool
Hosted page / widget ───────────────┘         ▼
                                   web app (Next.js on Railway)  ─  Supabase database
                                   customer memory · Aida rooms · admin · learning · mood`}</Flow>
            <P>There are three pages:</P>
            <List
              items={[
                <>
                  <B>Customer site</B> (site password): the chat at <code>/</code>, a voice call at <code>/voice</code>, the video
                  avatar at <code>/avatar</code> and a live call with staff at <code>/aida</code>, plus the customer account and links to
                  every channel.
                </>,
                <>
                  <B>Staff console</B> (<code>/admin</code>, staff password): Aida rooms, customers, mood, call list, knowledge and
                  replies, each at its own address (<code>/admin/rooms</code>, <code>/admin/customers</code> and so on).
                </>,
                <>
                  <B>This documentation</B> (<code>/docs</code>, open to everyone).
                </>,
              ]}
            />
          </Section>

          <Section id="clara" title="Clara, the AI agent">
            <P>
              Clara is NDI&apos;s virtual assistant. She explains NDI and its AI Employees, helps visitors find the AI Employee that
              fits their process, shares the link to book a meeting or a demo with Michael Burian, NDI&apos;s CEO (or collects the
              details so the NDI team can follow up), and passes the conversation to a person when needed.
            </P>
            <Table
              head={["", ""]}
              rows={[
                ["Platform", "ElevenLabs Agents (one agent for every channel)"],
                ["Language model", "Gemini 3.7 Flash, temperature 0 (the same question gets the same answer)"],
                ["Voice", "Katie X, a clear British voice, in every language"],
                ["Languages", "English by default, and German, Italian and French; during a call she follows the customer between them by herself"],
                ["Speech to text", "ElevenLabs Scribe, real time"],
                ["Knowledge", "NDI's documents from Google Drive (the AI Employees and more), searched on every turn, plus the “NDI approved FAQ” written by staff"],
                ["Files", "In the website chat she reads photos and PDFs, for example a process description or an RFP"],
                ["Tools", "customer_lookup (who is this customer?), customer_link (link a channel with a code), end call, voicemail detection, language detection"],
              ]}
            />
            <H3>Rules she follows</H3>
            <List
              items={[
                "She answers only from NDI's knowledge; when she does not know, she says so and offers the NDI team. Those questions are collected for staff (see Clara learns).",
                "Channel rules: short spoken answers on the phone and the avatar; plain text on Instagram and Messenger; one plain-text reply by email; she ignores robots and newsletters.",
                "She never invents prices, clients or dates, never asks for passwords, card details or confidential documents, and never claims a meeting is booked when it is not.",
                "When a customer is upset she apologises once, slows down, and offers a person (see Customer mood).",
                "She never asks customers to identify themselves: if she recognises them, she uses what she knows (see Customer memory).",
              ]}
            />
          </Section>

          <Section id="website" title="Website">
            <P>
              The customer site (password protected) has four pages, one for each way of talking to the same Clara. A menu on the
              left switches between them (on a phone: a bar at the bottom). Moving to another page ends the conversation on
              screen; the language chosen for a voice or avatar call is kept.
            </P>
            <Table
              head={["Page", "What happens"]}
              rows={[
                ["💬 Chat (/)", "Typed chat. The customer can attach photos or PDFs (a process description, an RFP, a screenshot); each answer has 👍 / 👎 buttons."],
                ["🎙️ Voice call (/voice)", "A spoken call with Clara in the browser, with a live transcript. English, German, Italian or French."],
                ["🎥 Video avatar (/avatar)", "The same conversation with a video face (NDI's Anam avatar) that listens and speaks."],
                ["📞 Live call (/aida)", "A live call with NDI staff, helped by Aida: open a room or join one with a code (see Aida rooms)."],
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
                  <B>Channel links</B>: buttons that open email, the phone line, Telegram, Instagram and Messenger (each one appears
                  once that channel is set up).
                </>,
              ]}
            />
          </Section>

          <Section id="phone" title="Phone">
            <P>
              A phone number bought on Twilio and connected natively to ElevenLabs. Customers call it and talk to Clara; she
              recognises them by the number saved in their account and greets them by name. She hangs up politely at the end and,
              when she calls out and reaches voicemail, leaves a short message.
            </P>
            <P>
              Clara also calls customers herself, from the staff <A href="#calls">call list</A>, with a greeting that says why she is
              calling. On a call to NDI, a caller who wants a person is handed over live to a colleague from the hand-over team.
            </P>
          </Section>

          <Section id="email" title="Email">
            <Flow>{`1. A customer emails the NDI mailbox (Gmail)
2. Google notifies the web app at once (Gmail watch + Pub/Sub)
3. Robots, codes, alerts and newsletters are skipped (no cost)
4. Claude rates the email's mood (see Customer mood)
5. The email goes to Clara through an ElevenLabs Custom Channel
6. Clara's answer is sent in the customer's thread (auto)
   or saved as a Gmail draft for staff (draft); an upset customer always gets a draft
7. The email is labelled in Gmail: Replied · Draft ready · Skipped · Failed · Upset customer`}</Flow>
            <List
              items={[
                "Auto or draft: staff switch it on /admin/replies. In draft mode staff open the email, check Clara's draft and press Send.",
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
            <P>
              Like email, each of the two has a switch on /admin/replies: <B>Send automatically</B>, or <B>Draft for staff</B>.
              A draft waits there next to the customer&apos;s message; staff change it if needed and send it, or discard it. Meta
              only takes a reply within 24 hours of the customer&apos;s last message, so the page shows how long a draft can wait.
            </P>
            <P>
              Instagram @new_digital_intelligence and the Facebook Page “New Digital Intelligence” are shared with NDI&apos;s CDA demo:
              Meta sends their messages to one of the two demos at a time, switched before a demo.
            </P>
          </Section>

          <Section id="more-channels" title="Widget, QR code and demo videos">
            <List
              items={[
                <>
                  <B>Hosted page and QR code</B>: ElevenLabs&apos; own talk-to page for Clara (voice and text), and a QR code that
                  opens it.
                </>,
                <>
                  <B>Widget</B>: ElevenLabs&apos; chat bubble, which any website can add with two lines of HTML.
                </>,
                <>
                  <B>Demo videos</B>: the public page <code>/demos</code> lists NDI&apos;s demo videos from YouTube. Clara&apos;s
                  knowledge reads it, and the app asks for a fresh read within an hour of a new video, so Clara can share the
                  right link.
                </>,
                <>
                  <B>Not built yet</B>: Slack and WhatsApp.
                </>,
              ]}
            />
          </Section>

          <Section id="memory" title="Customer memory">
            <P>
              Clara recognises the same person on every channel and remembers what they asked before. She never asks anyone to
              identify themselves: someone she cannot place is simply helped.
            </P>
            <Flow>{`Start of every conversation → customer_lookup → known? greet by name, use the last notes and their interests
End of every conversation   → post-call webhook  → one short note, their interests if they said, the mood`}</Flow>
            <Table
              head={["Channel", "How the person is recognised"]}
              rows={[
                ["Website", "Their account when signed in, otherwise this browser"],
                ["Phone", "Their own number (calls in and out), once saved in their account"],
                ["Email", "The sender's address"],
                ["Telegram", "The Telegram chat"],
                ["Instagram, Messenger", "The sender, kept by the web app"],
                ["Aida rooms", "The customer's account, when they join signed in"],
              ]}
            />
            <List
              items={[
                "Linking a channel: in their account the customer gets a short code (for example NDI-4F2K9M) and sends it from Telegram, Instagram, Messenger or another email address. One code works once, for 30 minutes.",
                "Interests: what the customer wants from NDI (the AI Employee or topic, their company and role, numbers and timing) is saved, so Clara never asks twice.",
                "What is stored: which conversation belongs to whom, one short note per conversation, their interests and the mood scores. Full transcripts stay in ElevenLabs.",
              ]}
            />
          </Section>

          <Section id="aida" title="Aida rooms (live copilot)">
            <P>
              A live call between NDI staff and a customer. Everyone can talk or type, the call is transcribed live, and{" "}
              <B>Aida</B>, a second agent, drafts a reply to each thing the customer says. Only staff see the drafts; they approve,
              edit or decline each one, and an approved draft is sent to the customer in the chat.
            </P>
            <Table
              head={["", "Gets in with", "Sees"]}
              rows={[
                ["Staff", "/admin/rooms → staff password", "Everything, including Aida's drafts and the customer's mood"],
                ["Customer", "The Live call page on the site (/aida), or an invite link with the room code", "Talk, chat and transcript — never drafts, never moods"],
              ]}
            />
            <List
              items={[
                "Voice and chat travel over LiveKit. Each browser transcribes only its own microphone (ElevenLabs Scribe), so every line is known to come from the person who said it.",
                "Aida runs in one staff browser (the first employee to join; the next takes over if they leave).",
                "A signed-in customer is recognised: Aida gets what NDI already knows about them, and the call is added to their memory.",
                "Live mood: each customer line gets a mood dot and the staff see a mood meter; when the customer is frustrated Aida's next draft opens with an apology (see Customer mood).",
                "Closing a room is final: its history stays readable and can be emailed. Rooms expire after 4 hours.",
                "What staff change in Aida's drafts is compared with what she wrote, and a real correction becomes a lesson (see Clara learns).",
              ]}
            />
          </Section>

          <Section id="admin" title="Admin page">
            <P>
              The staff console, at /admin, behind its own staff password (the customer site password does not open it). A menu
              on the left opens each section at its own address (on a phone: the Menu button). A section stays open in the
              background once visited, so moving to Customers does not drop a staff member out of an Aida call or a hand-over.
              The sign-in belongs to one browser tab: a section opened in a new tab asks for the staff password again.
            </P>
            <Table
              head={["Section", "What staff do"]}
              rows={[
                ["📞 Aida rooms (/admin/rooms)", "Create, join and close rooms; read and email closed ones."],
                ["👥 Customers (/admin/customers)", "Two tabs. People: a searchable customer list, and one customer at their own address beside it, with their channels and measured mood, their history, and ✨ Ask Claude (a summary, topics, the AI Employees they asked about, mood, open issues and a next step). Overview: the numbers per channel and ✨ Summarise with Claude for the whole week."],
                ["😊 Mood (/admin/mood)", "Three tabs: Overview (how customers felt, per channel and per day), Follow-up (the unhappy conversations to follow up) and Emails & Aida calls (see Customer mood)."],
                ["📲 Calls (/admin/calls)", "Three tabs: Outgoing (call lists Clara phones), Incoming (calls to NDI, live and recent) and Hand-over team (/admin/calls/team). Open live call shows a call's sound and conversation, with Aida's suggestions during a hand-over (see Calls and hand-overs)."],
                ["📚 Knowledge (/admin/knowledge)", "Three tabs: To answer, Feedback (/admin/knowledge/feedback) and Approved answers (/admin/knowledge/approved). Questions Clara could not answer and feedback on her answers, on every channel; staff approve the right answer and Clara uses it at once (see Clara learns)."],
                ["✉️ Replies (/admin/replies)", "For email, Instagram and Messenger: send Clara's answers automatically or keep them as drafts for staff; the latest emails, and the Instagram and Messenger drafts to send or discard."],
              ]}
            />
            <P>The Claude insights are written only when a staff member clicks, and nothing is stored.</P>
          </Section>

          <Section id="calls" title="Calls and hand-overs">
            <H3>Outgoing: the call list (/admin/calls)</H3>
            <P>
              Staff type phone numbers, an optional name and <B>instructions for Clara</B> for each call (for example “they asked
              for a demo of the AI SDR on our website: ask what they want to automate and offer a call with the NDI team”), then
              press <B>Start calling</B>.
            </P>
            <List
              items={[
                "Clara calls one number at a time from NDI's phone line. Her greeting says why she is calling: “Hello Helmi, this is Clara, the virtual assistant from NDI. I'm calling about your demo request for the AI SDR. Have you got a moment?”",
                "No answer, busy or voicemail: she tries again a minute later, up to 3 times, then moves to the next number. On voicemail she leaves a short message.",
                "The page shows each call's status live (calling, try 1 of 3, reached ✓ with a summary, not reached). Stop lets the current call finish.",
                "She learns the instructions through customer_lookup at the start of the call, so no other channel is affected.",
              ]}
            />
            <H3>Incoming: calls to NDI (/admin/calls/incoming)</H3>
            <List
              items={[
                "Every call Clara answers on NDI's number appears here as it starts: who is calling (when NDI knows them), since when, and whether Clara or a colleague has them.",
                "Afterwards it stays in the recent calls with Clara's summary and, after a hand-over, a note of the talk.",
              ]}
            />
            <H3>Following a call live</H3>
            <P>
              Every running call, outgoing or incoming, has an <B>Open live call</B> button. Nothing runs until a staff member presses
              it: the call&apos;s sound and transcript cost money by the minute at Twilio, so they start when the view opens and stop
              about 15 seconds after it is closed (or when the call ends).
            </P>
            <List
              items={[
                "With Clara: the live sound and what Clara and the customer say, as Twilio transcribes it.",
                "During a hand-over: the live sound, what the colleague and the customer say, and Aida's suggestions for what the colleague could say next.",
                "The live sound is two moving bars: the customer, and NDI's side (Clara, or the colleague). Twilio sends the app a copy of the call's audio, which becomes one loudness number every 100 ms. Nothing is recorded or played: staff see who is talking, and read what is said.",
                "After the call, View conversation shows what was transcribed while the view was open, with Clara's summary.",
              ]}
            />
            <H3>Hand-over to a colleague</H3>
            <List
              items={[
                "A call to NDI: when the caller wants a person, Clara connects them with the hand-over team (/admin/calls/team). The colleagues switched on are rung one after another, in the team's order, until one takes the call.",
                "A call-list call: for any number, staff can tick “Hand the call over to a colleague” and pick someone from the team or type a name and number, and if they like when Clara should hand over (for example “when they want a demo”).",
                "When that moment comes, Clara says she is connecting the customer, who hears hold music while the colleague's phone rings from NDI's number. The colleague hears who is waiting and what Clara learnt, and presses any key to take the call. Clara then leaves the call: it is the customer and the colleague (a Twilio conference).",
                "To follow the talk, staff press Open live call · Aida on the Outgoing or Incoming tab: the call's sound, the conversation (Twilio transcribes both voices) and Aida's suggestions for what the colleague could say next, with what Clara learnt and what NDI already knows about the customer.",
                "If nobody takes the call, the customer hears that NDI will call back. Afterwards the talk becomes one short note in the customer's memory (with what was said when the call was open live); a call list moves on to the next number.",
              ]}
            />
          </Section>

          <Section id="learning" title="Clara learns">
            <P>Clara gets better from real conversations, but nothing reaches her without a staff member approving it.</P>
            <H3>Questions she could not answer</H3>
            <List
              items={[
                "After every conversation, ElevenLabs' analysis lists the questions Clara could not answer from NDI's knowledge. They appear on /admin/knowledge with the channel.",
                "✨ Group and suggest answers: Claude merges questions that ask the same thing and suggests wording, marking [check: …] wherever an NDI fact is needed; it never invents one.",
                "Approve and teach Clara: the answer goes into the “NDI approved FAQ”, which is always in Clara's (and Aida's) context, so it works from her very next conversation.",
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
                ["1. Measured mood", "ElevenLabs scores every voice and website conversation with Clara when it ends: a label (positive, neutral, negative), sentiment from −1 to +1 and frustration from 0 to 100%, overall and for each customer message. It does not score email, Instagram or Messenger, so Claude rates those the same way, message by message. The scores are saved with the channel and the customer."],
                ["2. Staff alerts", "When a customer was upset, or Clara promised that the NDI team will get back to them, staff get an email within a minute: who, which channel, the summary and the exact message where the mood turned."],
                ["3. Live mood in Aida rooms", "Claude rates each customer line as it is said (about a second). Staff see a mood dot on every line and a mood meter; when the customer is frustrated, Aida is told before she drafts, so her draft opens with an apology and offers to escalate."],
                ["4. Upset emails", "Claude rates each incoming email before Clara sees it. An upset customer is never answered automatically: Clara's answer waits as a Gmail draft labelled “Clara/Upset customer”, and staff are alerted."],
                ["5. Clara reacts", "When a customer sounds frustrated, Clara apologises once, slows down, gives one clear next step and offers a person. Her promise of a follow-up is recorded and reaches staff through the alert."],
              ]}
            />
            <H3>The Mood page (/admin/mood): three tabs</H3>
            <List
              items={[
                "Overview: the share of positive, neutral and negative conversations and the average frustration, for 7 or 30 days; mood by channel, and conversations per day.",
                "Follow-up (/admin/mood/follow-up): unhappy conversations, meaning a frustration of 60% or more, a very negative moment, or a promised follow-up. The ones waiting come first. Each shows the customer (with a link to their page), the channel, the message where it turned, a small mood curve and a Mark followed up button.",
                "Emails & Aida calls (/admin/mood/emails-calls): the upset emails (sender, subject, why, Open in Gmail) and the frustrated lines in Aida rooms, listed one by one.",
                "Import past conversations fills in the last 30 days; opening the page and a daily job bring in new ones (reading from ElevenLabs is free, Claude's rating costs a fraction of a cent).",
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
                "Everything that calls the web app from outside proves who it is: ElevenLabs' tools send a secret, its webhooks are signed, Google, Meta and Twilio send their own proof, and the daily job has its own secret.",
                "Keys and passwords live only in Railway and the servers' settings, never in the code (the repository is public).",
                "Customer accounts are NDI's own: a customer's password is never stored, only a scrambled form of it (an scrypt hash), and after 5 wrong passwords that email is locked for 15 minutes.",
                "The database is locked down (row level security) and only the server reads it. No message text is stored for memory: short notes and scores only; transcripts stay in ElevenLabs.",
                "For real customers, the use of Anthropic (Claude) for insights and mood belongs in the privacy notice.",
              ]}
            />
          </Section>

          <Section id="stack" title="Technology and costs">
            <Table
              head={["Service", "Used for", "Plan / cost"]}
              rows={[
                ["ElevenLabs Agents", "Clara and Aida: conversations, voice, speech to text, knowledge search, analysis, sentiment", "Creator plan; a voice or avatar minute ≈ 600 credits, a text reply ≈ 60–100"],
                ["Next.js on Railway", "The web app: customer site, admin, channel connectors, webhooks, daily jobs (the app runs them itself)", "Deploys from GitHub on every push"],
                ["Supabase", "Database: customers, memory, rooms, email log, knowledge, feedback, moods", "Free tier"],
                ["Anthropic Claude (Haiku)", "Insights, grouping questions, general answers, call reasons, email and Aida mood", "A fraction of a cent per use"],
                ["LiveKit Cloud", "Voice and chat in Aida rooms", "Free plan, 5,000 participant-minutes a month"],
                ["Anam", "The video avatar", "Free plan: 30 minutes a month, 3-minute calls"],
                ["Twilio", "The phone number (calls in and out), hand-overs to a colleague, and the live view of a call (its sound and transcript)", "A monthly fee for the number, plus calls; only while staff have a call open live: the transcript $0.027 a minute and the sound $0.0044 a minute"],
                ["Google Cloud", "Gmail API and Pub/Sub for the email channel", "Free tier"],
                ["Meta, Telegram", "Instagram, Messenger and Telegram", "Free"],
              ]}
            />
          </Section>

          <Section id="glossary" title="Glossary">
            <Table
              head={["Word", "Meaning"]}
              rows={[
                ["Agent", "An AI assistant on ElevenLabs: Clara for customers, Aida for staff."],
                ["AI Employee", "NDI's product: a role-specific AI agent that NDI builds, connects to a company's systems, runs and improves."],
                ["Channel", "A way a customer reaches Clara: website, phone, email, Telegram, Instagram, Messenger."],
                ["Custom Channel", "ElevenLabs' connector for channels it has no built-in support for; the web app passes messages in and sends answers out."],
                ["Webhook", "An address a service calls when something happens, for example ElevenLabs at the end of a conversation."],
                ["RAG", "Retrieval: Clara looks up the relevant parts of NDI's documents before answering."],
                ["Sentiment / frustration", "How positive (−1 to +1) and how frustrated (0 to 100%) a customer sounds."],
                ["Draft mode", "Clara's email answer waits in Gmail for staff to check and send."],
              ]}
            />
          </Section>

          <footer className="pb-6 text-center text-xs text-muted">NDI Assistant · NDI (New Digital Intelligence)</footer>
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
