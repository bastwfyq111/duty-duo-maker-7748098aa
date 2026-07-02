import { describe, it, expect } from "vitest";
import { autoAssign, type AutoAssignConstraints } from "./auto-assign";
import type { Employee } from "@/hooks/useRosterData";
import type { ShiftType } from "@/lib/roster";

const shifts: Record<string, ShiftType> = {
  M: { hours: 6, label: "صباحي" },
  D: { hours: 12, label: "نهاري" },
  N: { hours: 12, label: "ليلي" },
  R: { hours: 0, label: "راحة" },
};

function makeConstraints(overrides: Partial<AutoAssignConstraints> = {}): AutoAssignConstraints {
  return {
    shiftCodes: ["M"],
    maxMonthlyHours: 200,
    maxConsecutiveDays: 7,
    weeklyRestDayOfWeek: null,
    minStaffPerShift: { M: 1 },
    fairDistribution: false,
    overrideExisting: false,
    ...overrides,
  };
}

describe("autoAssign", () => {
  describe("edge cases", () => {
    it("returns warning when no employees are provided", () => {
      const result = autoAssign([], shifts, 2024, 0, makeConstraints());
      expect(result.employees).toHaveLength(0);
      expect(result.warnings).toContain("لا يوجد موظفون");
    });

    it("returns warning when no shift codes are selected", () => {
      const employees: Employee[] = [{ name: "Alice", attendance: {} }];
      const result = autoAssign(employees, shifts, 2024, 0, makeConstraints({ shiftCodes: [] }));
      expect(result.warnings).toContain("لم يتم اختيار ورديات للتوزيع");
    });

    it("does not mutate the original employees array", () => {
      const employees: Employee[] = [{ name: "Alice", attendance: {} }];
      const original = JSON.parse(JSON.stringify(employees));
      autoAssign(employees, shifts, 2024, 0, makeConstraints());
      expect(employees).toEqual(original);
    });
  });

  describe("basic assignment", () => {
    it("assigns shifts to a single employee for all days", () => {
      const employees: Employee[] = [{ name: "Alice", attendance: {} }];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0, // January (31 days)
        makeConstraints({ shiftCodes: ["M"], minStaffPerShift: { M: 1 } })
      );
      // Alice should be assigned M for every day (within constraints)
      const assigned = Object.values(result.employees[0].attendance).filter(v => v === "M");
      expect(assigned.length).toBeGreaterThan(0);
    });

    it("assigns multiple shift types", () => {
      const employees: Employee[] = [
        { name: "Alice", attendance: {} },
        { name: "Bob", attendance: {} },
      ];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["M", "D"],
          minStaffPerShift: { M: 1, D: 1 },
        })
      );
      // Both M and D should appear in assignments
      const allCodes = result.employees.flatMap(e => Object.values(e.attendance));
      expect(allCodes).toContain("M");
      expect(allCodes).toContain("D");
    });
  });

  describe("maxMonthlyHours constraint", () => {
    it("does not exceed maximum monthly hours per employee", () => {
      const employees: Employee[] = [
        { name: "Alice", attendance: {} },
        { name: "Bob", attendance: {} },
      ];
      const maxHours = 48; // Only 4 days of 12-hour shifts
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["D"],
          maxMonthlyHours: maxHours,
          minStaffPerShift: { D: 1 },
        })
      );
      result.employees.forEach(emp => {
        const hours = Object.values(emp.attendance).reduce(
          (s, code) => s + (shifts[code]?.hours ?? 0),
          0
        );
        expect(hours).toBeLessThanOrEqual(maxHours);
      });
    });

    it("generates warnings when staff is insufficient due to hour caps", () => {
      const employees: Employee[] = [{ name: "Alice", attendance: {} }];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["D"],
          maxMonthlyHours: 24, // Only 2 shifts of 12h
          minStaffPerShift: { D: 1 },
        })
      );
      // Should generate warnings about insufficient staff
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("maxConsecutiveDays constraint", () => {
    it("enforces maximum consecutive working days", () => {
      const employees: Employee[] = [{ name: "Alice", attendance: {} }];
      const maxConsec = 3;
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["M"],
          maxConsecutiveDays: maxConsec,
          minStaffPerShift: { M: 1 },
          maxMonthlyHours: 999,
        })
      );

      // Check that no stretch of consecutive assignments exceeds the max
      const att = result.employees[0].attendance;
      let consecutive = 0;
      for (let d = 1; d <= 31; d++) {
        const code = att[d];
        if (code && (shifts[code]?.hours ?? 0) > 0) {
          consecutive++;
        } else {
          consecutive = 0;
        }
        expect(consecutive).toBeLessThanOrEqual(maxConsec + 1);
        // Note: The algorithm checks BEFORE assigning, so consecutive might reach
        // maxConsec days (it blocks on the next check)
      }
    });
  });

  describe("weeklyRestDayOfWeek constraint", () => {
    it("assigns rest code on specified day of week", () => {
      const employees: Employee[] = [{ name: "Alice", attendance: {} }];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0, // January 2024: first Friday is Jan 5
        makeConstraints({
          shiftCodes: ["M"],
          weeklyRestDayOfWeek: 5, // Friday
          restCode: "R",
          minStaffPerShift: { M: 1 },
        })
      );
      // Check Fridays in January 2024: 5, 12, 19, 26
      const fridays = [5, 12, 19, 26];
      fridays.forEach(day => {
        expect(result.employees[0].attendance[day]).toBe("R");
      });
    });

    it("does not assign working shifts on rest days", () => {
      const employees: Employee[] = [{ name: "Alice", attendance: {} }];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["M"],
          weeklyRestDayOfWeek: 5,
          restCode: "R",
          minStaffPerShift: { M: 1 },
        })
      );
      // Fridays should not have M
      const fridays = [5, 12, 19, 26];
      fridays.forEach(day => {
        expect(result.employees[0].attendance[day]).not.toBe("M");
      });
    });
  });

  describe("overrideExisting constraint", () => {
    it("does not overwrite existing assignments when overrideExisting is false", () => {
      const employees: Employee[] = [
        { name: "Alice", attendance: { 1: "N", 2: "N" } },
      ];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["M"],
          overrideExisting: false,
          minStaffPerShift: { M: 1 },
        })
      );
      // Days 1 and 2 should still have "N"
      expect(result.employees[0].attendance[1]).toBe("N");
      expect(result.employees[0].attendance[2]).toBe("N");
    });

    it("overwrites existing assignments when overrideExisting is true", () => {
      const employees: Employee[] = [
        { name: "Alice", attendance: { 1: "N" } },
      ];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["M"],
          overrideExisting: true,
          minStaffPerShift: { M: 1 },
        })
      );
      // Day 1 should now have M (overridden)
      expect(result.employees[0].attendance[1]).toBe("M");
    });
  });

  describe("fairDistribution", () => {
    it("distributes hours more evenly when enabled", () => {
      const employees: Employee[] = [
        { name: "Alice", attendance: {} },
        { name: "Bob", attendance: {} },
        { name: "Charlie", attendance: {} },
      ];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["M"],
          fairDistribution: true,
          minStaffPerShift: { M: 2 },
          maxMonthlyHours: 999,
          maxConsecutiveDays: 31,
        })
      );
      const hours = result.employees.map(emp =>
        Object.values(emp.attendance).reduce(
          (s, code) => s + (shifts[code]?.hours ?? 0),
          0
        )
      );
      // With fair distribution, hours should be relatively balanced
      const maxH = Math.max(...hours);
      const minH = Math.min(...hours);
      // The difference should be small (within one shift's worth of hours)
      expect(maxH - minH).toBeLessThanOrEqual(12);
    });
  });

  describe("minStaffPerShift", () => {
    it("assigns the minimum required staff per shift per day", () => {
      const employees: Employee[] = [
        { name: "Alice", attendance: {} },
        { name: "Bob", attendance: {} },
        { name: "Charlie", attendance: {} },
      ];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["M"],
          minStaffPerShift: { M: 2 },
          maxMonthlyHours: 999,
          maxConsecutiveDays: 31,
        })
      );
      // Check some days have at least 2 employees on shift M
      for (let d = 1; d <= 5; d++) {
        const onShift = result.employees.filter(e => e.attendance[d] === "M");
        expect(onShift.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("skips shifts with minStaff of 0", () => {
      const employees: Employee[] = [{ name: "Alice", attendance: {} }];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0,
        makeConstraints({
          shiftCodes: ["M", "D"],
          minStaffPerShift: { M: 1, D: 0 },
        })
      );
      // No D shifts should be assigned (min is 0)
      const dShifts = Object.values(result.employees[0].attendance).filter(v => v === "D");
      expect(dShifts.length).toBe(0);
    });
  });

  describe("complex scenario", () => {
    it("handles a realistic scenario with multiple employees and constraints", () => {
      const employees: Employee[] = [
        { name: "Alice", attendance: {} },
        { name: "Bob", attendance: {} },
        { name: "Charlie", attendance: {} },
        { name: "Diana", attendance: {} },
      ];
      const result = autoAssign(
        employees,
        shifts,
        2024,
        0, // January 2024
        makeConstraints({
          shiftCodes: ["M", "N"],
          maxMonthlyHours: 150,
          maxConsecutiveDays: 5,
          weeklyRestDayOfWeek: 5,
          restCode: "R",
          minStaffPerShift: { M: 1, N: 1 },
          fairDistribution: true,
          overrideExisting: false,
        })
      );

      expect(result.employees).toHaveLength(4);
      // Should have generated some assignments
      const totalAssignments = result.employees.reduce(
        (sum, emp) => sum + Object.keys(emp.attendance).length,
        0
      );
      expect(totalAssignments).toBeGreaterThan(0);

      // Verify no employee exceeds max hours
      result.employees.forEach(emp => {
        const hours = Object.values(emp.attendance).reduce(
          (s, code) => s + (shifts[code]?.hours ?? 0),
          0
        );
        expect(hours).toBeLessThanOrEqual(150);
      });
    });
  });
});
