import { readFileSync } from 'fs';

import z from 'zod';

import { Field, Move } from "@smogon/calc";
import { CURRENT_GEN, PARAM_DIR } from './constants.js';

import { Pokemon } from './pokemon.js';

const constraintSchema = z.object({
  hits: z.number().min(0).default(1),
  set: z.string(),
  move: z.string(),
  field: z.object({}).default({}),
  type: z.enum(['defensive', 'offensive']),
  rollThreshold: z.number().default(100),
})

type DamageConstraint = {
  hits: number;
  set: Pokemon;
  move: Move;
  field: Field;
  rollThreshold: number;
};


type DefensiveConstraint = DamageConstraint & { type: 'defensive' }

type OffensiveConstraint = DamageConstraint & { type: 'offensive' };

type SpeedConstraint = {};

export type Constraint = DefensiveConstraint | OffensiveConstraint;


export function readFileConstraints(fileName: string): Constraint {
  const buff = readFileSync(PARAM_DIR + fileName, 'utf-8');
  const asJson = JSON.parse(buff);
  const parsed = constraintSchema.parse(asJson);
  return {
    type: parsed.type,
    hits: parsed.hits,
    field: new Field(parsed.field),
    move: new Move(CURRENT_GEN, parsed.move),
    rollThreshold: parsed.rollThreshold,
    set: Pokemon.fromText(parsed.set)
  }
}
