import { LEVELS, LOAD_CASES, MATERIALS, WORLD } from '../constants';
import type { BridgeMember, BridgeNode, GameMode, LevelKey, LoadCaseKey, MaterialKey } from '../types';

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
  level: LevelKey = 'truss';
  car = { x: 112, y: 280, vy: 0, angle: 0, progress: 0, falling: false };

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
      return sum + member.rest * material.cost;
    }, 0);
  }

  get budgetMax() {
    return LEVELS[this.level].budget;
  }

  get maxStress() {
    return this.members.reduce((max, member) => Math.max(max, member.stress), 0);
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
    this.nodes = [];
    this.members = [];
    this.frameJoints = [];
    this.history = [];
    this.nextNodeId = 0;
    this.nextMemberId = 0;
    this.transactionOpen = false;

    if (level === 'truss') this.buildTrussLevel();
    else if (level === 'arch') this.buildArchLevel();
    else if (level === 'cableStayed') this.buildCableStayedLevel();
    else this.buildSuspensionLevel();

    this.mode = 'build';
    this.resetRuntimeValues();
    this.resetCar();
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
    const deckXs = [150, 210, 270, 300, 360, 420, 480, 540, 600, 660, 690, 750, 810];
    const deck = deckXs.map((x) => this.addNode(x, 300, x === 150 || x === 810).id);
    for (let i = 0; i < deck.length - 1; i += 1) this.addMemberDirect(deck[i], deck[i + 1], 'road');

    const leftMid = this.addNode(300, 220, false).id;
    const leftTop = this.addNode(300, 135, false).id;
    const rightMid = this.addNode(660, 220, false).id;
    const rightTop = this.addNode(660, 135, false).id;
    const leftFoundation = this.addNode(300, 480, true).id;
    const rightFoundation = this.addNode(660, 480, true).id;
    this.addFrameChain([leftFoundation, deck[3], leftMid, leftTop], 'steel');
    this.addFrameChain([rightFoundation, deck[9], rightMid, rightTop], 'steel');

    const mainCable = [
      leftTop,
      this.addNode(360, 177, false).id,
      this.addNode(420, 202, false).id,
      this.addNode(480, 210, false).id,
      this.addNode(540, 202, false).id,
      this.addNode(600, 177, false).id,
      rightTop,
    ];
    for (let i = 0; i < mainCable.length - 1; i += 1) this.addMemberDirect(mainCable[i], mainCable[i + 1], 'cable');
    for (let i = 1; i < mainCable.length - 1; i += 1) this.addMemberDirect(mainCable[i], deck[i + 3], 'cable');

    const leftAnchor = this.addNode(90, 330, true).id;
    const leftSide1 = this.addNode(155, 268, false).id;
    const leftSide2 = this.addNode(225, 190, false).id;
    this.addMemberDirect(leftAnchor, leftSide1, 'cable');
    this.addMemberDirect(leftSide1, leftSide2, 'cable');
    this.addMemberDirect(leftSide2, leftTop, 'cable');

    const rightAnchor = this.addNode(870, 330, true).id;
    const rightSide1 = this.addNode(805, 268, false).id;
    const rightSide2 = this.addNode(735, 190, false).id;
    this.addMemberDirect(rightTop, rightSide2, 'cable');
    this.addMemberDirect(rightSide2, rightSide1, 'cable');
    this.addMemberDirect(rightSide1, rightAnchor, 'cable');
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
    const cost = length * MATERIALS[material].cost;
    if (this.budgetUsed + cost > this.budgetMax) {
      this.transactionOpen = false;
      return { ok: false, reason: '预算不够，试试木材或删除多余构件' };
    }

    if (!this.transactionOpen) this.pushHistory();
    const target = existing
      ?? (projection ? this.splitMember(projection.member, projection.x, projection.y) : this.addNode(targetX, targetY, false));
    this.addMemberDirect(start.id, target.id, material);
    this.transactionOpen = false;
    return { ok: true, reason: `${MATERIALS[material].name} +1` };
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
    if (!this.hasRequiredAnchorCables()) {
      return { ok: false, reason: '边锚索没有闭合：主缆或背索必须连续连接桥塔与两侧地锚。' };
    }
    this.designSnapshot = this.capture();
    this.restore(this.designSnapshot);
    this.mode = 'test';
    this.resetRuntimeValues();
    this.resetCar();
    this.transactionOpen = false;
    return { ok: true, reason: `${LOAD_CASES[this.loadCase].name}加载开始` };
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

    for (let iteration = 0; iteration < 12; iteration += 1) {
      for (const member of this.members) this.solveMember(member, dt);
      for (const joint of this.frameJoints) this.solveFrameJoint(joint, dt);
    }

    const bendingStress = new Map<number, number>();
    for (const joint of this.frameJoints) {
      if (!this.isFrameJointActive(joint)) continue;
      const stress = Math.abs(joint.lambda) / (dt * dt) / 900000;
      bendingStress.set(joint.memberA, Math.max(bendingStress.get(joint.memberA) ?? 0, stress));
      bendingStress.set(joint.memberB, Math.max(bendingStress.get(joint.memberB) ?? 0, stress));
    }

    let broken: BridgeMember | undefined;
    for (const member of this.members) {
      if (member.broken) continue;
      const material = MATERIALS[member.material];
      const force = Math.abs(member.lambda) / (dt * dt);
      const a = this.nodeById(member.a);
      const b = this.nodeById(member.b);
      const forceStress = force / material.capacity;
      const deckDeflectionLimit = this.level === 'suspension' ? 24 : 18;
      const deckDeflection = a && b && member.material === 'road'
        ? Math.abs(((a.y - a.baseY) + (b.y - b.baseY)) * 0.5) / deckDeflectionLimit
        : 0;
      member.stress = Math.max(forceStress, deckDeflection, bendingStress.get(member.id) ?? 0);
      if (member.stress > 1) member.overFrames += 1;
      else member.overFrames = Math.max(0, member.overFrames - 2);
      if (member.overFrames > 5) {
        member.broken = true;
        broken = member;
      }
    }

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
      const weightStep = material.weight * dt * dt * 0.5;
      const a = this.nodeById(member.a);
      const b = this.nodeById(member.b);
      if (a && !a.fixed) a.y += weightStep;
      if (b && !b.fixed) b.y += weightStep;
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
    const alpha = MATERIALS[member.material].compliance / (dt * dt);
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
    const currentAngle = signedAngle(a, b, c);
    const constraint = normalizeAngle(currentAngle - joint.restAngle);
    const epsilon = 0.01;
    const gradients = [a, b, c].map((node) => {
      node.x += epsilon;
      const angleX = signedAngle(a, b, c);
      node.x -= epsilon;
      node.y += epsilon;
      const angleY = signedAngle(a, b, c);
      node.y -= epsilon;
      return {
        x: normalizeAngle(angleX - currentAngle) / epsilon,
        y: normalizeAngle(angleY - currentAngle) / epsilon,
      };
    });

    let weightedGradient = 0;
    for (let i = 0; i < 3; i += 1) {
      if (nodes[i]!.fixed) continue;
      weightedGradient += gradients[i].x ** 2 + gradients[i].y ** 2;
    }
    if (weightedGradient < 1e-10) return;
    const alpha = 0.00000008 / (dt * dt);
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
      return this.hasCablePath([90, 330], [300, 135]) && this.hasCablePath([870, 330], [660, 135]);
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
      return [[90, 330], [150, 300], [300, 480], [660, 480], [810, 300], [870, 330]];
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
      });
    }
    return members;
  }

  private addMemberDirect(a: number, b: number, material: MaterialKey, behavior: BridgeMember['behavior'] = 'axial') {
    const na = this.nodeById(a)!;
    const nb = this.nodeById(b)!;
    const member: BridgeMember = {
      id: this.nextMemberId++,
      a,
      b,
      rest: Math.hypot(nb.x - na.x, nb.y - na.y) * (material === 'cable' ? 0.995 : 1),
      material,
      behavior,
      broken: false,
      stress: 0,
      lambda: 0,
      overFrames: 0,
    };
    this.members.push(member);
    return member;
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
    for (const node of this.nodes) {
      node.px = node.x;
      node.py = node.y;
    }
    for (const member of this.members) {
      member.broken = false;
      member.stress = 0;
      member.lambda = 0;
      member.overFrames = 0;
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
