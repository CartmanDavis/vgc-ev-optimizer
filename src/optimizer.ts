import { calculate } from '@smogon/calc';
import { Dex, StatsTable } from '@pkmn/dex';
import { CURRENT_GEN, MAXIMUM_EVS_TOTAL, MAXIMUM_EVS_PER_STAT } from './constants.js';
import {
  Constraint,
  DefensiveConstraint,
  OffensiveConstraint,
  SpeedConstraint,
  findMinDefEV,
  findMinSpeEV,
  findMaxSpeEV,
  satisfyOffensiveConstraint,
  offensiveStat,
  getDamageRolls,
  getDefensiveRoll,
  pokemonWithEvs,
} from './constraint.js';
import { Pokemon } from './pokemon.js';

export type EVSpread = Partial<StatsTable>;

export const STAT_KEYS: (keyof StatsTable)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const STAT_LABELS: Record<keyof StatsTable, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

export type NatureStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type NatureEffect =
  | { plus: NatureStat; minus: NatureStat }
  | { plus: null; minus: null };

type Modifier = 1 | 0 | -1;

const NATURE_STATS: NatureStat[] = ['atk', 'def', 'spa', 'spd', 'spe'];

export const ALL_NATURE_EFFECTS: NatureEffect[] = [
  { plus: null, minus: null },
  ...NATURE_STATS.flatMap(plus =>
    NATURE_STATS.filter(s => s !== plus).map(minus => ({ plus, minus } as NatureEffect))
  ),
];

// Maps (plus stat, minus stat) → nature name for use with @smogon/calc
const NATURE_TABLE: Record<NatureStat, Partial<Record<NatureStat, string>>> = {
  atk: { def: 'Lonely', spa: 'Adamant', spd: 'Naughty', spe: 'Brave' },
  def: { atk: 'Bold',   spa: 'Impish',  spd: 'Lax',     spe: 'Relaxed' },
  spa: { atk: 'Modest', def: 'Mild',    spd: 'Rash',    spe: 'Quiet' },
  spd: { atk: 'Calm',   def: 'Gentle',  spa: 'Careful', spe: 'Sassy' },
  spe: { atk: 'Timid',  def: 'Hasty',   spa: 'Jolly',   spd: 'Naive' },
};

// Representative nature names for stat computations: one nature that boosts stat, one that reduces it
const PLUS_NATURE: Record<NatureStat, string> = {
  atk: 'Adamant', def: 'Bold', spa: 'Modest', spd: 'Calm', spe: 'Timid',
};
const MINUS_NATURE: Record<NatureStat, string> = {
  atk: 'Bold', def: 'Adamant', spa: 'Calm', spd: 'Modest', spe: 'Brave',
};
const NEUTRAL_NATURE = 'Hardy';

function modifierNature(stat: NatureStat, mod: Modifier): string {
  if (mod === 1) return PLUS_NATURE[stat];
  if (mod === -1) return MINUS_NATURE[stat];
  return NEUTRAL_NATURE;
}

export function getNatureName(effect: NatureEffect): string {
  if (effect.plus === null) return 'Hardy';
  return NATURE_TABLE[effect.plus][effect.minus!] ?? 'Hardy';
}

export type Solution = {
  spreads: EVSpread[];
  satisfied: Constraint[];
  unsatisfied: Constraint[];
  nature: NatureEffect;
};

export function totalEVs(spread: EVSpread): number {
  return STAT_KEYS.reduce((sum, stat) => sum + (spread[stat] ?? 0), 0);
}

// Precomputed EVs per stat at each modifier level: [plus, neutral, minus]
type StatEVs = [number | null, number | null, number | null]; // indices: 0=plus, 1=neutral, 2=minus

function modIdx(mod: Modifier): 0 | 1 | 2 {
  return (mod === 1 ? 0 : mod === 0 ? 1 : 2) as 0 | 1 | 2;
}

