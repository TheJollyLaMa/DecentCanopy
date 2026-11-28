export async function loadPublishedCreator(wallet, { fetchImpl = fetch, records = globalThis.DecentCreatorRecords,
  verifyMessage = globalThis.ethers?.verifyMessage } = {}) {
  if (!/^0x[0-9a-f]{40}$/i.test(wallet || '') || /^0x0{40}$/i.test(wallet)) throw new Error('Choose a nonzero creator wallet');
  if (!records || !verifyMessage) throw new Error('Canonical creator signature verifier unavailable');
  const json = async url => {
    const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Current public Canopy publication unavailable (HTTP ${response.status})`);
    return response.json();
  };
  const headUrl = 'https://api.github.com/repos/TheJollyLaMa/DecentCanopy/commits/main';
  const head = await json(headUrl);
  if (!/^[0-9a-f]{40}$/.test(head.sha || '')) throw new Error('Current public source revision unavailable');
  const index = await json(`https://raw.githubusercontent.com/TheJollyLaMa/DecentCanopy/${head.sha}/data/decent-creators.json`);
  if (index?.version !== 1 || !Array.isArray(index.creators)) throw new Error('Public creator index is invalid');
  const entries = index.creators.filter(entry => entry.record?.wallet?.toLowerCase() === wallet.toLowerCase());
  if (entries.length !== 1) throw new Error('Exactly one current public creator profile is required; local or bundled display drafts are not evidence');
  const entry = entries[0], record = records.verify(entry, verifyMessage);
  if (JSON.stringify(record) !== JSON.stringify(entry.record) || records.message(entry.record) !== entry.message || !Number.isFinite(Date.parse(entry.publishedAt)) ||
      !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,100})$/.test(entry.cid || '')) throw new Error('Public creator record does not match its signed publication');
  if ((await json(headUrl)).sha !== head.sha) throw new Error('Public creator source changed during verification; reload it');
  return { record, sourceRevision: head.sha, cid: entry.cid };
}
