import { LEVELS, LOAD_CASES, MATERIALS, WORLD } from '../constants';
import {
  averageSectionMetrics,
  DEFAULT_BEAM_SECTIONS,
  MAX_BEAM_DEPTH,
  MIN_BEAM_DEPTH,
  sectionAreaRatioAt,
  sectionCostRatioAt,
  sectionDepthAt,
  sectionInertiaRatioAt,
  sectionModulusRatioAt,
} from '../beamSection';
import type { ArcSpacing, BeamSection, BridgeMember, BridgeNode, BuildTool, GameMode, LevelKey, LoadCaseKey, MaterialKey } from '../types';

type Snapshot = {
  nodes: BridgeNode[];
  members: BridgeMember[];
  frameJoints: FrameJoint[];
};

type FrameJoint = {
  a: number;
  b: number;
  c: number;
  memberA: number;
  memberB: number;
  restAngle: number;
  lambda: number;
  kind: 'frame' | 'girder';
};

export type StepEvents = {
  broke?: BridgeMember;
  finished?: 'success' | 'failure';
};

export type VisualLoadPose = {
  x: number;
  y: number;
  angle: number;
  index: number;
};

export class BridgePhysics {
  nodes: BridgeNode[] = [];
  members: BridgeMember[] = [];
  frameJoints: FrameJoint[] = [];
  mode: GameMode = 'build';
  material: MaterialKey = 'road';
  loadCase: LoadCaseKey = 'sedan';
  level: LevelKey = 'beam';
  beamSection: BeamSection = { ...DEFAULT_BEAM_SECTIONS.beam };
  indestructible = false;
  buildTool: BuildTool = 'line';
  arcSpacing: ArcSpacing = 55;
  car = { x: 112, y: 280, vy: 0, angle: 0, progress: 0, falling: false };
  peakStress = 0;
  peakGirderStress = 0;

  private nextNodeId = 0;
  private nextMemberId = 0;
  private history: Snapshot[] = [];
  private designSnapshot: Snapshot | null = null;
  private transactionOpen = false;

  constructor() {
    this.resetAnchors();
  }

  get budgetUsed() {
    return this.members.reduce((sum, member) => {
      const material = MATERIALS[member.material];
      if (member.material === 'road') {
        const x = this.memberBaseMidX(member);
        return sum + member.rest * material.cost * sectionCostRatioAt(this.beamSection, x);
      }
      return sum + member.rest * material.cost;
    }, 0);
  }

  get budgetMax() {
    return LEVELS[this.level].budget;
  }

  get maxStress() {
    return this.members.reduce((max, member) => Math.max(max, member.stress), 0);
  }

  get maxGirderStress() {
    return this.members.reduce((max, member) => (
      member.material === 'road' ? Math.max(max, member.stress) : max
    ), 0);
  }

  get beamMetrics() {
    return averageSectionMetrics(this.beamSection);
  }

  get hasMidspanSupport() {
    return this.nodes.some((node) => node.supportY && Math.abs(node.baseX - 480) < 2);
  }

  getGirderDepth(x: number) {
    return sectionDepthAt(this.beamSection, x);
  }

  get canUndo() {
    return this.history.length > 0 && this.mode === 'build';
  }

  get hasBridge() {
    return this.members.some((member) => member.material === 'road');
  }

  resetAnchors() {
    this.nodes = [];
    this.members = [];
    this.frameJoints = [];
    this.history = [];
    this.nextNodeId = 0;
    this.nextMemberId = 0;
    this.transactionOpen = false;
    for (const [x, y] of this.levelSupportPoints()) this.addNode(x, y, true);
    this.mode = 'build';
    this.resetCar();
  }

  loadBlueprint() {
    this.loadLevel(this.level);
  }

  loadLevel(level: LevelKey) {
    this.level = level;
    this.beamSection = { ...DEFAULT_BEAM_SECTIONS[level] };
    this.nodes = [];
    this.members = [];
    this.frameJoints = [];
    this.history = [];
    this.nextNodeId = 0;
    this.nextMemberId = 0;
    this.transactionOpen = false;

    if (level === 'beam') this.buildBeamLevel();
    else if (level === 'truss') this.buildTrussLevel();
    else if (level === 'arch') this.buildArchLevel();
    else if (level === 'cableStayed') this.buildCableStayedLevel();
    else this.buildSuspensionLevel();

    this.rebuildGirderJoints();

    this.mode = 'build';
    this.resetRuntimeValues();
    this.resetCar();
  }

  private buildBeamLevel() {
    const deck: number[] = [];
    for (let i = 0; i <= 10; i += 1) {
      const x = 150 + i * 66;
      deck.push(this.addNode(x, 300, i === 0 || i === 10).id);
    }
    for (let i = 0; i < deck.length - 1; i += 1) this.addMemberDirect(deck[i], deck[i + 1], 'road');
  }

  private buildTrussLevel() {

    const top: number[] = [];
    for (let i = 0; i <= 6; i += 1) {
      top.push(this.addNode(150 + i * 110, 300, i === 0 || i === 6).id);
    }
    const bottom: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      bottom.push(this.addNode(205 + i * 110, 380, false).id);
    }

