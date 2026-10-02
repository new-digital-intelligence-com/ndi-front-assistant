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
    <div className="flex h-56 items-center justify-center">
      <div
        ref={orbRef}
        className={`h-36 w-36 rounded-full transition-[background] duration-500 ${
          active
            ? isSpeaking
              ? "bg-[radial-gradient(circle_at_35%_30%,#ff8a80,#e84339_55%,#8f1f19)]"
              : "bg-[radial-gradient(circle_at_35%_30%,#ffffff,#9dbdcb_55%,#4f7382)]"
            : "bg-[radial-gradient(circle_at_35%_30%,#ffffff,#e7e6e6_60%,#b9b8b8)]"
        } shadow-[0_20px_60px_rgba(34,34,34,0.25)]`}
      />
    </div>
  );
}
