(function (root) {
  'use strict';
  function identity(node, ens) {
    const project = node.creatorRecord?.projects?.find(p => p.key === node.creatorProjectKey);
    const name = node.agencyDetails?.ens || (project ? ens.nameFor(node.creatorRecord.wallet, project) : node.ens) || '';
    const repo = node.repoUrl || project?.repositories?.[0] || '';
    const match = /^https:\/\/github\.com\/([a-z0-9][a-z0-9-]{0,38})\/[\w.-]+\/?$/i.exec(repo);
    const discord = node.agencyDetails?.discordAvatar || node.discordAvatar || '';
    const fallbacks = [];
    if (match) fallbacks.push({ url: `https://github.com/${match[1]}.png?size=128`, source: `GitHub owner avatar · ${match[1]} (not project-specific)` });
    if (/^https:\/\/cdn\.discordapp\.com\/(?:avatars|guilds)\/[\w/.-]+\.(?:png|webp|gif)(?:\?size=\d+)?$/.test(discord)) {
      fallbacks.push({ url: discord, source: 'Published Discord avatar · unverified association' });
    }
    if (node.image && /^https:\/\//.test(node.image)) fallbacks.push({ url: node.image, source: node.imageSource || 'Published artwork · unverified association' });
    return { name, fallbacks };
  }
  function create({ ens, loadImage, changed = () => {}, warn = console.warn, now = Date.now }) {
    const states = new Map(), images = new Map(), jobs = [];
    let active = 0;
    const image = url => {
      if (!images.has(url) || now() - images.get(url).at >= 300000) {
        images.set(url, { promise: loadImage(url), at: now() });
      }
      return images.get(url).promise;
    };
    async function resolve(node, state) {
      const info = identity(node, ens), candidates = info.fallbacks.slice();
      if (info.name) {
        try {
          const art = await ens.artworkProfile(info.name);
          for (const notice of art.notices || []) {
            state.notices.push(notice);
            warn('[Canopy identity]', info.name, notice);
          }
          if (art.avatar) candidates.unshift({ url: art.avatar, source: `ENS avatar · ${info.name}` });
          if (art.header) {
            try { await image(art.header); state.banner = art.header; }
            catch (error) { state.notices.push('ENS banner image unavailable.'); warn('[Canopy identity] Banner unavailable.', info.name, error); }
          }
          if (!art.avatar) state.notices.push('No ENS avatar record; showing a fallback if available.');
        } catch (error) {
          state.notices.push('ENS artwork unavailable; showing a fallback if available.');
          warn('[Canopy identity] ENS lookup unavailable.', info.name, error);
        }
      }
      for (const candidate of candidates) {
        try {
          state.image = await image(candidate.url);
          state.avatar = candidate.url;
          state.source = candidate.source;
          break;
        } catch (error) {
          state.notices.push(`${candidate.source}: image unavailable.`);
          warn('[Canopy identity] Avatar image unavailable.', candidate.source, error);
        }
      }
      state.status = 'ready';
      state.checkedAt = now();
      changed(node.id);
    }
    function drain() {
      while (active < 4 && jobs.length) {
        const job = jobs.shift();
        active++;
        resolve(job.node, job.state).finally(() => { active--; drain(); });
      }
    }
    function get(node) {
      const info = identity(node, ens), key = JSON.stringify([node.id, info]);
      const saved = states.get(node.id);
      if (!saved || saved.key !== key || (saved.state.status === 'ready' && now() - saved.state.checkedAt >= 300000)) {
        const state = { status: 'loading', name: info.name, avatar: '', banner: '', source: '', image: null, notices: [], checkedAt: 0 };
        states.set(node.id, { key, state });
        jobs.push({ node, state });
        drain();
      }
      return states.get(node.id).state;
    }
    function mount(container, node) {
      container.querySelector('[data-map-identity]')?.remove();
      const state = get(node), section = container.ownerDocument.createElement('section');
      section.dataset.mapIdentity = node.id;
      section.className = 'map-identity';
      const addImage = (url, className, alt) => {
        if (!url) return;
        const img = container.ownerDocument.createElement('img');
        img.src = url; img.className = className; img.alt = alt; img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
          img.hidden = true;
          const note = container.ownerDocument.createElement('p');
          note.textContent = `${alt} unavailable.`; section.appendChild(note);
        }, { once: true });
        section.appendChild(img);
      };
      addImage(state.banner, 'map-identity-banner', `${node.name} ENS banner`);
      addImage(state.avatar, 'map-identity-avatar', `${node.name} · ${state.source}`);
      if (state.name) {
        const link = container.ownerDocument.createElement('a');
        link.href = `https://app.ens.domains/${encodeURIComponent(state.name)}`;
        link.textContent = state.name; link.target = '_blank'; link.rel = 'noopener noreferrer';
        section.appendChild(link);
      }
      const caption = container.ownerDocument.createElement('p');
      caption.className = 'details-muted';
      caption.textContent = state.status === 'loading' ? 'Loading public identity artwork…'
        : [state.source || 'No available avatar; map shape retained.', ...state.notices,
          state.name ? 'Steward/creator-associated ENS name, not proof of ownership.' : ''].filter(Boolean).join(' ');
      section.appendChild(caption);
      container.prepend(section);
    }
    return { get, mount };
  }
  const api = { identity, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyGraphIdentity = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
