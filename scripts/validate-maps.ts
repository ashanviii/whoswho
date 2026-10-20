/**
 * Pipeline step 2 — validate every map in data/maps/.
 *   npm run data:validate
 * Exits non-zero on any error, so it gates `npm run build` and CI.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateMap } from './lib/validate-map.ts';

const MAPS_DIR = path.resolve('data/maps');

async function main() {
  const files = (await readdir(MAPS_DIR)).filter((f) => f.endsWith('.json'));
  let errorCount = 0;
  let warningCount = 0;

  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path.join(MAPS_DIR, file), 'utf8'));
    } catch (e) {
      console.error(`✗ ${file}: invalid JSON — ${(e as Error).message}`);
      errorCount++;
      continue;
    }
    const { errors, warnings } = validateMap(json, file);
    errorCount += errors.length;
    warningCount += warnings.length;
    console.log(`${errors.length ? '✗' : '✓'} ${file}`);
    errors.forEach((m) => console.error(`  error   ${m}`));
    warnings.forEach((m) => console.warn(`  warning ${m}`));
  }

  console.log(`\n${files.length} map(s), ${errorCount} error(s), ${warningCount} warning(s)`);
  if (errorCount) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
