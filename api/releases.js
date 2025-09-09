let tokenCache = { token: null, exp: 0 };

export default async function handler(req, res) {
  try {
    const allowed = process.env.ALLOWED_ORIGIN || "*";
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
      return res.status(500).send("Missing Twitch credentials");
    }

    const url = new URL(req.url, "https://dummy.host");
    const q = Object.fromEntries(url.searchParams.entries());
    const now = new Date();
    const fromIso = q.from || now.toISOString().slice(0,10);
    const toIso = q.to || new Date(now.getTime()+90*24*3600*1000).toISOString().slice(0,10);
    const region = q.region;
    const platforms = q.platforms ? q.platforms.split(",").map(s=>s.trim()).filter(Boolean) : null;
    const search = (q.search || "").trim();
    const limit = Math.min(parseInt(q.limit || "500",10), 500);

    const fromTs = Math.floor(new Date(fromIso).getTime()/1000);
    const toTs   = Math.floor(new Date(toIso).getTime()/1000);

    const whereParts = [`date >= ${fromTs}`, `date <= ${toTs}`, `game != null`];
    if (region) whereParts.push(`region = ${Number(region)}`);
    if (platforms?.length) whereParts.push(`platform = (${platforms.join(",")})`);

    let where = `where ${whereParts.join(" & ")};`;
    if (search) where = `where ${whereParts.join(" & ")} & game.name ~ *"${search.replace(/"/g,'\\"')}"*;`;

    const fields = [
      "game.name","game.slug","game.url","game.cover.url",
      "game.involved_companies.company.name","game.total_rating",
      "platform.name","date","human","region","status"
    ].join(", ");

    const body = `
      fields ${fields};
      ${where}
      sort date asc;
      limit ${limit};
    `;

    const token = await getTwitchAppToken(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);

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

    const results = raw.map(r => {
      let cover = r.game?.cover?.url || null;
      if (cover?.startsWith("//")) cover = "https:" + cover;
      if (cover) cover = cover.replace("t_thumb","t_cover_big");
      return {
        dateUnix: r.date ?? null,
        dateHuman: r.human ?? null,
        region: r.region ?? null,
        status: r.status ?? null,
        platform: r.platform?.name ?? null,
        game: {
          name: r.game?.name ?? "Unknown",
          slug: r.game?.slug ?? null,
          url: r.game?.url ?? null,
          cover,
          rating: (typeof r.game?.total_rating === "number") ? Math.round(r.game.total_rating) : null,
          companies: (r.game?.involved_companies || []).map(ic => ic?.company?.name).filter(Boolean)
        }
      };
    });

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    return res.status(200).json({ from: fromIso, to: toIso, count: results.length, results });
  } catch (e) {
    return res.status(500).send(e?.message || "Server error");
  }
}

async function getTwitchAppToken(clientId, clientSecret) {
  const now = Math.floor(Date.now()/1000);
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
