'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../scripts/data-adapter/agency-adapter');
const Cards = require('../scripts/agency-map');
const Share = require('../scripts/share-view');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fixture = () => JSON.parse(read('data/agency-map.json'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = key => `agency-project:${key}`;

test('all requested names survive as projects, with separate public repo identities and unknown funding', () => {
  const data = fixture();
  const before = JSON.stringify(data);
  const graph = Model.transform(data);
  assert.equal(JSON.stringify(data), before);
  const expected = [
    'DecentAgency', 'DecentCanopy', 'DecentBusking', 'DecentJukebox', 'BigNuten_Vanilla',
    'TheGreenTeaParty', 'GreenTeaHut_01', 'DecentLending / DLend (ArtFi)', 'JacobsLadder26', 'DecentMaker',
    'Jolly Sim Siddhi', 'Arduino Smarthome', 'cadCAD', 'TheUmbrellaAcademy',
    'AJollyDecentCodeCamp', 'JollySandbox', 'DecentSubscriptions', 'DecentPilgrimages',
    'DecentHead', 'DecentCanvas', 'DecentFooter', 'DecentMarket', 'DecentEscrow',
    'DecentInvoice', 'DecentAirdrop', 'DecentCalendar', 'Decent_NDA', 'Decent_UCANN_Play',
    'DuoDuel', 'DLang', 'BabelBet', 'BabelBet_OG_Prototype', 'TheJokerWillPlay', 'Bean', 'Decent Voyager',
    'DecentSettlementsRouter', 'Agency Planning Office', 'DBuskRadio widget', 'DVert widget'
  ];
  assert.deepEqual(graph.projects.filter(n => n.kind !== 'repository').map(n => n.name).sort(), expected.sort());
  assert.equal(new Set(graph.projects.map(n => n.id)).size, graph.projects.length);
  assert.equal(graph.projects.filter(n => n.kind === 'repository').length,
    new Set(data.projects.filter(p => p.repo).map(p => p.repo.toLowerCase())).size);
  graph.projects.forEach(node => {
    assert.equal(node.raised, null);
    assert.equal(node.goal, null);
    assert.ok(node.agencyDetails.currentState);
    assert.ok(node.agencyDetails.nextAction);
  });
  assert.equal(graph.metrics.availableFunds, null);
  assert.deepEqual(graph.activity, []);
  const known = new Set(graph.projects.map(n => n.id));
  graph.associations.forEach(edge => {
    assert.ok(known.has(edge.source) && known.has(edge.target));
    assert.ok(Model.STATES[edge.relationshipState]);
    assert.ok(edge.note);
    assert.equal(edge.decentClaim, undefined);
  });
});

test('focus, external scope, unresolved identities, and reported payouts remain explicit', () => {
  const graph = Model.transform(fixture());
  assert.deepEqual(graph.projects.filter(n => n.kind === 'project' && n.status === 'now').map(n => n.name).sort(),
    ['Agency Planning Office', 'BigNuten_Vanilla', 'DecentBusking', 'DecentCanopy', 'DecentSettlementsRouter']);
  assert.deepEqual(graph.projects.filter(n => n.kind === 'project' && n.status === 'next').map(n => n.name),
    ['DecentLending / DLend (ArtFi)', 'DecentPilgrimages', 'DLang', 'BabelBet']);
  assert.ok(!graph.associations.some(a => a.type === 'under-umbrella' && a.target === id('cadcad')));
  assert.equal(graph.projects.find(n => n.name === 'Bean').repoUrl, null);
  assert.equal(graph.projects.find(n => n.name === 'BabelBet_OG_Prototype').repoUrl, 'https://github.com/TheJollyLaMa/BabelBet');
  assert.equal(graph.projects.find(n => n.name === 'Decent_UCANN_Play').repoUrl, 'https://github.com/TheJollyLaMa/Decent_UCAN_Play');
  const busking = graph.projects.find(n => n.id === id('decent-busking'));
  assert.match(busking.agencyDetails.currentState, /steward reports/);
  assert.match(busking.agencyDetails.currentState, /not an independent chain audit/);
  const reuse = graph.associations.find(a => a.type === 'could-reuse' && a.source === id('decent-busking') && a.target === id('big-nuten'));
  assert.equal(reuse.relationshipState, 'proposed');
  assert.ok(reuse.evidence.some(row => row.url.endsWith('/issues/337')));
  const lineage = graph.associations.find(a => a.source === id('decent-jukebox') && a.target === busking.id);
  assert.equal(lineage.relationshipState, 'reported');
});
test('Pilgrimages V1 and BabelBet preparation retain separate gates and proposed Head reuse', () => {
  const data = fixture();
  const graph = Model.transform(data);
  const pilgrimage = graph.projects.find(n => n.id === id('pilgrimages'));
  const babelbet = graph.projects.find(n => n.id === id('babel-bet'));
  assert.match(pilgrimage.agencyDetails.nextAction, /organizer approval controls rewards/);
  assert.match(pilgrimage.agencyDetails.nextAction, /deployment, payroll and assistant activation gates/);
  assert.match(babelbet.agencyDetails.nextAction, /official and unofficial Duolingo/);
  assert.match(babelbet.agencyDetails.nextAction, /separately approved build/);
  const crossovers = graph.associations.filter(edge => edge.type === 'capability-match' &&
    edge.source === id('head') && [pilgrimage.id, babelbet.id].includes(edge.target));
  assert.equal(crossovers.length, 2);
  assert.ok(crossovers.every(edge => edge.relationshipState === 'proposed'));
  assert.ok(data.projects.find(p => p.id === 'pilgrimages').needs.every(need => need.state === 'issue-reported'));
});

test('Calendar support has its own verified release and listing without implying booking settlement', () => {
  const graph = Model.transform(fixture());
  const calendar = graph.projects.find(node => node.id === id('calendar'));
  assert.match(calendar.agencyDetails.currentState, /token 77/);
  assert.match(calendar.agencyDetails.currentState, /listing 7 at 10 USDC/);
  assert.match(calendar.agencyDetails.currentState, /does not verify booking settlement/);
  const evidence = calendar.agencyDetails.updates.flatMap(update => update.evidence);
  assert.ok(evidence.some(row => row.url === 'https://github.com/TheJollyLaMa/DecentCalendar/releases/download/v0.1.0/supporter-minted.json'));
  assert.ok(evidence.some(row => new URL(row.url).searchParams.get('listingId') === '7'));
});

test('four approved ENS websites have bounded public deployment evidence and retain Canopy identity', () => {
  const deployments = JSON.parse(read('data/ens-project-deployments.json'));
  assert.equal(deployments.chainId, 1);
  assert.equal(deployments.owner, '0xcAeEd8422fB5682C298B7F0971906d446fFd4e7a');
  assert.equal(deployments.gasBudgetWei, '3000000000000000');
  const rows = deployments.deployments;
  assert.deepEqual(rows.map(row => row.name), [
    'decentcalendar.decentagency.eth', 'decentpilgrimages.decentagency.eth',
    'decentcanopy.decentagency.eth', 'planningoffice.decentagency.eth',
  ]);
  let spent = 0n;
  for (const row of rows) {
    assert.equal(row.owner, deployments.owner);
    assert.match(row.sourceCommit, /^[a-f0-9]{40}$/);
    assert.match(row.siteCid, /^b[a-z2-7]{20,}$/);
    assert.match(row.records.avatar, /^ipfs:\/\/b[a-z2-7]+\/avatar\.png$/);
    assert.match(row.records['com.twitter.header'], /^ipfs:\/\/b[a-z2-7]+\/banner\.png$/);
    assert.match(row.records.banner, /^ipfs:\/\/Qm[1-9A-HJ-NP-Za-km-z]{44}\/banner\.png$/);
    assert.equal(row.records['com.github'], row.repo);
    assert.equal(row.records.url, `https://${row.name}.limo`);
    assert.equal(row.gatewayProofs.length, 3);
    row.gatewayProofs.forEach(proof => assert.match(proof.sha256, /^[a-f0-9]{64}$/));
    assert.deepEqual(row.transactions.map(tx => tx.action), ['create-subname', 'set-site-and-art']);
    for (const tx of row.transactions) {
      assert.match(tx.hash, /^0x[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(tx.blockNumber) && tx.blockNumber > 0);
      spent += BigInt(tx.gasPaidWei);
    }
  }
  assert.equal(deployments.additionalTransactions.length, 1);
  const supplemental = deployments.additionalTransactions[0];
  assert.equal(supplemental.action, 'set-compatible-banner-records');
  assert.deepEqual(supplemental.names, rows.map(row => row.name));
  assert.match(supplemental.hash, /^0x[a-f0-9]{64}$/);
  spent += BigInt(supplemental.gasPaidWei);
  assert.equal(spent, BigInt(deployments.totalGasPaidWei));
  assert.ok(spent < BigInt(deployments.gasBudgetWei));
  const projects = fixture().projects;
  assert.equal(projects.find(project => project.id === 'calendar').ens, rows[0].name);
  assert.equal(projects.find(project => project.id === 'pilgrimages').ens, rows[1].name);
  assert.equal(projects.find(project => project.name === 'Agency Planning Office').ens, rows[3].name);
  assert.equal(projects.find(project => project.id === 'decent-canopy').ens, 'decentcanopy.eth');
  assert.match(deployments.caveats.join(' '), /not continuous synchronization/);
});

test('invalid versions, identifiers, dates, evidence, and unsupported relationship claims fail explicitly', () => {
  const mutations = [
    d => { d.version = 99; },
    d => { d.reviewedAt = '2026-02-30'; },
    d => { d.projects[1].id = d.projects[0].id; },
    d => { d.projects[0].kind = 'fund'; },
    d => { d.projects[0].focus = 'finished'; },
    d => { d.projects[0].repo = 'https://github.com/owner/repo'; },
    d => { d.projects[0].repo = 'owner/..'; },
    d => { d.projects[0].tags = 'ipfs'; },
    d => { d.projects[0].currentState = {}; },
    d => { d.relationships[0].target = 'missing'; },
    d => { d.relationships[0].state = 'ledger'; },
    d => { d.relationships[0].state = 'observed'; d.relationships[0].evidence = []; },
    d => { d.relationships[0].note = ''; },
    d => { d.projects[1].evidence[0].url = 'javascript:alert(1)'; },
    d => { d.projects[1].evidence[0].url = 'https://user:password@example.org'; }
  ];
  mutations.forEach(mutate => {
    const data = fixture();
    mutate(data);
    assert.throws(() => Model.transform(data));
  });
});

test('repository nodes deduplicate case-insensitively and keep every project association', () => {
  const data = fixture();
  data.projects.push({ id: 'another-project', name: 'Another project', repo: 'thejollylama/DecentBusking' });
  const graph = Model.transform(data);
  const repoId = 'github-repo:thejollylama/decentbusking';
  assert.equal(graph.projects.filter(n => n.id === repoId).length, 1);
  assert.equal(graph.associations.filter(a => a.type === 'repository-link' && a.target === repoId).length, 2);
});

test('cards explain direction, uncertainty, reuse context, existing issues, and escape curated text', () => {
  const data = fixture();
  data.projects.find(p => p.id === 'big-nuten').purpose = '<img src=x onerror=alert(1)>';
  const graph = Model.transform(data);
  const entities = Object.fromEntries(graph.projects.map(n => [n.id, n]));
  const html = Cards.render(entities[id('big-nuten')], entities, graph.associations, escape, Model);
  assert.match(html, /Incoming from DecentBusking/);
  assert.match(html, /Proposed only/);
  assert.match(html, /issues\/337/);
  assert.match(html, /issues\/339/);
  assert.match(html, /DecentEscrow listing 6, 10 USDC/);
  assert.match(html, /NOT DELIVERED/);
  assert.match(html, /payout status: unavailable/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|Frozen historical|Artizen record|\$0|0% funded|ledger-verified/i);
});

test('capabilities require evidence and candidate matches resolve the exact offer and need', () => {
  const data = fixture();
  const graph = Model.transform(data);
  const matches = graph.associations.filter(edge => edge.type === 'capability-match');
  assert.ok(matches.length >= 3);
  matches.forEach(edge => {
    assert.equal(edge.relationshipState, 'proposed');
    assert.ok(graph.projects.find(p => p.id === edge.source).agencyDetails.offers.some(o => o.id === edge.offer));
    assert.ok(graph.projects.find(p => p.id === edge.target).agencyDetails.needs.some(n => n.id === edge.need));
    assert.ok(edge.nextTest);
  });
  for (const mutate of [
    (p, edge) => { p.offers[0].evidence = []; },
    (p, edge) => { p.offers[0].state = 'production-ready'; },
    p => { p.reviewCaveats = 'not an array'; },
    p => { p.offers.push(p.offers[0]); },
    (p, edge) => { edge.offer = 'missing'; },
    (p, edge) => { edge.need = 'missing'; },
    (p, edge) => { edge.nextTest = ''; },
    (p, edge) => { edge.state = 'observed'; },
    (p, edge) => { edge.evidence = []; },
    (p, edge, data) => { data.relationships.push(edge); }
  ]) {
    const invalid = fixture();
    mutate(invalid.projects.find(p => p.id === 'decent-canopy'),
      invalid.relationships.find(edge => edge.type === 'capability-match'), invalid);
    assert.throws(() => Model.transform(invalid));
  }
});

test('public capability inventory keeps private/local review payloads outside publication', () => {
  const data = fixture();
  assert.equal(data.projects.filter(p => p.reviewNote).length, 25);
  assert.equal(data.projects.reduce((n, p) => n + (p.offers?.length || 0), 0), 51);
  const nutrition = data.projects.find(project => project.id === 'big-nuten').offers.find(offer => offer.id === 'reviewed-nutrition-defaults');
  assert.equal(nutrition.state, 'code-observed');
  assert.match(nutrition.detail, /separate deployed synthetic acceptance/i);
  assert.match(nutrition.detail, /cooked chickpeas and an exact yogurt product/);
  assert.match(nutrition.detail, /not whole-food\/product coverage, independent nutrient or current-label certification/);
  assert.match(nutrition.detail, /unchanged shared cap/);
  assert.ok(nutrition.evidence.some(source => source.url.endsWith('/pull/397')));
  assert.ok(nutrition.evidence.some(source => source.url.endsWith('/pull/399')));
  assert.ok(nutrition.evidence.some(source => source.url.endsWith('/issues/398')));
  assert.match(nutrition.detail, /existing editable nutrition card directly/);
  assert.match(nutrition.detail, /no separate review window/);
  assert.match(nutrition.detail, /durable public library/);
  assert.match(nutrition.detail, /without a wallet or provider call/);
  assert.match(nutrition.detail, /Personal edits, defaults, meals and health records are not uploaded/);
  assert.match(nutrition.detail, /persistence after redeployment/);
  assert.ok(nutrition.evidence.some(source => source.url.endsWith('/pull/401')));
  assert.ok(nutrition.evidence.some(source => source.url.endsWith('/issues/400')));
  assert.match(nutrition.detail, /source-linked household portions/);
  assert.match(nutrition.detail, /one serving explicitly means the card base/);
  assert.match(nutrition.detail, /US nutrition-label units/);
  assert.match(nutrition.detail, /personal overrides are never published/);
  assert.ok(nutrition.evidence.some(source => source.url.endsWith('/pull/404')));
  assert.ok(nutrition.evidence.some(source => source.url.endsWith('/issues/403')));
  assert.match(nutrition.detail, /labeled Genie estimate unless/);
  assert.match(nutrition.detail, /typed figures are never overwritten/);
  assert.match(nutrition.detail, /Manual review\/defaults remain available without Genie access/);
  const consent = data.projects.find(project => project.id === 'big-nuten').offers.find(offer => offer.id === 'hosted-ai-consent');
  assert.equal(consent.state, 'code-observed');
  assert.match(consent.detail, /gates Genie assistants, not ordinary health tracking/);
  assert.match(consent.detail, /distinct hosted-consent scopes/);
  assert.match(consent.detail, /cross-browser sync are not established/);
  assert.ok(consent.evidence.some(source => source.url.endsWith('/pull/395')));
  assert.ok(consent.evidence.some(source => source.url.endsWith('/pull/399')));
  assert.match(consent.detail, /signed access as the default/);
  assert.match(consent.detail, /anyone can claim an invited address/);
  assert.match(consent.detail, /not wallet ownership or private-access verification/);
  assert.match(consent.detail, /explicit lookup click/);
  assert.equal(data.projects.reduce((n, p) => n + (p.needs?.length || 0), 0), 39);
  assert.equal(data.relationships.filter(edge => edge.type === 'capability-match').length, 14);
  assert.doesNotMatch(JSON.stringify(data), /file:\/\/|\/Users\/|privateProjects|localEvidence/);
  for (const project of data.projects) {
    for (const item of [...(project.offers || []), ...(project.needs || [])]) {
      assert.ok(item.evidence.length);
      item.evidence.forEach(source => assert.ok(source.url.startsWith('https://github.com/')));
    }
  }
});

test('older agency inventories remain readable without capability fields', () => {
  const data = fixture();
  data.relationships = data.relationships.filter(edge => edge.type !== 'capability-match');
  data.projects.forEach(project => {
    delete project.offers;
    delete project.needs;
    delete project.reviewNote;
    delete project.reviewCaveats;
  });
  const graph = Model.transform(data);
  assert.ok(graph.projects.length);
  assert.equal(Model.lensIds(graph.projects, graph.associations, 'crossovers').size, 0);
  const entities = Object.fromEntries(graph.projects.map(node => [node.id, node]));
  assert.match(Cards.overview(entities, graph.associations, escape, Model), /No evidence-linked candidates/);
});

test('capability cards and overview escape offer, caution, and candidate text', () => {
  const data = fixture();
  const markup = '<img src=x onerror=alert(1)>';
  data.projects.find(p => p.id === 'decent-canopy').offers[0].label = markup;
  data.projects.find(p => p.id === 'artfi').reviewCaveats.push(markup);
  data.relationships.find(edge => edge.type === 'capability-match').nextTest = markup;
  const graph = Model.transform(data);
  const entities = Object.fromEntries(graph.projects.map(node => [node.id, node]));
  const card = Cards.render(entities[id('artfi')], entities, graph.associations, escape, Model);
  assert.match(card, /&lt;img/);
  assert.doesNotMatch(card, /<img/);
  const overview = Cards.overview(entities, graph.associations, escape, Model);
  assert.match(overview, /&lt;img/);
  assert.doesNotMatch(overview, /<img/);
});

test('capability lenses exclude repo duplicates and overview states coverage without impact scoring', () => {
  const graph = Model.transform(fixture());
  const offers = Model.lensIds(graph.projects, graph.associations, 'offers');
  assert.ok(offers.has(id('big-nuten')));
  assert.ok(![...offers].some(key => key.startsWith('github-repo:')));
  const crossovers = Model.lensIds(graph.projects, graph.associations, 'crossovers');
  graph.associations.filter(edge => edge.type === 'capability-match').forEach(edge => {
    assert.ok(crossovers.has(edge.source) && crossovers.has(edge.target));
  });
  assert.equal(Model.lensIds(graph.projects, graph.associations, 'all').size, graph.projects.length);
  assert.throws(() => Model.lensIds(graph.projects, graph.associations, 'invented'));
  const entities = Object.fromEntries(graph.projects.map(n => [n.id, n]));
  const html = Cards.overview(entities, graph.associations, escape, Model);
  assert.match(html, /not impact scores/);
  assert.match(html, /Next validation/);
  assert.match(html, /Private\/local findings are excluded/);
  const card = Cards.render(entities[id('big-nuten')], entities, graph.associations, escape, Model);
  assert.match(card, /Code \/ patterns to offer/);
  assert.match(card, /Expressed needs/);
  assert.match(card, /Offer:/);
  assert.match(card, /Need:/);
});

test('reuse desk covers each focused need and every exact candidate once in donor groups', () => {
  const graph = Model.transform(fixture());
  const before = JSON.stringify(graph);
  const entities = Object.fromEntries(graph.projects.map(node => [node.id, node]));
  const html = Cards.overview(entities, graph.associations, escape, Model);
  const matches = graph.associations.filter(edge => edge.type === 'capability-match');
  const groups = new Set(matches.map(edge => JSON.stringify([edge.source, edge.offer])));
  assert.equal((html.match(/class="details-group agency-focus-project"/g) || []).length,
    graph.projects.filter(node => node.kind !== 'repository' && ['now', 'next'].includes(node.agencyDetails.focus)).length);
  assert.equal((html.match(/class="details-group agency-reuse-group"/g) || []).length, groups.size);
  assert.equal((html.match(/<strong>Next validation:<\/strong>/g) || []).length, matches.length);
  assert.match(html, /Before writing more code/);
  assert.match(html, /Check current source, recent issues and unfinished branches/);
  assert.match(html, /not an automatic scan/);
  assert.match(html, /href="https:\/\/github.com\/TheJollyLaMa\/DecentCanopy\/blob\/main\/wiki\/Reuse-First.md"/);
  assert.match(html, /No evidence-linked donor recorded/);
  assert.match(html, /not proof none exists/);
  assert.match(html, /not computed impact rankings/);
  assert.match(html, /Donor evidence/);
  assert.match(html, /Implementation inspected; not integration-tested/);
  assert.match(html, /2 candidate projects/);
  for (const edge of matches) {
    assert.ok(html.includes(escape(edge.nextTest)));
    edge.evidence.forEach(row => assert.ok(html.includes(`href="${escape(row.url)}"`)));
  }
  assert.equal(JSON.stringify(graph), before);
});

function visitorPortfolio(projects, relationships = []) {
  return {
    format: 'decentcanopy-agency-map', version: 1, reviewedAt: '2026-10-20',
    sourceLabel: 'Synthetic visitor test; not published', mission: 'Test reuse without real identities.',
    projects: [{ id: 'visitor-umbrella', name: 'Visitor umbrella', kind: 'initiative' }, ...projects],
    relationships
  };
}

function visitorCapability(id, label, state = 'code-observed') {
  return {
    id, label, state, detail: `Synthetic ${label} detail`,
    evidence: [{ label: `Source for ${label}`, url: `https://github.com/example/fixture/issues/1#${id}` }]
  };
}

function visitorMatch(source, target, offer, need) {
  return {
    source, target, offer, need, type: 'capability-match', state: 'proposed',
    note: `Synthetic comparison of ${source} with ${target}`,
    nextTest: `Test ${source}/${offer} against ${target}/${need}`,
    evidence: [{ label: 'Comparison source', url: `https://github.com/example/fixture/issues/2#${target}` }]
  };
}

test('mock visitor one compares shared donors without merging equal labels or double-counting consumers', () => {
  const markup = '<img src=x onerror=alert(1)>';
  const data = visitorPortfolio([
    { id: 'library-a', name: 'Library A', repo: 'example/shared', offers: [
      visitorCapability('save', 'Snapshot block'), visitorCapability('other-save', 'Snapshot block', 'documented')
    ] },
    { id: 'library-b', name: 'Library B', repo: 'example/shared', offers: [visitorCapability('save', 'Snapshot block')] },
    { id: 'visitor-app', name: 'Visitor app', focus: 'now', needs: [
      visitorCapability('recover', 'Recovery', 'issue-reported'),
      visitorCapability('restart', 'Restart', 'documented')
    ] },
    { id: 'visitor-tool', name: 'Visitor tool', focus: 'next', needs: [visitorCapability('retain', markup, 'documented')] }
  ], [
    visitorMatch('library-a', 'visitor-app', 'save', 'recover'),
    visitorMatch('library-a', 'visitor-app', 'save', 'restart'),
    visitorMatch('library-a', 'visitor-tool', 'save', 'retain'),
    visitorMatch('library-a', 'visitor-app', 'other-save', 'recover'),
    visitorMatch('library-b', 'visitor-tool', 'save', 'retain')
  ]);
  const graph = Model.transform(data);
  const entities = Object.fromEntries(graph.projects.map(node => [node.id, node]));
  const html = Cards.overview(entities, graph.associations, escape, Model);
  assert.equal((html.match(/class="details-group agency-reuse-group"/g) || []).length, 3);
  assert.match(html, /Library A: Snapshot block \(2 candidate projects\)/);
  assert.match(html, /Library A: Snapshot block \(1 candidate project\)/);
  assert.match(html, /Library B: Snapshot block \(1 candidate project\)/);
  assert.equal((html.match(/<strong>Next validation:<\/strong>/g) || []).length, 5);
  assert.match(html, /Need expressed in an issue; resolution not verified/);
  assert.match(html, /Documented design or example; readiness unverified/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html.replace('https://github.com/TheJollyLaMa/DecentCanopy/blob/main/wiki/Reuse-First.md', ''),
    /<img|DecentBusking|BigNuten|DecentCanopy/);
  assert.equal(graph.projects.filter(node => node.kind === 'repository').length, 1);
});

test('mock visitor two gets honest empty states without matches, capabilities or selected focus', () => {
  const data = visitorPortfolio([
    { id: 'visitor-empty', name: 'Empty visitor project', focus: 'now' },
    { id: 'visitor-need', name: 'Need visitor project', focus: 'next',
      needs: [visitorCapability('repair', 'Unmatched repair', 'issue-reported')] }
  ]);
  let graph = Model.transform(data);
  let entities = Object.fromEntries(graph.projects.map(node => [node.id, node]));
  let html = Cards.overview(entities, graph.associations, escape, Model);
  assert.match(html, /No expressed needs established/);
  assert.match(html, /No evidence-linked donor recorded/);
  assert.match(html, /No evidence-linked candidates recorded yet/);
  assert.ok(html.indexOf('Now: Empty visitor') < html.indexOf('Next: Need visitor'));
  data.projects.forEach(project => { delete project.focus; });
  graph = Model.transform(data);
  entities = Object.fromEntries(graph.projects.map(node => [node.id, node]));
  html = Cards.overview(entities, graph.associations, escape, Model);
  assert.match(html, /No Now \/ Next focus selected/);
  assert.doesNotMatch(html, /class="details-group agency-focus-project"|class="details-group agency-reuse-group"/);
});

test('agency adapter fetches once across shared selectors and does not replace unavailable data', async () => {
  let requests = 0;
  const sandbox = {
    window: {}, console,
    fetch: async url => {
      requests++;
      assert.equal(url, '/site/data/agency-map.json');
      return { ok: true, json: async () => fixture() };
    }, URL
  };
  vm.runInNewContext(read('scripts/data-adapter/agency-adapter.js'), sandbox);
  const adapter = sandbox.GTPAgencyDataAdapter.create({ basePath: '/site/' });
  const [projects, edges, metrics] = await Promise.all([adapter.getProjects(), adapter.getAssociations(), adapter.getMetrics()]);
  assert.equal(requests, 1);
  assert.ok(projects.length && edges.length);
  assert.equal(metrics.availableFunds, null);
  sandbox.fetch = async () => ({ ok: false, status: 503 });
  const failed = sandbox.GTPAgencyDataAdapter.create();
  await assert.rejects(failed.getProjects(), /HTTP 503/);
  sandbox.fetch = async () => ({ ok: true, json: async () => fixture() });
  assert.ok((await failed.getProjects()).length);
});

test('shared data layer preserves map metadata without overlaying creators or frozen archive', async () => {
  const sandbox = {
    window: {
      location: { search: '?canopy=agency' }, GTPAgencyDataAdapter: Model,
      CanopyParticipation: { overlay() { throw new Error('Unexpected participation overlay'); } },
      DecentCreators: { overlay() { throw new Error('Unexpected signed-record overlay'); } }
    },
    URL, URLSearchParams, console,
    GTPModeRouter: { getModeInfo: () => ({ mode: 'prototype' }) },
    fetch: async () => ({ ok: true, json: async () => fixture() })
  };
  vm.runInNewContext(read('scripts/data-adapter/agency-adapter.js'), sandbox);
  sandbox.window.GTPAgencyDataAdapter = sandbox.GTPAgencyDataAdapter;
  vm.runInNewContext(read('scripts/data-adapter/interface.js'), sandbox);
  vm.runInNewContext(read('scripts/data-layer.js'), sandbox);
  await sandbox.GTPData.load();
  assert.equal(sandbox.GTPData.getModeInfo().mode, 'agency');
  assert.ok(sandbox.GTPData.getProjectById(id('big-nuten')).agencyDetails);
  assert.equal(sandbox.GTPData.getAdapterMetrics().availableFunds, null);
  assert.ok(sandbox.GTPData.getAssociations().some(a => a.relationshipState === 'proposed' && a.evidence.length));
  const match = sandbox.GTPData.getAssociations().find(a => a.type === 'capability-match' && a.offer === 'radio-media-proxy');
  assert.equal(match.offer, 'radio-media-proxy');
  assert.equal(match.need, 'radio-media-route');
  assert.match(match.nextTest, /decoder/);
  sandbox.GTPData.setFilter('status', 'now');
  assert.equal(sandbox.GTPData.filterProjects().filter(n => n.kind === 'project').length, 5);
});

test('map ships through both publication paths and view links preserve agency context', () => {
  const files = require('../scripts/siteFiles').listSiteFiles();
  for (const file of ['data/agency-map.json', 'scripts/agency-map.js', 'scripts/data-adapter/agency-adapter.js']) {
    assert.ok(files.includes(file));
  }
  assert.ok(require('../scripts/pinDataBackup').DATA_FILES.includes('data/agency-map.json'));
  assert.match(read('.github/workflows/pin-ipfs-backup.yml'), /data\/agency-map\.json/);
  assert.match(read('.github/workflows/validate-payroll-queue.yml'), /node --test .*test\/agency-map\.test\.js/);
  assert.match(read('.github/workflows/validate-payroll-queue.yml'), /node --test .*test\/share-view\.test\.js/);
  const html = read('index.html');
  assert.ok(html.indexOf('scripts/data-adapter/agency-adapter.js') < html.indexOf('scripts/data-layer.js'));
  assert.ok(html.includes('id="agency-index"'));
  const url = Share.create('https://example.org/ipfs/bafyexample/?canopy=agency', { entity: id('big-nuten'), status: 'next' });
  assert.equal(new URL(url).searchParams.get('canopy'), 'agency');
  assert.equal(Share.read(url).entity, id('big-nuten'));
});
