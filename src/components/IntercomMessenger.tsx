"use client";

import { useEffect } from "react";

// Intercom's chat bubble on the customer page. ElevenLabs answers every conversation started in it
// as Ellie (Intercom integration, "Intercom Conversation" trigger), and staff see the same
// conversations in Intercom's inbox. The App ID is public by design: every site that runs Intercom
// has it in its page.
const INTERCOM_APP_ID = "zrrcz82c";
const INTERCOM_SETTINGS = { app_id: INTERCOM_APP_ID, api_base: "https://api-iam.intercom.io" };

type IntercomFn = ((...args: unknown[]) => void) & { q?: unknown[][]; c?: (args: unknown[]) => void };

declare global {
  interface Window {
    Intercom?: IntercomFn;
    intercomSettings?: typeof INTERCOM_SETTINGS;
  }
}

export function IntercomMessenger() {
  useEffect(() => {
    window.intercomSettings = INTERCOM_SETTINGS;
    if (typeof window.Intercom === "function") {
      // Loaded before (the page was left and opened again): start it again.
      window.Intercom("boot", INTERCOM_SETTINGS);
    } else {
      // Intercom's own loader: calls made before the script arrives wait in a queue, and the
      // script starts itself from window.intercomSettings.
      const stub: IntercomFn = (...args: unknown[]) => stub.c?.(args);
      stub.q = [];
      stub.c = (args) => stub.q?.push(args);
      window.Intercom = stub;
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://widget.intercom.io/widget/${INTERCOM_APP_ID}`;
      document.body.appendChild(script);
    }
    return () => window.Intercom?.("shutdown");
  }, []);

  return null;
}
