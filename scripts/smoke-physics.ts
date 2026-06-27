import assert from 'node:assert/strict';
import { BridgePhysics } from '../src/game/systems/BridgePhysics';
import type { LevelKey, LoadCaseKey } from '../src/game/types';

function runUntilResult(bridge: BridgePhysics, maxSteps = 2600) {
  let peakStress = 0;
  for (let i = 0; i < maxSteps && bridge.mode === 'test'; i += 1) {
    bridge.step(1 / 120);
    peakStress = Math.max(peakStress, bridge.maxStress);
  }
  return { mode: bridge.mode, peakStress, progress: bridge.car.progress };
}

const loadResults: Partial<Record<LevelKey, Partial<Record<LoadCaseKey, ReturnType<typeof runUntilResult>>>>> = {};
for (const level of ['truss', 'arch', 'cableStayed', 'suspension'] as const) {
  loadResults[level] = {};
  for (const loadCase of ['sedan', 'truck', 'crowd'] as const) {
    const demo = new BridgePhysics();
    demo.loadCase = loadCase;
    demo.loadLevel(level);
    assert.equal(demo.startTest().ok, true);
    const result = runUntilResult(demo, 5200);
    assert.equal(result.mode, 'success', `${level}示范桥应通过${loadCase}荷载`);
    loadResults[level]![loadCase] = result;
  }
}

const jointed = new BridgePhysics();
jointed.loadBlueprint();
const lowerNode = jointed.findNode(315, 380, 4);
assert.ok(lowerNode, '应找到示范桥下弦节点');
const beforeJoint = { nodes: jointed.nodes.length, members: jointed.members.length };
const jointResult = jointed.addMemberFrom(lowerNode.id, 315, 300, 'wood');
assert.equal(jointResult.ok, true, '斜撑落在桥面杆件中部时应自动铰接');
assert.equal(jointed.nodes.length, beforeJoint.nodes + 1, '桥面中部应插入一个新节点');
assert.equal(jointed.members.length, beforeJoint.members + 2, '原桥面一分为二并新增一根斜撑');
const insertedJoint = jointed.findNode(315, 300, 2);
assert.ok(insertedJoint, '应找到自动插入的桥面铰接节点');
assert.equal(jointed.members.filter((member) => member.a === insertedJoint.id || member.b === insertedJoint.id).length, 3);

const unanchored = new BridgePhysics();
unanchored.loadLevel('suspension');
assert.equal(unanchored.deleteNearest(122, 299), true, '应能拆除左侧边锚索');
assert.equal(unanchored.startTest().ok, false, '悬索桥缺少边锚索时不应允许加载');

const pinOnlyArch = new BridgePhysics();
pinOnlyArch.loadLevel('arch');
assert.equal(pinOnlyArch.members.filter((member) => member.behavior === 'frame').length, 6, '拱肋应使用连续框架杆');
pinOnlyArch.frameJoints = [];
assert.equal(pinOnlyArch.startTest().ok, true);
assert.equal(runUntilResult(pinOnlyArch).mode, 'failure', '取消拱肋转角刚度后，纯铰拱不应稳定通车');

for (const level of ['cableStayed', 'suspension'] as const) {
  const towerBridge = new BridgePhysics();
  towerBridge.loadLevel(level);
  assert.equal(towerBridge.nodes.filter((node) => node.fixed && node.y === 480).length, 2, `${level}应有两座海床基础`);
  const towerXs = level === 'cableStayed' ? [315, 645] : [300, 660];
  for (const x of towerXs) {
    const deckJoint = towerBridge.findNode(x, 300, 2);
    assert.ok(deckJoint && !deckJoint.fixed, `${level}桥面塔梁交叉点不能冒充固定基础`);
    const foundation = towerBridge.findNode(x, 480, 2);
    assert.ok(foundation?.fixed, `${level}塔柱必须落到海床固定节点`);
    assert.ok(towerBridge.members.some((member) => member.behavior === 'frame'
      && ((member.a === deckJoint.id && member.b === foundation.id) || (member.b === deckJoint.id && member.a === foundation.id))));
  }
}

const damaged = new BridgePhysics();
damaged.loadBlueprint();
for (const point of [
  [480, 380],
  [507, 340],
  [452, 340],
  [397, 340],
  [370, 380],
  [590, 380],
] as const) damaged.deleteNearest(point[0], point[1]);
assert.equal(damaged.startTest().ok, true);
const damagedResult = runUntilResult(damaged);
assert.equal(damagedResult.mode, 'failure', '失去中跨桁架的桥应当失败');

console.log(JSON.stringify({ loads: loadResults, joint: jointResult, anchorGuard: 'passed', frameBehavior: 'passed', seabedFoundations: 'passed', damaged: damagedResult }, null, 2));
