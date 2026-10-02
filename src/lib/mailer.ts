// Sends email from the CDA demo Gmail mailbox (gmail_sender) with a Gmail app password
// (gmail_app_password). Server side only.

import nodemailer from "nodemailer";

type Transport = ReturnType<typeof nodemailer.createTransport>;
let transport: Transport | null = null;

function credentials() {
  const user = process.env.gmail_sender;
  // Google shows app passwords in groups of four; the spaces are not part of the password.
  const pass = process.env.gmail_app_password?.replace(/\s+/g, "");
  if (!user || !pass) throw new Error("gmail_sender and gmail_app_password must be set");
  return { user, pass };
}

export function mailConfigured(): boolean {
  return Boolean(process.env.gmail_sender && process.env.gmail_app_password);
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  const { user, pass } = credentials();
  transport ??= nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({ from: `"CDA Customer Care (demo)" <${user}>`, ...message });
}
