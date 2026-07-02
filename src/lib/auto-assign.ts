import type { Employee } from "@/hooks/useRosterData";
import { type ShiftType, getDaysInMonth, calcTotalHours } from "@/lib/roster";

export interface AutoAssignConstraints {
  shiftCodes: string[];                       // shifts to distribute
  maxMonthlyHours: number;                    // per-employee cap
  maxConsecutiveDays: number;                 // max consecutive working days
  weeklyRestDayOfWeek: number | null;         // 0-6 (Sun-Sat). null = none
  minStaffPerShift: Record<string, number>;   // shift code -> min employees per day
  fairDistribution: boolean;                  // balance hours
  overrideExisting: boolean;                  // overwrite filled cells?
  restCode?: string;                          // code to use for rest days (optional)
  diverseShifts?: boolean;                    // ✨ تنوع الورديات لكل موظف
  safeSequences?: boolean;                    // ✨ منع الصباح بعد الليل، وتقييد الليالي المتتالية
  maxConsecutiveNights?: number;              // افتراضي 2
}

/** Detect night-shift code by convention (code starts with N or label mentions "ليل"). */
function isNightCode(code: string, shifts: Record<string, ShiftType>): boolean {
  if (!code) return false;
  const c = code.trim().toUpperCase();
  if (c.startsWith("N")) return true;
  const label = shifts[code]?.label ?? "";
  return /ليل|مسا/.test(label);
}

/** Detect morning-shift code by convention (code starts with M or label mentions "صباح"). */
function isMorningCode(code: string, shifts: Record<string, ShiftType>): boolean {
  if (!code) return false;
  const c = code.trim().toUpperCase();
  if (c.startsWith("M")) return true;
  const label = shifts[code]?.label ?? "";
  return /صباح/.test(label);
}



export interface AutoAssignStats {
  maxHours: number;
  minHours: number;
  avgHours: number;
  spread: number;   // maxHours - minHours
}

export interface AutoAssignResult {
  employees: Employee[];
  warnings: string[];
  stats?: AutoAssignStats;
}

/** Helper: get slot keys for a given day */
function slotKey(day: number, slot: 1 | 2): string {
  return `${day}-${slot}`;
}

/** Helper: get assigned shift for a given slot */
function getSlot(emp: Employee, day: number, slot: 1 | 2): string {
  return emp.attendance[slotKey(day, slot)] || "";
}

/** Helper: check if employee has any working hours on a given day */
function dayHasWork(emp: Employee, day: number, shifts: Record<string, ShiftType>): boolean {
  const s1 = getSlot(emp, day, 1);
  const s2 = getSlot(emp, day, 2);
  return (shifts[s1]?.hours ?? 0) > 0 || (shifts[s2]?.hours ?? 0) > 0;
}

/** Get set of distinct shifts employee already has */
function getEmployeeShifts(emp: Employee): Set<string> {
  const S = new Set<string>();
  Object.values(emp.attendance).forEach(code => { if (code) S.add(code); });
  return S;
}

/** Score a candidate for assignment: lower is better */
function candidateScore(i: number, hoursPerEmp: number[], workUnits: number[], consecutive: number[], lastShift: string, code: string) {
  // base: current hours (prefer lower) — primary fairness signal
  let score = hoursPerEmp[i];
  // secondary: prefer employees with fewer assigned working slots (balance count too)
  score += workUnits[i] * 2;
  // penalize long consecutive streaks
  score += consecutive[i] * 3;
  // penalize if lastShift equals code to encourage diversity
  if (lastShift === code) score += 12;
  return score;
}

