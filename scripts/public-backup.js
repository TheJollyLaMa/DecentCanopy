(function (root) {
  'use strict';

  const DATA_FILES = Object.freeze([
    'contributor-accounts.json',
    'data/activity.json',
    'data/artizen-curation.json',
    'data/artizen.json',
    'data/artizen-archive.json',
    'data/artizen-comprehensive-capture.json',
    'data/artizen-financial-captures.json',
    'data/decent-creators.json',
    'data/associations.json',
    'data/community-creators.json',
    'data/community-pinners.json',
    'data/projects.json',
    'data/project-details.json',
    'data/supporter-dnfts.json',
    'data/agency-map.json',
    'payroll-assets.json',
    'payroll-queue.json',
    'community-rewards.json'
  ]);
  const MAX_BYTES = 20 * 1024 * 1024;
  function validateFiles(files) {
    if (!Array.isArray(files) || files.length !== DATA_FILES.length ||
        new Set(files).size !== files.length || files.some(file => !DATA_FILES.includes(file))) {
      throw new Error('Backup must contain only the complete published Canopy dataset; unpublished drafts are excluded.');
    }
  }
  function validatePayload(payload) {
    if (!payload || payload.format !== 'decentcanopy-data-backup' || payload.version !== 1 ||
        Object.keys(payload).sort().join(',') !== 'createdAt,files,format,version' ||
        typeof payload.createdAt !== 'string' || !Number.isFinite(Date.parse(payload.createdAt)) ||
        !payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files)) {
      throw new Error('Not a supported Canopy public-data backup.');
    }
    validateFiles(Object.keys(payload.files));
    for (const file of DATA_FILES) {
      if (!payload.files[file] || typeof payload.files[file] !== 'object') {
        throw new Error(`Backup dataset is not a JSON object or array: ${file}`);
      }
    }
    return payload;
  }
  const api = { DATA_FILES, MAX_BYTES, validateFiles, validatePayload };
  root.CanopyPublicBackup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
