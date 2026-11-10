import type { Metadata } from "next";
import { connection } from "next/server";
import { getAiEmployees, type AiEmployee } from "@/lib/aiEmployees";

// NDI's AI Employees, from NDI's AI Employees API (src/lib/aiEmployees.ts), without prices, business cases or other
// internal details. Clara's and Aida's knowledge reads this page (an ElevenLabs URL document, searched when needed),
// so it is plain text. No password (see src/proxy.ts): it only holds what NDI's catalogue says to customers.

export const metadata: Metadata = {
  title: "AI Employees – NDI Assistant",
  description: "NDI's AI Employees: what each one does, its benefits, channels and integrations.",
  robots: { index: false, follow: false },
};

const UPDATED = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" });

function Line({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p className="mt-1">
      <span className="font-semibold">{label}:</span> {value}
    </p>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-1">
      <p className="font-semibold">{label}:</p>
      <ul className="list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function demoText(employee: AiEmployee) {
  if (employee.videoUrl) return `demo video ${employee.videoUrl}`;
  if (employee.demoComingSoon) return "Demo Coming Soon (no video yet; never promise a demo, a date or a finished product)";
  return "no public demo video yet (a live demo can be booked with the NDI team)";
}

export default async function AiEmployeesPage() {
  await connection(); // read at request time, never frozen at build time
  const list = await getAiEmployees();
  const groups = list
    ? [
        ...list.categories.map((category) => ({
          name: category.name,
          employees: list.employees.filter((employee) => employee.code.startsWith(`${category.prefix}-`)),
        })),
        {
          name: "Other AI Employees",
          employees: list.employees.filter((employee) => !list.categories.some((category) => employee.code.startsWith(`${category.prefix}-`))),
        },
      ].filter((group) => group.employees.length)
    : [];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 bg-white px-6 py-8 text-ink">
      <h1 className="text-2xl font-bold text-heading">NDI (New Digital Intelligence) – AI Employee Catalogue</h1>
      <p className="mt-2 text-sm text-muted">
        Every NDI AI Employee with its code, what it does, when it starts, the human in the loop, the time it saves, its
        benefits, channels, integrations and demo. This list has no prices: NDI works pay-per-use, and the NDI team gives
        prices in a call.
      </p>

      {list ? (
        <>
          {groups.map((group) => (
            <section key={group.name}>
              <h2 className="mt-8 text-xl font-semibold text-heading">{group.name}</h2>
              {group.employees.map((employee) => (
                <article key={employee.code} className="mt-5 text-sm">
                  <h3 className="text-base font-semibold text-heading">
                    {employee.code} {employee.name}
                  </h3>
                  <Line label="In short" value={employee.tagline} />
                  <Line label="Starts when" value={employee.trigger} />
                  <List label="What it does" items={employee.features} />
                  <Line label="Human in the loop" value={employee.humanInTheLoop} />
                  <Line label="Time saving" value={employee.timeSaving} />
                  <List label="Benefits" items={employee.benefits} />
                  <Line label="Outcome" value={employee.outcome} />
                  <Line label="Channels" value={employee.channels.join(", ")} />
                  <Line label="Integrations" value={employee.integrations.join(", ")} />
                  <Line label="Outputs" value={employee.outputs.join(", ")} />
                  <Line label="Demo" value={demoText(employee)} />
                </article>
              ))}
            </section>
          ))}
          <p className="mt-8 text-xs text-muted">
            {list.employees.length} AI Employees. List read from NDI&apos;s AI Employee catalogue on{" "}
            {UPDATED.format(new Date(list.checkedAt))} (UTC).
          </p>
        </>
      ) : (
        <p className="mt-6 text-sm">The AI Employee list cannot be shown right now. NDI&apos;s website: https://new-digital-intelligence.com</p>
      )}
    </main>
  );
}
