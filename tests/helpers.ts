import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ContentRepository } from '../src/core/repository';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

export function makeRepo() {
  return new ContentRepository(async (path) => JSON.parse(await readFile(publicDir + path, 'utf8')));
}
