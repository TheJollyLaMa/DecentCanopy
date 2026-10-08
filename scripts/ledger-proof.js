(function (root) {
  'use strict';
  const CHAINS = {
    base: { chainId: 8453, name: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
    ethereum: { chainId: 1, name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io' },
    optimism: { chainId: 10, name: 'Optimism', rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io' },
  };
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const MAX_CHECKS = 25;
  const topicAddress = topic => `0x${String(topic).slice(-40).toLowerCase()}`;
  const toAmount = value => { try { return BigInt(value).toString(); } catch { return null; } };

  // Native value and ERC-20 Transfer logs both count, so multisig/contract treasuries are detected by log origin.
  async function checkTransfer(provider, { txHash, treasury, recipient }) {
    const [tx, receipt] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash)]);
    if (!tx || !receipt) return { verified: false, reason: 'Transaction not found on this chain.' };
    if (Number(receipt.status) !== 1) return { verified: false, reason: 'Transaction reverted on-chain.' };
    const transfers = [];
    if (String(tx.from).toLowerCase() === treasury && String(tx.to || '').toLowerCase() === recipient && BigInt(tx.value || 0) > 0n) {
      transfers.push({ asset: 'native', amount: BigInt(tx.value).toString() });
    }
    (receipt.logs || []).forEach(log => {
      const topics = log.topics || [];
      if (topics.length !== 3 || String(topics[0]).toLowerCase() !== TRANSFER_TOPIC) return;
      if (topicAddress(topics[1]) !== treasury || topicAddress(topics[2]) !== recipient) return;
      const amount = toAmount(log.data);
      if (amount && amount !== '0') transfers.push({ asset: String(log.address).toLowerCase(), amount });
    });
    if (!transfers.length) return { verified: false, reason: 'No transfer from the fund treasury to the recipient wallet appears in this transaction.' };
    return { verified: true, blockNumber: Number(receipt.blockNumber), transfers };
  }

  function withTimeout(promise, ms) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); })])
      .finally(() => clearTimeout(timer));
  }

  async function verifyGraph(graph, { providerFor, cache = null, timeoutMs = 10000, maxChecks = MAX_CHECKS }) {
    const jobs = [];
    graph.associations.forEach(edge => (edge.ledgerCandidates || []).forEach(candidate => jobs.push([edge, candidate])));
    await Promise.all(jobs.map(async ([edge, candidate], index) => {
      const explorer = `${CHAINS[candidate.chain].explorer}/tx/${candidate.txHash}`;
      if (index >= maxChecks) { candidate.proof = { verified: false, unchecked: true, reason: 'Not checked: too many transactions to verify at once.', explorer }; return; }
      const id = `${candidate.chain}:${candidate.txHash}:${candidate.treasury}:${candidate.recipient}`;
      let result = cache && cache.get(id);
      if (!result) {
        try {
          result = await withTimeout(checkTransfer(providerFor(candidate.chain), candidate), timeoutMs);
          if (result.verified && cache) cache.set(id, result);
        } catch {
          result = { verified: false, unchecked: true, reason: 'The public ledger could not be reached; try again later.' };
        }
      }
      candidate.proof = { ...result, explorer };
      if (result.verified && candidate.treasurySigned && candidate.recipientSigned) {
        edge.decentClaim = 'ledger';
        edge.note = 'Ledger-verified: an on-chain transfer moved funds from the fund steward’s own signing wallet to the creator’s signing wallet.';
      }
    }));
    return graph;
  }

  function browserCache(storageKey = 'decentcanopy-ledger-proofs-v1') {
    const read = () => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } };
    return {
      get: id => read()[id] || null,
      set: (id, value) => { const all = read(); all[id] = value; try { localStorage.setItem(storageKey, JSON.stringify(all)); } catch { /* storage full or disabled */ } },
    };
  }

  const api = { CHAINS, TRANSFER_TOPIC, checkTransfer, verifyGraph, browserCache };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DecentLedgerProof = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
