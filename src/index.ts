import { readFileSync } from 'fs';
import { SETS_DIR } from './constants.js';
import { readFileConstraints, describeConstraint } from './constraint.js';
import { optimize, totalEVs, STAT_KEYS, EVSpread, NatureEffect, Solution, getNatureName } from './optimizer.js';
import { Pokemon } from './pokemon.js';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: npm start <pokemon-set-file> <constraint-file> [constraint-file2 ...]');
  process.exit(1);
}

const [pokemonFile, ...constraintFiles] = args;

const pokemonText = readFileSync(SETS_DIR + pokemonFile, 'utf-8');
const pokemon = Pokemon.fromText(pokemonText);
const constraints = constraintFiles.map(readFileConstraints);

const solutions = optimize(pokemonText, constraints);

if (solutions.length === 0) {
  console.log('No valid EV spread found — constraints cannot be individually satisfied.');
} else {
  const allSatisfied = solutions[0].unsatisfied.length === 0;
  console.log(`${pokemon.name} — ${allSatisfied ? 'all constraints satisfied' : 'no complete solution found'}\n`);
  for (const solution of solutions) {
    printSolution(solution);
  }
}

function describeNature(effect: NatureEffect): string {
  if (effect.plus === null) return 'Neutral nature';
  const labels: Record<string, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  return `+${labels[effect.plus]} / -${labels[effect.minus!]} (${getNatureName(effect)})`;
}

function printSolution(solution: Solution): void {
  const { spreads, satisfied, unsatisfied, nature } = solution;
  const isPartial = unsatisfied.length > 0;

  if (isPartial) {
    console.log(`Partial solution — ${describeNature(nature)} — ${satisfied.length}/${satisfied.length + unsatisfied.length} constraints`);
    console.log(`  Satisfied:   ${satisfied.map(describeConstraint).join('\n               ')}`);
    console.log(`  Unsatisfied: ${unsatisfied.map(describeConstraint).join('\n               ')}`);
  } else {
    console.log(`Complete solution — ${describeNature(nature)} — ${satisfied.length} constraint${satisfied.length !== 1 ? 's' : ''}`);
    console.log(`  ${satisfied.map(describeConstraint).join('\n  ')}`);
  }

  console.log(`  ${spreads.length} spread${spreads.length !== 1 ? 's' : ''}\n`);
  console.log(formatTable(spreads, nature));
  console.log();
}

function formatTable(spreads: EVSpread[], nature: NatureEffect): string {
  const headers = ['#', 'HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe', 'Total', 'Left'];

  const rows = spreads.map((spread, i) => {
    const statCells = STAT_KEYS.map(stat => {
      const ev = spread[stat] ?? 0;
      const mod = nature.plus === stat ? '+' : nature.minus === stat ? '-' : '';
      return `${ev}${mod}`;
    });
    const used = totalEVs(spread);
    return [String(i + 1), ...statCells, String(used), String(510 - used)];
  });

  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, col) =>
    Math.max(...allRows.map(row => row[col].length))
  );

  const formatRow = (row: string[]) =>
    row.map((cell, col) => cell.padStart(colWidths[col])).join('  ');

  const separator = colWidths.map(w => '─'.repeat(w)).join('──');

  return [formatRow(headers), separator, ...rows.map(formatRow)]
    .map(line => '  ' + line)
    .join('\n');
}
