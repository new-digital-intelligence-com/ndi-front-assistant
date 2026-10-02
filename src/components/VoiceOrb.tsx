"use client";

import { useEffect, useRef } from "react";

type VoiceOrbProps = {
  active: boolean;
  isSpeaking: boolean;
  getInputVolume: () => number;
  getOutputVolume: () => number;
};

/** Pulsing orb driven by the live microphone / agent audio volume. */
export function VoiceOrb({ active, isSpeaking, getInputVolume, getOutputVolume }: VoiceOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      let volume = 0;
      try {
        volume = isSpeaking ? getOutputVolume() : getInputVolume();
      } catch {
        volume = 0;
      }
      if (orbRef.current) {
        orbRef.current.style.transform = `scale(${1 + Math.min(volume, 1) * 0.35})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, isSpeaking, getInputVolume, getOutputVolume]);

  return (
    <div className="flex h-48 items-center justify-center sm:h-64">
      <div
        ref={orbRef}
        className={`h-32 w-32 rounded-full transition-[background] duration-500 sm:h-44 sm:w-44 ${
          active
            ? isSpeaking
              ? "bg-[radial-gradient(circle_at_35%_30%,#ff8a80,#fe0100_55%,#a30000)] shadow-[0_20px_60px_rgba(224,0,0,0.3)]"
              : "bg-[radial-gradient(circle_at_35%_30%,#ffffff,#ffc9c9_55%,#e05252)] shadow-[0_20px_60px_rgba(224,0,0,0.2)]"
            : "bg-[radial-gradient(circle_at_35%_30%,#ffffff,#ececec_60%,#bdbdbd)] shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
        }`}
      />
    </div>
  );
}
