import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const repo = 'TheJollyLaMa/DecentCanopy', tag = 'v0.1.0';
const market = 'https://thejollylama.github.io/DecentMarket/?supporters=1&chainId=8453&nftContract=0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B&tokenId=79';
const tutorial = 'https://thejollylama.github.io/DecentCanopy/?tour=1';
const gh = args => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const download = name => JSON.parse(gh(['release', 'download', tag, '--repo', repo, '--pattern', name, '--output', '-']));

async function main() {
  const { alreadySent, assertDeliveryNotPending, deliverDiscordRelease, markerName, registeredEvidence, validateManifest, verifyOnChain } = await import('../.supporter-kit/scripts/supporter-protocol.mjs');
  if (process.env.GITHUB_REPOSITORY !== repo) throw new Error('This invitation is bound to DecentCanopy.');
  const release = JSON.parse(gh(['release', 'view', tag, '--repo', repo, '--json', 'assets,isDraft']));
  if (release.isDraft) throw new Error('Published Canopy release required.');
  const manifest = download('supporter-release.json');
  validateManifest(manifest);
  if (manifest.repo !== repo || manifest.version !== tag) throw new Error('Canopy release identity mismatch.');
  const marker = release.assets.some(a => a.name === markerName()) ? download(markerName()) : null;
  if (alreadySent(marker, manifest)) { console.log('Canopy release already announced; no Discord request.'); return; }
  assertDeliveryNotPending(release.assets);
  const evidence = registeredEvidence(manifest, download('supporter-evidence.json'));
  const verified = await verifyOnChain(manifest, evidence);
  if (String(evidence.tokenId) !== '79' || String(evidence.listingId) !== '9') throw new Error('Expected Canopy token 79/listing 9.');
  for (const url of [market, tutorial]) {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Invitation destination unavailable (HTTP ${response.status}).`);
  }
  const asset = release.assets.find(a => a.name === 'supporter-front.png');
  if (!asset) throw new Error('Published token front artwork missing.');
  const imageResponse = await fetch(asset.url, { signal: AbortSignal.timeout(30000) });
  if (!imageResponse.ok) throw new Error(`Token artwork unavailable (HTTP ${imageResponse.status}).`);
  const image = new Uint8Array(await imageResponse.arrayBuffer());
  validateArtwork(image);
  const payload = buildInvitePayload();
  await deliverDiscordRelease({
    manifest, verified, assets: release.assets, webhook: process.env.DISCORD_SUPPORTER_WEBHOOK,
    saveAsset(name, value) {
      writeFileSync(name, JSON.stringify(value, null, 2) + '\n');
      gh(['release', 'upload', tag, name, '--repo', repo]);
    },
    async fetcher(url, options) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      form.append('files[0]', new Blob([image], { type: 'image/png' }), 'supporter-front.png');
      return fetch(url, { method: options.method, signal: options.signal, body: form });
    },
  });
  console.log('Canopy invitation with attached token artwork acknowledged; durable sent receipt saved.');
}
export function validateArtwork(image) {
  if (image.length < 8 || image.length > 8 * 1024 * 1024
    || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => image[i] === byte)) throw new Error('Token artwork is not a valid-sized PNG.');
}
export function buildInvitePayload() {
  return {
    username: 'Decent DNFT Bot', allowed_mentions: { parse: [] },
    content: `🌿 **Come grow the DecentCanopy with us!** Add yourself and your projects so we can see what everyone is working on, discover connections, and coordinate our efforts. Support The Jolly LaMa, the work, and one another—or simply join and share what you’re building.\n\nCanopy is one project in **A Decent Series**: independent experiments designed to help earthlings increase their agency against “evil corp”—whoever that is for them. Explore the available Supporter tokens in **A Decent Market**, with Canopy’s edition called up first. Choose a project whose work you’d like to help sustain:\n\n✨ [Explore the Supporter DNFT Star—Canopy selected](${market})\n\n🧭 [New here? Take the beginner tour](${tutorial})\n\nParticipation is free; buying a token is optional support, not equity or a promise of financial returns.`,
    embeds: [{
      title: 'DecentCanopy v0.1.0 · Supporter DNFT', url: market,
      description: 'Token 79 · listing 9 · 10 USDC on Base, plus gas. Live listing verified before announcement; availability can change.',
      image: { url: 'attachment://supporter-front.png' },
    }],
    attachments: [{ id: 0, filename: 'supporter-front.png', description: 'Official DecentCanopy v0.1.0 Supporter token front artwork' }],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  // Nested network errors may contain the secret webhook URL.
  console.error(String(error.message).split('\n')[0].replace(/https?:\/\/\S+/g, '[URL redacted]'));
  process.exitCode = 1;
});
