"use client";

import { Camera, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";
import { EmailModeCard } from "../aida/EmailModeCard";
import { SocialRepliesCard, type Channel } from "./SocialRepliesCard";
import { SectionTabs, useSectionPath } from "./ui";

// The Replies section of the staff console, one channel per tab at its own address (the user's request,
// 4 Oct 2026): Email (/admin/replies), Instagram (/admin/replies/instagram) and Messenger
// (/admin/replies/messenger). Every tab stays mounted while staff look at another, so the counts of drafts
// waiting stay fresh and a draft being changed is kept.

const BASE = "/admin/replies";
const INSTAGRAM = `${BASE}/instagram`;
const MESSENGER = `${BASE}/messenger`;

export function RepliesPanel({ staffToken, onSignOut }: { staffToken: string; onSignOut: () => void }) {
  const path = useSectionPath(BASE);
  const view: "email" | Channel = path.startsWith(INSTAGRAM) ? "instagram" : path.startsWith(MESSENGER) ? "messenger" : "email";
  const [waiting, setWaiting] = useState<Record<Channel, number> | null>(null);

  return (
    <div className="space-y-4">
      <SectionTabs
        label="Replies"
        active={view === "instagram" ? INSTAGRAM : view === "messenger" ? MESSENGER : BASE}
        tabs={[
          { href: BASE, label: "Email", icon: Mail },
          { href: INSTAGRAM, label: "Instagram", icon: Camera, count: waiting?.instagram, highlight: true },
          { href: MESSENGER, label: "Messenger", icon: MessageCircle, count: waiting?.messenger, highlight: true },
        ]}
      />
      <div className={view === "email" ? "animate-fade-up" : "hidden"}>
        <EmailModeCard staffToken={staffToken} />
      </div>
      <div className={view === "email" ? "hidden" : ""}>
        <SocialRepliesCard
          staffToken={staffToken}
          onSignOut={onSignOut}
          channel={view === "messenger" ? "messenger" : "instagram"}
          onWaiting={setWaiting}
        />
      </div>
    </div>
  );
}
