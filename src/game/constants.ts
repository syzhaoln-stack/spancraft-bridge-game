import type { LevelKey, LoadCaseKey, MaterialKey } from './types';

export const SCENE_KEYS = {
  Boot: 'BootScene',
  Game: 'GameScene',
} as const;

export const ASSET_KEYS = {
  Sedan: 'sedan',
  Truck: 'truck',
  ManWalk1: 'man-walk-1',
  ManWalk2: 'man-walk-2',
  WomanWalk1: 'woman-walk-1',
  WomanWalk2: 'woman-walk-2',
  Click: 'click',
  Confirm: 'confirm',
  Error: 'error',
  MetalBreak: 'metal-break',
  WoodBreak: 'wood-break',
} as const;

export const LOAD_CASES: Record<LoadCaseKey, {
  name: string;
  detail: string;
  load: number;
  speed: number;
  count: number;
  spacing: number;
}> = {
  sedan: { name: '小汽车', detail: '轻载 · 适合第一次试验', load: 5800, speed: 62, count: 1, spacing: 0 },
  truck: { name: '重型卡车', detail: '重载 · 更考验主桁架', load: 9800, speed: 48, count: 1, spacing: 0 },
  crowd: { name: '通勤人群', detail: '多点移动荷载', load: 1200, speed: 34, count: 6, spacing: 27 },
};

export const LEVELS: Record<LevelKey, {
  number: string;
  name: string;
  shortName: string;
  mission: string;
  concept: string;
  hint: string;
  budget: number;
}> = {
  truss: {
    number: '01',
    name: '峡谷邮路 · 桁架桥',
    shortName: '桁架',
    mission: '用连续三角形把荷载送往两岸。',
    concept: '三角形稳定',
    hint: '斜撑把桥面的弯曲分解为杆件拉压。',
    budget: 2600,
  },
  arch: {
    number: '02',
    name: '石门峡 · 系杆拱桥',
    shortName: '拱桥',
    mission: '让拱肋以压力把桥面荷载推向两岸。',
    concept: '拱肋压弯',
    hint: '拱矢高约为跨度的 1/5；拱肋以轴压为主，并以截面抗弯约束局部变形。',
    budget: 5000,
  },
  cableStayed: {
    number: '03',
    name: '双塔港 · 斜拉桥',
    shortName: '斜拉',
    mission: '平衡主跨斜拉索与边跨背索。',
    concept: '主塔压弯',
    hint: '塔高约为主跨的 2/5；两侧索力在桥塔处平衡，塔柱截面承担压弯。',
    budget: 5800,
  },
  suspension: {
    number: '04',
    name: '大江口 · 悬索桥',
    shortName: '悬索',
    mission: '用边锚锁住主缆，再由吊杆托住桥面。',
    concept: '主缆与边锚',
    hint: '主缆垂跨比约为 1/5；边锚锁住拉力，桥塔截面承担主缆传来的压弯。',
    budget: 5200,
  },
};

export const WORLD = {
  width: 960,
  height: 540,
  leftAnchor: { x: 150, y: 300 },
  rightAnchor: { x: 810, y: 300 },
  grid: 20,
  budget: 2600,
} as const;

export const MATERIALS: Record<MaterialKey, {
  name: string;
  color: number;
  css: string;
  width: number;
  cost: number;
  compliance: number;
  capacity: number;
  weight: number;
}> = {
  road: { name: '桥面', color: 0x425a66, css: '#425a66', width: 11, cost: 1.25, compliance: 0.0000012, capacity: 150000, weight: 230 },
  wood: { name: '木材', color: 0xd58a4b, css: '#d58a4b', width: 7, cost: 0.9, compliance: 0.0000018, capacity: 52000, weight: 100 },
  steel: { name: '钢材', color: 0x7699a6, css: '#7699a6', width: 7, cost: 1.7, compliance: 0.00000035, capacity: 155000, weight: 170 },
  cable: { name: '缆索', color: 0xe6c65b, css: '#e6c65b', width: 3, cost: 1.1, compliance: 0.000001, capacity: 108000, weight: 35 },
};