export function autoAssign(
  employees: Employee[],
  shifts: Record<string, ShiftType>,
  year: number,
  month: number,
  c: AutoAssignConstraints
): AutoAssignResult {
  const warnings: string[] = [];
  const daysInMonth = getDaysInMonth(year, month);

  // Deep clone to avoid mutating input
  const next: Employee[] = employees.map(e => ({ name: e.name, attendance: { ...e.attendance } }));

  if (next.length === 0) {
    warnings.push("لا يوجد موظفون");
    return { employees: next, warnings };
  }
  if (c.shiftCodes.length === 0) {
    warnings.push("لم يتم اختيار ورديات للتوزيع");
    return { employees: next, warnings };
  }

  // Running totals & helpers
  const hoursPerEmp: number[] = next.map(emp => calcTotalHours(emp.attendance, shifts));
  const workUnits: number[] = next.map(emp =>
    Object.values(emp.attendance).filter(code => (shifts[code]?.hours ?? 0) > 0).length
  );
  const consecutive: number[] = next.map(() => 0);
  const consecutiveNights: number[] = next.map(() => 0);
  const lastShiftPerEmp: string[] = next.map(() => "");
  const maxNights = c.maxConsecutiveNights ?? 2;

  /** shared filter: is `code` safe for employee `i` on `day` given yesterday? */
  const isSafeForEmp = (i: number, code: string): boolean => {
    if (!c.safeSequences) return true;
    const last = lastShiftPerEmp[i];
    // no morning right after a night
    if (isNightCode(last, shifts) && isMorningCode(code, shifts)) return false;
    // cap consecutive nights
    if (isNightCode(code, shifts) && consecutiveNights[i] >= maxNights) return false;
    return true;
  };

  const workingCodes = c.shiftCodes.filter(code => (shifts[code]?.hours ?? 0) > 0);
  const restCodes = c.shiftCodes.filter(code => (shifts[code]?.hours ?? 0) === 0);

  // Main loop by day
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month, day).getDay();

    // Update consecutive counters based on yesterday
    if (day > 1) {
      next.forEach((emp, i) => {
        const worked = dayHasWork(emp, day - 1, shifts);
        consecutive[i] = worked ? consecutive[i] + 1 : 0;
        const y1 = getSlot(emp, day - 1, 1);
        const y2 = getSlot(emp, day - 1, 2);
        const workedNight = isNightCode(y1, shifts) || isNightCode(y2, shifts);
        consecutiveNights[i] = workedNight ? consecutiveNights[i] + 1 : 0;
      });
    }

    // Handle weekly rest day if configured
    if (c.weeklyRestDayOfWeek !== null && c.restCode && dow === c.weeklyRestDayOfWeek) {
      next.forEach((emp, i) => {
        const key1 = slotKey(day, 1);
        if (!emp.attendance[key1] || c.overrideExisting) {
          emp.attendance[key1] = c.restCode!;
          // ensure slot2 empty on rest day unless override and desired
          const key2 = slotKey(day, 2);
          if (!emp.attendance[key2] || c.overrideExisting) emp.attendance[key2] = "";
          consecutive[i] = 0;
        }
      });
      continue;
    }

    // Precompute current counts per shift for the day
    const counts: Record<string, number> = {};
    c.shiftCodes.forEach(code => (counts[code] = 0));
    next.forEach(emp => {
      c.shiftCodes.forEach(code => {
        // count occurrences
      });
      const s1 = getSlot(emp, day, 1);
      const s2 = getSlot(emp, day, 2);
      if (s1) counts[s1] = (counts[s1] || 0) + 1;
      if (s2) counts[s2] = (counts[s2] || 0) + 1;
    });

    // === PASS 1: satisfy minimum staffing per shift ===
    for (const code of c.shiftCodes) {
      const need = c.minStaffPerShift[code] ?? 0;
      if (need <= 0) continue;
      let alreadyAssigned = counts[code] || 0;
      let toAssign = need - alreadyAssigned;
      if (toAssign <= 0) continue;

      // Build candidate list with scoring
      const candidates = next
        .map((emp, i) => ({ i, emp }))
        .filter(({ i, emp }) => {
          const s1 = getSlot(emp, day, 1);
          const s2 = getSlot(emp, day, 2);
          const hasFreeSlot = (!s1 || c.overrideExisting) || (!s2 || c.overrideExisting);
          if (!hasFreeSlot) return false;
          if (s1 === code || s2 === code) return false; // already assigned
          const shiftHours = shifts[code]?.hours ?? 0;
          if (shiftHours > 0) {
            if (hoursPerEmp[i] + shiftHours > c.maxMonthlyHours) return false;
            if (consecutive[i] >= c.maxConsecutiveDays) return false;
          }
          if (!isSafeForEmp(i, code)) return false;
          return true;
        });

      // Sort by a combined score (lower better): hours, consecutive, and lastShift preference
      candidates.sort((a, b) => {
        const as = candidateScore(a.i, hoursPerEmp, consecutive, lastShiftPerEmp[a.i], code);
        const bs = candidateScore(b.i, hoursPerEmp, consecutive, lastShiftPerEmp[b.i], code);
        return as - bs;
      });

      // Select top candidates
      const chosen = candidates.slice(0, toAssign);
      if (chosen.length < toAssign) {
        warnings.push(`اليوم ${day}: لم يتم تلبية العدد المطلوب للوردية ${code} (الناقص: ${toAssign - chosen.length})`);
      }

      // Assign chosen
      for (const { i, emp } of chosen) {
        // assign to best free slot
        assignToFreeSlot(emp, i, day, code, shifts, hoursPerEmp, c.overrideExisting);
        counts[code] = (counts[code] || 0) + 1;
        lastShiftPerEmp[i] = code;
      }
    }

    // === PASS 2: fill remaining free slots while balancing hours ===
    // Build employee order: prefer those with lower hours to balance load
    const empOrder = next.map((_, i) => i).sort((a, b) => hoursPerEmp[a] - hoursPerEmp[b]);

    for (const empIdx of empOrder) {
      const emp = next[empIdx];
      // for each slot try to fill if empty
      for (const slot of [1, 2] as const) {
        const cur = getSlot(emp, day, slot);
        if (cur && !c.overrideExisting) continue;

        // Pick best shift for this emp/slot
        const code = pickBestShift(empIdx, day, slot, next, workingCodes, shifts, hoursPerEmp, consecutive, c, lastShiftPerEmp[empIdx]);
        if (!code) continue;

        assignToFreeSlot(emp, empIdx, day, code, shifts, hoursPerEmp, c.overrideExisting);
        counts[code] = (counts[code] || 0) + 1;
        lastShiftPerEmp[empIdx] = code;
      }
    }

    // end of day loop
  }

  // Post-checks: warn if diversity required but not satisfied
  if (c.diverseShifts) {
    const working = workingCodes.filter(code => (shifts[code]?.hours ?? 0) > 0);
    if (working.length > 1) {
      next.forEach(emp => {
        const empShifts = getEmployeeShifts(emp);
        for (const code of working) {
          if (!empShifts.has(code)) {
            warnings.push(`⚠️ ${emp.name}: قد لا يكون قد حصل على الوردية "${code}"`);
          }
        }
      });
    }
  }

  return { employees: next, warnings };
}

