import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectPreview, jpegDimensions, verifyPage } from '../scripts/verify-link-previews.mjs';
const url = 'https://thejollylama.github.io/DecentCanopy/';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('the checked-in Canopy entry page and JPEG satisfy the actual static crawler contract', async () => {
  const metadata = inspectPreview(html, url);
  assert.equal(metadata['og:image'], `${url}assets/social-preview.jpg`);
  assert.deepEqual(jpegDimensions(await readFile(new URL('../assets/social-preview.jpg', import.meta.url))), { width: 1200, height: 630 });
});

test('missing, duplicate, script-injected, relative, unsafe and inconsistent previews fail', () => {
  for (const broken of [
    html.replace('property="og:image"', 'property="missing"'),
    html.replace('</head>', '<meta property="og:image" content="https://example.com/image.jpg"></head>'),
    html.replace(/<meta property="og:image"[^>]*>/, '<script>const text = \'<meta property="og:image" content="https://example.com/fake.jpg">\';</script>'),
    html.replaceAll(`${url}assets/social-preview.jpg`, './assets/social-preview.jpg'),
    html.replaceAll(`${url}assets/social-preview.jpg`, 'javascript:alert(1)'),
    html.replace('content="1200"', 'content="600"'),
    html.replace('summary_large_image', 'summary'),
  ]) assert.throws(() => inspectPreview(broken, url));
  assert.throws(() => jpegDimensions(Buffer.from('<html>not an image</html>')), /not a JPEG/);
});

test('verification fetches raw HTML and actual JPEG bytes without wallets, credentials or script execution', async () => {
  const image = await readFile(new URL('../assets/social-preview.jpg', import.meta.url));
  const calls = [];
  const fetcher = async (target, options) => {
    calls.push({ target, options });
    return new Response(target === url ? html : image, { headers: { 'content-type': target === url ? 'text/html' : 'image/jpeg' } });
  };
  const result = await verifyPage(url, { fetcher });
  assert.equal(result.width, 1200);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.headers['User-Agent'] === 'Discordbot/2.0' && !call.options.headers.Authorization));
  await assert.rejects(verifyPage(url, { fetcher: async () => new Response('unavailable', { status: 503 }) }), /unavailable/);
});
