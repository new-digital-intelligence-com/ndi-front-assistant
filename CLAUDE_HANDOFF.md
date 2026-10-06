# Claude handoff – NDI multi-channel assistant

Read this first when continuing the project. Last updated: **6 October 2026**.
Public plain-words documentation of every feature: **`<APP_URL>/docs`** (`src/app/docs/page.tsx`; keep it up to
date when a feature or a channel's status changes). The user's wish (4 Oct 2026): short and straightforward, every
feature shown as working, and a diagram of how each feature works (`Diagram`, each step tagged with the part doing it;
colours in `PARTS`). Full channel-by-channel setup: [CHANNEL_SETUP.md](CHANNEL_SETUP.md).
`<APP_URL>` = `https://ndi-assistant.up.railway.app` (Railway, live since 2 Oct 2026).

> **This repository is public.** Never write API keys, tokens, passwords or secrets into any committed file.

---

## 1. What this project is

NDI (New Digital Intelligence, new-digital-intelligence.com) runs **its own** multi-channel front-office assistant:
a live example of NDI's product "Multi-Channel Front Office Assistant". It was copied on 2 Oct 2026 from the CDA demo
(`../cda`, `github.com/new-digital-intelligence-com/cda`, commit `0d343f7`) — **same features, same everything** —
and turned into NDI's. The first commit of this repository is the untouched CDA copy, so `git diff 2882596` shows
every NDI change.

One AI agent, **Clara**, runs on **ElevenLabs Agents** and answers on every channel with the same prompt, knowledge
and model. The staff copilot is **Aida**.

| Channel | Status | How |
|---|---|---|
| Website `<APP_URL>` (`/` chat, `/voice`, `/avatar`, `/aida` live call) + `/admin/...` + `/docs` | ✅ Live on Railway (2 Oct 2026) | Next.js on Railway |
| Telegram | ✅ **@ndi2026bot**, linked to Clara, tested by the user (2 Oct 2026) | Native ElevenLabs Telegram trigger |
| Email | ✅ contact@new-digital-intelligence.com (2 Oct 2026); auto/draft switch on `/admin/replies` | Gmail push → web app → Custom Channel "NDI email" |
| Instagram @new_digital_intelligence, Messenger Page "New Digital Intelligence" | ✅ NDI only: the user switched both Meta webhooks to NDI and tested them (2 Oct 2026) and removed CDA (confirmed 4 Oct 2026); auto/draft switch like email | Meta webhook → web app → Custom Channels "NDI Instagram" / "NDI Messenger" (CHANNEL_SETUP.md §7) |
| Phone | ✅ **+41 44 513 70 94** (Zurich, 4 Oct 2026), imported into ElevenLabs for Clara: calls in and out, hand-over, live view | Native ElevenLabs Twilio import |
| Video avatar | ✅ NDI's own Anam account + avatar (2 Oct 2026): she is **Clara** (Anam's file is named "Elena"; never call her that) | Anam joined to Clara |
| Intercom | ❌ Removed on purpose (user's decision, 2 Oct 2026) | — |
| Hosted page / QR code | ✅ Works now | ElevenLabs talk-to link |
| Alexa | ❌ Removed on purpose (user's decision) | — |
| Slack, WhatsApp | Not built | — |

**What differs from CDA** (decisions of the user, 2 Oct 2026): assistant **Clara** (not Ellie), voice **Katie X**
(close to Shelley), call languages **English + German, Italian, French**, hosting on **Railway** from a **public**
repository the user creates (not Vercel), **no Alexa**, **no Intercom**, a **new Twilio number**, a **new Anam avatar**, Instagram and
Messenger: the accounts CDA used, now **NDI only** (the user removed CDA from the Meta webhooks; never call them
"shared with CDA" again), and the **AI Employees knowledge comes from the user's Google
Drive** — never build or change AI Employee knowledge yourself. "Appliances" became **interests** (what the
customer wants from NDI). Freshdesk and Make.com leftovers were removed (NDI never had them). Website accounts
are **NDI's own table `customer_accounts`** (email + scrypt password hash, `src/lib/account.ts`), not Supabase Auth,
because the Supabase project is shared with other PoCs.

---

## 2. How the user wants you to work (important)

- **Never use subagents or workflows.** Do all work yourself (the user repeated this on 2 Oct 2026).
- **Git commits:** author **HelmiDev03 <helmipaty@gmail.com>**, and **no `Co-Authored-By` trailer**. **Push straight
  after committing** — once the GitHub repository exists, a push is a deploy on Railway: build, type-check and lint
  first, and never push secrets (the repository is public).
- **Don't spend credits testing.** Never start conversations with Clara or Aida (chat, voice, avatar calls,
  simulate-conversation) or start avatar/phone sessions yourself. Free read-only API checks are fine. Give the user
  test questions with expected answers instead: **the user does the testing**.
- **One step at a time, simple English** (the user is not a native English speaker). Wait until a step is finished before the next.
- **Channels:** prefer native ElevenLabs integrations; otherwise build the channel in the web app (not Make.com).
- **Verify before claiming a cause.** Use API checks, docs and logs; don't guess.
- When something fails in the browser (avatar, voice), ask the user for the **F12 → Console** output.

---

## 3. Getting set up on a new device

```bash
git clone <the NDI repository>
cd <folder>
npm install
```

Create `.env.local` (git-ignored) with the variables of CHANNEL_SETUP.md §13 — copy the values from **Railway → the
service → Variables**. On the first device, `.env.local` was written on 2 Oct 2026 from CDA's `.env.local` (shared
values) plus new NDI secrets.

