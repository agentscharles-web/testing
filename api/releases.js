// /api/releases  — Vercel Node.js Serverless Function
// Queries IGDB /v4/release_dates via Twitch OAuth and returns normalized JSON.
// Query params: from=YYYY-MM-DD, to=YYYY-MM-DD, days=120, region=8,
//               platforms=167,169, search=zelda, limit=200
// CORS: ALLOWED_ORIGIN or ALLOWED_ORIGINS (comma-separated) envs.

let tokenCache = { token: null, exp: 0 }; // per-lambda instance cache

export default async function handler(req, res) {
  try {
    // ---- CORS ----
    const origin = req.headers.origin || "";
    const allowed = pickAllowedOrigin(origin, process.env.ALLOWED_ORIGIN, process.env.ALLOWED_ORIGINS);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", allowed);
      res.setHeader("Vary", "Origin");
    } else {
      // default open if no env provided
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    // ---- Env ----
    const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
      return res.status(500).send("Missing Twitch credentials");
    }

    // ---- Parse query ----
    const url = new URL(req.url, "https://dummy.host");
    const q = Object.fromEntries(url.searchParams.entries());

    const now = new Date();
    const days = clampInt(q.days ? parseInt(q.days, 10) : 90, 1, 365);
    const fromIso = isIsoDate(q.from) ? q.from : now.toISOString().slice(0, 10);
    const toIso = isIsoDate(q.to) ? q.to : new Date(now.getTime() + days * 86400_000).toISOString().slice(0, 10);

    const region = q.region ? String(parseInt(q.region, 10)) : ""; // IGDB region enum
    const platforms = q.platforms
      ? q.platforms.split(",").map(s => s.trim()).filter(Boolean)
      : null;
    const search = (q.search || "").trim();
    const limit = clampInt(q.limit ? parseInt(q.limit, 10) : 500, 1, 500);

    const fromTs = Math.floor(new Date(fromIso).getTime() / 1000);
    const toTs = Math.floor(new Date(toIso).getTime() / 1000);

    // ---- Build IGDB query body ----
    const whereParts = [
      `date >= ${fromTs}`,
      `date <= ${toTs}`,
      `game != null`
    ];
    if (region) whereParts.push(`region = ${Number(region)}`);
    if (platforms?.length) whereParts.push(`platform = (${platforms.join(",")})`);

    let where = `where ${whereParts.join(" & ")};`;
    if (search) {
      const safe = search.replace(/"/g, '\\"');
      where = `where ${whereParts.join(" & ")} & game.name ~ *"${safe}"*;`;
    }

    const fields = [
      "game.name",
      "game.slug",
      "game.url",
      "game.cover.url",
      "game.involved_companies.company.name",
      "game.total_rating",
      "platform.name",
      "date",
      "human",
      "region",
      "status"
    ].join(", ");

    const body = `
      fields ${fields};
      ${where}
      sort date asc;
      limit ${limit};
    `;

    // ---- Twitch token (cached) ----
    const token = await getTwitchAppToken(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);

    // ---- Call IGDB ----
    const igdbRes = await fetch("https://api.igdb.com/v4/release_dates", {
      method: "POST",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Content-Type": "text/plain"
      },
      body
    });

    if (!igdbRes.ok) {
      const errText = await igdbRes.text();
      return res.status(500).send(`IGDB error ${igdbRes.status}: ${errText}`);
    }

    const raw = await igdbRes.json();

    // ---- Normalize ----
    const results = raw.map(r => normalizeRelease(r));

    // Cache at edge 15m; serve stale while revalidating 5m
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    return res.status(200).json({
      from: fromIso,
      to: toIso,
      count: results.length,
      results
    });
  } catch (e) {
    return res.status(500).send(e?.message || "Server error");
  }
}

/* ---------------- helpers ---------------- */

async function getTwitchAppToken(clientId, clientSecret) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp > now + 60) return tokenCache.token;

  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const r = await fetch(url, { method: "POST" });
  if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
  const data = await r.json();
  tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return tokenCache.token;
}

function normalizeRelease(r) {
  let cover = r?.game?.cover?.url || null;
  if (cover?.startsWith("//")) cover = "https:" + cover; // enforce https
  if (cover) cover = cover.replace("t_thumb", "t_cover_big"); // nicer size

  return {
    dateUnix: r?.date ?? null,
    dateHuman: r?.human ?? null,
    region: r?.region ?? null,
    status: r?.status ?? null,
    platform: r?.platform?.name ?? null,
    game: {
      name: r?.game?.name ?? "Unknown",
      slug: r?.game?.slug ?? null,
      url: r?.game?.url ?? null,
      cover,
      rating: (typeof r?.game?.total_rating === "number") ? Math.round(r.game.total_rating) : null,
      companies: (r?.game?.involved_companies || [])
        .map(ic => ic?.company?.name)
        .filter(Boolean)
    }
  };
}

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function clampInt(n, min, max) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function pickAllowedOrigin(origin, single, list) {
  // If ALLOWED_ORIGIN is set, use it; if ALLOWED_ORIGINS is comma list, match dynamically.
  if (single && single !== "*") return single;
  if (!list) return null;
  const arr = list.split(",").map(s => s.trim()).filter(Boolean);
  if (!origin) return null;
  return arr.includes(origin) ? origin : null;
}
