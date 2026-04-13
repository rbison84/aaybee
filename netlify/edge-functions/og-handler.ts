import { Context } from "https://edge.netlify.com";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Bot User-Agent patterns for social media crawlers
const BOT_PATTERNS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "LinkedInBot",
  "Discordbot",
  "Slackbot",
  "WhatsApp",
  "TelegramBot",
  "Googlebot",
  "bingbot",
  "Applebot",
  "iMessageLinkPreview",
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p.toLowerCase()));
}

function getSupabase() {
  const url = Deno.env.get("EXPO_PUBLIC_SUPABASE_URL") || "";
  const key = Deno.env.get("EXPO_PUBLIC_SUPABASE_ANON_KEY") || "";
  return createClient(url, key);
}

function ogHtml({
  title,
  description,
  imageUrl,
  url,
}: {
  title: string;
  description: string;
  imageUrl?: string;
  url: string;
}): Response {
  const imgTag = imageUrl
    ? `<meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:image" content="${imageUrl}" />`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  ${imgTag}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="theme-color" content="#C8FF00" />
  <!-- Redirect humans who somehow land here -->
  <meta http-equiv="refresh" content="0;url=${url}" />
</head>
<body>
  <p>Redirecting to <a href="${url}">Aaybee</a>...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

// ============================================
// HANDLERS PER ROUTE TYPE
// ============================================

async function handleDaily(requestUrl: URL): Promise<Response> {
  return ogHtml({
    title: "Aaybee Daily — Rank today's movies",
    description:
      "How do you rank today's 9 movies? Play the daily movie ranking challenge and compare with your circle.",
    url: requestUrl.origin + "/daily",
  });
}

async function handleVs(
  requestUrl: URL,
  code: string
): Promise<Response> {
  const supabase = getSupabase();

  // Check knockout_challenges first (new system)
  const { data: knockout } = await supabase
    .from("knockout_challenges")
    .select("code, status, creator_name, challenger_name, match_percent, creator_winner")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (knockout) {
    if (knockout.status === "complete" && knockout.match_percent != null) {
      const winner = knockout.creator_winner as any;
      return ogHtml({
        title: `${knockout.creator_name} & ${knockout.challenger_name}: ${knockout.match_percent}% taste match`,
        description: winner?.title
          ? `Last movie standing: ${winner.title}. Can you beat their match?`
          : `${knockout.match_percent}% taste match on a 16-movie knockout. Can you beat it?`,
        url: requestUrl.origin + `/vs/${code}`,
      });
    }

    // Pending challenge
    return ogHtml({
      title: `${knockout.creator_name} challenged you on Aaybee`,
      description: "16 movies. 4 rounds. One last movie standing. Tap to play.",
      url: requestUrl.origin + `/vs/${code}`,
    });
  }

  // Fallback: check old vs_challenges table
  const { data: challenge } = await supabase
    .from("vs_challenges")
    .select("code, status, score, results, challenger_id")
    .eq("code", code.toUpperCase())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge) {
    return ogHtml({
      title: "Aaybee VS — Movie Taste Challenge",
      description: "16 movies. One standing. Compare your movie taste with a friend.",
      url: requestUrl.origin + `/vs/${code}`,
    });
  }

  if (challenge.status === "complete" && challenge.results) {
    const r = challenge.results as any;
    const score = challenge.score || 0;
    return ogHtml({
      title: `${r.challengerName} & ${r.challengedName}: ${score}/10 on Aaybee VS`,
      description: `They agreed on ${score} out of 10 movie matchups. How similar is your taste?`,
      imageUrl: `${requestUrl.origin}/.netlify/functions/og-image?type=vs&code=${code}`,
      url: requestUrl.origin + `/vs/${code}`,
    });
  }

  let challengerName = "Someone";
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", challenge.challenger_id)
    .maybeSingle();
  if (profile?.display_name) challengerName = profile.display_name;

  return ogHtml({
    title: `${challengerName} challenged you on Aaybee VS`,
    description:
      "Compare your movie taste — who picks better? Open the link to accept the challenge.",
    url: requestUrl.origin + `/vs/${code}`,
  });
}

async function handleShare(
  requestUrl: URL,
  code: string
): Promise<Response> {
  const supabase = getSupabase();

  const { data: share } = await supabase
    .from("share_codes")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (share) {
    return ogHtml({
      title: share.title || "My Aaybee Results",
      description: share.description || "Check out my movie rankings on Aaybee.",
      imageUrl: `${requestUrl.origin}/.netlify/functions/og-image?type=${share.type}&code=${code}`,
      url: requestUrl.origin + `/share/${code}`,
    });
  }

  return ogHtml({
    title: "Aaybee — Your Movies, Decided",
    description: "Rank movies, challenge friends, find your taste match.",
    url: requestUrl.origin + `/share/${code}`,
  });
}

