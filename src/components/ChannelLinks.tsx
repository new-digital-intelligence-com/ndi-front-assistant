import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

// Still to come (CHANNEL_SETUP.md): while one of these is empty, its button is not shown.
/** The NDI mailbox Clara answers. */
const SUPPORT_EMAIL = "contact@new-digital-intelligence.com";
/** The Telegram bot's username, without the @. */
const TELEGRAM_BOT = "ndi2026bot";
/** Clara's phone line (Twilio, answered by ElevenLabs), as shown and as dialled (+...). */
const PHONE_LINE = { display: "", dial: "" };

type Channel = {
  name: string;
  detail: string;
  href: string;
  /** Not set up yet. */
  hidden?: boolean;
  iconClassName: string;
  icon: ReactNode;
};

const channels: Channel[] = [
  {
    name: "Phone",
    detail: `${PHONE_LINE.display} · call Clara`,
    href: `tel:${PHONE_LINE.dial}`,
    hidden: !PHONE_LINE.dial,
    iconClassName: "bg-[#16a34a]",
    icon: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    ),
  },
  {
    name: "Email",
    detail: SUPPORT_EMAIL,
    href: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent("Question for NDI")}`,
    hidden: !SUPPORT_EMAIL,
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
    detail: `@${TELEGRAM_BOT}`,
    href: `https://t.me/${TELEGRAM_BOT}`,
    hidden: !TELEGRAM_BOT,
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
    <section className="rounded-2xl bg-surface p-4">
      <h2 className="text-sm font-semibold text-heading">Message Clara on your app</h2>
      <ul className="mt-2.5 space-y-1.5">
        {channels.filter((channel) => !channel.hidden).map((channel) => (
          <li key={channel.name}>
            <a
              href={channel.href}
              target={channel.href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl bg-white p-2 shadow-sm transition hover:-translate-y-px hover:shadow-md"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${channel.iconClassName}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
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
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[13px] font-semibold text-heading">{channel.name}</span>
                <span className="block text-[11px] text-muted wrap-anywhere">{channel.detail}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition group-hover:text-brand" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
