import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { linkifyMarkdown, stripAudioTags, youtubeIds } from "@/lib/richText";
import { YouTubeCard } from "./LinkedText";
import type { ChatMessage } from "./types";

// One message in the website's chat, voice and avatar pages. Clara's words lose the audio tags her voice model
// writes ([happy], [calm]), every address in them is a link, and a YouTube link shows the video's card
// (src/lib/richText.ts).
export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const text = message.text ? (isUser ? message.text : stripAudioTags(message.text)) : "";
  const videos = text && !isUser ? youtubeIds(text) : [];
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm sm:text-base ${
          isUser ? "rounded-br-sm bg-heading text-white" : "rounded-bl-sm bg-white text-ink"
        }`}
      >
        {!isUser && <div className="mb-1 text-xs font-semibold text-brand">Clara</div>}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((file) =>
              file.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img
                  key={file.name}
                  src={file.previewUrl}
                  alt={file.name}
                  className="h-24 w-24 rounded-lg object-cover"
                />
              ) : (
                <span
                  key={file.name}
                  className="rounded-lg bg-white/15 px-2 py-1 text-xs ring-1 ring-white/30"
                >
                  📄 {file.name}
                </span>
              ),
            )}
          </div>
        )}
        {text && (
          <div className="chat-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {linkifyMarkdown(text)}
            </ReactMarkdown>
          </div>
        )}
        {videos.map((id) => (
          <YouTubeCard key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-white px-4 py-4 shadow-sm" aria-label="Clara is typing">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot h-2 w-2 rounded-full bg-brand"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
