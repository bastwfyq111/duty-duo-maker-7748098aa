import { calcTotalHours, getDaysInMonth, type ShiftType } from "@/lib/roster";

export interface ConstraintSettings {
  minRestHours: number; // e.g., 12
  maxConsecutiveDays: number; // e.g., 5
  maxDailyShiftsPerEmployee: number; // usually 1
  weeklyMinShifts?: number;
  weeklyMaxShifts?: number;
  fairnessToleranceHours?: number; // target tolerance from average hours
}

export interface SchedulerOptions {
  employees: { name: string; attendance: Record<string | number, string>; roles?: string[] }[];
  shifts: Record<string, ShiftType>;
  month: number;
  year: number;
  slotsPerDay: number;
  constraints: Partial<ConstraintSettings>;
}

export interface ScheduleResult {
  success: boolean;
  employees: SchedulerOptions["employees"];
  details?: { penalties: number; violations: string[] };
}

/**
 * A simple greedy + heuristic scheduler to auto-fill empty slots.
 * This is intentionally lightweight (runs in O(days * employees * slots)).
 * It attempts to:
 *  - balance total hours across employees
 *  - avoid exceeding maxConsecutiveDays
 *  - respect a minimal rest heuristic by comparing consecutive assigned hours
 *
 * Notes:
 *  - This is NOT an optimal solver (no ILP). It is intended for in-browser quick generation
 *    with reasonable constraints. For very strict constraints or large teams, consider using
 *    an optimization backend.
 */
export function computeAutoSchedule(opts: SchedulerOptions): ScheduleResult {
  const { employees: inEmployees, shifts, month, year, slotsPerDay, constraints } = opts;
  const daysInMonth = getDaysInMonth(year, month);

  const cfg: ConstraintSettings = {
    minRestHours: constraints.minRestHours ?? 12,
    maxConsecutiveDays: constraints.maxConsecutiveDays ?? 5,
    maxDailyShiftsPerEmployee: constraints.maxDailyShiftsPerEmployee ?? 1,
    weeklyMinShifts: constraints.weeklyMinShifts ?? undefined,
    weeklyMaxShifts: constraints.weeklyMaxShifts ?? undefined,
    fairnessToleranceHours: constraints.fairnessToleranceHours ?? 8,
  };

  // Work on deep copy of employees
  const employees = inEmployees.map(e => ({ ...e, attendance: { ...(e.attendance || {}) } }));

  const activeShiftCodes = Object.keys(shifts).filter(c => c !== "OFF" && c !== "R");
  if (activeShiftCodes.length === 0) {
    // nothing to schedule
    return { success: false, employees, details: { penalties: 0, violations: ["No active shift codes available to assign"] } };
  }

  // Track per-employee state
  const state = employees.map(() => ({ lastDayAssigned: 0, consecutive: 0 }));

  // Helper to compute total hours quickly
  const totalHours = (empIdx: number) => calcTotalHours(employees[empIdx].attendance, shifts);

  // Rotation index per employee to diversify assigned shift types
  const rotationIndex = employees.map((_, i) => i % activeShiftCodes.length);

  for (let day = 1; day <= daysInMonth; day++) {
    for (let slot = 1; slot <= slotsPerDay; slot++) {
      // order employees by least hours so far and who aren't at daily limit
      const order = employees
        .map((_, idx) => ({ idx, hours: totalHours(idx) }))
        .sort((a, b) => a.hours - b.hours || a.idx - b.idx)
        .map(o => o.idx);

      for (const empIdx of order) {
        // skip if employee already has maxDailyShiftsPerEmployee assigned for this day
        const dailyAssigned = Object.keys(employees[empIdx].attendance).filter(k => String(k).startsWith(`${day}-`) || String(k) === String(day)).length;
        if (dailyAssigned >= cfg.maxDailyShiftsPerEmployee) continue;

        // skip if already assigned this exact slot
        const key = `${day}-${slot}`;
        if (employees[empIdx].attendance[key]) continue;

        // check consecutive constraint
        const s = state[empIdx];
        if (s.lastDayAssigned === day - 1) {
          // was assigned yesterday
          if (s.consecutive >= cfg.maxConsecutiveDays) {
            // force OFF this day
            employees[empIdx].attendance[key] = "OFF";
            continue;
          }
        }

        // pick a shift code based on rotation for this employee
        let tryCount = 0;
        let assigned = false;
        while (tryCount < activeShiftCodes.length && !assigned) {
          const code = activeShiftCodes[rotationIndex[empIdx] % activeShiftCodes.length];

          // simple rest heuristic: if employee was assigned yesterday and sum of hours of prev+this < minRestHours, skip
          const prevKeys = Object.keys(employees[empIdx].attendance).filter(k => String(k).startsWith(`${day - 1}-`) || String(k) === String(day - 1));
          const prevCode = prevKeys.length ? employees[empIdx].attendance[prevKeys[prevKeys.length - 1]] : undefined;
          const prevHours = prevCode ? (shifts[prevCode]?.hours ?? 0) : 0;
          const curHours = shifts[code]?.hours ?? 0;
          if (prevCode && (prevHours + curHours) < cfg.minRestHours) {
            // try next shift type
            rotationIndex[empIdx]++;
            tryCount++;
            continue;
          }

          // assign it
          employees[empIdx].attendance[key] = code;
          // update state
          if (s.lastDayAssigned === day - 1) {
            s.consecutive++;
          } else if (s.lastDayAssigned === day) {
            // same day but different slot – keep consecutive unchanged
          } else {
            s.consecutive = 1;
          }
          s.lastDayAssigned = day;

          // advance rotation so next time a different shift is preferred
          rotationIndex[empIdx]++;
          assigned = true;
        }

        if (!assigned) {
          // fallback: assign OFF
          employees[empIdx].attendance[key] = "OFF";
        }
      }
    }
  }

  // done — calculate simple fairness penalty (sum of deviations from average)
  const hoursArr = employees.map((_, i) => totalHours(i));
  const avg = hoursArr.reduce((a, b) => a + b, 0) / Math.max(1, hoursArr.length);
  const penalties = hoursArr.reduce((p, h) => p + Math.abs(h - avg), 0);

  return { success: true, employees, details: { penalties, violations: [] } };
}
