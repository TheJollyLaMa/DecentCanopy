(function (root) {
  'use strict';
  const CANOPY = 'decent-project:0x807061df657a7697c04045da7d16d941861caabc:0e78af11-6bb7-4907-aeb4-23f6ce3ed0e6';
  const PUBLISHED_NAMES = {
    [CANOPY]: 'decentcanopy.eth',
    'decent-project:0x807061df657a7697c04045da7d16d941861caabc:bb15e18e-41de-4f79-9479-9ebcc3e5e467': 'thegreenteaparty.thejollylama.eth',
    'decent-project:0x807061df657a7697c04045da7d16d941861caabc:cd695985-650e-472e-8f3b-64cbb9a7f682': 'decentbusking.thejollylama.eth',
  };
  const GREEN_TEA = 'thegreenteaparty.thejollylama.eth';
  const FAMILY = [
    { name: `green-tea-party-kiln-001.${GREEN_TEA}`, label: 'Green Tea Party Kiln · Mama’s project' },
    { name: `green-tea-hut-001.${GREEN_TEA}`, label: 'Green Tea Hut #1' },
  ];
  const NAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+eth$/;
  const CID = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,100})$/;
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const cache = new Map(), pending = new Map();
  function nameFor(wallet, project) {
    if (project.ens && NAME.test(project.ens)) return project.ens;
    const publishedName = PUBLISHED_NAMES[`decent-project:${wallet}:${project.key}`];
    if (publishedName) return publishedName;
    try {
      const host = new URL(project.website).hostname;
      const name = host.endsWith('.eth.limo') ? host.slice(0, -5) : '';
      return NAME.test(name) ? name : '';
    } catch { return ''; }
  }
  function imageUrl(value) {
    if (!value) return '';
    if (value.startsWith('ipfs://')) {
      const [cid, ...path] = value.slice(7).replace(/^ipfs\//, '').split('/');
      if (!CID.test(cid)) throw new Error('ENS artwork contains an invalid IPFS CID.');
      return `https://ipfs.io/ipfs/${cid}/${path.map(encodeURIComponent).join('/')}`;
    }
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('ENS artwork must use HTTPS or IPFS.');
    return url.href;
  }
  function contentUri(value) {
    const cid = String(value || '').trim().replace(/^ipfs:\/\//, '');
    if (!CID.test(cid)) throw new Error('Enter a root IPFS CID or ipfs://CID, without a gateway URL or path.');
    return `ipfs://${cid}`;
  }
  function due(last, now = Date.now()) {
    return !Number.isFinite(last) || now - last >= WEEK;
  }
  function namedProjects(graph) {
    const nodes = new Map();
    for (const node of graph.projects || []) {
      if (!node.creatorProjectKey || !node.creatorRecord) continue;
      const project = node.creatorRecord.projects.find(p => p.key === node.creatorProjectKey);
      const name = nameFor(node.creatorRecord.wallet, project);
      if (name) nodes.set(name, nodes.has(name) ? null : node);
    }
    return nodes;
  }
  function family(name, graph, escape) {
    const nodes = namedProjects(graph), members = new Map();
    if (name === GREEN_TEA) FAMILY.forEach(item => members.set(item.name, item.label));
    for (const [child, node] of nodes) {
      if (node && child.split('.').slice(1).join('.') === name) members.set(child, members.get(child) || node.name);
    }
    const parent = name.split('.').slice(1).join('.');
    const parentNode = nodes.get(parent);
    const isGreenTeaChild = FAMILY.some(item => item.name === name);
    if (!members.size && !parentNode && !isGreenTeaChild) return '';
    const entry = (ens, label) => {
      const node = nodes.get(ens);
      return node
        ? `<button type="button" class="toolbar-btn" data-creator-view="${escape(node.id)}">${escape(label)}</button>`
        : `<a href="https://app.ens.domains/${escape(ens)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
    };
    return `<div class="project-ens-family"><h4>ENS project family</h4>
      ${parentNode || isGreenTeaChild ? `<p>Under ${entry(parent, parentNode?.name || 'The Green Tea Party')}</p>` : ''}
      ${members.size ? `<ul>${[...members].map(([ens, label]) => `<li>${entry(ens, label)}<small>${escape(ens)}</small></li>`).join('')}</ul>` : ''}
      <small>ENS subname structure, not a transfer of project ownership. Each project keeps its own creator.</small></div>`;
  }
  function decorateGraph(graph) {
    const nodes = namedProjects(graph), associations = graph.associations.slice();
    for (const [name, child] of nodes) {
      const parent = nodes.get(name.split('.').slice(1).join('.'));
      if (!child || !parent) continue;
      if (associations.some(a => a.type === 'parent-child' && a.source === parent.id && a.target === child.id)) continue;
      associations.push({ source: parent.id, target: child.id, type: 'parent-child', sourceLabel: 'ENS-name hierarchy',
        note: 'Parent/subproject inferred from associated ENS names; not proof of ENS or project ownership.', ensNamespace: true });
    }
    return { ...graph, associations };
  }
  function section(wallet, project, own, escape, graph = { projects: [] }) {
    const name = nameFor(wallet, project);
    if (!name) return own ? '<p class="project-ens-setup"><a class="toolbar-btn" href="https://app.ens.domains/" target="_blank" rel="noopener noreferrer">Set up ENS ↗</a><small>Add your ENS name in Edit project.</small></p>' : '';
    const id = `decent-project:${wallet}:${project.key}`;
    return `<section class="project-ens" data-project-ens="${escape(name)}" data-ens-project="${escape(id)}" data-ens-wallet="${escape(wallet)}" data-ens-own="${own ? 'true' : 'false'}">
      <h4>ENS · <a href="https://${escape(name)}.limo/" target="_blank" rel="noopener noreferrer">${escape(name)} ↗</a></h4>
      <p data-ens-status role="status" aria-live="polite">Reading Ethereum profile…</p>
      <div data-ens-art></div>${family(name, graph, escape)}<div data-ens-controls></div>
    </section>`;
  }
  function decodeIpfsContenthash(value) {
    if (!/^0xe30101(?:55|70)1220[0-9a-f]{64}$/i.test(value || '')) throw new Error('ENS contains an unsupported contenthash encoding.');
    const bytes = value.slice(6).match(/../g).map(byte => parseInt(byte, 16));
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    let result = 'b', bits = 0, buffer = 0;
    for (const byte of bytes) {
      buffer = (buffer << 8) | byte;
      bits += 8;
      while (bits >= 5) { bits -= 5; result += alphabet[(buffer >>> bits) & 31]; }
    }
    if (bits) result += alphabet[(buffer << (5 - bits)) & 31];
    return `ipfs://${result}`;
  }
  async function readContenthash(resolver) {
    try { return await resolver.getContentHash(); }
    catch (error) {
      if (error.code !== 'UNSUPPORTED_OPERATION' || error.operation !== 'getContentHash()' || !error.info?.data) throw error;
      return decodeIpfsContenthash(error.info.data);
    }
  }
  async function readProfile(name, provider) {
    if (!NAME.test(name)) throw new Error('Invalid ENS name.');
    const resolver = await provider.getResolver(name);
    if (!resolver) throw new Error('This ENS name has no resolver.');
    const [address, avatar, header, contenthash] = await Promise.all([
      resolver.getAddress(), resolver.getText('avatar'), resolver.getText('header'), readContenthash(resolver),
    ]);
    const avatarUrl = avatar?.startsWith('eip155:') ? await resolver.getAvatar() : avatar;
    if (avatar && !avatarUrl) throw new Error('ENS NFT avatar could not be verified or resolved.');
    return { name, address, avatar: imageUrl(avatarUrl), header: imageUrl(header), contenthash: contenthash || '' };
  }
  function profile(name) {
    const saved = cache.get(name);
    if (saved && Date.now() - saved.at < 5 * 60 * 1000) return Promise.resolve(saved.value);
    if (pending.has(name)) return pending.get(name);
    const request = new root.ethers.FetchRequest('https://ethereum-rpc.publicnode.com');
    request.timeout = 15000;
    const provider = new root.ethers.JsonRpcProvider(request, 1, { staticNetwork: true });
    const promise = readProfile(name, provider).then(value => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(name, { at: Date.now(), value });
      return value;
    }).finally(() => { pending.delete(name); provider.destroy(); });
    pending.set(name, promise);
    return promise;
  }
  async function latestCanopy(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(`https://raw.githubusercontent.com/TheJollyLaMa/DecentCanopy/main/ipfs-site.json?t=${now}`, {
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Latest site pin could not be read (${response.status}).`);
    const pin = await response.json();
    if (pin.format !== 'decentcanopy-site-pin' || !CID.test(pin.cid)) throw new Error('Invalid site pin manifest.');
    return contentUri(pin.cid);
  }
  function notice(section, text, error = false) {
    const status = section.querySelector('[data-ens-status]');
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function artwork(section, value) {
    const art = section.querySelector('[data-ens-art]');
    for (const kind of ['header', 'avatar']) {
      if (!value[kind]) continue;
      const image = document.createElement('img');
      image.src = value[kind];
      image.alt = `${value.name} ENS ${kind === 'header' ? 'banner' : 'avatar'}`;
      image.className = `project-ens-${kind}`;
      image.referrerPolicy = 'no-referrer';
      image.setAttribute('data-creator-image', '');
      if (kind === 'avatar') image.addEventListener('load', () => {
        const card = section.closest('.creator-project-card');
        const thumb = card?.querySelector('.creator-project-thumb');
        if (thumb) {
          const replacement = image.cloneNode();
          replacement.className = 'creator-project-thumb';
          thumb.replaceWith(replacement);
        }
      });
      art.appendChild(image);
    }
  }
  function controls(section, value, candidate, pinError) {
    const container = section.querySelector('[data-ens-controls]');
    const record = document.createElement('p');
    record.className = 'details-muted';
    record.textContent = `Website record: ${value.contenthash || 'Not set'}`;
    container.appendChild(record);
    if (section.dataset.ensOwn !== 'true') return;
    const label = document.createElement('label');
    label.textContent = 'New website CID';
    const input = document.createElement('input');
    input.type = 'text'; input.value = candidate || ''; input.placeholder = 'ipfs://CID';
    label.appendChild(input); container.appendChild(label);
    const message = document.createElement('p');
    message.className = 'details-muted'; message.setAttribute('role', 'status');
    const key = `decentcanopy-ens-review:${value.name}`;
    let last;
    try { last = Number(localStorage.getItem(key)); } catch (error) {
      console.warn('[ENS] Reminder preferences unavailable.', error);
      message.textContent = 'Browser storage unavailable; reminder preferences cannot be saved.';
    }
    if (!message.textContent) message.textContent = candidate && candidate === value.contenthash
      ? 'ENS already points to the latest pinned canopy.'
      : pinError ? pinError : due(last) ? 'Weekly check due: review your pinned site and ENS website record.' : 'Next weekly check is snoozed.';
    const update = document.createElement('button');
    update.type = 'button'; update.className = 'toolbar-btn'; update.textContent = 'Copy CID & open ENS ↗';
    update.addEventListener('click', async () => {
      update.disabled = true;
      try {
        const uri = contentUri(input.value);
        await navigator.clipboard.writeText(uri);
        message.textContent = 'Copied. Paste into Website / Contenthash in ENS Manager and approve with the ENS owner wallet. This button does not update ENS.';
        const link = document.createElement('a');
        link.href = `https://app.ens.domains/${value.name}?tab=records`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open ENS Manager ↗';
        link.setAttribute('data-ens-manager', '');
        container.querySelector('[data-ens-manager]')?.remove();
        container.appendChild(link);
        link.click();
      } catch (error) { message.textContent = error.message; console.warn('[ENS] Update preparation failed.', error); }
      finally { update.disabled = false; }
    });
    const snooze = document.createElement('button');
    snooze.type = 'button'; snooze.className = 'toolbar-btn'; snooze.textContent = 'Remind me next week';
    snooze.addEventListener('click', () => {
      try { localStorage.setItem(key, String(Date.now())); message.textContent = 'Reminder snoozed for one week in this browser. ENS has not been changed.'; }
      catch (error) { message.textContent = `Reminder could not be saved: ${error.message}`; console.warn('[ENS]', error); }
    });
    container.append(update, snooze, message);
  }
  async function hydrate(section) {
    try {
      const value = await profile(section.dataset.projectEns);
      if (!section.isConnected) return;
      const matches = value.address?.toLowerCase() === section.dataset.ensWallet;
      notice(section, matches ? 'Live ENS profile · address matches the creator wallet (not proof of ownership).'
        : value.address ? 'Live ENS profile · address differs from the creator wallet; project association is not verified.'
          : 'Live ENS profile · no Ethereum address record set; project association is not verified.');
      artwork(section, value);
      let candidate = '', pinError = '';
      if (section.dataset.ensProject === CANOPY && section.dataset.ensOwn === 'true') {
        try { candidate = await latestCanopy(); }
        catch (error) { pinError = error.message; console.warn('[ENS] Latest pin unavailable.', error); }
      }
      if (section.isConnected) controls(section, value, candidate, pinError);
    } catch (error) {
      console.warn('[ENS] Profile lookup failed.', error);
      if (section.isConnected) {
        notice(section, `ENS profile unavailable: ${error.message}. Saved project artwork is unchanged.`, true);
        const link = document.createElement('a');
        link.href = `https://app.ens.domains/${section.dataset.projectEns}?tab=records`;
        link.textContent = 'View records in ENS Manager ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer';
        section.querySelector('[data-ens-controls]').appendChild(link);
      }
    }
  }
  function mount(container) {
    container.querySelectorAll('[data-project-ens]').forEach(section => {
      if (section.dataset.ensMounted) return;
      section.dataset.ensMounted = 'true';
      hydrate(section);
    });
  }
  const api = { nameFor, imageUrl, contentUri, due, section, readProfile, latestCanopy, decodeIpfsContenthash, decorateGraph, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DecentENS = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
