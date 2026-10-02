"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import {
  Bot,
  CalendarCheck,
  Euro,
  FileText,
  Headset,
  ImageIcon,
  Mic,
  MicOff,
  Paperclip,
  PhoneOff,
  Plus,
  SendHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AidaJoin } from "./aida/AidaJoin";
import { AnswerFeedback } from "./AnswerFeedback";
import { AvatarPanel } from "./AvatarPanel";
import { EmailTranscriptForm, postEmail } from "./EmailTranscriptForm";
import { LanguagePicker } from "./LanguagePicker";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import { VoiceOrb } from "./VoiceOrb";
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MESSAGE,
  type AssistantMode,
  type Attachment,
  type CallLanguage,
  type ChatMessage,
} from "./types";

const SUGGESTIONS = [
  { icon: Bot, text: "What is an AI Employee?" },
  { icon: Euro, text: "How does NDI's pricing work?" },
  { icon: Headset, text: "Which AI Employees help with customer service?" },
  { icon: CalendarCheck, text: "I'd like to book a demo." },
];

/** Told to Clara when a website chat connects (an ElevenLabs contextual update: she reads it, it gets no reply). */
const WEBSITE_CHAT_NOTE =
  "This conversation is the typed chat on NDI's website: the customer reads your answers on screen. It is a written " +
  "channel, so give links in full, for example a demo video's YouTube link, and never offer to email them instead.";

/** Messages and the live transcript sit in a column that stays easy to read on a wide screen. */
const COLUMN = "mx-auto w-full max-w-3xl 2xl:max-w-4xl";

type PendingMessage = { text: string; files: File[] };

type AssistantProps = {
  /** Chat, voice, avatar or Aida: the page the customer is on (src/components/site/modes.ts). */
  mode: AssistantMode;
  /** Language of the next voice or avatar call; kept by the site layout for both. */
  callLanguage: CallLanguage;
  onCallLanguageChange: (language: CallLanguage) => void;
};

/**
 * Clara on the website. The site layout gives each way of talking its own address and mounts this
 * once per way (keyed by it), so leaving one ends its conversation: the provider ends the session.
 */
export default function AssistantApp(props: AssistantProps) {
  return (
    <ConversationProvider>
      <Assistant {...props} />
    </ConversationProvider>
  );
}