// For defensive constraints sharing HP, precompute spreads at each (defMod, spdMod) pair.
// Returns a map from "defMod,spdMod" key to EVSpread[].
// Only emits a spread when at least one actual damage roll changes — adjacent EV values
// can produce identical rolls due to integer arithmetic, so EV-level deduplication is insufficient.
function precomputeDefensiveSpreads(
  base: Pokemon,
  physical: DefensiveConstraint[],
  special: DefensiveConstraint[],
): Map<string, EVSpread[]> {
  const result = new Map<string, EVSpread[]>();

  const mods: Modifier[] = [1, 0, -1];

  for (const defMod of mods) {
    for (const spdMod of mods) {
      const defNature = modifierNature('def', defMod);
      const spdNature = modifierNature('spd', spdMod);

      const spreads: EVSpread[] = [];
      const lastPhysRolls: number[] = new Array(physical.length).fill(Infinity);
      const lastSpecRolls: number[] = new Array(special.length).fill(Infinity);

      for (let hpEV = 0; hpEV <= 252; hpEV += 4) {
        let defEV = 0;
        let impossible = false;

        for (const c of physical) {
          const min = findMinDefEV(base, hpEV, c, defNature);
          if (min === null) { impossible = true; break; }
          defEV = Math.max(defEV, min);
        }
        if (impossible || defEV > MAXIMUM_EVS_PER_STAT) continue;

        let spdEV = 0;
        for (const c of special) {
          const min = findMinDefEV(base, hpEV, c, spdNature);
          if (min === null) { impossible = true; break; }
          spdEV = Math.max(spdEV, min);
        }
        if (impossible || spdEV > MAXIMUM_EVS_PER_STAT) continue;

        // Compute actual damage rolls for each constraint. The roll value depends only
        // on the defense stat, not HP — adjacent EV values can produce the same roll
        // due to integer arithmetic, so we skip if nothing changed.
        const physRolls = physical.map(c => {
          const defender = pokemonWithEvs(base, { hp: hpEV, def: defEV }, defNature);
          return getDefensiveRoll(getDamageRolls(calculate(CURRENT_GEN, c.set, defender, c.move, c.field).damage), c.rollThreshold);
        });
        const specRolls = special.map(c => {
          const defender = pokemonWithEvs(base, { hp: hpEV, spd: spdEV }, spdNature);
          return getDefensiveRoll(getDamageRolls(calculate(CURRENT_GEN, c.set, defender, c.move, c.field).damage), c.rollThreshold);
        });

        const improved = physRolls.some((r, i) => r < lastPhysRolls[i])
          || specRolls.some((r, i) => r < lastSpecRolls[i]);

        if (!improved) continue;

        physRolls.forEach((r, i) => { lastPhysRolls[i] = r; });
        specRolls.forEach((r, i) => { lastSpecRolls[i] = r; });

        const spread: EVSpread = {};
        if (hpEV > 0) spread.hp = hpEV;
        if (defEV > 0) spread.def = defEV;
        if (spdEV > 0) spread.spd = spdEV;
        spreads.push(spread);
      }

      result.set(`${defMod},${spdMod}`, spreads);
    }
  }

  return result;
}

// Precompute min EV for an offensive stat (atk or spa) at each modifier level.
function precomputeOffensiveEVs(
  pokemonSet: string,
  constraints: OffensiveConstraint[],
  stat: 'atk' | 'spa',
): StatEVs {
  const evs: StatEVs = [null, null, null];
  const mods: Modifier[] = [1, 0, -1];

  for (const mod of mods) {
    const nature = modifierNature(stat, mod);
    let maxEV = 0;
    let impossible = false;

    for (const c of constraints) {
      const result = satisfyOffensiveConstraint(pokemonSet, c, nature);
      if (result === null) { impossible = true; break; }
      maxEV = Math.max(maxEV, result[stat] ?? 0);
    }

    if (!impossible && maxEV <= MAXIMUM_EVS_PER_STAT) {
      evs[modIdx(mod)] = maxEV;
    }
  }

  return evs;
}

// Precompute speed range {min, max} at each spe modifier level.
// Returns [plus, neutral, minus] where each entry is {min, max} or null if impossible.
function precomputeSpeedRanges(
  base: Pokemon,
  faster: SpeedConstraint[],
  slower: SpeedConstraint[],
): Array<{ min: number; max: number } | null> {
  const mods: Modifier[] = [1, 0, -1];
  return mods.map(mod => {
    const nature = modifierNature('spe', mod);

    let minSpeEV = 0;
    for (const c of faster) {
      const min = findMinSpeEV(base, c, nature);
      if (min === null) return null;
      minSpeEV = Math.max(minSpeEV, min);
    }

    let maxSpeEV = 252;
    for (const c of slower) {
      const max = findMaxSpeEV(base, c, nature);
      if (max === null) return null;
      maxSpeEV = Math.min(maxSpeEV, max);
    }

    if (minSpeEV > maxSpeEV) return null;
    return { min: minSpeEV, max: maxSpeEV };
  });
}

