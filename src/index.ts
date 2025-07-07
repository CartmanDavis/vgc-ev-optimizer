import { calculate, Move } from '@smogon/calc';
import {
  Pokemon
} from './pokemon.js';
import { CURRENT_GEN } from './constants.js';

const csr = Pokemon.fromFileName('csr.txt');
const koraidon = Pokemon.fromFileName('koraidon.txt');

const result = calculate(
  CURRENT_GEN,
  koraidon,
  csr,
  new Move(CURRENT_GEN, koraidon.moves[0]),
);

console.log(result.fullDesc())
