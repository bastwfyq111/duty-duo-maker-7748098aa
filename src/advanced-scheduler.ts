// src/advanced-scheduler.ts
// Enhanced duty schedule generator with additional per-employee constraints:
// - after any N run, the next day must be R (as before)
// - optional: maxConsecutiveN (no more than K N in a row)
// - optional: minRPerMonth (employee must have at least X R days in the month)
// The generator produces schedules for all employees independently (no cross-employee coverage).

export type Shift = 'N' | 'R' | string;

export interface Schedule {
  cellId: number;
  shifts: Shift[]; // length = days
}

function countInArray(arr: Shift[], predicate: (s: Shift) => boolean): number {
  return arr.reduce((acc, s) => acc + (predicate(s) ? 1 : 0), 0);
}

function maxConsecutive(arr: Shift[], value: Shift): number {
  let max = 0;
  let cur = 0;
  for (const s of arr) {
    if (s === value) cur++; else cur = 0;
    if (cur > max) max = cur;
  }
  return max;
}

// isValidPlacement checks the local rule and also global per-employee constraints that
// can be validated incrementally when possible.
function isValidPlacement(
  schedule: Shift[],
  day: number,
  candidate: Shift,
  days: number,
  wrap: boolean,
  maxConsecN?: number
): boolean {
  // Local rule relative to previous day
  if (day > 0) {
    const prev = schedule[day - 1];
    if (prev === 'N' && candidate !== 'N' && candidate !== 'R') return false;
  }

  // Prevent placing N on last day when wrap is disabled
  if (day === days - 1 && candidate === 'N' && !wrap) return false;

  // If maxConsecN is set, we can check the current run length up to this placement
  if (maxConsecN !== undefined && candidate === 'N') {
    let run = 1;
    for (let i = day - 1; i >= 0; i--) {
      if (schedule[i] === 'N') run++; else break;
      if (run > maxConsecN) return false;
    }
    if (run > maxConsecN) return false;
  }

  return true;
}

export function generateScheduleForCellAdvanced(
  days: number,
  shiftTypes: Shift[],
  wrap = false,
  maxConsecN?: number,
  minRPerMonth?: number
): Shift[] | null {
  const schedule: Shift[] = new Array(days);
  const stack: { day: number; tried: Set<Shift> }[] = [];

  let day = 0;
  while (true) {
    if (day === days) {
      // Completed - check minRPerMonth if provided
      if (minRPerMonth !== undefined) {
        const rCount = countInArray(schedule, s => s === 'R');
        if (rCount < minRPerMonth) {
          // backtrack
        } else {
          return schedule.slice();
        }
      } else {
        return schedule.slice();
      }
    }

    if (stack.length <= day) {
      stack.push({ day, tried: new Set<Shift>() });
    }
    const frame = stack[day];
    let placed = false;

    for (const s of shiftTypes) {
      if (frame.tried.has(s)) continue;
      frame.tried.add(s);
      if (!isValidPlacement(schedule, day, s, days, wrap, maxConsecN)) continue;

      schedule[day] = s;
      day++;
      placed = true;
      break;
    }

    if (!placed) {
      // backtrack
      stack.pop();
      day--;
      if (day < 0) return null;
    }
  }
}

export function generateSchedulesAdvanced(
  numCells: number,
  days: number,
  shiftTypes: Shift[],
  options?: {
    wrap?: boolean;
    maxConsecN?: number;
    minRPerMonth?: number;
  }
): Schedule[] {
  const { wrap = false, maxConsecN, minRPerMonth } = options ?? {};
  const result: Schedule[] = [];
  for (let i = 0; i < numCells; i++) {
    const sched = generateScheduleForCellAdvanced(days, shiftTypes, wrap, maxConsecN, minRPerMonth);
    if (!sched) throw new Error(`No schedule possible for cell ${i} with given constraints`);
    result.push({ cellId: i + 1, shifts: sched });
  }
  return result;
}

// CSV helper
export function schedulesToCSV(schedules: Schedule[]): string {
  if (schedules.length === 0) return '';
  const days = schedules[0].shifts.length;
  const header = ['cellId', ...Array.from({ length: days }, (_, i) => `day${i + 1}`)].join(',');
  const lines = [header];
  for (const s of schedules) {
    lines.push([s.cellId.toString(), ...s.shifts].join(','));
  }
  return lines.join('\n');
}
