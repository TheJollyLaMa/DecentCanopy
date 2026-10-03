'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { project } = require('../scripts/canopy-globe');

test('globe projection places the selected center in front and hides the opposite hemisphere', () => {
  for (const [latitude, longitude] of [[0, 0], [45, 90], [-30, -100]]) {
    const point = project(latitude, longitude, latitude, longitude);
    assert.ok(Math.abs(point.x) < 1e-10);
    assert.ok(Math.abs(point.y) < 1e-10);
    assert.equal(point.visible, true);
    assert.equal(project(-latitude, longitude + 180, latitude, longitude).visible, false);
  }
});

test('globe projection handles poles and wraps longitudes without moving off the sphere', () => {
  assert.equal(project(90, 0, 90, 0).visible, true);
  assert.equal(project(-90, 0, 90, 0).visible, false);
  const a = project(20, 170, 0, -170);
  const b = project(20, -190, 0, -170);
  assert.ok(Math.abs(a.x - b.x) < 1e-10);
  assert.ok(Math.hypot(a.x, a.y) <= 1);
});
