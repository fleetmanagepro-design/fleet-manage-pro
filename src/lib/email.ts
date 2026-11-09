import "server-only";
import { serverEnv } from "@/lib/env.server";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email delivery is not configured (set RESEND_API_KEY)");
    this.name = "EmailNotConfiguredError";
  }
}

/** Escape a value for interpolation into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

/** Send one transactional email. Throws on failure; callers decide what to show. */
export async function sendEmail(email: Email): Promise<void> {
  const { RESEND_API_KEY, MAILPIT_URL, EMAIL_FROM } = serverEnv;

  if (RESEND_API_KEY) {
    // https://resend.com/docs/api-reference/emails/send-email
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
    }
    return;
  }

  if (MAILPIT_URL) {
    // Local development: https://mailpit.axllent.org/docs/api-v1/view.html#post-/api/v1/send
    const from = parseFrom(EMAIL_FROM);
    const res = await fetch(`${MAILPIT_URL.replace(/\/+$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: from.email, Name: from.name },
        To: [{ Email: email.to }],
        Subject: email.subject,
        HTML: email.html,
        Text: email.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Mailpit responded ${res.status}: ${await res.text()}`);
    }
    return;
  }

  throw new EmailNotConfiguredError();
}
