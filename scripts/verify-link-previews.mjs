import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function inspectPreview(html, pageURL) {
  const head = html.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i)?.[1];
  if (!head) throw new Error('No static HTML head; a JavaScript-only preview is not crawlable.');
  const metadata = new Map();
  const staticHead = head.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const [tag] of staticHead.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(([, key, double, single]) => [key.toLowerCase(), double ?? single]));
    const key = attrs.property || attrs.name;
    if (!key || !/^(og:|twitter:)/.test(key)) continue;
    if (metadata.has(key)) throw new Error(`Duplicate preview tag: ${key}`);
    metadata.set(key, attrs.content);
  }
  for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:image']) {
    if (!metadata.get(key)?.trim()) throw new Error(`Missing static preview tag: ${key}`);
  }
  if (metadata.get('twitter:card') !== 'summary_large_image') throw new Error('Large-image Twitter card missing.');
  for (const key of ['og:url', 'og:image', 'twitter:image']) {
    const url = new URL(metadata.get(key));
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Preview URL must be public absolute HTTPS: ${key}`);
    if (url.origin !== new URL(pageURL).origin) throw new Error(`Unexpected preview origin: ${key}`);
  }
  if (metadata.get('og:image') !== metadata.get('twitter:image')) throw new Error('Preview image tags disagree.');
  if (metadata.get('og:image:width') !== '1200' || metadata.get('og:image:height') !== '630') throw new Error('Expected 1200 x 630 preview metadata.');
  return Object.fromEntries(metadata);
}

export function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Preview is not a JPEG.');
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) throw new Error('Invalid JPEG marker.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) throw new Error('Truncated JPEG.');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += size;
  }
  throw new Error('JPEG dimensions unavailable.');
}

export async function verifyPage(url, { fetcher = fetch, images = new Map() } = {}) {
  const response = await fetcher(url, { headers: { 'User-Agent': 'Discordbot/2.0' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error(`Page unavailable: HTTP ${response.status}`);
  const metadata = inspectPreview(await response.text(), response.url || url);
  const imageURL = metadata['og:image'];
  if (!images.has(imageURL)) images.set(imageURL, (async () => {
    const image = await fetcher(imageURL, { headers: { 'User-Agent': 'Discordbot/2.0' }, signal: AbortSignal.timeout(30000) });
    if (!image.ok || !image.headers.get('content-type')?.includes('image/jpeg')) throw new Error(`Image unavailable or not JPEG: HTTP ${image.status}`);
    if (Number(image.headers.get('content-length')) > 5_000_000) throw new Error('Preview exceeds 5 MB.');
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length > 5_000_000) throw new Error('Preview exceeds 5 MB.');
    const dimensions = jpegDimensions(bytes);
    if (dimensions.width !== 1200 || dimensions.height !== 630) throw new Error('Actual image dimensions disagree with metadata.');
    return { ...dimensions, bytes: bytes.length };
  })());
  return { url, imageURL, ...await images.get(imageURL) };
}

async function main() {
  const catalog = JSON.parse(await readFile(new URL('../data/website-previews.json', import.meta.url), 'utf8'));
  const pages = catalog.sites.flatMap(site => site.pages), images = new Map();
  let cursor = 0, failures = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < pages.length) {
      const url = pages[cursor++];
      try {
        const result = await verifyPage(url, { images });
        console.log(`PASS ${url} — ${result.width}x${result.height}, ${result.bytes} bytes`);
      } catch (error) {
        failures++;
        console.error(`FAIL ${url} — ${error.message}`);
      }
    }
  }));
  console.log(`${pages.length - failures}/${pages.length} crawler-visible pages passed across ${catalog.sites.length} websites. Client caches and immutable ENS/IPFS snapshots are separate.`);
  if (failures) process.exitCode = 1;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
