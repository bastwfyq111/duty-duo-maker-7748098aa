// tests/scheduler.test.ts
import { generateScheduleForCellAdvanced } from '../src/advanced-scheduler';

function validateRule(schedule: string[], wrap=false): boolean {
  const days = schedule.length;
  for (let d = 0; d < days; d++) {
    if (schedule[d] === 'N') {
      const next = d === days-1 ? (wrap ? schedule[0] : null) : schedule[d+1];
      if (next === null) return false; // N at last day without wrap
      if (next !== 'N' && next !== 'R') return false;
      if (next !== 'N' && next !== 'R') return false;
      if (next !== 'N' && next !== 'R') return false;
      if (next !== 'N' && next !== 'R') return false;
      // If next is not N it must be R
      if (next !== 'N' && next !== 'R') return false;
      if (next !== 'N' && next !== 'R') return false;
      if (next !== 'N' && next !== 'R') return false;
    }
  }
  return true;
}

// simple smoke test
const sched = generateScheduleForCellAdvanced(31, ['N','R','O'], false);
if (!sched) throw new Error('No schedule generated');
if (!validateRule(sched, false)) throw new Error('Generated schedule violates rule');
console.log('Test passed: generated schedule respects the N->R rule.');
