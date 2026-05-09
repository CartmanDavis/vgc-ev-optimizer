import { readFileSync } from 'fs';

import z from 'zod';

import { calculate, Field, Move } from "@smogon/calc";
import { CURRENT_GEN, CONSTRAINTS_DIR } from './constants.js';

import { Pokemon } from './pokemon.js';

import { StatsTable } from '@pkmn/dex';

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
  const buff = readFileSync(CONSTRAINTS_DIR + fileName, 'utf-8');
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

/**
 * TODO: 
 */
export function satisfyDefensiveConstraint(name: string, constraint: Constraint): Partial<StatsTable> | null {

  const attacker = constraint.set;
  const defender = Pokemon.fromText(name);
  const move = constraint.move;
  const field = constraint.field;

  const damageCalc = calculate(
    CURRENT_GEN,
    attacker,
    defender,
    move,
    field
  );

  // the above call to calculate shows how to run a damage calc

  throw new Error('Not Implemented')
}

export function satisfyOffensiveConstraint(name: string, constraint: Constraint): Partial<StatsTable> | null {
  const { hits, set, move, field, rollThreshold } = constraint;
  // TODO: implement
  return null;
}


