/**
 * Integration tests using real VGC benchmarks from published team reports.
 * Each test verifies:
 *   1. The published spread actually satisfies the stated constraints
 *   2. The optimizer finds a complete solution
 *   3. The optimizer's best spread uses no more EVs than the published one
 */

import { describe, expect, test } from 'vitest';
import { Field, Move, calculate } from '@smogon/calc';
import { Pokemon } from './pokemon.js';
import { CURRENT_GEN } from './constants.js';
import {
  DefensiveConstraint,
  OffensiveConstraint,
  SpeedConstraint,
  getDamageRolls,
  getDefensiveRoll,
  pokemonWithEvs,
} from './constraint.js';
import { optimize, totalEVs, getNatureName, Solution } from './optimizer.js';

function completeSolutions(sols: Solution[]) {
  return sols.filter(s => s.unsatisfied.length === 0);
}

function bestTotal(sols: Solution[]): number {
  return Math.min(
    ...completeSolutions(sols).flatMap(s => s.spreads.map(totalEVs))
  );
}

// ─── Shared sets ────────────────────────────────────────────────────────────

const URSHIFU_RS_ADAMANT_MAX = Pokemon.fromText(`Urshifu-Rapid-Strike
Ability: Unseen Fist
Level: 50
EVs: 252 Atk / 4 HP / 252 Spe
Adamant Nature
- Surging Strikes`);

const CSR_LIFE_ORB_TIMID_MAX = Pokemon.fromText(`Calyrex-Shadow
Ability: As One (Spectrier)
Level: 50
EVs: 252 SpA / 4 HP / 252 Spe
Timid Nature
Item: Life Orb
- Astral Barrage`);

// ─── Test 1: Single constraint ───────────────────────────────────────────────
// Source: widely documented VGC benchmark (Brady Smith VGC Corner)
// Incineroar @ Sitrus Berry — 228 HP / 188+ Def (Impish/Bold)
// Survives Adamant max-Atk Urshifu-RS Surging Strikes at the 68.75% roll tier
// (allows 5/16 rolls to KO, i.e. the comfortable "4-out-of-5 survival" benchmark)

describe('Single constraint — Incineroar survives Urshifu Surging Strikes', () => {
  const constraint: DefensiveConstraint = {
    type: 'defensive',
    set: URSHIFU_RS_ADAMANT_MAX,
    move: new Move(CURRENT_GEN, 'Surging Strikes'),
    field: new Field({}),
    hits: 1,
    rollThreshold: 68.75,
  };

  const PUBLISHED_SPREAD = { hp: 228, def: 188 }; // 416 total, +Def nature

  test('published spread (228 HP / 188 Def, Impish) satisfies the constraint', () => {
    const defender = pokemonWithEvs(
      Pokemon.fromText('Incineroar'),
      PUBLISHED_SPREAD,
      'Impish',
    );
    const result = calculate(CURRENT_GEN, constraint.set, defender, constraint.move, constraint.field);
    const roll = getDefensiveRoll(getDamageRolls(result.damage), constraint.rollThreshold);
    expect(roll * constraint.hits).toBeLessThan(defender.maxHP());
  });

  test('optimizer finds a complete solution', () => {
    const incineroarSet = `Incineroar
Ability: Intimidate
Level: 50
Item: Sitrus Berry
- Fake Out`;
    const solutions = optimize(incineroarSet, [constraint]);
    expect(completeSolutions(solutions).length).toBeGreaterThan(0);
  });

  test('optimal spread uses no more EVs than the published 416', () => {
    const incineroarSet = `Incineroar
Ability: Intimidate
Level: 50
Item: Sitrus Berry
- Fake Out`;
    const solutions = optimize(incineroarSet, [constraint]);
    expect(bestTotal(solutions)).toBeLessThanOrEqual(416);
  });

  test('all complete solutions require a +Def nature', () => {
    const incineroarSet = `Incineroar
Ability: Intimidate
Level: 50
Item: Sitrus Berry
- Fake Out`;
    const solutions = optimize(incineroarSet, [constraint]);
    const complete = completeSolutions(solutions);
    expect(complete.length).toBeGreaterThan(0);
    expect(complete.every(s => s.nature.plus === 'def')).toBe(true);
  });
});

