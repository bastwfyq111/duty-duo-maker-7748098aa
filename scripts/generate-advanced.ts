#!/usr/bin/env node
// scripts/generate-advanced.ts
import { generateSchedulesAdvanced, schedulesToCSV } from '../src/advanced-scheduler';

function parseArgInt(name: string, fallback: number | undefined): number | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return parseInt(process.argv[idx + 1], 10);
  return fallback;
}
function parseArgList(name: string, fallback: string[]): string[] {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1].split(',');
  return fallback;
}
function parseFlag(name: string): boolean { return process.argv.includes(`--${name}`); }

const numCells = parseInt(process.argv[process.argv.indexOf('--cells') + 1] || '5', 10);
const days = parseInt(process.argv[process.argv.indexOf('--days') + 1] || '31', 10);
const shifts = parseArgList('shifts', ['N','R','O']);
const wrap = parseFlag('wrap');
const maxConsecN = parseArgInt('maxConsecN', undefined);
const minRPerMonth = parseArgInt('minRPerMonth', undefined);

try {
  const schedules = generateSchedulesAdvanced(numCells, days, shifts, {
    wrap,
    maxConsecN: maxConsecN ?? undefined,
    minRPerMonth: minRPerMonth ?? undefined
  });
  console.log(schedulesToCSV(schedules));
} catch (err) {
  console.error('Error generating schedules:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
