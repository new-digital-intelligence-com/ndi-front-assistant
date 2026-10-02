# Claude handoff – CDA multi-channel assistant demo

Read this first when continuing the project on another device. Last updated: **27 September 2026**.
Public plain-words documentation of every feature: **https://cda-demo.vercel.app/docs** (`src/app/docs/page.tsx`; keep it up to date when a feature changes).
Full channel-by-channel setup (IDs, steps, costs, troubleshooting): [CHANNEL_SETUP.md](CHANNEL_SETUP.md).

> **This repository is public.** Never write API keys, tokens, passwords or secrets into any committed file.

---

## 1. What this project is

NDI (New Digital Intelligence) is building a **demo** multi-channel front-office assistant for **CDA**
(UK kitchen appliance brand, www.cda.co.uk). It is not an official CDA service.

One AI agent, **Ellie**, runs on **ElevenLabs Agents** and answers on every channel with the same prompt,
knowledge base and model. Ellie replies directly (Agent mode); email can be switched to Gmail drafts
for staff, and Aida rooms draft answers for staff on live calls.

| Channel | Status | How |
|---|---|---|
| Telegram @CDA_2026_Support_Bot | ✅ Live | Native ElevenLabs Telegram trigger |
| Email cda_domestic_appliances@new-digital-intelligence.com | ✅ Live (21 Sep) | Gmail push → web app → Ellie's "CDA email" Custom Channel → sent, or a Gmail draft (`email_mode` on Aida). Freshdesk no longer used |
| Instagram DMs @new_digital_intelligence | ✅ Live | Meta webhook → web app (`src/lib/metaChat.ts`) → Ellie's "CDA Instagram" Custom Channel; token auto-refreshed by the daily cron. Make scenarios switched off (backup) |
| Facebook Messenger (Page "New Digital Intelligence") | ✅ Live 21 Sep (tested from an account with no role: works, no App Review) | Meta webhook → web app (`src/lib/messenger.ts`) → Ellie's "CDA Messenger" Custom Channel. Not Make: its free plan allows 2 active scenarios, both used by Instagram |
| Alexa skill "CDA Assistant" (Echo / Alexa app) | ✅ Built 22 Sep (development mode) | Amazon → web app (`src/lib/alexa.ts`, request signature checked) → Ellie's "CDA Alexa" Custom Channel; answers wait in Supabase `alexa_replies` until read out. CHANNEL_SETUP.md §6 |
| Hosted web page / QR code | ✅ Live | ElevenLabs talk-to link (not password protected) |
| **This web app** (chat, file upload, voice, video avatar, Aida calls, channel links) | ✅ Live | Next.js on Vercel: https://cda-demo.vercel.app (site password) — customers only |
| **Admin page** `/admin` (Aida rooms, customers + Claude insights, 😊 Mood, call list, knowledge, email switch) | ✅ Live | Same app, behind the Aida staff password — staff only |
| **Customer mood** (sentiment on every channel, staff alerts, live mood in Aida rooms, upset emails held as drafts) | ✅ Built 27 Sep | `src/lib/mood.ts`, CHANNEL_SETUP.md §10 “Customer mood”. Needs `supabase/schema.sql` run again + `STAFF_ALERT_EMAIL` on Vercel |
| **Docs page** `/docs` | ✅ 27 Sep | Public, no password, no secrets |
| Video avatar (Avatar tab) | ✅ Live | **Anam** avatar "Sofia" (the user's own Ellie picture) joined to the ElevenLabs agent |
| Slack (bot "CDA_Support") | ⏳ In progress | Native ElevenLabs Slack integration, own Slack app (CHANNEL_SETUP.md §14) |
| WhatsApp, phone number | ⏸ Parked | See CHANNEL_SETUP.md §14 |

---

## 2. How the user wants you to work (important)

- **Never use subagents or workflows.** Do all work yourself.
- **Git commits:** author **HelmiDev03 <helmipaty@gmail.com>**, and **no `Co-Authored-By` trailer**. **Push straight after committing** — the user said (21 Sep 2026) not to wait for their confirmation. Vercel deploys `main` automatically, so a push is a deploy: build, type-check and lint first, and never push secrets (the repo is public).
- **Don't spend credits testing.** Never start conversations with Ellie (chat, voice, avatar calls, simulate-conversation) or start avatar/phone sessions yourself. Free read-only API checks are fine. Give the user test questions with expected answers instead.
- **One step at a time, simple English** (the user is not a native English speaker). Wait until a step is finished before the next.
- **Channels:** prefer native ElevenLabs integrations. Where there is none, the user chose (21 Sep 2026) to build the channel in the web app rather than Make.com: email, Instagram and Messenger all run there now.
- **Verify before claiming a cause.** Use API checks, docs and logs; don't guess (e.g. plan limits).
- When something fails in the browser (avatar, voice), ask the user for the **F12 → Console** output.

---

## 3. Getting set up on a new device

```bash
git clone git@github.com:new-digital-intelligence-com/cda.git
cd cda
npm install
```

Create `.env.local` (git-ignored). Copy the values from **Vercel → project `cda` → Settings → Environment Variables**
(or `npx vercel env pull .env.local` after `vercel login` + `vercel link`):

| Variable | What |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs key (needs Agents read/write, `convai_read`, `user_read`, `voices_read`) |
| `ELEVENLABS_AGENT_ID` | Ellie's agent ID |
| `SITE_PASSWORD` | Password for the demo site |
| `ANAM_API_KEY` | Anam API key |
| `ANAM_AVATAR_ID` | Anam avatar Sofia |
| `ANAM_MAX_SESSION_SECONDS` | `180` (Anam free plan limit) |
| `SUPABASE_URL` | Supabase project for the cross-channel customer memory |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `AGENT_TOOL_SECRET` | Secret the agent's tools send in `x-cda-agent-secret` |
| `ELEVENLABS_WEBHOOK_SECRET` | Signing secret of the post-call webhook |
| `FRESHDESK_API_KEY` / `FRESHDESK_SUBDOMAIN` | Only for old Freshdesk tickets (`_fd_` conversations) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | Gmail API access to the CDA mailbox (email channel, server only) |
| `GMAIL_PUBSUB_TOPIC` / `GMAIL_PUSH_SECRET` / `CRON_SECRET` | Gmail push topic, the secret in the Pub/Sub push URL, and the daily cron's secret |
| `EMAIL_CHANNEL_INBOUND_URL` / `EMAIL_CHANNEL_INBOUND_SECRET` / `EMAIL_CHANNEL_SIGNING_SECRET` | Ellie's "CDA email" Custom Channel trigger |
| `INSTAGRAM_ACCESS_TOKEN` / `INSTAGRAM_USER_ID` / `INSTAGRAM_WEBHOOK_SECRET` / `INSTAGRAM_CHANNEL_*` (3) | Instagram in the web app (starting token; refreshed copy lives in Supabase `channel_tokens`) |
| `MESSENGER_PAGE_TOKEN` / `MESSENGER_PAGE_ID` / `MESSENGER_WEBHOOK_SECRET` / `MESSENGER_CHANNEL_*` (3) | Messenger Page token (never expires), Page ID, Meta Callback URL secret, "CDA Messenger" Custom Channel |
| `ALEXA_SKILL_ID` / `ALEXA_CHANNEL_*` (3) | Alexa skill ID and the "CDA Alexa" Custom Channel |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Claude Haiku (`claude-haiku-4-5`) for the insights on `/admin` and the email / Aida moods |
| `STAFF_ALERT_EMAIL` | Optional: who gets the “upset customer” emails (comma-separated). The CDA mailbox itself is fine (mail from itself is ignored by the email channel) |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit Cloud project for Aida rooms (server only) |
| `AIDA_AGENT_ID` | The Aida copilot agent, `agent_2601m31rbrn8emrbfe8vgxgxdta9` |
| `AIDA_STAFF_PASSWORD` | Aida's own staff password; the site password does **not** make anyone staff |
| `gmail_sender` / `gmail_app_password` | Gmail mailbox + app password that send conversation emails (lower-case names) |

```bash
npm run dev      # http://localhost:3000
npm run build    # run before `npx tsc --noEmit` (stale .next types otherwise)
npm run lint
```

Use the keys from `.env.local` for API work (ElevenLabs, Anam). Never print them in full or commit them.

Only this repository is needed on the new device. The folders `CDA_Knowledge_Base/` and `CDA_Demo_Assets/`
stayed on the old device: the knowledge PDFs already live in Google Drive (synced to ElevenLabs) and the QR code
can be regenerated from the talk-to link. The script that generated the PDFs was temporary and is not kept.

---

## 4. Key facts

**ElevenLabs** (Creator plan, 121,005 credits/month, resets ~17th)
- Agent "CDA Assistant – Demo", ID `agent_3601m2p374tce96b7p6hdfz5f1tv`, branch `agtbrch_9301m2p375xzetbbsyymxnbnsf1s`
- Gemini 3.7 Flash (temperature 0), voice **Shelley** (British), TTS **Eleven Flash v2** for English, STT **Scribe Realtime**, turn model turn_v3
- **Polish** (21 Sep): language preset `pl` (Polish greeting, TTS Flash v2.5, still Shelley); the `language` override is allowed in Security. The website's Voice and Avatar tabs have an English | Polski switch (`src/components/LanguagePicker.tsx`); the avatar passes it through Anam's `conversationConfigOverride`. The built-in **language_detection** tool is on, so during a call Ellie switches between English and Polish when the customer does (it shows as `system:language_detection` in her tools list)
- **Audio: input PCM 16000 Hz (required by Anam), output PCM 24000 Hz**
- 31 knowledge documents (21 cda.co.uk URLs + 10 PDFs synced from Google Drive), RAG every turn
- Prompt has per-channel rules ("Telegram only", "Instagram only", "Website chat", "Email only", phone/avatar short answers)
- Settings changes via API: `PATCH /v1/convai/agents/{id}?branch_id=…` with only the changed `conversation_config` part, then re-read to confirm; back up the agent JSON first
- Voice/avatar minutes cost about **600 credits per minute**

**Web app** (Next.js 16 – read `node_modules/next/dist/docs/` before using unfamiliar APIs; see AGENTS.md)
- `src/proxy.ts` + `src/lib/auth.ts`: password lock on every page and API route
- `src/components/AssistantApp.tsx`: tabs Chat / Voice / Avatar / **Aida** (the customer side of
  Aida rooms: join with a code or open a room; always a customer there)
- **`/admin`** (`src/app/admin/`, `src/components/admin/`, `src/app/api/admin/*`, `src/lib/adminData.ts`,
  `src/lib/anthropic.ts`): staff only, Aida staff password. Tabs Aida rooms (the old lobby) /
  Customers (list, channels, history, Claude Haiku insights per customer and for the week; nothing
  stored) / Email (auto/draft switch). `/aida` redirects there. CHANNEL_SETUP.md §10
- `src/app/api/elevenlabs/*`: signed URL (chat) and conversation token (voice)
- `src/app/api/anam/session/route.ts` + `src/components/AvatarPanel.tsx`: Anam avatar. The server gets an ElevenLabs signed URL and creates an Anam session token (`avatarModel: cara-4`, `maxSessionLengthSeconds`, `directorNotes` warm 0.5, `sessionOptions` 1152×768 or 768×1152, `environment.elevenLabsAgentSettings`). Anam Lab stores **no** ElevenLabs link; the "Olivia" persona in Lab is not used
- `src/components/ChannelLinks.tsx`: Email (Gmail compose), Telegram and Instagram buttons (Instagram opens @new_digital_intelligence)
- **Cross-channel customer memory** (CHANNEL_SETUP.md §8), live and tested against production:
  - `src/app/api/agent/*`: the two agent tools and the post-call webhook. Exempt from the site
    password in `src/proxy.ts`, protected by a shared secret / HMAC instead (`src/lib/agentAuth.ts`)
  - `src/lib/customers.ts` + `supabase/schema.sql`: one customer, many channel rows, link codes, notes
  - `src/lib/account.ts` + `src/app/api/account/` + `src/components/AccountPanel.tsx`: customer
    accounts on Supabase Auth, and the panel where a channel is linked with a code
  - `src/lib/websiteSession.ts`: chat, voice and the avatar register their conversation server-side,
    because a website-only dynamic variable would break every other channel
- **Aida rooms** (CHANNEL_SETUP.md §9): live calls between staff and a customer on LiveKit, each
  browser transcribing its own mic with Scribe, and the Aida agent drafting replies only staff see
  (approve → sent in the chat). `src/app/aida/`, `src/components/aida/`, `src/app/api/aida/*`,
  `src/lib/aida.ts`, `src/lib/livekit.ts`, `src/lib/aidaStaff.ts`. `/aida`, `/aida/join` and
  `/api/aida/*` are open past the site password; the separate Aida staff password is what makes
  someone staff, kept per browser tab
- **Email channel** (CHANNEL_SETUP.md §4): Gmail API + Pub/Sub push (Google Cloud project
  `cda-email-509312`) → `src/app/api/email/gmail-push` → rules in `src/lib/emailParse.ts` skip robots →
  Ellie through her own Custom Channel trigger "CDA email" → `src/app/api/email/ellie-reply` sends
  the reply or leaves a Gmail draft, and labels the email Ellie/Replied, Draft ready, Skipped or
  Failed. The switch is the placeholder `email_mode` (`auto` / `draft`) on the **Aida** agent,
  flipped from the staff card on `/aida` or by Claude through the ElevenLabs connector. The Gmail
  watch is renewed daily by Vercel Cron (`vercel.json`). `src/lib/emailInbox.ts` holds the flow
- Vercel deploys `main` automatically; after changing env vars on Vercel, redeploy

**Anam** (free plan: 30 min/month, 3-min calls, 1 custom avatar) – avatar Sofia, Cara 4, supports horizontal and vertical.
The earlier HeyGen LiveAvatar tab was removed (commit `69eb3da` has it).

**Make.com** (eu1, free plan: 2 active scenarios, 1,000 operations/month): no longer used. The old Instagram
scenarios "IG – Instagram in" (7456234) and "IG – Ellie reply out" (7456248) are switched off as a backup.

---

## 5. Open tasks (in order)

00. **Customer mood** (27 Sep 2026) – built and pushed. The user still has to: run `supabase/schema.sql` again
   (tables `conversation_moods`, `aida_moods`, columns `email_messages.mood_*`), add `STAFF_ALERT_EMAIL` on Vercel
   and redeploy, then `/admin` → 😊 Mood → **Import past conversations**. Ellie got the prompt section *When the
   customer is upset* and the analysis item `needs_follow_up` (backup of her agent before the change in the
   session scratchpad). Test without spending credits: an angry email (draft + label + alert), an Aida room
   (mood dots, meter, Aida's apology draft).

0. **Cross-channel customer memory** - **live** on Telegram, email and the website (chat, voice,
   avatar). Details: CHANNEL_SETUP.md §8. Customers create an account on the site and link each
   channel by pasting a short code into it; Ellie never asks anyone to identify themselves.
   - **Never** bind a tool parameter to a channel-specific dynamic variable: it breaks every other
     channel, and a placeholder on `integration__telegram_chat_id` took Telegram down completely
   - Instagram recognised since 21 Sep: the web app reads Make's `instagram_id` from the stored
     ElevenLabs conversation (never bound to a tool). Left: Slack (`integration__slack_user_id`
     exists, not wired up)
   - Weak spot: Telegram identity relies on the undocumented `_tg_` ending of the conversation id
   - Parked by the user: no memory notes were seen from Telegram/email conversations since 18 Sep
     (probably simply no such conversations; check once there are some)

0a. **Email via Gmail push** – live from 21 Sep 2026, replacing Freshdesk. 33 local route checks
   passed without spending credits, and the user tested live: auto mode replies in the thread,
   draft mode leaves a Gmail draft. Two bugs found live and fixed (reply text is at
   `data[].event.agent_response`; Ellie copied the email header into her reply). No new agent:
   Ellie answers, Aida only stores `email_mode`. Still to do: **remove the Freshdesk trigger from
   Ellie** (Channels → Freshdesk) so nobody gets two answers.

0c. **Customer site / admin split** – 21 Sep 2026. `/` is customers only (site password, Aida tab);
   `/admin` is staff (Aida staff password). 17 local checks passed, including one real Claude
   insight per endpoint. `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` must also be on Vercel.

0b. **Aida rooms** – built, Aida agent created, tables created, LiveKit project connected
   (`wss://test-o70a5e7x.livekit.cloud`). All 45 route checks pass locally: roles, forged tickets,
   customers never seeing drafts, ending rooms. Still to do: the four `LIVEKIT_*` / `AIDA_AGENT_ID`
   variables on Vercel, push, and a real call tested by the user (voice + transcript + drafts).
   The Vercel MCP connector is on another account ("Medi" team) and cannot see `cda-demo`.
   Staff are decided by the separate Aida password (`AIDA_STAFF_PASSWORD`), kept per browser tab.
   Closed rooms are read-only forever and can be emailed; signed-in customers are recognised and
   their history is given to Aida (needs `aida_rooms.customer_id` — run `supabase/schema.sql` again).
   Website chat/voice/avatar can also be emailed (`src/app/api/transcript/email`).
1. **Slack** – waiting for the user:
   - The "New Digital Intelligence" Slack workspace hit the free plan's 10-app limit → use a new demo workspace or remove an unused app.
   - User creates the **CDA_Support** app from the manifest in CHANNEL_SETUP.md §14, installs it, and gives the **Bot User OAuth Token** + **Signing Secret** and the mode (mention-only or all messages).
   - Then: ElevenLabs Integrations → Slack → "Bring your own bot" → Slack Event Subscriptions + Interactivity URLs → triggers Channel Message + Direct Message → test (user tests).
2. **Confirm the Voice tab still works** after the input format change to PCM 16000 (the user confirmed the avatar, not voice yet).
3. Optional: label Anam sessions in the session token (`clientLabel` / persona `name`, e.g. "Ellie – CDA website") so calls are easy to find in Anam Lab.
4. **Security decision (ask the user):** the public repo exposes the agent ID and talk-to link, so anyone can use ElevenLabs credits without the site password. Options: make the repo private (check Vercel still deploys) or enable agent authentication (breaks the public page/QR/widget; retest channels).
5. For the CDA demo: Anam **Explorer ($49/month)** removes the watermark and allows 10-minute calls (then raise `ANAM_MAX_SESSION_SECONDS`).
6. Ideas the user may pick: Facebook Messenger (copy the Instagram Make setup), phone number via Twilio, Flash v2.5 voice model for non-English voice.

## 6. Dates and housekeeping

| When | What |
|---|---|
| ~1 Oct 2026 | Freshdesk trial ends — email no longer uses it |
| Daily, automatic | Vercel Cron renews the Gmail watch; if emails stop, open `/api/email/gmail-watch` with the push secret |
| ~17 Oct 2026 | ElevenLabs credits reset |
| Automatic | The Instagram token is refreshed every 7 days by `/api/cron/daily` (stored in Supabase `channel_tokens`) |
| After the demo | Rotate keys that were shared in chat (ElevenLabs, Anam, **Supabase service role**, **LiveKit**, **Google OAuth client secret** + new Gmail consent, the email Custom Channel secrets, Freshdesk), delete the Make API token, delete the unused LiveAvatar API key/secret/voice agent |
