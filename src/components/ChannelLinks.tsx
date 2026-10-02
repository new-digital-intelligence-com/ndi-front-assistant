import type { ReactNode } from "react";

const SUPPORT_EMAIL = "cda_domestic_appliances@new-digital-intelligence.com";
/** Ellie's phone line (Twilio, answered by ElevenLabs). */
const PHONE_LINE = { display: "+44 7576 593472", dial: "+447576593472" };

type Channel = {
  name: string;
  detail: string;
  href: string;
  iconClassName: string;
  icon: ReactNode;
};

const channels: Channel[] = [
  {
    name: "Phone",
    detail: `${PHONE_LINE.display} · call Ellie`,
    href: `tel:${PHONE_LINE.dial}`,
    iconClassName: "bg-[#16a34a]",
    icon: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    ),
  },
  {
    name: "Email",
    detail: SUPPORT_EMAIL,
    href: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent("Question for CDA")}`,
    iconClassName: "bg-[#ea4335]",
    icon: (
      <>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </>
    ),
  },
  {
    name: "Telegram",
    detail: "@CDA_2026_Support_Bot",
    href: "https://t.me/CDA_2026_Support_Bot",
    iconClassName: "bg-[#229ed9]",
    icon: (
      <>
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22l-4-9-9-4 20-7z" />
      </>
    ),
  },
  {
    name: "Instagram",
    detail: "@new_digital_intelligence",
    href: "https://ig.me/m/new_digital_intelligence",
    iconClassName: "bg-linear-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af]",
    icon: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </>
    ),
  },
  {
    name: "Messenger",
    detail: "New Digital Intelligence",
    href: "https://m.me/1450409441479124",
    iconClassName: "bg-[#0866ff]",
    icon: (
      <>
        <path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.4 5.5 3.7 7.2V22l3.4-1.9c.9.3 1.9.4 2.9.4 5.5 0 10-4.1 10-9.2S17.5 2 12 2z" />
        <polyline points="7 13 10 10 13 12.5 17 9" />
      </>
    ),
  },
];

export function ChannelLinks() {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-cda-dark">Message Ellie on your app</h2>
      <ul className="mt-2 space-y-1.5">
        {channels.map((channel) => (
          <li key={channel.name}>
            <a
              href={channel.href}
              target={channel.href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-cda-grey p-2.5 transition hover:border-cda-red hover:bg-cda-grey-light"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white ${channel.iconClassName}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {channel.icon}
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-cda-dark">{channel.name}</span>
                <span className="block text-xs text-cda-text wrap-anywhere">{channel.detail}</span>
              </span>
              <span className="text-cda-text" aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
