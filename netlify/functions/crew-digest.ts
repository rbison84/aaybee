import { schedule } from "@netlify/functions";

// ============================================
// WEEKLY CREW DIGEST — scheduled push
// ============================================
// Every Sunday 18:00 UTC, for each crew that played this week:
//   - find the most controversial movie (highest rank spread across members)
//   - push "「crew」 Tenet split your circle — see the week" to every member
// Re-engages lapsed members with the crew's conflict, the app's stickiest data.
//
// Required env (Netlify dashboard): SUPABASE_SERVICE_ROLE_KEY.
// Reuses EXPO_PUBLIC_SUPABASE_URL from the site env.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function serviceGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function sendExpoPush(token: string, title: string, body: string, data: Record<string, unknown>) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: token, sound: "default", title, body, data }),
    });
  } catch (err) {
    console.error("[crew-digest] Expo push error:", err);
  }
}

interface CrewRow { id: string; name: string }
interface PickRow { crew_id: string; user_id: string; ranking: string[]; daily_number: number }
interface MovieRow { id: string; title: string }
interface TokenRow { user_id: string; token: string }

interface Controversy {
  movieId: string;
  spread: number;         // max rank - min rank across members
  highUser: string;       // user_id who ranked it best
  highRank: number;
  lowUser: string;
  lowRank: number;
  players: number;
}

/** Most controversial movie across all of this week's picks for one crew. */
function findControversy(picks: PickRow[]): Controversy | null {
  // rank per movie per user (best rank if a user played multiple dailies)
  const byMovie = new Map<string, Map<string, number>>();
  for (const pick of picks) {
    (pick.ranking || []).forEach((movieId, idx) => {
      const rank = idx + 1;
      let userRanks = byMovie.get(movieId);
      if (!userRanks) {
        userRanks = new Map();
        byMovie.set(movieId, userRanks);
      }
      const prev = userRanks.get(pick.user_id);
      if (prev === undefined || rank < prev) userRanks.set(pick.user_id, rank);
    });
  }

  let best: Controversy | null = null;
  for (const [movieId, userRanks] of byMovie) {
    if (userRanks.size < 2) continue; // controversy needs 2+ players
    let highUser = "", lowUser = "";
    let highRank = Infinity, lowRank = -Infinity;
    for (const [userId, rank] of userRanks) {
      if (rank < highRank) { highRank = rank; highUser = userId; }
      if (rank > lowRank) { lowRank = rank; lowUser = userId; }
    }
    const spread = lowRank - highRank;
    if (!best || spread > best.spread) {
      best = { movieId, spread, highUser, highRank, lowUser, lowRank, players: userRanks.size };
    }
  }

  return best && best.spread >= 3 ? best : null;
}

export const handler = schedule("0 18 * * 0", async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("[crew-digest] Missing Supabase env vars");
    return { statusCode: 500 };
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // This week's picks, all crews at once
  const picks = await serviceGet<PickRow>(
    `crew_daily_picks?created_at=gte.${since}&select=crew_id,user_id,ranking,daily_number`
  );
  if (picks.length === 0) {
    console.log("[crew-digest] No picks this week");
    return { statusCode: 200 };
  }

  const crewIds = [...new Set(picks.map(p => p.crew_id))];
  const crews = await serviceGet<CrewRow>(
    `crews?id=in.(${crewIds.join(",")})&select=id,name`
  );
  const crewById = new Map(crews.map(c => [c.id, c]));

  let digestsSent = 0;

  for (const crewId of crewIds) {
    const crew = crewById.get(crewId);
    if (!crew) continue;

    const crewPicks = picks.filter(p => p.crew_id === crewId);
    const controversy = findControversy(crewPicks);
    if (!controversy) continue;

    // Movie title + member names
    const [movies, profiles, members] = await Promise.all([
      serviceGet<MovieRow>(`movies?id=eq.${encodeURIComponent(controversy.movieId)}&select=id,title`),
      serviceGet<{ id: string; display_name: string | null }>(
        `user_profiles?id=in.(${controversy.highUser},${controversy.lowUser})&select=id,display_name`
      ),
      serviceGet<{ user_id: string }>(`crew_members?crew_id=eq.${crewId}&select=user_id`),
    ]);

    const movieTitle = movies[0]?.title;
    if (!movieTitle) continue;

    const nameOf = (id: string) =>
      profiles.find(p => p.id === id)?.display_name?.slice(0, 20) || "someone";

    const title = crew.name.slice(0, 40);
    const body = `${movieTitle} split your circle — ${nameOf(controversy.highUser)} #${controversy.highRank}, ${nameOf(controversy.lowUser)} #${controversy.lowRank}. Who's right?`;

    // Push to every member with a token
    const memberIds = members.map(m => m.user_id);
    if (memberIds.length === 0) continue;
    const tokens = await serviceGet<TokenRow>(
      `user_push_tokens?user_id=in.(${memberIds.join(",")})&select=user_id,token`
    );

    for (const t of tokens) {
      await sendExpoPush(t.token, title, body, { type: "daily", crewId });
    }
    digestsSent += tokens.length;
  }

  console.log(`[crew-digest] Sent ${digestsSent} digest pushes across ${crewIds.length} crews`);
  return { statusCode: 200 };
});
