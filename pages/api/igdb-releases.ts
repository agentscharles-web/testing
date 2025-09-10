```ts


const rawPlatforms = (process.env.IGDB_PLATFORM_IDS || '').trim()
const platformFilter = rawPlatforms
? ` & platform = (${rawPlatforms.split(',').map((s) => s.trim()).filter(Boolean).join(',')})`
: ''


const body = `
fields game.name, game.slug, game.url, game.summary, game.cover.image_id, platform.name, date, human, region, game.genres.name, game.involved_companies.company.name;
where date >= ${now} & date < ${until} & game != null${platformFilter};
sort date asc;
limit 200;
`


const igdbRes = await fetch(IGDB_URL, {
method: 'POST',
headers: {
'Client-ID': process.env.TWITCH_CLIENT_ID as string,
Authorization: `Bearer ${token}`,
'Content-Type': 'text/plain',
},
body,
next: { revalidate: 3600 },
})


if (!igdbRes.ok) {
const text = await igdbRes.text()
throw new Error(`IGDB query failed: ${igdbRes.status} ${text}`)
}


const rows = (await igdbRes.json()) as any[]


const releases = rows.map((r) => {
const coverId = r?.game?.cover?.image_id
const cover = coverId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${coverId}.jpg` : null
return {
game: {
name: r?.game?.name,
slug: r?.game?.slug,
url: r?.game?.url,
summary: r?.game?.summary,
cover,
genres: (r?.game?.genres || []).map((g: any) => g?.name).filter(Boolean),
companies: (r?.game?.involved_companies || []).map((c: any) => c?.company?.name).filter(Boolean),
},
platform: r?.platform?.name,
date: r?.date,
human: r?.human,
region: r?.region,
}
})


res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
res.status(200).json({ releases, generatedAt: new Date().toISOString() })
} catch (err: any) {
res.status(500).json({ error: err.message || 'Unknown error' })
}
}
```


---
