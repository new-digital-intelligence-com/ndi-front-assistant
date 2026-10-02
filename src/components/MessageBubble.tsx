import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "./types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm ${
          isUser ? "rounded-br-sm bg-cda-dark text-white" : "rounded-bl-sm bg-white text-cda-ink"
        }`}
      >
        {!isUser && <div className="mb-1 text-xs font-semibold text-cda-red">Ellie</div>}
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
        {message.text && (
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
              {message.text}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-white px-4 py-4 shadow-sm" aria-label="Ellie is typing">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot h-2 w-2 rounded-full bg-cda-red"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
