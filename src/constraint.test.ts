import { describe, expect, test } from 'vitest'
import { readFileConstraints, satisfyDefensiveConstraint, satisfyOffensiveConstraint, getDamageRolls } from './constraint.js'
import { Field, Move, calculate } from '@smogon/calc';
import { Pokemon } from './pokemon.js';
import { CURRENT_GEN } from './constants.js';

const EXAMPLE_CONSTRAINT_FILE_NAME = 'example.json'

describe('Constraint', () => {
  describe(readFileConstraints.name, () => {
    test('Reads a file', () => {
      expect(readFileConstraints(EXAMPLE_CONSTRAINT_FILE_NAME)).toMatchObject({
        type: "offensive",
        set: Pokemon.fromText('Koraidon'),
        move: new Move(CURRENT_GEN, "Flare Blitz"),
      })
    });

    test('Coalesces hits', () => {
      const params = readFileConstraints(EXAMPLE_CONSTRAINT_FILE_NAME);
      if (params.type === 'speed') return;
      expect(params.hits).toEqual(1)
    });

    test('Coalesces field', () => {
      const params = readFileConstraints(EXAMPLE_CONSTRAINT_FILE_NAME);
      if (params.type === 'speed') return;
      expect(params.field).toEqual(new Field({}))
    });

    test('Coalesces rollThreshold', () => {
      const params = readFileConstraints(EXAMPLE_CONSTRAINT_FILE_NAME);
      if (params.type === 'speed') return;
      expect(params.rollThreshold).toEqual(100)
    });
  })

  describe(satisfyDefensiveConstraint.name, () => {
    // Cresselia (bulky Psychic) can survive base Calyrex-Shadow's Astral Barrage
    test('Satisfies a defensive constraint', () => {
      const constraint = readFileConstraints('defensive_example.json');
      const result = satisfyDefensiveConstraint('Cresselia', constraint);
      expect(result).not.toBeNull();
    });

    test('Returned EVs actually allow survival', () => {
      const constraint = readFileConstraints('defensive_example.json');
      if (constraint.type !== 'defensive') return;

      const result = satisfyDefensiveConstraint('Cresselia', constraint);
      expect(result).not.toBeNull();

      // Verify the spread works: max roll * hits < defender HP
      const defender = new Pokemon(CURRENT_GEN, 'Cresselia', { level: 50, evs: result! });
      const calcResult = calculate(CURRENT_GEN, constraint.set, defender, constraint.move, constraint.field);
      const rolls = getDamageRolls(calcResult.damage);
      expect(rolls[rolls.length - 1] * constraint.hits).toBeLessThan(defender.maxHP());
    });

    test('Returns null when constraint is not defensive', () => {
      const constraint = readFileConstraints(EXAMPLE_CONSTRAINT_FILE_NAME);
      const result = satisfyDefensiveConstraint('Cresselia', constraint);
      expect(result).toBeNull();
    });
  });

  describe(satisfyOffensiveConstraint.name, () => {
    // Flutter Mane using Moonblast (Fairy, 4x vs Koraidon's Dragon/Fighting) — easily achievable OHKO
    test('Satisfies an offensive constraint', () => {
      const constraint = readFileConstraints('offensive_example.json');
      const result = satisfyOffensiveConstraint('Flutter Mane', constraint);
      expect(result).not.toBeNull();
    });

    test('Returned EVs actually achieve the KO', () => {
      const constraint = readFileConstraints('offensive_example.json');
      if (constraint.type !== 'offensive') return;

      const result = satisfyOffensiveConstraint('Flutter Mane', constraint);
      expect(result).not.toBeNull();

      const attacker = new Pokemon(CURRENT_GEN, 'Flutter Mane', { evs: result! });
      const calcResult = calculate(CURRENT_GEN, attacker, constraint.set, constraint.move, constraint.field);
      const rolls = getDamageRolls(calcResult.damage);
      expect(rolls[0] * constraint.hits).toBeGreaterThanOrEqual(constraint.set.maxHP());
    });

    test('Returns null when constraint is not offensive', () => {
      const constraint = readFileConstraints('defensive_example.json');
      const result = satisfyOffensiveConstraint('Flutter Mane', constraint);
      expect(result).toBeNull();
    });
  });
})
