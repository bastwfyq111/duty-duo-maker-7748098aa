#!/usr/bin/env node
// scripts/generate.ts
// Simple CLI to generate schedules and print CSV to stdout.

import { generateSchedules, schedulesToCSV } from '../src/duty-scheduler';

function parseArgInt(name: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return parseInt(process.argv[idx + 1], 10);
  return fallback;
}

function parseArgList(name: string, fallback: string[]): string[] {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1].split(',');
  return fallback;
}

const numCells = parseArgInt('cells', 5);
const days = parseArgInt('days', 31);
const shifts = parseArgList('shifts', ['N', 'R', 'O']);

try {
  const schedules = generateSchedules(numCells, days, shifts);
  const csv = schedulesToCSV(schedules);
  console.log(csv);
} catch (err) {
  console.error('Error generating schedules:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
