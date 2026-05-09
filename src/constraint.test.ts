import { describe, expect, test } from 'vitest'
import { readFileConstraints, satisfyDefensiveConstraint } from './constraint.js'
import { Field, Move } from '@smogon/calc';
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
      expect(params.hits).toEqual(1)
    });

    test('Coalesces field', () => {
      const params = readFileConstraints(EXAMPLE_CONSTRAINT_FILE_NAME);
      expect(params.field).toEqual(new Field({}))
    });

    test('Coalesces rollThreshold', () => {
      const params = readFileConstraints(EXAMPLE_CONSTRAINT_FILE_NAME);
      expect(params.rollThreshold).toEqual(100)
    });
  })

  describe(satisfyDefensiveConstraint.name, () => {

    test('Satisfies a defensive constraint', () => {

    });
  });
})
