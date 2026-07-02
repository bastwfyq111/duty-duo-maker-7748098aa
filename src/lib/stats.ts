import type { Employee } from "@/hooks/useRosterData";
import { type ShiftType, getDaysArray, calcTotalHours } from "@/lib/roster";

export interface EmployeeHours {
  name: string;
  hours: number;
}

export interface ShiftDistribution {
  code: string;
  label: string;
  count: number;
  color?: string;
}

export interface DailyCoverage {
  day: number;
  count: number;
}

export interface ShiftCountPerEmployee {
  name: string;
  counts: Record<string, number>;
  total: number;
}

export interface RosterStats {
  totalEmployees: number;
  totalShifts: number;
  totalHours: number;
  avgHoursPerEmployee: number;
  topEmployee: EmployeeHours | null;
  fullCoverageDays: number;
  employeeHours: EmployeeHours[];
  shiftDistribution: ShiftDistribution[];
  dailyCoverage: DailyCoverage[];
  shiftCountPerEmployee: ShiftCountPerEmployee[];
}

export function computeStats(
  employees: Employee[],
  shifts: Record<string, ShiftType>,
  year: number,
  month: number
): RosterStats {
  const days = getDaysArray(year, month);

  const employeeHours: EmployeeHours[] = employees.map(emp => ({
    name: emp.name,
    hours: calcTotalHours(emp.attendance, shifts),
  }));

  const shiftCounts: Record<string, number> = {};
  let totalShifts = 0;
  employees.forEach(emp => {
    Object.values(emp.attendance).forEach(code => {
      if (!code) return;
      shiftCounts[code] = (shiftCounts[code] || 0) + 1;
      totalShifts++;
    });
  });

  const shiftDistribution: ShiftDistribution[] = Object.entries(shiftCounts).map(([code, count]) => ({
    code,
    label: shifts[code]?.label || code,
    count,
    color: shifts[code]?.color,
  }));

  const dailyCoverage: DailyCoverage[] = days.map(d => {
    let count = 0;
    employees.forEach(emp => {
      const code = emp.attendance[d];
      if (code && (shifts[code]?.hours ?? 0) > 0) count++;
    });
    return { day: d, count };
  });

  const shiftCountPerEmployee: ShiftCountPerEmployee[] = employees.map(emp => {
    const counts: Record<string, number> = {};
    let total = 0;
    Object.keys(shifts).forEach(code => { counts[code] = 0; });
    Object.values(emp.attendance).forEach(code => {
      if (code in counts) {
        counts[code]++;
        total++;
      }
    });
    return { name: emp.name, counts, total };
  });

  const totalHours = employeeHours.reduce((s, e) => s + e.hours, 0);
  const avgHoursPerEmployee = employees.length ? totalHours / employees.length : 0;
  const topEmployee = employeeHours.length
    ? employeeHours.reduce((max, e) => (e.hours > max.hours ? e : max), employeeHours[0])
    : null;

  // Full coverage = days where everyone had something assigned (and at least 1 emp)
  const fullCoverageDays = employees.length
    ? days.filter(d => employees.every(emp => !!emp.attendance[d])).length
    : 0;

  return {
    totalEmployees: employees.length,
    totalShifts,
    totalHours,
    avgHoursPerEmployee,
    topEmployee,
    fullCoverageDays,
    employeeHours,
    shiftDistribution,
    dailyCoverage,
    shiftCountPerEmployee,
  };
}
