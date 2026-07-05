// src/duty-scheduler.ts
// Simple duty schedule generator that enforces this rule:
// "After any one or more consecutive N shifts, the next day (if exists) must be R".

export type Shift = string;

export interface Schedule {
  cellId: number;
  shifts: Shift[]; // length = days
}

// Check whether placing `candidate` at day `d` (0-based) in `shiftsSoFar` is valid
// according to the rule. `days` and `wrapAround` control end-of-month behavior.
function isValidPlacement(
  shiftsSoFar: Shift[],
  d: number,
  candidate: Shift,
  days: number,
  wrapAround: boolean
): boolean {
  if (d === 0) {
    // No previous day in linear fill; but if wrapAround is true and we're placing day0
    // we must ensure it satisfies the relation with a potential N at the last day later.
    // That will be checked when filling the last day.
    // So placement at day 0 is always tentatively allowed here.
    if (!candidate) return false;
    return true;
  }

  const prev = shiftsSoFar[d - 1];
  // If previous day was N and candidate is not N, candidate must be R
  if (prev === 'N' && candidate !== 'N' && candidate !== 'R') return false;

  // Prevent placing N on the last day when wrap-around is disabled because
  // there is no next day to be R.
  if (d === days - 1 && candidate === 'N' && !wrapAround) return false;

  // If wrap-around is enabled and we're placing the last day as N,
  // ensure day 0 is (or will be) R. Since day 0 is already placed, we can check it.
  if (d === days - 1 && candidate === 'N' && wrapAround) {
    const day0 = shiftsSoFar[0];
    if (day0 !== 'R') return false;
  }

  return true;
}

// Backtracking generator: generate a single schedule (first found) for one cell
export function generateScheduleForCell(
  days: number,
  shiftTypes: Shift[],
  wrapAround = false
): Shift[] | null {
  const schedule: Shift[] = new Array(days);
  const stack: { day: number; tried: Set<Shift> }[] = [];

  let day = 0;
  while (true) {
    if (day === days) {
      // If wrapAround is enabled, we must ensure the relation between last and first day holds.
      if (wrapAround) {
        const last = schedule[days - 1];
        const first = schedule[0];
        if (last === 'N' && first !== 'R') {
          // invalid, backtrack
          // treat as failure to place last
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
      if (!isValidPlacement(schedule, day, s, days, wrapAround)) continue;
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
export function generateSchedules(
  numCells: number,
  days: number,
  shiftTypes: Shift[],
  wrapAround = false
): Schedule[] {
  const result: Schedule[] = [];
  for (let i = 0; i < numCells; i++) {
    const sched = generateScheduleForCell(days, shiftTypes, wrapAround);
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
