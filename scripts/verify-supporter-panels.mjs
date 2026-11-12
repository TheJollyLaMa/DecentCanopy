import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CANOPY_URL || 'http://127.0.0.1:8835/';
const shots = process.env.SCREENSHOT_DIR;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('decentcanopy-tour-v1', 'done'));
  await page.goto(base);
  await page.waitForFunction(() => window.GTPData?.getProjects().some(n => n.kind === 'creator'));
  await page.locator('#decent-head-about-button').click();
  const series = page.locator('#canopy-supporter-series');
  await series.locator('.supporter-token').waitFor();
  assert.equal(await series.locator('.supporter-token').count(), 1);
  const first = await series.locator('summary').innerText();
  assert.match(first, /DecentCanopy/);
  assert.equal(await series.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  assert.equal(await series.getByRole('button', { name: 'Previous', exact: true }).isDisabled(), true);
  await page.evaluate(() => { window.purchaseRequests = []; window.ethereum = { request: async request => {
    window.purchaseRequests.push(request.method);
    throw Object.assign(new Error('Declined by test wallet'), { code: 4001 });
  } }; });
  assert.deepEqual(await page.evaluate(() => window.purchaseRequests), []);
  assert.equal(await page.locator('#canopy-supporter-buy').count(), 0);
  assert.equal(await page.locator('#canopy-about-dialog .about-supporter').count(), 1);
  assert.equal(await page.locator('#canopy-about-dialog a').first().evaluate(e => getComputedStyle(e).color), 'rgb(136, 237, 192)');
  const search = series.getByRole('searchbox');
  await search.fill('DecentCanopy');
  assert.match(await series.locator('summary').innerText(), /DecentCanopy/);
  const supportLink = series.getByRole('link', { name: 'Support on DecentMarket ↗', exact: true });
  assert.match(await supportLink.getAttribute('href'), /listingId=/);
  assert.deepEqual(await page.evaluate(() => window.purchaseRequests), []);
  assert.doesNotMatch(await series.innerText(), /checkout above/);
  await search.fill('no-such-edition-xyz');
  assert.equal(await series.locator('.supporter-token').count(), 0);
  assert.match(await series.innerText(), /No matching/);
  await search.fill('');
  const stage = series.locator('.supporter-rolodex-stage');
  await stage.focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await series.locator('summary').innerText(), first);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await search.fill('DecentCanopy');
    await series.scrollIntoViewIfNeeded();
    assert.ok(await series.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
    if (shots) await page.screenshot({ path: `${shots}/series-${width}.png` });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await series.locator('.supporter-coin').evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.locator('.canopy-about-close').first().click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('decentcanopy:select-entity', {
    detail: 'decent-creator:0x807061df657a7697c04045da7d16d941861caabc',
  })));
  const mirror = page.locator('[data-jolly-planning]');
  await mirror.locator('.creator-project-card').first().waitFor();
  assert.ok(await mirror.locator('.creator-project-card').count() >= 30);
  assert.match(await mirror.innerText(), /signed creator record is unchanged/);
  await mirror.getByRole('searchbox').fill('DecentCanopy');
  assert.ok((await mirror.locator('.creator-project-card').count()) >= 1);
  await mirror.locator('summary').first().click();
  assert.match(await mirror.innerText(), /Supporter token 79|token 79/);
  assert.ok(await mirror.getByRole('link', { name: 'Visit this Planning Office site ↗' }).count());
  if (shots) await page.screenshot({ path: `${shots}/jolly-projects-320.png` });
  assert.equal(await page.locator('[data-supporter-owned]').count(), 1);
  assert.match(await page.locator('[data-supporter-owned]').innerText(), /Unknown until checked/);

  await page.evaluate(() => {
    const holder = document.createElement('div');
    holder.id = 'supporter-acceptance';
    holder.style.cssText = 'position:fixed;inset:10px;overflow:auto;background:#10202a;z-index:99999;padding:20px';
    document.body.append(holder);
    const originalReader = window.CanopySupporterModel.readHoldings;
    window.supporterTest = { originalReader, holder };
    window.CanopySupporterModel.readHoldings = async (data, wallet) => {
      const token = data.tokens.find(t => t.chainId === 8453 && t.tokenId === '79');
      if (wallet.endsWith('1111')) return new Promise(resolve => { window.supporterTest.resolveOld = () => resolve({
        wallet, holdings: [{ token, quantity: '99', block: 1 }], errors: [], observations: [], checkedAt: '2026-11-05',
      }); });
      return { wallet, holdings: [{ token, quantity: '2', block: 12345 }], errors: ['Optimism read unavailable; not zero.'], observations: [], checkedAt: '2026-11-05' };
    };
    window.decentCanopyWallet = { address: '0x1111111111111111111111111111111111111111' };
    window.CanopySupporterDNFTs.mount(holder, { kind: 'project', name: 'DecentCanopy', repoUrl: 'https://github.com/TheJollyLaMa/DecentCanopy' });
  });
  const owned = page.locator('#supporter-acceptance [data-supporter-owned]');
  await owned.getByRole('button', { name: 'Check / refresh holdings' }).click();
  await page.waitForFunction(() => !!window.supporterTest.resolveOld);
  await page.evaluate(() => {
    window.decentCanopyWallet = { address: '0x2222222222222222222222222222222222222222' };
    window.dispatchEvent(new CustomEvent('decentcanopy:wallet-change'));
  });
  await page.waitForFunction(() => document.querySelector('#supporter-acceptance [data-supporter-owned]').textContent.includes('quantity 2'));
  await page.evaluate(() => window.supporterTest.resolveOld());
  assert.match(await owned.innerText(), /quantity 2/);
  assert.doesNotMatch(await owned.innerText(), /quantity 99/);
  assert.match(await owned.innerText(), /unavailable; not zero/);
  await page.evaluate(() => {
    window.decentCanopyWallet = null;
    window.dispatchEvent(new CustomEvent('decentcanopy:wallet-change'));
  });
  assert.match(await owned.innerText(), /Connect a wallet/);
  assert.doesNotMatch(await owned.innerText(), /quantity 2/);
  await page.evaluate(() => {
    window.CanopySupporterModel.readHoldings = window.supporterTest.originalReader;
    window.supporterTest.holder.remove(); delete window.supporterTest;
  });
  await page.goto(new URL('?supporters=1', base).href);
  await page.locator('#canopy-about-dialog').waitFor({ state: 'visible' });
  await page.locator('#canopy-supporter-series .supporter-token').waitFor();
  assert.equal(await page.locator('#canopy-tour-dialog').isVisible(), false);
  await page.goto(new URL('?tour=1', base).href);
  await page.locator('#canopy-tour-dialog').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log('PASS: Canopy-only About, one editions section, current Market listing link, no wallet request on open, themed links, 1440/390/320px, reduced motion; 30+ Jolly-only public Office projects; separate holdings, partial errors, account-switch race and disconnect. No signing or transactions.');
} finally { await browser.close(); }
