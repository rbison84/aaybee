import type { Handler } from "@netlify/functions";

// ============================================
// SEND PUSH — server-side push notification relay
// ============================================
// Clients may no longer read other users' push tokens or call Expo's push
// API directly (that allowed spamming arbitrary content to any user).
// Instead they POST here with their Supabase access token; the function:
//   1. verifies the caller's JWT,
//   2. resolves the sender's display name server-side (not client-supplied),
//   3. builds the notification from a fixed template allowlist,
//   4. reads the target's push token with the service role,
//   5. forwards to Expo's push API.
//
// Required env (Netlify dashboard): SUPABASE_SERVICE_ROLE_KEY.
// Reuses EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from the
// site env (already set for og-handler).

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type TemplateParams = {
  code?: string;
  matchPercent?: number;
  movieTitle?: string;
  crewId?: string;
  playedCount?: number;
  totalCount?: number;
};

// Fixed templates — the client picks one and supplies bounded params; it can
// never set free-form title/body.
const TEMPLATES: Record<
  string,
  (sender: string, p: TemplateParams, crewName?: string) => { title: string; body: string; data: Record<string, unknown> }
> = {
  knockout_challenge: (sender, p) => ({
    title: `${sender} challenged you!`,
    body: "16 movies. One standing. Tap to play.",
    data: { type: "vs", code: p.code },
  }),
  knockout_completed: (sender, p) => ({
    title: `${sender} played your challenge!`,
    body: `${clampInt(p.matchPercent, 0, 100)}% taste match — see the results`,
    data: { type: "vs", code: p.code },
  }),
  friend_request: (sender) => ({
    title: "New friend request",
    body: `${sender} wants to connect on Aaybee`,
    data: { type: "friend_request" },
  }),
  decide_turn: (sender, p) => ({
    title: `${sender} picked ${cleanText(p.movieTitle, 60) || "a movie"}`,
    body: "Agree or disagree?",
    data: { type: "decide", code: p.code },
  }),
  circle_daily: (_sender, p, crewName) => ({
    title: crewName || "Your circle",
    body: `${clampInt(p.playedCount, 0, 999)}/${clampInt(p.totalCount, 0, 999)} have played today — don't be last`,
    data: { type: "daily", crewId: p.crewId },
  }),
  circle_results: (_sender, p, crewName) => ({
    title: crewName || "Your circle",
    body: "everyone's played — see how your circle ranked",
    data: { type: "daily", crewId: p.crewId },
  }),
  referral: (sender) => ({
    title: "Your friend joined!",
    body: `${sender} just joined Aaybee — challenge them to see who has better taste`,
    data: { type: "referral" },
  }),
};

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]/g, " ").slice(0, maxLen);
}

const CODE_RE = /^[A-Za-z0-9]{4,8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyCaller(token: string): Promise<{ id: string } | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? { id: user.id } : null;
}

async function serviceGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? (rows[0] as T) : null;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    console.error("[send-push] Missing Supabase env vars");
    return { statusCode: 500, body: "Server misconfigured" };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { statusCode: 401, body: "Missing auth token" };
  }

  let payload: { targetUserId?: string; template?: string; params?: TemplateParams };
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { targetUserId, template, params = {} } = payload;
  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return { statusCode: 400, body: "Invalid targetUserId" };
  }
  const buildTemplate = template ? TEMPLATES[template] : undefined;
  if (!buildTemplate) {
    return { statusCode: 400, body: "Unknown template" };
  }
  if (params.code && !CODE_RE.test(params.code)) {
    return { statusCode: 400, body: "Invalid code" };
  }
  if (params.crewId && !UUID_RE.test(params.crewId)) {
    return { statusCode: 400, body: "Invalid crewId" };
  }

  const caller = await verifyCaller(token);
  if (!caller) {
    return { statusCode: 401, body: "Invalid auth token" };
  }
  if (caller.id === targetUserId) {
    return { statusCode: 400, body: "Cannot notify yourself" };
  }

  // Sender name comes from the caller's own profile, never from the payload
  const senderProfile = await serviceGet<{ display_name: string | null }>(
    `user_profiles?id=eq.${caller.id}&select=display_name`
  );
  const senderName = cleanText(senderProfile?.display_name, 40) || "Someone";

  // Crew name for circle templates
  let crewName: string | undefined;
  if (params.crewId) {
    const crew = await serviceGet<{ name: string | null }>(
      `crews?id=eq.${params.crewId}&select=name`
    );
    crewName = cleanText(crew?.name, 40) || undefined;
  }

  // Target's push token (service role — the table is owner-only for clients)
  const tokenRow = await serviceGet<{ token: string | null }>(
    `user_push_tokens?user_id=eq.${targetUserId}&select=token`
  );
  if (!tokenRow?.token) {
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: "no_token" }) };
  }

  const { title, body, data } = buildTemplate(senderName, params, crewName);

  try {
    const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: tokenRow.token, sound: "default", title, body, data }),
    });
    if (!pushRes.ok) {
      console.error("[send-push] Expo push failed:", pushRes.status);
      return { statusCode: 502, body: JSON.stringify({ sent: false, reason: "expo_error" }) };
    }
  } catch (err) {
    console.error("[send-push] Expo push error:", err);
    return { statusCode: 502, body: JSON.stringify({ sent: false, reason: "expo_error" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ sent: true }) };
};
