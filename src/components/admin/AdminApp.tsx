"use client";

import { useCallback, useEffect, useState } from "react";
import { Lobby, StaffSignIn } from "../aida/AidaLobby";
import { EmailModeCard } from "../aida/EmailModeCard";
import { rememberStaffToken, savedStaffToken } from "../aida/types";
import { CallListPanel } from "./CallListPanel";
import { CustomersPanel } from "./CustomersPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import { MoodPanel } from "./MoodPanel";
import { SocialRepliesCard } from "./SocialRepliesCard";

type AdminTab = "rooms" | "customers" | "mood" | "calls" | "knowledge" | "email";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "rooms", label: "📞 Aida rooms" },
  { id: "customers", label: "👥 Customers" },
  { id: "mood", label: "😊 Mood" },
  { id: "calls", label: "📲 Call list" },
  { id: "knowledge", label: "📚 Knowledge" },
  { id: "email", label: "✉️ Replies" },
];

/**
 * The staff side of the demo (/admin), behind the Aida staff password rather than the site
 * password: Aida rooms, who the customers are, call lists Clara phones, what Clara could not answer
 * (and the answers staff approve for her), how customers felt (😊 Mood), and the email reply switch. The sign-in is kept per
 * browser tab, so an invite link opened in another tab joins as a customer.
 *
 * Tabs stay mounted once opened, so moving to Customers does not drop a staff member out of a call.
 */
export function AdminApp() {
  const [staffToken, setStaffToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<AdminTab>("rooms");
  const [opened, setOpened] = useState<Set<AdminTab>>(() => new Set(["rooms"]));

  useEffect(() => {
    const timer = setTimeout(() => {
      setStaffToken(savedStaffToken());
      setChecked(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const signOut = useCallback(() => {
    rememberStaffToken(null);
    setStaffToken(null);
  }, []);

  if (!checked) return null;
  if (!staffToken) {
    return (
      <StaffSignIn
        onSignedIn={(token) => {
          rememberStaffToken(token);
          setStaffToken(token);
        }}
      />
    );
  }

  function open(next: AdminTab) {
    setTab(next);
    setOpened((current) => new Set(current).add(next));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap rounded-full bg-white p-1 shadow-sm" role="tablist" aria-label="Admin sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => open(item.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                tab === item.id ? "bg-brand text-white shadow" : "text-ink hover:text-heading"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={signOut} className="text-xs text-muted underline">
          Sign out
        </button>
      </div>

      <div className={tab === "rooms" ? "" : "hidden"}>
        <Lobby staffToken={staffToken} onSignOut={signOut} />
      </div>
      {opened.has("customers") && (
        <div className={tab === "customers" ? "" : "hidden"}>
          <CustomersPanel staffToken={staffToken} onSignOut={signOut} />
        </div>
      )}
      {opened.has("mood") && (
        <div className={tab === "mood" ? "" : "hidden"}>
          <MoodPanel staffToken={staffToken} onSignOut={signOut} />
        </div>
      )}
      {opened.has("calls") && (
        <div className={tab === "calls" ? "max-w-4xl" : "hidden"}>
          <CallListPanel staffToken={staffToken} onSignOut={signOut} />
        </div>
      )}
      {opened.has("knowledge") && (
        <div className={tab === "knowledge" ? "max-w-4xl" : "hidden"}>
          <KnowledgePanel staffToken={staffToken} onSignOut={signOut} />
        </div>
      )}
      {opened.has("email") && (
        <div className={tab === "email" ? "max-w-3xl space-y-4" : "hidden"}>
          <EmailModeCard staffToken={staffToken} />
          <SocialRepliesCard staffToken={staffToken} onSignOut={signOut} />
        </div>
      )}
    </div>
  );
}
