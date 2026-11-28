export const CREATOR_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SELLER_LISTINGS_ABI = [
  'function list(address,uint256,uint256,address,uint256) returns(uint256)',
  'function allowedCollection(address) view returns(bool)', 'function allowedPayToken(address) view returns(bool)',
  'function useProductCreator(address) view returns(bool)', 'function feesConfigured() view returns(bool)',
  'function paused() view returns(bool)', 'function creatorSaleFeeBps() view returns(uint16)',
  'function resaleFeeBps() view returns(uint16)', 'function feeRecipient() view returns(address)',
  'function sellerListingIds(address) view returns(uint256[])',
  'function getListing(uint256) view returns(tuple(address seller,address creator,address collection,uint256 tokenId,address payToken,uint256 unitPrice,uint256 quantity,uint16 feeBps,uint16 royaltyBps,bool active))',
  'function quote(uint256,uint256) view returns(uint256 total,uint256 sellerProceeds,address royaltyReceiver,uint256 royaltyAmount,uint256 platformFee)',
  'function purchaseWithToken(uint256,uint256,uint256)', 'function purchaseWithETH(uint256,uint256) payable',
  'event ListingCreated(uint256 indexed listingId,address indexed seller,address indexed collection,uint256 tokenId,address payToken,uint256 unitPrice,uint256 quantity,uint16 feeBps)',
  'event Purchased(uint256 indexed listingId,address indexed buyer,address indexed seller,uint256 quantity,address payToken,uint256 totalPaid)',
];
const NFT_READ_ABI = [
  'function productCreator(uint256) view returns(address)', 'function productProject(uint256) view returns(bytes32)',
  'function hasRole(bytes32,address) view returns(bool)', 'function isCreatorProjectApproved(address,bytes32) view returns(bool)',
];

export async function readCreatorListings(config, wallet, projectKeys, { ethers, provider }) {
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  if (config?.chainId !== 8453 || [config.collectionAddress, config.listingsAddress, wallet].some(address =>
    !ethers.isAddress(address) || same(address, ethers.ZeroAddress))) throw new Error('Verified Base creator collection v0.4 and seller listings must be configured; legacy contracts are not substitutes');
  if (!Array.isArray(projectKeys) || !projectKeys.length || projectKeys.length > 20 ||
      new Set(projectKeys).size !== projectKeys.length || projectKeys.some(key => !/^[a-zA-Z0-9_-]{1,50}$/.test(key))) throw new Error('Choose current signed public project keys');
  if (Number((await provider.getNetwork()).chainId) !== 8453) throw new Error('Read Supporter listings on Base');
  const listings = new ethers.Contract(config.listingsAddress, SELLER_LISTINGS_ABI, provider);
  const nft = new ethers.Contract(config.collectionAddress, NFT_READ_ABI, provider);
  if (!await listings.allowedCollection(config.collectionAddress) || !await listings.useProductCreator(config.collectionAddress) ||
      !await listings.feesConfigured() || await listings.paused() || await listings.creatorSaleFeeBps() !== 1000n ||
      await listings.resaleFeeBps() !== 500n || same(await listings.feeRecipient(), ethers.ZeroAddress)) throw new Error('Creator sale configuration unavailable or changed; refresh after steward review');
  const keys = new Map(projectKeys.map(key => [ethers.id(`decent-project:${wallet.toLowerCase()}:${key}`), key]));
  const ids = await listings.sellerListingIds(wallet);
  if (ids.length > 100) throw new Error('This creator has over 100 recorded listings; bounded project discovery is unavailable, not empty');
  const rows = [];
  for (const id of ids) {
    const listing = await listings.getListing(id);
    if (!listing.active || listing.quantity <= 0n || listing.unitPrice <= 0n ||
        !same(listing.collection, config.collectionAddress) || !same(listing.seller, wallet) || !same(listing.creator, wallet)) continue;
    const projectHash = await nft.productProject(listing.tokenId), key = keys.get(projectHash);
    if (!key || !same(await nft.productCreator(listing.tokenId), wallet)) continue;
    if (!await nft.hasRole(ethers.id('CREATOR_ROLE'), wallet) || !await nft.isCreatorProjectApproved(wallet, projectHash)) throw new Error('Steward approval for this creator/project is currently unavailable; sale display requires re-review');
    if (!await listings.allowedPayToken(listing.payToken)) throw new Error('A listed payment asset is no longer enabled');
    const asset = same(listing.payToken, CREATOR_USDC) ? { symbol: 'USDC', decimals: 6 } :
      same(listing.payToken, ethers.ZeroAddress) ? { symbol: 'ETH', decimals: 18 } : null;
    if (!asset) throw new Error('A creator listing uses an unsupported payment asset; do not treat it as USDC');
    await listings.quote(id, 1);
    rows.push({ listingId: id.toString(), tokenId: listing.tokenId.toString(), projectKey: key,
      quantity: listing.quantity.toString(), priceUnits: listing.unitPrice.toString(),
      payToken: listing.payToken, ...asset });
  }
  return rows;
}
