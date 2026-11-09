/** Read emails captured by the local Mailpit started with `supabase start`. */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type Summary = { ID: string; Subject: string; Created: string };

/** Wait for the newest email to `to` whose subject contains `subject`; return its first link matching `linkPattern`. */
export async function waitForEmailLink(to: string, subject: string, linkPattern: RegExp): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: Summary[] };
      const match = messages.find((m) => m.Subject.includes(subject));
      if (match) {
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()) as { HTML: string };
        const hrefs = [...msg.HTML.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
        const link = hrefs.find((h) => linkPattern.test(h));
        if (!link) throw new Error(`No link matching ${linkPattern} in "${match.Subject}"`);
        return link;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email to ${to} with subject containing "${subject}"`);
}
