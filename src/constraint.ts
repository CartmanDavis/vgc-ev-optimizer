import { readFileSync } from 'fs';

import z from 'zod';

import { calculate, Field, Move } from "@smogon/calc";
import { CURRENT_GEN, CONSTRAINTS_DIR } from './constants.js';

import { Pokemon } from './pokemon.js';

import { StatsTable } from '@pkmn/dex';

const damageConstraintBase = z.object({
  hits: z.number().min(0).default(1),
  set: z.string(),
  move: z.string(),
  field: z.object({}).passthrough().default({}),
  rollThreshold: z.number().default(100),
});

const constraintSchema = z.discriminatedUnion('type', [
  damageConstraintBase.extend({ type: z.literal('defensive') }),
  damageConstraintBase.extend({ type: z.literal('offensive') }),
  z.object({
    type: z.literal('speed'),
    set: z.string(),
    tie: z.boolean().default(false),
    direction: z.enum(['faster', 'slower']).default('faster'),
  }),
]);

type DamageConstraint = {
  hits: number;
  set: Pokemon;
  move: Move;
  field: Field;
  rollThreshold: number;
};

export type DefensiveConstraint = DamageConstraint & { type: 'defensive' };
export type OffensiveConstraint = DamageConstraint & { type: 'offensive' };
export type SpeedConstraint = {
  type: 'speed';
  set: Pokemon;
  tie: boolean;
  direction: 'faster' | 'slower';
};

export type Constraint = DefensiveConstraint | OffensiveConstraint | SpeedConstraint;

export function describeConstraint(c: Constraint): string {
  if (c.type === 'defensive') return `Survive ${c.set.name}'s ${c.move.name}${c.hits > 1 ? ` ×${c.hits}` : ''}`;
  if (c.type === 'offensive') return `KO ${c.set.name} with ${c.move.name}${c.hits > 1 ? ` ×${c.hits}` : ''}`;
  return `${c.direction === 'faster' ? 'Outspeed' : 'Underspeed'} ${c.set.name}${c.tie ? ' (tie)' : ''}`;
}

export function readFileConstraints(fileName: string): Constraint {
  const buff = readFileSync(CONSTRAINTS_DIR + fileName, 'utf-8');
  const asJson = JSON.parse(buff);
  const parsed = constraintSchema.parse(asJson);

  if (parsed.type === 'speed') {
    return {
      type: 'speed',
      set: Pokemon.fromText(parsed.set),
      tie: parsed.tie,
      direction: parsed.direction,
    };
  }

  return {
    type: parsed.type,
    hits: parsed.hits,
    field: new Field(parsed.field),
    move: new Move(CURRENT_GEN, parsed.move),
    rollThreshold: parsed.rollThreshold,
    set: Pokemon.fromText(parsed.set),
  };
}

export function pokemonWithEvs(base: Pokemon, evs: Partial<StatsTable>, nature?: string): Pokemon {
  return new Pokemon(CURRENT_GEN, base.name, {
    level: base.level,
    nature: nature ?? base.nature,
    ability: base.ability,
    item: base.item,
    moves: base.moves,
    ivs: base.ivs,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs },
  });
}

type Damage = number | number[] | [number[], number[]];

const DAMAGE_ROLLS = 16;

export function getDamageRolls(damage: Damage): number[] {
  if (typeof damage === 'number') return [damage];
  if (typeof damage[0] === 'number') return [...(damage as number[])].sort((a, b) => a - b);
  const [a, b] = damage as [number[], number[]];
  return a.map((d, i) => d + b[i]).sort((a, b) => a - b);
}

// rollThreshold=100 → use max roll (index 15); 93.75 → tolerate 1 KO → index 14
export function getDefensiveRoll(rolls: number[], rollThreshold: number): number {
  const toleratedKOs = Math.floor((1 - rollThreshold / 100) * DAMAGE_ROLLS);
  const idx = Math.max(0, Math.min(rolls.length - 1, DAMAGE_ROLLS - 1 - toleratedKOs));
  return rolls[idx];
}

// rollThreshold=100 → use min roll (index 0); 6.25 → only best roll needed → index 15
function getOffensiveRoll(rolls: number[], rollThreshold: number): number {
  const idx = Math.min(rolls.length - 1, Math.floor((1 - rollThreshold / 100) * DAMAGE_ROLLS));
  return rolls[Math.max(0, idx)];
}

