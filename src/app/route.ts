import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Landing page: serve the K.Rideus prototype hub (krideus-prototype) at "/"
 * without a redirect. The prototype's markup uses paths relative to
 * "/prototype/" (its served location), so we inject a <base href="/prototype/">
 * right after <head> — every relative URL (js/, includes/, ../assets, category
 * links) then resolves correctly while the address bar stays at "/".
 */
export async function GET() {
  const file = join(process.cwd(), "krideus-prototype", "prototype", "index.html");
  let html: string;
  try {
    html = await readFile(file, "utf8");
  } catch {
    return new Response("Landing page not found", { status: 404 });
  }
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="/prototype/">`);
  // With a <base>, in-page anchor links (href="#...") would resolve against
  // /prototype/ and 404. Pin them to the current URL ("/") so they stay
  // in-page instead of navigating away.
  html = html.replace(/href="#/g, 'href="/#');
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
