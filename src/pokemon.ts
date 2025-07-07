import { readFileSync } from 'fs';

import { Pokemon as SmogonPokemon, State } from '@smogon/calc';
import { TypeName } from '@smogon/calc/dist/data/interface.js';
import { Sets } from '@pkmn/sets';
import { CURRENT_GEN, SETS_DIR } from './constants.js';
import { Dex, PokemonSet } from '@pkmn/dex';


/** 
 * Builds a pokemon for a calc
 */
export class Pokemon extends SmogonPokemon {
  private terastalized: boolean = false
  private _teraType?: TypeName;

  /**
   * Builds a pokemon from a text set of Showdown format
   */
  static fromText(text: string) {
    const set = Sets.importSet(text, Dex.forGen(CURRENT_GEN))
    return new Pokemon(CURRENT_GEN, set.species!, set as Partial<State.Pokemon>)
  }

  /**
   * Builds a pokemon by reading the Showdown text set from a file
   */
  static fromFileName(fileName: string): Pokemon {
    const buff = readFileSync(SETS_DIR
      + fileName, 'utf-8')
    return Pokemon.fromText(buff)
  }

  // @ts-ignore
  public override get teraType(): TypeName | undefined {
    if (this.terastalized) {
      return this._teraType;
    }
    return undefined
  }

  public override set teraType(typeName: TypeName | undefined) {
    this._teraType = typeName;
  }

  public terastalize(shouldTera: boolean = true) {
    this.terastalized = shouldTera;
  }
}
