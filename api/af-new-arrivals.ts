import type { NextApiRequest, NextApiResponse } from 'next'
import * as cheerio from 'cheerio'

const SOURCE_URL = 'https://americanfizz.co.uk/new-arrivals'

function absolutize(src?: string | null) {
  if (!src) return null
  if (src.startsWith('http')) return src
  if (src.startsWith('//')) return 'https:' + src
  if (src.startsWith('/')) return 'https://americanfizz.co.uk' + src
  return src
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const page = req.query.page ? String(req.query.page) : ''
    const url = page ? `${SOURCE_URL}?p=${encodeURIComponent(page)}` : SOURCE_URL

    const resp = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AFBot/1.0; +https://americanfizz.co.uk)'
      }
    })
    if (!resp.ok) throw new Error(`Fetch failed ${resp.status}`)
    const html = await resp.text()

    const $ = cheerio.load(html)

    // Select product tiles (robust against small Magento theme tweaks)
    const items: any[] = []
    $('li.product-item, div.product-item').each((_, el) => {
      const node = $(el)
      const linkEl = node.find('a.product-item-link').first()
      const url = linkEl.attr('href') || node.find('a').attr('href') || ''
      const title = linkEl.text().trim() || node.find('.product-item-name, .product.name a').text().trim()

      // Price (first visible .price)
      const priceText = node.find('.price').first().text().replace(/\s+/g, ' ').trim()

      // Image (Magento often uses data-src / data-original)
      const imgEl = node.find('img').first()
      const img = absolutize(
        imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-original') || imgEl.attr('data-lazy') || null
      )

      // Optional availability badge/text
      const badge = node.find('.stock, .stock-availability, .product-label, .availability').first().text().trim() || null

      if (title && url) {
        items.push({
          id: Buffer.from(url).toString('base64').replace(/=+$/, ''),
          title,
          url,
          price: priceText || null,
          image: img,
          availability: badge,
          source: SOURCE_URL
        })
      }
    })

    // Try to detect total items (“Items 1–50 of 128”)
    const totalText = $('div.toolbar-amount').text().trim() || ''
    const m = totalText.match(/Items\s+\d+-\d+\s+of\s+(\d+)/i)
    const totalItems = m ? Number(m[1]) : undefined

    // Cache at the edge for 1 hour; allow stale for 1 day
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ ok: true, count: items.length, totalItems, page: page || 1, items })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
