import type { GameCommand, UIState } from './types';

const DEFAULT_STATE: UIState = {
  ready: false,
  mode: 'build',
  material: 'road',
  loadCase: 'sedan',
  level: 'beam',
  budget: 0,
  budgetMax: 2600,
  memberCount: 0,
  maxStress: 0,
  vehicleProgress: 0,
  hint: '装载示范桥，先看一次完整试车。',
  canUndo: false,
  hasBridge: false,
  beamSection: { shape: 'solid', depth: 33, profile: 'constant' },
  beamWeight: 100,
  beamStiffness: 100,
  beamCapacity: 100,
  beamStress: 0,
  indestructible: false,
  midspanSupport: false,
  buildTool: 'line',
  arcSpacing: 55,
};

class GameBridge extends EventTarget {
  private state = DEFAULT_STATE;

  command(command: GameCommand) {
    this.dispatchEvent(new CustomEvent<GameCommand>('command', { detail: command }));
  }

  publish(patch: Partial<UIState>) {
    this.state = { ...this.state, ...patch };
    this.dispatchEvent(new CustomEvent<UIState>('state', { detail: this.state }));
  }

  snapshot() {
    return this.state;
  }
}

export const gameBridge = new GameBridge();