```bash
npm run dev      # http://localhost:3000 (the daily jobs do not run in dev)
npm run build    # run before `npx tsc --noEmit` (or `npx next typegen`), else the Next.js route types are stale
npm run lint
```

---

## 4. Key facts

**ElevenLabs** (same account as CDA: Creator plan, 121,005 credits/month shared with CDA, resets ~17th)
- **Clara**: "NDI Assistant – Clara", `agent_0901m3y1xemxeg2s0tjk20fjfgbv` — Ellie's settings copied: Gemini 3.7
  Flash (temperature 0), TTS **eleven_v3_conversational with expressive mode** on her live branch (found on 4 Oct
  2026; it was Flash v2 / v2.5 when copied): expressive mode makes her write audio tags such as [happy] or [calm] for
  the voice to act out, so `src/lib/richText.ts` takes them out of her written words (website, email, Instagram,
  Messenger, transcripts) and her prompt forbids them in written channels (for Telegram; backup10), Scribe Realtime,
  turn_v3, input PCM 16000 / output PCM 24000, files on, retention unlimited, sentiment on, overrides `first_message`,
  `language`, `text_only` allowed. Voice **Katie X** `MzqUf1HbJ8UmQ0wUsx2p` (added to the workspace voices)
- Tools `customer_lookup` `tool_3301m3y1xcjef3srtynq0bez04w0`, `customer_link` `tool_3501m3y1xdv2ecqrhdbbp4tyzgb8`,
  `transfer_to_human` `tool_6801m3yg54pjeryaqk377j7114gv` (header `x-ndi-agent-secret` = workspace secret
  `NDI_AGENT_TOOL_SECRET` `8MesPm8j0zm9MlKnLKCq` = `AGENT_TOOL_SECRET`)
- Post-call webhook "NDI customer memory (post-call)" `a33b3560435a4e30b00aabc89012e165` → `<APP_URL>/api/agent/post-call`
  (signing secret in `ELEVENLABS_WEBHOOK_SECRET`)
- **Aida**: "Aida – NDI copilot (drafts for staff)", `agent_0301m3y1xgv9ee8tr3qf8w110kbb` (text only; its placeholders `email_mode`, `instagram_mode`, `messenger_mode` are the auto/draft switches)
- Knowledge base (2 Oct 2026): catalog, latest presentation, Company Knowledge Base and FAQ PDFs, plus the URL document
  "NDI public demo videos (live page)" `EEG5MebQkLEcbyy25NuF` (= `<APP_URL>/demos`, auto-sync, `ELEVENLABS_DEMOS_DOCUMENT_ID`),
  attached to Clara **and** Aida on their live branches. The demo list is **always in their context** (usage mode
  `prompt`, 6 Oct 2026, backups `backup11_*`): asked by name on Telegram, Clara's search found only FAQ passages and
  said she had no demo (CHANNEL_SETUP.md §2, "Demo videos"). A Telegram chat is one long conversation in ElevenLabs,
  listed at the date of its first message (§5)
