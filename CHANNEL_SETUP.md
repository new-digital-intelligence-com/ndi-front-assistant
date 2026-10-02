# NDI Multi-Channel Assistant – Setup Guide

NDI's (New Digital Intelligence) own front-office assistant, and a live example of NDI's
**Multi-Channel Front Office Assistant**. Copied on 2 October 2026 from the CDA demo
(`github.com/new-digital-intelligence-com/cda`) and turned into NDI's: same features, NDI's content.
Last updated: **2 October 2026**. A public, plain-words version of this guide is at **`<APP_URL>/docs`**.

> **This repository is public. No secrets in this file.** Keys and tokens live in the tools themselves,
> in Railway and in `.env.local` — see [Credentials](#14-credentials).

`<APP_URL>` below is the app's address on Railway: **`https://ndi-assistant.up.railway.app`** (planned; the
ElevenLabs tools and webhook already point there — see [Railway](#3-railway-hosting)).

## Contents

1. [Overview](#1-overview)
2. [Clara, the ElevenLabs agent](#2-clara-the-elevenlabs-agent)
3. [Railway (hosting)](#3-railway-hosting)
4. [Supabase (database)](#4-supabase-database)
5. [Telegram](#5-telegram)
6. [Email](#6-email)
7. [Instagram and Facebook Messenger](#7-instagram-and-facebook-messenger)
8. [Phone](#8-phone)
9. [Website](#9-website)
10. [Customer memory across channels](#10-customer-memory-across-channels)
11. [Aida rooms](#11-aida-rooms)
12. [Admin page](#12-admin-page)
13. [Web app reference](#13-web-app-reference)
14. [Credentials](#14-credentials)
15. [Maintenance](#15-maintenance)
16. [Not built yet](#16-not-built-yet)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Overview

One AI agent, **Clara**, on **ElevenLabs Agents**, answers on every channel with the same prompt, knowledge and
model. She replies directly; staff can check first on email (draft mode) and in Aida rooms (live calls where the
second agent, Aida, drafts answers for staff).

| Channel | Status | How it reaches Clara |
|---|---|---|
| Website `<APP_URL>` (Chat, Voice, Avatar, Aida) | ⏳ Deploy on Railway | Next.js app on Railway, site password |
| Admin `<APP_URL>/admin` | ⏳ With the website | Staff page, Aida staff password |
| Docs `<APP_URL>/docs` | ⏳ With the website | Public documentation page, no password |
| Telegram | ⏳ New bot to create | Native ElevenLabs Telegram trigger |
| Email | ⏳ Mailbox to choose | Gmail push → web app → Custom Channel "NDI email" |
| Instagram **@new_digital_intelligence** | 🔀 Shared with the CDA demo | Meta webhook → web app → Custom Channel "NDI Instagram" |
| Facebook Messenger, Page **New Digital Intelligence** | 🔀 Shared with the CDA demo | Meta webhook → web app → Custom Channel "NDI Messenger" |
| Phone | ⏳ New Twilio number to buy | Imported into ElevenLabs natively |
| Video avatar (Avatar tab) | ⏳ New Anam avatar | Anam joined to Clara |
| Intercom chat bubble | Optional | ElevenLabs' native Intercom integration |
| Hosted page / QR code | ✅ Works now | ElevenLabs talk-to link (no password) |
| Slack, WhatsApp | Not built | Section 16 |
| Alexa | Removed | Not part of NDI's assistant |

```
 Website chat / voice / files ─────────►┐
 Avatar tab ─► Anam (video face) ───────►│
 Telegram bot ──────────────────────────►│   ElevenLabs agent "Clara"
 Email ─► Gmail ─► web app ─────────────►│   Gemini 3.7 Flash · NDI knowledge (RAG)
 Instagram / Messenger ─► web app ──────►│
 Phone (Twilio) ────────────────────────►│
 Hosted page / QR ──────────────────────►┘
                                             │ 2 tools + post-call webhook
                                             ▼
 web app (Railway) ── Supabase: customers, notes, email log, Aida rooms, Instagram/Messenger threads
 Aida tab (customers) + /admin (staff) ── LiveKit calls, Aida drafts for staff
```

**Words used in this guide**

| Word | Meaning |
|---|---|
| **Trigger** | A link between Clara and a channel, set in ElevenLabs → Clara → **Channels** |
| **Custom Channel** | ElevenLabs' trigger for channels it has no built-in support for. It gives three values: an **Inbound URL** and **Inbound Secret** (where the web app sends the customer's message) and an **Outbound Signing Secret** (proves that an answer really comes from ElevenLabs). Its **Reply Webhook URL** is where ElevenLabs sends Clara's answer |
| **Webhook / Callback URL** | An address a platform (Meta, Google) calls when something happens, e.g. a new message |
| **Verify token** | A secret word Meta sends once to check a Callback URL is really ours |
| **Web app** | This repository, running on Railway at `<APP_URL>` |
| **Daily jobs** | Run by the app itself once a day from 06:00 UTC (`src/lib/dailyJobs.ts` → `/api/cron/daily`): renew the Gmail watch, refresh the Instagram token, compare sent email drafts, import moods |

---

## 2. Clara, the ElevenLabs agent

Same ElevenLabs account as CDA (Creator plan, 121,005 credits a month, resets ~17th — shared with the CDA demo).

| Setting | Value |
|---|---|
| Agent | **NDI Assistant – Clara**, ID `agent_0901m3y1xemxeg2s0tjk20fjfgbv` |
| LLM | Gemini 3.7 Flash, temperature 0 |
| Voice | **Katie X – Clear British Customer Support** (`MzqUf1HbJ8UmQ0wUsx2p`), in every language. Alternative close to CDA's Shelley: Ophelia (`YCMgeo2Dvws6xwm7kQNN`) |
| Languages | **English** (default, TTS Eleven Flash v2). **German, Italian, French**: language presets `de`, `it`, `fr` with their own greeting and TTS Eleven Flash v2.5. Built-in tool **language detection** is on: during a call Clara follows the customer between languages. Security → the `language` override is allowed (as are `text_only` and `first_message`) |
| Speech to text | Scribe Realtime, quality high; turn model turn_v3, turn timeout 7 s |
| Audio | Input **PCM 16000 Hz** (Anam needs it), output PCM 24000 Hz |
| First message | "Hello, you're through to NDI's virtual assistant, Clara. How can I help you today?" (not sent on Custom Channel text channels) |
| System tools | end_call, language_detection, voicemail_detection (NDI's voicemail message) |
| Files | Images and PDFs, max 10 per conversation |
| Transcripts | Kept without limit (`retention_days: -1`); sentiment analysis on |
| Cost | Voice or avatar ≈ **600 credits a minute**; a text reply ≈ 60–100 credits |

| On the agent | ID |
|---|---|
| Workspace secret `NDI_AGENT_TOOL_SECRET` (= `AGENT_TOOL_SECRET`) | `8MesPm8j0zm9MlKnLKCq` |
| Tool `customer_lookup` → `<APP_URL>/api/agent/customer-lookup` | `tool_3301m3y1xcjef3srtynq0bez04w0` |
| Tool `customer_link` → `<APP_URL>/api/agent/customer-link` | `tool_3501m3y1xdv2ecqrhdbbp4tyzgb8` |
| Tool `transfer_to_human` → `<APP_URL>/api/agent/handover` (runs after Clara has spoken: `execution_mode` `post_tool_speech`) | `tool_6801m3yg54pjeryaqk377j7114gv` |
| Post-call webhook "NDI customer memory (post-call)" → `<APP_URL>/api/agent/post-call` | `a33b3560435a4e30b00aabc89012e165` |
| Aida agent "Aida – NDI copilot (drafts for staff)" | `agent_0301m3y1xgv9ee8tr3qf8w110kbb` |

**Changing settings by API:** back up the agent JSON, `PATCH /v1/convai/agents/{id}` with only the changed part,
then read it back. API changes go live at once; dashboard changes need **Publish**.

**Prompt sections:** Personality · Company context (stable NDI facts from new-digital-intelligence.com: founded 2023
in Zug, 8 markets, pay-per-use model, 7 offices, mail@new-digital-intelligence.com; numbers that change, such as team
size or delivery locations, are left to the knowledge base) · Environment (channel
rules: phone/avatar short answers; *Telegram only* text; *Instagram and Messenger only* plain text under 900
characters; *Website chat* (the chat tells Clara so when it connects, a contextual update) gives links in full and reads images and PDFs; *Email only*: body of one plain-text reply, never asks for the
email address, answers `SKIP` to robots) · Goal · Knowledge rules (only knowledge-base facts; AI Employees only as
written in the knowledge base; no prices: explain pay-per-use and offer a call) · Collecting details for a meeting or
a request · Data and security · Handover to a human · When the customer is upset · Style (British English) ·
Operating mode: AGENT (summary of the request, never claims a meeting is booked) · Recognising the customer
(section 10) · Calls NDI makes to customers, with the hand-over to a colleague (section 12).

**Analysis items** (post-call data collection): `unanswered_question`, `feedback_sentiment`, `feedback_comment`,
`feedback_question`, `feedback_answer`, `interest` (what the customer wants from NDI), `needs_follow_up`.

### Knowledge base

**Attached on 2 Oct 2026** to Clara and Aida (usage *auto*, searched on every turn, indexes complete), from the approved
Drive folder through ElevenLabs' Google Drive integration: *NDI AI Employee Catalog.pptx.pdf*, *1 NDI Presentation
EN.pptx.pdf*, *NDI_Company_Knowledge_Base.pdf*, *NDI_Frequently_Asked_Questions.pdf*. Keep RAG on: ignore the
dashboard's "small knowledge base, disable RAG" hint (the catalog alone is about 140 KB of text).

**What goes in (decided 2 Oct 2026).** Clara is public: anything in her knowledge can be repeated to anyone. So only
client-facing material that is current and safe to share (the exact file list is kept outside this public repository):
- the **AI Employee catalog** and the **latest company presentation** — as PDF copies, because ElevenLabs cannot read PowerPoint
- the **SARAA factsheet**
- two PDFs written for Clara on 2 Oct 2026 from public sources only (website, LinkedIn, YouTube, privacy policy,
  the presentation and the catalog's overview): **NDI Company Knowledge Base** and **NDI Frequently Asked
  Questions**. They and their HTML sources are in `knowledge-base/` on the developer's machine (git-ignored;
  `knowledge-base/README.md` says how to rebuild them)
- the **demo videos page** `<APP_URL>/demos`, added as an ElevenLabs **URL document** (see "Demo videos" below), so
  new YouTube videos reach Clara by themselves. Adding the YouTube channel link itself does not work: ElevenLabs
  extracted 0 characters from it in a test (YouTube builds its pages with JavaScript)

Best kept in **one approved folder with one owner at NDI**, and Clara reads nothing else (never the whole shared drive).

**What never goes in:** client project folders, contracts and contract templates (a person sends NDAs, contracts and
the DPA), pricing, costing and business-case tools, HR and company operations, internal policies and audits, CRM
exports and prospect lists, sales and meeting recordings, partner material (the partner programme is not on the
website yet), investor material, demo access details, other companies' documents, the internal product master sheet,
the old website texts (the site was relaunched in 2026). The FAQ, flyers and one-pagers in the website's download
folder are out of date and stay out until NDI updates them (an FAQ cleaned for customers can be added once NDI has
approved it).

Some catalog AI Employees are marked **"Demo Coming Soon"**: Clara's and Aida's prompts say never to promise a demo,
a date or a finished product for them.

1. ElevenLabs → Knowledge Base → **Google Drive** → connect → pick the files (PDF or Google Docs; Sheets and
   Slides are not supported by the Drive sync) → auto sync on.
2. **Attach** every synced document to **Clara and to Aida** (both, so Aida's drafts say the same as Clara), usage
   mode *auto* (RAG). RAG settings are already like CDA's: embedding `multilingual_e5_large_instruct`, 50,000
   characters, 20 chunks.
3. The web app adds **"NDI approved FAQ"** itself (answers staff approve on `/admin` → 📚 Knowledge, usage mode
   *prompt*). Don't edit or attach it by hand. It needs at least one other document on each agent first.

Rules learnt on CDA: never "crawl entire website"; a synced document must also be **attached** to the agent.

### Demo videos (`/demos`, kept up to date by itself)

```
YouTube channel ──(at most once an hour)──► <APP_URL>/demos ──► ElevenLabs URL document ──► Clara's answers
```

`src/lib/demoVideos.ts` reads NDI's YouTube channel (@NewDigitalIntelligence-j5c) with the **YouTube Data API**:
public data only, 2–3 of the free 10,000 daily quota units per read, kept for an hour so visitors never reach
YouTube. The page lists the newest video of each AI Employee (titles that start with a catalog code such as
`FO-01`) and the NDI company videos; client-specific and investor videos are left out. Every hour the app's
scheduler calls `/api/cron/demos`: when the list changed, it asks ElevenLabs to re-read the page
(`POST /v1/convai/knowledge-base/{id}/refresh`), so Clara knows a new video within about an hour. Clara never
calls YouTube during a conversation.

**Set up on 2 Oct 2026:** API key in project `ndi-front-assistant` → `YOUTUBE_API_KEY`; `/demos` lists 85 videos;
URL document **"NDI public demo videos (live page)"** `EEG5MebQkLEcbyy25NuF` (auto-sync, search index built; ElevenLabs
read all 85 links) attached to Clara and Aida → `ELEVENLABS_DEMOS_DOCUMENT_ID`.

**Set it up (after the app is live on Railway)**
1. **Google Cloud** (NDI's project `ndi-front-assistant`) → APIs & Services → **Enable** "YouTube Data API v3"
   → Credentials → **Create credentials → API key** → edit it: **API restrictions → YouTube Data API v3** only;
   application restrictions: none (Railway has no fixed IP). → Railway variable `YOUTUBE_API_KEY`.
2. Check `<APP_URL>/demos`: it lists the demos (without the key it only shows the channel link).
3. **ElevenLabs** → Knowledge Base → **Add URL** `<APP_URL>/demos`, auto-sync on (daily, as a backup) → attach it to
   **Clara and Aida** → copy the document ID → Railway variable `ELEVENLABS_DEMOS_DOCUMENT_ID`. (Claude can do this
   step with the API.)
4. From then on the hourly check refreshes it whenever the videos change. Railway logs show
   "demo videos: 200 {…"changed":true…}" when that happens.

---

## 3. Railway (hosting)

The web app runs on **Railway** from the public GitHub repository
`github.com/new-digital-intelligence-com/ndi-front-assistant` (branch `main`). Vercel is not used.

**Where it is:** Railway team **NDI** → project **POCs** (shared with the team's other PoCs, each its own service)
→ service **`[FO-01] ndi-front-assistant`**, environment `production`, region europe-west4 (Amsterdam), builder
Railpack. Created on 2 Oct 2026 with the Railway CLI, because the dashboard's repository list only shows the
organisation's repositories its GitHub App was given (the CLI's `railway add --repo` could link it anyway):

```bash
railway link --workspace NDI --project POCs --environment production --service "[FO-01] ndi-front-assistant"
railway deployment list          # status of the latest deployments
railway logs                     # the running app's logs
railway variables --set "KEY=value"   # one variable (redeploys)
```

> **Pushes do not deploy by themselves yet.** Railway built the first version because the repository is public, but
> GitHub only tells Railway about new pushes when Railway's GitHub App has access to the repository, and only an
> organisation owner can give it (GitHub → organisation settings → GitHub Apps → Railway → Configure → add
> `ndi-front-assistant`). Until then, deploy the latest commit after each push (or Railway dashboard → the service →
> Ctrl/Cmd+K → "Deploy latest commit"):
>
> ```bash
> railway api 'mutation($s: String!, $e: String!, $c: String) { serviceInstanceDeployV2(serviceId: $s, environmentId: $e, commitSha: $c) }' \
>   --raw-var s=3e214933-0335-4992-b922-69621d692587 --raw-var e=432764db-ebfc-44ea-8536-4143fdef2b04 --raw-var c="$(git rev-parse HEAD)"
> ```

**Set it up from zero**
1. **railway.com** → the POCs project → **New → GitHub repo** → pick the NDI repository (branch `main`), or with the
   CLI: `railway add --service "[FO-01] ndi-front-assistant" --repo new-digital-intelligence-com/ndi-front-assistant --branch main`.
2. The service → **Variables** → **Raw Editor** → paste the `KEY=value` lines of `.env.local` (empty values may
   stay empty until their channel is set up) → **Update Variables**.
3. The service → **Settings → Networking → Generate Domain**, and change the name to **`ndi-assistant`** →
   `https://ndi-assistant.up.railway.app`. It must equal `APP_URL`: Clara's tools and webhook point there. If
   another address is used, Clara's two tools and the post-call webhook must be changed too (ask Claude).
4. Railway builds with `npm run build` and starts with `npm start` (Next.js reads Railway's `PORT`). Every push to
   `main` deploys again; a change of variables redeploys by itself.
5. **Check:** `<APP_URL>/docs` opens without a password; `<APP_URL>/` asks for the site password; the deploy
   logs show `daily jobs: scheduled (once a day from 06:00 UTC)`.

**Daily jobs without a cron service:** `src/instrumentation.ts` starts `src/lib/dailyJobs.ts` when the server
starts (production only, with `CRON_SECRET`, unless `DAILY_JOBS=off`). About a minute after a start, and then every
30 minutes, it calls `/api/cron/daily` once per UTC day from 06:00. A restart the same day runs the jobs again,
which is harmless. Logs: "daily jobs: 200 {...}".

---

## 4. Supabase (database)

NDI uses the team's shared **"pocs"** Supabase project (the team's rule), in **its own schema `fo01_ndi`**, so its
tables never mix with other PoCs' schemas (CDA's database is not shared).

1. **SQL Editor** (pocs project) → New query → paste `supabase/schema.sql` → **Run**. It creates the schema `fo01_ndi`
   and its 25 tables, touches nothing else, and is safe to run again (tested twice on a copy with another PoC's
   `customers` table next to it).
2. **Project Settings → Data API** (older menus: **API**) **→ Exposed schemas** → add `fo01_ndi` → Save. Without this
   the API answers "The schema must be one of the following…". (If the team account cannot change it, ask the
   project admin.)
3. **Project Settings → API Keys → Create new secret key**, named `fo01-ndi`: NDI's own key in the shared project, so it
   can be revoked without touching the other PoCs → `SUPABASE_SERVICE_ROLE_KEY` (server only). The Project URL
   (Project Settings → Data API) → `SUPABASE_URL`; `SUPABASE_SCHEMA=fo01_ndi`. All three into `.env.local` and Railway.
   A secret key (`sb_secret_…`) is sent only as `apikey`; a legacy `service_role` JWT works too, until Supabase retires
   those keys at the end of 2026. The app sends the schema with every request (`src/lib/supabase.ts`).

Tables: customers, **customer_accounts** (website sign-ins), channels, link codes, conversations, notes, **customer_interests**, Aida rooms/events/moods, email
log, Gmail state, Instagram/Messenger threads, channel tokens, call lists and hand-over lines, knowledge, feedback, draft outcomes,
conversation moods. Row level security on, no policies, and only the `service_role` role has rights on the schema:
only the server reads it.

**Website accounts are NDI's own:** sign-ups go into `fo01_ndi.customer_accounts` (email + scrypt hash of the
password), not into Supabase **Auth**, whose user list the whole pocs project shares. Nothing to set up under
Authentication.

---

## 5. Telegram

**What the customer does:** opens NDI's bot in Telegram and types a message.

**How it works:** ElevenLabs connects to Telegram by itself (a native trigger). No web app code is involved.

**NDI's bot:** **@ndi2026bot** (https://t.me/ndi2026bot), linked to Clara on 2 Oct 2026.

**Set it up from zero**
1. In Telegram, message **@BotFather** → `/newbot` → a name (e.g. `NDI Assistant`) and a username ending in `bot`
   (e.g. `NDI_Assistant_Bot`) → copy the **token**.
2. ElevenLabs → Agents → **NDI Assistant – Clara** → **Channels** → **Telegram** → **Add trigger** →
   **Message Received** → new connection → paste the token → **Save**. Paste a token only once.
3. Put the username in `TELEGRAM_BOT` in `src/components/ChannelLinks.tsx` (the button appears), commit, push.
4. **Test:** send "What does NDI do?" to the bot → Clara answers in a few seconds.

**Good to know**
- Private chats: every message is answered. Groups: only messages that @mention the bot or reply to it.
- **Text only**: Clara does not see photos, files or voice notes (she asks the customer to type the details).
- Not answering? Open `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`: its `url` must point to `api.us.elevenlabs.io`.

---

## 6. Email

**What the customer does:** sends an email to **contact@new-digital-intelligence.com** and gets Clara's answer as a
normal reply in the same email thread.

```
1. Customer email arrives in Gmail
2. Google tells the web app at once (Gmail "watch" + Pub/Sub)        → /api/email/gmail-push
3. The web app skips robots (codes, alerts, newsletters, no-reply)   → no credits spent
4. It passes the email to Clara through the "NDI email" Custom Channel, marked [Email to NDI]
5. Clara's answer comes back                                         → /api/email/assistant-reply
6. The web app sends it in the customer's thread (auto)
   or saves it as a Gmail draft for staff (draft), and labels the email in Gmail
```

| Where | Value |
|---|---|
| Mailbox | **contact@new-digital-intelligence.com** (Google Workspace) |
| Google Cloud | NDI's **own** project **`ndi-front-assistant`**, owned by contact@ (not CDA's): Gmail API + Pub/Sub (billing linked), OAuth client "NDI Assistant" (**Desktop app**), consent screen **Internal**, scope `gmail.modify` |
| Pub/Sub | Topic `gmail-inbox-ndi` (`gmail-api-push@system.gserviceaccount.com` = Pub/Sub Publisher); subscription `gmail-inbox-ndi-push` → `<APP_URL>/api/email/gmail-push?token=<GMAIL_PUSH_SECRET>` |
| ElevenLabs | Clara → Channels → Custom Channel, connection **NDI email**, Reply Webhook URL `<APP_URL>/api/email/assistant-reply` |
| Auto or draft | `email_mode` (`auto` / `draft`), stored on the **Aida** agent |

**Set it up from zero**
1. The mailbox's address is in `SUPPORT_EMAIL` in `src/components/ChannelLinks.tsx` (the Email button).
2. **Google Cloud, signed in as contact@**: project `ndi-front-assistant` → billing linked → enable **Gmail API** and
   **Cloud Pub/Sub API** → Google Auth Platform: app `NDI Assistant`, audience **Internal**, scope `gmail.modify` →
   **Clients → Desktop app** → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   **Allow access once:** open Google's consent link for that client with scope `gmail.modify`
   (`access_type=offline`, `prompt=consent`, a `http://localhost:<port>` redirect), sign in as contact@, click
   **Allow**, and exchange the returned code for a **refresh token** → `GMAIL_REFRESH_TOKEN` (done on 2 Oct 2026 with
   a small local helper that catches the code; a token belongs to the client that asked for it).
3. **Pub/Sub** (project `ndi-front-assistant`) → create topic `gmail-inbox-ndi` → on the topic, add principal
   `gmail-api-push@system.gserviceaccount.com` with role **Pub/Sub Publisher** → create subscription
   `gmail-inbox-ndi-push`: type **Push**, endpoint `<APP_URL>/api/email/gmail-push?token=<GMAIL_PUSH_SECRET>`,
   expiration **never**, acknowledgement deadline **60 s**. `GMAIL_PUBSUB_TOPIC` =
   `projects/ndi-front-assistant/topics/gmail-inbox-ndi`.
4. **ElevenLabs** → Clara → Channels → **Custom Channel** → Add trigger → new connection `NDI email` →
   Reply Webhook URL `<APP_URL>/api/email/assistant-reply` → copy the **Inbound URL**, **Inbound Secret** and
   **Outbound Signing Secret** → `EMAIL_CHANNEL_INBOUND_URL`, `EMAIL_CHANNEL_INBOUND_SECRET`, `EMAIL_CHANNEL_SIGNING_SECRET`.
5. **Railway**: add the email variables (section 13).
6. **Start the watch**: the daily jobs start it within about a minute of a deploy after 06:00 UTC; or by hand:
   `GET <APP_URL>/api/email/gmail-watch` with header `Authorization: Bearer <GMAIL_PUSH_SECRET>`.
7. **Sending mailbox** for "Email me this conversation" and staff alerts: `gmail_sender` = the same mailbox,
   `gmail_app_password` = a Gmail **app password** of that account (needs 2-Step Verification).
8. **Test:** from another address, email "What does NDI do?" → a reply arrives in the same thread within ~30 s,
   and the email gets the green **Clara/Replied** label.

**Using it**
- **Labels in Gmail** (under "Clara"): **Replied** · **Draft ready** (open the email, check the draft, press Send) ·
  **Skipped** (a robot or newsletter) · **Failed** (answer it by hand) · **Upset customer**.
- **Switch auto / draft**: `/admin` → **Email** tab. It is read for every reply.

**Good to know**
- Each email is a separate conversation for Clara; earlier messages are quoted in the email itself.
- Clara gets up to 6,000 characters; she cannot open attachments. Mail older than 24 hours is never answered.
- If the mailbox password changes, Gmail access stops ("invalid_grant" in the logs): repeat step 2.

---

## 7. Instagram and Facebook Messenger

Both run in the web app (`src/lib/metaChat.ts`, settings in `src/lib/instagram.ts` and `src/lib/messenger.ts`),
exactly as in the CDA demo, through the same Meta developer app **"Customer Support"**.

### Shared with the CDA demo: switch per demo

**@new_digital_intelligence** (Instagram ID `17841430407573788`) and the Page **New Digital Intelligence** (Page ID
`1450409441479124`) are NDI's own accounts, and the CDA demo uses them too. One account can only be answered by one
assistant, so Meta's webhooks point at **one app at a time**:

| Webhook | CDA demo | NDI assistant |
|---|---|---|
| Instagram Callback URL | `https://cda-demo.vercel.app/api/instagram/webhook?token=<INSTAGRAM_WEBHOOK_SECRET>` | `<APP_URL>/api/instagram/webhook?token=<INSTAGRAM_WEBHOOK_SECRET>` |
| Messenger Callback URL | `https://cda-demo.vercel.app/api/messenger/webhook?token=<MESSENGER_WEBHOOK_SECRET>` | `<APP_URL>/api/messenger/webhook?token=<MESSENGER_WEBHOOK_SECRET>` |

NDI uses the **same tokens and the same webhook secrets (verify tokens) as CDA** (copied into `.env.local`), so a
switch only changes the address:

1. **developers.facebook.com** → app **Customer Support** → **Use cases** → "Manage messaging & content on
   Instagram" → **API setup with Instagram login** → **Configure webhooks** → Callback URL from the table, Verify
   token = the same secret → **Verify and save**. The `messages` subscription stays.
2. Same app → "Engage with customers on Messenger from Meta" → **Messenger API Settings** → **Configure webhooks**
   → Callback URL from the table, the same Verify token → **Verify and save**. The Page subscription stays.
3. **Test** with a DM from another account.

Good to know: each app has its own database, so a person who wrote to CDA's Ellie is new to Clara (and the
other way round). Both apps refresh the same Instagram token every 7 days and keep their own copy.

### Before the first switch to NDI

1. **ElevenLabs** → Clara → Channels → **Custom Channel** → Add trigger → new connection `NDI Instagram` →
   Reply Webhook URL `<APP_URL>/api/instagram/reply` → copy the 3 values → `INSTAGRAM_CHANNEL_INBOUND_URL`,
   `INSTAGRAM_CHANNEL_INBOUND_SECRET`, `INSTAGRAM_CHANNEL_SIGNING_SECRET`.
2. The same with connection `NDI Messenger` → `<APP_URL>/api/messenger/reply` → the 3 `MESSENGER_CHANNEL_*` values.
3. **Railway**: add them; the `INSTAGRAM_*` and `MESSENGER_*` tokens, IDs and webhook secrets are already in `.env.local`.

A person's messages stay in **one conversation for 10 minutes**. "Typing…" shows while Clara writes. Answers are
plain text (Instagram: up to 1,000 characters; Messenger: split into messages of up to 2,000); Clara cannot see
photos or files. The Meta app must stay **Published**. Don't put "CDA" in any Meta account or Page name.

---

## 8. Phone

**What the customer does:** calls NDI's number and talks to Clara. Clara also calls customers from the staff call list (section 12).

1. **Twilio** (NDI's account, the same one CDA's number is in) → buy a new number with Voice (and SMS), in the
   country NDI wants (a UK number needs a regulatory bundle).
2. **ElevenLabs** → Phone Numbers → **Import number** → Twilio → the number, Account SID and Auth Token →
   assign agent **NDI Assistant – Clara**. (The Twilio account is already known to ElevenLabs from CDA's number.)
3. Put the number in `PHONE_LINE` (`src/components/ChannelLinks.tsx`) and `DEMO_LINE`
   (`src/components/admin/CallListPanel.tsx`), commit, push.
4. **Twilio → Voice → Settings → Geo permissions**: switch on every country Clara should call, and the countries of the
   colleagues calls are handed over to.
5. **Hand-over to a colleague** (section 12): Railway variables `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (Twilio →
   Account → API keys & tokens). Nothing to set up in Twilio itself: the app moves the call and Twilio calls the app back
   on `/api/twilio/handover/*`.
6. **Test:** call the number → Clara answers with her English greeting.

---

## 9. Website

**What the customer does:** opens `<APP_URL>`, types the **site password**, and uses one of four tabs. The website
talks to Clara directly through ElevenLabs' SDK.

| Tab | What happens |
|---|---|
| 💬 **Chat** | Typed chat with Clara; the customer can attach photos or PDFs (3 per message, 10 MB each) |
| 🎙️ **Voice** | A spoken call with Clara in the browser, with a live transcript |
| 🧑‍💼 **Avatar** | A video call with Clara's face (below) |
| 📞 **Aida** | A live call with NDI staff: join with a code or open a room (section 11) |

**Voice and Avatar language:** an **English | Deutsch | Italiano | Français** switch above the start button sets the
language Clara starts in (`src/components/LanguagePicker.tsx`). During the call she follows the customer by herself.

Also on the page: **Your NDI account** (link channels with a code, section 10), buttons that open Email, Telegram,
Instagram, Messenger and the phone line (each appears once its value is filled in, `src/components/ChannelLinks.tsx`),
and **Email me this conversation**. The staff page `/admin` is not linked from here.

### Video avatar (Anam)

Anam only **draws Clara's face**; Clara on ElevenLabs still listens, thinks and speaks. For German, Italian or French
the web app tells Anam `conversationConfigOverride: { agent: { language } }`, and Anam passes it on to ElevenLabs.

1. **lab.anam.ai** → create the NDI avatar from a picture → copy its ID (and the **API key** if it is a new Anam
   account; the free plan allows one custom avatar per account) → `ANAM_AVATAR_ID` (and `ANAM_API_KEY`).
   `ANAM_MAX_SESSION_SECONDS=180`.
2. Clara's user input audio format is already **PCM 16000 Hz** (Anam needs it).
3. **Test:** Avatar tab → Start video call → ask a question.

Anam's **free plan** gives 30 minutes a month and **3-minute calls**, with a watermark.

### Hosted page and widget (no password)

ElevenLabs' own page: `https://elevenlabs.io/app/talk-to?agent_id=agent_0901m3y1xemxeg2s0tjk20fjfgbv` (voice and
text; a QR code can be made from this link). To add the chat bubble to any website:

```html
<elevenlabs-convai agent-id="agent_0901m3y1xemxeg2s0tjk20fjfgbv"></elevenlabs-convai>
<script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
```

> Anyone with this link can talk to Clara and use credits. Turning on authentication in Clara's **Security**
> settings stops the page, QR code and widget; test every channel after such a change.

### Intercom chat bubble (optional)

Needs **NDI's own Intercom workspace** (CDA's `CDA Demo` workspace stays with CDA). Same steps as in the CDA guide:
Intercom developer app → ElevenLabs Intercom integration → trigger **Intercom Conversation** on Clara → webhook
topics `conversation.user.created` and `conversation.user.replied`. Then set **`NEXT_PUBLIC_INTERCOM_APP_ID`** on
Railway (without it there is no bubble). An EU-hosted workspace needs `api_base` `https://api-iam.eu.intercom.io`
in `src/components/IntercomMessenger.tsx`.

---

## 10. Customer memory across channels

Clara recognises the same person on every channel and remembers what they asked. **She never asks anyone to
identify themselves**; someone she cannot place is simply helped.

```
Website: create account → "+ Add a channel" → NDI-4F2K9M → send it from Telegram, Instagram, Messenger or another email
Website: create account → "+ Add your phone number" → Clara knows them on calls in and out
Any conversation → customer_lookup(system__conversation_id) → known? greet by name, use the last 3 notes and their interests
Conversation ends → post-call webhook → one short note (max 700 characters) and their interests
```

- **Accounts**: NDI's own table `customer_accounts` (`src/lib/account.ts`): the email and an scrypt hash of the
  password, never the password. Open at once (no confirmation email); 5 wrong passwords lock that email for 15
  minutes. Signing up links and verifies that email. One code works once, 30 minutes
- **Interests**: Clara's analysis item `interest` records what the customer wants from NDI when they say it clearly:
  *"AI SDR – Acme GmbH (Head of Sales), outbound to DACH, wants a demo in November"* → `customer_interests` (one row
  per topic, the part before the dash; the newest description wins). `customer_lookup` returns them as `interests`
- **Anonymous people** are remembered per channel (same Telegram chat, same browser, same phone number); their
  notes and interests move to the account when they link. **Robots get no record**
- **Stored**: no messages. `customer_conversations` (conversation → customer), `customer_notes`, `customer_interests`.
  Full transcripts stay in ElevenLabs

| Channel | How the person is identified |
|---|---|
| Telegram | Chat id inside the conversation id: `…_tg_6486763839` (undocumented ending) |
| Email | The web app registers the conversation to the sender when it hands the email to Clara |
| Website | Registered when the session starts: signed-in account, else the `ndi_visitor` cookie |
| Instagram, Messenger | The web app registers the conversation to the sender (`instagram_threads` / `messenger_threads`) |
| Phone | The customer's own number (`metadata.phone_call.external_number`, calls in and out), or the number from the staff call list |
| Slack | Not wired up |

> **Never bind a tool parameter to a channel-specific dynamic variable, and never give an `integration__…`
> variable a placeholder.** Both took CDA's channels down on 17 Sep 2026 ("Missing required dynamic variables").
> Tools use only `system__conversation_id`; anything else is registered or read server-side.

---

## 11. Aida rooms

A live call between NDI staff and a customer: everyone can **talk or type**, the call is **transcribed live**, and
**Aida** drafts a reply to each customer message that **only staff see** (Approve & send / Edit / Decline).

| | Gets in with | Sees |
|---|---|---|
| **Staff** | `/admin` → Aida staff password → **Aida rooms** tab | Everything, including Aida's drafts |
| **Customer** | The **📞 Aida** tab on the site, or an invite link `/aida/join?code=…` (no password) | Talk, chat and transcript — **never** drafts |

- **LiveKit**: for now NDI uses **CDA's LiveKit project** (values copied from CDA; free "Build" plan, 5,000
  participant-minutes a month, shared). Rooms are named `aida-<random id>`, so the two apps never meet. A separate
  LiveKit project for NDI only needs the three `LIVEKIT_*` values changed
- Each browser transcribes its **own** microphone with Scribe; Aida runs in one staff browser
- **Aida agent**: `agent_0301m3y1xgv9ee8tr3qf8w110kbb` — Gemini 3.7 Flash, temperature 0, text only, no first
  message, 1-hour sessions, no tools; dynamic variable `email_mode` (the email switch, section 6). Give her the same
  knowledge documents as Clara
- Supabase: `aida_rooms`, `aida_events`, `aida_moods`

---

## 12. Admin page

`<APP_URL>/admin` — staff only, **Aida staff password** (the site password does not open it). Six tabs:

| Tab | What staff do |
|---|---|
| 📞 **Aida rooms** | Create, join, close rooms; read and email closed ones |
| 👥 **Customers** | Numbers, a searchable list, one customer's channels, activity and timeline; ✨ Ask Claude (summary, topics, AI Employees asked about, mood, open issues, next step) |
| 😊 **Mood** | How customers felt on every channel (7 / 30 days), and the unhappy conversations to follow up |
| 📲 **Call list** | Phone numbers, each with instructions for Clara; **Start calling** and she phones them one by one |
| 📚 **Knowledge** | Questions Clara could not answer and feedback on her answers; staff approve the right answer → "NDI approved FAQ" |
| ✉️ **Email** | Send automatically / Draft for staff, and the latest emails with what happened to each |

- **Claude insights** (Claude Haiku, `ANTHROPIC_MODEL`, only when a staff member clicks, nothing stored)
- **Customer mood**: ElevenLabs' sentiment for voice and website; Claude rates Custom Channel conversations (email,
  Instagram, Messenger). Upset (frustration ≥ 0.6, sentiment ≤ −0.5, or one message ≥ 0.7) or `needs_follow_up` →
  one email to **`STAFF_ALERT_EMAIL`** with a link to `<APP_URL>/admin`. Upset emails always become drafts,
  labelled **Clara/Upset customer**. Times are shown in Central European time (Europe/Zurich)
- **Call list**: Clara phones one number at a time from the number attached to her in ElevenLabs (section 8), up to
  3 tries, with a greeting written from the instructions: *"Hello Helmi, this is Clara, the virtual assistant from
  NDI. I'm calling about your demo request for the AI SDR. Have you got a moment?"*. Keep the page open while a list runs
- **Hand-over to a colleague** (`src/lib/handover.ts`): per number, staff may tick *Hand the call over to a colleague*
  and give a name, a phone number and *when* (optional). `customer_lookup` then returns `outbound_call.handover`, and
  when the moment comes Clara says she is connecting them and calls `transfer_to_human`:
  1. The app moves the customer's call off Clara (Twilio call update → `/api/twilio/handover/hold`): hold music in a
     Twilio conference `ndi-handover-<item>`, and Twilio's live transcription of both voices in the call's language.
  2. The colleague's phone rings from NDI's number (25 s). They hear who is waiting and Clara's summary, and press any
     key to join (`/accept`); a voicemail cannot press a key. Customer and colleague talk; Clara is gone.
  3. Every finished sentence arrives at `/transcript` (`handover_lines`); `/admin` opens the live view by itself:
     the conversation, Aida's suggestions (Aida runs in that browser while they talk), what Clara learnt and what NDI
     knows about the customer.
  4. No answer → the customer hears *"nobody from the NDI team can take the call right now; NDI will call you back"*
     in their language. When the customer's call ends (`/status`), Claude writes one note for the customer's memory
     and the list moves on. While a hand-over runs, the list waits.
  Costs: Twilio live transcription $0.027/min, conference $0.0018 per person per minute, the call to the colleague,
  and Aida's suggestions (ElevenLabs credits, as in Aida rooms)
- **Knowledge**: nothing reaches Clara without a staff member approving it (`src/lib/knowledge.ts`); the FAQ
  document is swapped in on Clara and Aida on their live branch (`ELEVENLABS_BRANCH_ID` if set, otherwise read from the agent)

---

## 13. Web app reference

| Item | Value |
|---|---|
| Repository | Public GitHub repository created by the user, branch `main` → Railway deploys automatically |
| Stack | Next.js 16 (read `node_modules/next/dist/docs/`), React 19, Tailwind 4, `@elevenlabs/react`, LiveKit, Anam SDK |
| Run | `npm install` · `npm run dev` · `npm run build` (before `npx tsc --noEmit`) · `npm run lint` |
| Commits | Author **HelmiDev03**; pushed straight to `main` |

**Who can open what** (`src/proxy.ts`): everything needs the **site password** except `/login`, `/docs`, `/admin`, `/demos` and
`/aida/join` (they ask for their own proof, or show only public data) and the routes that check their own secret:

| Routes | Called by | Protected by |
|---|---|---|
| `/api/agent/customer-lookup`, `/customer-link`, `/handover` | Clara's tools | `x-ndi-agent-secret` |
| `/api/twilio/handover/*` (`hold`, `accept`, `status`, `transcript`) | Twilio, during a hand-over | `?key=` made from `TWILIO_AUTH_TOKEN` and the call |
| `/api/agent/post-call` | ElevenLabs post-call webhook | HMAC signature (`ELEVENLABS_WEBHOOK_SECRET`) |
| `/api/email/gmail-push` | Google Pub/Sub | `?token=` `GMAIL_PUSH_SECRET` |
| `/api/email/assistant-reply` | ElevenLabs (email replies) | HMAC signature (`EMAIL_CHANNEL_SIGNING_SECRET`) |
| `/api/cron/daily` | The app's own daily jobs (`src/lib/dailyJobs.ts`) | `Bearer CRON_SECRET` |
| `/api/cron/demos` | The app's own scheduler, hourly: refreshes the demo videos document when YouTube changed | `Bearer CRON_SECRET` |
| `/api/email/gmail-watch` | By hand, to restart the Gmail watch | `Bearer CRON_SECRET` or the push secret |
| `/api/instagram/webhook`, `/api/messenger/webhook` | Meta | `?token=` `INSTAGRAM_WEBHOOK_SECRET` / `MESSENGER_WEBHOOK_SECRET` (+ Meta signature if `META_APP_SECRET` is set) |
| `/api/instagram/reply`, `/api/messenger/reply` | ElevenLabs (replies) | HMAC signature (`INSTAGRAM_CHANNEL_SIGNING_SECRET` / `MESSENGER_CHANNEL_SIGNING_SECRET`) |
| `/api/email/mode`, `/api/admin/*` | `/admin` | Aida staff token |
| `/api/aida/*` | Aida rooms | Staff token, room ticket, or nothing for customers (each route checks) |
| `/docs` | Anyone | Nothing: public page, no secrets |
| `/demos` | Anyone, and ElevenLabs (Clara's knowledge) | Nothing: public YouTube titles and links only |
| `/api/elevenlabs/*`, `/api/anam/session`, `/api/account`, `/api/transcript/email` | Customer site | Site password |

### Environment variables (`.env.local` and Railway → Variables)

| Name | Purpose |
|---|---|
| `APP_URL` | The app's address, `https://ndi-assistant.up.railway.app` (falls back to Railway's `RAILWAY_PUBLIC_DOMAIN`) |
| `SITE_PASSWORD` | Customer site password (new for NDI) |
| `ELEVENLABS_API_KEY` | Same ElevenLabs account as CDA (copied) |
| `ELEVENLABS_AGENT_ID`, `ELEVENLABS_BRANCH_ID` (optional) | Clara `agent_0901m3y1xemxeg2s0tjk20fjfgbv` |
| `AGENT_TOOL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET` | Clara's tools (= workspace secret `NDI_AGENT_TOOL_SECRET`), post-call webhook signing secret |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SCHEMA` | The team's shared "pocs" Supabase project, schema `fo01_ndi` (section 4) |
| `ANAM_API_KEY`, `ANAM_AVATAR_ID`, `ANAM_MAX_SESSION_SECONDS` | Avatar (the key copied from CDA; the NDI avatar ID to add) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Aida rooms (CDA's LiveKit project for now, copied) |
| `AIDA_AGENT_ID`, `AIDA_STAFF_PASSWORD` | Aida `agent_0301m3y1xgv9ee8tr3qf8w110kbb`, staff password (new for NDI) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude Haiku for insights and moods (copied) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | NDI's Twilio account, for handing call-list calls over to a colleague (section 12) |
| `gmail_sender`, `gmail_app_password`, `STAFF_ALERT_EMAIL` | Mailbox that sends conversation emails and alerts; who gets the alerts |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Gmail API: NDI's own OAuth client (project `ndi-front-assistant`); refresh token for contact@ |
| `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_SECRET` | `projects/ndi-front-assistant/topics/gmail-inbox-ndi`; the secret in the push URL |
| `CRON_SECRET`, `DAILY_JOBS` (optional, `off`) | The daily jobs |
| `EMAIL_CHANNEL_INBOUND_URL`, `EMAIL_CHANNEL_INBOUND_SECRET`, `EMAIL_CHANNEL_SIGNING_SECRET` | "NDI email" Custom Channel |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `INSTAGRAM_WEBHOOK_SECRET` | Instagram (copied from CDA: the same account) |
| `INSTAGRAM_CHANNEL_INBOUND_URL`, `INSTAGRAM_CHANNEL_INBOUND_SECRET`, `INSTAGRAM_CHANNEL_SIGNING_SECRET` | "NDI Instagram" Custom Channel |
| `MESSENGER_PAGE_TOKEN`, `MESSENGER_PAGE_ID`, `MESSENGER_WEBHOOK_SECRET` | Messenger (copied from CDA: the same Page) |
| `MESSENGER_CHANNEL_INBOUND_URL`, `MESSENGER_CHANNEL_INBOUND_SECRET`, `MESSENGER_CHANNEL_SIGNING_SECRET` | "NDI Messenger" Custom Channel |
| `META_APP_SECRET` (optional) | Also check Meta's signature on Instagram and Messenger webhooks |
| `NEXT_PUBLIC_INTERCOM_APP_ID` (optional) | NDI's Intercom workspace; without it there is no bubble |
| `YOUTUBE_API_KEY` | YouTube Data API key for `/demos` (public data only; restricted to YouTube Data API v3) |
| `ELEVENLABS_DEMOS_DOCUMENT_ID` | The ElevenLabs URL document that reads `<APP_URL>/demos`; refreshed when the videos change |

---

## 14. Credentials

| Credential | Lives in | Note |
|---|---|---|
| All `.env` values above | Railway + `.env.local` | Never committed (public repository) |
| Telegram bot token | ElevenLabs Telegram connection | From @BotFather |
| Instagram token | Supabase `channel_tokens` (refreshed every 7 days); starting token in `INSTAGRAM_ACCESS_TOKEN` | Shared with the CDA demo |
| Google Drive access | ElevenLabs Google Drive integration | Read-only, picked files |
| Twilio | ElevenLabs phone number import, and Railway (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) for hand-overs | NDI's Twilio account |

Values copied from CDA's `.env.local` on 2 Oct 2026: ElevenLabs, Anam key, LiveKit, Anthropic, Google OAuth client,
Instagram and Messenger (tokens, IDs, webhook secrets). New for NDI: site password, staff password, tool secret,
cron secret, Gmail push secret, post-call webhook secret.

---

## 15. Maintenance

| When | What |
|---|---|
| Daily, automatic | The app's daily jobs renew the Gmail watch and refresh the Instagram token (every 7 days) |
| ~17th each month | ElevenLabs credits reset (shared with the CDA demo) |
| Before a demo with Instagram/Messenger | Point the 2 Meta Callback URLs at the right app (section 7) |
| After 20 Dec 2026, if Messenger stops | Generate the Page token again in the Meta app and update `MESSENGER_PAGE_TOKEN` (in both apps) |
| When NDI content changes | Update the documents in Google Drive (auto sync) |

---

## 16. Not built yet

| What | Status |
|---|---|
| **Slack** | Not started (CDA's steps: native ElevenLabs integration with an own Slack app; needs a workspace under Slack's free 10-app limit) |
| **WhatsApp** | Not started |

---

## 17. Troubleshooting

| Problem | Fix |
|---|---|
| A channel breaks with "Missing required dynamic variables", or Telegram stops answering | A tool bound to a channel variable, or an `integration__` placeholder: remove it (section 10) |
| Dashboard test works, channel doesn't | The change is still a draft → **Publish** |
| Documents synced but unknown to Clara | Attach them to the agent (and to Aida) and publish |
| "Approve and teach Clara" fails with "has only 0 other documents" | Attach the Google Drive documents to Clara and Aida first |
| Clara's tools fail / no memory | Is `APP_URL` the real Railway address? Are `AGENT_TOOL_SECRET` and the workspace secret `NDI_AGENT_TOOL_SECRET` the same? Railway logs for `customer-lookup` |
| Email: no reply and no Clara label | Open `/api/email/gmail-watch` with the push secret, then the Railway logs for `gmail-push` |
| Email labelled **Failed** | Reason on `/admin` → Email. "invalid_grant" → run the Gmail consent again |
| Instagram or Messenger: no answer | Do Meta's Callback URLs point at this app (section 7)? Meta app **Published**? Custom Channel values on Railway? Railway logs for `instagram` / `messenger` |
| Daily jobs never run | Railway logs: "daily jobs: scheduled" at start? `CRON_SECRET` set? `DAILY_JOBS` not `off`? |
| Avatar call won't start | Browser console (F12) and Railway logs; check `ANAM_*`, input format PCM 16000 Hz, 3-minute limit |
