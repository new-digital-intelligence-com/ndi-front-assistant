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
              ? "bg-[radial-gradient(circle_at_35%_30%,#7cc8ee,#1190cb_55%,#002a6c)]"
              : "bg-[radial-gradient(circle_at_35%_30%,#ffffff,#9fc3e6_55%,#3d6a99)]"
            : "bg-[radial-gradient(circle_at_35%_30%,#ffffff,#dfeaf6_60%,#a9bccf)]"
        } shadow-[0_20px_60px_rgba(0,42,108,0.25)]`}
      />
    </div>
  );
}