- Prompt: CHANNEL_SETUP.md §2. NDI facts in it come only from new-digital-intelligence.com (crawled 2 Oct 2026).
  The booking link from the contact page ("Schedule a Meeting", `https://calendly.com/michael-burian-ndi`, Michael
  Burian, NDI's CEO) is in Clara's prompt (section "Booking a meeting or a demo") and Aida's company context since
  3 Oct 2026, on the user's request; backups `scratchpad/agents/backup8_*`
- Settings changes via API: `PATCH /v1/convai/agents/{id}` with only the changed part, then read it back; back up first

**Web app** (Next.js 16 – read `node_modules/next/dist/docs/` before using unfamiliar APIs; see AGENTS.md)
- Same structure as CDA; see CHANNEL_SETUP.md §13 for routes and who may call them
- Railway: `src/instrumentation.ts` + `src/lib/dailyJobs.ts` replace Vercel Cron; `src/lib/appUrl.ts` gives the
  public address (`APP_URL`, else `RAILWAY_PUBLIC_DOMAIN`)
- Contact values in the code: `PHONE_LINE` (`src/components/ChannelLinks.tsx`) and `DEMO_LINE`
  (`src/components/admin/OutgoingCalls.tsx`) = +41 44 513 70 94 since 4 Oct 2026; `SUPPORT_EMAIL` and `TELEGRAM_BOT`
- **Server**: `npm start` runs **`server.mjs`** (since 3 Oct 2026): Next.js plus two WebSockets for a call's live view
  (`/api/twilio/media-stream` from Twilio, `/api/live/signal` to staff pages), which Next.js route handlers cannot
  hold; it tells the app which calls staff pages watch (`POST /api/live/watch`). It starts the daily jobs like
  `next start` (checked: "daily jobs: scheduled"). `npm run dev` has no live view of calls
- **Calls** (`/admin/calls`, the user's request, 3 Oct 2026): tabs **Outgoing** (call lists), **Incoming** (calls to
  NDI, `src/lib/incomingCalls.ts`, table `incoming_calls`) and **Hand-over team** (`/admin/calls/team`, table
  `handover_team`). A call to NDI is handed over to the team, rung in order (`src/lib/handover.ts` serves both kinds
  of call; Clara's prompt has "Calls to NDI: handing over to a colleague", and `customer_lookup` returns
  `inbound_call.handover`). **Live view, only on request** (the user's request, 3 Oct 2026: they cost money): nothing
  runs until a staff member presses **Open live call**; then the call's sound (Twilio Media Streams, $0.0044/min) and
  transcript (Twilio real-time transcription, Deepgram `nova-3` `multi`, $0.027/min) run until 15 s after the view is
  closed (`src/lib/liveCall.ts`, columns `live_on` and `live_name`); Aida's suggestions during a hand-over. One
  exception (the user's choice, 3 Oct 2026): the colleague's talk after a hand-over is always transcribed (hold
  TwiML, transcript `handover`), because ElevenLabs is off the call by then and the customer's memory note needs it.
  Once Clara's part is over, the view shows it in full from ElevenLabs (free; `/api/admin/calls/live/<id>/clara`;
  the user's request, 4 Oct 2026: text only, no audio player). ElevenLabs records Clara's calls (`record_voice` on,
  unlimited retention): asked the user on 4 Oct 2026 whether callers should be told (a sentence in Clara's greeting)
  or recording switched off; no answer yet. Tested with a fake Twilio (56 checks) and `server.mjs` locally
  (16 checks)
- **Design and routing** (the user's request, 2 Oct 2026: "modern, not like CDA", "routing where there are many
  panels"): the customer site is an app with a side menu (on a phone: a bar at the bottom) and one address per way of
  talking: `/` chat, `/voice`, `/avatar`, `/aida` (`src/app/(site)`, `src/components/site/`). The staff console has a
  dark side menu and one address per section: `/admin/rooms`, `/customers`, `/mood`, `/calls`, `/knowledge`,
  `/replies` (`src/app/admin`, `src/components/admin/AdminShell.tsx` + `sections.ts`; `/admin` redirects in
  `next.config.ts`). Both shells live in layouts, so state survives moving between pages (CHANNEL_SETUP.md §9, §12).
  Icons: `lucide-react`. Cards everywhere take `shadow-sm` (redefined in `globals.css`), big panels `shadow-card`.
  Sections with several panels have tabs at their own addresses, in the shared tab bar of `src/components/admin/ui.tsx`
  (with `Empty`, `StatTile`, `Panel` and `useSectionPath`): Knowledge (`/admin/knowledge`, `/feedback`, `/approved`),
  Customers (`/admin/customers`, one customer at `/admin/customers/<id>`, `/overview`), Mood (`/admin/mood`,
  `/follow-up`, `/emails-calls`; staff alert emails link to `/follow-up`), Calls (`/admin/calls`, `/incoming`,
  `/team`) and Replies (`/admin/replies` = Email, `/instagram`, `/messenger`, 4 Oct 2026: a channel's settings on the
  left, its emails or drafts across the rest). Every section uses the whole width beside the menu (the user's
  request, 4 Oct 2026: "use full available width"). The site icon is
  the NDI letters drawn as shapes (`src/app/icon.svg`, `src/app/apple-icon.png` 180x180 for phone home screens)
- Colours: the **NDI logo** (the user's decision, 2 Oct 2026): red `#fe0100` capitals and black on white. Neutral
  Tailwind tokens (`brand`, `brand-soft`, `accent`, `heading`, `line`, `surface`, `muted`, `ink`, `night`) in `src/app/globals.css`:
  `accent` = the logo red, `brand` = `#e00000` (buttons, menus, links: readable at 4.5:1), black and neutral greys.
  The logo is drawn by `src/components/NdiLogo.tsx` (Archivo Black, like the logo's capitals); emails use the same colours
- Times: Central European (Europe/Zurich)

**Shared with CDA on purpose**: the ElevenLabs account, the LiveKit project (for now), the Anthropic key, the Twilio
account (new number). **Not shared any more**: Instagram and Messenger. The Meta app "Customer Support" (made for
CDA) sends them to NDI only: the user removed CDA from its webhooks (confirmed 4 Oct 2026).

---

## 5. Open tasks (in order)

1. ✅ **GitHub** (2 Oct 2026): public `github.com/new-digital-intelligence-com/ndi-front-assistant`, `main` (HelmiDev03).
2. ✅ **Supabase** (2 Oct 2026): the team's shared "pocs" project, own schema `fo01_ndi` (26 tables, exposed in the
   Data API), NDI's own secret key `sb_secret_…` in `SUPABASE_SERVICE_ROLE_KEY`. Checked read-only through the API.
   When `supabase/schema.sql` changes, the user runs it again in the SQL editor (safe: everything is "if not exists");
   until then the new feature fails (on 2 Oct 2026 the Instagram & Messenger card stayed empty for that reason).
3. ✅ **Railway** (2 Oct 2026): team NDI → project POCs → service `[FO-01] ndi-front-assistant` (europe-west4),
   from GitHub `main`, domain `ndi-assistant.up.railway.app`, the variables from `.env.local` (empty ones left out; 43 on 2 Oct 2026).
   Checked: pages, protections, `daily jobs: scheduled`, staff admin reading Supabase (CHANNEL_SETUP.md §3).
   **Pushes do not deploy by themselves** until a GitHub organisation owner gives Railway's GitHub App access to the
   repository (the user is a member, not an owner): after each push, deploy the commit with the `railway api`
   command in CHANNEL_SETUP.md §3.
4. ✅ **Knowledge** (done 2 Oct 2026, 4 PDFs attached): the files were chosen on 2 Oct 2026 (CHANNEL_SETUP.md §2, "What goes in"): only public-safe,
   current client material from the NDI shared drive, attached to Clara **and** Aida. Never put Drive file names, IDs
   or client details into this public repository. Drive access for reading is KT-01's read-only Google sign-in.
5. ✅ **Telegram**: bot **@ndi2026bot** linked to Clara; `TELEGRAM_BOT` in ChannelLinks; tested by the user (2 Oct 2026).
6. ✅ **Email** (contact@new-digital-intelligence.com, 2 Oct 2026): NDI's own Google Cloud project `ndi-front-assistant`
   (owned by contact@, the user's decision: not CDA's), consent (refresh token), Pub/Sub topic `gmail-inbox-ndi` + push
   subscription, app password for `gmail_sender`, `SUPPORT_EMAIL`, Custom Channel "NDI email" (3 values on Railway),
   Gmail watch started (renewed daily). The user tested a reply. Auto or draft: `/admin/replies`.
7. **Phone** (4 Oct 2026): ✅ number **+41 44 513 70 94** (Swiss local, Zurich; NDI's main Twilio account, which also
   holds other projects' numbers: touch only this one) imported into ElevenLabs and assigned to Clara; `PHONE_LINE`,
   `DEMO_LINE`; `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` on Railway; geo permissions already on for CH, DE, FR, IT,
   AT, GB, TN, US. Hand-over team on `/admin/calls/team` (Helmi). The live transcript needs Twilio's AI/ML Features
   Addendum accepted (CHANNEL_SETUP.md §8). If Twilio refuses the live sound or transcript next to ElevenLabs' own
   stream, the view says "Twilio refused: …" (at a hand-over they start again).
8. **Avatar** (2 Oct 2026): ✅ NDI's own Anam account (new `ANAM_API_KEY`, not CDA's) and its custom avatar, Clara's
   face (`ANAM_AVATAR_ID`; model `cara-4` as the app asks; office desk, NDI logo on the wall), both on Railway; Clara's
   input audio is PCM 16000 and the `language` override is allowed. Anam's free plan: 30 minutes a month, 3-minute
   calls, watermark.
9. **Instagram/Messenger** (the accounts CDA used, NDI only now): ✅ Custom Channels "NDI Instagram" and "NDI Messenger"
   on Clara (2 Oct 2026; secret order checked, 6 values on Railway); tokens checked (NDI's Instagram token refreshed,
   valid to 1 Dec 2026; Page token valid with `pages_messaging`); the live webhooks pass Meta's verify check. The user
   switched the 2 Meta Callback URLs to NDI and tested both (2 Oct 2026), and removed CDA (confirmed 4 Oct 2026).
   Replies after Meta's 24 hours: only with Meta's "Human Agent" permission (7 days), not requested yet.
10. ✅ **Demo videos** (2 Oct 2026): YouTube Data API key (project `ndi-front-assistant`, restricted to YouTube Data
    API v3) → `YOUTUBE_API_KEY`; `/demos` lists 85 videos; URL document `EEG5MebQkLEcbyy25NuF` (ElevenLabs read all 85
    links, search index built) attached to Clara and Aida → `ELEVENLABS_DEMOS_DOCUMENT_ID`. The app's hourly check
    refreshes it when the channel changes (CHANNEL_SETUP.md §2, "Demo videos").
11. ✅ **Staff alerts** (3 Oct 2026): `STAFF_ALERT_EMAIL` = contact@new-digital-intelligence.com (the user's choice).
12. Optional: Slack, a separate LiveKit project. (Intercom was removed on the user's decision.)

---

## 6. Dates and housekeeping

| When | What |
|---|---|
| Daily, automatic | The app's daily jobs renew the Gmail watch and refresh the Instagram token |
| ~17 Oct 2026 | ElevenLabs credits reset (shared with CDA) |
| After 20 Dec 2026, if Messenger stops | New Page token (`MESSENGER_PAGE_TOKEN` on Railway) |
| Later | Rotate keys that were shared in chat (shared with CDA: rotate in both apps) |
