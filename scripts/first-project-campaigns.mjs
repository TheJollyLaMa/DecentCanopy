import { routerPayout } from './vendor/busking/promotion-payout.mjs';
import { loadPublishedCreator } from './published-creator.mjs';

export const FIRST_PROJECT_VERSION = 'canopy-first-project-v1';
export const FIRST_PROJECT_FUND = 'decentcanopy-promotionals';
const USDC = { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' };
const STUDIO = 'https://thejollylama.github.io/DecentMarket/studio.html';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ROUTER_ABI = [
  'function PAYROLL_ROLE() view returns(bytes32)', 'function hasRole(bytes32,address) view returns(bool)',
  'function paused() view returns(bool)', 'function approvedAssets(address) view returns(bool)',
  'function contributors(address) view returns(bytes32 githubIdHash,bool approved,bool exists)',
  'function setContributorApproved(address,bytes32,bool)',
  'function funds(bytes32) view returns(string metadataUri,bool active,bool exists)',
  'function fundBalances(bytes32,address) view returns(uint256)',
  'function completedWorkReferences(bytes32) view returns(bool)',
  'function payout(bytes32,address,address,uint256,bytes32,bytes32,bytes32,string,bytes32)',
];

export function firstProjectAuthorization({ address, origin, issuedAt, command }) {
  return ['DecentCanopy Promotions authorization v1', `Wallet: ${address.toLowerCase()}`,
    `Origin: ${origin}`, `Issued: ${issuedAt}`, JSON.stringify(command)].join('\n');
}
export function firstProjectDraft(startsAt, endsAt, claimDeadline, extra = {}) {
  for (const date of [startsAt, endsAt, claimDeadline]) {
    if (!Number.isFinite(Date.parse(date)) || !date.endsWith('Z')) throw new Error('Use explicit UTC campaign timestamps');
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(claimDeadline) < Date.parse(endsAt)) throw new Error('Campaign dates are out of order');
  return { ...extra, application: 'decentcanopy', template: 'first-project', qualificationVersion: FIRST_PROJECT_VERSION,
    title: extra.title || 'First Project', asset: 'usdc', fund: FIRST_PROJECT_FUND,
    rewardUnits: '5000000', budgetUnits: '60000000', maxAwards: 12, startsAt, endsAt, claimDeadline,
    criteria: 'Published signed creator profile and project, steward creator/project approval, a new Supporter mint after joining, and an active Market/Canopy listing.',
    terms: '5 native Base USDC per participant after steward review; twelve rewards, 60 USDC total. Once per participant across First Project campaigns. Wallets are not proof of unique people. Existing published profiles may join; mint must occur after joining, inside the campaign. All registrations, public evidence and review notes are published on IPFS and may persist permanently. Do not submit secrets or personal information about others. Budget is earmarked, not escrowed. No automatic or guaranteed payment. Mint/listing gas is separate.' };
}
export function studioProjectLink(wallet, key, campaignId = '') {
  if (!/^0x[0-9a-f]{40}$/i.test(wallet || '') || !/^[a-zA-Z0-9_-]{1,50}$/.test(key || '')) throw new Error('Choose your published Canopy project');
  const url = new URL(STUDIO);
  url.searchParams.set('creator', wallet.toLowerCase());
  url.searchParams.set('projectKey', key);
  if (campaignId) url.searchParams.set('canopyCampaign', campaignId);
  return url.href;
}
export function calendarMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Choose a calendar month');
  const first = new Date(`${month}-01T00:00:00Z`);
  if (!Number.isFinite(first.getTime()) || first.toISOString().slice(0, 7) !== month) throw new Error('Invalid calendar month');
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const days = last.getUTCDate();
  return { offset: first.getUTCDay(), dates: Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`) };
}

export async function mountFirstProject(admin, dialog) {
  let state, busy = false, owner, settings, config;
  const status = admin.querySelector('[data-campaign-status]');
  const participantStatus = dialog.querySelector('[data-campaign-status]');
  admin.querySelector('[name="campaignMonth"]').value = new Date().toISOString().slice(0, 7);
  const notice = message => { status.textContent = participantStatus.textContent = message; };
  const json = async url => {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Campaign source unavailable (HTTP ${response.status})`);
    return response.json();
  };
  async function wallet() {
    const current = window.decentCanopyWallet;
    if (!current?.address || current.chainId !== 8453 || !window.ethereum) throw new Error('Connect your wallet on Base using the header');
    const provider = new window.ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const check = async () => {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (window.decentCanopyWallet !== current || accounts[0]?.toLowerCase() !== current.address.toLowerCase() ||
          Number(await window.ethereum.request({ method: 'eth_chainId' })) !== 8453 ||
          (await signer.getAddress()).toLowerCase() !== current.address.toLowerCase()) throw new Error('Wallet or Base network changed; refresh before continuing');
    };
    await check();
    return { address: current.address, signer, provider, ethers: window.ethers, check };
  }
  async function request(body) {
    if (!config?.serviceUrl) throw new Error('First Project service is not configured');
    const url = new URL(config.serviceUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Campaign service must be configured with a credential-free HTTPS URL');
    const response = await fetch(`${url.href.replace(/\/$/, '')}/api/promotions`, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
    } : { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Campaign request failed (${response.status})`);
    if (result.routerAddress?.toLowerCase() !== settings.routerAddress.toLowerCase()) throw new Error('Campaign service uses a different settlement router');
    return result;
  }
  async function command(input) {
    const w = await wallet();
    const body = { address: w.address, origin: location.origin, issuedAt: new Date().toISOString(),
      application: 'decentcanopy', command: { revision: state.revision, ...input } };
    body.signature = await w.signer.signMessage(firstProjectAuthorization(body));
    await w.check();
    state = await request(body);
    await w.check();
    render();
    return state;
  }
  async function guard(action) {
    if (busy) return;
    busy = true;
    for (const root of [admin, dialog]) { root.setAttribute('aria-busy', 'true'); root.inert = true; }
    try { await action(); }
    catch (error) { notice(error.message); console.error('[Canopy First Project]', error); }
    finally { busy = false; for (const root of [admin, dialog]) { root.removeAttribute('aria-busy'); root.inert = false; } }
  }
  const campaigns = () => (state?.campaigns || []).filter(c => c.application === 'decentcanopy');
  function render() {
    const month = admin.querySelector('[name="campaignMonth"]').value;
    const { offset, dates } = calendarMonth(month);
    admin.querySelector('[data-dcal-days]').innerHTML = `${'<span></span>'.repeat(offset)}${dates.map(date => {
      const offers = campaigns().filter(c => date >= c.startsAt.slice(0, 10) && date <= c.endsAt.slice(0, 10));
      return `<button type="button" data-campaign-date="${date}" aria-label="${date}${offers.length ? ': campaign window' : ''}">${date.slice(-2)}${offers.map(c => `<small>${escape(c.title)} · ${escape(c.status)}</small>`).join('')}</button>`;
    }).join('')}`;
    const options = campaigns().filter(c => !['draft', 'archived'].includes(c.status));
    const selector = dialog.querySelector('[name="campaignId"]'), selected = selector.value;
    selector.innerHTML = options.map(c => `<option value="${escape(c.id)}">${escape(c.title)} · ${escape(c.status)} · ${c.remainingAwards} awards left</option>`).join('');
    if (options.some(c => c.id === selected)) selector.value = selected;
    const isOwner = window.decentCanopyWallet?.address?.toLowerCase() === owner?.toLowerCase();
    const available = state?.features?.firstProject === FIRST_PROJECT_VERSION;
    admin.querySelector('[data-campaign-save]').disabled = !isOwner;
    admin.querySelector('[data-campaign-offers]').innerHTML = campaigns().map(c => `<article>
      <h4>${escape(c.title)}</h4><p>${escape(c.status)} · $5 each · ${c.remainingAwards}/12 rewards available · $60 total</p>
      <p>${escape(c.startsAt)} to ${escape(c.endsAt)} · claim by ${escape(c.claimDeadline)}</p>
      <p>${escape(c.terms)}</p>
      ${c.status === 'draft' ? `<button type="button" data-campaign-edit="${escape(c.id)}">Edit draft</button>` : ''}
      ${({ draft: ['published', 'archived'], published: ['paused', 'closed'], paused: ['published', 'closed'], closed: ['archived'], archived: [] }[c.status] || [])
        .map(next => `<button type="button" data-campaign-state="${next}" data-campaign-id="${escape(c.id)}" ${!isOwner || next === 'published' && !available ? 'disabled' : ''}>${next === 'published' ? 'Publish funded offer' : escape(next)}</button>`).join('')}
      ${!available ? '<p>Publication unavailable until the worker and creator contracts are configured.</p>' : ''}</article>`).join('');
    admin.querySelector('[data-campaign-claims]').innerHTML = (state?.claims || []).filter(c => c.application === 'decentcanopy').map(c => `<article data-claim="${escape(c.id)}">
      <p>${escape(c.wallet)} · ${escape(c.status)} · 5 USDC</p><p>${escape(c.evidence)}</p>
      <a href="https://basescan.org/tx/${escape(c.qualification.mintTxHash)}" target="_blank" rel="noopener noreferrer">Mint receipt</a>
      <a href="${escape(studioProjectLink(c.wallet, c.qualification.projectKey, c.campaignId))}" target="_blank" rel="noopener noreferrer">Project's Supporter Studio</a>
      <label>Review reason / recovery explanation<input data-review-reason maxlength="2000"></label>
      <label><input type="checkbox" data-human-review> I reviewed this participant and their creator/project approvals.</label>
      <button type="button" data-claim-action="approve" ${!isOwner || !['submitted', 'needs-evidence'].includes(c.status) ? 'disabled' : ''}>Approve reviewed reward</button>
      <button type="button" data-claim-action="reject" ${!isOwner || !['submitted', 'needs-evidence'].includes(c.status) ? 'disabled' : ''}>Reject</button>
      <button type="button" data-claim-action="pay" ${!isOwner || c.status !== 'approved' ? 'disabled' : ''}>Enable recipient &amp; pay 5 USDC</button>
      <label>Wallet transaction hash<input data-payment-hash value="${escape(c.txHash || '')}" maxlength="66"></label>
      <button type="button" data-claim-action="reconcile" ${!isOwner ? 'disabled' : ''}>Reconcile existing payment</button>
      <label><input type="checkbox" data-no-broadcast> Wallet history confirms no payment was broadcast.</label>
      <button type="button" data-claim-action="release" ${!isOwner || c.status !== 'payment-pending' || c.txHash ? 'disabled' : ''}>Release unbroadcast preparation</button>
      ${c.history.map(h => `<p>${escape(h.at)} · ${escape(h.action)}: ${escape(h.reason)}</p>`).join('')}</article>`).join('');
    const campaign = options.find(c => c.id === selector.value);
    const connected = window.decentCanopyWallet?.address && window.decentCanopyWallet.chainId === 8453;
    const members = (state?.members || []).filter(m => m.campaignId === campaign?.id);
    const joined = members.some(m => m.wallet === window.decentCanopyWallet?.address?.toLowerCase());
    const now = Date.now();
    dialog.querySelector('button[value="join"]').disabled = !available || !connected || !campaign || joined ||
      members.length >= 12 || campaign.status !== 'published' || now < Date.parse(campaign.startsAt) || now >= Date.parse(campaign.endsAt);
    dialog.querySelector('button[value="claim"]').disabled = !available || !connected || !campaign || !joined ||
      !['published', 'closed'].includes(campaign.status) || now > Date.parse(campaign.claimDeadline);
    dialog.querySelector('[data-participant-terms]').textContent = campaign?.terms || 'No published First Project offer is available. Drafts are not funded promises.';
    dialog.querySelector('[data-participant-results]').textContent = (state?.claims || []).filter(c =>
      c.application === 'decentcanopy' && c.wallet === window.decentCanopyWallet?.address?.toLowerCase())
      .map(c => `${c.status}: ${c.qualification.projectId}${c.txHash ? ` · ${c.txHash}` : ''}`).join('\n');
  }
  function edit(campaign) {
    const form = admin.querySelector('[data-campaign-editor]');
    form.dataset.campaignId = campaign?.id || '';
    form.elements.title.value = campaign?.title || 'First Project';
    const start = campaign?.startsAt || new Date().toISOString();
    for (const [key, days] of [['startsAt', 0], ['endsAt', 7], ['claimDeadline', 14]]) {
      form.elements[key].value = (campaign?.[key] || new Date(Date.parse(start) + days * 86400000).toISOString()).slice(0, 16);
    }
    form.hidden = false;
    form.elements.title.focus();
  }
  async function pay(claim) {
    const w = await wallet();
    if (w.address.toLowerCase() !== owner.toLowerCase() || !confirm(`Pay 5 Base USDC to ${claim.wallet} after the reviewed First Project checks? Recipient enablement and payout require separate wallet confirmations.`)) return;
    const router = new w.ethers.Contract(settings.routerAddress, ROUTER_ABI, w.signer);
    const existing = await router.contributors(claim.wallet);
    if (!existing.approved) {
      const identity = existing.githubIdHash !== w.ethers.ZeroHash ? existing.githubIdHash : w.ethers.id(`promotions:${claim.wallet}`);
      if (!confirm(`Enable ${claim.wallet} on the shared settlement router? This is separate from payment and enables eligible payouts from other funds too. The new identifier is wallet-based, not GitHub identity verification.`)) return;
      await router.setContributorApproved.staticCall(claim.wallet, identity, true);
      await w.check();
      const tx = await router.setContributorApproved(claim.wallet, identity, true);
      notice(`Recipient enablement submitted: ${tx.hash}. This is not payment.`);
      await tx.wait(2);
      await w.check();
    }
    await routerPayout({ w, routerAddress: settings.routerAddress, routerAbi: ROUTER_ABI, fund: FIRST_PROJECT_FUND,
      asset: USDC, recipientWallet: claim.wallet, amountUnits: '5000000',
      reference: `decentcanopy:first-project:v1:8453:${claim.wallet}`, repository: 'TheJollyLaMa/DecentCanopy',
      key: `decentcanopy:first-project-payment:${claim.id}`, storage: localStorage, status,
      prepare: () => command({ action: 'prepare-payment', claimId: claim.id }),
      reconcile: txHash => command({ action: 'reconcile', claimId: claim.id, txHash }),
      isPaid: result => result.claims.find(c => c.id === claim.id)?.status === 'paid' });
  }
  async function approveProject() {
      const form = admin.querySelector('[data-project-approval]'), w = await wallet();
      if (w.address.toLowerCase() !== owner.toLowerCase() || !form.elements.reviewed.checked) throw new Error('The steward must review this creator and published project before authorizing minting');
      const collection = config.collectionAddress;
      if (!window.ethers.isAddress(collection) || state?.features?.supporterContracts?.collectionAddress !== collection.toLowerCase()) {
        throw new Error('Configure the verified creator collection v0.4 first; do not use the legacy Agency collection');
      }
      const creator = form.elements.creatorWallet.value.trim(), key = form.elements.projectKey.value.trim();
      const { record, sourceRevision } = await loadPublishedCreator(creator);
      if (!record.projects.some(p => p.key === key)) throw new Error('Project is missing from the current signed public creator profile');
      const editionLimit = form.elements.editionLimit.value;
      if (!/^[1-9]\d{0,19}$/.test(editionLimit) || BigInt(editionLimit) >= 2n ** 64n) throw new Error('Enter a positive uint64 edition allowance');
      const nft = new w.ethers.Contract(collection, [
        'function hasRole(bytes32,address) view returns(bool)', 'function authorizeCreator(address,uint64)',
        'function isCreatorProjectApproved(address,bytes32) view returns(bool)',
        'function setCreatorProjectApproval(address,string,bool)',
      ], w.signer);
      if (!await nft.hasRole(w.ethers.ZeroHash, w.address)) throw new Error('Creator collection administrator role required');
      const projectId = `decent-project:${creator.toLowerCase()}:${key}`;
      if (!confirm(`Authorize ${record.name} / ${projectId} for Supporter minting?\nPublic source ${sourceRevision}.\nNew creator edition allowance ${editionLimit}; existing creator allowances and lifetime project counts are preserved.\nCreator authorization and project approval are separate wallet transactions.`)) return;
      if (!await nft.hasRole(w.ethers.id('CREATOR_ROLE'), creator)) {
        await nft.authorizeCreator.staticCall(creator, editionLimit);
        await w.check();
        const tx = await nft.authorizeCreator(creator, editionLimit);
        notice(`Creator authorization submitted: ${tx.hash}. No mint or reward has occurred.`);
        await tx.wait(2); await w.check();
      }
      if (!await nft.isCreatorProjectApproved(creator, w.ethers.id(projectId))) {
        await nft.setCreatorProjectApproval.staticCall(creator, projectId, true);
        await w.check();
        const tx = await nft.setCreatorProjectApproval(creator, projectId, true);
        notice(`Project approval submitted: ${tx.hash}. No mint or reward has occurred.`);
        await tx.wait(2); await w.check();
      }
      notice('Creator and published project approved for minting. This does not approve or pay a campaign reward.');
    }
    admin.querySelector('[data-project-approval]').addEventListener('submit', event => {
      event.preventDefault(); void guard(approveProject);
    });
  admin.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-first-project-draft]')) edit();
    if (button.dataset.campaignDate) {
      const start = `${button.dataset.campaignDate}T12:00:00.000Z`;
      edit({ startsAt: start, endsAt: new Date(Date.parse(start) + 7 * 86400000).toISOString(),
        claimDeadline: new Date(Date.parse(start) + 14 * 86400000).toISOString() });
    }
    if (button.dataset.campaignEdit) edit(campaigns().find(c => c.id === button.dataset.campaignEdit));
    if (button.matches('[data-campaign-funding]')) {
      document.getElementById('admin-fund-slug').value = FIRST_PROJECT_FUND;
      document.getElementById('admin-deposit-amount').value = '60.00';
      document.getElementById('admin-fund-form').closest('details').open = true;
      document.getElementById('admin-fund-slug').focus();
      notice('Inspect the Canopy promotional allocation, supply public metadata, then explicitly create/fund it. Nothing has been sent.');
    }
    if (button.dataset.campaignState) void guard(async () => {
      if (!confirm(`Set this offer to ${button.dataset.campaignState}? Publishing freezes its terms; no automatic funding or payout.`)) return;
      await command({ action: 'status', campaignId: button.dataset.campaignId, status: button.dataset.campaignState });
    });
    if (button.dataset.claimAction) void guard(async () => {
      const row = button.closest('[data-claim]'), claim = state.claims.find(c => c.id === row.dataset.claim);
      const reason = row.querySelector('[data-review-reason]').value;
      if (button.dataset.claimAction === 'pay') return pay(claim);
      if (button.dataset.claimAction === 'reconcile') {
        const result = await command({ action: 'reconcile', claimId: claim.id, txHash: row.querySelector('[data-payment-hash]').value.trim() });
        if (result.claims.find(c => c.id === claim.id)?.status === 'paid') localStorage.removeItem(`decentcanopy:first-project-payment:${claim.id}`);
      } else if (button.dataset.claimAction === 'release') {
        await command({ action: 'release-payment-preparation', claimId: claim.id, reason,
          confirmNoBroadcast: row.querySelector('[data-no-broadcast]').checked });
        localStorage.removeItem(`decentcanopy:first-project-payment:${claim.id}`);
      } else await command({ action: 'review', claimId: claim.id, decision: button.dataset.claimAction === 'approve' ? 'approved' : 'rejected',
        reason, confirmParticipantReview: row.querySelector('[data-human-review]').checked });
    });
  });
  admin.querySelector('[data-campaign-editor]').addEventListener('submit', event => {
    event.preventDefault();
    void guard(async () => {
      const form = event.currentTarget, dates = ['startsAt', 'endsAt', 'claimDeadline'].map(key => `${form.elements[key].value}:00.000Z`);
      await command({ action: 'save', campaignId: form.dataset.campaignId || undefined,
        campaign: firstProjectDraft(...dates, { title: form.elements.title.value }) });
      form.hidden = true;
      notice('Saved a public, editable draft. No funding, publication or payment has occurred.');
    });
  });
  dialog.querySelector('[data-participant-form]').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    void guard(async () => {
      const campaign = campaigns().find(c => c.id === form.elements.campaignId.value);
      if (!campaign) throw new Error('Choose a published offer');
      const action = event.submitter?.value;
      if (action === 'join') await command({ action: 'join', campaignId: campaign.id, acceptTerms: form.elements.acceptTerms.checked, termsVersion: campaign.version });
      else await command({ action: 'claim', campaignId: campaign.id, projectKey: form.elements.projectKey.value.trim(),
        mintTxHash: form.elements.mintTxHash.value.trim(), listingId: form.elements.listingId.value.trim(),
        evidence: `Published Canopy project ${form.elements.projectKey.value.trim()}; Supporter mint and active sale listing submitted for steward review.` });
    });
  });
  dialog.querySelector('[data-open-studio]').addEventListener('click', () => {
    try { window.open(studioProjectLink(window.decentCanopyWallet?.address, dialog.querySelector('[name="projectKey"]').value.trim(),
      dialog.querySelector('[name="campaignId"]').value), '_blank', 'noopener,noreferrer'); }
    catch (error) { notice(error.message); }
  });
  const refresh = () => guard(async () => {
    state = await request();
    render();
    if (window.decentCanopyWallet?.address) await command({ action: 'view' });
    notice('Campaign records loaded. Review signed terms before joining; no reward is automatic.');
  });
  document.querySelectorAll('[data-first-project-open]').forEach(button => button.addEventListener('click', () => { dialog.showModal(); void refresh(); }));
  for (const root of [admin, dialog]) root.querySelector('[data-campaign-refresh]').addEventListener('click', refresh);
  dialog.querySelector('[data-campaign-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[name="campaignId"]').addEventListener('change', () => void guard(async () => render()));
  admin.querySelector('[name="campaignMonth"]').addEventListener('change', () => void guard(async () => render()));
  window.addEventListener('decentcanopy:wallet-change', () => { state = undefined; render(); notice('Wallet changed; refresh campaign records before continuing.'); });
  const [policy, accounts, assets] = await Promise.all([json('community-rewards.json'), json('contributor-accounts.json'), json('payroll-assets.json')]);
  config = policy.firstProject; settings = assets;
  owner = accounts.contributors?.find(c => c.role === 'owner')?.walletAddress;
  if (!window.ethers.isAddress(owner) || settings.chainId !== 8453 || !window.ethers.isAddress(settings.routerAddress)) throw new Error('First Project owner/router configuration is invalid');
  admin.querySelector('[name="campaignMonth"]').value = new Date().toISOString().slice(0, 7);
  render();
  const linkedCampaign = new URLSearchParams(location.search).get('canopyCampaign');
  const returnParams = new URLSearchParams(location.search);
  for (const key of ['projectKey', 'mintTxHash', 'listingId']) {
    const value = returnParams.get(key);
    if (value) dialog.querySelector(`[name="${key}"]`).value = value;
  }
  if (linkedCampaign) { dialog.showModal(); await refresh(); dialog.querySelector('[name="campaignId"]').value = linkedCampaign; render(); }
}

if (typeof document !== 'undefined') {
  const admin = document.getElementById('first-project-admin'), dialog = document.getElementById('first-project-dialog');
  if (admin && dialog) mountFirstProject(admin, dialog).catch(error => {
    console.error('[Canopy First Project setup]', error);
    for (const root of [admin, dialog]) root.querySelector('[data-campaign-status]').textContent = error.message;
  });
}
