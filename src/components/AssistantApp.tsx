"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
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
  { icon: "🤖", text: "What is an AI Employee?" },
  { icon: "💶", text: "How does NDI's pricing work?" },
  { icon: "🎧", text: "Which AI Employees help with customer service?" },
  { icon: "📅", text: "I'd like to book a demo." },
];

/** Messages and the live transcript sit in a column that stays easy to read on a wide screen. */
const COLUMN = "mx-auto w-full max-w-3xl 2xl:max-w-4xl";

type PendingMessage = { text: string; files: File[] };

const TAB_LABELS: Record<AssistantMode, string> = {
  chat: "💬 Chat",
  voice: "🎙️ Voice",
  avatar: "🧑‍💼 Avatar",
  aida: "📞 Aida",
};

export default function AssistantApp() {
  return (
    <ConversationProvider>
      <Assistant />
    </ConversationProvider>
  );
}

function Assistant() {
  const [mode, setMode] = useState<AssistantMode>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  /** The ElevenLabs conversation on screen, so its transcript can be emailed. */
  const [conversationId, setConversationId] = useState<string | null>(null);
  /** Language of the next voice or avatar call; shared by both tabs. */
  const [callLanguage, setCallLanguage] = useState<CallLanguage>("en");

  const sessionKindRef = useRef<AssistantMode | null>(null);
  const pendingRef = useRef<PendingMessage | null>(null);
  const skipGreetingRef = useRef(false);
  /** The conversation box on screen (chat or voice transcript); new messages scroll it, not the page. */
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addMessage = useCallback((role: ChatMessage["role"], text: string, attachments?: Attachment[]) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, text, attachments }]);
  }, []);

  const conversation = useConversation({
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

  function switchMode(next: AssistantMode) {
    if (next === mode) return;
    endSession();
    setConversationId(null);
    setMessages([]);
    setFiles([]);
    setError(null);
    setMode(next);
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
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="hidden min-w-0 items-center gap-3 md:flex">
          <ClaraBadge />
          <div className="min-w-0 leading-tight">
            <p className="font-semibold text-heading">Clara</p>
            <p className="truncate text-xs text-muted">NDI&apos;s virtual assistant</p>
          </div>
          {(mode === "chat" || mode === "voice") && <StatusPill status={status} />}
        </div>
        <div className="grid w-full grid-cols-4 rounded-full bg-line p-1 md:flex md:w-auto" role="tablist" aria-label="Assistant mode">
          {(["chat", "voice", "avatar", "aida"] as const).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={mode === item}
              onClick={() => switchMode(item)}
              className={`rounded-full px-2 py-2 text-sm font-semibold transition sm:px-5 sm:text-[15px] ${
                mode === item ? "bg-brand text-white shadow" : "text-ink hover:text-heading"
              }`}
            >
              {TAB_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 bg-red-50 px-4 py-2 text-sm text-brand-dark">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-semibold" aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {mode === "chat" ? (
        <>
          <div ref={scrollBoxRef} className="min-h-0 flex-1 overflow-y-auto bg-surface px-3 py-5 sm:px-6 sm:py-8">
            <div className={`${COLUMN} space-y-4`}>
              {messages.length === 0 && (
                <div className="flex flex-col items-center pb-4 pt-2 text-center sm:pt-8">
                  <ClaraBadge large />
                  <h1 className="mt-4 text-2xl font-bold text-heading sm:text-3xl">Hi, I&apos;m Clara</h1>
                  <p className="mt-2 max-w-2xl text-base text-muted sm:text-lg">
                    NDI&apos;s virtual assistant. Ask me anything about NDI and our AI Employees, or attach a PDF or a
                    screenshot, for example a process description or an RFP.
                  </p>
                  <div className="mt-6 grid w-full gap-3 text-left sm:mt-10 sm:grid-cols-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion.text}
                        onClick={() => handleSend(suggestion.text)}
                        disabled={busy}
                        className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left text-[15px] font-medium text-heading shadow-sm transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md disabled:opacity-50 sm:py-3.5"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-xl" aria-hidden="true">
                          {suggestion.icon}
                        </span>
                        {suggestion.text}
                      </button>
                    ))}
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
                      className="flex items-center gap-2 rounded-full bg-line px-3 py-1 text-xs text-ink"
                    >
                      {file.type === "application/pdf" ? "📄" : "🖼️"} {file.name}
                      <button
                        onClick={() => setFiles(files.filter((_, i) => i !== index))}
                        aria-label={`Remove ${file.name}`}
                        className="font-bold text-muted hover:text-brand"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <form
                className="flex items-end gap-2 rounded-2xl border border-line bg-white p-1.5 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10"
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-ink transition hover:bg-surface hover:text-brand"
                  aria-label="Attach an image or PDF"
                  title="Attach an image or PDF"
                >
                  📎
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
                  placeholder="Type your question…"
                  className="field-sizing-content max-h-48 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || (!draft.trim() && files.length === 0)}
                  className="h-11 shrink-0 rounded-xl bg-brand px-5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
                >
                  Send
                </button>
              </form>
              {messages.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    onClick={() => {
                      endSession();
                      setConversationId(null);
                      setMessages([]);
                    }}
                    className="text-xs text-muted underline hover:text-brand"
                  >
                    Start a new conversation
                  </button>
                  {conversationId && (
                    <EmailTranscriptForm
                      key={conversationId}
                      onSend={emailTranscript}
                      note="The chat ends first, so the email has every message."
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : mode === "voice" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col items-center px-4 pt-4 sm:pt-8">
            <VoiceOrb
              active={connected}
              isSpeaking={isSpeaking}
              getInputVolume={conversation.getInputVolume}
              getOutputVolume={conversation.getOutputVolume}
            />
            <p className="text-base text-muted">
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
                    className="rounded-full border border-line px-5 py-2.5 font-semibold text-ink transition hover:border-heading disabled:opacity-40"
                  >
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    onClick={endSession}
                    className="rounded-full bg-heading px-6 py-2.5 font-semibold text-white transition hover:bg-black"
                  >
                    End call
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <LanguagePicker value={callLanguage} onChange={setCallLanguage} />
                  <button
                    onClick={() => void startVoiceSession()}
                    className="rounded-full bg-brand px-8 py-3 font-semibold text-white shadow transition hover:bg-brand-dark"
                  >
                    Start voice call
                  </button>
                </div>
              )}
            </div>
          </div>
          <div ref={scrollBoxRef} className="mt-6 min-h-0 flex-1 overflow-y-auto border-t border-line bg-surface px-3 py-4 sm:px-6">
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
        <AvatarPanel language={callLanguage} onLanguageChange={setCallLanguage} />
      ) : (
        // A live call with NDI staff. From here someone is always a customer: the staff side is /admin.
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface p-4 sm:p-8">
          <AidaJoin initialCode="" />
        </div>
      )}
    </section>
  );
}

/** Clara's round badge: in the panel header, and large on the welcome screen. */
function ClaraBadge({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#1190cb,#002a6c)] font-bold text-white shadow ${
        large ? "h-16 w-16 text-3xl sm:h-20 sm:w-20 sm:text-4xl" : "h-10 w-10 text-lg"
      }`}
    >
      C
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    connected: "bg-green-100 text-green-800",
    connecting: "bg-amber-100 text-amber-800",
    error: "bg-red-100 text-brand-dark",
    disconnected: "bg-line text-muted",
  };
  const labels: Record<string, string> = {
    connected: "Connected",
    connecting: "Connecting…",
    error: "Error",
    disconnected: "Ready",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[status] ?? styles.disconnected}`}>
      {labels[status] ?? status}
    </span>
  );
}
