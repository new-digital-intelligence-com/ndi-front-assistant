"use client";

import type { CallLanguage } from "./types";

const LANGUAGES: { value: CallLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
];

/**
 * The language of the next voice or avatar call. It is chosen before the call starts: ElevenLabs keeps
 * one language for the whole call, in Shelley's voice either way.
 */
export function LanguagePicker({ value, onChange }: { value: CallLanguage; onChange: (language: CallLanguage) => void }) {
  return (
    <div className="flex rounded-full bg-cda-grey p-1" role="group" aria-label="Call language">
      {LANGUAGES.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            value === option.value ? "bg-white text-cda-dark shadow-sm" : "text-cda-text hover:text-cda-dark"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
