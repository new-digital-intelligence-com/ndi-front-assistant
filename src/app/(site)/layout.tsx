import { SiteShell } from "@/components/site/SiteShell";
import { hasValidSession } from "@/lib/session";

// The customer site: one layout around Clara for the chat (/), /voice, /avatar and /aida. The layout
// keeps the assistant, so moving between them is instant (src/components/site/SiteShell.tsx).
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  return <SiteShell signedIn={await hasValidSession()}>{children}</SiteShell>;
}
