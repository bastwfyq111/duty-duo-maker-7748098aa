// src/duty-scheduler.ts
// Simple duty schedule generator that enforces this rule:
// "After any one or more consecutive N shifts, the next day (if exists) must be R".

export type Shift = string;

export interface Schedule {
  cellId: number;
  shifts: Shift[]; // length = days
}

// Check whether placing `candidate` at day `d` (0-based) in `shiftsSoFar` is valid
// according to the rule.
function isValidPlacement(shiftsSoFar: Shift[], d: number, candidate: Shift): boolean {
  if (d === 0) return true;
  const prev = shiftsSoFar[d - 1];
  // If previous day was N and candidate is not N, candidate must be R
  if (prev === 'N' && candidate !== 'N' && candidate !== 'R') return false;
  // Otherwise allowed
  return true;
}

// Backtracking generator: generate a single schedule (first found) for one cell
export function generateScheduleForCell(days: number, shiftTypes: Shift[]): Shift[] | null {
  const schedule: Shift[] = new Array(days);
  const stack: { day: number; tried: Set<Shift> }[] = [];

  let day = 0;
  while (true) {
    if (day === days) {
      return schedule.slice();
    }

    if (stack.length <= day) {
      stack.push({ day, tried: new Set<Shift>() });
    }

    const frame = stack[day];
    let placed = false;
    for (const s of shiftTypes) {
      if (frame.tried.has(s)) continue;
      frame.tried.add(s);
      if (!isValidPlacement(schedule, day, s)) continue;
      schedule[day] = s;
      // If placing s is allowed, move to next day
      placed = true;
      day++;
      break;
    }

    if (!placed) {
      // backtrack
      stack.pop();
      day--;
      if (day < 0) return null; // no solution
    }
  }
}

// Generate schedules for `numCells` cells independently. Each cell gets one valid schedule.
// This simple implementation treats cells independently; if you need cross-cell constraints
// (e.g., coverage per day), we need a global solver approach.
export function generateSchedules(numCells: number, days: number, shiftTypes: Shift[]): Schedule[] {
  const result: Schedule[] = [];
  for (let i = 0; i < numCells; i++) {
    const sched = generateScheduleForCell(days, shiftTypes);
    if (!sched) throw new Error(`No schedule possible for cell ${i} with given shift types`);
    result.push({ cellId: i + 1, shifts: sched });
  }
  return result;
}

// Helper to convert schedules to CSV where rows = cells, columns = day1..dayN
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
