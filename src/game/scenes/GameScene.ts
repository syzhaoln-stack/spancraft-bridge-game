import Phaser from 'phaser';
import { ASSET_KEYS, LEVELS, LOAD_CASES, MATERIALS, SCENE_KEYS, WORLD } from '../constants';
import { gameBridge } from '../gameBridge';
import type { BridgeMember, GameCommand, MaterialKey } from '../types';
import { BridgePhysics } from '../systems/BridgePhysics';

export class GameScene extends Phaser.Scene {
  private bridge = new BridgePhysics();
  private bridgeGraphics!: Phaser.GameObjects.Graphics;
  private nodeGraphics!: Phaser.GameObjects.Graphics;
  private previewGraphics!: Phaser.GameObjects.Graphics;
  private waterGraphics!: Phaser.GameObjects.Graphics;
  private loadSprites: Phaser.GameObjects.Image[] = [];
  private levelLabels: Phaser.GameObjects.Text[] = [];
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
      this.accumulator += Math.min(deltaMs / 1000, 0.04);
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
    const result = this.bridge.addMemberFrom(
      this.dragStartId,
      pointer.worldX,
      pointer.worldY,
      this.bridge.material,
    );
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
      this.nodeGraphics.fillCircle(node.x, node.y, node.fixed ? 7 : 5);
      this.nodeGraphics.lineStyle(2, 0x18324a, 1);
      this.nodeGraphics.strokeCircle(node.x, node.y, node.fixed ? 7 : 5);
    }

    if (this.dragStartId !== null) {
      const start = this.bridge.nodes.find((node) => node.id === this.dragStartId);
      if (start) {
        const sx = Math.round(this.pointerX / WORLD.grid) * WORLD.grid;
        const sy = Math.round(this.pointerY / WORLD.grid) * WORLD.grid;
        const material = MATERIALS[this.bridge.material];
        this.previewGraphics.lineStyle(material.width, material.color, 0.52);
        this.previewGraphics.lineBetween(start.x, start.y, sx, sy);
        this.previewGraphics.fillStyle(material.color, 0.8);
        this.previewGraphics.fillCircle(sx, sy, 6);
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
        .setPosition(pose.x, pose.y)
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

    if (this.bridge.level === 'arch') {
      addLabel(480, 128, '拱矢高 f / 跨度 L ≈ 1 / 5');
    } else if (this.bridge.level === 'cableStayed') {
      addLabel(118, 354, '边跨背索锚点');
      addLabel(842, 354, '边跨背索锚点');
      addLabel(480, 112, '塔高 ≈ 主跨 × 2 / 5');
      addLabel(480, 505, '塔柱贯通至海床基础');
    } else if (this.bridge.level === 'suspension') {
      addLabel(90, 356, '边锚 A');
      addLabel(870, 356, '边锚 B');
      addLabel(480, 108, '主缆垂跨比 ≈ 1 / 5');
      addLabel(480, 505, '塔柱贯通至海床基础');
    }
  }

  private drawMember(member: BridgeMember) {
    const a = this.bridge.nodes.find((node) => node.id === member.a);
    const b = this.bridge.nodes.find((node) => node.id === member.b);
    if (!a || !b) return;
    const material = MATERIALS[member.material];
    const memberWidth = material.width + (member.behavior === 'frame' ? 4 : 0);
    const testMode = this.bridge.mode !== 'build';
    const color = testMode ? stressColor(member.stress) : material.color;

    if (member.broken) {
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const gapX = (b.x - a.x) * 0.04;
      const gapY = (b.y - a.y) * 0.04;
      this.drawBeamLine(a.x, a.y, mx - gapX, my - gapY, memberWidth, color, member.material);
      this.drawBeamLine(mx + gapX, my + gapY, b.x, b.y, memberWidth, color, member.material);
      return;
    }
    this.drawBeamLine(a.x, a.y, b.x, b.y, memberWidth, color, member.material);
    if (member.behavior === 'frame') {
      this.bridgeGraphics.lineStyle(2, testMode ? color : 0xdce8e5, 0.75);
      this.bridgeGraphics.lineBetween(a.x, a.y, b.x, b.y);
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
    drawCloud(sky, 170, 95, 0.7);
    drawCloud(sky, 570, 145, 0.48);

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
      this.publish('车辆落水了。查看最先变红的构件，补一根斜撑再试。');
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
    gameBridge.publish({
      mode: this.bridge.mode,
      material: this.bridge.material,
      loadCase: this.bridge.loadCase,
      level: this.bridge.level,
      budget: Math.round(this.bridge.budgetUsed),
      budgetMax: this.bridge.budgetMax,
      memberCount: this.bridge.members.length,
      maxStress: Math.round(this.bridge.maxStress * 100),
      vehicleProgress: Math.round(this.bridge.car.progress * 100),
      hint: hint ?? gameBridge.snapshot().hint,
      canUndo: this.bridge.canUndo,
      hasBridge: this.bridge.hasBridge,
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
