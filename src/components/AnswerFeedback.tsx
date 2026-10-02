"use client";

import { useState } from "react";

// 👍 / 👎 under one of Ellie's answers in the website chat. A 👎 asks what was wrong. The rating
// reaches CDA staff on /admin (📚 Knowledge → Feedback) and shows on the conversation in ElevenLabs.

type Props = { conversationId: string; messageId: string; question: string; answer: string };

export function AnswerFeedback({ conversationId, messageId, question, answer }: Props) {
  const [rating, setRating] = useState<"like" | "dislike" | null>(null);
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  async function send(value: "like" | "dislike", why = "") {
    setRating(value);
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, messageId, rating: value, question, answer, comment: why }),
    }).catch(() => {});
  }

  if (sent) return <p className="mt-1 pl-1 text-xs text-cda-text">Thanks, CDA will look at this answer.</p>;

  if (asking) {
    return (
      <form
        className="mt-2 max-w-[85%] space-y-2 rounded-xl border border-cda-grey bg-white p-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await send("dislike", comment.trim());
          setAsking(false);
          setSent(true);
        }}
      >
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What was wrong? (optional)"
          maxLength={1000}
          rows={2}
          autoFocus
          className="w-full rounded-lg border border-cda-grey px-2 py-1.5 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={async () => {
              await send("dislike");
              setAsking(false);
              setSent(true);
            }}
            className="text-xs text-cda-text underline"
          >
            Skip
          </button>
          <button type="submit" className="rounded-full bg-cda-red px-3 py-1 text-xs font-semibold text-white">
            Send
          </button>
        </div>
      </form>
    );
  }

  const button = (value: "like" | "dislike", icon: string, label: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => (value === "dislike" ? setAsking(true) : void send("like"))}
      className={`rounded-full px-2 py-0.5 text-sm transition ${
        rating === value ? "bg-cda-grey" : "opacity-60 hover:bg-cda-grey hover:opacity-100"
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="mt-1 flex items-center gap-1 pl-1">
      {button("like", "👍", "Good answer")}
      {button("dislike", "👎", "Not a good answer")}
      {rating === "like" && <span className="text-xs text-cda-text">Thanks!</span>}
    </div>
  );
}
