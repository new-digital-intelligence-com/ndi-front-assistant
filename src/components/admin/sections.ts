import { BookOpen, Headset, Inbox, PhoneOutgoing, Smile, Users, type LucideIcon } from "lucide-react";

export type AdminSection = "rooms" | "customers" | "mood" | "calls" | "knowledge" | "replies";

/** The staff console's sections, each at its own address under /admin (src/app/admin). */
export const ADMIN_SECTIONS: {
  id: AdminSection;
  href: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** How wide the section may grow; the others use the full width. */
  width?: string;
}[] = [
  {
    id: "rooms",
    href: "/admin/rooms",
    label: "Aida rooms",
    title: "Aida rooms",
    description: "Live calls with customers. Aida drafts answers for you while you talk.",
    icon: Headset,
  },
  {
    id: "customers",
    href: "/admin/customers",
    label: "Customers",
    title: "Customers",
    description: "Who talked to Clara, on which channels, and what they asked.",
    icon: Users,
  },
  {
    id: "mood",
    href: "/admin/mood",
    label: "Mood",
    title: "Customer mood",
    description: "How customers felt in their conversations with Clara, channel by channel.",
    icon: Smile,
  },
  {
    id: "calls",
    href: "/admin/calls",
    label: "Call list",
    title: "Call list",
    description: "People Clara phones for you, and hand-overs to a colleague with a live transcript.",
    icon: PhoneOutgoing,
    width: "max-w-4xl",
  },
  {
    id: "knowledge",
    href: "/admin/knowledge",
    label: "Knowledge",
    title: "Knowledge",
    description: "Questions Clara could not answer, and the answers staff approve for her.",
    icon: BookOpen,
    width: "max-w-4xl",
  },
  {
    id: "replies",
    href: "/admin/replies",
    label: "Replies",
    title: "Replies",
    description: "Email, Instagram and Messenger: send Clara's answers straight away, or check them first.",
    icon: Inbox,
    width: "max-w-3xl",
  },
];

export function sectionFromPath(pathname: string): AdminSection {
  return ADMIN_SECTIONS.find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`))?.id ?? "rooms";
}
