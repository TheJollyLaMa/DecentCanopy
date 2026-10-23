'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(require.resolve(`../scripts/${file}`), 'utf8');

test('ambient frames yield to timers; interactions preempt the wait without duplicating frames', () => {
  const frames = new Map(), timers = new Map(), listeners = {};
  let nextId = 0, rendered = 0, moving = false, ambient = true, duringRender = () => {};
  const document = { hidden: false, addEventListener: (event, fn) => { listeners[event] = fn; } };
  const source = read('spiral.js');
  const sandbox = {
    document, window: {
      clearTimeout: id => timers.delete(id),
      setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
      matchMedia: () => ({ matches: false }),
      CanopyRepositoryActivityUI: { animate: () => ambient, nodeHeat: () => 'high', pulses: () => [] }
    },
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    stepCameraAnimation: () => moving, stepConnectionLayout: () => false,
    nodes: [{}], render: () => { rendered++; duringRender(); }
  };
  vm.createContext(sandbox);
  vm.runInContext(`let needRender = false, rafId = null, activityReplay = null;\n${source.slice(source.indexOf('  function scheduleRender()'), source.indexOf('  function stepConnectionLayout('))}`, sandbox);
  const schedule = () => vm.runInContext('scheduleRender()', sandbox);
  const tick = () => {
    const [id, fn] = frames.entries().next().value;
    frames.delete(id); fn(100);
  };
  schedule(); schedule();
  assert.equal(frames.size, 1);
  tick();
  assert.equal(rendered, 1);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 1);
  assert.ok([...timers.values()][0].delay >= 80);
  schedule();
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 1);
  moving = true;
  duringRender = schedule;
  tick();
  assert.equal(frames.size, 1, 'a render-time invalidation must not create a second animation chain');
  assert.equal(timers.size, 0);
  document.hidden = true; listeners.visibilitychange();
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
  schedule();
  assert.equal(frames.size, 0, 'hidden tabs must not schedule frames');
  document.hidden = false; listeners.visibilitychange();
  assert.equal(frames.size, 1);
  moving = false; ambient = false;
  duringRender = () => { duringRender = () => {}; schedule(); };
  tick();
  assert.equal(frames.size, 1);
  const count = rendered;
  tick();
  assert.equal(rendered, count + 1, 'a synchronous artwork completion must not lose its invalidation');
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0, 'motion disabled leaves the canvas idle after the requested render');
});

test('heat is derived once per node per second, shared by edges and refreshed on snapshot change', async () => {
  let now = 10000, calls = 0, references = 0;
  const node = {}, other = {}, snapshot = { repositories: [] };
  const sandbox = {
    window: null, document: { hidden: false, getElementById: () => ({ checked: true, replaceChildren() {} }) },
    Date: { now: () => now }, performance: { now: () => now }, console,
    fetch: async () => ({ ok: true, json: async () => ({ ...snapshot }) }),
    CanopyRepositoryActivity: {
      referenceTracker: () => ({ observe: () => [] }), validate: value => value,
      references: () => { references++; return []; },
      nodeHeat: () => { calls++; return 'high'; }
    }, matchMedia: () => ({ matches: false })
  };
  sandbox.window = sandbox;
  vm.runInNewContext(read('repository-activity-ui.js'), sandbox);
  const ui = sandbox.CanopyRepositoryActivityUI;
  for (let i = 0; i < 100; i++) { ui.nodeHeat(node); ui.edgeHeat(node, other); ui.pulses(); }
  assert.equal(calls, 2);
  assert.equal(references, 0, 'an empty animation queue must not rescan all references');
  now += 999; ui.nodeHeat(node); assert.equal(calls, 2);
  now++; ui.nodeHeat(node); assert.equal(calls, 3);
  await ui.load();
  ui.nodeHeat(node); assert.equal(calls, 4);
});

test('tiny overview blips do not enqueue artwork; zoom, hover and selection still load identity', () => {
  const source = read('spiral.js');
  const expression = source.match(/const avatar = (.*);/)[1];
  let requests = 0;
  const sandbox = { visSize: 20, zoom: 0.1, isSelected: false, isHovered: false,
    node: {}, graphIdentity: { get: () => { requests++; return { image: 'avatar' }; } } };
  assert.equal(vm.runInNewContext(expression, sandbox), null);
  assert.equal(requests, 0);
  sandbox.zoom = 0.5;
  assert.equal(vm.runInNewContext(expression, sandbox), 'avatar');
  sandbox.zoom = 0.1; sandbox.isHovered = true;
  assert.equal(vm.runInNewContext(expression, sandbox), 'avatar');
  sandbox.isHovered = false; sandbox.isSelected = true;
  assert.equal(vm.runInNewContext(expression, sandbox), 'avatar');
  assert.equal(requests, 3);
  assert.doesNotMatch(source, /allProjects\.forEach\(node => graphIdentity\.get\(node\)\)/);
});
