import Phaser from 'phaser';
import { ASSET_KEYS, LEVELS, LOAD_CASES, MATERIALS, SCENE_KEYS, WORLD } from '../constants';
import { gameBridge } from '../gameBridge';
import type { BridgeMember, BridgeNode, GameCommand, LevelKey, MaterialKey } from '../types';
import { BridgePhysics } from '../systems/BridgePhysics';

// Visual-only exaggeration of the deformed shape (deflection) during load tests.
// Physics positions are unchanged; we only scale how far nodes appear to move from rest.
// Tuned per structural system so each reads honestly: the beam deck already sags a lot, so it
// is exaggerated the least; the cable-stayed pylon/deck barely move (very stiff cable net), so
// the side-span see-saw — tower leaning toward the load, main span heaving up — needs more
// gain to be legible. Levels not listed fall back to DEFORM_SCALE.
const DEFORM_SCALE = 2.1;
const LEVEL_DEFORM_SCALE: Partial<Record<LevelKey, number>> = {
  beam: 1.2,
  suspension: 1.5,
  cableStayed: 4.5,
};
// Main girder section depth is drawn at a fraction of its physical value so the deck reads slim.
const GIRDER_RENDER_SCALE = 0.34;
// Wall-clock speed-up of the load test: scales simulated time uniformly (vehicle + physics
// advance together), so crossings feel faster while the mechanics/breaking are unchanged.
const TIME_SCALE = 1.6;

export class GameScene extends Phaser.Scene {
  private bridge = new BridgePhysics();
  private bridgeGraphics!: Phaser.GameObjects.Graphics;
  private nodeGraphics!: Phaser.GameObjects.Graphics;
  private previewGraphics!: Phaser.GameObjects.Graphics;
  private waterGraphics!: Phaser.GameObjects.Graphics;
  private loadSprites: Phaser.GameObjects.Image[] = [];
  private levelLabels: Phaser.GameObjects.Text[] = [];
  private scenery: { obj: Phaser.GameObjects.Graphics; vx: number; baseY: number; bob: number; phase: number; min: number; max: number }[] = [];
  private dragStartId: number | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private accumulator = 0;
  private lastPublish = 0;
  private soundEnabled = true;
  private reducedMotion = false;
  private contextMenuHandler = (event: Event) => event.preventDefault();

  constructor() {
    super(SCENE_KEYS.Game);
  }

