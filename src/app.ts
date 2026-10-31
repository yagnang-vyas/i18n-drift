import { VERSION } from './version.js';

export function main(argv: string[]): Promise<number> {
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${VERSION}\n`);
  }
  return Promise.resolve(0);
}
