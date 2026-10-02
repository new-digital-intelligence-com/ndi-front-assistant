import AssistantApp from "@/components/AssistantApp";
import { AccountPanel } from "@/components/AccountPanel";
import { ChannelLinks } from "@/components/ChannelLinks";
import { IntercomMessenger } from "@/components/IntercomMessenger";
import { NdiLogo } from "@/components/NdiLogo";

const helpTopics = [
  "What AI Employees are and what they do",
  "Finding the right AI Employee for your process",
  "How NDI works: implementation, go-live and the pay-per-use model",
  "Booking a meeting or a demo with the NDI team",
  "NDI's offices and contacts",
];

// The page is built around Clara's panel: on a computer it fills the window below the header (the
// sidebar scrolls on its own beside it), on a phone it fills the screen and the rest follows below.
// The header is 3.5rem high; the heights below take it and the page padding off the window.

export default function Home() {
  return (
    <>
      <header className="bg-white">
        <div className="mx-auto flex h-[3.25rem] max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <NdiLogo tagline={false} className="h-7 w-auto shrink-0" />
            <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />
            <span className="text-lg font-semibold text-heading">Assistant</span>
            <span className="hidden truncate rounded-full bg-surface px-3 py-1 text-xs text-muted md:block">
              A live demo of NDI&apos;s Multi-Channel Front Office Assistant
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <a
              href="https://new-digital-intelligence.com/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm text-muted hover:text-heading sm:block"
            >
              Contact NDI ↗
            </a>
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="rounded-full border border-line px-3 py-1 text-xs text-heading transition hover:border-heading"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
        <div className="h-1 bg-accent" />
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-3 sm:p-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5 lg:px-6 xl:grid-cols-[330px_minmax(0,1fr)]">
        {/* On a phone the assistant comes first, so nobody scrolls past the sidebar to reach it. */}
        <div className="order-1 flex h-[calc(100dvh-5rem)] min-h-[540px] min-w-0 sm:h-[calc(100dvh-5.5rem)] lg:order-2">
          <AssistantApp />
        </div>

        <aside className="order-2 space-y-3 lg:order-1 lg:h-[calc(100dvh-5.5rem)] lg:min-h-[540px] lg:overflow-y-auto lg:pr-1">
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-heading">What Clara can help with</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {helpTopics.map((topic) => (
                <li key={topic} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {topic}
                </li>
              ))}
            </ul>
          </section>
          <ChannelLinks />
          <AccountPanel />
          <p className="rounded-xl border-l-4 border-brand bg-white px-4 py-3 text-sm text-muted shadow-sm">
            <strong className="text-heading">Prefer a person?</strong> Write to{" "}
            <a href="mailto:mail@new-digital-intelligence.com" className="font-semibold text-brand underline">
              mail@new-digital-intelligence.com
            </a>
            .
          </p>
        </aside>
      </main>

      <IntercomMessenger />

      <footer className="mt-auto bg-heading text-white/80">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1 px-4 py-5 text-sm sm:flex-row sm:justify-between lg:px-6">
          <span>NDI – New Digital Intelligence · new-digital-intelligence.com</span>
          <span>Built by NDI with ElevenLabs Agents</span>
        </div>
      </footer>
    </>
  );
}
