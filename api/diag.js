export default async function handler(req, res) {
  const hasId = !!process.env.TWITCH_CLIENT_ID;
  const hasSecret = !!process.env.TWITCH_CLIENT_SECRET;

  const out = { hasClientId: hasId, hasClientSecret: hasSecret };

  // Step 1: try token fetch (don’t return the token)
  try {
    const params = new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID || "",
      client_secret: process.env.TWITCH_CLIENT_SECRET || "",
      grant_type: "client_credentials"
    });
    const r = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: params });
    out.tokenStatus = r.status;
    if (!r.ok) {
      out.tokenError = await r.text();
      return res.status(200).json(out); // stop here – creds issue
    }
  } catch (e) {
    out.tokenException = String(e);
    return res.status(200).json(out);
  }

  // Step 2: try a minimal IGDB call
  try {
    // get a token again (simple, avoids sharing code)
    const params = new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID || "",
      client_secret: process.env.TWITCH_CLIENT_SECRET || "",
      grant_type: "client_credentials"
    });
    const tokRes = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: params });
    const tokJson = await tokRes.json();
    const token = tokJson.access_token;

    const igdbRes = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID || "",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Content-Type": "text/plain"
      },
      body: "fields id,name; limit 1;"
    });
    out.igdbStatus = igdbRes.status;
    if (!igdbRes.ok) {
      out.igdbError = await igdbRes.text();
    } else {
      const j = await igdbRes.json();
      out.sampleGames = j.length;
    }
  } catch (e) {
    out.igdbException = String(e);
  }

  res.status(200).json(out);
}