function Assistant({ mode, callLanguage, onCallLanguageChange }: AssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  /** The ElevenLabs conversation on screen, so its transcript can be emailed. */
  const [conversationId, setConversationId] = useState<string | null>(null);

  const sessionKindRef = useRef<AssistantMode | null>(null);
  const pendingRef = useRef<PendingMessage | null>(null);
  const skipGreetingRef = useRef(false);
  /** The conversation box on screen (chat or voice transcript); new messages scroll it, not the page. */
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addMessage = useCallback((role: ChatMessage["role"], text: string, attachments?: Attachment[]) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, text, attachments }]);
  }, []);

  // On the website Clara is one agent for chat, voice and the avatar, and cannot tell a typed chat from a call by
  // herself. The chat tells her as soon as it connects, so she gives links in full here (her prompt keeps them
  // out of spoken answers).
  const conversationRef = useRef<{ sendContextualUpdate: (text: string) => void } | null>(null);

  const conversation = useConversation({
    onConnect: () => {
      if (sessionKindRef.current === "chat") conversationRef.current?.sendContextualUpdate(WEBSITE_CHAT_NOTE);
    },
    onMessage: ({ message, role }) => {
      // In chat mode we render the user's own message immediately, so skip the echo.
      if (role === "user" && sessionKindRef.current === "chat") return;
      if (role === "agent" && skipGreetingRef.current) {
        // The first message was triggered by the user typing: send it once the greeting has arrived.
        skipGreetingRef.current = false;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) void sendNow(pending);
        return;
      }
      addMessage(role, message);
      if (role === "agent") setAwaitingReply(false);
    },
    onError: (message) => {
      setError(message || "Something went wrong. Please try again.");
      setAwaitingReply(false);
    },
    onDisconnect: () => {
      sessionKindRef.current = null;
      skipGreetingRef.current = false;
      setAwaitingReply(false);
    },
  });

  const { status, isSpeaking, isMuted, setMuted } = conversation;
  const connected = status === "connected";
  const busy = status === "connecting";

  useEffect(() => {
    conversationRef.current = conversation;
  });

  // Only once there is a conversation: the welcome screen stays at its top.
  useEffect(() => {
    const box = scrollBoxRef.current;
    if (box && (messages.length > 0 || awaitingReply)) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages, awaitingReply]);

  // Fallback: if the agent sends no greeting, still deliver the first message shortly after connecting.
  useEffect(() => {
    if (!connected || !skipGreetingRef.current) return;
    const timer = setTimeout(() => {
      if (!skipGreetingRef.current) return;
      skipGreetingRef.current = false;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void sendNow(pending);
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when the connection state changes
  }, [connected]);

  async function sendNow({ text, files: toSend }: PendingMessage) {
    const attachments: Attachment[] = toSend.map((file) => ({
      name: file.name,
      type: file.type,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    addMessage("user", text, attachments);
    setAwaitingReply(true);
    try {
      if (toSend.length > 0) {
        const fileIds: string[] = [];
        for (const file of toSend) {
          const { fileId } = await conversation.uploadFile(file);
          fileIds.push(fileId);
        }
        conversation.sendMultimodalMessage({ text: text || undefined, fileIds });
      } else {
        conversation.sendUserMessage(text);
      }
    } catch (err) {
      console.error(err);
      setError("Your message could not be sent. Please try again.");
      setAwaitingReply(false);
    }
  }

  async function startChatSession(withPending: PendingMessage | null) {
    setError(null);
    const response = await fetch("/api/elevenlabs/signed-url");
    if (!response.ok) throw new Error("Could not start a chat session.");
    const { signedUrl, conversationId: id } = (await response.json()) as {
      signedUrl: string;
      conversationId?: string | null;
    };
    setConversationId(id ?? null);
    sessionKindRef.current = "chat";
    pendingRef.current = withPending;
    skipGreetingRef.current = withPending !== null;
    if (withPending === null) setMessages([]);
    conversation.startSession({
      signedUrl,
      textOnly: true,
      overrides: { conversation: { textOnly: true } },
    });
  }

  async function startVoiceSession() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setError("Please allow microphone access to talk with Clara.");
      return;
    }
    const response = await fetch("/api/elevenlabs/conversation-token");
    if (!response.ok) {
      setError("Could not start a voice session. Please try again.");
      return;
    }
    const { conversationToken, conversationId: id } = (await response.json()) as {
      conversationToken: string;
      conversationId?: string | null;
    };
    setConversationId(id ?? null);
    sessionKindRef.current = "voice";
    setMessages([]);
    // German, Italian and French use Clara's language presets in ElevenLabs (a greeting in that
    // language, the multilingual voice model, the same voice). English needs no override.
    conversation.startSession({
      conversationToken,
      connectionType: "webrtc",
      ...(callLanguage !== "en" ? { overrides: { agent: { language: callLanguage } } } : {}),
    });
  }

  function endSession() {
    if (status !== "disconnected") conversation.endSession();
  }

  /** Ends the conversation first, so ElevenLabs' transcript (what we email) has every message. */
  async function emailTranscript(email: string) {
    if (!conversationId) throw new Error("There is no conversation to send yet.");
    if (status !== "disconnected") await conversation.endSession();
    await postEmail("/api/transcript/email", { conversationId, email });
  }

  function handleSend(text = draft) {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    const payload = { text: trimmed, files };
    setDraft("");
    setFiles([]);
    if (connected && sessionKindRef.current === "chat") {
      void sendNow(payload);
      return;
    }
    if (busy) return;
    startChatSession(payload).catch((err: Error) => setError(err.message));
  }

  function handleFilesPicked(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    const rejected = picked.filter(
      (file) => !ACCEPTED_FILE_TYPES.split(",").includes(file.type) || file.size > MAX_FILE_BYTES,
    );
    const accepted = picked.filter((file) => !rejected.includes(file));
    const next = [...files, ...accepted].slice(0, MAX_FILES_PER_MESSAGE);
    setFiles(next);
    if (rejected.length > 0) setError("Only images (PNG, JPG, WEBP, GIF) and PDFs up to 10 MB can be attached.");
    else if (files.length + accepted.length > MAX_FILES_PER_MESSAGE)
      setError(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <section className="animate-fade-up flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-card sm:rounded-3xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ClaraBadge />
          <div className="min-w-0 leading-tight">
            <p className="font-semibold text-heading">Clara</p>
            <p className="truncate text-xs text-muted">{SUBTITLES[mode]}</p>
          </div>
          {(mode === "chat" || mode === "voice") && <StatusPill status={status} />}
        </div>
        {mode === "chat" && messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              endSession();
              setConversationId(null);
              setMessages([]);
            }}
            title="Start a new conversation"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm font-semibold text-heading transition hover:border-heading"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-brand-dark">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="rounded p-0.5 transition hover:bg-red-100" aria-label="Dismiss error">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {mode === "chat" ? (
        <>
          <div ref={scrollBoxRef} className="bg-dots min-h-0 flex-1 overflow-y-auto bg-surface/60 px-3 py-5 sm:px-6 sm:py-8">
            <div className={`${COLUMN} space-y-4`}>
              {messages.length === 0 && (
                <div className="flex flex-col items-center pb-4 pt-2 text-center sm:pt-6">
                  <ClaraBadge large />
                  <h1 className="mt-6 text-3xl font-bold tracking-tight text-heading sm:text-4xl">Hi, I&apos;m Clara</h1>
                  <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">
                    NDI&apos;s virtual assistant. Ask me anything about NDI and our AI Employees, or attach a PDF or a
                    screenshot, for example a process description or an RFP.
                  </p>
                  <div className="mt-7 grid w-full gap-3 text-left sm:mt-10 sm:grid-cols-2">
                    {SUGGESTIONS.map((suggestion) => {
                      const Icon = suggestion.icon;
                      return (
                        <button
                          key={suggestion.text}
                          onClick={() => handleSend(suggestion.text)}
                          disabled={busy}
                          className="group flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left text-[15px] font-medium text-heading shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          {suggestion.text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {messages.map((message, index) => {
                // 👍 / 👎 under each answer to a question (not under the greeting).
                const asked = messages.slice(0, index).findLast((earlier) => earlier.role === "user");
                return (
                  <div key={message.id}>
                    <MessageBubble message={message} />
                    {message.role === "agent" && asked && conversationId && message.text && (
                      <AnswerFeedback conversationId={conversationId} messageId={message.id} question={asked.text} answer={message.text} />
                    )}
                  </div>
                );
              })}
              {(awaitingReply || busy) && <TypingIndicator />}
            </div>
          </div>

          <div className="border-t border-line bg-white px-3 py-3 sm:px-6 sm:py-4">
            <div className={COLUMN}>
              {files.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <span
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs text-ink ring-1 ring-line"
                    >
                      {file.type === "application/pdf" ? (
                        <FileText className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                      )}
                      {file.name}
                      <button
                        onClick={() => setFiles(files.filter((_, i) => i !== index))}
                        aria-label={`Remove ${file.name}`}
                        className="ml-0.5 rounded-full text-muted transition hover:text-brand"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <form
                className="flex items-end gap-2 rounded-2xl border border-line bg-white p-1.5 shadow-sm transition focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/10"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSend();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  multiple
                  className="hidden"
                  onChange={(event) => handleFilesPicked(event.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface hover:text-brand"
                  aria-label="Attach an image or PDF"
                  title="Attach an image or PDF"
                >
                  <Paperclip className="h-5 w-5" aria-hidden="true" />
                </button>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="Ask Clara anything…"
                  aria-label="Your message"
                  className="field-sizing-content max-h-48 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || (!draft.trim() && files.length === 0)}
                  aria-label="Send"
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white shadow-glow transition hover:bg-brand-dark disabled:opacity-40 disabled:shadow-none sm:px-5"
                >
                  <span className="hidden sm:inline">Send</span>
                  <SendHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </form>
              {conversationId && messages.length > 0 && (
                <div className="mt-2">
                  <EmailTranscriptForm
                    key={conversationId}
                    onSend={emailTranscript}
                    note="The chat ends first, so the email has every message."
                  />
                </div>
              )}
            </div>
          </div>
        </>
      ) : mode === "voice" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col items-center bg-[radial-gradient(560px_280px_at_50%_0%,rgb(254_1_0/0.07),transparent_70%)] px-4 pb-6 pt-2 sm:pt-6">
            <VoiceOrb
              active={connected}
              isSpeaking={isSpeaking}
              getInputVolume={conversation.getInputVolume}
              getOutputVolume={conversation.getOutputVolume}
            />
            <p className="text-base font-medium text-muted">
              {connected
                ? isSpeaking
                  ? "Clara is speaking…"
                  : isMuted
                    ? "Microphone muted"
                    : "Listening…"
                : busy
                  ? "Connecting…"
                  : "Press start and talk to Clara"}
            </p>
            <div className="mt-4 flex gap-3">
              {connected || busy ? (
                <>
                  <button
                    onClick={() => setMuted(!isMuted)}
                    disabled={!connected}
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-2.5 font-semibold text-ink shadow-sm transition hover:border-heading disabled:opacity-40"
                  >
                    {isMuted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    onClick={endSession}
                    className="inline-flex items-center gap-2 rounded-full bg-heading px-6 py-2.5 font-semibold text-white transition hover:bg-black"
                  >
                    <PhoneOff className="h-4 w-4" aria-hidden="true" /> End call
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <LanguagePicker value={callLanguage} onChange={onCallLanguageChange} />
                  <button
                    onClick={() => void startVoiceSession()}
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-3 font-semibold text-white shadow-glow transition hover:bg-brand-dark"
                  >
                    <Mic className="h-5 w-5" aria-hidden="true" /> Start voice call
                  </button>
                </div>
              )}
            </div>
          </div>
          <div ref={scrollBoxRef} className="bg-dots min-h-0 flex-1 overflow-y-auto border-t border-line bg-surface/60 px-3 py-4 sm:px-6">
            <div className={`${COLUMN} space-y-3`}>
              {messages.length === 0 ? (
                <p className="text-center text-sm text-muted">The live transcript will appear here.</p>
              ) : (
                messages.map((message) => <MessageBubble key={message.id} message={message} />)
              )}
            </div>
          </div>
          {conversationId && messages.length > 0 && (
            <div className="border-t border-line bg-white px-3 py-3 sm:px-6">
              <div className={COLUMN}>
                <EmailTranscriptForm
                  key={conversationId}
                  onSend={emailTranscript}
                  note={connected ? "The call ends first, so the email has everything that was said." : undefined}
                />
              </div>
            </div>
          )}
        </div>
      ) : mode === "avatar" ? (
        <AvatarPanel language={callLanguage} onLanguageChange={onCallLanguageChange} />
      ) : (
        // A live call with NDI staff. From here someone is always a customer: the staff side is /admin.
        <div className="bg-dots min-h-0 flex-1 overflow-y-auto bg-surface/60 p-3 sm:p-8">
          <AidaJoin initialCode="" />
        </div>
      )}
    </section>
  );
}

/** Under Clara's name in the panel header. */
const SUBTITLES: Record<AssistantMode, string> = {
  chat: "NDI's virtual assistant",
  voice: "Voice call in your browser",
  avatar: "Video call, face to face",
  aida: "Live call with NDI staff",
};

/** Clara's round badge: in the panel header, and large on the welcome screen. */
function ClaraBadge({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(140deg,#ff4a3d,#fe0100_45%,#a30000)] font-bold text-white ${
        large ? "h-20 w-20 text-4xl shadow-glow ring-8 ring-brand-soft sm:h-24 sm:w-24 sm:text-5xl" : "h-10 w-10 text-lg shadow-sm"
      }`}
    >
      C
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    connected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    connecting: "bg-amber-50 text-amber-700 ring-amber-200",
    error: "bg-red-50 text-brand-dark ring-red-200",
    disconnected: "bg-surface text-muted ring-line",
  };
  const labels: Record<string, string> = {
    connected: "Connected",
    connecting: "Connecting…",
    error: "Error",
    disconnected: "Ready",
  };
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 sm:inline-flex ${
        styles[status] ?? styles.disconnected
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "connecting" ? "animate-pulse" : ""}`} aria-hidden="true" />
      {labels[status] ?? status}
    </span>
  );
}
