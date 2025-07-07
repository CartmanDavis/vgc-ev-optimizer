import { describe, expect, test } from 'vitest'
import { readFileConstraints } from './constraint.js'
import { Field, Move } from '@smogon/calc';
import { Pokemon } from './pokemon.js';
import { CURRENT_GEN } from './constants.js';

describe('Constraint', () => {
  describe(readFileConstraints.name, () => {
    test('Reads a file', () => {
      expect(readFileConstraints('tera-fire-blitz.json')).toMatchObject({
        type: "offensive",
        set: Pokemon.fromText('Koraidon'),
        move: new Move(CURRENT_GEN, "Flare Blitz"),
      })
    });

    test('Coalesces hits', () => {
      const params = readFileConstraints('tera-fire-blitz.json');
      expect(params.hits).toEqual(1)
    });

    test('Coalesces field', () => {
      const params = readFileConstraints('tera-fire-blitz.json');
      expect(params.field).toEqual(new Field({}))
    });

    test('Coalesces rollThreshold', () => {
      const params = readFileConstraints('tera-fire-blitz.json');
      expect(params.rollThreshold).toEqual(100)
    });
  })
})
