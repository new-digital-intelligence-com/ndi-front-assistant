-- Customer memory shared by every channel (Telegram, Instagram, Messenger, email, phone, website),
-- Aida rooms, and the email channel's record of what Clara did with each email.
-- Run this once in the Supabase project: SQL Editor -> New query -> paste -> Run.
--
-- Everything goes into its own schema, fo01_ndi, because the Supabase project is shared with other
-- PoCs. After the first run, add fo01_ndi to Project Settings -> Data API -> Exposed schemas, and set
-- SUPABASE_SCHEMA=fo01_ndi for the app (src/lib/supabase.ts). To use another name, replace fo01_ndi
-- everywhere in this file.
--
-- A customer is a person. Every way of reaching them - a Telegram chat, an Instagram sender id, an
-- email address, a website cookie - is a row in customer_channels, so one person can have several
-- of the same kind (two email addresses, two Telegram accounts) with no special case.
--
-- Channels are linked either automatically (the id is in the conversation id) or by the person
-- themselves: they sign in on the website, get a short code, and send it from the channel.

-- Safe to run again at any time: every statement only creates what is missing and never drops or
-- changes existing data. It touches nothing outside fo01_ndi (gen_random_uuid() is built into
-- Postgres, so no extension is needed).

create schema if not exists fo01_ndi;
set search_path to fo01_ndi;

create table if not exists customers (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,                 -- the Supabase Auth user, when they have signed up
  name         text,
  created_at   timestamptz not null default now()
);

create table if not exists customer_channels (
  channel     text not null,                -- telegram | instagram | email | website | slack
  channel_key text not null,                -- chat id, sender id, email address, cookie, ...
  customer_id uuid not null references customers (id) on delete cascade,
  verified    boolean not null default false, -- true when linked with a code or a signed-in session
  created_at  timestamptz not null default now(),
  primary key (channel, channel_key)
);

create index if not exists customer_channels_customer_idx on customer_channels (customer_id);

