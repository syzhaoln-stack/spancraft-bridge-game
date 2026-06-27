import Phaser from 'phaser';
import { ASSET_KEYS, SCENE_KEYS } from '../constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.Boot);
  }

  preload() {
    this.load.image(ASSET_KEYS.Sedan, 'assets/sprites/sedan.png');
    this.load.image(ASSET_KEYS.Truck, 'assets/sprites/truck.png');
    this.load.image(ASSET_KEYS.ManWalk1, 'assets/sprites/man_walk1.png');
    this.load.image(ASSET_KEYS.ManWalk2, 'assets/sprites/man_walk2.png');
    this.load.image(ASSET_KEYS.WomanWalk1, 'assets/sprites/woman_walk1.png');
    this.load.image(ASSET_KEYS.WomanWalk2, 'assets/sprites/woman_walk2.png');
    this.load.audio(ASSET_KEYS.Click, 'assets/audio/click.ogg');
    this.load.audio(ASSET_KEYS.Confirm, 'assets/audio/confirm.ogg');
    this.load.audio(ASSET_KEYS.Error, 'assets/audio/error.ogg');
    this.load.audio(ASSET_KEYS.MetalBreak, 'assets/audio/metal-break.ogg');
    this.load.audio(ASSET_KEYS.WoodBreak, 'assets/audio/wood-break.ogg');
  }

  create() {
    for (const key of [
      ASSET_KEYS.Sedan,
      ASSET_KEYS.Truck,
      ASSET_KEYS.ManWalk1,
      ASSET_KEYS.ManWalk2,
      ASSET_KEYS.WomanWalk1,
      ASSET_KEYS.WomanWalk2,
    ]) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scene.start(SCENE_KEYS.Game);
  }
}