    for (let i = 0; i < 6; i += 1) this.addMemberDirect(top[i], top[i + 1], 'road');
    for (let i = 0; i < 5; i += 1) this.addMemberDirect(bottom[i], bottom[i + 1], 'wood');
    for (let i = 0; i < 6; i += 1) {
      this.addMemberDirect(top[i], bottom[i], 'wood');
      this.addMemberDirect(bottom[i], top[i + 1], 'wood');
    }
  }

  private buildArchLevel() {
    const deck: number[] = [];
    for (let i = 0; i <= 6; i += 1) {
      deck.push(this.addNode(150 + i * 110, 300, i === 0 || i === 6).id);
    }
    for (let i = 0; i < deck.length - 1; i += 1) this.addMemberDirect(deck[i], deck[i + 1], 'road');

    const arch = [
      deck[0],
      this.addNode(260, 228, false).id,
      this.addNode(370, 180, false).id,
      this.addNode(480, 164, false).id,
      this.addNode(590, 180, false).id,
      this.addNode(700, 228, false).id,
      deck[6],
    ];
    this.addFrameChain(arch, 'steel');
    for (let i = 1; i < arch.length - 1; i += 1) this.addMemberDirect(arch[i], deck[i], 'cable');
  }

  private buildCableStayedLevel() {
    const deck: number[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const x = 150 + i * 55;
      deck.push(this.addNode(x, 300, i === 0 || i === 12).id);
    }
    for (let i = 0; i < deck.length - 1; i += 1) this.addMemberDirect(deck[i], deck[i + 1], 'road');

    const leftMid = this.addNode(315, 225, false).id;
    const leftTop = this.addNode(315, 145, false).id;
    const rightMid = this.addNode(645, 225, false).id;
    const rightTop = this.addNode(645, 145, false).id;
    const leftFoundation = this.addNode(315, 480, true).id;
    const rightFoundation = this.addNode(645, 480, true).id;
    this.addFrameChain([leftFoundation, deck[3], leftMid, leftTop], 'steel');
    this.addFrameChain([rightFoundation, deck[9], rightMid, rightTop], 'steel');

    for (const index of [0, 1, 2, 4, 5, 6]) this.addMemberDirect(leftTop, deck[index], 'cable');
    for (const index of [12, 11, 10, 8, 7, 6]) this.addMemberDirect(rightTop, deck[index], 'cable');
    const leftAnchor = this.addNode(105, 330, true).id;
    const rightAnchor = this.addNode(855, 330, true).id;
    this.addMemberDirect(leftAnchor, leftTop, 'cable');
    this.addMemberDirect(rightTop, rightAnchor, 'cable');
  }

  private buildSuspensionLevel() {
    const deck = Array.from({ length: 13 }, (_, index) => (
      this.addNode(150 + index * 55, 300, index === 0 || index === 12).id
    ));
    for (let i = 0; i < deck.length - 1; i += 1) this.addMemberDirect(deck[i], deck[i + 1], 'road');

    const leftMid = this.addNode(150, 220, false).id;
    const leftTop = this.addNode(150, 135, false).id;
    const rightMid = this.addNode(810, 220, false).id;
    const rightTop = this.addNode(810, 135, false).id;
    const leftFoundation = this.addNode(150, 480, true).id;
    const rightFoundation = this.addNode(810, 480, true).id;
    this.addFrameChain([leftFoundation, deck[0], leftMid, leftTop], 'steel');
    this.addFrameChain([rightFoundation, deck[12], rightMid, rightTop], 'steel');

    const mainCable = [leftTop];
    for (let index = 1; index < 12; index += 1) {
      const t = index / 12;
      mainCable.push(this.addNode(150 + index * 55, 135 + 105 * 4 * t * (1 - t), false).id);
    }
    mainCable.push(rightTop);
    for (let i = 0; i < mainCable.length - 1; i += 1) this.addMemberDirect(mainCable[i], mainCable[i + 1], 'cable');
    for (let i = 1; i < mainCable.length - 1; i += 1) this.addMemberDirect(mainCable[i], deck[i], 'cable');
  }

  findNode(x: number, y: number, radius = 16) {
    let best: BridgeNode | null = null;
    let bestDistance = radius;
    for (const node of this.nodes) {
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    return best;
  }

  setBeamSection(patch: Partial<BeamSection>) {
    if (this.mode !== 'build') return false;
    this.beamSection = {
      ...this.beamSection,
      ...patch,
      depth: PhaserLikeClamp(
        Math.round((patch.depth ?? this.beamSection.depth) / 3) * 3,
        MIN_BEAM_DEPTH,
        MAX_BEAM_DEPTH,
      ),
    };
    return true;
  }

  setMidspanSupport(enabled: boolean) {
    if (this.mode !== 'build' || this.level !== 'beam' || enabled === this.hasMidspanSupport) return false;
    const node = this.findNode(480, 300, 8);
    if (!node) return false;
    this.pushHistory();
    node.supportY = enabled;
    node.y = node.baseY;
    node.py = node.baseY;
    return true;
  }

  startBuildAt(rawX: number, rawY: number) {
    if (this.mode !== 'build') return null;
    const existing = this.findNode(rawX, rawY, 18);
    if (existing) return existing;

    const projection = this.findMemberProjection(rawX, rawY, 14);
    if (!projection) return null;
    this.pushHistory();
    this.transactionOpen = true;
    return this.splitMember(projection.member, projection.x, projection.y);
  }

  addMemberFrom(startId: number, rawX: number, rawY: number, material: MaterialKey) {
    if (this.mode !== 'build') return { ok: false, reason: '加载中不能施工' };
    const start = this.nodeById(startId);
    if (!start) return { ok: false, reason: '请选择已有节点' };

    const x = Math.round(rawX / WORLD.grid) * WORLD.grid;
    const y = Math.round(rawY / WORLD.grid) * WORLD.grid;
    const existing = this.findNode(rawX, rawY, 18) ?? this.findNode(x, y, 18);
    const projection = existing ? null : this.findMemberProjection(rawX, rawY, 14);
    const targetX = existing?.x ?? projection?.x ?? x;
    const targetY = existing?.y ?? projection?.y ?? y;
    const length = Math.hypot(targetX - start.x, targetY - start.y);
    if (length < 24) {
      this.transactionOpen = false;
      return { ok: false, reason: '构件太短' };
    }
    if (this.members.some((m) => (m.a === startId && m.b === existing?.id) || (m.b === startId && m.a === existing?.id))) {
      this.transactionOpen = false;
      return { ok: false, reason: '这里已经有构件了' };
    }
    const costMultiplier = material === 'road'
      ? sectionCostRatioAt(this.beamSection, (start.baseX + targetX) * 0.5)
      : 1;
    const cost = length * MATERIALS[material].cost * costMultiplier;
    if (this.budgetUsed + cost > this.budgetMax) {
      this.transactionOpen = false;
      return { ok: false, reason: '预算不够，试试木材或删除多余构件' };
    }

    if (!this.transactionOpen) this.pushHistory();
    const target = existing
      ?? (projection ? this.splitMember(projection.member, projection.x, projection.y) : this.addNode(targetX, targetY, false));
    this.addMemberDirect(start.id, target.id, material);
    this.rebuildGirderJoints();
    this.transactionOpen = false;
    return { ok: true, reason: `${MATERIALS[material].name} +1` };
  }

  getArcPreview(startId: number, rawX: number, rawY: number, material: MaterialKey, spacing: ArcSpacing) {
    const start = this.nodeById(startId);
    if (!start) return [];
    const existing = this.findNode(rawX, rawY, 18);
    const x = existing?.x ?? Math.round(rawX / WORLD.grid) * WORLD.grid;
    const y = existing?.y ?? Math.round(rawY / WORLD.grid) * WORLD.grid;
    return this.makeArcPoints(start.x, start.y, x, y, material, spacing);
  }

  addArcFrom(startId: number, rawX: number, rawY: number, material: MaterialKey, spacing: ArcSpacing) {
    if (this.mode !== 'build') return { ok: false, reason: '加载中不能施工' };
    if (material === 'road') return { ok: false, reason: '弧线工具用于钢拱、木拱或缆索；桥面请用直线工具。' };
    const start = this.nodeById(startId);
    if (!start) return { ok: false, reason: '请选择已有节点' };

    const snappedX = Math.round(rawX / WORLD.grid) * WORLD.grid;
    const snappedY = Math.round(rawY / WORLD.grid) * WORLD.grid;
    const existing = this.findNode(rawX, rawY, 18) ?? this.findNode(snappedX, snappedY, 18);
    if (existing?.id === start.id) return { ok: false, reason: '弧线终点不能与起点重合' };
    const projection = existing ? null : this.findMemberProjection(rawX, rawY, 14);
    const targetX = existing?.x ?? projection?.x ?? snappedX;
    const targetY = existing?.y ?? projection?.y ?? snappedY;
    const points = this.makeArcPoints(start.x, start.y, targetX, targetY, material, spacing);
    if (points.length < 3) {
      this.transactionOpen = false;
      return { ok: false, reason: `弧线水平跨度至少需要 ${spacing}px` };
    }

    let cost = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      cost += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y) * MATERIALS[material].cost;
    }
    if (this.budgetUsed + cost > this.budgetMax) {
      this.transactionOpen = false;
      return { ok: false, reason: '预算不够，增大分段距离或删除多余构件' };
    }

    if (!this.transactionOpen) this.pushHistory();
    const target = existing
      ?? (projection ? this.splitMember(projection.member, projection.x, projection.y) : this.addNode(targetX, targetY, false));
    const nodeIds = [start.id];
    for (let i = 1; i < points.length - 1; i += 1) nodeIds.push(this.addNode(points[i].x, points[i].y, false).id);
    nodeIds.push(target.id);
    if (material === 'steel') this.addFrameChain(nodeIds, material);
    else for (let i = 0; i < nodeIds.length - 1; i += 1) this.addMemberDirect(nodeIds[i], nodeIds[i + 1], material);
    this.rebuildGirderJoints();
    this.transactionOpen = false;
    return { ok: true, reason: `弧线已按桥向等分为 ${nodeIds.length - 1} 段（约 ${spacing}px/段）` };
  }

  deleteNearest(x: number, y: number) {
    if (this.mode !== 'build') return false;
    let bestIndex = -1;
    let bestDistance = 14;
    for (let i = 0; i < this.members.length; i += 1) {
      const member = this.members[i];
      const a = this.nodeById(member.a);
      const b = this.nodeById(member.b);
      if (!a || !b) continue;
      const distance = pointSegmentDistance(x, y, a.x, a.y, b.x, b.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return false;
    this.transactionOpen = false;
    this.pushHistory();
    this.members.splice(bestIndex, 1);
    this.removeOrphanNodes();
    this.rebuildGirderJoints();
    return true;
  }

  undo() {
    const snapshot = this.history.pop();
    if (!snapshot || this.mode !== 'build') return false;
    this.restore(snapshot);
    this.transactionOpen = false;
    return true;
  }

  startTest() {
    if (!this.hasContinuousRoad()) return { ok: false, reason: '桥面还没有从左岸连到右岸' };
    this.rebuildGirderJoints();
    const anchorWarning = !this.hasRequiredAnchorCables();
    this.designSnapshot = this.capture();
    this.restore(this.designSnapshot);
    this.mode = 'test';
    this.resetRuntimeValues();
    this.resetCar();
    this.transactionOpen = false;
    return {
      ok: true,
      reason: anchorWarning
        ? `警告：边锚或背索不连续，继续加载以观察主梁和桥塔如何失效。`
        : `${LOAD_CASES[this.loadCase].name}加载开始`,
    };
  }

  stopTest() {
    if (this.designSnapshot) this.restore(this.designSnapshot);
    this.mode = 'build';
    this.resetRuntimeValues();
    this.resetCar();
    this.transactionOpen = false;
  }

  step(dt: number): StepEvents {
    if (this.mode !== 'test') return {};

    for (const member of this.members) member.lambda = 0;
    for (const joint of this.frameJoints) joint.lambda = 0;
    this.applyVehicleLoad(dt);
    this.integrate(dt);

    for (let iteration = 0; iteration < 24; iteration += 1) {
      for (const member of this.members) this.solveMember(member, dt);
      for (const joint of this.frameJoints) this.solveFrameJoint(joint, dt);
      this.enforceVerticalSupports();
    }

    const bendingStress = new Map<number, number>();
    for (const joint of this.frameJoints) {
      if (!this.isFrameJointActive(joint)) continue;
      const jointNode = this.nodeById(joint.b);
      const isGirder = joint.kind === 'girder' && jointNode;
      const inertiaScale = isGirder
        ? Math.max(0.08, sectionInertiaRatioAt(this.beamSection, jointNode.baseX))
        : 1;
      const capacity = isGirder
        ? 155000 * Math.max(0.12, sectionModulusRatioAt(this.beamSection, jointNode.baseX))
        : 1550000;
      // XPBD multipliers grow with constraint stiffness. Remove that numerical bias
      // before comparing moment demand with the section modulus W.
      const spanRatio = jointNode ? PhaserLikeClamp((jointNode.baseX - 150) / 660, 0, 1) : 0.5;
      const halfSpanRatio = spanRatio <= 0.5 ? spanRatio * 2 : (1 - spanRatio) * 2;
      const simpleBeamEnvelope = this.level === 'beam'
        ? this.hasMidspanSupport
          ? 0.12 + 0.28 * 4 * halfSpanRatio * (1 - halfSpanRatio)
          : 0.2 + 0.8 * 4 * spanRatio * (1 - spanRatio)
        : 1;
      const suspensionSupportFactor = this.level === 'suspension' && joint.kind === 'girder'
        ? this.members.some((member) => !member.broken
          && member.material === 'cable'
          && (member.a === joint.b || member.b === joint.b))
          ? 0.82
          : 1.85
        : 1;
      const momentDemand = Math.abs(joint.lambda) / (dt * dt) / Math.sqrt(inertiaScale)
        * simpleBeamEnvelope * suspensionSupportFactor;
      const stress = momentDemand / capacity;
      bendingStress.set(joint.memberA, Math.max(bendingStress.get(joint.memberA) ?? 0, stress));
      bendingStress.set(joint.memberB, Math.max(bendingStress.get(joint.memberB) ?? 0, stress));
    }

    let broken: BridgeMember | undefined;
    for (const member of this.members) {
      if (member.broken) continue;
      const material = MATERIALS[member.material];
      const force = Math.abs(member.lambda) / (dt * dt);
      const areaScale = member.material === 'road'
        ? Math.max(0.2, sectionAreaRatioAt(this.beamSection, this.memberBaseMidX(member)))
        : 1;
      const forceStress = force / (material.capacity * areaScale);
      member.axialStress = forceStress;
      member.bendingStress = bendingStress.get(member.id) ?? 0;
      member.stress = Math.max(member.axialStress, member.bendingStress);
      if (!this.indestructible && member.stress > 1) member.overFrames += 1;
      else member.overFrames = Math.max(0, member.overFrames - 2);
      if (!this.indestructible && member.overFrames > 5) {
        member.broken = true;
        broken = member;
      }
    }

    this.peakStress = Math.max(this.peakStress, this.maxStress);
    this.peakGirderStress = Math.max(this.peakGirderStress, this.maxGirderStress);

    this.advanceVehicle(dt);
    if (this.car.x > this.finishX && !this.car.falling) {
      this.mode = 'success';
      return { broke: broken, finished: 'success' };
    }
    if (this.car.y > 535) {
      this.mode = 'failure';
      return { broke: broken, finished: 'failure' };
    }
    return { broke: broken };
  }

  private integrate(dt: number) {
    const damping = 0.994;
    for (const node of this.nodes) {
      if (node.fixed) {
        node.px = node.x;
        node.py = node.y;
        continue;
      }
      if (node.supportY) {
        const vx = (node.x - node.px) * damping;
        node.px = node.x;
        node.py = node.baseY;
        node.x += vx;
        node.y = node.baseY;
        continue;
      }
      const vx = (node.x - node.px) * damping;
      const vy = (node.y - node.py) * damping;
      node.px = node.x;
      node.py = node.y;
      node.x += vx;
      node.y += vy + 720 * dt * dt;
    }

    for (const member of this.members) {
      if (member.broken) continue;
      const material = MATERIALS[member.material];
      const sectionWeight = member.material === 'road'
        ? sectionAreaRatioAt(this.beamSection, this.memberBaseMidX(member))
        : 1;
      const weightStep = material.weight * sectionWeight * dt * dt * 0.5;
      const a = this.nodeById(member.a);
      const b = this.nodeById(member.b);
      if (a && !a.fixed) a.y += weightStep;
      if (b && !b.fixed) b.y += weightStep;
    }
  }

  private enforceVerticalSupports() {
    for (const node of this.nodes) {
      if (!node.supportY) continue;
      node.y = node.baseY;
      node.py = node.baseY;
    }
  }

  private solveMember(member: BridgeMember, dt: number) {
    if (member.broken) return;
    const a = this.nodeById(member.a);
    const b = this.nodeById(member.b);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 0.0001;
    const constraint = length - member.rest;
    if (member.material === 'cable' && constraint <= 0) {
      member.stress = 0;
      return;
    }
    const wa = a.fixed ? 0 : 1;
    const wb = b.fixed ? 0 : 1;
    if (wa + wb === 0) return;
    const areaScale = member.material === 'road'
      ? Math.max(0.2, sectionAreaRatioAt(this.beamSection, this.memberBaseMidX(member)))
      : 1;
    const alpha = (MATERIALS[member.material].compliance / areaScale) / (dt * dt);
    const deltaLambda = (-constraint - alpha * member.lambda) / (wa + wb + alpha);
    member.lambda += deltaLambda;
    const nx = dx / length;
    const ny = dy / length;
    if (!a.fixed) {
      a.x += wa * deltaLambda * -nx;
      a.y += wa * deltaLambda * -ny;
    }
    if (!b.fixed) {
      b.x += wb * deltaLambda * nx;
      b.y += wb * deltaLambda * ny;
    }
  }

  private solveFrameJoint(joint: FrameJoint, dt: number) {
    if (!this.isFrameJointActive(joint)) return;
    const nodes = [this.nodeById(joint.a), this.nodeById(joint.b), this.nodeById(joint.c)];
    if (nodes.some((node) => !node)) return;
    const [a, b, c] = nodes as [BridgeNode, BridgeNode, BridgeNode];
    const currentMeasure = joint.kind === 'girder' ? bendSine(a, b, c) : signedAngle(a, b, c);
    const constraint = joint.kind === 'girder'
      ? currentMeasure - joint.restAngle
      : normalizeAngle(currentMeasure - joint.restAngle);
    const epsilon = 0.01;
    const gradients = [a, b, c].map((node) => {
      node.x += epsilon;
      const measureX = joint.kind === 'girder' ? bendSine(a, b, c) : signedAngle(a, b, c);
      node.x -= epsilon;
      node.y += epsilon;
      const measureY = joint.kind === 'girder' ? bendSine(a, b, c) : signedAngle(a, b, c);
      node.y -= epsilon;
      return {
        x: (joint.kind === 'girder' ? measureX - currentMeasure : normalizeAngle(measureX - currentMeasure)) / epsilon,
        y: (joint.kind === 'girder' ? measureY - currentMeasure : normalizeAngle(measureY - currentMeasure)) / epsilon,
      };
    });

    let weightedGradient = 0;
    for (let i = 0; i < 3; i += 1) {
      if (nodes[i]!.fixed) continue;
      weightedGradient += gradients[i].x ** 2 + gradients[i].y ** 2;
    }
    if (weightedGradient < 1e-10) return;
    const inertiaScale = joint.kind === 'girder'
      ? Math.max(0.08, sectionInertiaRatioAt(this.beamSection, b.baseX))
      : 1;
    const baseCompliance = joint.kind === 'girder' ? 0.00000042 / inertiaScale : 0.00000008;
    const compliance = baseCompliance;
    const alpha = compliance / (dt * dt);
    const deltaLambda = (-constraint - alpha * joint.lambda) / (weightedGradient + alpha);
    joint.lambda += deltaLambda;
    for (let i = 0; i < 3; i += 1) {
      const node = nodes[i]!;
      if (node.fixed) continue;
      node.x += gradients[i].x * deltaLambda;
      node.y += gradients[i].y * deltaLambda;
    }
  }

  private isFrameJointActive(joint: FrameJoint) {
    const memberA = this.members.find((member) => member.id === joint.memberA);
    const memberB = this.members.find((member) => member.id === joint.memberB);
    return Boolean(memberA && memberB && !memberA.broken && !memberB.broken);
  }

  private applyVehicleLoad(dt: number) {
    const profile = LOAD_CASES[this.loadCase];
    for (const x of this.loadXs) {
      const segment = this.roadAt(x);
      if (!segment || x < WORLD.leftAnchor.x || x > WORLD.rightAnchor.x) continue;
      const a = this.nodeById(segment.member.a)!;
      const b = this.nodeById(segment.member.b)!;
      const span = b.x - a.x;
      const t = Math.abs(span) < 0.001 ? 0.5 : PhaserLikeClamp((x - a.x) / span, 0, 1);
      const loadStep = profile.load * dt * dt;
      if (!a.fixed) a.y += loadStep * (1 - t);
      if (!b.fixed) b.y += loadStep * t;
    }
  }

  private advanceVehicle(dt: number) {
    if (this.car.falling) {
      this.car.vy += 780 * dt;
      this.car.y += this.car.vy * dt;
      this.car.angle += 1.4 * dt;
      return;
    }

    const profile = LOAD_CASES[this.loadCase];
    this.car.x += profile.speed * dt;
    const segment = this.roadAt(this.car.x);
    if (segment) {
      const a = this.nodeById(segment.member.a)!;
      const b = this.nodeById(segment.member.b)!;
      const t = PhaserLikeClamp((this.car.x - a.x) / (b.x - a.x || 1), 0, 1);
      this.car.y = a.y + (b.y - a.y) * t - 18;
      this.car.angle = Math.atan2(b.y - a.y, b.x - a.x);
    } else if (this.car.x < WORLD.leftAnchor.x || this.car.x > WORLD.rightAnchor.x) {
      this.car.y = 282;
      this.car.angle = 0;
    } else {
      this.car.falling = true;
      this.car.vy = 20;
    }

    if (!this.car.falling && this.loadXs.some((x) => (
      x >= WORLD.leftAnchor.x && x <= WORLD.rightAnchor.x && !this.roadAt(x)
    ))) {
      this.car.falling = true;
      this.car.vy = 20;
    }
    this.car.progress = PhaserLikeClamp((this.car.x - 112) / (this.finishX - 112), 0, 1);
  }

  getVisualLoads(): VisualLoadPose[] {
    const offsetY = this.loadCase === 'crowd' ? 15 : 18;
    return this.loadXs.map((x, index) => {
      if (this.car.falling) {
        return { x, y: this.car.y + index * 2, angle: this.car.angle, index };
      }
      const segment = this.roadAt(x);
      if (!segment || x < WORLD.leftAnchor.x || x > WORLD.rightAnchor.x) {
        return { x, y: 282, angle: 0, index };
      }
      const a = this.nodeById(segment.member.a)!;
      const b = this.nodeById(segment.member.b)!;
      const t = PhaserLikeClamp((x - a.x) / (b.x - a.x || 1), 0, 1);
      return {
        x,
        y: a.y + (b.y - a.y) * t - offsetY,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        index,
      };
    });
  }

  private get loadXs() {
    const profile = LOAD_CASES[this.loadCase];
    return Array.from({ length: profile.count }, (_, index) => this.car.x - index * profile.spacing);
  }

  private get finishX() {
    const profile = LOAD_CASES[this.loadCase];
    return 852 + (profile.count - 1) * profile.spacing;
  }

  private roadAt(x: number) {
    let best: { member: BridgeMember; distance: number } | null = null;
    for (const member of this.members) {
      if (member.material !== 'road' || member.broken) continue;
      const a = this.nodeById(member.a);
      const b = this.nodeById(member.b);
      if (!a || !b) continue;
      const minX = Math.min(a.x, b.x) - 2;
      const maxX = Math.max(a.x, b.x) + 2;
      if (x < minX || x > maxX) continue;
      const centerDistance = Math.abs(x - (a.x + b.x) * 0.5);
      if (!best || centerDistance < best.distance) best = { member, distance: centerDistance };
    }
    return best;
  }

  private hasContinuousRoad() {
    const start = this.findNode(WORLD.leftAnchor.x, WORLD.leftAnchor.y, 4);
    const end = this.findNode(WORLD.rightAnchor.x, WORLD.rightAnchor.y, 4);
    if (!start || !end) return false;
    const visited = new Set<number>([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (id === end.id) return true;
      for (const member of this.members) {
        if (member.material !== 'road') continue;
        const next = member.a === id ? member.b : member.b === id ? member.a : -1;
        if (next >= 0 && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  }

  private hasRequiredAnchorCables() {
    if (this.level === 'cableStayed') {
      return this.hasCablePath([105, 330], [315, 145]) && this.hasCablePath([855, 330], [645, 145]);
    }
    if (this.level === 'suspension') {
      return this.hasCablePath([150, 135], [810, 135]);
    }
    return true;
  }

  private hasCablePath(startPoint: [number, number], endPoint: [number, number]) {
    const start = this.findNode(startPoint[0], startPoint[1], 3);
    const end = this.findNode(endPoint[0], endPoint[1], 3);
    if (!start || !end) return false;
    const visited = new Set<number>([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (id === end.id) return true;
      for (const member of this.members) {
        if (member.material !== 'cable' || member.broken) continue;
        const next = member.a === id ? member.b : member.b === id ? member.a : -1;
        if (next >= 0 && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  }

  private makeArcPoints(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    material: MaterialKey,
    spacing: ArcSpacing,
  ) {
    const dx = bx - ax;
    if (Math.abs(dx) < spacing * 0.8) return [];
    const segments = Math.max(2, Math.ceil(Math.abs(dx) / spacing));
    const rise = Math.min(120, Math.max(36, Math.abs(dx) * 0.22));
    const direction = material === 'cable' ? 1 : -1;
    return Array.from({ length: segments + 1 }, (_, index) => {
      const t = index / segments;
      return {
        x: ax + dx * t,
        y: ay + (by - ay) * t + direction * rise * 4 * t * (1 - t),
      };
    });
  }

  private addNode(x: number, y: number, fixed: boolean) {
    const node: BridgeNode = { id: this.nextNodeId++, x, y, px: x, py: y, baseX: x, baseY: y, fixed };
    this.nodes.push(node);
    return node;
  }

  private levelSupportPoints(): Array<[number, number]> {
    if (this.level === 'cableStayed') {
      return [[150, 300], [315, 480], [645, 480], [810, 300], [105, 330], [855, 330]];
    }
    if (this.level === 'suspension') {
      return [[150, 300], [150, 480], [810, 300], [810, 480]];
    }
    return [[WORLD.leftAnchor.x, WORLD.leftAnchor.y], [WORLD.rightAnchor.x, WORLD.rightAnchor.y]];
  }

  private addFrameChain(nodeIds: number[], material: MaterialKey) {
    const members: BridgeMember[] = [];
    for (let i = 0; i < nodeIds.length - 1; i += 1) {
      members.push(this.addMemberDirect(nodeIds[i], nodeIds[i + 1], material, 'frame'));
    }
    for (let i = 0; i < nodeIds.length - 2; i += 1) {
      const a = this.nodeById(nodeIds[i])!;
      const b = this.nodeById(nodeIds[i + 1])!;
      const c = this.nodeById(nodeIds[i + 2])!;
      this.frameJoints.push({
        a: a.id,
        b: b.id,
        c: c.id,
        memberA: members[i].id,
        memberB: members[i + 1].id,
        restAngle: signedAngle(a, b, c),
        lambda: 0,
        kind: 'frame',
      });
    }
    return members;
  }

  private addMemberDirect(a: number, b: number, material: MaterialKey, behavior?: BridgeMember['behavior']) {
    const na = this.nodeById(a)!;
    const nb = this.nodeById(b)!;
    const member: BridgeMember = {
      id: this.nextMemberId++,
      a,
      b,
      rest: Math.hypot(nb.x - na.x, nb.y - na.y) * (material === 'cable' ? 0.995 : 1),
      material,
      behavior: behavior ?? (material === 'road' ? 'frame' : 'axial'),
      broken: false,
      stress: 0,
      lambda: 0,
      overFrames: 0,
    };
    this.members.push(member);
    return member;
  }

  private rebuildGirderJoints() {
    const structuralJoints = this.frameJoints.filter((joint) => joint.kind === 'frame');
    const roadByNode = new Map<number, BridgeMember[]>();
    for (const member of this.members) {
      if (member.material !== 'road' || member.broken) continue;
      for (const id of [member.a, member.b]) {
        const list = roadByNode.get(id) ?? [];
        list.push(member);
        roadByNode.set(id, list);
      }
    }

    const girderJoints: FrameJoint[] = [];
    for (const [nodeId, members] of roadByNode) {
      if (members.length < 2) continue;
      let bestPair: [BridgeMember, BridgeMember] | null = null;
      let bestStraightness = Number.POSITIVE_INFINITY;
      const b = this.nodeById(nodeId);
      if (!b) continue;
      for (let i = 0; i < members.length - 1; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          const memberA = members[i];
          const memberB = members[j];
          const a = this.nodeById(memberA.a === nodeId ? memberA.b : memberA.a);
          const c = this.nodeById(memberB.a === nodeId ? memberB.b : memberB.a);
          if (!a || !c) continue;
          const angle = signedAngle(a, b, c);
          const straightness = Math.abs(Math.PI - Math.abs(angle));
          if (straightness < bestStraightness) {
            bestStraightness = straightness;
            bestPair = [memberA, memberB];
          }
        }
      }
      if (!bestPair) continue;
      const [memberA, memberB] = bestPair;
      const a = this.nodeById(memberA.a === nodeId ? memberA.b : memberA.a)!;
      const c = this.nodeById(memberB.a === nodeId ? memberB.b : memberB.a)!;
      girderJoints.push({
        a: a.id,
        b: b.id,
        c: c.id,
        memberA: memberA.id,
        memberB: memberB.id,
        restAngle: bendSine(a, b, c),
        lambda: 0,
        kind: 'girder',
      });
    }
    this.frameJoints = [...structuralJoints, ...girderJoints];
  }

  private findMemberProjection(x: number, y: number, radius: number) {
    let best: { member: BridgeMember; x: number; y: number; distance: number } | null = null;
    for (const member of this.members) {
      const a = this.nodeById(member.a);
      const b = this.nodeById(member.b);
      if (!a || !b) continue;
      const point = pointSegmentProjection(x, y, a.x, a.y, b.x, b.y);
      if (point.distance > radius || (best && point.distance >= best.distance)) continue;
      best = { member, x: point.x, y: point.y, distance: point.distance };
    }
    return best;
  }

  private splitMember(member: BridgeMember, x: number, y: number) {
    const a = this.nodeById(member.a)!;
    const b = this.nodeById(member.b)!;
    if (Math.hypot(x - a.x, y - a.y) < 18) return a;
    if (Math.hypot(x - b.x, y - b.y) < 18) return b;

    const memberIndex = this.members.findIndex((candidate) => candidate.id === member.id);
    if (memberIndex < 0) return this.addNode(x, y, false);
    this.members.splice(memberIndex, 1);
    const joint = this.addNode(x, y, false);
    this.addMemberDirect(a.id, joint.id, member.material, member.behavior);
    this.addMemberDirect(joint.id, b.id, member.material, member.behavior);
    return joint;
  }

  private nodeById(id: number) {
    return this.nodes.find((node) => node.id === id);
  }

  private memberBaseMidX(member: BridgeMember) {
    const a = this.nodeById(member.a);
    const b = this.nodeById(member.b);
    return a && b ? (a.baseX + b.baseX) * 0.5 : 480;
  }

  private removeOrphanNodes() {
    const used = new Set(this.members.flatMap((member) => [member.a, member.b]));
    this.nodes = this.nodes.filter((node) => node.fixed || used.has(node.id));
  }

  private pushHistory() {
    this.history.push(this.capture());
    if (this.history.length > 40) this.history.shift();
  }

  private capture(): Snapshot {
    return {
      nodes: this.nodes.map((node) => ({ ...node })),
      members: this.members.map((member) => ({ ...member })),
      frameJoints: this.frameJoints.map((joint) => ({ ...joint })),
    };
  }

  private restore(snapshot: Snapshot) {
    this.nodes = snapshot.nodes.map((node) => ({ ...node }));
    this.members = snapshot.members.map((member) => ({ ...member }));
    this.frameJoints = snapshot.frameJoints.map((joint) => ({ ...joint }));
    this.nextNodeId = Math.max(0, ...this.nodes.map((node) => node.id + 1));
    this.nextMemberId = Math.max(0, ...this.members.map((member) => member.id + 1));
  }

  private resetRuntimeValues() {
    this.peakStress = 0;
    this.peakGirderStress = 0;
    for (const node of this.nodes) {
      node.px = node.x;
      node.py = node.y;
    }
    for (const member of this.members) {
      member.broken = false;
      member.stress = 0;
      member.lambda = 0;
      member.overFrames = 0;
      member.axialStress = 0;
      member.bendingStress = 0;
    }
    for (const joint of this.frameJoints) joint.lambda = 0;
  }

  private resetCar() {
    this.car = { x: 112, y: 282, vy: 0, angle: 0, progress: 0, falling: false };
  }
}

function pointSegmentProjection(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : PhaserLikeClamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { x, y, distance: Math.hypot(px - x, py - y) };
}

function signedAngle(a: BridgeNode, b: BridgeNode, c: BridgeNode) {
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

function bendSine(a: BridgeNode, b: BridgeNode, c: BridgeNode) {
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const denominator = Math.max(0.0001, Math.hypot(ux, uy) * Math.hypot(vx, vy));
  return (ux * vy - uy * vx) / denominator;
}

function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = PhaserLikeClamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function PhaserLikeClamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
