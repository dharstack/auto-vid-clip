export interface EventSubNotification {
  subscription?: { type?: string };
  event?: { broadcaster_user_id?: string; broadcaster_user_login?: string };
}

export async function verifyEventSubSignature(request: Request, secret: string): Promise<boolean> {
  const messageId = request.headers.get("Twitch-Eventsub-Message-Id") ?? "";
  const timestamp = request.headers.get("Twitch-Eventsub-Message-Timestamp") ?? "";
  const signature = request.headers.get("Twitch-Eventsub-Message-Signature") ?? "";
  if (!messageId || !timestamp || !signature) return false;
  const age = Math.abs(Date.now() - Date.parse(timestamp));
  if (!Number.isFinite(age) || age > 10 * 60 * 1000) return false;
  const body = await request.clone().text();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(messageId + timestamp + body));
  const expected = "sha256=" + [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}
