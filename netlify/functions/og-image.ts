import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "fs";
import { join } from "path";

// ============================================
// SUPABASE CLIENT
// ============================================

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

// ============================================
// FONT LOADING
// ============================================

let fontData: ArrayBuffer | null = null;

async function getFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;

  // Use bundled font or fetch from Google Fonts
  try {
    const fontPath = join(__dirname, "Inter-Bold.woff");
    fontData = readFileSync(fontPath).buffer as ArrayBuffer;
  } catch {
    // Fallback: fetch Inter Bold from Google Fonts CDN
    const res = await fetch(
      "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf"
    );
    fontData = await res.arrayBuffer();
  }
  return fontData;
}

// ============================================
// IMAGE RENDERERS
// ============================================

function vsImage(data: {
  challengerName: string;
  challengedName: string;
  score: number;
}) {
  const pct = Math.round((data.score / 10) * 100);
  return {
    type: "div" as const,
    props: {
      style: {
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#13111C",
        color: "#F5F3FF",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div" as const,
          props: {
            style: { fontSize: 32, color: "#A78BFA", marginBottom: 16 },
            children: "AAYBEE VS",
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 64, fontWeight: 700, marginBottom: 24 },
            children: `${data.score}/10`,
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 36, color: "#B8B0C9" },
            children: `${data.challengerName} & ${data.challengedName}`,
          },
        },
        {
          type: "div" as const,
          props: {
            style: {
              fontSize: 24,
              color: "#A78BFA",
              marginTop: 32,
              padding: "8px 24px",
              border: "2px solid #A78BFA",
              borderRadius: 12,
            },
            children: `${pct}% taste match`,
          },
        },
      ],
    },
  };
}

function challengeImage(data: {
  creatorName: string;
  challengerName?: string;
  matchPercent?: number;
  movieTitles: string[];
  status: string;
}) {
  const movieList = data.movieTitles.slice(0, 5).join(" · ");

  if (data.status === "complete" && data.challengerName) {
    const pct = Math.round(data.matchPercent || 0);
    return {
      type: "div" as const,
      props: {
        style: {
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#13111C",
          color: "#F5F3FF",
          fontFamily: "Inter",
        },
        children: [
          {
            type: "div" as const,
            props: {
              style: { fontSize: 28, color: "#A78BFA", marginBottom: 16 },
              children: "AAYBEE CHALLENGE",
            },
          },
          {
            type: "div" as const,
            props: {
              style: { fontSize: 72, fontWeight: 700, marginBottom: 16 },
              children: `${pct}%`,
            },
          },
          {
            type: "div" as const,
            props: {
              style: { fontSize: 32, color: "#B8B0C9", marginBottom: 32 },
              children: `${data.creatorName} & ${data.challengerName}`,
            },
          },
          {
            type: "div" as const,
            props: {
              style: { fontSize: 20, color: "#6B6280", maxWidth: 900, textAlign: "center" as const },
              children: movieList,
            },
          },
        ],
      },
    };
  }

  // Pending challenge
  return {
    type: "div" as const,
    props: {
      style: {
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#13111C",
        color: "#F5F3FF",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div" as const,
          props: {
            style: { fontSize: 28, color: "#A78BFA", marginBottom: 24 },
            children: "AAYBEE CHALLENGE",
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 48, fontWeight: 700, marginBottom: 16 },
            children: `${data.creatorName} challenged you`,
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 28, color: "#B8B0C9", marginBottom: 32 },
            children: `Rank ${data.movieTitles.length} movies and compare your taste`,
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 20, color: "#6B6280", maxWidth: 900, textAlign: "center" as const },
            children: movieList,
          },
        },
      ],
    },
  };
}

function dailyImage(data: {
  dailyNumber: number;
  categoryTitle: string;
  seenCount: number;
  topMovie: string;
}) {
  return {
    type: "div" as const,
    props: {
      style: {
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#13111C",
        color: "#F5F3FF",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div" as const,
          props: {
            style: { fontSize: 28, color: "#A78BFA", marginBottom: 16 },
            children: `AAYBEE DAILY #${data.dailyNumber}`,
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 56, fontWeight: 700, marginBottom: 16 },
            children: data.categoryTitle,
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 32, color: "#B8B0C9", marginBottom: 24 },
            children: `🎬 ${data.seenCount}/9`,
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 28, color: "#86EFAC" },
            children: `#1: ${data.topMovie}`,
          },
        },
      ],
    },
  };
}

function fallbackImage() {
  return {
    type: "div" as const,
    props: {
      style: {
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#13111C",
        color: "#F5F3FF",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div" as const,
          props: {
            style: { fontSize: 72, fontWeight: 700, marginBottom: 16 },
            children: "aaybee",
          },
        },
        {
          type: "div" as const,
          props: {
            style: { fontSize: 28, color: "#B8B0C9" },
            children: "your personal movie ranking",
          },
        },
      ],
    },
  };
}

// ============================================
// MAIN HANDLER
// ============================================

export default async function handler(req: Request, context: Context) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "";
  const code = url.searchParams.get("code") || "";
  const supabase = getSupabase();

  let element: any = fallbackImage();

  try {
    if (type === "vs" && code) {
      const { data: challenge } = await supabase
        .from("vs_challenges")
        .select("score, results")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (challenge?.results) {
        const r = challenge.results as any;
        element = vsImage({
          challengerName: r.challengerName || "Player 1",
          challengedName: r.challengedName || "Player 2",
          score: challenge.score || 0,
        });
      }
    } else if (type === "challenge" && code) {
      const { data: challenge } = await supabase
        .from("friend_challenges")
        .select("creator_name, challenger_name, match_percent, movies, status")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (challenge) {
        const movies = challenge.movies as any[];
        element = challengeImage({
          creatorName: challenge.creator_name,
          challengerName: challenge.challenger_name,
          matchPercent: challenge.match_percent,
          movieTitles: movies.map((m: any) => m.title),
          status: challenge.status,
        });
      }
    } else if (type === "daily" && code) {
      const { data: share } = await supabase
        .from("share_codes")
        .select("image_data")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (share?.image_data) {
        const d = share.image_data as any;
        element = dailyImage({
          dailyNumber: d.dailyNumber || 0,
          categoryTitle: d.categoryTitle || "",
          seenCount: d.seenCount || 0,
          topMovie: d.topMovie || "",
        });
      }
    }
  } catch (err) {
    console.error("[og-image] Data fetch error:", err);
  }

  // Render with satori
  const font = await getFont();
  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Inter",
        data: font,
        weight: 700,
        style: "normal",
      },
    ],
  });

  // Convert SVG to PNG
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width" as const, value: 1200 },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(pngBuffer, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}

export const config = {
  path: "/.netlify/functions/og-image",
};
