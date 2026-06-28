import type { BeamProfile, BeamSection, LevelKey } from './types';

const BASE_DEPTH = 33;
export const MIN_BEAM_DEPTH = 33;
export const MAX_BEAM_DEPTH = 66;
const BOX_AREA_FACTOR = 0.58;
const BOX_INERTIA_FACTOR = 0.86;

export const DEFAULT_BEAM_SECTIONS: Record<LevelKey, BeamSection> = {
  beam: { shape: 'solid', depth: 33, profile: 'constant' },
  truss: { shape: 'box', depth: 33, profile: 'constant' },
  arch: { shape: 'box', depth: 36, profile: 'constant' },
  cableStayed: { shape: 'box', depth: 54, profile: 'constant' },
  suspension: { shape: 'box', depth: 54, profile: 'constant' },
};

export function profileDepthMultiplier(profile: BeamProfile, x: number) {
  const t = clamp((x - 150) / 660, 0, 1);
  if (profile === 'midspan') {
    return 0.72 + 0.56 * (1 - Math.abs(2 * t - 1));
  }
  if (profile === 'piers') {
    const distanceToPier = Math.min(Math.abs(t - 0.25), Math.abs(t - 0.75));
    return 0.78 + 0.5 * Math.max(0, 1 - distanceToPier / 0.25);
  }
  return 1;
}

export function sectionDepthAt(section: BeamSection, x: number) {
  return clamp(section.depth * profileDepthMultiplier(section.profile, x), 33, 66);
}

export function sectionAreaRatioAt(section: BeamSection, x: number) {
  const depthRatio = sectionDepthAt(section, x) / BASE_DEPTH;
  return depthRatio * (section.shape === 'box' ? BOX_AREA_FACTOR : 1);
}

export function sectionInertiaRatioAt(section: BeamSection, x: number) {
  const depthRatio = sectionDepthAt(section, x) / BASE_DEPTH;
  return depthRatio ** 3 * (section.shape === 'box' ? BOX_INERTIA_FACTOR : 1);
}

export function sectionModulusRatioAt(section: BeamSection, x: number) {
  const depthRatio = sectionDepthAt(section, x) / BASE_DEPTH;
  return depthRatio ** 2 * (section.shape === 'box' ? BOX_INERTIA_FACTOR : 1);
}

export function sectionCostRatioAt(section: BeamSection, x: number) {
  const fabricationFactor = section.shape === 'box' ? 1.16 : 1;
  return sectionAreaRatioAt(section, x) * fabricationFactor;
}

export function averageSectionMetrics(section: BeamSection) {
  let area = 0;
  let inertia = 0;
  let modulus = 0;
  const samples = 13;
  for (let i = 0; i < samples; i += 1) {
    const x = 150 + (660 * i) / (samples - 1);
    area += sectionAreaRatioAt(section, x);
    inertia += sectionInertiaRatioAt(section, x);
    modulus += sectionModulusRatioAt(section, x);
  }
  return {
    weight: area / samples,
    stiffness: inertia / samples,
    capacity: modulus / samples,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
