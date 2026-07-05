import { loadFromStorage, saveToStorage } from "@/lib/storage-utils";

export const MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

export const DAY_NAMES = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

/** اتجاه التوزيع التلقائي للوردية */
export type ShiftDirection = "horizontal" | "vertical";

export interface ShiftType {
  hours: number;
  label: string;
  color?: string;
  // ✨ شروط التوزيع التلقائي لكل وردية
  // vertical = نفس اليوم لعدة موظفين (count = عدد الموظفين لكل يوم)
  // horizontal = صف الموظف عبر الأيام (count = عدد الأيام في الشهر لكل موظف)
  direction?: ShiftDirection;
  count?: number;
}

const DEFAULT_SHIFTS: Record<string, ShiftType> = {
  M: { hours: 6, label: "صباحي", color: "204 94% 44%", direction: "vertical", count: 1 },   // أزرق سماوي واضح
  D: { hours: 12, label: "نهاري", color: "28 96% 48%", direction: "vertical", count: 1 },   // برتقالي كهرماني واضح
  N: { hours: 12, label: "ليلي", color: "256 72% 46%", direction: "vertical", count: 1 },   // بنفسجي نيلي غامق واضح
  R: { hours: 0, label: "راحة", color: "150 72% 38%" },    // أخضر واضح
  OFF: { hours: 0, label: "إجازة", color: "215 16% 47%" }, // رمادي واضح
};

const SHIFTS_KEY = "rosterShifts";

export function loadShifts(): Record<string, ShiftType> {
  return loadFromStorage<Record<string, ShiftType>>(SHIFTS_KEY, { ...DEFAULT_SHIFTS });
}

export function saveShifts(shifts: Record<string, ShiftType>) {
  saveToStorage(SHIFTS_KEY, shifts);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getDaysArray(year: number, month: number): number[] {
  return Array.from({ length: getDaysInMonth(year, month) }, (_, i) => i + 1);
}

export function isWeekend(year: number, month: number, day: number): boolean {
  const d = new Date(year, month, day).getDay();
  return d === 5 || d === 6;
}

export function isFriday(year: number, month: number, day: number): boolean {
  return new Date(year, month, day).getDay() === 5;
}

export function getDayName(year: number, month: number, day: number): string {
  return DAY_NAMES[new Date(year, month, day).getDay()];
}

// التعديل هنا: تم تغيير نوع المفتاح من number إلى string | number ليدعم نظام الخليتين
// وتم تعديل الحساب ليأخذ كل وردية مرة واحدة في اليوم (إذا كانت الورديات مكررة في الخليتين)
export function calcTotalHours(attendance: Record<string | number, string>, shifts: Record<string, ShiftType>): number {
  // keys are like "{day}-{slot}" e.g. "1-1", "1-2"
  // We'll iterate days by extracting day numbers from keys, collect unique codes per day,
  // and sum each unique shift's hours once per day.
  const codesByDay: Record<number, Set<string>> = {};
  Object.entries(attendance).forEach(([k, code]) => {
    if (!code) return;
    const parts = String(k).split("-");
    const day = Number(parts[0]);
    if (Number.isNaN(day)) return;
    if (!codesByDay[day]) codesByDay[day] = new Set<string>();
    codesByDay[day].add(code);
  });

  let sum = 0;
  Object.values(codesByDay).forEach(set => {
    set.forEach(code => {
      sum += shifts[code]?.hours ?? 0;
    });
  });
  return sum;
}
