import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RING_PROGRESS,
  RING_PROGRESS_SKELETON,
  RING_TRACK,
  RING_TRACK_SKELETON,
  SKELETON_ARC,
  clearanceArcPath,
  ringProgressSvg,
  ringTrackSvg,
} from './ring';

test('6/18 进度弧从 12 点走到约 120 度', () => {
  const path = clearanceArcPath(6 / 18);
  assert.equal(path, 'M 28 3 A 25 25 0 0 1 49.6506 40.5');
});

test('没有消灭进度时不画弧，满环仍是 path', () => {
  assert.equal(clearanceArcPath(0), null);
  assert.equal(clearanceArcPath(-1), null);
  const full = clearanceArcPath(1);
  assert.ok(full?.includes('A 25 25'));
  assert.equal(full?.match(/A 25 25/g)?.length, 2);
});

test('轨道圆和进度弧分成两层 SVG', () => {
  const track = ringTrackSvg(RING_TRACK);
  const arc = clearanceArcPath(9 / 28);
  assert.ok(arc);
  const progress = ringProgressSvg(arc, RING_PROGRESS);
  assert.match(track, /<circle /);
  assert.doesNotMatch(track, /<path /);
  assert.match(progress, /<path /);
  assert.doesNotMatch(progress, /<circle /);
  assert.match(track, new RegExp(`stroke="${RING_TRACK}"`));
  assert.match(progress, new RegExp(`stroke="${RING_PROGRESS}"`));
  assert.doesNotMatch(`${track}${progress}`, /6 \/ 18|9 \/ 28|今天消灭了/);
});

test('骨架环用浅轨道和浅弧，不带示意计数', () => {
  const track = ringTrackSvg(RING_TRACK_SKELETON);
  const progress = ringProgressSvg(SKELETON_ARC, RING_PROGRESS_SKELETON);
  assert.match(track, new RegExp(RING_TRACK_SKELETON));
  assert.match(progress, new RegExp(RING_PROGRESS_SKELETON));
  assert.doesNotMatch(`${track}${progress}`, /\d+ \/ \d+/);
});