  create() {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.drawEnvironment();
    this.createScenery();
    this.waterGraphics = this.add.graphics().setDepth(2);
    this.bridgeGraphics = this.add.graphics().setDepth(10);
    this.nodeGraphics = this.add.graphics().setDepth(12);
    this.previewGraphics = this.add.graphics().setDepth(14);
    for (let i = 0; i < 6; i += 1) {
      this.loadSprites.push(this.add.image(this.bridge.car.x, this.bridge.car.y, ASSET_KEYS.Sedan)
        .setDepth(20 + i)
        .setVisible(false));
    }
    this.refreshLevelDecorations();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.game.canvas.addEventListener('contextmenu', this.contextMenuHandler);
    gameBridge.addEventListener('command', this.onCommand as EventListener);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown, this);
    this.publish('装载示范桥，先看一次完整试车。');
    gameBridge.publish({ ready: true });
  }

  update(time: number, deltaMs: number) {
    if (this.bridge.mode === 'test') {
      this.accumulator += Math.min(deltaMs / 1000, 0.04) * TIME_SCALE;
      const step = 1 / 120;
      while (this.accumulator >= step) {
        const events = this.bridge.step(step);
        this.accumulator -= step;
        if (events.broke) this.onMemberBreak(events.broke);
        if (events.finished) {
          this.onFinished(events.finished);
          break;
        }
      }
    }

    this.animateScenery(time, deltaMs);
    this.renderWater(time);
    this.renderBridge();
    this.renderLoads(time);

    if (time - this.lastPublish > 100) {
      this.publish();
      this.lastPublish = time;
    }
  }

  private onCommand = (event: CustomEvent<GameCommand>) => {
    const command = event.detail;
    if (command.type === 'material') {
      this.bridge.material = command.material;
      this.playSound(ASSET_KEYS.Click, 0.4);
      this.publish(`已选择${MATERIALS[command.material].name}。从一个圆形节点拖到另一个位置。`);
    } else if (command.type === 'load-case') {
      this.bridge.loadCase = command.loadCase;
      this.playSound(ASSET_KEYS.Click, 0.4);
      this.publish(`试验荷载已切换为${LOAD_CASES[command.loadCase].name}。`);
    } else if (command.type === 'beam-section') {
      if (this.bridge.setBeamSection(command.patch)) {
        this.playSound(ASSET_KEYS.Click, 0.32);
        this.publish('主梁截面已更新：梁高改变 I 与 W，空心率改变自重与材料用量。');
      }
    } else if (command.type === 'indestructible') {
      if (this.bridge.mode !== 'build') return;
      this.bridge.indestructible = command.enabled;
      this.playSound(ASSET_KEYS.Click, 0.35);
      this.publish(command.enabled
        ? '牢不可破已开启：保留受力颜色，但构件不会断裂。'
        : '牢不可破已关闭：恢复按强度与累计超载判定破坏。');
    } else if (command.type === 'midspan-support') {
      if (this.bridge.setMidspanSupport(command.enabled)) {
        this.playSound(ASSET_KEYS.Confirm, 0.45);
        this.publish(command.enabled
          ? '已设置跨中桥墩，简支梁变为两跨连续梁。'
          : '已移除跨中桥墩，恢复单跨梁桥。');
      }
    } else if (command.type === 'build-tool') {
      if (this.bridge.mode !== 'build') return;
      this.bridge.buildTool = command.tool;
      this.playSound(ASSET_KEYS.Click, 0.3);
      this.publish(command.tool === 'arc'
        ? '弧线工具：从起点拖到终点，按桥向等距自动分段；缆索下垂，钢材向上起拱。'
        : '直线工具：从节点拖到目标位置建造单根构件。');
    } else if (command.type === 'arc-spacing') {
      if (this.bridge.mode !== 'build') return;
      this.bridge.arcSpacing = command.spacing;
      this.publish(`弧线桥向分段距离设为约 ${command.spacing}px。`);
    } else if (command.type === 'level') {
      if (this.bridge.mode !== 'build') return;
      this.bridge.loadLevel(command.level);
      this.refreshLevelDecorations();
      this.playSound(ASSET_KEYS.Confirm, 0.55);
      this.publish(`${LEVELS[command.level].name}已装载。${LEVELS[command.level].hint}`);
    } else if (command.type === 'blueprint') {
      this.bridge.loadBlueprint();
      this.refreshLevelDecorations();
      this.playSound(ASSET_KEYS.Confirm, 0.55);
      this.publish(`${LEVELS[this.bridge.level].shortName}示范已重置。${LEVELS[this.bridge.level].hint}`);
    } else if (command.type === 'clear') {
      this.bridge.resetAnchors();
      this.refreshLevelDecorations();
      this.playSound(ASSET_KEYS.Click, 0.4);
      this.publish('构件已清空，关键支点和边锚保留。先用桥面连接两岸。');
    } else if (command.type === 'undo') {
      if (this.bridge.undo()) this.playSound(ASSET_KEYS.Click, 0.35);
      this.publish('已撤销上一步。');
    } else if (command.type === 'test') {
      const result = this.bridge.startTest();
      if (result.ok) {
        this.accumulator = 0;
        this.playSound(ASSET_KEYS.Confirm, 0.55);
      } else {
        this.playSound(ASSET_KEYS.Error, 0.45);
      }
      this.publish(result.reason);
    } else if (command.type === 'stop') {
      this.bridge.stopTest();
      this.publish('已回到施工模式，设计保持不变。');
    } else if (command.type === 'sound') {
      this.soundEnabled = command.enabled;
    }
  };

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.bridge.mode !== 'build') return;
    if (pointer.rightButtonDown()) {
      if (this.bridge.deleteNearest(pointer.worldX, pointer.worldY)) {
        this.playSound(ASSET_KEYS.Click, 0.4);
        this.publish('已拆除构件。右键可以继续快速拆除。');
      }
      return;
    }
    const node = this.bridge.startBuildAt(pointer.worldX, pointer.worldY);
    if (!node) {
      this.publish('请从节点或已有杆件上开始拖动；落点会自动生成铰接节点。');
      return;
    }
    this.dragStartId = node.id;
    this.pointerX = pointer.worldX;
    this.pointerY = pointer.worldY;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    this.pointerX = pointer.worldX;
    this.pointerY = pointer.worldY;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (this.dragStartId === null || this.bridge.mode !== 'build') return;
    const result = this.bridge.buildTool === 'arc'
      ? this.bridge.addArcFrom(this.dragStartId, pointer.worldX, pointer.worldY, this.bridge.material, this.bridge.arcSpacing)
      : this.bridge.addMemberFrom(this.dragStartId, pointer.worldX, pointer.worldY, this.bridge.material);
    this.dragStartId = null;
    if (result.ok) this.playSound(ASSET_KEYS.Click, 0.45);
    else this.playSound(ASSET_KEYS.Error, 0.32);
    this.publish(result.reason);
  }

  private renderBridge() {
    this.bridgeGraphics.clear();
    this.nodeGraphics.clear();
    this.previewGraphics.clear();

    const ordered = [...this.bridge.members].sort((a, b) => Number(a.material === 'road') - Number(b.material === 'road'));
    for (const member of ordered) this.drawMember(member);

    for (const node of this.bridge.nodes) {
      const nx = this.dnx(node);
      const ny = this.dny(node);
      if (node.supportY) {
        this.nodeGraphics.fillStyle(0x6f8991, 1);
        this.nodeGraphics.fillRect(node.x - 7, node.y + 12, 14, 168);
        this.nodeGraphics.fillStyle(0x294b5b, 1);
        this.nodeGraphics.fillRect(node.x - 24, 472, 48, 12);
        this.nodeGraphics.lineStyle(2, 0x18324a, 0.9);
        this.nodeGraphics.strokeRect(node.x - 7, node.y + 12, 14, 168);
        this.nodeGraphics.fillStyle(0xf1c75b, 1);
        this.nodeGraphics.fillTriangle(node.x, node.y + 4, node.x - 11, node.y + 18, node.x + 11, node.y + 18);
      }
      if (node.fixed) {
        if (node.y > 420) {
          this.nodeGraphics.fillStyle(0x294b5b, 1);
          this.nodeGraphics.fillRect(node.x - 18, node.y - 4, 36, 24);
          this.nodeGraphics.fillStyle(0x6f99a2, 1);
          this.nodeGraphics.fillRect(node.x - 23, node.y + 16, 46, 8);
          this.nodeGraphics.lineStyle(2, 0x18324a, 0.85);
          this.nodeGraphics.strokeRect(node.x - 18, node.y - 4, 36, 24);
        } else {
          this.nodeGraphics.fillStyle(0xf1c75b, 1);
          this.nodeGraphics.fillTriangle(node.x, node.y + 3, node.x - 13, node.y + 22, node.x + 13, node.y + 22);
          this.nodeGraphics.lineStyle(2, 0x18324a, 0.8);
          this.nodeGraphics.strokeTriangle(node.x, node.y + 3, node.x - 13, node.y + 22, node.x + 13, node.y + 22);
        }
      }
      this.nodeGraphics.fillStyle(node.fixed ? 0xf7d978 : 0xf5efe0, 1);
      this.nodeGraphics.fillCircle(nx, ny, node.fixed ? 7 : 5);
      this.nodeGraphics.lineStyle(2, 0x18324a, 1);
      this.nodeGraphics.strokeCircle(nx, ny, node.fixed ? 7 : 5);
    }

    if (this.dragStartId !== null) {
      const start = this.bridge.nodes.find((node) => node.id === this.dragStartId);
      if (start) {
        const material = MATERIALS[this.bridge.material];
        this.previewGraphics.lineStyle(material.width, material.color, 0.52);
        if (this.bridge.buildTool === 'arc') {
          const points = this.bridge.getArcPreview(
            start.id,
            this.pointerX,
            this.pointerY,
            this.bridge.material,
            this.bridge.arcSpacing,
          );
          if (points.length > 1) {
            this.previewGraphics.beginPath();
            this.previewGraphics.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 1) this.previewGraphics.lineTo(points[i].x, points[i].y);
            this.previewGraphics.strokePath();
            this.previewGraphics.fillStyle(material.color, 0.8);
            for (const point of points) this.previewGraphics.fillCircle(point.x, point.y, 4);
          }
        } else {
          const sx = Math.round(this.pointerX / WORLD.grid) * WORLD.grid;
          const sy = Math.round(this.pointerY / WORLD.grid) * WORLD.grid;
          this.previewGraphics.lineBetween(start.x, start.y, sx, sy);
          this.previewGraphics.fillStyle(material.color, 0.8);
          this.previewGraphics.fillCircle(sx, sy, 6);
        }
      }
    }
  }

  private renderLoads(time: number) {
    const poses = this.bridge.getVisualLoads();
    const walkingFrame = Math.floor(time / 170) % 2;
    for (let i = 0; i < this.loadSprites.length; i += 1) {
      const sprite = this.loadSprites[i];
      const pose = poses[i];
      if (!pose || this.bridge.mode === 'build') {
        sprite.setVisible(false);
        continue;
      }

      if (this.bridge.loadCase === 'sedan') {
        sprite.setTexture(ASSET_KEYS.Sedan).setScale(2.4);
      } else if (this.bridge.loadCase === 'truck') {
        sprite.setTexture(ASSET_KEYS.Truck).setScale(1.85);
      } else {
        const isWoman = i % 2 === 1;
        const frame = (walkingFrame + i) % 2;
        const texture = isWoman
          ? (frame ? ASSET_KEYS.WomanWalk2 : ASSET_KEYS.WomanWalk1)
          : (frame ? ASSET_KEYS.ManWalk2 : ASSET_KEYS.ManWalk1);
        sprite.setTexture(texture).setScale(2.25);
      }
      sprite
        .setVisible(true)
        .setPosition(pose.x, pose.y + this.deckExaggerationDelta(pose.x))
        .setRotation(pose.angle);
    }
  }

  private refreshLevelDecorations() {
    for (const label of this.levelLabels) label.destroy();
    this.levelLabels = [];
    const addLabel = (x: number, y: number, text: string) => {
      this.levelLabels.push(this.add.text(x, y, text, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#18324a',
        backgroundColor: 'rgba(247, 239, 218, 0.86)',
        padding: { x: 5, y: 3 },
      }).setOrigin(0.5).setDepth(18));
    };

    if (this.bridge.level === 'beam') {
      addLabel(480, 228, '主梁截面实验：A · I · W');
    } else if (this.bridge.level === 'arch') {
      addLabel(480, 128, '拱矢高 f / 跨度 L ≈ 1 / 5');
    } else if (this.bridge.level === 'cableStayed') {
      addLabel(118, 354, '边跨背索锚点');
      addLabel(842, 354, '边跨背索锚点');
      addLabel(480, 112, '塔高 ≈ 主跨 × 2 / 5');
      addLabel(480, 505, '塔柱贯通至海床基础');
    } else if (this.bridge.level === 'suspension') {
      addLabel(44, 432, '边跨锚碇 A');
      addLabel(916, 432, '边跨锚碇 B');
      addLabel(480, 108, '主缆垂跨比 ≈ 1 / 5');
      addLabel(480, 505, '塔柱贯通至海床基础');
    }
  }

  private get deformScale() {
    if (this.bridge.mode === 'build') return 1;
    return LEVEL_DEFORM_SCALE[this.bridge.level] ?? DEFORM_SCALE;
  }

  // Apparent node position: rest position plus the exaggerated displacement.
  private dnx(node: BridgeNode) {
    return node.baseX + (node.x - node.baseX) * this.deformScale;
  }

  private dny(node: BridgeNode) {
    return node.baseY + (node.y - node.baseY) * this.deformScale;
  }

  // Vertical offset added to a load sprite so it rides the exaggerated deck instead of the real one.
  private deckExaggerationDelta(x: number) {
    if (this.deformScale === 1) return 0;
    let best: { a: BridgeNode; b: BridgeNode; d: number } | null = null;
    for (const member of this.bridge.members) {
      if (member.material !== 'road' || member.broken) continue;
      const a = this.bridge.nodes.find((node) => node.id === member.a);
      const b = this.bridge.nodes.find((node) => node.id === member.b);
      if (!a || !b) continue;
      if (x < Math.min(a.x, b.x) - 2 || x > Math.max(a.x, b.x) + 2) continue;
      const d = Math.abs(x - (a.x + b.x) * 0.5);
      if (!best || d < best.d) best = { a, b, d };
    }
    if (!best) return 0;
    const { a, b } = best;
    const t = Math.abs(b.x - a.x) < 0.001 ? 0.5 : Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
    const realY = a.y + (b.y - a.y) * t;
    const shownY = this.dny(a) + (this.dny(b) - this.dny(a)) * t;
    return shownY - realY;
  }

  private drawMember(member: BridgeMember) {
    const a = this.bridge.nodes.find((node) => node.id === member.a);
    const b = this.bridge.nodes.find((node) => node.id === member.b);
    if (!a || !b) return;
    const ax = this.dnx(a);
    const ay = this.dny(a);
    const bx = this.dnx(b);
    const by = this.dny(b);
    const material = MATERIALS[member.material];
    const memberWidth = material.width + (member.behavior === 'frame' ? 4 : 0);
    const testMode = this.bridge.mode !== 'build';
    const color = testMode ? stressColor(member.stress) : material.color;

    if (member.material === 'road') {
      this.drawGirderMember(ax, ay, bx, by, color, member.broken);
      return;
    }

    if (member.broken) {
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5;
      const gapX = (bx - ax) * 0.04;
      const gapY = (by - ay) * 0.04;
      this.drawBeamLine(ax, ay, mx - gapX, my - gapY, memberWidth, color, member.material);
      this.drawBeamLine(mx + gapX, my + gapY, bx, by, memberWidth, color, member.material);
      return;
    }
    this.drawBeamLine(ax, ay, bx, by, memberWidth, color, member.material);
    if (member.behavior === 'frame') {
      this.bridgeGraphics.lineStyle(2, testMode ? color : 0xdce8e5, 0.75);
      this.bridgeGraphics.lineBetween(ax, ay, bx, by);
    }
  }

  private drawGirderMember(ax: number, ay: number, bx: number, by: number, color: number, broken: boolean) {
    const depthA = this.bridge.getGirderDepth(ax) * GIRDER_RENDER_SCALE;
    const depthB = this.bridge.getGirderDepth(bx) * GIRDER_RENDER_SCALE;
    if (!broken) {
      this.drawGirderSegment(ax, ay, depthA, bx, by, depthB, color, true);
      return;
    }
    const gapStart = 0.46;
    const gapEnd = 0.54;
    const x1 = ax + (bx - ax) * gapStart;
    const y1 = ay + (by - ay) * gapStart;
    const d1 = depthA + (depthB - depthA) * gapStart;
    const x2 = ax + (bx - ax) * gapEnd;
    const y2 = ay + (by - ay) * gapEnd;
    const d2 = depthA + (depthB - depthA) * gapEnd;
    this.drawGirderSegment(ax, ay, depthA, x1, y1, d1, color, true);
    this.drawGirderSegment(x2, y2, d2, bx, by, depthB, color, true);
  }

  private drawGirderSegment(
    ax: number,
    ay: number,
    depthA: number,
    bx: number,
    by: number,
    depthB: number,
    color: number,
    showLane: boolean,
  ) {
    this.bridgeGraphics.fillStyle(0x173044, 0.42);
    this.bridgeGraphics.beginPath();
    this.bridgeGraphics.moveTo(ax + 3, ay + 4);
    this.bridgeGraphics.lineTo(bx + 3, by + 4);
    this.bridgeGraphics.lineTo(bx + 3, by + depthB + 5);
    this.bridgeGraphics.lineTo(ax + 3, ay + depthA + 5);
    this.bridgeGraphics.closePath();
    this.bridgeGraphics.fillPath();

    this.bridgeGraphics.fillStyle(color, 1);
    this.bridgeGraphics.lineStyle(2, 0x18324a, 0.92);
    this.bridgeGraphics.beginPath();
    this.bridgeGraphics.moveTo(ax, ay);
    this.bridgeGraphics.lineTo(bx, by);
    this.bridgeGraphics.lineTo(bx, by + depthB);
    this.bridgeGraphics.lineTo(ax, ay + depthA);
    this.bridgeGraphics.closePath();
    this.bridgeGraphics.fillPath();
    this.bridgeGraphics.strokePath();

    if (this.bridge.beamSection.shape === 'box') {
      this.bridgeGraphics.fillStyle(0x18324a, 0.5);
      this.bridgeGraphics.beginPath();
      this.bridgeGraphics.moveTo(ax + 2, ay + depthA * 0.34);
      this.bridgeGraphics.lineTo(bx - 2, by + depthB * 0.34);
      this.bridgeGraphics.lineTo(bx - 2, by + depthB * 0.7);
      this.bridgeGraphics.lineTo(ax + 2, ay + depthA * 0.7);
      this.bridgeGraphics.closePath();
      this.bridgeGraphics.fillPath();
    }

    this.bridgeGraphics.lineStyle(2, 0xf6e6b5, 0.88);
    this.bridgeGraphics.lineBetween(ax, ay, bx, by);
    if (!showLane) return;
    const length = Math.hypot(bx - ax, by - ay);
    const count = Math.max(1, Math.floor(length / 22));
    for (let i = 0; i < count; i += 1) {
      const t1 = (i + 0.2) / count;
      const t2 = (i + 0.65) / count;
      this.bridgeGraphics.lineBetween(
        ax + (bx - ax) * t1,
        ay + (by - ay) * t1,
        ax + (bx - ax) * t2,
        ay + (by - ay) * t2,
      );
    }
  }

  private drawBeamLine(ax: number, ay: number, bx: number, by: number, width: number, color: number, material: MaterialKey) {
    this.bridgeGraphics.lineStyle(width + 4, 0x173044, 0.48);
    this.bridgeGraphics.lineBetween(ax + 3, ay + 4, bx + 3, by + 4);
    this.bridgeGraphics.lineStyle(width, color, 1);
    this.bridgeGraphics.lineBetween(ax, ay, bx, by);
    if (material === 'road') {
      this.bridgeGraphics.lineStyle(2, 0xf6e6b5, 0.86);
      const length = Math.hypot(bx - ax, by - ay);
      const count = Math.max(1, Math.floor(length / 22));
      for (let i = 0; i < count; i += 1) {
        const t1 = (i + 0.2) / count;
        const t2 = (i + 0.65) / count;
        this.bridgeGraphics.lineBetween(
          ax + (bx - ax) * t1,
          ay + (by - ay) * t1,
          ax + (bx - ax) * t2,
          ay + (by - ay) * t2,
        );
      }
    }
  }

  private drawEnvironment() {
    const sky = this.add.graphics().setDepth(0);
    const bands = 18;
    for (let i = 0; i < bands; i += 1) {
      const t = i / (bands - 1);
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x9ed7d5),
        Phaser.Display.Color.ValueToColor(0xf8d9a1),
        bands - 1,
        i,
      );
      sky.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      sky.fillRect(0, (300 / bands) * i, WORLD.width, 300 / bands + 1);
    }

    sky.fillStyle(0xf5ead1, 0.72);
    sky.fillCircle(760, 92, 38);

    sky.fillStyle(0x78939a, 0.38);
    sky.fillTriangle(280, 290, 465, 112, 630, 290);
    sky.fillStyle(0x587888, 0.36);
    sky.fillTriangle(30, 290, 250, 155, 430, 290);
    sky.fillStyle(0x375c70, 0.22);
    for (let x = 20; x < 940; x += 32) {
      const h = 18 + ((x * 17) % 56);
      sky.fillRect(x, 290 - h, 22, h);
    }

    sky.fillStyle(0x93624d, 1);
    sky.fillTriangle(0, 244, 150, 280, 160, 540);
    sky.fillRect(0, 280, 155, 260);
    sky.fillStyle(0xbd7a55, 1);
    sky.fillTriangle(960, 238, 810, 280, 800, 540);
    sky.fillRect(810, 280, 150, 260);
    sky.fillStyle(0xe4ae70, 0.46);
    sky.fillTriangle(0, 244, 150, 280, 0, 325);
    sky.fillTriangle(960, 238, 810, 280, 960, 330);

    sky.fillStyle(0x2b5667, 1);
    sky.fillRect(0, 300, 150, 13);
    sky.fillRect(810, 300, 150, 13);
    sky.lineStyle(2, 0xf3cf72, 0.9);
    sky.lineBetween(20, 299, 142, 299);
    sky.lineBetween(818, 299, 940, 299);

    this.add.text(42, 255, '西岸工地', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px', color: '#f7e9c8', fontStyle: 'bold' }).setDepth(3);
    this.add.text(842, 255, '东岸验收', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px', color: '#f7e9c8', fontStyle: 'bold' }).setDepth(3);
  }

  private createScenery() {
    const clouds = [
      { x: 150, y: 88, s: 0.85, v: 5 },
      { x: 470, y: 132, s: 0.55, v: 8 },
      { x: 720, y: 62, s: 0.62, v: 4 },
    ];
    for (const c of clouds) {
      const g = this.add.graphics().setDepth(1);
      drawCloud(g, 0, 0, c.s);
      g.setPosition(c.x, c.y);
      this.scenery.push({ obj: g, vx: c.v, baseY: c.y, bob: 0, phase: 0, min: -130, max: 1050 });
    }

    const balloon = this.add.graphics().setDepth(1);
    this.drawBalloon(balloon);
    balloon.setPosition(330, 106);
    this.scenery.push({ obj: balloon, vx: 9, baseY: 106, bob: 9, phase: 0, min: -60, max: 1020 });

    const boats = [
      { x: 280, y: 410, v: 13 },
      { x: 620, y: 432, v: -9 },
    ];
    for (const b of boats) {
      const g = this.add.graphics().setDepth(3);
      this.drawBoat(g, b.v < 0);
      g.setPosition(b.x, b.y);
      this.scenery.push({ obj: g, vx: b.v, baseY: b.y, bob: 2.2, phase: Math.random() * 6.28, min: 168, max: 792 });
    }
  }

  private animateScenery(time: number, deltaMs: number) {
    if (this.reducedMotion) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    for (const s of this.scenery) {
      s.obj.x += s.vx * dt;
      if (s.vx > 0 && s.obj.x > s.max) s.obj.x = s.min;
      else if (s.vx < 0 && s.obj.x < s.min) s.obj.x = s.max;
      s.obj.y = s.baseY + Math.sin(time * 0.001 + s.phase) * s.bob;
    }
  }

  private drawBalloon(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0xe96f51, 1);
    g.fillEllipse(0, 0, 32, 38);
    g.fillStyle(0xf2c14e, 1);
    g.fillEllipse(0, 0, 11, 38);
    g.fillStyle(0xb84735, 1);
    g.fillTriangle(-6, 17, 6, 17, 0, 22);
    g.lineStyle(1, 0x18324a, 0.65);
    g.lineBetween(-7, 17, -3, 25);
    g.lineBetween(7, 17, 3, 25);
    g.fillStyle(0x8a5d33, 1);
    g.fillRect(-5, 25, 10, 7);
  }

  private drawBoat(g: Phaser.GameObjects.Graphics, flip: boolean) {
    const dir = flip ? -1 : 1;
    g.fillStyle(0x2f5360, 1);
    g.beginPath();
    g.moveTo(-13, 0);
    g.lineTo(13, 0);
    g.lineTo(9, 7);
    g.lineTo(-9, 7);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, 0x2a3b44, 1);
    g.lineBetween(0, -15, 0, 0);
    g.fillStyle(0xf2ecd9, 1);
    g.fillTriangle(0, -15, 0, -2, dir * 10, -2);
  }

  private renderWater(time: number) {
    this.waterGraphics.clear();
    this.waterGraphics.fillStyle(0x367f91, 1);
    this.waterGraphics.fillRect(150, 405, 660, 135);
    this.waterGraphics.fillStyle(0x64b0ae, 0.34);
    for (let row = 0; row < 5; row += 1) {
      const y = 424 + row * 23;
      for (let x = 160; x < 800; x += 42) {
        const motionTime = this.reducedMotion ? 0 : time;
        const offset = Math.sin(motionTime * 0.0016 + x * 0.025 + row) * 7;
        this.waterGraphics.fillRect(x + offset, y, 22, 2);
      }
    }
  }

  private onMemberBreak(member: BridgeMember) {
    this.playSound(member.material === 'wood' ? ASSET_KEYS.WoodBreak : ASSET_KEYS.MetalBreak, 0.62);
    if (!this.reducedMotion) this.cameras.main.shake(110, 0.004);
    const a = this.bridge.nodes.find((node) => node.id === member.a);
    const b = this.bridge.nodes.find((node) => node.id === member.b);
    if (!a || !b) return;
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    for (let i = 0; i < 7; i += 1) {
      const spark = this.add.circle(mx, my, 2 + (i % 2), i % 2 ? 0xf5d467 : 0xf47d5b, 1).setDepth(30);
      this.tweens.add({
        targets: spark,
        x: mx + Phaser.Math.Between(-36, 36),
        y: my + Phaser.Math.Between(-24, 42),
        alpha: 0,
        duration: this.reducedMotion ? 1 : 380,
        ease: 'Cubic.Out',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private onFinished(result: 'success' | 'failure') {
    if (result === 'success') {
      this.playSound(ASSET_KEYS.Confirm, 0.8);
      if (!this.reducedMotion) this.cameras.main.flash(260, 245, 213, 103, false);
      this.createConfetti();
      this.publish(`加载成功！${LEVELS[this.bridge.level].hint}`);
    } else {
      this.playSound(ASSET_KEYS.Error, 0.75);
      this.publish(this.bridge.level === 'beam'
        ? '主梁弯曲破坏。试着提高梁高，或用空心箱梁与跨中加高把材料放到更有效的位置。'
        : '车辆落水了。查看最先变红的构件，补一根斜撑再试。');
    }
  }

  private createConfetti() {
    if (this.reducedMotion) return;
    const colors = [0xf47d5b, 0xf1c75b, 0x6bb3a8, 0xf5efe0];
    for (let i = 0; i < 28; i += 1) {
      const piece = this.add.rectangle(820, 240, 5, 9, colors[i % colors.length]).setDepth(40);
      this.tweens.add({
        targets: piece,
        x: 820 + Phaser.Math.Between(-150, 100),
        y: 240 + Phaser.Math.Between(-120, 190),
        angle: Phaser.Math.Between(-240, 240),
        alpha: 0,
        duration: Phaser.Math.Between(700, 1200),
        ease: 'Cubic.Out',
        onComplete: () => piece.destroy(),
      });
    }
  }

  private publish(hint?: string) {
    const beamMetrics = this.bridge.beamMetrics;
    gameBridge.publish({
      mode: this.bridge.mode,
      material: this.bridge.material,
      loadCase: this.bridge.loadCase,
      level: this.bridge.level,
      budget: Math.round(this.bridge.budgetUsed),
      budgetMax: this.bridge.budgetMax,
      memberCount: this.bridge.members.length,
      maxStress: Math.round(this.bridge.peakStress * 100),
      vehicleProgress: Math.round(this.bridge.car.progress * 100),
      hint: hint ?? gameBridge.snapshot().hint,
      canUndo: this.bridge.canUndo,
      hasBridge: this.bridge.hasBridge,
      beamSection: { ...this.bridge.beamSection },
      beamWeight: Math.round(beamMetrics.weight * 100),
      beamStiffness: Math.round(beamMetrics.stiffness * 100),
      beamCapacity: Math.round(beamMetrics.capacity * 100),
      beamStress: Math.round(this.bridge.peakGirderStress * 100),
      indestructible: this.bridge.indestructible,
      midspanSupport: this.bridge.hasMidspanSupport,
      buildTool: this.bridge.buildTool,
      arcSpacing: this.bridge.arcSpacing,
    });
  }

  private playSound(key: string, volume: number) {
    if (this.soundEnabled && this.cache.audio.exists(key)) this.sound.play(key, { volume });
  }

  private onShutdown() {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.game.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
    gameBridge.removeEventListener('command', this.onCommand as EventListener);
    this.time.removeAllEvents();
    this.tweens.killAll();
    for (const label of this.levelLabels) label.destroy();
    this.levelLabels = [];
  }
}

function stressColor(stress: number) {
  if (stress < 0.55) return 0x55b78b;
  if (stress < 0.82) return 0xe0bd4d;
  if (stress < 1) return 0xee824c;
  return 0xe24d4d;
}

function drawCloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
  graphics.fillStyle(0xf8f0da, 0.76);
  graphics.fillCircle(x, y, 25 * scale);
  graphics.fillCircle(x + 28 * scale, y - 8 * scale, 32 * scale);
  graphics.fillCircle(x + 65 * scale, y, 24 * scale);
  graphics.fillRect(x, y, 65 * scale, 22 * scale);
}
