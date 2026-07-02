import { describe, it, expect } from "vitest";
import { computeStats } from "./stats";
import type { Employee } from "@/hooks/useRosterData";
import type { ShiftType } from "@/lib/roster";

const shifts: Record<string, ShiftType> = {
  M: { hours: 6, label: "صباحي", color: "199 89% 48%" },
  D: { hours: 12, label: "نهاري", color: "38 92% 50%" },
  N: { hours: 12, label: "ليلي", color: "263 70% 50%" },
  R: { hours: 0, label: "راحة", color: "142 71% 45%" },
};

describe("computeStats", () => {
  it("returns zeroed stats for empty employees list", () => {
    const result = computeStats([], shifts, 2024, 0);
    expect(result.totalEmployees).toBe(0);
    expect(result.totalShifts).toBe(0);
    expect(result.totalHours).toBe(0);
    expect(result.avgHoursPerEmployee).toBe(0);
    expect(result.topEmployee).toBeNull();
    expect(result.fullCoverageDays).toBe(0);
    expect(result.employeeHours).toEqual([]);
    expect(result.shiftDistribution).toEqual([]);
    expect(result.dailyCoverage).toHaveLength(31); // January has 31 days
    expect(result.shiftCountPerEmployee).toEqual([]);
  });

  it("computes totalEmployees correctly", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: {} },
      { name: "Bob", attendance: {} },
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    expect(result.totalEmployees).toBe(2);
  });

  it("computes totalShifts and totalHours correctly", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "M", 2: "D" } },
      { name: "Bob", attendance: { 1: "N" } },
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    // Alice: M(6) + D(12) = 18, Bob: N(12) = 12
    expect(result.totalShifts).toBe(3);
    expect(result.totalHours).toBe(30);
  });

  it("computes avgHoursPerEmployee correctly", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "M", 2: "D" } }, // 18 hours
      { name: "Bob", attendance: { 1: "N" } },            // 12 hours
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    // (18 + 12) / 2 = 15
    expect(result.avgHoursPerEmployee).toBe(15);
  });

  it("identifies the top employee by hours", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "M" } },          // 6 hours
      { name: "Bob", attendance: { 1: "D", 2: "N" } },   // 24 hours
      { name: "Charlie", attendance: { 1: "N" } },        // 12 hours
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    expect(result.topEmployee).toEqual({ name: "Bob", hours: 24 });
  });

  it("computes fullCoverageDays correctly", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "M", 2: "D", 3: "N" } },
      { name: "Bob", attendance: { 1: "N", 2: "M" } },
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    // Day 1: both assigned, Day 2: both assigned, Day 3: only Alice
    expect(result.fullCoverageDays).toBe(2);
  });

  it("computes employeeHours for each employee", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "M", 2: "M" } },  // 12 hours
      { name: "Bob", attendance: { 1: "D" } },             // 12 hours
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    expect(result.employeeHours).toEqual([
      { name: "Alice", hours: 12 },
      { name: "Bob", hours: 12 },
    ]);
  });

  it("computes shiftDistribution correctly", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "M", 2: "M", 3: "D" } },
      { name: "Bob", attendance: { 1: "N", 2: "R" } },
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    const mDist = result.shiftDistribution.find(s => s.code === "M");
    const dDist = result.shiftDistribution.find(s => s.code === "D");
    const nDist = result.shiftDistribution.find(s => s.code === "N");
    const rDist = result.shiftDistribution.find(s => s.code === "R");
    expect(mDist?.count).toBe(2);
    expect(dDist?.count).toBe(1);
    expect(nDist?.count).toBe(1);
    expect(rDist?.count).toBe(1);
    expect(mDist?.label).toBe("صباحي");
  });

  it("computes dailyCoverage (only counts shifts with hours > 0)", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "M", 2: "R" } },
      { name: "Bob", attendance: { 1: "D", 2: "N" } },
    ];
    // January 2024
    const result = computeStats(employees, shifts, 2024, 0);
    // Day 1: Alice(M, 6h) + Bob(D, 12h) = 2 working
    expect(result.dailyCoverage[0]).toEqual({ day: 1, count: 2 });
    // Day 2: Alice(R, 0h) + Bob(N, 12h) = 1 working
    expect(result.dailyCoverage[1]).toEqual({ day: 2, count: 1 });
    // Day 3+: no assignments = 0
    expect(result.dailyCoverage[2]).toEqual({ day: 3, count: 0 });
  });

  it("computes shiftCountPerEmployee correctly", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "M", 2: "M", 3: "D", 4: "R" } },
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    expect(result.shiftCountPerEmployee).toHaveLength(1);
    const alice = result.shiftCountPerEmployee[0];
    expect(alice.name).toBe("Alice");
    expect(alice.counts.M).toBe(2);
    expect(alice.counts.D).toBe(1);
    expect(alice.counts.R).toBe(1);
    expect(alice.counts.N).toBe(0);
    expect(alice.total).toBe(4);
  });

  it("handles rest shifts in total hours (0 hours)", () => {
    const employees: Employee[] = [
      { name: "Alice", attendance: { 1: "R", 2: "R", 3: "R" } },
    ];
    const result = computeStats(employees, shifts, 2024, 0);
    expect(result.totalHours).toBe(0);
    expect(result.employeeHours[0].hours).toBe(0);
  });

  it("uses correct days in month for February leap year", () => {
    const employees: Employee[] = [{ name: "Alice", attendance: {} }];
    const result = computeStats(employees, shifts, 2024, 1); // Feb 2024 (leap)
    expect(result.dailyCoverage).toHaveLength(29);
  });

  it("uses correct days in month for February non-leap year", () => {
    const employees: Employee[] = [{ name: "Alice", attendance: {} }];
    const result = computeStats(employees, shifts, 2023, 1); // Feb 2023
    expect(result.dailyCoverage).toHaveLength(28);
  });
});
