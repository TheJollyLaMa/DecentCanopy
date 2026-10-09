/* global DecentCreatorRecords, ethers, GTPData */
(function () {
  'use strict';
  const KEY = 'decentcanopy-creator-drafts-v1';
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let index = { creators: [] }, editingWallet = null, signed = null, generation = 0, lastGraph = { projects: [], associations: [] };
  let publishing = false;
  let editingProjectKey = null, editingRecord = null;
  const wallet = () => window.decentCanopyWallet?.address?.toLowerCase() || null;
  const local = () => ['localhost', '127.0.0.1'].includes(location.hostname);
  const indexUrl = () => local() ? 'data/decent-creators.json' : 'https://raw.githubusercontent.com/TheJollyLaMa/DecentCanopy/main/data/decent-creators.json';
  function status(message, error = false) {
    ['creator-status', 'creator-publish-status'].forEach(id => {
      const el = byId(id);
      if (el) { el.textContent = message; el.classList.toggle('is-error', error); }
    });
    byId('creator-status').hidden = !byId('creator-form').hidden;
    if (publishing) byId('creator-publishing-message').textContent = message;
  }
  function publicationStage(title, message, help = 'Please keep this tab open. Editing is paused while we publish. There is nothing else to click here.') {
    if (publishing) {
      byId('creator-publishing-title').textContent = title;
      byId('creator-publishing-help').textContent = help;
    }
    status(message);
  }
  async function fetchIndex(url) {
    const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Creator index could not be loaded (${response.status}).`);
    return response.json();
  }
  async function readIndex() {
    // The live index is newest; the copy bundled with this site (e.g. an IPFS snapshot) keeps working without GitHub.
    let value;
    try {
      value = await fetchIndex(indexUrl());
    } catch (error) {
      if (local()) throw error;
      console.warn('[DecentCreators] Live index unavailable; using the copy bundled with this site.', error);
      value = await fetchIndex('data/decent-creators.json');
    }
    if (value.version !== 1 || !Array.isArray(value.creators)) throw new Error('Unsupported creator index.');
    const seen = new Set();
    value.creators.forEach(entry => {
      if (typeof ethers === 'undefined') throw new Error('Wallet signature verifier unavailable. Reload when it can be loaded.');
      const record = DecentCreatorRecords.verify(entry, ethers.verifyMessage);
      if (JSON.stringify(record) !== JSON.stringify(entry.record) || !DecentCreatorRecords.CID.test(entry.cid)
        || seen.has(record.wallet)) throw new Error('Creator index contains an invalid or duplicate signed profile.');
      seen.add(record.wallet);
    });
    index = value;
    return index;
  }
  function drafts() {
    const value = localStorage.getItem(KEY);
    return value ? JSON.parse(value) : {};
  }
  function projectDraft(record, saved) {
    if (!saved) return record;
    if (!saved.projects.some(p => p.key === editingProjectKey)) return saved;
    return DecentCreatorRecords.replaceProject({ ...saved, version: 2 }, record.projects.find(p => p.key === editingProjectKey));
  }
  async function overlay(base) {
    let entries = [];
    try { entries = (await readIndex()).creators; }
    catch (error) {
      console.error('[Decent Creators]', error);
      byId('creator-service-status').textContent = `${error.message} The historical archive remains available.`;
    }
    try {
      const saved = drafts(), preview = saved.previewWallet && saved[saved.previewWallet];
      if (preview) {
        const record = DecentCreatorRecords.validate(preview);
        entries = entries.filter(e => e.record.wallet !== record.wallet).concat({ record, cid: null, draft: true });
      }
    } catch (error) {
      console.error('[Decent Creator drafts]', error);
      byId('creator-service-status').textContent = `Local creator preview could not be loaded: ${error.message}. Open My creator to clear it.`;
    }
    lastGraph = DecentCreatorRecords.apply(base, entries);
    if (window.DecentENS) lastGraph = window.DecentENS.decorateGraph(lastGraph);
    if (typeof DecentLedgerProof !== 'undefined' && typeof ethers !== 'undefined') {
      const providers = {};
      const providerFor = chain => {
        const config = DecentLedgerProof.CHAINS[chain];
        return providers[chain] || (providers[chain] = new ethers.JsonRpcProvider(config.rpc, config.chainId, { staticNetwork: true }));
      };
      try { await DecentLedgerProof.verifyGraph(lastGraph, { providerFor, cache: DecentLedgerProof.browserCache() }); }
      catch (error) { console.error('[Decent ledger proofs]', error); }
    }
    return lastGraph;
  }
  function multi(name, label, values = [], ref) {
    return `<label>${esc(label)}<select data-field="${name}" data-ref="${ref}" multiple size="4">${values.map(v => `<option value="${esc(v)}" selected>${esc(v)}</option>`).join('')}</select><small>Ctrl/⌘-click to choose several.</small></label>`;
  }
  const chainOptions = [['', 'Not on-chain'], ...Object.entries(DecentLedgerProof.CHAINS).map(([id, c]) => [id, c.name])];
  function canopyOptions(kind) {
    const others = index.creators.filter(e => e.record.wallet !== editingWallet).flatMap(e => (kind === 'project' ? e.record.projects : e.record.funds || [])
      .map(item => [`decent-${kind}:${e.record.wallet}:${item.key}`, `${item.name} — ${e.record.name}`]));
    const own = [...byId(`creator-${kind}s`).children].map(row => [`decent-${kind}:${editingWallet}:${row.dataset.key}`, `${row.querySelector('[data-field="name"]').value || `Unnamed ${kind}`} — you`]);
    return own.concat(others.sort((a, b) => a[1].localeCompare(b[1])));
  }
  function refreshRefs() {
    byId('creator-form').querySelectorAll('select[data-ref]').forEach(select => {
      const chosen = new Set([...select.selectedOptions].map(o => o.value).filter(Boolean));
      const selfRef = select.closest('#creator-projects') && `decent-project:${editingWallet}:${select.closest('fieldset').dataset.key}`;
      const options = canopyOptions(select.dataset.ref).filter(([value]) => value !== selfRef);
      if (!select.multiple) options.unshift(['', 'Not a Decent fund on the canopy']);
      chosen.forEach(value => { if (!options.some(([v]) => v === value)) options.push([value, 'No longer on the canopy — remove or keep']); });
      select.replaceChildren(...options.map(([value, title]) => { const o = new Option(title, value); o.selected = chosen.has(value); return o; }));
    });
  }
  function field(name, label, value = '', type = 'text', options = null) {
    if (options) return `<label>${esc(label)}<select data-field="${name}">${options.map(([v, title]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;
    if (type === 'textarea') return `<label>${esc(label)}<textarea data-field="${name}" rows="3">${esc(value)}</textarea></label>`;
    return `<label>${esc(label)}<input data-field="${name}" type="${type}" value="${esc(value)}"${type === 'number' ? ' min="0" step="any"' : ''} /></label>`;
  }
  function projectOptions() {
    return [['', 'Whole creator journey'], ...[...byId('creator-projects').children].map(row => [row.dataset.key, row.querySelector('[data-field="name"]').value || 'Unnamed project'])];
  }
  function addRow(kind, value = {}) {
    const row = document.createElement('fieldset');
    row.dataset.key = value.key || crypto.randomUUID();
    row.className = 'creator-entry';
    let html = `<legend>${{ projects: 'Project', funds: 'Decent fund', funding: 'Funding source' }[kind] || 'Journey update'}</legend>`;
    if (kind === 'projects') {
      html += field('name', 'Project name', value.name) + field('description', 'What you are building', value.description, 'textarea')
        + field('website', 'Project website (HTTPS)', value.website, 'url') + field('image', 'Artwork URL (HTTPS, optional)', value.image, 'url')
        + field('ens', 'ENS name (optional, e.g. yourproject.eth)', value.ens)
        + field('status', 'Progress', value.status || 'active', 'text', [['planning', 'Planning'], ['active', 'Active'], ['paused', 'Paused'], ['completed', 'Completed']])
        + field('wallet', 'Receiving wallet for this project (optional; blank = your signing wallet)', value.wallet)
        + multi('related', 'Related Decent projects (theirs or yours)', value.related, 'project')
        + field('archiveId', 'Optional historical project reference', value.archiveId, 'text', [['', 'No archive reference'], ...GTPData.getProjects().filter(p => p.id.startsWith('artizen-project:') || p.id.startsWith('curated-project:')).sort((a, b) => a.name.localeCompare(b.name)).map(p => [p.id, p.name])]);
    } else if (kind === 'funds') {
      html += field('name', 'Fund name', value.name) + field('description', 'What this fund supports', value.description, 'textarea')
        + field('website', 'Fund website (HTTPS)', value.website, 'url') + field('image', 'Fund image URL (HTTPS, optional)', value.image, 'url')
        + field('status', 'Fund status', value.status || 'open', 'text', [['open', 'Open'], ['invite-only', 'Invite only'], ['paused', 'Paused'], ['closed', 'Closed']])
        + field('treasuryChain', 'Treasury chain', value.treasury?.chain || '', 'text', chainOptions)
        + field('treasuryAddress', 'Treasury address (use this signing wallet for ledger verification)', value.treasury?.address)
        + multi('supports', 'Decent projects this fund supports', value.supports, 'project');
    } else if (kind === 'funding') {
      html += field('name', 'Funding source name', value.name) + field('projectKey', 'For', value.projectKey || '', 'text', projectOptions())
        + `<label>Decent fund on the canopy (optional)<select data-field="fundRef" data-ref="fund">${value.fundRef ? `<option value="${esc(value.fundRef)}" selected>${esc(value.fundRef)}</option>` : ''}</select></label>`
        + field('website', 'Funding source URL (HTTPS)', value.website, 'url')
        + field('status', 'Your reported status', value.status || 'exploring', 'text', [['exploring', 'Exploring'], ['applied', 'Applied'], ['pledged', 'Pledged'], ['received', 'Received'], ['ended', 'Ended']])
        + field('amount', 'Amount (optional; self-reported)', value.amount ?? '', 'number')
        + field('currency', 'Currency (e.g. USD or USDC)', value.currency)
        + field('chain', 'Payment chain (for ledger verification)', value.chain || '', 'text', chainOptions)
        + field('txHash', 'Payment transaction hash (0x…, optional)', value.txHash)
        + field('asOf', 'As of', value.asOf || new Date().toISOString().slice(0, 10), 'date')
        + field('note', 'Notes', value.note, 'textarea');
    } else {
      html += field('date', 'Date', value.date || new Date().toISOString().slice(0, 10), 'date')
        + field('projectKey', 'For', value.projectKey || '', 'text', projectOptions())
        + field('type', 'Update type', value.type || 'progress', 'text', [['progress', 'Project progress'], ['milestone', 'Milestone'], ['artizen-experience', 'Artizen experience (optional)']])
        + field('note', 'Your account of what happened / what comes next', value.note, 'textarea')
        + field('evidence', 'Evidence or update URL (HTTPS, optional)', value.evidence, 'url')
        + `<div data-payout-field${value.type !== 'artizen-experience' ? ' hidden' : ''}>`
        + field('payout', 'Your self-reported payout experience — no platform verification', value.payout || 'not-shared', 'text', [['not-shared', 'Not shared'], ['received', 'Received'], ['partially-received', 'Partially received'], ['not-received', 'Not received'], ['uncertain', 'Uncertain'], ['not-applicable', 'Not applicable']]) + '</div>';
    }
    row.innerHTML = html + '<button type="button" class="toolbar-btn" data-remove-entry>Remove entry</button>';
    byId(`creator-${kind}`).appendChild(row);
    refreshRefs();
  }
  function collect() {
    if (!editingWallet || wallet() !== editingWallet) throw new Error('Connect the wallet that owns this profile.');
    const existing = index.creators.find(e => e.record.wallet === editingWallet);
    const readRows = kind => [...byId(`creator-${kind}`).children].filter(row => kind !== 'projects' || !editingProjectKey || row.dataset.key === editingProjectKey).map(row => {
      const result = { key: row.dataset.key };
      row.querySelectorAll('[data-field]').forEach(el => { result[el.dataset.field] = el.multiple ? [...el.selectedOptions].map(o => o.value) : el.value; });
      if (kind === 'funding') result.amount = result.amount === '' ? null : Number(result.amount);
      if (kind === 'funds') {
        result.treasury = result.treasuryChain || result.treasuryAddress ? { chain: result.treasuryChain, address: result.treasuryAddress.trim() } : null;
        delete result.treasuryChain; delete result.treasuryAddress;
      }
      return result;
    });
    const projects = readRows('projects');
    if (projects.some(p => p.archiveId && !GTPData.getProjectById(p.archiveId))) throw new Error('Choose an existing historical project reference, or remove that reference.');
    const revision = existing ? existing.record.revision + 1 : 1, previousCid = existing?.cid || null, updatedAt = new Date().toISOString();
    if (editingProjectKey) {
      if (projects.length !== 1 || projects[0].key !== editingProjectKey) throw new Error('The selected project could not be found. Reopen its editor.');
      return DecentCreatorRecords.replaceProject({ ...editingRecord, version: 2, revision, previousCid, updatedAt }, projects[0]);
    }
    return DecentCreatorRecords.validate({
      format: 'decentcanopy-creator', version: 2, consent: true, wallet: editingWallet,
      revision, previousCid, updatedAt, name: byId('creator-name').value, bio: byId('creator-bio').value,
      website: byId('creator-website').value, avatar: byId('creator-avatar').value,
      location: byId('creator-location-consent').checked ? { consent: true, label: byId('creator-location').value, precision: byId('creator-location-precision').value } : null,
      projects, funds: readRows('funds'), funding: readRows('funding'), journey: readRows('journey'),
      rabbitHole: byId('creator-rabbit-hole').checked,
    });
  }
  function fill(record) {
    byId('creator-name').value = record?.name || '';
    byId('creator-bio').value = record?.bio || '';
    byId('creator-website').value = record?.website || '';
    byId('creator-avatar').value = record?.avatar || '';
    byId('creator-location').value = record?.location?.label || '';
    byId('creator-location-consent').checked = Boolean(record?.location);
    byId('creator-location-precision').value = record?.location?.precision || 'city';
    byId('creator-rabbit-hole').checked = record?.rabbitHole === true;
    ['projects', 'funds', 'funding', 'journey'].forEach(kind => {
      byId(`creator-${kind}`).replaceChildren();
      (record?.[kind] || []).forEach(row => addRow(kind, row));
    });
    byId('creator-public-consent').checked = false;
    signed = null;
  }
  function editorScope() {
    const focused = Boolean(editingProjectKey), dialog = byId('creator-dialog');
    dialog.querySelectorAll('[data-creator-profile-only]').forEach(el => {
      el.hidden = focused;
      if ('disabled' in el) el.disabled = focused;
      el.querySelectorAll('input, select, textarea, button').forEach(control => { control.disabled = focused; });
    });
    [...byId('creator-projects').children].forEach(row => {
      row.hidden = focused && row.dataset.key !== editingProjectKey;
      row.disabled = row.hidden;
      const remove = row.querySelector('[data-remove-entry]');
      remove.hidden = focused;
      remove.disabled = focused;
    });
    const project = editingRecord?.projects.find(p => p.key === editingProjectKey);
    byId('creator-title').textContent = focused ? `Edit project: ${project?.name || 'your project'}` : 'Your Decent Creator';
    byId('creator-editor-description').textContent = focused
      ? 'Update this project. Your other profile details stay unchanged.'
      : 'A living home for your projects and what comes next. An Artizen account, token balance, or payment is not required.';
    byId('creator-publish-heading').textContent = focused ? 'Publish update' : 'Save, sign, or publish';
    byId('creator-publish').textContent = focused ? 'Sign & publish' : 'Sign & publish to the canopy';
  }
  async function openEditor(projectKey = null) {
    if (publishing) return;
    if (byId('canopy-about-dialog').open) byId('canopy-about-dialog').close();
    const dialog = byId('creator-dialog');
    if (!dialog.open) dialog.showModal();
    editingWallet = wallet();
    editingProjectKey = typeof projectKey === 'string' ? projectKey : null;
    editingRecord = null;
    editorScope();
    byId('creator-wallet').textContent = editingWallet || 'Connect a wallet using the button below. No Artizen account needed.';
    byId('creator-form').hidden = true;
    byId('creator-connect').hidden = Boolean(editingWallet);
    if (!editingWallet) { status('Connecting proves control of your new canopy profile, not your former Artizen identity.'); return; }
    const request = ++generation, selected = editingWallet;
    status('Loading your latest signed profile…');
    try {
      await GTPData.load();
      await readIndex();
      if (generation !== request || wallet() !== selected) return;
      const saved = drafts()[selected];
      const published = index.creators.find(e => e.record.wallet === selected)?.record;
      editingRecord = editingProjectKey ? published || saved : saved || published;
      if (editingProjectKey && !editingRecord?.projects.some(p => p.key === editingProjectKey)) throw new Error('This project is no longer in your profile. Open your creator profile to check the latest projects.');
      const savedProject = saved?.projects.find(p => p.key === editingProjectKey);
      fill(editingProjectKey && savedProject ? DecentCreatorRecords.replaceProject({ ...editingRecord, version: 2 }, savedProject) : editingRecord);
      editorScope();
      byId('creator-form').hidden = false;
      status(editingProjectKey
        ? ''
        : saved ? 'Restored your browser-local draft. Publishing requires a new signature.' : 'Edit your profile, projects, funding sources and journey. Nothing publishes until you consent and sign.');
    } catch (error) { byId('creator-form').hidden = true; status(error.message, true); }
  }
  function download(value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'decent-creator.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function sign() {
    if (!byId('creator-public-consent').checked) throw new Error('Consent to public, permanently copyable IPFS publication before signing.');
    const record = collect(), message = DecentCreatorRecords.message(record);
    const hex = '0x' + [...new TextEncoder().encode(message)].map(b => b.toString(16).padStart(2, '0')).join('');
    publicationStage('Approve the signature in your wallet', 'Review the profile in your wallet. Signing is free and authorizes publication, not a payment.',
      'Approve the signature in your wallet when prompted. No gas or payment is needed. Please keep this tab open; editing is paused.');
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [hex, record.wallet] });
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (wallet() !== record.wallet || accounts[0]?.toLowerCase() !== record.wallet) throw new Error('Wallet changed while signing. Please sign again.');
    signed = { message, signature };
    DecentCreatorRecords.verify(signed, ethers.verifyMessage);
    return signed;
  }
  async function publish() {
    const envelope = await sign(), record = DecentCreatorRecords.parse(envelope.message), selected = record.wallet;
    publicationStage('Sending your signed record', 'Signature checked. Sending your record to the publishing relay…');
    const configResponse = await fetch('community-rewards.json', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error('Publishing configuration could not be loaded.');
    const config = await configResponse.json(), relay = config.relay?.url?.replace(/\/+$/, '');
    if (!relay) throw new Error('Publishing relay is not configured. Download your signed record instead.');
    const response = await fetch(`${relay}/requests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(75000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Publishing failed (${response.status}).`);
    publicationStage('Verifying & pinning to IPFS', 'Signed record sent; not yet published. Waiting for signature verification and IPFS pinning…');
    for (let attempt = 0; attempt < 30; attempt++) {
      if (wallet() !== selected) throw new Error('Wallet changed. The signed request may still publish; reopen the original wallet profile to check.');
      if (result.status === 'published') break;
      await new Promise(resolve => setTimeout(resolve, 10000));
      const check = await fetch(`${relay}/publications/${result.id}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!check.ok) throw new Error(`Publication status failed (${check.status}). Keep your signed export; publication may still finish.`);
      const receipt = await check.json();
      if (receipt.status === 'error') throw new Error(receipt.reason);
      if (receipt.status === 'published') { result.cid = receipt.cid; result.status = 'published'; break; }
    }
    if (result.status !== 'published') throw new Error('Publication has not been confirmed yet. Keep your signed export and check again before resubmitting.');
    if (!DecentCreatorRecords.CID.test(result.cid || '')) throw new Error('Publication status did not include a valid CID. Check the public index before retrying.');
    if (wallet() !== selected) throw new Error('Wallet changed. The signed request may still publish; reopen the original wallet profile to check.');
    index.creators = index.creators.filter(entry => entry.record.wallet !== selected).concat({ record, ...envelope, cid: result.cid });
    const saved = drafts();
    if (editingProjectKey && saved[selected]) {
      const draft = DecentCreatorRecords.validate({ ...projectDraft(record, saved[selected]), version: 2,
        revision: record.revision, previousCid: record.previousCid, updatedAt: record.updatedAt });
      if (JSON.stringify(draft) !== JSON.stringify(record)) saved[selected] = draft;
      else delete saved[selected];
    } else delete saved[selected];
    if (!saved[selected] && saved.previewWallet === selected) delete saved.previewWallet;
    localStorage.setItem(KEY, JSON.stringify(saved));
    editingRecord = record;
    status(`Published at ipfs://${result.cid}. Your wallet authorized this record; its claims are self-reported. Reload the canopy to see it (site deployment may still be running).`);
  }
  function connections(node, e, link) {
    const names = new Map(lastGraph.projects.map(p => [p.id, p.name]));
    const rows = lastGraph.associations.filter(a => a.decentClaim && (a.source === node.id || a.target === node.id));
    if (!rows.length) return '';
    const badge = { claimed: 'Claimed by one side', mutual: 'Confirmed by both sides', ledger: 'Ledger-verified' };
    const shortAddress = value => `${value.slice(0, 6)}…${value.slice(-4)}`;
    const proof = c => {
      const p = c.proof;
      if (!p) return '';
      const text = p.verified
        ? (c.treasurySigned && c.recipientSigned ? 'On-chain transfer verified between the two signing wallets.' : `On-chain transfer found from ${shortAddress(c.treasury)} to ${shortAddress(c.recipient)}, but ${c.treasurySigned ? 'the receiving wallet is declared, not the creator’s signing wallet' : 'the fund treasury is declared, not the steward’s signing wallet'}.`)
        : p.reason;
      return `<small class="ledger-proof${p.verified ? ' is-verified' : ''}">${e(text)} ${link(p.explorer, `${DecentLedgerProof.CHAINS[c.chain].name} transaction`)}</small>`;
    };
    return `<div class="details-group"><h3>Canopy connections</h3><ul>${rows.map(a => {
      const other = a.source === node.id ? a.target : a.source;
      return `<li><span class="claim-badge is-${e(a.decentClaim)}">${e(badge[a.decentClaim])}</span> <strong>${e(names.get(other) || other)}</strong>
        <small>${a.type === 'funding-pool' ? 'Funding' : 'Related project'} · ${e(a.note)}</small>${(a.ledgerCandidates || []).map(proof).join('')}</li>`;
    }).join('')}</ul><p class="details-muted">Dashed lines are one-sided claims, solid lines are confirmed by both wallets, glowing lines have a matching on-chain transfer.</p></div>`;
  }
  function rabbitHoleUrl(address, room = 'lounge') {
    const url = new URL('rabbit-hole/', location.href);
    url.searchParams.set('host', address);
    url.searchParams.set('room', room);
    return url.toString();
  }
  function rabbitHole(r, e, own) {
    if (!own && r.rabbitHole !== true) return '';
    const url = rabbitHoleUrl(r.wallet);
    const body = own
      ? `<a class="toolbar-btn" href="${e(url)}" target="_blank" rel="noopener" title="Your own small, peer-to-peer video room. Open it, then share the invite link with the people you want to chat with." aria-label="Open my Rabbit Hole">🕳️🐇</a>
        <button type="button" class="toolbar-btn" data-copy-rabbit-hole="${e(url)}">📋 Copy invite link</button>
        ${r.rabbitHole === true ? '' : '<p class="details-muted">Only people you send the link to can find it. Turn on the canopy knock button in My creator to list it on your blip.</p>'}`
      : `<p>${e(r.name)} hosts a small, peer-to-peer video room. You can knock while it is open; they decide who to let in.</p>
        <a class="toolbar-btn" href="${e(url)}" target="_blank" rel="noopener">🕳️ Knock on ${e(r.name)}’s Rabbit Hole</a>`;
    return `<div class="details-group"><h3>Rabbit Hole</h3>${body}<p class="details-muted">Both sides sign in with their wallet. Video and chat go directly between browsers and are never recorded.</p></div>`;
  }
  function renderDetails(node, escape) {
    const r = node.creatorRecord, e = escape;
    const projectKey = node.creatorProjectKey, fundingKey = node.creatorFundingKey, fundKey = node.creatorFundKey;
    const link = (value, label) => value ? `<a href="${e(value)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : '';
    const projects = projectKey ? r.projects.filter(p => p.key === projectKey) : fundingKey || fundKey ? [] : r.projects;
    const funds = fundKey ? (r.funds || []).filter(f => f.key === fundKey) : projectKey || fundingKey ? [] : (r.funds || []);
    const funding = fundKey ? [] : fundingKey ? r.funding.filter(f => f.key === fundingKey) : r.funding.filter(f => !projectKey || f.projectKey === projectKey);
    const journey = fundKey ? [] : r.journey.filter(j => !projectKey || !j.projectKey || j.projectKey === projectKey).slice().sort((a, b) => b.date.localeCompare(a.date));
    const fundName = ref => lastGraph.projects.find(p => p.id === ref)?.name || 'a Decent fund no longer on the canopy';
    const treasury = f => {
      if (!f.treasury) return '<p class="details-muted">No treasury declared, so payments cannot be ledger-verified.</p>';
      const c = DecentLedgerProof.CHAINS[f.treasury.chain];
      const signerTreasury = f.treasury.address === r.wallet;
      return `<p>Treasury on ${e(c.name)}: ${link(`${c.explorer}/address/${f.treasury.address}`, f.treasury.address)}
        <span class="claim-badge ${signerTreasury ? 'is-ledger' : 'is-claimed'}">${signerTreasury ? 'Steward’s signing wallet' : 'Declared, not the signing wallet'}</span></p>`;
    };
    const payoutLabels = { 'not-shared': 'Not shared', received: 'Received', 'partially-received': 'Partially received', 'not-received': 'Not received', uncertain: 'Uncertain', 'not-applicable': 'Not applicable' };
    const own = wallet() === r.wallet;
    const projectBody = (p, describe = true) => `${describe ? `<p>${e(p.description)}</p>` : `<small>Progress: ${e(p.status)}</small>`}${p.wallet ? `<small>Receiving wallet ${e(p.wallet)}${p.wallet === r.wallet ? ' (signing wallet)' : ' (declared)'}</small>` : ''}
      ${link(p.website, 'Project website')}${p.archiveId ? '<p class="details-muted">Historical association self-reported; archive unchanged.</p>' : ''}
      ${window.DecentENS ? window.DecentENS.section(r.wallet, p, own, e, lastGraph) : ''}`;
    const projectCards = projects.map(p => `<details class="creator-project-card">
      <summary>${p.image ? `<img data-creator-image class="creator-project-thumb" src="${e(window.DecentCreatorImages.imageUrl(p.image))}" alt="${e(p.name)} artwork" loading="lazy" referrerpolicy="no-referrer" />` : '<span class="creator-project-thumb" aria-hidden="true">🌱</span>'}
        <span><strong>${e(p.name)}</strong><small>${e(p.status)}</small></span></summary>
      <div class="creator-project-card-body">${p.image ? `<figure class="details-artwork"><img data-creator-image src="${e(window.DecentCreatorImages.imageUrl(p.image))}" alt="${e(p.name)} artwork" loading="lazy" referrerpolicy="no-referrer" /></figure>` : ''}
        ${projectBody(p)}<div class="participation-actions"><button type="button" class="toolbar-btn" data-creator-view="decent-project:${e(r.wallet)}:${e(p.key)}">Open project blip</button>
        ${own ? `<button type="button" class="toolbar-btn" data-creator-project-edit="${e(p.key)}">Edit project</button>` : ''}</div></div></details>`).join('');
    return `<div class="creator-profile-details"><p class="data-provenance">${node.creatorDraft ? 'Browser-local draft · not signed or public' : 'Wallet-authorized publication · self-reported claims'}</p>
      <p class="details-muted">Wallet ${e(r.wallet)} · revision ${r.revision} · ${e(r.updatedAt.slice(0, 10))}. A signature proves wallet control, not real-world identity, project ownership, or payout truth.</p>
      ${node.creatorCid ? link(`https://gateway.pinata.cloud/ipfs/${node.creatorCid}`, 'Portable signed IPFS record') : ''}
      ${projectKey ? `<button type="button" class="toolbar-btn" data-creator-view="decent-creator:${e(r.wallet)}">View ${e(r.name)}’s creator profile</button>` : ''}
      ${own ? projectKey ? `<button type="button" class="toolbar-btn" data-creator-project-edit="${e(projectKey)}">Edit this project</button>` : '<button type="button" class="toolbar-btn" data-creator-open>Edit my creator / projects / funds / journey</button>' : ''}
      ${projectKey || fundingKey || fundKey || node.creatorDraft ? '' : rabbitHole(r, e, wallet() === r.wallet)}
      ${funds.length ? `<div class="details-group"><h3>Decent funds stewarded</h3><ul>${funds.map(f => `<li><strong>${e(f.name)}</strong> · ${e(f.status)}<p>${e(f.description)}</p>${treasury(f)}${link(f.website, 'Fund website')}</li>`).join('')}</ul></div>` : ''}
      ${projects.length ? projectKey ? `<div class="details-group">${projectBody(projects[0], false)}</div>` : `<div class="details-group"><h3>Projects going forward</h3><div class="creator-project-list">${projectCards}</div></div>` : ''}
      ${connections(node, e, link)}
      ${funding.length ? `<div class="details-group"><h3>Funding sources · self-reported</h3><ul>${funding.map(f => `<li><strong>${e(f.name)}</strong> · ${e(f.status)}${f.amount !== null ? ` · ${e(f.amount)} ${e(f.currency)}` : ''}<small>As of ${e(f.asOf)}${f.projectKey ? ` · ${e(r.projects.find(p => p.key === f.projectKey)?.name)}` : ''}${f.fundRef ? ` · via ${e(fundName(f.fundRef))}` : ''}</small><p>${e(f.note)}</p>${link(f.website, 'Source')}${f.txHash ? link(`${DecentLedgerProof.CHAINS[f.chain].explorer}/tx/${f.txHash}`, 'Payment transaction') : ''}</li>`).join('')}</ul><p class="details-muted">Exploring, applying, and pledges are not receipts. Only transfers checked on the public ledger are verified.</p></div>` : ''}
      ${journey.length ? `<div class="details-group"><h3>Journey &amp; progress</h3><ul>${journey.map(j => `<li><strong>${e(j.date)} · ${j.type === 'artizen-experience' ? 'Artizen experience · creator’s account' : e(j.type)}</strong>${j.projectKey ? `<small>${e(r.projects.find(p => p.key === j.projectKey)?.name)}</small>` : ''}<p>${e(j.note)}</p>${j.type === 'artizen-experience' ? `<p>Self-reported payout experience: ${e(payoutLabels[j.payout])}. Not independently verified.</p>` : ''}${link(j.evidence, 'Evidence / update')}</li>`).join('')}</ul></div>` : ''}</div>`;
  }
  window.DecentCreators = { overlay, openEditor, renderDetails };
  document.addEventListener('DOMContentLoaded', () => {
    const form = byId('creator-form');
    document.addEventListener('click', event => {
      if (event.target.closest('[data-creator-open]')) openEditor();
      const editProject = event.target.closest('[data-creator-project-edit]');
      if (editProject) openEditor(editProject.dataset.creatorProjectEdit);
      const view = event.target.closest('[data-creator-view]');
      if (view) window.dispatchEvent(new CustomEvent('decentcanopy:select-entity', { detail: view.dataset.creatorView }));
      const copy = event.target.closest('[data-copy-rabbit-hole]');
      if (copy) {
        navigator.clipboard.writeText(copy.dataset.copyRabbitHole)
          .then(() => { copy.textContent = '✅ Invite link copied'; setTimeout(() => { copy.textContent = '📋 Copy invite link'; }, 1500); })
          .catch(() => window.prompt('Copy your Rabbit Hole invite link:', copy.dataset.copyRabbitHole));
      }
    });
    byId('creator-connect').addEventListener('click', () => byId('wallet-connect-button').click());
    byId('creator-close').addEventListener('click', () => { if (!publishing) byId('creator-dialog').close(); });
    byId('creator-dialog').addEventListener('cancel', event => { if (publishing) event.preventDefault(); });
    byId('creator-publishing-dialog').addEventListener('cancel', event => { if (publishing) event.preventDefault(); });
    byId('creator-publishing-done').addEventListener('click', () => {
      byId('creator-publishing-dialog').close();
      byId('creator-publish').focus();
    });
    byId('creator-dialog').addEventListener('close', () => { generation++; });
    form.addEventListener('click', event => {
      const add = event.target.closest('[data-add-entry]'), remove = event.target.closest('[data-remove-entry]');
      if (editingProjectKey) return;
      if (add) { addRow(add.dataset.addEntry); signed = null; if (add.dataset.addEntry === 'projects') refreshProjects(); }
      if (remove) { remove.closest('fieldset').remove(); signed = null; refreshProjects(); refreshRefs(); }
    });
    function refreshProjects() {
      const options = projectOptions();
      form.querySelectorAll('[data-field="projectKey"]').forEach(select => {
        const current = select.value;
        select.replaceChildren(...options.map(([value, title]) => new Option(title, value)));
        if (options.some(([value]) => value === current)) select.value = current;
        else if (current) {
          select.add(new Option('Removed project — choose a replacement', current));
          select.value = current;
          status('A project was removed. Choose the correct project for its journey/funding entries before saving.', true);
        }
      });
    }
    form.addEventListener('input', event => {
      signed = null;
      if (event.target.closest('#creator-projects')) refreshProjects();
      if (event.target.matches('[data-field="name"]') && event.target.closest('#creator-projects, #creator-funds')) refreshRefs();
    });
    form.addEventListener('change', event => {
      signed = null;
      if (event.target.matches('[data-field="type"]')) event.target.closest('fieldset').querySelector('[data-payout-field]').hidden = event.target.value !== 'artizen-experience';
    });
    async function action(button, fn, showPublication = false) {
      if (publishing) return;
      button.disabled = true;
      const dialog = byId('creator-publishing-dialog');
      try {
        if (showPublication) {
          publishing = true;
          form.inert = true;
          byId('creator-close').disabled = true;
          form.setAttribute('aria-busy', 'true');
          dialog.dataset.state = 'working';
          byId('creator-publishing-done').hidden = true;
          byId('creator-publishing-help').hidden = false;
          publicationStage('Preparing your canopy record', 'Checking your profile before requesting a signature…');
          dialog.showModal();
          byId('creator-publishing-title').focus();
        }
        await fn();
        if (showPublication) dialog.dataset.state = 'success';
      } catch (error) {
        status(error.message, true);
        if (showPublication) dialog.dataset.state = 'error';
      } finally {
        button.disabled = false;
        if (showPublication) {
          publishing = false;
          form.inert = false;
          form.removeAttribute('aria-busy');
          byId('creator-close').disabled = false;
          byId('creator-publishing-title').textContent = dialog.dataset.state === 'success' ? 'Your creator record is published' : 'Publication was not confirmed';
          byId('creator-publishing-help').hidden = true;
          byId('creator-publishing-done').hidden = false;
          byId('creator-publishing-done').focus();
        }
      }
    }
    byId('creator-preview').addEventListener('click', event => action(event.currentTarget, () => {
      if (!byId('creator-local-consent').checked) throw new Error('Consent to browser-local draft storage first.');
      const record = collect(), saved = drafts();
      if (editingProjectKey && saved[record.wallet] && !saved[record.wallet].projects.some(p => p.key === editingProjectKey)) {
        throw new Error('Your full-profile draft removed this project. Restore it in My creator before previewing this project, or publish the project update without changing that draft.');
      }
      saved[record.wallet] = editingProjectKey ? projectDraft(record, saved[record.wallet]) : record;
      saved.previewWallet = record.wallet;
      localStorage.setItem(KEY, JSON.stringify(saved));
      location.href = 'index.html?canopy=creators';
    }));
    byId('creator-export').addEventListener('click', event => action(event.currentTarget, async () => {
      if (!signed) await sign();
      download({ format: 'decentcanopy-signed-creator', version: 1, ...signed });
      status('Downloaded your signed, portable record. It has not been published by this action.');
    }));
    form.addEventListener('submit', event => { event.preventDefault(); action(byId('creator-publish'), publish, true); });
    byId('creator-clear').addEventListener('click', event => action(event.currentTarget, () => {
      const saved = drafts(); if (editingWallet) delete saved[editingWallet]; delete saved.previewWallet;
      localStorage.setItem(KEY, JSON.stringify(saved));
      status('Local draft and preview cleared. Published IPFS copies are not deleted. Reload to restore the published view.');
      fill(index.creators.find(e => e.record.wallet === editingWallet)?.record);
    }));
    byId('creator-import').addEventListener('change', event => action(event.currentTarget, async () => {
      const file = event.currentTarget.files[0];
      if (!file) return;
      if (file.size > 40000) throw new Error('Signed imports must be at most 40 KB.');
      const envelope = JSON.parse(await file.text()), record = DecentCreatorRecords.verify(envelope, ethers.verifyMessage);
      if (record.wallet !== editingWallet) throw new Error('This signed export belongs to another wallet.');
      fill(record); status('Verified signed export loaded for editing. A new signature is required to publish your changes.');
    }));
    window.addEventListener('decentcanopy:wallet-change', () => {
      generation++; signed = null;
      if (byId('creator-dialog').open && !publishing) openEditor();
    });
  });
}());
