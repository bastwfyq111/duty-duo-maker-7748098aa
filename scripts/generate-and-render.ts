#!/usr/bin/env node
// scripts/generate-and-render.ts
// Generate schedules using the existing generator and render an HTML file similar to the provided image.

import * as fs from 'fs';
import * as path from 'path';
import { generateSchedules, schedulesToCSV } from '../src/duty-scheduler';
import { renderSchedulesToHTML } from '../src/render-schedule';

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

function parseFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const numCells = parseArgInt('cells', 10);
const days = parseArgInt('days', 31);
const shifts = parseArgList('shifts', ['N', 'R', 'M', 'AF']);
const wrap = parseFlag('wrap');
const month = process.argv.includes('--month') ? process.argv[process.argv.indexOf('--month') + 1] : 'يوليو';
const year = process.argv.includes('--year') ? parseInt(process.argv[process.argv.indexOf('--year') + 1], 10) : 2026;

// Example Arabic names; if you prefer to pass names via a file, implement that later.
const defaultNames = [
  'خالد صلاح عبد جراح',
  'عبداللطيف احمد عبد فرج',
  'سليمان حسين احمد الشمري',
  'عبدالهادي حسين محمد الصادق',
  'عماد عطية ناصر البكري',
  'توفيق عباس عبد الرحمن',
  'امين حسن سيف مسرور',
  'غفار احمد حسن بكر',
  'صفاء احمد محمد النعيمي',
  'احلام صالح احمد الغروري'
];

const names = defaultNames.slice(0, numCells);

try {
  const schedules = generateSchedules(numCells, days, shifts, wrap);
  // Attach names
  for (let i = 0; i < schedules.length; i++) schedules[i].name = names[i] ?? `موظف ${i + 1}`;

  const outDir = path.join(process.cwd(), 'outputs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const csv = schedulesToCSV(schedules as any);
  const csvPath = path.join(outDir, `schedule-${month}-${year}.csv`);
  fs.writeFileSync(csvPath, csv, 'utf8');

  const shiftColors: Record<string, string> = {
    N: '#6c757d', // gray
    R: '#28a745', // green
    M: '#ffc107', // yellow
    AF: '#17a2b8', // cyan/blue
    '': '#ffffff'
  };

  const html = renderSchedulesToHTML(schedules as any, month, year, shiftColors, true);
  const htmlPath = path.join(outDir, `schedule-${month}-${year}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  console.log('Generated:', csvPath, htmlPath);
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
