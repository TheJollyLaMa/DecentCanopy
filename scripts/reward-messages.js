/*
 * Signed in-app reward requests. The browser builds a human-readable message, the user signs it
 * with personal_sign (free, no transaction), and the relay and the GitHub workflow both parse and
 * re-verify the same text. Shared by the browser (window.DecentCanopyRewardMessages) and Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DecentCanopyRewardMessages = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HEADER = 'DecentCanopy reward request';
  const FOOTER = 'Signing is free. It does not send a transaction or give DecentCanopy access to your funds.';
  const ACTIONS = {
    'airdrop-claim': 'Join the canopy map and claim the ART airdrop',
    'pinner-request': 'Register as a community IPFS pinner',
    'reward-review': 'Maintainer decision on a reward request',
  };
  const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
  const MAX_MESSAGE_LENGTH = 6000;

  function randomNonce() {
    const bytes = new Uint8Array(12);
    (globalThis.crypto || require('node:crypto').webcrypto).getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function buildRewardMessage({ action, wallet, data, issuedAt = new Date().toISOString(), nonce = randomNonce() }) {
    if (!ACTIONS[action]) throw new Error(`Unknown reward action: ${action}`);
    if (!ADDRESS_RE.test(String(wallet || ''))) throw new Error('A connected wallet address is required to sign.');
    return [
      HEADER,
      '',
      ACTIONS[action],
      '',
      `Action: ${action}`,
      `Wallet: ${wallet}`,
      `Issued at: ${issuedAt}`,
      `Nonce: ${nonce}`,
      `Data: ${JSON.stringify(data || {})}`,
      '',
      FOOTER,
    ].join('\n');
  }

  function parseRewardMessage(message) {
    const text = String(message || '');
    if (!text || text.length > MAX_MESSAGE_LENGTH) throw new Error('Reward message is missing or too long.');
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[0] !== HEADER) throw new Error('Not a DecentCanopy reward request.');
    const field = name => {
      const line = lines.find(row => row.startsWith(`${name}: `));
      return line ? line.slice(name.length + 2) : '';
    };
    const action = field('Action');
    if (!ACTIONS[action]) throw new Error(`Unknown reward action: ${action || '(none)'}`);
    const wallet = field('Wallet');
    if (!ADDRESS_RE.test(wallet)) throw new Error('The reward message has no valid wallet.');
    const issuedAt = field('Issued at');
    if (Number.isNaN(Date.parse(issuedAt))) throw new Error('The reward message has no valid timestamp.');
    const nonce = field('Nonce');
    if (!/^[a-f0-9]{16,64}$/.test(nonce)) throw new Error('The reward message has no valid nonce.');
    let data;
    try {
      data = JSON.parse(field('Data') || '{}');
    } catch (_) {
      throw new Error('The reward message data is not valid JSON.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The reward message data must be an object.');
    if (buildRewardMessage({ action, wallet, data, issuedAt, nonce }) !== text.replace(/\r\n/g, '\n')) {
      throw new Error('The reward message is not in the expected format.');
    }
    return { action, wallet, issuedAt, nonce, data };
  }

  return { ACTIONS, buildRewardMessage, parseRewardMessage };
}));
