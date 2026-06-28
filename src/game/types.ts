export type MaterialKey = 'road' | 'wood' | 'steel' | 'cable';
export type GameMode = 'build' | 'test' | 'success' | 'failure';
export type LoadCaseKey = 'sedan' | 'truck' | 'crowd';
export type LevelKey = 'beam' | 'truss' | 'arch' | 'cableStayed' | 'suspension';
export type BeamShape = 'solid' | 'box';
export type BeamProfile = 'constant' | 'midspan' | 'piers';
export type BuildTool = 'line' | 'arc';
export type ArcSpacing = 40 | 55 | 80 | 110;

export type BeamSection = {
  shape: BeamShape;
  depth: number;
  profile: BeamProfile;
};

export type BridgeNode = {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  baseX: number;
  baseY: number;
  fixed: boolean;
  supportY?: boolean;
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
  axialStress?: number;
  bendingStress?: number;
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
  beamSection: BeamSection;
  beamWeight: number;
  beamStiffness: number;
  beamCapacity: number;
  beamStress: number;
  indestructible: boolean;
  midspanSupport: boolean;
  buildTool: BuildTool;
  arcSpacing: ArcSpacing;
};

export type GameCommand =
  | { type: 'material'; material: MaterialKey }
  | { type: 'load-case'; loadCase: LoadCaseKey }
  | { type: 'level'; level: LevelKey }
  | { type: 'beam-section'; patch: Partial<BeamSection> }
  | { type: 'indestructible'; enabled: boolean }
  | { type: 'midspan-support'; enabled: boolean }
  | { type: 'build-tool'; tool: BuildTool }
  | { type: 'arc-spacing'; spacing: ArcSpacing }
  | { type: 'blueprint' }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'test' }
  | { type: 'stop' }
  | { type: 'sound'; enabled: boolean };
