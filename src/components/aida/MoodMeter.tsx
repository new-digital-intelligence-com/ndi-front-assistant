"use client";

import type { LineMood } from "./types";

// Staff only: how the customer in an Aida room sounds, from Claude's rating of each thing they say.
// Colours (validated for colour blindness): blue positive, grey neutral, red negative. A word always
// goes with the colour, so the colour is never the only signal.

const POSITIVE = "#2a78d6";
const NEUTRAL = "#b4b2ab";
const NEGATIVE = "#d03d3b";
/** The frustration bar fills by severity: calm, rising, frustrated. */
const SEVERITY = ["#2a78d6", "#fab219", "#d03d3b"];

/** The same line as the server's "upset": Aida changes her tone from here on. */
export const upsetMood = (mood: LineMood) => mood.frustration >= 0.6 || mood.score <= -0.5;

export function moodWord(mood: LineMood): string {
  if (mood.frustration >= 0.8 || mood.score <= -0.7) return "Angry";
  if (upsetMood(mood)) return "Frustrated";
  if (mood.label === "negative" || mood.score < -0.2) return "Unhappy";
  if (mood.label === "positive" || mood.score >= 0.3) return "Happy";
  return "Neutral";
}

export function moodColor(mood: LineMood): string {
  if (upsetMood(mood) || mood.label === "negative" || mood.score < -0.2) return NEGATIVE;
  if (mood.label === "positive" || mood.score >= 0.3) return POSITIVE;
  return NEUTRAL;
}

const RECENT = 8;

export function MoodMeter({
  lines,
  aidaAdapts,
}: {
  /** The customer's rated lines, oldest first. */
  lines: { id: string; text: string; mood: LineMood }[];
  /** This browser runs Aida, so she is told when the customer is frustrated. */
  aidaAdapts: boolean;
}) {
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-line px-3 py-2">
        <p className="text-xs font-semibold text-heading">Customer mood</p>
        <p className="text-xs text-muted">Appears here as the customer talks or types.</p>
      </div>
    );
  }

  const latest = lines[lines.length - 1].mood;
  const frustration = Math.round(latest.frustration * 100);
  const fill = SEVERITY[latest.frustration >= 0.6 ? 2 : latest.frustration >= 0.3 ? 1 : 0];
  const upset = upsetMood(latest);

  return (
    <div className={`rounded-lg border px-3 py-2 ${upset ? "border-brand/50 bg-red-50/60" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-heading">Customer mood</p>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-heading">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: moodColor(latest) }} aria-hidden="true" />
          {moodWord(latest)}
        </p>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-line"
          role="meter"
          aria-label="Customer frustration"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={frustration}
        >
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(frustration, 3)}%`, backgroundColor: fill }} />
        </div>
        <span className="w-24 shrink-0 text-right text-[11px] text-muted">Frustration {frustration}%</span>
      </div>

      {lines.length > 1 && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[11px] text-muted">Earlier</span>
          {lines.slice(-RECENT).map((line) => (
            <span
              key={line.id}
              className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
              style={{ backgroundColor: moodColor(line.mood) }}
              title={`${moodWord(line.mood)} · frustration ${Math.round(line.mood.frustration * 100)}%: “${line.text.slice(0, 80)}”`}
            />
          ))}
          <span className="text-[11px] text-muted">now</span>
        </div>
      )}

      {upset && (
        <p className="mt-2 text-xs text-brand-dark">
          {aidaAdapts
            ? "Aida will open her next draft with an apology and offer to escalate."
            : "Apologise, keep it short, and offer to escalate or call back."}
        </p>
      )}
    </div>
  );
}