-- Short codes a signed-in person sends from a channel to prove it is theirs.
create table if not exists link_codes (
  code         text primary key,
  customer_id  uuid not null references customers (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_channel text,
  used_key     text
);

create index if not exists link_codes_customer_idx on link_codes (customer_id);

-- Which customer a conversation belongs to, so the post-call webhook knows where to file its note.
create table if not exists customer_conversations (
  conversation_id text primary key,
  customer_id     uuid not null references customers (id) on delete cascade,
  channel         text,
  created_at      timestamptz not null default now()
);

-- The memory itself: one short line per conversation.
create table if not exists customer_notes (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references customers (id) on delete cascade,
  channel     text,
  summary     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists customer_notes_recent_idx on customer_notes (customer_id, created_at desc);

-- Row level security on with no policies: only the service role key (server side) can read or
-- write. The publishable key cannot see anything, which is what we want for customer data.
alter table customers              enable row level security;
alter table customer_channels      enable row level security;
alter table link_codes             enable row level security;
alter table customer_conversations enable row level security;
alter table customer_notes         enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Aida: live rooms where NDI staff and a customer talk, with Aida drafting replies that only
-- the employees see. Voice and chat travel through LiveKit; these tables keep the record.
-- ---------------------------------------------------------------------------------------------

create table if not exists aida_rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,        -- what people type to join, e.g. 4F2K9M
  title           text,
  created_by_role text not null,               -- employee | customer
  created_by_name text,
  status          text not null default 'open', -- open | closed
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  closed_at       timestamptz
);

create index if not exists aida_rooms_open_idx on aida_rooms (status, created_at desc);

-- The customer in the room, when they joined signed in to their NDI account: Aida then gets what we
-- remember about them, and the call is added to their memory when the room is closed.
alter table aida_rooms add column if not exists customer_id uuid references customers (id) on delete set null;

-- Everything said, typed, suggested and decided in a room, in order. The author comes from the
-- signed room ticket on the server, never from what the browser claims.
create table if not exists aida_events (
  id              bigint generated always as identity primary key,
  room_id         uuid not null references aida_rooms (id) on delete cascade,
  kind            text not null,               -- speech | chat | suggestion | approved | declined
  author_identity text not null,
  author_name     text,
  author_role     text not null,               -- employee | customer
  text            text,
  ref             text,                        -- the suggestion an approval or decline belongs to
  created_at      timestamptz not null default now()
);

create index if not exists aida_events_room_idx on aida_events (room_id, id);

alter table aida_rooms  enable row level security;
alter table aida_events enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Email: mail to the NDI mailbox arrives through Gmail push, Clara answers through a Custom
-- Channel, and the web app sends her reply or leaves it as a Gmail draft (src/lib/emailInbox.ts).
-- ---------------------------------------------------------------------------------------------

-- One row per email. Inserting it is what stops a repeated notification from answering twice.
-- Who wrote and the subject only; the text of the email stays in Gmail.
create table if not exists email_messages (
  gmail_id          text primary key,             -- Gmail's message id
  thread_id         text not null,
  from_email        text,
  from_name         text,
  reply_to          text,
  subject           text,
  message_id        text,                         -- RFC 822 Message-ID, for In-Reply-To
  references_header text,
  status            text not null default 'new',  -- new | waiting | replying | sent | draft | skipped | failed
  reason            text,                         -- why it was skipped or failed
  conversation_id   text unique,                  -- Clara's conversation for this email
  mode              text,                         -- auto | draft, as it was when the reply came back
  received_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists email_messages_recent_idx on email_messages (created_at desc);
create index if not exists email_messages_sender_idx on email_messages (from_email, created_at desc);

-- Where Gmail push has got to: the mailbox history id already handled. A single row.
create table if not exists gmail_state (
  id               int primary key default 1 check (id = 1),
  history_id       bigint not null,
  watch_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);

alter table email_messages enable row level security;
alter table gmail_state    enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Messenger: one row per person writing to the Facebook Page (src/lib/messenger.ts). Which Clara
-- conversation they are in (continued for 10 minutes) and the last answer sent, so a repeated
-- delivery never sends twice. No message text.
-- ---------------------------------------------------------------------------------------------

create table if not exists messenger_threads (
  psid            text primary key,              -- the person's Page-scoped id
  conversation_id text,
  last_reply      text,
  updated_at      timestamptz not null default now()
);

create index if not exists messenger_threads_conversation_idx on messenger_threads (conversation_id);

alter table messenger_threads enable row level security;

-- Instagram, the same way as Messenger (psid holds the person's Instagram-scoped id).
create table if not exists instagram_threads (
  psid            text primary key,
  conversation_id text,
  last_reply      text,
  updated_at      timestamptz not null default now()
);

create index if not exists instagram_threads_conversation_idx on instagram_threads (conversation_id);

alter table instagram_threads enable row level security;

-- Tokens the web app renews itself: the Instagram token (60 days) is refreshed every 7 days by the
-- daily cron. Only the service role key can read this table.
create table if not exists channel_tokens (
  channel      text primary key,               -- instagram
  token        text not null,
  refreshed_at timestamptz not null default now(),
  expires_at   timestamptz
);

alter table channel_tokens enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Call lists: staff enter phone numbers with instructions on /admin, and Clara phones them one by
-- one from the Twilio number, up to 3 tries each (src/lib/outboundCalls.ts). current_item is the
-- call in progress; claiming it with a conditional update is what keeps it to one call at a time.
-- ---------------------------------------------------------------------------------------------

create table if not exists call_lists (
  id           uuid primary key default gen_random_uuid(),
  title        text,
  created_by   text,
  status       text not null default 'running',   -- running | stopped | done
  current_item uuid,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create table if not exists call_list_items (
  id              uuid primary key default gen_random_uuid(),
  list_id         uuid not null references call_lists (id) on delete cascade,
  position        int not null,
  phone           text not null,                   -- +<country code>…, as dialled
  name            text,
  instructions    text not null default '',        -- for Clara, never read out
  status          text not null default 'waiting', -- waiting | calling | reached | failed | stopped
  attempts        int not null default 0,
  next_attempt_at timestamptz,
  conversation_id text,                            -- the latest attempt's ElevenLabs conversation
  last_outcome    text,                            -- e.g. "no answer", "busy", "voicemail"
  summary         text,                            -- ElevenLabs' summary once reached
  started_at      timestamptz,
  finished_at     timestamptz
);

create index if not exists call_list_items_list_idx on call_list_items (list_id, position);
create index if not exists call_list_items_conversation_idx on call_list_items (conversation_id);

alter table call_lists      enable row level security;
alter table call_list_items enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Knowledge gaps: questions Clara could not answer (ElevenLabs' post-call data collection item
-- "unanswered_question", on every channel), and the answers NDI staff approve for them on /admin.
-- Approved answers are published to Clara's knowledge as one document, "NDI approved FAQ"
-- (src/lib/knowledge.ts). Nothing reaches Clara without a staff member approving it.
-- ---------------------------------------------------------------------------------------------

create table if not exists knowledge_gaps (
  id              bigint generated always as identity primary key,
  conversation_id text,
  channel         text,
  question        text not null,
  status          text not null default 'open',   -- open | answered | dismissed
  faq_id          bigint,                          -- the approved answer that covers it
  created_at      timestamptz not null default now()
);

-- A repeated webhook for the same conversation stores its questions once.
create unique index if not exists knowledge_gaps_once_idx on knowledge_gaps (conversation_id, question);
create index if not exists knowledge_gaps_status_idx on knowledge_gaps (status, created_at desc);

create table if not exists knowledge_faq (
  id          bigint generated always as identity primary key,
  question    text not null,
  answer      text not null,
  approved_by text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The document as last published to ElevenLabs. A single row.
create table if not exists knowledge_publish (
  id           int primary key default 1 check (id = 1),
  document_id  text,
  entries      int not null default 0,
  published_at timestamptz
);

alter table knowledge_gaps    enable row level security;
alter table knowledge_faq     enable row level security;
alter table knowledge_publish enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Feedback: what customers think of Clara's answers, and where staff corrected a draft. Negative
-- feedback and real corrections wait on /admin (📚 Knowledge → Feedback) for staff to turn into an
-- approved answer; every rating counts towards the weekly 👍 / 👎 score (src/lib/feedback.ts).
-- ---------------------------------------------------------------------------------------------

create table if not exists knowledge_feedback (
  id               bigint generated always as identity primary key,
  ref              text unique,                 -- where it came from, so it is stored once:
                                                -- chat:<conversation>:<message>, said:<conversation>,
                                                -- aida:<room>:<draft>, email:<gmail id>
  kind             text not null,               -- feedback | correction (a fact changed) | style (reworded only)
  source           text not null,               -- chat (👎 button) | said (in the conversation) | aida | email
  channel          text,
  conversation_id  text,
  question         text,                        -- what the customer asked
  original_answer  text,                        -- what Clara or Aida answered
  comment          text,                        -- feedback: what the customer said about it
  corrected_answer text,                        -- correction: what staff sent instead
  status           text not null default 'open', -- open | answered | dismissed
  faq_id           bigint,
  created_at       timestamptz not null default now()
);

create index if not exists knowledge_feedback_status_idx on knowledge_feedback (status, created_at desc);

-- Every 👍 / 👎, from the chat buttons and from what customers say (one per answer or conversation).
create table if not exists feedback_ratings (
  id              bigint generated always as identity primary key,
  ref             text unique,
  conversation_id text,
  channel         text,
  rating          text not null,                -- like | dislike
  source          text not null,                -- button | said
  created_at      timestamptz not null default now()
);

create index if not exists feedback_ratings_recent_idx on feedback_ratings (created_at desc);

-- Email draft mode: Clara's draft is kept so that what staff finally send can be compared with it.
alter table email_messages add column if not exists draft_id         text;
alter table email_messages add column if not exists assistant_reply  text;
alter table email_messages add column if not exists reply_checked_at timestamptz;

alter table knowledge_feedback enable row level security;
alter table feedback_ratings   enable row level security;

-- What staff did with each draft Clara (email draft mode) or Aida (rooms) wrote: sent unchanged,
-- polished (style only), corrected (a fact changed), declined / discarded. Only the outcome, no
-- text: it is the "right first time" score on /admin → 📚 Knowledge.
create table if not exists draft_outcomes (
  id         bigint generated always as identity primary key,
  ref        text unique,                       -- email:<gmail id> or aida:<room>:<draft>
  source     text not null,                     -- email | aida
  outcome    text not null,                     -- unchanged | polished | corrected | declined | discarded
  created_at timestamptz not null default now()
);

create index if not exists draft_outcomes_recent_idx on draft_outcomes (created_at desc);

alter table draft_outcomes enable row level security;

-- What a customer told Clara they want from NDI: the AI Employee or topic, their company and role,
-- numbers and timing, from the post-call analysis item "interest". customer_lookup gives them back to
-- Clara on every channel, so she never asks twice. One row per topic: the newest description wins.
create table if not exists customer_interests (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references customers (id) on delete cascade,
  topic       text not null,                   -- e.g. "ai sdr": the part before the dash, lower case
  description text not null,                   -- e.g. "AI SDR – Acme GmbH (Head of Sales), wants a demo in November"
  updated_at  timestamptz not null default now()
);

create unique index if not exists customer_interests_once_idx on customer_interests (customer_id, topic);

alter table customer_interests enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Customer mood (sentiment). ElevenLabs scores every conversation after it ends: a label, a
-- sentiment score from -1 (very negative) to +1, and a frustration score from 0 to 1, overall and
-- for each customer message. The post-call webhook keeps them here for /admin → 😊 Mood; the
-- "Import" button and the daily cron fill in any the webhook missed. `turns` holds the scores of
-- the customer's messages in order (with a short excerpt), so the page can show where the mood
-- dropped. Staff see it on /admin only.
create table if not exists conversation_moods (
  conversation_id   text primary key,
  customer_id       uuid references customers (id) on delete set null,
  channel           text,                       -- telegram | email | phone | website | …, null if unknown
  label             text not null,              -- positive | neutral | negative
  score             real not null,              -- overall sentiment, -1 … +1
  frustration       real not null,              -- overall frustration, 0 … 1
  min_score         real,                       -- lowest customer message
  max_frustration   real,                       -- most frustrated customer message
  turns             jsonb not null default '[]',-- [{ at, excerpt, score, frustration }] customer messages
  low_point         text,                       -- excerpt of the message where the mood was lowest
  title             text,                       -- ElevenLabs' short title for the conversation
  summary           text,
  follow_up         boolean not null default false, -- Clara promised an NDI follow-up or the customer asked for a person
  started_at        timestamptz not null,
  alerted_at        timestamptz,                -- when staff were emailed about it
  handled_at        timestamptz,                -- when staff marked it followed up
  handled_by        text,
  created_at        timestamptz not null default now()
);

create index if not exists conversation_moods_recent_idx on conversation_moods (started_at desc);
create index if not exists conversation_moods_customer_idx on conversation_moods (customer_id, started_at desc);

alter table conversation_moods enable row level security;

-- Email: the mood of the incoming email, checked by Claude before Clara sees it. An upset email is
-- never answered automatically: it becomes a Gmail draft for staff, labelled "Clara/Upset customer".
alter table email_messages add column if not exists mood_label       text;  -- positive | neutral | negative
alter table email_messages add column if not exists mood_frustration real;
alter table email_messages add column if not exists mood_reason      text;

-- Aida rooms: the mood of each customer line, checked live by Claude for the staff member hosting
-- Aida. Staff only, never shown to the customer.
create table if not exists aida_moods (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references aida_rooms (id) on delete cascade,
  line_id     text not null,
  excerpt     text,
  label       text not null,
  score       real not null,
  frustration real not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists aida_moods_line_idx on aida_moods (room_id, line_id);

alter table aida_moods enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Access. Only the server's service role key reaches this schema (through the Data API); the
-- anon and authenticated roles get nothing here, and row level security is on everywhere with no
-- policies. Then the Data API is told about the new tables at once.
-- ---------------------------------------------------------------------------------------------

grant usage on schema fo01_ndi to service_role;
grant all on all tables in schema fo01_ndi to service_role;
grant all on all sequences in schema fo01_ndi to service_role;
alter default privileges in schema fo01_ndi grant all on tables to service_role;
alter default privileges in schema fo01_ndi grant all on sequences to service_role;

notify pgrst, 'reload schema';
