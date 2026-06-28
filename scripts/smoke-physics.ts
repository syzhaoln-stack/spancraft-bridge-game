import assert from 'node:assert/strict';
import { averageSectionMetrics } from '../src/game/beamSection';
import { BridgePhysics } from '../src/game/systems/BridgePhysics';
import type { BeamSection, LevelKey, LoadCaseKey } from '../src/game/types';

function runUntilResult(bridge: BridgePhysics, maxSteps = 5200) {
  let peakStress = 0;
  let peakGirderStress = 0;
  for (let i = 0; i < maxSteps && bridge.mode === 'test'; i += 1) {
    bridge.step(1 / 120);
    peakStress = Math.max(peakStress, bridge.maxStress);
    peakGirderStress = Math.max(peakGirderStress, bridge.maxGirderStress);
  }
  return { mode: bridge.mode, peakStress, peakGirderStress, progress: bridge.car.progress };
}

function testBeamSection(section: BeamSection, loadCase: LoadCaseKey = 'truck') {
  const bridge = new BridgePhysics();
  bridge.loadLevel('beam');
  bridge.setBeamSection(section);
  bridge.loadCase = loadCase;
  assert.equal(bridge.startTest().ok, true);
  return runUntilResult(bridge);
}

const loadResults: Partial<Record<LevelKey, Partial<Record<LoadCaseKey, ReturnType<typeof runUntilResult>>>>> = {};
for (const level of ['truss', 'arch', 'cableStayed', 'suspension'] as const) {
  loadResults[level] = {};
  for (const loadCase of ['sedan', 'truck', 'crowd'] as const) {
    const demo = new BridgePhysics();
    demo.loadCase = loadCase;
    demo.loadLevel(level);
    assert.equal(demo.startTest().ok, true);
    const result = runUntilResult(demo);
    assert.equal(result.mode, 'success', `${level}示范桥应通过${loadCase}荷载`);
    loadResults[level]![loadCase] = result;
  }
}

const shallowSolid = testBeamSection({ shape: 'solid', depth: 33, profile: 'constant' });
assert.equal(shallowSolid.mode, 'failure', '浅实心梁应在卡车荷载下发生弯曲破坏');
assert.ok(shallowSolid.peakGirderStress >= 1, '浅实心梁的主梁利用率应达到破坏阈值');

const tallSolid = testBeamSection({ shape: 'solid', depth: 42, profile: 'constant' });
assert.equal(tallSolid.mode, 'success', '加高实心梁应能通过卡车荷载');

const hollowVariable = testBeamSection({ shape: 'box', depth: 48, profile: 'midspan' });
assert.equal(hollowVariable.mode, 'success', '中跨加高的空心箱梁应能通过卡车荷载');
assert.ok(hollowVariable.peakGirderStress < tallSolid.peakGirderStress, '变截面空心箱梁应比基准实心梁更有效地抵抗跨中弯矩');

const solidMetrics = averageSectionMetrics({ shape: 'solid', depth: 48, profile: 'constant' });
const boxMetrics = averageSectionMetrics({ shape: 'box', depth: 48, profile: 'constant' });
assert.ok(boxMetrics.weight < solidMetrics.weight, '同梁高空心箱梁应比实心梁更轻');
assert.ok(
  boxMetrics.stiffness / boxMetrics.weight > solidMetrics.stiffness / solidMetrics.weight,
  '空心箱梁的单位自重抗弯刚度应高于实心梁',
);

const supportedBeam = new BridgePhysics();
supportedBeam.loadLevel('beam');
assert.equal(supportedBeam.setMidspanSupport(true), true, '梁桥应能增设跨中支座');
assert.equal(supportedBeam.hasMidspanSupport, true);
supportedBeam.loadCase = 'truck';
assert.equal(supportedBeam.startTest().ok, true);
const supportedResult = runUntilResult(supportedBeam);
assert.equal(supportedResult.mode, 'success', '跨中支座应使浅梁形成两跨连续梁并通过卡车');
assert.ok(supportedResult.peakGirderStress < shallowSolid.peakGirderStress, '连续梁支座应降低控制弯曲利用率');

const indestructibleBeam = new BridgePhysics();
indestructibleBeam.loadLevel('beam');
indestructibleBeam.indestructible = true;
indestructibleBeam.loadCase = 'truck';
assert.equal(indestructibleBeam.startTest().ok, true);
const indestructibleResult = runUntilResult(indestructibleBeam);
assert.equal(indestructibleResult.mode, 'success', '牢不可破模式不应触发构件断裂');
assert.equal(indestructibleBeam.members.some((member) => member.broken), false);

