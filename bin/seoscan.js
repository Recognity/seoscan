#!/usr/bin/env node
import { setupCLI } from '../src/index.js';

const program = setupCLI();
program.parseAsync(process.argv).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
