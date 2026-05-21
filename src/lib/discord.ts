/**
 * Thin Discord webhook helper. Reads DISCORD_WEBHOOK_URL from env
 * (server-only — never expose to the client). Returns true on success,
 * false on any failure. Callers should fire-and-forget so a Discord
 * outage never breaks core flows.
 *
 * Discord webhook payload shape:
 *   { content?: string, embeds?: Embed[], username?, avatar_url? }
 * https://discord.com/developers/docs/resources/webhook#execute-webhook
 */
export type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
  author?: { name: string; url?: string; icon_url?: string };
};

export async function notifyDiscord(payload: {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
}): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