const boundedDepth = new BridgePhysics();
boundedDepth.loadLevel('beam');
boundedDepth.setBeamSection({ depth: 20 });
assert.equal(boundedDepth.beamSection.depth, 33, '梁高下限应为跨度的 1/20');
boundedDepth.setBeamSection({ depth: 80 });
assert.equal(boundedDepth.beamSection.depth, 66, '梁高上限应为跨度的 1/10');

const arcBridge = new BridgePhysics();
arcBridge.loadLevel('beam');
const arcStart = arcBridge.findNode(150, 300, 3);
assert.ok(arcStart);
const arcResult = arcBridge.addArcFrom(arcStart.id, 810, 300, 'steel', 55);
assert.equal(arcResult.ok, true, '弧线工具应能自动生成钢拱');
const arcMembers = arcBridge.members.filter((member) => member.material === 'steel');
assert.equal(arcMembers.length, 12, '660px 跨度按 55px 应等分为 12 段');
const arcXs = [...new Set(arcMembers.flatMap((member) => [member.a, member.b])
  .map((id) => arcBridge.nodes.find((node) => node.id === id)!.baseX))].sort((a, b) => a - b);
for (let i = 1; i < arcXs.length; i += 1) assert.ok(Math.abs(arcXs[i] - arcXs[i - 1] - 55) < 0.001);

const jointed = new BridgePhysics();
jointed.loadLevel('truss');
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

const cableless = new BridgePhysics();
cableless.loadLevel('suspension');
cableless.loadCase = 'truck';
cableless.members = cableless.members.filter((member) => member.material !== 'cable');
assert.equal(cableless.startTest().ok, true, '缺索时仍应允许玩家实际加载并观察破坏');
const cablelessResult = runUntilResult(cableless);
assert.equal(cablelessResult.mode, 'failure', '悬索桥拆除全部索后主梁应在卡车荷载下破坏');
assert.ok(cablelessResult.peakGirderStress >= 1, '无索悬索桥应由主梁弯曲利用率触发破坏');

const pinOnlyArch = new BridgePhysics();
pinOnlyArch.loadLevel('arch');
assert.equal(
  pinOnlyArch.members.filter((member) => member.behavior === 'frame' && member.material !== 'road').length,
  6,
  '拱肋应使用连续框架杆',
);
pinOnlyArch.frameJoints = [];
assert.equal(pinOnlyArch.startTest().ok, true);
assert.equal(runUntilResult(pinOnlyArch).mode, 'failure', '取消拱肋转角刚度后，纯铰拱不应稳定通车');

for (const level of ['cableStayed', 'suspension'] as const) {
  const towerBridge = new BridgePhysics();
  towerBridge.loadLevel(level);
  assert.equal(towerBridge.nodes.filter((node) => node.fixed && node.y === 480).length, 2, `${level}应有两座海床基础`);
  const towerXs = level === 'cableStayed' ? [315, 645] : [150, 810];
  for (const x of towerXs) {
    const deckJoint = towerBridge.findNode(x, 300, 2);
    assert.ok(deckJoint, `${level}应有塔梁交叉节点`);
    if (level === 'cableStayed') assert.equal(deckJoint.fixed, false, '斜拉桥桥塔不应悬空固定在桥面');
    else assert.equal(deckJoint.fixed, true, '单跨悬索桥桥塔应直接落在两岸支点');
    const foundation = towerBridge.findNode(x, 480, 2);
    assert.ok(foundation?.fixed, `${level}塔柱必须落到海床固定节点`);
    assert.ok(towerBridge.members.some((member) => member.behavior === 'frame'
      && ((member.a === deckJoint.id && member.b === foundation.id) || (member.b === deckJoint.id && member.a === foundation.id))));
  }
}

const suspensionGeometry = new BridgePhysics();
suspensionGeometry.loadLevel('suspension');
assert.equal(suspensionGeometry.members.filter((member) => member.material === 'cable').length, 23, '主缆 12 段并设置 11 根全跨吊索');
assert.equal(suspensionGeometry.findNode(90, 330, 3), null, '单跨悬索桥不再设置岸外边锚');

const damaged = new BridgePhysics();
damaged.loadLevel('truss');
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

console.log(JSON.stringify({
  loads: loadResults,
  beamSections: { shallowSolid, tallSolid, hollowVariable, solidMetrics, boxMetrics, supportedResult, indestructibleResult },
  arcTool: arcResult,
  joint: jointResult,
  cablelessSuspension: cablelessResult,
  frameBehavior: 'passed',
  seabedFoundations: 'passed',
  damaged: damagedResult,
}, null, 2));
