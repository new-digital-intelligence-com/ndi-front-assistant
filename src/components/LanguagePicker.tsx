"use client";

import type { CallLanguage } from "./types";

const LANGUAGES: { value: CallLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "fr", label: "Français" },
];

/**
 * The language of the next voice or avatar call. It is chosen before the call starts: ElevenLabs keeps
 * one language for the whole call, in Clara's voice either way.
 */
export function LanguagePicker({ value, onChange }: { value: CallLanguage; onChange: (language: CallLanguage) => void }) {
  return (
    <div className="flex flex-wrap justify-center rounded-full bg-line p-1" role="group" aria-label="Call language">
      {LANGUAGES.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            value === option.value ? "bg-white text-heading shadow-sm" : "text-muted hover:text-heading"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
