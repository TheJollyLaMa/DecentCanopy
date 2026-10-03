'use strict';

/*
 * Read-only Base checks for "is this a real Artizen participant wallet?".
 * ART is the JBERC20 token of Artizen's Juicebox project, so it is only minted from the zero
 * address when someone pays Artizen (or receives Artizen's reserved distribution). A wallet with
 * ART minted to it has funded Artizen on-chain. No keys, logins, or Artizen credentials are used.
 */

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_TOPIC = `0x${'0'.repeat(64)}`;
const BALANCE_OF = '0x70a08231';

function topicFor(address) {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`;
}

function formatUnits(value, decimals = 18) {
  const digits = value.toString().padStart(decimals + 1, '0');
  const fraction = digits.slice(-decimals).replace(/0+$/, '').slice(0, 4);
  return fraction ? `${digits.slice(0, -decimals)}.${fraction}` : digits.slice(0, -decimals);
}

function parseUnits(value, decimals = 18) {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(`${whole}${fraction.padEnd(decimals, '0').slice(0, decimals)}`);
}

async function getJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.json();
}

async function rpc(fetchImpl, rpcUrl, method, params) {
  const body = await getJson(fetchImpl, rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (body.error) throw new Error(`RPC ${method} failed: ${body.error.message || 'error'}`);
  return body.result;
}

async function artMints(fetchImpl, config, wallet) {
  const url = new URL(config.blockscoutApi);
  Object.entries({
    module: 'logs',
    action: 'getLogs',
    address: config.artToken,
    fromBlock: '0',
    toBlock: 'latest',
    topic0: TRANSFER_TOPIC,
    topic1: ZERO_TOPIC,
    topic2: topicFor(wallet),
    topic0_1_opr: 'and',
    topic1_2_opr: 'and',
    topic0_2_opr: 'and',
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const body = await getJson(fetchImpl, url.href);
  if (!Array.isArray(body.result)) {
    if (/no logs found/i.test(String(body.message))) return [];
    throw new Error(`Blockscout log query failed: ${body.message || 'unexpected response'}`);
  }
  return body.result.map(log => ({
    txHash: log.transactionHash,
    amount: BigInt(log.data),
    timestamp: log.timeStamp ? new Date(Number.parseInt(log.timeStamp, 16) * 1000).toISOString() : null,
  }));
}

async function verifyArtizenWallet(wallet, config, { fetchImpl = fetch, now = new Date() } = {}) {
  const [mints, code, balanceHex] = await Promise.all([
    artMints(fetchImpl, config, wallet),
    rpc(fetchImpl, config.rpcUrl, 'eth_getCode', [wallet, 'latest']),
    rpc(fetchImpl, config.rpcUrl, 'eth_call', [{ to: config.artToken, data: `${BALANCE_OF}${topicFor(wallet).slice(2)}` }, 'latest']),
  ]);
  const minted = mints.reduce((sum, mint) => sum + mint.amount, 0n);
  const minimum = parseUnits(config.minArtMinted);
  const verified = minted >= minimum;
  return {
    verified,
    method: 'base-art-mint',
    chainId: config.chainId,
    juiceboxProjectId: config.juiceboxProjectId,
    artMinted: formatUnits(minted),
    artMints: mints.length,
    firstMintTx: mints[0]?.txHash || null,
    artBalance: formatUnits(BigInt(balanceHex && balanceHex !== '0x' ? balanceHex : '0x0')),
    smartAccount: Boolean(code && code !== '0x'),
    checkedAt: now.toISOString(),
    reason: verified
      ? `${formatUnits(minted)} ART minted to this wallet by Artizen's Juicebox project #${config.juiceboxProjectId}.`
      : mints.length
        ? `Only ${formatUnits(minted)} ART minted to this wallet; the automatic threshold is ${config.minArtMinted} ART.`
        : `No ART has been minted to this wallet by Artizen's Juicebox project #${config.juiceboxProjectId}.`,
  };
}

module.exports = { formatUnits, parseUnits, topicFor, verifyArtizenWallet };