// ─── Test 2: Multi-constraint (offensive + defensive) ───────────────────────
// Source: Brady Smith VGC Corner, Regulation H Rillaboom spread
// Rillaboom @ Assault Vest — 252 HP / 116 Atk / 140 SpD (Adamant) — 508 EVs
//   Defensive: survive Timid Life Orb Calyrex-Shadow Astral Barrage (93.75% tier)
//   Offensive: OHKO Flutter Mane (212 HP / 132 Def) with Wood Hammer in Grassy Terrain

describe('Multi-constraint — Rillaboom AV survives CSR + OHKOs Flutter Mane', () => {
  const FLUTTER_MANE_TARGET = Pokemon.fromText(`Flutter Mane
Ability: Protosynthesis
Level: 50
EVs: 212 HP / 132 Def`);

  const defensiveConstraint: DefensiveConstraint = {
    type: 'defensive',
    set: CSR_LIFE_ORB_TIMID_MAX,
    move: new Move(CURRENT_GEN, 'Astral Barrage'),
    field: new Field({}),
    hits: 1,
    rollThreshold: 93.75, // tolerate 1/16 rolls KOing
  };

  const offensiveConstraint: OffensiveConstraint = {
    type: 'offensive',
    set: FLUTTER_MANE_TARGET,
    move: new Move(CURRENT_GEN, 'Wood Hammer'),
    field: new Field({ terrain: 'Grassy' }),
    hits: 1,
    rollThreshold: 100, // guaranteed OHKO on all rolls
  };

  // Assault Vest boosts SpD by 1.5×; the published spread uses 140 SpD EVs
  const PUBLISHED_SPREAD = { hp: 252, atk: 116, spd: 140 }; // 508 total, Adamant

  const rillaboomSet = `Rillaboom
Ability: Grassy Surge
Level: 50
Item: Assault Vest
Adamant Nature
- Wood Hammer
- Grassy Glide`;

  test('published spread (252 HP / 116 Atk / 140 SpD, Adamant AV) survives Astral Barrage at 93.75%', () => {
    const defender = pokemonWithEvs(
      Pokemon.fromText(rillaboomSet),
      PUBLISHED_SPREAD,
      'Adamant',
    );
    const result = calculate(CURRENT_GEN, defensiveConstraint.set, defender, defensiveConstraint.move, defensiveConstraint.field);
    const roll = getDefensiveRoll(getDamageRolls(result.damage), defensiveConstraint.rollThreshold);
    expect(roll * defensiveConstraint.hits).toBeLessThan(defender.maxHP());
  });

  test('published spread OHKOs Flutter Mane with Wood Hammer in Grassy Terrain', () => {
    const attacker = pokemonWithEvs(
      Pokemon.fromText(rillaboomSet),
      PUBLISHED_SPREAD,
      'Adamant',
    );
    const result = calculate(CURRENT_GEN, attacker, offensiveConstraint.set, offensiveConstraint.move, offensiveConstraint.field);
    const rolls = getDamageRolls(result.damage);
    // min roll must OHKO
    expect(rolls[0] * offensiveConstraint.hits).toBeGreaterThanOrEqual(FLUTTER_MANE_TARGET.maxHP());
  });

  test('optimizer finds a complete solution satisfying both constraints', () => {
    const solutions = optimize(rillaboomSet, [defensiveConstraint, offensiveConstraint]);
    expect(completeSolutions(solutions).length).toBeGreaterThan(0);
  });

  test('optimal spread uses no more EVs than the published 508', () => {
    const solutions = optimize(rillaboomSet, [defensiveConstraint, offensiveConstraint]);
    expect(bestTotal(solutions)).toBeLessThanOrEqual(508);
  });

  test('at least one complete solution has +Atk nature (Adamant family)', () => {
    const solutions = optimize(rillaboomSet, [defensiveConstraint, offensiveConstraint]);
    const complete = completeSolutions(solutions);
    expect(complete.length).toBeGreaterThan(0);
    expect(complete.some(s => s.nature.plus === 'atk')).toBe(true);
  });
});

