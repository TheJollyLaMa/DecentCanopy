/* global GTPData, CanopyParticipationModel */
/*
 * First-visit beginner tour, the visitor's "view" preference, and the stashable data-notes drawer.
 * Everything here is stored in this browser only; a chosen view is a preference, never an ownership claim.
 */
(function () {
  'use strict';
  const TOUR_KEY = 'decentcanopy-tour-v1';
  const VIEWER_KEY = 'decentcanopy-viewer-v1';
  const NOTES_KEY = 'decentcanopy-data-notes-v1';
  const EXAMPLE_ID = 'curator:thejollylama';
  const LOCAL_ID = 'local-creator:me';
  const STEPS = 5;

  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (_) { /* storage may be unavailable; the tour still works for this visit */ }
  }

  function load(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function viewerId() {
    return load(VIEWER_KEY);
  }

  function focusEntity(id) {
    window.dispatchEvent(new CustomEvent('decentcanopy:focus-entity', { detail: id }));
  }

  // ---- Data notes drawer --------------------------------------------------------
  const notes = {
    set(open, remember = true) {
      const root = document.getElementById('data-notes');
      if (!root) return;
      root.dataset.open = String(open);
      document.getElementById('data-notes-panel').hidden = !open;
      document.getElementById('data-notes-tab').setAttribute('aria-expanded', String(open));
      if (remember) store(NOTES_KEY, open ? 'open' : 'stashed');
    },
    open() { notes.set(true, false); },
  };
  window.CanopyDataNotes = notes;

  // ---- Tour ----------------------------------------------------------------------
  let step = 0;

  function el(id) { return document.getElementById(id); }

  function renderStep() {
    const dialog = el('canopy-tour-dialog');
    dialog.querySelectorAll('.tour-step').forEach(section => {
      section.hidden = Number(section.dataset.step) !== step;
    });
    dialog.querySelectorAll('.tour-dots span').forEach((dot, index) => dot.classList.toggle('active', index === step));
    el('tour-step-count').textContent = `${step + 1} of ${STEPS}`;
    el('tour-back').disabled = step === 0;
    el('tour-next').textContent = step === STEPS - 1 ? 'Start exploring' : step === 3 ? 'Save & continue' : 'Next';
    el('tour-skip').hidden = step === STEPS - 1;
  }

  function fillExisting() {
    const select = el('tour-existing');
    const creators = (typeof GTPData !== 'undefined' ? GTPData.getProjects() : [])
      .filter(entity => entity.kind === 'creator' && entity.id !== LOCAL_ID)
      .sort((a, b) => a.name.localeCompare(b.name));
    select.replaceChildren(...creators.map(entity => new Option(entity.name, entity.id)));
    const current = viewerId();
    if (current && creators.some(entity => entity.id === current)) select.value = current;
    const choice = current === LOCAL_ID ? 'local' : current ? 'existing' : 'explore';
    const radio = document.querySelector(`input[name="tour-viewer"][value="${choice}"]`);
    if (radio) radio.checked = true;
    if (!creators.length) document.querySelector('input[name="tour-viewer"][value="existing"]').disabled = true;
    const local = typeof GTPData !== 'undefined' && GTPData.getProjectById(LOCAL_ID);
    if (local) {
      el('tour-name').value = local.name || '';
      el('tour-website').value = local.websiteUrl || '';
      el('tour-artizen').value = local.artizenPageUrl || '';
    }
    syncChoice();
  }

  function syncChoice() {
    const choice = document.querySelector('input[name="tour-viewer"]:checked')?.value;
    document.querySelectorAll('.tour-sub').forEach(sub => { sub.hidden = sub.dataset.for !== choice; });
    el('tour-error').textContent = '';
  }

  let reloadAfterTour = false;

  function saveViewer() {
    const choice = document.querySelector('input[name="tour-viewer"]:checked')?.value || 'explore';
    if (choice === 'explore') { store(VIEWER_KEY, null); return; }
    if (choice === 'existing') { store(VIEWER_KEY, el('tour-existing').value || null); return; }
    if (!el('tour-consent').checked) throw new Error('Tick the local-storage box to save your card, or choose “Just exploring”.');
    const name = el('tour-name').value.trim();
    if (!name) throw new Error('Please enter a display name.');
    const websiteUrl = CanopyParticipationModel.website(el('tour-website').value.trim());
    const artizenProfileUrl = CanopyParticipationModel.artizenProfile(el('tour-artizen').value.trim());
    window.CanopyParticipation.saveLocalCreator({
      id: LOCAL_ID, name, websiteUrl, ...(artizenProfileUrl ? { artizenProfileUrl } : {}),
    });
    store(VIEWER_KEY, LOCAL_ID);
    reloadAfterTour = true;
  }

  function finish(focus = true) {
    store(TOUR_KEY, 'done');
    el('canopy-tour-dialog').close();
    if (reloadAfterTour) {
      window.location.reload();
      return;
    }
    const id = viewerId();
    if (focus && id) focusEntity(id);
  }

  function openTour() {
    step = 0;
    reloadAfterTour = false;
    fillExisting();
    renderStep();
    const dialog = el('canopy-tour-dialog');
    if (!dialog.open) dialog.showModal();
  }

  window.CanopyOnboarding = { viewerId, openTour };

  document.addEventListener('DOMContentLoaded', () => {
    const dialog = el('canopy-tour-dialog');
    if (!dialog) return;

    el('data-notes-tab')?.addEventListener('click', () => notes.set(true));
    el('data-notes-stash')?.addEventListener('click', () => {
      notes.set(false);
      el('data-notes-tab').focus();
    });
    notes.set(load(NOTES_KEY) === 'open', false);

    el('tour-open').addEventListener('click', openTour);
    document.querySelectorAll('input[name="tour-viewer"]').forEach(radio => radio.addEventListener('change', syncChoice));
    el('tour-back').addEventListener('click', () => { step = Math.max(0, step - 1); renderStep(); });
    el('tour-skip').addEventListener('click', () => finish(false));
    el('tour-peek').addEventListener('click', () => {
      store(TOUR_KEY, 'done');
      dialog.close();
      focusEntity(EXAMPLE_ID);
    });
    el('tour-next').addEventListener('click', () => {
      if (step === 3) {
        try { saveViewer(); }
        catch (error) {
          el('tour-error').textContent = error.message;
          return;
        }
      }
      if (step === STEPS - 1) { finish(); return; }
      step += 1;
      renderStep();
    });
    dialog.addEventListener('cancel', () => store(TOUR_KEY, 'done'));
  });

  window.addEventListener('decentcanopy:ready', () => {
    if (!load(TOUR_KEY)) {
      openTour();
      return;
    }
    const id = viewerId();
    if (id) focusEntity(id);
  });
}());
