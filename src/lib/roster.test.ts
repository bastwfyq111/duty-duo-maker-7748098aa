import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MONTH_NAMES,
  DAY_NAMES,
  getDaysInMonth,
  isWeekend,
  isFriday,
  getDayName,
  calcTotalHours,
  loadShifts,
  saveShifts,
  type ShiftType,
} from "./roster";

describe("roster constants", () => {
  it("MONTH_NAMES has 12 entries", () => {
    expect(MONTH_NAMES).toHaveLength(12);
  });

  it("DAY_NAMES has 7 entries", () => {
    expect(DAY_NAMES).toHaveLength(7);
  });
});

describe("getDaysInMonth", () => {
  it("returns 31 for January (month 0)", () => {
    expect(getDaysInMonth(2024, 0)).toBe(31);
  });

  it("returns 29 for February in a leap year", () => {
    expect(getDaysInMonth(2024, 1)).toBe(29);
  });

  it("returns 28 for February in a non-leap year", () => {
    expect(getDaysInMonth(2023, 1)).toBe(28);
  });

  it("returns 30 for April (month 3)", () => {
    expect(getDaysInMonth(2024, 3)).toBe(30);
  });

  it("returns 31 for December (month 11)", () => {
    expect(getDaysInMonth(2024, 11)).toBe(31);
  });
});

describe("isWeekend", () => {
  // Friday = 5, Saturday = 6 are weekends in this app
  it("returns true for Friday", () => {
    // 2024-01-05 is a Friday (month 0, day 5)
    expect(isWeekend(2024, 0, 5)).toBe(true);
  });

  it("returns true for Saturday", () => {
    // 2024-01-06 is a Saturday
    expect(isWeekend(2024, 0, 6)).toBe(true);
  });

  it("returns false for Sunday", () => {
    // 2024-01-07 is a Sunday
    expect(isWeekend(2024, 0, 7)).toBe(false);
  });

  it("returns false for Wednesday", () => {
    // 2024-01-03 is a Wednesday
    expect(isWeekend(2024, 0, 3)).toBe(false);
  });
});

describe("isFriday", () => {
  it("returns true for a Friday", () => {
    // 2024-01-05 is a Friday
    expect(isFriday(2024, 0, 5)).toBe(true);
  });

  it("returns false for Saturday", () => {
    // 2024-01-06 is a Saturday
    expect(isFriday(2024, 0, 6)).toBe(false);
  });

  it("returns false for a weekday", () => {
    // 2024-01-03 is a Wednesday
    expect(isFriday(2024, 0, 3)).toBe(false);
  });
});

describe("getDayName", () => {
  it("returns the correct Arabic day name for Sunday", () => {
    // 2024-01-07 is Sunday (index 0)
    expect(getDayName(2024, 0, 7)).toBe("أحد");
  });

  it("returns the correct Arabic day name for Friday", () => {
    // 2024-01-05 is Friday (index 5)
    expect(getDayName(2024, 0, 5)).toBe("جمعة");
  });

  it("returns the correct Arabic day name for Saturday", () => {
    // 2024-01-06 is Saturday (index 6)
    expect(getDayName(2024, 0, 6)).toBe("سبت");
  });
});

describe("calcTotalHours", () => {
  const shifts: Record<string, ShiftType> = {
    M: { hours: 6, label: "صباحي" },
    D: { hours: 12, label: "نهاري" },
    N: { hours: 12, label: "ليلي" },
    R: { hours: 0, label: "راحة" },
  };

  it("returns 0 for empty attendance", () => {
    expect(calcTotalHours({}, shifts)).toBe(0);
  });

  it("sums hours correctly for numeric keys", () => {
    const attendance: Record<number, string> = { 1: "M", 2: "D", 3: "N" };
    // 6 + 12 + 12 = 30
    expect(calcTotalHours(attendance, shifts)).toBe(30);
  });

  it("handles rest shifts with 0 hours", () => {
    const attendance: Record<number, string> = { 1: "M", 2: "R", 3: "D" };
    // 6 + 0 + 12 = 18
    expect(calcTotalHours(attendance, shifts)).toBe(18);
  });

  it("handles unknown shift codes gracefully (defaults to 0)", () => {
    const attendance: Record<number, string> = { 1: "M", 2: "UNKNOWN" };
    // 6 + 0 = 6
    expect(calcTotalHours(attendance, shifts)).toBe(6);
  });

  it("works with string keys (slot format)", () => {
    const attendance: Record<string, string> = { "1-1": "M", "1-2": "N", "2-1": "D" };
    // 6 + 12 + 12 = 30
    expect(calcTotalHours(attendance, shifts)).toBe(30);
  });
});

describe("loadShifts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default shifts when localStorage is empty", () => {
    const shifts = loadShifts();
    expect(shifts).toHaveProperty("M");
    expect(shifts).toHaveProperty("D");
    expect(shifts).toHaveProperty("N");
    expect(shifts).toHaveProperty("R");
    expect(shifts).toHaveProperty("OFF");
    expect(shifts.M.hours).toBe(6);
    expect(shifts.D.hours).toBe(12);
  });

  it("returns saved shifts from localStorage", () => {
    const custom = { X: { hours: 8, label: "Custom" } };
    localStorage.setItem("rosterShifts", JSON.stringify(custom));
    const shifts = loadShifts();
    expect(shifts).toEqual(custom);
  });

  it("returns default shifts on invalid JSON", () => {
    localStorage.setItem("rosterShifts", "not json");
    const shifts = loadShifts();
    expect(shifts).toHaveProperty("M");
  });
});

describe("saveShifts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves shifts to localStorage", () => {
    const custom: Record<string, ShiftType> = { X: { hours: 8, label: "Custom" } };
    saveShifts(custom);
    const stored = JSON.parse(localStorage.getItem("rosterShifts")!);
    expect(stored).toEqual(custom);
  });
});
