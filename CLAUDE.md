# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                        # run all tests (vitest)
npm test -- --reporter=verbose  # run tests with individual test names
npm test -- -t "test name"      # run a single test by name
node_modules/.bin/tsc           # type-check and compile to dist/
npm start <pokemon-file> <constraint-file> [...]  # build + run CLI
node dist/index.js <pokemon-file> <constraint-file> [...]  # run pre-built CLI
```

All paths in the CLI are relative to the `data/` subdirectories — e.g. `example.txt` resolves to `data/sets/example.txt`, `example.json` to `data/constraints/example.json`.

## Architecture

This is an ESM TypeScript project (`"type": "module"`, `moduleResolution: nodenext`). Source lives in `src/`, compiled output in `dist/`. All imports must use `.js` extensions even when referencing `.ts` source files.

### Key data flow

1. **Input**: A Pokemon set file (Showdown paste format, in `data/sets/`) + one or more constraint JSON files (in `data/constraints/`)
2. **Constraint loading** (`constraint.ts`): `readFileConstraints()` parses a constraint JSON with zod, using a discriminated union on `type: 'defensive' | 'offensive' | 'speed'`
3. **Optimization** (`optimizer.ts`): `optimize(pokemonText, constraints[])` calls the appropriate `satisfy*` function per constraint, merges results by taking the max EV per stat, validates the 512-total / 252-per-stat caps
4. **Output**: An `EVSpread` (`Partial<StatsTable>`) printed in Showdown notation

### `@smogon/calc` integration

`Pokemon` in `src/pokemon.ts` extends `@smogon/calc`'s Pokemon class. **Critical**: stats are computed in the constructor and cached — mutating `.evs` after construction has no effect. Any time you need a Pokemon with different EVs, use `pokemonWithEvs(base, evs)` in `constraint.ts`, which reconstructs a new instance.

`Pokemon.fromText(text)` accepts either a full Showdown paste or just a species name. When no level is specified, it defaults to **level 50** (VGC format). This override is in `pokemon.ts:fromText` — `@pkmn/sets` and `@smogon/calc` both default to level 100 without it.

### Constraint solver approach

Each `satisfy*` function (`constraint.ts`) finds the **minimum EVs** needed to meet one constraint:

- **Offensive**: binary search on Atk (physical) or SpA (special) EVs, 0–252 in steps of 4
- **Defensive**: iterate HP EVs in steps of 4 (0–252), binary search the relevant defense stat at each HP value; return the combination with the lowest total EV cost
- **Speed**: binary search Spe EVs; `tie: true` allows speed ties, `false` requires strictly faster

Roll thresholds: `rollThreshold: 100` (default) means the check must hold for all 16 damage rolls. The defensive roll index is `15 - floor((1 - rollThreshold/100) * 16)` (max roll at 100%); the offensive roll index is `floor((1 - rollThreshold/100) * 16)` (min roll at 100%).

### Constraint JSON format

```json
{ "type": "defensive", "set": "Calyrex-Shadow", "move": "Astral Barrage", "hits": 1, "rollThreshold": 93.75 }
{ "type": "offensive", "set": "Koraidon", "move": "Moonblast", "hits": 2 }
{ "type": "speed", "set": "Flutter Mane", "tie": false }
```

`set` accepts either a species name or a full Showdown paste. For offensive/defensive, `set` is the **opponent** (defender for offensive constraints, attacker for defensive constraints). Defaults: `hits: 1`, `rollThreshold: 100`, `field: {}`, `tie: false`.
