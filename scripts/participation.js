/* global CanopyParticipationModel, GTPData */
(function () {
  'use strict';
  const STORAGE_KEY = 'decentcanopy-participation-v1';
  const EMPTY = { format: 'decentcanopy-participation', version: 1, coverage: 'No imported activity', entities: [], connections: [], events: [] };
  let preview = null;
  let websiteEntity = null;
  let previewRequest = 0;
  let locationRequest = 0;

  function status(message) {
    document.getElementById('participation-status').textContent = message;
  }

  function read() {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : { bundle: EMPTY, websites: {}, consent: false };
  }

  function persist(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.location.reload();
  }

  function overlay(base) {
    try {
      const state = read();
      if (!state.consent) return base;
      const bundle = CanopyParticipationModel.validate(state.bundle, base.projects);
      return CanopyParticipationModel.apply(base, bundle, state.websites, state.profiles);
    } catch (error) {
      console.error('[participation] Local data was not applied:', error);
      status(`Local import could not be loaded: ${error.message} Open Participate to clear or replace it. The public snapshot is unchanged.`);
      document.getElementById('participation-open').textContent = 'Participation error';
      return base;
    }
  }

  function consent() {
    if (!document.getElementById('participation-consent').checked) {
      throw new Error('Please consent to local storage before saving. Nothing will be uploaded.');
    }
  }

  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openWebsite(entity) {
    locationRequest++;
    websiteEntity = entity;
    document.getElementById('participation-website-id').textContent = `${entity.name} · ${entity.id}`;
    document.getElementById('participation-website').value = entity.websiteUrl || '';
    document.getElementById('participation-address').value = entity.publicWallet?.address || '';
    document.getElementById('participation-chain').value = entity.publicWallet?.chainId || 8453;
    const location = entity.sharedLocation;
    document.getElementById('participation-location-consent').checked = Boolean(location);
    document.getElementById('participation-location-precision').value = location?.precision || 'city';
    document.getElementById('participation-location-label').value = location?.label || '';
    document.getElementById('participation-latitude').value = location?.latitude ?? '';
    document.getElementById('participation-longitude').value = location?.longitude ?? '';
    document.getElementById('participation-website-editor').hidden = false;
    document.getElementById('participation-dialog').showModal();
  }

  async function readPublicWallet(entity) {
    openWebsite(entity);
    status('Reading only this public wallet’s native balance and block number. This is not Artizen purchase or income data.');
    try {
      const balance = await CanopyParticipationModel.readLedgerBalance(window.ethereum, entity.publicWallet);
      status(`${entity.name}: ${balance.eth} ETH on ${CanopyParticipationModel.networks[balance.chainId].name}, block ${balance.block}. Read at ${balance.readAt}. Provider-reported public ledger balance; not verified ownership, personal wealth, fundraising, or Artizen activity. This lookup is not saved.`);
    } catch (error) {
      status(`Public wallet lookup failed: ${error.message}`);
    }
  }

  window.CanopyParticipation = { overlay, openWebsite, readPublicWallet };

  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('participation-dialog');
    const file = document.getElementById('participation-file');
    const save = document.getElementById('participation-save');
    const summary = document.getElementById('participation-preview');
    const fields = document.getElementById('participation-fields');
    function handle(action) {
      return async () => {
        try { await action(); }
        catch (error) { status(error.message); }
      };
    }
    document.getElementById('participation-open').addEventListener('click', () => dialog.showModal());
    document.getElementById('participation-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { locationRequest++; });
    ['participation-location-precision', 'participation-location-label', 'participation-latitude', 'participation-longitude']
      .forEach(id => document.getElementById(id).addEventListener('input', () => { locationRequest++; }));
    document.getElementById('participation-location-consent').addEventListener('change', event => {
      locationRequest++;
      if (!event.target.checked) {
        document.getElementById('participation-latitude').value = '';
        document.getElementById('participation-longitude').value = '';
      }
    });
    document.getElementById('participation-wallet').addEventListener('click', () =>
      document.getElementById('wallet-connect-button').click());
    file.addEventListener('change', handle(async () => {
      const request = ++previewRequest;
      preview = null;
      save.disabled = true;
      summary.textContent = '';
      fields.textContent = '';
      const selected = file.files[0];
      if (!selected) return;
      if (selected.size > 2 * 1024 * 1024) throw new Error('Import is limited to 2 MB.');
      await GTPData.load();
      const candidate = CanopyParticipationModel.validate(JSON.parse(await selected.text()), GTPData.getProjects()
        .filter(entity => !entity.id.startsWith('local-creator:')));
      if (request !== previewRequest) return;
      preview = candidate;
      summary.textContent = `${preview.entities.length} cards, ${preview.connections.length} connections, ${preview.events.length} activity records. Coverage: ${preview.coverage}. All imported claims are participant-reported, not Artizen-verified. Saving replaces the previous local import.`;
      fields.textContent = JSON.stringify(preview, null, 2);
      status('Preview ready. Review the coverage and consent before saving.');
      save.disabled = false;
    }));
    save.addEventListener('click', handle(() => {
      consent();
      if (!preview) throw new Error('Choose and preview an import first.');
      const state = read();
      persist({ ...state, consent: true, bundle: preview });
    }));
    document.getElementById('participation-website-save').addEventListener('click', handle(() => {
      consent();
      if (!websiteEntity) throw new Error('Select a canopy card first.');
      const url = CanopyParticipationModel.website(document.getElementById('participation-website').value);
      const state = read();
      persist({ ...state, consent: true, websites: { ...state.websites, [websiteEntity.id]: url } });
    }));
    document.getElementById('participation-use-wallet').addEventListener('click', handle(() => {
      const connected = window.decentCanopyWallet;
      if (!connected) throw new Error('Connect your wallet first using the header.');
      const linked = CanopyParticipationModel.wallet(connected);
      document.getElementById('participation-address').value = linked.address;
      document.getElementById('participation-chain').value = linked.chainId;
      status('Connected address filled in. This does not verify ownership of this Artizen card. Save only data you have permission to associate.');
    }));
    document.getElementById('participation-geolocation').addEventListener('click', handle(() => {
      if (!document.getElementById('participation-location-consent').checked) {
        throw new Error('Opt in to location storage before requesting geolocation.');
      }
      if (!navigator.geolocation) throw new Error('Geolocation is unavailable in this browser.');
      const request = ++locationRequest;
      status('Waiting for browser location permission. Coordinates will not be saved until you choose Save wallet / location.');
      navigator.geolocation.getCurrentPosition(position => {
        if (request !== locationRequest) return;
        if (!dialog.open || !document.getElementById('participation-location-consent').checked) {
          status('Location result discarded because the editor was closed or location consent was withdrawn.');
          return;
        }
        document.getElementById('participation-location-precision').value = 'precise';
        document.getElementById('participation-latitude').value = position.coords.latitude.toFixed(6);
        document.getElementById('participation-longitude').value = position.coords.longitude.toFixed(6);
        status(`Coordinates filled in (browser accuracy about ${Math.round(position.coords.accuracy)} metres). Choose a place label, review precision, and save only if comfortable. Selecting city/country rounds saved coordinates.`);
      }, error => {
        if (request === locationRequest) status(`Location request failed: ${error.message}`);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    }));
    document.getElementById('participation-profile-save').addEventListener('click', handle(() => {
      consent();
      if (!websiteEntity) throw new Error('Select a canopy card first.');
      const address = document.getElementById('participation-address').value.trim();
      const publicWallet = CanopyParticipationModel.wallet(address ? {
        address, chainId: Number(document.getElementById('participation-chain').value),
      } : null);
      const optedIn = document.getElementById('participation-location-consent').checked;
      const latitude = document.getElementById('participation-latitude').value.trim();
      const longitude = document.getElementById('participation-longitude').value.trim();
      const sharedLocation = CanopyParticipationModel.location(optedIn ? {
        consent: true, precision: document.getElementById('participation-location-precision').value,
        label: document.getElementById('participation-location-label').value,
        latitude: latitude === '' ? undefined : Number(latitude),
        longitude: longitude === '' ? undefined : Number(longitude),
      } : null);
      const state = read();
      persist({ ...state, consent: true, profiles: {
        ...state.profiles, [websiteEntity.id]: { publicWallet, sharedLocation },
      } });
    }));
    document.getElementById('participation-clear').addEventListener('click', handle(() => {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }));
    document.getElementById('participation-export').addEventListener('click', handle(() => {
      const state = read();
      if (!state.consent) throw new Error('No consented local data to export.');
      const bundle = structuredClone(state.bundle);
      for (const [id, url] of Object.entries(state.websites || {})) {
        let entity = bundle.entities.find(record => record.id === id);
        if (!entity) {
          const base = GTPData.getProjectById(id);
          if (!base) throw new Error(`Cannot export website for missing entity ${id}.`);
          entity = { id, name: base.name, kind: base.kind };
          bundle.entities.push(entity);
        }
        entity.websiteUrl = url;
      }
      for (const [id, profile] of Object.entries(state.profiles || {})) {
        let entity = bundle.entities.find(record => record.id === id);
        if (!entity) {
          const base = GTPData.getProjectById(id);
          if (!base) throw new Error(`Cannot export profile for missing entity ${id}.`);
          entity = { id, name: base.name, kind: base.kind };
          bundle.entities.push(entity);
        }
        Object.assign(entity, profile);
      }
      CanopyParticipationModel.validate(bundle, GTPData.getProjects());
      download(bundle, 'decentcanopy-participation.json');
      status('Export downloaded. Review it before sharing; it may contain personal activity.');
    }));
    document.getElementById('participation-template').addEventListener('click', () => download({
      ...EMPTY, coverage: 'My manually supplied records; not a complete lifetime history',
      entities: [{ id: 'local-creator:me', kind: 'creator', name: 'My display name', websiteUrl: 'https://example.org' }],
    }, 'decentcanopy-import-template.json'));
    window.addEventListener('decentcanopy:wallet-change', event => {
      document.getElementById('participation-wallet-status').textContent = event.detail
        ? `Connected ${event.detail.address}. Connection does not verify your Artizen identity or card ownership.`
        : 'Wallet not connected. Wallet connection is optional for this local prototype.';
    });
  });
}());
