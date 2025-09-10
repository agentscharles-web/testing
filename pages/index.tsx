```tsx
)}


<div className="mt-8 space-y-10">
{grouped.map(([k, items]) => {
const [y, m] = k.split('-').map(Number)
const title = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
return (
<section key={k}>
<h2 className="text-2xl font-semibold mb-4">{title}</h2>
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
{items.map((r) => (
<article key={`${r.game.slug}-${r.date}-${r.platform}`} className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden hover:border-neutral-700 transition">
{r.game.cover && (
// eslint-disable-next-line @next/next/no-img-element
<img src={r.game.cover} alt="Cover" className="w-full aspect-[16/9] object-cover" />
)}
<div className="p-4">
<div className="text-sm opacity-75">{formatDate(r.date)} · {r.platform || '—'}</div>
<h3 className="mt-1 text-lg font-bold">{r.game.name}</h3>
{r.game.genres?.length > 0 && (
<div className="mt-1 text-sm opacity-80">{r.game.genres.join(' • ')}</div>
)}
{r.game.summary && (
<p className="mt-2 text-sm opacity-90 line-clamp-3">{r.game.summary}</p>
)}
<div className="mt-3 flex gap-3">
{r.game.url && (
<a className="text-sm underline opacity-90 hover:opacity-100" href={r.game.url} target="_blank" rel="noreferrer">IGDB Page ↗</a>
)}
</div>
</div>
</article>
))}
</div>
</section>
)
})}
</div>
</div>
</main>
)
}
```


---
