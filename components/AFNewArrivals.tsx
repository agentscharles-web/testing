import { useEffect, useMemo, useState } from 'react'

type Item = {
  id: string
  title: string
  url: string
  price: string | null
  image: string | null
  availability?: string | null
}
type ApiResp = { ok: boolean; items: Item[]; count: number; totalItems?: number; page: number }

export default function AFNewArrivals({ limit = 12 }: { limit?: number }) {
  const [data, setData] = useState<ApiResp | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/af-new-arrivals')
      .then(r => r.json())
      .then(setData)
      .catch(e => setErr(String(e)))
  }, [])

  const items = useMemo(() => (data?.items || []).slice(0, limit), [data, limit])

  if (err) return <p style={{color:'#f87171'}}>Failed to load: {err}</p>
  if (!data) return <p style={{opacity:.7}}>Loading new arrivals…</p>
  if (!items.length) return <p style={{opacity:.7}}>No items found.</p>

  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4">New Arrivals at American Fizz</h2>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map(it => (
          <a
            key={it.id}
            href={it.url}
            target="_blank"
            rel="noreferrer"
            className="group rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 hover:border-neutral-700"
          >
            {it.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image} alt="" className="w-full aspect-square object-cover" />
            )}
            <div className="p-3">
              <div className="text-sm opacity-70">{it.price || '—'}</div>
              <div className="font-medium leading-snug group-hover:underline">{it.title}</div>
              {it.availability && <div className="mt-1 text-xs opacity-70">{it.availability}</div>}
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
