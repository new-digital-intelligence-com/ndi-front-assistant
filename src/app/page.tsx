import AssistantApp from "@/components/AssistantApp";
import { AccountPanel } from "@/components/AccountPanel";
import { ChannelLinks } from "@/components/ChannelLinks";
import { IntercomMessenger } from "@/components/IntercomMessenger";

const helpTopics = [
  "What AI Employees are and what they do",
  "Finding the right AI Employee for your process",
  "How NDI works: implementation, go-live and the pay-per-use model",
  "Booking a meeting or a demo with the NDI team",
  "NDI's offices and contacts",
];

export default function Home() {
  return (
    <>
      <div className="bg-ink px-4 py-1.5 text-center text-xs text-white/80">
        A live demo of NDI&apos;s Multi-Channel Front Office Assistant
      </div>

      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-white px-2.5 py-1 text-xl font-extrabold tracking-wider text-brand">NDI</span>
            <span className="text-lg font-semibold">Assistant</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://new-digital-intelligence.com/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm text-white/80 hover:text-white sm:block"
            >
              Contact NDI ↗
            </a>
            <form action="/api/logout" method="post">
              <button type="submit" className="rounded-full border border-white/30 px-3 py-1 text-xs text-white/80 hover:text-white">
                Log out
              </button>
            </form>
          </div>
        </div>
        <div className="h-1 bg-accent" />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[320px_1fr] lg:gap-6">
        {/* On a phone the assistant comes first, so nobody scrolls past the sidebar to reach it.
            The flex wrapper lets the panel stretch to the full height of the row instead of
            stopping at its minimum and leaving empty space beside the sidebar. */}
        <div className="order-1 flex min-w-0 lg:order-2">
          <AssistantApp />
        </div>

        <aside className="order-2 space-y-3 lg:order-1 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-heading">Hi, I&apos;m Clara</h1>
            <p className="mt-1 text-sm text-muted">
              NDI&apos;s virtual assistant. Ask about our AI Employees, send a document, or just talk.
            </p>
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-heading">
                What I can help with
                <span className="float-right text-muted transition group-open:rotate-180">⌄</span>
              </summary>
              <ul className="mt-2 space-y-1.5 text-sm text-muted">
                {helpTopics.map((topic) => (
                  <li key={topic} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {topic}
                  </li>
                ))}
              </ul>
            </details>
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

      <footer className="mt-auto bg-brand text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-sm sm:flex-row sm:justify-between">
          <span>NDI – New Digital Intelligence · new-digital-intelligence.com</span>
          <span>Built by NDI with ElevenLabs Agents</span>
        </div>
      </footer>
    </>
  );
}
