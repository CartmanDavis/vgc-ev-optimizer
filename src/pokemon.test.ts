import { describe, expect, Mock, test, vi } from 'vitest';

import { Pokemon } from './pokemon.js'
import { CURRENT_GEN } from './constants.js';
import { readFileSync } from 'fs';

describe('Pokemon class', () => {

  describe('constructor', () => {
    test('uses super class constructor', () => {
      expect(new Pokemon(CURRENT_GEN, 'Pikachu', {})).toMatchObject({ name: "Pikachu", moves: [], ability: "Static" })
    })
  })


  describe(Pokemon.prototype.terastalize, () => {

    test('returns undefined before terastalizing', () => {
      const pika = new Pokemon(CURRENT_GEN, 'Pikachu', { teraType: 'Electric' });
      expect(pika.teraType).toBe(undefined)
    })


    test('returns tera type after terastalizing', () => {
      const pika = new Pokemon(CURRENT_GEN, 'Pikachu', { teraType: 'Electric' });
      pika.terastalize()
      expect(pika.teraType).toBe('Electric')
    })

    test('sets teraType before terastalizing', () => {
      const pika = new Pokemon(CURRENT_GEN, 'Pikachu', { teraType: 'Electric' });
      pika.teraType = "Normal"
      pika.terastalize()
      expect(pika.teraType).toBe("Normal")
    })

    test('setting teraType before terastalizing returns undefined', () => {
      const pika = new Pokemon(CURRENT_GEN, 'Pikachu', { teraType: 'Electric' });
      pika.teraType = "Normal"
      expect(pika.teraType).toBe(undefined)
    })

    test('sets tera type after terastalizing', () => {
      const pika = new Pokemon(CURRENT_GEN, 'Pikachu', { teraType: 'Electric' });
      pika.terastalize()
      pika.teraType = 'Normal'
      expect(pika.teraType).toBe('Normal')
    })
  });

  describe(Pokemon.fromFileName.name, () => {

    vi.mock('fs', () => {
      return {
        readFileSync: vi.fn()
      }
    })


    test('reads from file', async () => {
      (readFileSync as Mock).mockReturnValue(
        ` Koraidon @ Ability Shield  
          Ability: Orichalcum Pulse  
          Level: 50  
          Tera Type: Fire  
          EVs: 4 HP / 252 Atk / 252 Spe  
          Jolly Nature  
          - Flare Blitz  
          - Collision Course  
          - Dragon Claw  
          - Protect 
        `
      );
      const korai = Pokemon.fromFileName('foo')
      expect(korai).toBeInstanceOf(Pokemon)
      expect(korai).toEqual(
        new Pokemon(CURRENT_GEN, "Koraidon", {
          ability: "Orichalcum Pulse",
          item: "Ability Shield",
          level: 50,
          teraType: "Fire",
          evs: {
            hp: 4,
            atk: 252,
            spe: 252
          },
          nature: "Jolly",
          ivs: { atk: 31, def: 31, hp: 31, spe: 31, spa: 31, spd: 31 },
          moves: ["Flare Blitz", "Collision Course", "Dragon Claw", "Protect"]
        })
      )
    })

    test('throws on error', () => {
      (readFileSync as Mock).mockReturnValue('')
      expect(() => Pokemon.fromFileName('foo')).toThrow()
    })
  })
});

