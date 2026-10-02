import { Headset, MessageSquareText, Mic, Video, type LucideIcon } from "lucide-react";
import type { AssistantMode } from "../types";

/**
 * The ways to talk to Clara on the website, each at its own address (src/app/(site)): "/" is the chat,
 * then /voice, /avatar and /aida. The menu, the phone's bottom bar and the page titles all read this list.
 */
export const MODES: {
  mode: AssistantMode;
  href: string;
  label: string;
  /** For the phone's bottom bar. */
  short: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { mode: "chat", href: "/", label: "Chat", short: "Chat", description: "Type, or attach a photo or PDF", icon: MessageSquareText },
  { mode: "voice", href: "/voice", label: "Voice call", short: "Voice", description: "Talk to Clara in your browser", icon: Mic },
  { mode: "avatar", href: "/avatar", label: "Video avatar", short: "Video", description: "Clara face to face", icon: Video },
  { mode: "aida", href: "/aida", label: "Live call", short: "Live call", description: "With NDI staff, helped by Aida", icon: Headset },
];

export function modeFromPath(pathname: string): AssistantMode {
  return MODES.find((item) => item.href !== "/" && (pathname === item.href || pathname.startsWith(`${item.href}/`)))?.mode ?? "chat";
}