function solveConstraints(pokemonSet: string, constraints: Constraint[]): Solution[] {
  const physical = constraints.filter((c): c is DefensiveConstraint =>
    c.type === 'defensive' && c.move.category === 'Physical'
  );
  const special = constraints.filter((c): c is DefensiveConstraint =>
    c.type === 'defensive' && c.move.category !== 'Physical'
  );
  const atkOffensive = constraints.filter((c): c is OffensiveConstraint =>
    c.type === 'offensive' && offensiveStat(c.move) === 'atk'
  );
  const spaOffensive = constraints.filter((c): c is OffensiveConstraint =>
    c.type === 'offensive' && offensiveStat(c.move) === 'spa'
  );
  const faster = constraints.filter((c): c is SpeedConstraint =>
    c.type === 'speed' && c.direction === 'faster'
  );
  const slower = constraints.filter((c): c is SpeedConstraint =>
    c.type === 'speed' && c.direction === 'slower'
  );

  const base = Pokemon.fromText(pokemonSet);

  const defensiveSpreadsMap = precomputeDefensiveSpreads(base, physical, special);
  const atkEVs = precomputeOffensiveEVs(pokemonSet, atkOffensive, 'atk');
  const spaEVs = precomputeOffensiveEVs(pokemonSet, spaOffensive, 'spa');
  const speRanges = precomputeSpeedRanges(base, faster, slower);

  const solutions: Solution[] = [];

  for (const natureEffect of ALL_NATURE_EFFECTS) {
    const { plus, minus } = natureEffect;

    const defMod: Modifier = plus === 'def' ? 1 : minus === 'def' ? -1 : 0;
    const spdMod: Modifier = plus === 'spd' ? 1 : minus === 'spd' ? -1 : 0;
    const atkMod: Modifier = plus === 'atk' ? 1 : minus === 'atk' ? -1 : 0;
    const spaMod: Modifier = plus === 'spa' ? 1 : minus === 'spa' ? -1 : 0;
    const speMod: Modifier = plus === 'spe' ? 1 : minus === 'spe' ? -1 : 0;

    const defSpreads = defensiveSpreadsMap.get(`${defMod},${spdMod}`) ?? [];
    if (physical.length > 0 || special.length > 0) {
      if (defSpreads.length === 0) continue;
    }

    const atkEV = atkOffensive.length > 0 ? atkEVs[modIdx(atkMod)] : 0;
    if (atkOffensive.length > 0 && atkEV === null) continue;

    const spaEV = spaOffensive.length > 0 ? spaEVs[modIdx(spaMod)] : 0;
    if (spaOffensive.length > 0 && spaEV === null) continue;

    const speRange = (faster.length > 0 || slower.length > 0)
      ? speRanges[modIdx(speMod)]
      : { min: 0, max: 252 };
    if (speRange === null) continue;

    const validSpeEVs: number[] =
      faster.length > 0 && slower.length > 0
        ? Array.from({ length: Math.floor((speRange.max - speRange.min) / 4) + 1 }, (_, i) => speRange.min + i * 4)
        : [speRange.min];

    const natureName = getNatureName(natureEffect);
    const spreadSets = defSpreads.length > 0 ? defSpreads : [{}];

    const valid: EVSpread[] = [];
    for (const defSpread of spreadSets) {
      for (const speEV of validSpeEVs) {
        const merged: Partial<StatsTable> = { ...defSpread };
        if (atkEV) merged.atk = Math.max(merged.atk ?? 0, atkEV);
        if (spaEV) merged.spa = Math.max(merged.spa ?? 0, spaEV);
        if (speEV > 0) merged.spe = Math.max(merged.spe ?? 0, speEV);

        let ok = true;
        for (const stat of STAT_KEYS) {
          if ((merged[stat] ?? 0) > MAXIMUM_EVS_PER_STAT) { ok = false; break; }
        }
        if (ok && totalEVs(merged) <= MAXIMUM_EVS_TOTAL) valid.push(merged);
      }
    }

    if (valid.length > 0) {
      valid.sort((a, b) => (b.hp ?? 0) - (a.hp ?? 0) || (a.spe ?? 0) - (b.spe ?? 0));
      solutions.push({
        spreads: valid,
        satisfied: constraints,
        unsatisfied: [],
        nature: natureEffect,
      });
    }
  }

  return solutions;
}

function subsetsOfSize<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size === arr.length) return [arr];
  const [first, ...rest] = arr;
  return [
    ...subsetsOfSize(rest, size - 1).map(s => [first, ...s]),
    ...subsetsOfSize(rest, size),
  ];
}

export function optimize(pokemonSet: string, constraints: Constraint[]): Solution[] {
  for (let size = constraints.length; size >= 1; size--) {
    const solutions: Solution[] = [];
    for (const subset of subsetsOfSize(constraints, size)) {
      const subSolutions = solveConstraints(pokemonSet, subset);
      for (const sol of subSolutions) {
        solutions.push({
          ...sol,
          unsatisfied: constraints.filter(c => !subset.includes(c)),
        });
      }
    }
    if (solutions.length > 0) return solutions;
  }
  return [];
}

export function formatEVSpread(spread: EVSpread, natureName?: string): string {
  const nature = natureName ? Dex.forGen(CURRENT_GEN).natures.get(natureName) : null;
  return STAT_KEYS.map(stat => {
    const ev = spread[stat] ?? 0;
    const mod = nature?.plus === stat ? '+' : nature?.minus === stat ? '-' : '';
    return `${ev}${mod} ${STAT_LABELS[stat]}`;
  }).join(' / ');
}
