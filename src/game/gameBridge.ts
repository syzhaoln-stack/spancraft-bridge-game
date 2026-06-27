import type { GameCommand, UIState } from './types';

const DEFAULT_STATE: UIState = {
  ready: false,
  mode: 'build',
  material: 'road',
  loadCase: 'sedan',
  level: 'truss',
  budget: 0,
  budgetMax: 2600,
  memberCount: 0,
  maxStress: 0,
  vehicleProgress: 0,
  hint: '装载示范桥，先看一次完整试车。',
  canUndo: false,
  hasBridge: false,
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
