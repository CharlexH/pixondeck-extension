import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COCO17_JOINT_NAMES, exportPoseData } from './pose-export.ts';
import type { PoseResult } from './shared/lib/pose/protocol';

test('pose export defines coordinates and anatomical COCO17 joints without losing uncertainty', () => {
  const result: PoseResult = {
    width: 800, height: 1200, status: 'partial', reasons: ['missing-limbs'],
    visibleCount: 13, stableCount: 13, elapsedMs: 1234, backend: 'wasm', people: 1,
    points: Array.from({ length: 17 }, (_, i) => ({ x: i * 2, y: i * 3, score: i === 9 ? 0.2 : 0.9, stable: i !== 9 })),
  };
  const exported = exportPoseData(result);
  assert.equal(exported.schema, 'pixondeck.pose'); assert.equal(exported.version, 1);
  assert.deepEqual(exported.coordinateSystem, { units: 'pixels', origin: 'top-left', xAxis: 'right', yAxis: 'down', leftRight: 'subject-anatomical' });
  assert.equal(exported.width, 800); assert.equal(exported.height, 1200);
  assert.equal(exported.jointOrder, 'COCO17');
  assert.deepEqual(exported.points.map(p => p.name), [...COCO17_JOINT_NAMES]);
  assert.equal(exported.points[5].name, 'left_shoulder'); assert.equal(exported.points[6].name, 'right_shoulder');
  assert.equal(exported.points[15].name, 'left_ankle'); assert.equal(exported.points[16].name, 'right_ankle');
  assert.deepEqual(exported.points[9], { index: 9, name: 'left_wrist', x: 18, y: 27, score: 0.2, stable: false, state: 'uncertain' });
  assert.equal(exported.points[10].state, 'stable');
  assert.equal(exported.status, result.status); assert.deepEqual(exported.reasons, result.reasons);
  assert.equal(exported.stableCount, result.stableCount);
  assert.equal('name' in result.points[9], false);
});
