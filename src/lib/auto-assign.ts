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
  safeSequences?: boolean;                    // ✨ منع الصباح بعد الليل، وتقييد الليالي الم��تالية  
  maxConsecutiveNights?: number;              // افتراضي 2  
  // أوزان العدالة القابلة للتخصيص  
  weightHours?: number;                        // أهمية موازنة الساعات (افتراضي 5)  
  weightWorkUnits?: number;                    // أهمية موازنة عدد الورديات (افتراضي 2)  
  // ✨ التوزيع الأفقي العشوائي: يملأ صف كل موظف عشوائياً مع موازنة الساعات  
  randomHorizontal?: boolean;                  // تفعيل التوزيع الأفقي العشوائي  
  // --- إضافات جديدة لدعم ترتيب الورديات وملء كل الأيام ---
  ordering?: string[] | Record<string, string[]>; // ترتيب تفضيلي لأكواد الورديات (عام أو لكل موظف بـ key=اسم الموظف)
  fillAllDays?: boolean;                        // إذا true → حاول ملء كل الخانات بتغاضي عن بعض القيود عند الحاجة
  strictPriority?: boolean;                     // إذا true → تعامل مع ordering كقيد صارم (لا تجرِ تراجع)
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
function candidateScore(  
  i: number,  
  hoursPerEmp: number[],  
  workUnits: number[],  
  consecutive: number[],  
  lastShift: string,  
  code: string,  
  c: AutoAssignConstraints  
) {  
  const wHours = c.weightHours ?? 5;  
  const wUnits = c.weightWorkUnits ?? 2;  
  // base: current hours (prefer lower) — primary fairness signal  
  let score = hoursPerEmp[i] * wHours;  
  // secondary: prefer employees with fewer assigned working slots (balance count too)  
  // multiplier keeps unit weight meaningful against the much larger hours values  
  score += workUnits[i] * (wUnits * 5);  
  // penalize long consecutive streaks  
  score += consecutive[i] * 3;  
  // penalize if lastShift equals code to encourage diversity  
  if (lastShift === code) score += 12;  
  // deterministic tie-breaker so equal scores resolve consistently  
  score += i * 0.001;  
  return score;  
}  
  
/**  
 * ✨ التوزيع الأفقي العشوائي:  
 * يمرّ على الأيام، ويملأ لكل موظف الخانتين بورديات مختارة عشوائياً من الورديات  
 * المسموح بها، مع مراعاة الشروط (الحد الأقصى للساعات، أيام العمل المتتالية،  
 * التسلسلات الآمنة). عند مخالفة الشرط للخانة الثانية تُدمج الخلية وتصبح خانة  
 * واحدة (تُترك الخانة الثانية فارغة). ترتيب الموظفين يبدأ بالأقل ساعات لضمان  
 * توزيع متساوٍ للساعات بين الجميع.  
 */  
function shuffleArray<T>(arr: T[]): T[] {  
  const a = [...arr];  
  for (let i = a.length - 1; i > 0; i--) {  
    const j = Math.floor(Math.random() * (i + 1));  
    [a[i], a[j]] = [a[j], a[i]];  
  }  
  return a;  
}  
  
/** اختيار وردية عمل مؤهلة عشوائياً وفق الشروط، أو null إذا لا يوجد */  
function pickRandomEligible(  
  workingCodes: string[],  
  curHours: number,  
  maxHours: number,  
  sameDayOther: string,  
  prevDayShift: string,  
  shifts: Record<string, ShiftType>,  
  c: AutoAssignConstraints  
): string | null {  
  const eligible = workingCodes.filter(code => {  
    const h = shifts[code]?.hours ?? 0;  
    if (curHours + h > maxHours) return false;         // يخالف الحد الأقصى للساعات  
    if (sameDayOther && code === sameDayOther) return false; // تفادي تكرار نفس الوردية باليوم  
    if (c.safeSequences) {  
      // منع الصباح مباشرة بعد الليل  
      if (isNightCode(prevDayShift, shifts) && isMorningCode(code, shifts)) return false;  
    }  
    return true;  
  });  
  if (eligible.length === 0) {  
    // If ordering present and fillAllDays true, try relaxed eligibility (ignore hours/consecutive)
    if (c.fillAllDays) {  
      const relaxed = workingCodes.filter(code => {  
        if (sameDayOther && code === sameDayOther) return false;  
        if (c.safeSequences) { if (isNightCode(prevDayShift, shifts) && isMorningCode(code, shifts)) return false; }  
        return true;  
      });  
      if (relaxed.length === 0) return null;  
      // honor ordering preference if provided
      if (Array.isArray(c.ordering) && c.ordering.length > 0) {  
        for (const oc of c.ordering) if (relaxed.includes(oc)) return oc;  
      }  
      return relaxed[0];  
    }  
    return null;  
  }  
  // If ordering provided and not strictPriority, prefer ordering else randomize
  if (Array.isArray(c.ordering) && c.ordering.length > 0) {  
    for (const oc of c.ordering) if (eligible.includes(oc)) return oc;  
  }  
  return shuffleArray(eligible)[0];  
}  
  
function autoAssignRandomHorizontal(  
  next: Employee[],  
  shifts: Record<string, ShiftType>,  
  year: number,  
  month: number,  
  daysInMonth: number,  
  c: AutoAssignConstraints,  
  warnings: string[]  
): void {  
  const workingCodes = c.shiftCodes.filter(code => (shifts[code]?.hours ?? 0) > 0);  
  const restCodes = c.shiftCodes.filter(code => (shifts[code]?.hours ?? 0) === 0);  
  const restCode = restCodes[0] ?? c.restCode ?? "";  
  
  if (workingCodes.length === 0) {  
    warnings.push("لم يتم اختيار ورديات عمل للتوزيع");  
    return;  
  }  
  
  const hoursPerEmp = next.map(emp => calcTotalHours(emp.attendance, shifts));  
  const consecutive = next.map(() => 0);  
  const lastShiftPerEmp = next.map(() => "");  
  const maxHours = c.maxMonthlyHours;  
  const maxConsec = c.maxConsecutiveDays;  
  
  for (let day = 1; day <= daysInMonth; day++) {  
    // تحديث عد�... (truncated content)