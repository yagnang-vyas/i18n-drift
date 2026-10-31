import { main } from './app.js';

// Exit quietly when the reader of our output goes away (for example `i18n-drift check | head`).
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') {
    process.exit(141);
  }
  throw error;
});
process.on('SIGINT', () => {
  process.exit(130);
});

process.exitCode = await main(process.argv.slice(2));
