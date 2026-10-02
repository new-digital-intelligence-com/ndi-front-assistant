# Claude handoff – NDI multi-channel assistant

Read this first when continuing the project. Last updated: **2 October 2026**.
Public plain-words documentation of every feature: **`<APP_URL>/docs`** (`src/app/docs/page.tsx`; keep it up to
date when a feature or a channel's status changes). Full channel-by-channel setup: [CHANNEL_SETUP.md](CHANNEL_SETUP.md).
`<APP_URL>` = `https://ndi-assistant.up.railway.app` (planned Railway address).

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
| Website `<APP_URL>` (chat, voice, avatar, Aida tab) + `/admin` + `/docs` | ⏳ Code ready, to deploy on Railway | Next.js on Railway |
| Telegram | ⏳ New bot to create | Native ElevenLabs Telegram trigger |
| Email | ⏳ Mailbox to choose | Gmail push → web app → Custom Channel "NDI email" |
| Instagram @new_digital_intelligence, Messenger Page "New Digital Intelligence" | 🔀 Shared with the CDA demo, switched per demo | Meta webhook → web app → Custom Channels "NDI Instagram" / "NDI Messenger" (CHANNEL_SETUP.md §7) |
| Phone | ⏳ New Twilio number (not CDA's) | Native ElevenLabs Twilio import |
| Video avatar | ⏳ New Anam avatar (the user sets it up) | Anam joined to Clara |
| Intercom | Optional | Needs NDI's own Intercom workspace |
| Hosted page / QR code | ✅ Works now | ElevenLabs talk-to link |
| Alexa | ❌ Removed on purpose (user's decision) | — |
| Slack, WhatsApp | Not built | — |

**What differs from CDA** (decisions of the user, 2 Oct 2026): assistant **Clara** (not Ellie), voice **Katie X**
(close to Shelley), call languages **English + German, Italian, French**, hosting on **Railway** from a **public**
repository the user creates (not Vercel), **no Alexa**, a **new Twilio number**, a **new Anam avatar**, Instagram and
Messenger **shared with CDA and switched per demo**, and the **AI Employees knowledge comes from the user's Google
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
  Flash (temperature 0), TTS Eleven Flash v2 (English) / Flash v2.5 (presets `de`, `it`, `fr`), Scribe Realtime,
  turn_v3, input PCM 16000 / output PCM 24000, files on, retention unlimited, sentiment on, overrides `first_message`,
  `language`, `text_only` allowed. Voice **Katie X** `MzqUf1HbJ8UmQ0wUsx2p` (added to the workspace voices)
- Tools `customer_lookup` `tool_3301m3y1xcjef3srtynq0bez04w0`, `customer_link` `tool_3501m3y1xdv2ecqrhdbbp4tyzgb8`
  (header `x-ndi-agent-secret` = workspace secret `NDI_AGENT_TOOL_SECRET` `8MesPm8j0zm9MlKnLKCq` = `AGENT_TOOL_SECRET`)
- Post-call webhook "NDI customer memory (post-call)" `a33b3560435a4e30b00aabc89012e165` → `<APP_URL>/api/agent/post-call`
  (signing secret in `ELEVENLABS_WEBHOOK_SECRET`)
- **Aida**: "Aida – NDI copilot (drafts for staff)", `agent_0301m3y1xgv9ee8tr3qf8w110kbb` (text only, `email_mode` placeholder)
- Knowledge base (2 Oct 2026): catalog, latest presentation, Company Knowledge Base and FAQ PDFs, attached to Clara **and** Aida; demo videos follow via `/demos` once Railway is live
- Prompt: CHANNEL_SETUP.md §2. NDI facts in it come only from new-digital-intelligence.com (crawled 2 Oct 2026)
- Settings changes via API: `PATCH /v1/convai/agents/{id}` with only the changed part, then read it back; back up first

**Web app** (Next.js 16 – read `node_modules/next/dist/docs/` before using unfamiliar APIs; see AGENTS.md)
- Same structure as CDA; see CHANNEL_SETUP.md §13 for routes and who may call them
- Railway: `src/instrumentation.ts` + `src/lib/dailyJobs.ts` replace Vercel Cron; `src/lib/appUrl.ts` gives the
  public address (`APP_URL`, else `RAILWAY_PUBLIC_DOMAIN`)
- Values still to fill in the code once known: `SUPPORT_EMAIL`, `TELEGRAM_BOT`, `PHONE_LINE`
  (`src/components/ChannelLinks.tsx`, buttons hidden while empty) and `DEMO_LINE` (`src/components/admin/CallListPanel.tsx`)
- Colours: neutral Tailwind tokens (`brand`, `accent`, `heading`, `line`, `surface`, `muted`, `ink`) with NDI's
  navy `#002a6c` and blue `#1190cb` (`src/app/globals.css`)
- Times: Central European (Europe/Zurich)

**Shared with CDA on purpose**: the ElevenLabs account, the Google Cloud project `cda-email-509312` (OAuth client;
NDI gets its own Pub/Sub topic), the LiveKit project (for now), the Anthropic key, the Meta app "Customer Support"
with the Instagram account and the Facebook Page (switched per demo), the Twilio account (new number).

---

## 5. Open tasks (in order)

1. **GitHub**: the user creates the public repository → add it as `origin` and push `main` (author HelmiDev03).
2. **Supabase**: the team's shared "pocs" project (the team's rule), own schema `fo01_ndi`: run `supabase/schema.sql`,
   add `fo01_ndi` to Data API → Exposed schemas, then `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SCHEMA=fo01_ndi`.
3. **Railway**: new service from the repository, variables from `.env.local`, domain `ndi-assistant.up.railway.app`
   (CHANNEL_SETUP.md §3). If the domain must differ, update `APP_URL`, both tools and the post-call webhook.
4. ✅ **Knowledge** (done 2 Oct 2026, 4 PDFs attached): the files were chosen on 2 Oct 2026 (CHANNEL_SETUP.md §2, "What goes in"): only public-safe,
   current client material from the NDI shared drive, attached to Clara **and** Aida. Never put Drive file names, IDs
   or client details into this public repository. Drive access for reading is KT-01's read-only Google sign-in.
5. **Telegram**: new bot → ElevenLabs trigger → `TELEGRAM_BOT` in ChannelLinks.
6. **Email**: the user chooses the mailbox → consent (refresh token) → Pub/Sub topic `gmail-inbox-ndi` + push
   subscription → Custom Channel "NDI email" → variables → `SUPPORT_EMAIL`; app password for `gmail_sender`.
7. **Phone**: the user buys a new Twilio number → import into ElevenLabs, assign Clara → `PHONE_LINE`, `DEMO_LINE`.
8. **Avatar**: the user creates the NDI Anam avatar → `ANAM_AVATAR_ID` (and `ANAM_API_KEY` if a new account).
9. **Instagram/Messenger**: Custom Channels "NDI Instagram" and "NDI Messenger" → variables; switch the 2 Meta
   Callback URLs when NDI should answer (CHANNEL_SETUP.md §7).
10. **Demo videos** (after Railway): YouTube Data API key → `YOUTUBE_API_KEY`; add `<APP_URL>/demos` as an ElevenLabs
    URL document (auto-sync on), attach to Clara and Aida → `ELEVENLABS_DEMOS_DOCUMENT_ID`. The app's hourly check
    then refreshes it when the channel changes (CHANNEL_SETUP.md §2, "Demo videos"). Test once what ElevenLabs
    extracts from the live page (free: create, read `/content`).
11. Optional: Intercom (own workspace), Slack, a separate LiveKit project, `STAFF_ALERT_EMAIL`.

---

## 6. Dates and housekeeping

| When | What |
|---|---|
| Daily, automatic | The app's daily jobs renew the Gmail watch and refresh the Instagram token |
| ~17 Oct 2026 | ElevenLabs credits reset (shared with CDA) |
| After 20 Dec 2026, if Messenger stops | New Page token in both apps |
| Later | Rotate keys that were shared in chat (shared with CDA: rotate in both apps) |