export function offensiveStat(move: Move): 'atk' | 'spa' {
  return move.category === 'Physical' ? 'atk' : 'spa';
}

function defensiveStat(move: Move): 'def' | 'spd' {
  return move.category === 'Physical' ? 'def' : 'spd';
}

// Finds the minimum EV in [0, 252] (steps of 4) where check returns true.
// Assumes monotonicity. Returns null if 252 EVs still don't satisfy the check.
function binarySearchEV(check: (ev: number) => boolean): number | null {
  let lo = 0, hi = 63; // indices; ev = index * 4
  if (!check(252)) return null;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (check(mid * 4)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo * 4;
}

// Returns the minimum defStat EV (or null) for a fixed hpEV value.
export function findMinDefEV(base: Pokemon, hpEV: number, constraint: DefensiveConstraint, nature?: string): number | null {
  const { hits, set: attacker, move, field, rollThreshold } = constraint;
  const defStat = defensiveStat(move);
  return binarySearchEV((defEV) => {
    const defender = pokemonWithEvs(base, { hp: hpEV, [defStat]: defEV }, nature);
    const result = calculate(CURRENT_GEN, attacker, defender, move, field);
    const damage = getDefensiveRoll(getDamageRolls(result.damage), rollThreshold);
    return damage * hits < defender.maxHP();
  });
}

export function satisfyDefensiveConstraint(name: string, constraint: Constraint, nature?: string): Partial<StatsTable> | null {
  if (constraint.type !== 'defensive') return null;

  const defStat = defensiveStat(constraint.move);
  const base = Pokemon.fromText(name);

  let best: Partial<StatsTable> | null = null;
  let bestTotal = Infinity;

  for (let hpEV = 0; hpEV <= 252; hpEV += 4) {
    if (bestTotal <= hpEV) break;
    const minDefEV = findMinDefEV(base, hpEV, constraint, nature);
    if (minDefEV !== null) {
      const total = hpEV + minDefEV;
      if (total < bestTotal) {
        bestTotal = total;
        best = { hp: hpEV, [defStat]: minDefEV };
      }
    }
  }

  return best;
}

export function satisfyOffensiveConstraint(name: string, constraint: Constraint, nature?: string): Partial<StatsTable> | null {
  if (constraint.type !== 'offensive') return null;

  const { hits, set: defender, move, field, rollThreshold } = constraint;
  const atkStat = offensiveStat(move);
  const base = Pokemon.fromText(name);

  const minEV = binarySearchEV((atkEV) => {
    const attacker = pokemonWithEvs(base, { [atkStat]: atkEV }, nature);
    const result = calculate(CURRENT_GEN, attacker, defender, move, field);
    const damage = getOffensiveRoll(getDamageRolls(result.damage), rollThreshold);
    return damage * hits >= defender.maxHP();
  });

  if (minEV === null) return null;
  return { [atkStat]: minEV };
}

// Finds the maximum EV in [0, 252] (steps of 4) where check returns true.
// Assumes monotonicity. Returns null if even 0 EVs violate the check.
function binarySearchMaxEV(check: (ev: number) => boolean): number | null {
  if (!check(0)) return null;
  if (check(252)) return 252;
  let lo = 0, hi = 63;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (check(mid * 4)) lo = mid;
    else hi = mid - 1;
  }
  return lo * 4;
}

export function findMinSpeEV(base: Pokemon, constraint: SpeedConstraint, nature?: string): number | null {
  const target = constraint.set.stats.spe;
  return binarySearchEV(speEV => {
    const pokemon = pokemonWithEvs(base, { spe: speEV }, nature);
    return constraint.tie ? pokemon.stats.spe >= target : pokemon.stats.spe > target;
  });
}

export function findMaxSpeEV(base: Pokemon, constraint: SpeedConstraint, nature?: string): number | null {
  const target = constraint.set.stats.spe;
  return binarySearchMaxEV(speEV => {
    const pokemon = pokemonWithEvs(base, { spe: speEV }, nature);
    return constraint.tie ? pokemon.stats.spe <= target : pokemon.stats.spe < target;
  });
}
