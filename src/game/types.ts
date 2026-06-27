export type MaterialKey = 'road' | 'wood' | 'steel' | 'cable';
export type GameMode = 'build' | 'test' | 'success' | 'failure';
export type LoadCaseKey = 'sedan' | 'truck' | 'crowd';
export type LevelKey = 'truss' | 'arch' | 'cableStayed' | 'suspension';

export type BridgeNode = {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  baseX: number;
  baseY: number;
  fixed: boolean;
};

export type BridgeMember = {
  id: number;
  a: number;
  b: number;
  rest: number;
  material: MaterialKey;
  behavior: 'axial' | 'frame';
  broken: boolean;
  stress: number;
  lambda: number;
  overFrames: number;
};

export type UIState = {
  ready: boolean;
  mode: GameMode;
  material: MaterialKey;
  loadCase: LoadCaseKey;
  level: LevelKey;
  budget: number;
  budgetMax: number;
  memberCount: number;
  maxStress: number;
  vehicleProgress: number;
  hint: string;
  canUndo: boolean;
  hasBridge: boolean;
};

export type GameCommand =
  | { type: 'material'; material: MaterialKey }
  | { type: 'load-case'; loadCase: LoadCaseKey }
  | { type: 'level'; level: LevelKey }
  | { type: 'blueprint' }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'test' }
  | { type: 'stop' }
  | { type: 'sound'; enabled: boolean };