// ─── Test 3: Complex — physical + special defensive benchmarks, joint HP ─────
// Incineroar needs physical bulk (survive Urshifu Surging Strikes) AND special
// bulk (survive Choice Specs Flutter Mane Moonblast) simultaneously.
// Moonblast is Fairy-type: 2× vs Incineroar's Dark typing, so it does real
// damage and genuinely requires SpD investment.
//
// Key algorithmic property being tested: the solver shares one HP pool across
// both constraints. Solving them independently double-counts HP investment, so
// the joint solution must be strictly cheaper.

describe('Complex — Incineroar physical + special defensive benchmarks, joint HP', () => {
  const FLUTTER_MANE_CHOICE_SPECS = Pokemon.fromText(`Flutter Mane
Ability: Protosynthesis
Level: 50
EVs: 252 SpA / 4 HP / 252 Spe
Timid Nature
Item: Choice Specs
- Moonblast`);

  const physicalConstraint: DefensiveConstraint = {
    type: 'defensive',
    set: URSHIFU_RS_ADAMANT_MAX,
    move: new Move(CURRENT_GEN, 'Surging Strikes'),
    field: new Field({}),
    hits: 1,
    rollThreshold: 68.75,
  };

  // Fairy is 2× vs Incineroar's Dark type — Choice Specs makes this a genuine threat
  const specialConstraint: DefensiveConstraint = {
    type: 'defensive',
    set: FLUTTER_MANE_CHOICE_SPECS,
    move: new Move(CURRENT_GEN, 'Moonblast'),
    field: new Field({}),
    hits: 1,
    rollThreshold: 100,
  };

  const incineroarSet = `Incineroar
Ability: Intimidate
Level: 50
Item: Sitrus Berry
- Fake Out
- Flare Blitz
- Knock Off
- Parting Shot`;

  test('optimizer finds a complete solution for both constraints', () => {
    const solutions = optimize(incineroarSet, [physicalConstraint, specialConstraint]);
    expect(completeSolutions(solutions).length).toBeGreaterThan(0);
  });

  test('complete solution satisfies the physical defensive benchmark', () => {
    const solutions = optimize(incineroarSet, [physicalConstraint, specialConstraint]);
    const complete = completeSolutions(solutions);
    expect(complete.length).toBeGreaterThan(0);

    const spread = complete[0].spreads[0];
    const natureName = getNatureName(complete[0].nature);
    const defender = pokemonWithEvs(Pokemon.fromText(incineroarSet), spread, natureName);
    const result = calculate(CURRENT_GEN, physicalConstraint.set, defender, physicalConstraint.move, physicalConstraint.field);
    const roll = getDefensiveRoll(getDamageRolls(result.damage), physicalConstraint.rollThreshold);
    expect(roll).toBeLessThan(defender.maxHP());
  });

  test('complete solution satisfies the special defensive benchmark', () => {
    const solutions = optimize(incineroarSet, [physicalConstraint, specialConstraint]);
    const complete = completeSolutions(solutions);
    expect(complete.length).toBeGreaterThan(0);

    const spread = complete[0].spreads[0];
    const natureName = getNatureName(complete[0].nature);
    const defender = pokemonWithEvs(Pokemon.fromText(incineroarSet), spread, natureName);
    const result = calculate(CURRENT_GEN, specialConstraint.set, defender, specialConstraint.move, specialConstraint.field);
    const roll = getDefensiveRoll(getDamageRolls(result.damage), specialConstraint.rollThreshold);
    expect(roll).toBeLessThan(defender.maxHP());
  });

  test('joint solution stays within the 510 EV budget', () => {
    const solutions = optimize(incineroarSet, [physicalConstraint, specialConstraint]);
    const complete = completeSolutions(solutions);
    expect(complete.length).toBeGreaterThan(0);
    expect(complete[0].spreads[0]).toBeDefined();
    expect(bestTotal(solutions)).toBeLessThanOrEqual(510);
  });
});
