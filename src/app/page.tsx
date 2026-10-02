import AssistantApp from "@/components/AssistantApp";
import { AccountPanel } from "@/components/AccountPanel";
import { ChannelLinks } from "@/components/ChannelLinks";
import { IntercomMessenger } from "@/components/IntercomMessenger";

const helpTopics = [
  "Product features, dimensions and energy ratings",
  "Warranty and appliance registration",
  "Faults, repairs and engineer visits",
  "Spare parts, accessories and user manuals",
  "Where to buy CDA appliances",
];

export default function Home() {
  return (
    <>
      <div className="bg-cda-ink px-4 py-1.5 text-center text-xs text-white/80">
        NDI demo · not an official CDA website
      </div>

      <header className="bg-cda-dark text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-cda-red px-2.5 py-1 text-xl font-extrabold tracking-wider">CDA</span>
            <span className="text-lg font-semibold">Customer Assistant</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://www.cda.co.uk/customer-care/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm text-white/80 hover:text-white sm:block"
            >
              CDA Customer Care ↗
            </a>
            <form action="/api/logout" method="post">
              <button type="submit" className="rounded-full border border-white/30 px-3 py-1 text-xs text-white/80 hover:text-white">
                Log out
              </button>
            </form>
          </div>
        </div>
        <div className="h-1 bg-cda-red" />
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
            <h1 className="text-xl font-bold text-cda-dark">Hi, I&apos;m Ellie</h1>
            <p className="mt-1 text-sm text-cda-text">
              The virtual assistant for CDA kitchen appliances. Chat, send a photo or PDF, or just talk.
            </p>
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-cda-dark">
                What I can help with
                <span className="float-right text-cda-text transition group-open:rotate-180">⌄</span>
              </summary>
              <ul className="mt-2 space-y-1.5 text-sm text-cda-text">
                {helpTopics.map((topic) => (
                  <li key={topic} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cda-red" />
                    {topic}
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <ChannelLinks />
          <AccountPanel />
          <p className="rounded-xl border-l-4 border-cda-red bg-white px-4 py-3 text-sm text-cda-text shadow-sm">
            <strong className="text-cda-dark">Smell gas?</strong> Leave the property and call{" "}
            <strong>0800 111 999</strong>.
          </p>
        </aside>
      </main>

      <IntercomMessenger />

      <footer className="mt-auto bg-cda-blue text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-sm sm:flex-row sm:justify-between">
          <span>CDA Customer Care: 01949 862012 · Mon–Fri 9am–5pm, Sat 9am–1pm</span>
          <span>Demo built by NDI with ElevenLabs Agents</span>
        </div>
      </footer>
    </>
  );
}