async function handleChallenge(
  requestUrl: URL,
  code: string
): Promise<Response> {
  const supabase = getSupabase();
  const { data: challenge } = await supabase
    .from("friend_challenges")
    .select("creator_name, status, match_percent, challenger_name, movies")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!challenge) {
    return ogHtml({
      title: "Aaybee — Movie Taste Challenge",
      description: "Rank movies and see how your taste compares with a friend.",
      url: requestUrl.origin + `/challenge/${code}`,
    });
  }

  if (challenge.status === "complete") {
    const pct = Math.round(challenge.match_percent || 0);
    return ogHtml({
      title: `${challenge.creator_name} & ${challenge.challenger_name}: ${pct}% match`,
      description: `They ranked movies and matched ${pct}%. Can you do better?`,
      imageUrl: `${requestUrl.origin}/.netlify/functions/og-image?type=challenge&code=${code}`,
      url: requestUrl.origin + `/challenge/${code}`,
    });
  }

  const movieCount = Array.isArray(challenge.movies)
    ? challenge.movies.length
    : 10;
  return ogHtml({
    title: `${challenge.creator_name} challenged you to rank ${movieCount} movies`,
    description:
      "Rank the same movies and see if your taste matches. No signup needed.",
    imageUrl: `${requestUrl.origin}/.netlify/functions/og-image?type=challenge&code=${code}`,
    url: requestUrl.origin + `/challenge/${code}`,
  });
}

async function handleCrew(
  requestUrl: URL,
  code: string
): Promise<Response> {
  const supabase = getSupabase();
  const { data: crew } = await supabase
    .from("crews")
    .select("name, code")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (crew) {
    return ogHtml({
      title: `Join "${crew.name}" on Aaybee`,
      description: "Join this circle, play the daily, and see who has the hottest takes.",
      url: requestUrl.origin + `/crew/${code}`,
    });
  }

  return ogHtml({
    title: "Join a Circle on Aaybee",
    description: "Join a circle, play the daily movie ranking, and compare with friends.",
    url: requestUrl.origin + `/crew/${code}`,
  });
}

async function handleDecide(
  requestUrl: URL,
  code: string
): Promise<Response> {
  const supabase = getSupabase();
  const { data: session } = await supabase
    .from("decide_sessions")
    .select("person1_name, status, winner_movie")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (session?.status === "complete" && session.winner_movie) {
    const winner = session.winner_movie as any;
    return ogHtml({
      title: `Tonight's movie: ${winner.title}`,
      description: `${session.person1_name} decided on Aaybee. Start your own session.`,
      url: requestUrl.origin + `/decide/${code}`,
    });
  }

  if (session) {
    return ogHtml({
      title: `${session.person1_name} wants to decide what to watch`,
      description: "Join their session — 16 movies each, then negotiate until one is left.",
      url: requestUrl.origin + `/decide/${code}`,
    });
  }

  return ogHtml({
    title: "Decide what to watch — Aaybee",
    description: "Can't pick a movie? Knockout + negotiate with a friend until one is left.",
    url: requestUrl.origin + `/decide/${code}`,
  });
}

// ============================================
// MAIN EDGE FUNCTION
// ============================================

export default async function handler(
  request: Request,
  context: Context
): Promise<Response> {
  const ua = request.headers.get("user-agent") || "";

  // Only intercept for bots — humans get the SPA
  if (!isBot(ua)) {
    return context.next();
  }

  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();

  try {
    // /daily
    if (path === "/daily" || path === "/daily/") {
      return await handleDaily(url);
    }

    // /vs/CODE
    const vsMatch = path.match(/^\/vs\/([a-z0-9]{4,8})$/);
    if (vsMatch) {
      return await handleVs(url, vsMatch[1]);
    }

    // /share/CODE
    const shareMatch = path.match(/^\/share\/([a-z0-9]{4,8})$/);
    if (shareMatch) {
      return await handleShare(url, shareMatch[1]);
    }

    // /challenge/CODE
    const challengeMatch = path.match(/^\/challenge\/([a-z0-9]{4,8})$/);
    if (challengeMatch) {
      return await handleChallenge(url, challengeMatch[1]);
    }

    // /crew/CODE
    const crewMatch = path.match(/^\/crew\/([a-z0-9]{4,8})$/);
    if (crewMatch) {
      return await handleCrew(url, crewMatch[1]);
    }

    // /decide/CODE
    const decideMatch = path.match(/^\/decide\/([a-z0-9]{4,8})$/);
    if (decideMatch) {
      return await handleDecide(url, decideMatch[1]);
    }
  } catch (err) {
    console.error("[og-handler] Error:", err);
  }

  // Fallback: pass through to SPA
  return context.next();
}