/** Assign a shift code to the first available slot for an employee on a given day */
function assignToFreeSlot(
  emp: Employee,
  empIdx: number,
  day: number,
  code: string,
  shifts: Record<string, ShiftType>,
  hoursPerEmp: number[],
  overrideExisting: boolean
): void {
  const key1 = slotKey(day, 1);
  const key2 = slotKey(day, 2);
  const s1 = emp.attendance[key1];
  const s2 = emp.attendance[key2];
  const shiftHours = shifts[code]?.hours ?? 0;

  // Prefer slot that doesn't duplicate an existing code
  if ((!s1 || overrideExisting) && s1 !== code) {
    if (s1) hoursPerEmp[empIdx] -= shifts[s1]?.hours ?? 0;
    emp.attendance[key1] = code;
    hoursPerEmp[empIdx] += shiftHours;
    return;
  }

  if ((!s2 || overrideExisting) && s2 !== code) {
    if (s2) hoursPerEmp[empIdx] -= shifts[s2]?.hours ?? 0;
    emp.attendance[key2] = code;
    hoursPerEmp[empIdx] += shiftHours;
    return;
  }

  // As a fallback, if both slots hold same code and overrideExisting is true, replace slot2
  if (overrideExisting) {
    if (s1) hoursPerEmp[empIdx] -= shifts[s1]?.hours ?? 0;
    emp.attendance[key1] = code;
    hoursPerEmp[empIdx] += shiftHours;
  }
}

/** Pick the best shift for an employee-slot considering constraints and fairness/diversity */
function pickBestShift(
  empIdx: number,
  day: number,
  slot: 1 | 2,
  employees: Employee[],
  workingCodes: string[],
  shifts: Record<string, ShiftType>,
  hoursPerEmp: number[],
  consecutive: number[],
  c: AutoAssignConstraints,
  lastShift: string = ""
): string | null {
  const emp = employees[empIdx];
  const otherSlot: 1 | 2 = slot === 1 ? 2 : 1;
  const otherCode = getSlot(emp, day, otherSlot);

  // Build available shifts respecting per-employee caps and consecutive constraints
  const available = workingCodes.filter(code => {
    if (code === otherCode) return false; // avoid duplicate same day
    const shiftHours = shifts[code]?.hours ?? 0;
    if (shiftHours > 0) {
      if (hoursPerEmp[empIdx] + shiftHours > c.maxMonthlyHours) return false;
      if (consecutive[empIdx] >= c.maxConsecutiveDays) return false;
    }
    // Safe sequence guard: no morning immediately after night
    if (c.safeSequences) {
      if (isNightCode(lastShift, shifts) && isMorningCode(code, shifts)) return false;
    }
    return true;
  });

  if (available.length === 0) return null;

  // If diversity requested, prioritize missing shifts for this employee
  const empShifts = getEmployeeShifts(emp);
  if (c.diverseShifts) {
    const missing = available.filter(code => !empShifts.has(code));
    if (missing.length > 0) {
      // choose the missing shift with fewest assignments today to help fairness
      let best = missing[0];
      let bestCount = Infinity;
      for (const code of missing) {
        let count = 0;
        employees.forEach(e => { if (getSlot(e, day, 1) === code || getSlot(e, day, 2) === code) count++; });
        if (count < bestCount) { bestCount = count; best = code; }
      }
      return best;
    }
    // Otherwise avoid repeating lastShift if possible
    if (lastShift && available.includes(lastShift) && available.length > 1) {
      const filtered = available.filter(c2 => c2 !== lastShift);
      available.splice(0, available.length, ...filtered);
    }
  }

  // Fair distribution: choose shift with fewest assignments today
  if (c.fairDistribution) {
    let best = available[0];
    let bestCount = Infinity;
    for (const code of available) {
      let count = 0;
      employees.forEach(e => { if (getSlot(e, day, 1) === code || getSlot(e, day, 2) === code) count++; });
      if (count < bestCount) { bestCount = count; best = code; }
    }
    return best;
  }

  // Fallback round-robin by day index
  return available[(day - 1) % available.length];
}
