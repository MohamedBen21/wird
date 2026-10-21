import { browser } from '#imports';
import type { JsonLoader } from '../core/repository';

/** Loads bundled data files (public/data/*.json) from the extension package. */
export const extensionLoader: JsonLoader = async (path) => {
  const url = (browser.runtime.getURL as (p: string) => string)(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
};
