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
  // أوزان العدالة القابلة للتخصيص
  weightHours?: number;                        // أهمية موازنة الساعات (افتراضي 5)
  weightWorkUnits?: number;                    // أهمية موازنة عدد الورديات (افتراضي 2)
  // ✨ التوزيع الأفقي العشوائي: يملأ صف كل موظف عشوائياً مع موازنة الساعات
  randomHorizontal?: boolean;                  // تفعيل التوزيع الأفقي العشوائي
  // --- ترتيب الورديات وملء كل الأيام ---
  ordering?: string[] | Record<string, string[]>; // ترتيب تفضيلي لأكواد الورديات (عام أو لكل موظف بـ key=اسم الموظف)
  fillAllDays?: boolean;                        // إذا true → حاول ملء كل الخانات بتغاضي عن بعض القيود عند الحاجة
  strictPriority?: boolean;                     // إذا true → تعامل مع ordering كقيد صارم (لا تجرِ تراجع)
  // ✨ نمط تسلسلي شهري: تكرار دوري لترتيب ورديات محدد لكل الشهر (مثال: M,D,R يتكرر)
  sequencePattern?: string[];                   // يشمل رمز الراحة إن أردت يوم عطلة ضمن الدورة
  useSequencePattern?: boolean;                 // تفعيل النمط (له أولوية على العشوائية عند الخانة الأولى)
  sequenceStagger?: boolean;                    // إزاحة بداية النمط حسب ترتيب الموظف (تفادي تطابق الجميع بنفس اليوم)
  // ✨ حصة ثابتة لكل نوع وردية خلال الشهر (نفس العدد لكل الموظفين)
  shiftQuotas?: Record<string, number>;
  useShiftQuotas?: boolean;
  // ✨ التوزيع حسب شروط كل وردية (اتجاه + عدد) بترتيب إضافة الورديات
  useShiftConditions?: boolean;
  // ✨ شروط كل وردية تُدخل مباشرة من نافذة التوزيع (لها الأولوية على شروط الوردية نفسها)
  shiftConditions?: Record<string, { direction?: "vertical" | "horizontal"; count?: number }>;
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

/** ✨ وردية 12 ساعة أو وردية الراحة R تشغل اليوم كاملاً — لا يجوز وجود وردية ثانية معها بنفس اليوم */
function isFullDayCode(code: string, shifts: Record<string, ShiftType>): boolean {
  if (!code) return false;
  if ((shifts[code]?.hours ?? 0) === 12) return true;
  return code.trim().toUpperCase() === "R";
}

/**
 * ✨ يمرّ على كل الموظفين وكل الأيام: لو احتوت الخلية على وردية 12 ساعة أو R
 * (في أي من الخانتين)، تُفرَّغ الخانة الثانية مباشرة فتُعرض الخليتان مدمجتين كخلية واحدة.
 */
function enforceFullDayMerge(
  employees: Employee[],
  shifts: Record<string, ShiftType>,
  daysInMonth: number
): void {
  employees.forEach(emp => {
    for (let day = 1; day <= daysInMonth; day++) {
      const k1 = slotKey(day, 1), k2 = slotKey(day, 2);
      const v1 = emp.attendance[k1] || "";
      const v2 = emp.attendance[k2] || "";
      const full1 = isFullDayCode(v1, shifts);
      const full2 = isFullDayCode(v2, shifts);
      if (full1 || full2) {
        // نُبقي الوردية كاملة اليوم في الخانة الأولى ونُفرغ الثانية (دمج مباشر)
        emp.attendance[k1] = full1 ? v1 : v2;
        emp.attendance[k2] = "";
      }
    }
  });
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

/** اختيار وردية عمل مؤهلة عشوائياً وفق الشروط (مع مراعاة الحصة إن وُجدت)، أو null إذا لا يوجد */
function pickRandomEligible(
  workingCodes: string[],
  curHours: number,
  maxHours: number,
  sameDayOther: string,
  prevDayShift: string,
  shifts: Record<string, ShiftType>,
  c: AutoAssignConstraints,
  quotaOk?: (code: string) => boolean
): string | null {
  const eligible = workingCodes.filter(code => {
    const h = shifts[code]?.hours ?? 0;
    if (curHours + h > maxHours) return false;         // يخالف الحد الأقصى للساعات
    if (sameDayOther && code === sameDayOther) return false; // تفادي تكرار نفس الوردية باليوم
    if (c.safeSequences) {
      // منع الصباح مباشرة بعد الليل
      if (isNightCode(prevDayShift, shifts) && isMorningCode(code, shifts)) return false;
    }
    if (quotaOk && !quotaOk(code)) return false;        // ✨ تجاوز الحصة المحددة لهذه الوردية
    return true;
  });
  if (eligible.length === 0) {
    // If fillAllDays true, try relaxed eligibility (ignore hours/consecutive, وكحل أخير: تجاهل الحصة أيضاً)
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
  if (Array.isArray(c.ordering) && c.ordering.length > 0 && !c.strictPriority) {
    for (const oc of c.ordering) if (eligible.includes(oc)) return oc;
  }
  return shuffleArray(eligible)[0];
}

/**
 * ✨ يحاول اختيار الوردية من النمط التسلسلي عند موضع معيّن ضمن الدورة.
 * لو الموضع الأساسي يمثل يوم راحة في الدورة، تُعتمد الراحة مباشرة.
 * لو الموضع الأساسي وردية عمل لكنها غير مؤهلة (حصة/ساعات/تسلسل آمن)، يبحث
 * للأمام ضمن باقي الدورة عن أقرب وردية عمل مؤهلة قبل الاستسلام.
 */
function pickFromPattern(
  pattern: string[],
  startPos: number,
  curHours: number,
  maxHours: number,
  sameDayOther: string,
  prevDayShift: string,
  shifts: Record<string, ShiftType>,
  c: AutoAssignConstraints,
  quotaOk: (code: string) => boolean
): { code: string; isRest: boolean } | null {
  const n = pattern.length;
  if (n === 0) return null;

  const first = pattern[startPos % n];
  if ((shifts[first]?.hours ?? 0) === 0) {
    // الموضع الأساسي هو يوم راحة حسب الدورة — يُعتمد كما هو
    return { code: first, isRest: true };
  }

  for (let step = 0; step < n; step++) {
    const code = pattern[(startPos + step) % n];
    const hours = shifts[code]?.hours ?? 0;
    if (hours === 0) continue; // مواضع الراحة الأخرى في الدورة لا تهمنا هنا، نبحث عن بديل عمل
    if (curHours + hours > maxHours) continue;
    if (sameDayOther && code === sameDayOther) continue;
    if (c.safeSequences && isNightCode(prevDayShift, shifts) && isMorningCode(code, shifts)) continue;
    if (!quotaOk(code)) continue;
    return { code, isRest: false };
  }
  return null;
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

  // ✨ النمط التسلسلي الشهري
  const useSeq = !!c.useSequencePattern && Array.isArray(c.sequencePattern) && c.sequencePattern.length > 0;
  const pattern = c.sequencePattern ?? [];

  // ✨ الحصص الثابتة لكل وردية
  const useQuotas = !!c.useShiftQuotas && !!c.shiftQuotas;
  const shiftCounts: Record<string, number>[] = next.map(emp => {
    const counts: Record<string, number> = {};
    Object.values(emp.attendance).forEach(code => {
      if (code && (shifts[code]?.hours ?? 0) > 0) counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  });
  const quotaOkFor = (empIdx: number) => (code: string): boolean => {
    if (!useQuotas) return true;
    const q = c.shiftQuotas![code];
    if (q === undefined) return true;
    return (shiftCounts[empIdx][code] ?? 0) < q;
  };

  for (let day = 1; day <= daysInMonth; day++) {
    // تحديث عدّاد أيام العمل المتتالية بناءً على الأمس
    if (day > 1) {
      next.forEach((emp, i) => {
        consecutive[i] = dayHasWork(emp, day - 1, shifts) ? consecutive[i] + 1 : 0;
        lastShiftPerEmp[i] = getSlot(emp, day - 1, 2) || getSlot(emp, day - 1, 1) || "";
      });
    }

    // يوم الراحة الأسبوعي
    const dow = new Date(year, month, day).getDay();
    if (c.weeklyRestDayOfWeek !== null && restCode && dow === c.weeklyRestDayOfWeek) {
      next.forEach((emp, i) => {
        const k1 = slotKey(day, 1), k2 = slotKey(day, 2);
        if (!emp.attendance[k1] || c.overrideExisting) {
          emp.attendance[k1] = restCode;
          emp.attendance[k2] = "";
          consecutive[i] = 0;
        }
      });
      continue;
    }

    // ترتيب الموظفين: الأقل ساعات أولاً لضمان توزيع متساوٍ للساعات
    const order = next.map((_, i) => i).sort((a, b) => hoursPerEmp[a] - hoursPerEmp[b]);

    for (const i of order) {
      const emp = next[i];
      const k1 = slotKey(day, 1), k2 = slotKey(day, 2);

      // احترام الخلايا الممتلئة مسبقاً
      if (emp.attendance[k1] && !c.overrideExisting) continue;

      // تجاوز الحد الأقصى لأيام العمل المتتالية → راحة (خلية مدمجة)
      if (consecutive[i] >= maxConsec) {
        emp.attendance[k1] = restCode;
        emp.attendance[k2] = "";
        consecutive[i] = 0;
        continue;
      }

      // === الخانة الأولى ===
      let pick1: string | null = null;

      if (useSeq) {
        const pos = (day - 1 + (c.sequenceStagger ? i : 0)) % pattern.length;
        const patternResult = pickFromPattern(
          pattern, pos, hoursPerEmp[i], maxHours, "", lastShiftPerEmp[i], shifts, c, quotaOkFor(i)
        );
        if (patternResult?.isRest) {
          emp.attendance[k1] = restCode || patternResult.code;
          emp.attendance[k2] = "";
          continue; // يوم راحة حسب النمط التسلسلي
        }
        if (patternResult) pick1 = patternResult.code;
      }

      // لو النمط غير مفعّل أو ما قدر يوجد بديل مؤهل ضمن الدورة → الاختيار المعتاد
      if (!pick1) {
        pick1 = pickRandomEligible(workingCodes, hoursPerEmp[i], maxHours, "", lastShiftPerEmp[i], shifts, c, quotaOkFor(i));
      }

      if (!pick1) {
        // لا توجد وردية مؤهلة → راحة/خلية مدمجة فارغة
        emp.attendance[k1] = restCode;
        emp.attendance[k2] = "";
        continue;
      }
      emp.attendance[k1] = pick1;
      hoursPerEmp[i] += shifts[pick1]?.hours ?? 0;
      shiftCounts[i][pick1] = (shiftCounts[i][pick1] || 0) + 1;

      // === الخانة الثانية — عشوائية دائماً، مع احترام الحصة ===
      const pick2 = pickRandomEligible(workingCodes, hoursPerEmp[i], maxHours, pick1, lastShiftPerEmp[i], shifts, c, quotaOkFor(i));
      if (pick2) {
        emp.attendance[k2] = pick2;
        hoursPerEmp[i] += shifts[pick2]?.hours ?? 0;
        shiftCounts[i][pick2] = (shiftCounts[i][pick2] || 0) + 1;
      } else {
        emp.attendance[k2] = ""; // دمج → خلية واحدة
      }
    }
  }

  // ✨ تنبيهات الحصص: هل وصل كل موظف للعدد المطلوب من كل وردية؟
  if (useQuotas) {
    next.forEach((emp, i) => {
      Object.entries(c.shiftQuotas!).forEach(([code, target]) => {
        const actual = shiftCounts[i][code] ?? 0;
        if (actual < target) {
          warnings.push(`⚠️ ${emp.name}: حصل على ${actual}/${target} فقط من الوردية ${code}`);
        } else if (actual > target) {
          warnings.push(`${emp.name}: تجاوز الحصة المحددة للوردية ${code} (${actual}/${target})`);
        }
      });
    });
  }
}

/** عدد الأيام العمل المتتالية التي سيكوّنها العمل في `day` (يشمل day نفسه) */
function consecutiveRunIfWork(emp: Employee, day: number, daysInMonth: number, shifts: Record<string, ShiftType>): number {
  // إذا كان الموظف يعمل بالفعل في هذا اليوم، إضافة وردية للخانة الثانية لا تزيد عدد الأيام
  let run = 1;
  for (let d = day - 1; d >= 1; d--) { if (dayHasWork(emp, d, shifts)) run++; else break; }
  for (let d = day + 1; d <= daysInMonth; d++) { if (dayHasWork(emp, d, shifts)) run++; else break; }
  return run;
}

/** هل يمكن إسناد الوردية `code` للموظف في هذا اليوم دون مخالفة الشروط؟ */
function canAssignConditional(
  emp: Employee,
  day: number,
  code: string,
  hoursNow: number,
  daysInMonth: number,
  shifts: Record<string, ShiftType>,
  c: AutoAssignConstraints
): 1 | 2 | null {
  const s1 = getSlot(emp, day, 1);
  const s2 = getSlot(emp, day, 2);
  // تفادي تكرار نفس الوردية في نفس اليوم
  if (s1 === code || s2 === code) return null;
  // خانة فارغة متاحة
  const slot: 1 | 2 | null = !s1 ? 1 : !s2 ? 2 : null;
  if (slot === null) return null;

  // ملاحظة: تم حذف قيدي الحد الأقصى للساعات والحد الأقصى لأيام العمل المتتالية.

  // قاعدة إجبارية: بعد سلسلة ليالٍ N يأتي يوم راحة.
  // لذلك لا يجوز وضع وردية عمل (غير ليلية) في اليوم التالي مباشرة لليلة —
  // يُسمح فقط بمواصلة الليالي (N بعد N)، وما عدا ذلك يُترك ليُملأ راحةً.
  const prevN1 = getSlot(emp, day - 1, 1), prevN2 = getSlot(emp, day - 1, 2);
  const prevWasNight = isNightCode(prevN1, shifts) || isNightCode(prevN2, shifts);
  const codeIsWork = (shifts[code]?.hours ?? 0) > 0;
  if (prevWasNight && codeIsWork && !isNightCode(code, shifts)) return null;

  if (c.safeSequences) {
    // لا صباح مباشرة بعد ليلة (اليوم السابق)
    if (prevWasNight && isMorningCode(code, shifts)) return null;
    // لا صباح في اليوم التالي إن كانت هذه الوردية ليلية
    const nxt1 = getSlot(emp, day + 1, 1), nxt2 = getSlot(emp, day + 1, 2);
    const nextMorning = isMorningCode(nxt1, shifts) || isMorningCode(nxt2, shifts);
    if (isNightCode(code, shifts) && nextMorning) return null;
  }


  return slot;
}

/**
 * ✨ التوزيع حسب شروط كل وردية:
 * تُعالَج الورديات بترتيب إضافتها. لكل وردية عمل حسب اتجاهها:
 * - عمودي: تُملأ لكل يوم عند `count` موظفين (الأقل ساعات أولاً) → تغطية اليوم.
 * - أفقي: تُملأ لكل موظف عند `count` يوم موزّعة على الشهر → صف الموظف.
 * تُملأ الخانتان (slot 1 و 2) تلقائياً، وتُحترم كل القيود (الساعات، الأيام المتتالية،
 * التسلسلات الآمنة، الخلايا الممتلئة مسبقاً).
 */
function autoAssignByConditions(
  next: Employee[],
  shifts: Record<string, ShiftType>,
  year: number,
  month: number,
  daysInMonth: number,
  c: AutoAssignConstraints,
  warnings: string[]
): void {
  const hoursPerEmp = next.map(emp => calcTotalHours(emp.attendance, shifts));

  // ✨ شروط كل وردية: الأولوية للقيم المُدخلة مباشرة في نافذة التوزيع، وإلا نرجع لشروط الوردية نفسها
  const conditionFor = (code: string): { count: number; direction: "vertical" | "horizontal" } => {
    const override = c.shiftConditions?.[code];
    const st = shifts[code];
    return {
      count: override?.count ?? st?.count ?? 0,
      direction: override?.direction ?? st?.direction ?? "vertical",
    };
  };

  // الورديات بترتيب إضافتها (كما وردت في shiftCodes) — ورديات العمل فقط
  const orderedCodes = c.shiftCodes.filter(code => (shifts[code]?.hours ?? 0) > 0);

  const configured = orderedCodes.filter(code => conditionFor(code).count > 0);
  if (configured.length === 0) {
    warnings.push("لا توجد ورديات لها شروط توزيع (اتجاه + عدد). حدد الاتجاه والعدد لكل وردية في نافذة التوزيع أولاً.");
    return;
  }

  for (const code of orderedCodes) {
    const st = shifts[code];
    const { count, direction: dir } = conditionFor(code);
    if (count <= 0) continue;

    if (dir === "vertical") {
      // لكل يوم: نحتاج count موظفين على هذه الوردية
      for (let day = 1; day <= daysInMonth; day++) {
        let assigned = 0;
        next.forEach(emp => { if (getSlot(emp, day, 1) === code || getSlot(emp, day, 2) === code) assigned++; });
        let need = count - assigned;
        if (need <= 0) continue;

        const cands = next
          .map((_, i) => i)
          .sort((a, b) => hoursPerEmp[a] - hoursPerEmp[b] || a - b);

        for (const i of cands) {
          if (need <= 0) break;
          const slot = canAssignConditional(next[i], day, code, hoursPerEmp[i], daysInMonth, shifts, c);
          if (slot === null) continue;
          next[i].attendance[slotKey(day, slot)] = code;
          hoursPerEmp[i] += st.hours;
          need--;
        }
        if (need > 0) {
          warnings.push(`⚠️ اليوم ${day}: نقص ${need} موظف في الوردية ${code} (عمودي)`);
        }
      }
    } else {
      // أفقي: لكل موظف count يوم موزّعة على الشهر
      next.forEach((emp, i) => {
        let assigned = 0;
        for (let day = 1; day <= daysInMonth; day++) {
          if (getSlot(emp, day, 1) === code || getSlot(emp, day, 2) === code) assigned++;
        }
        let need = count - assigned;
        if (need <= 0) return;

        // أهداف موزّعة بالتساوي على الشهر
        const targets: number[] = [];
        for (let k = 0; k < need; k++) {
          targets.push(Math.min(daysInMonth, Math.max(1, Math.round((k + 0.5) * daysInMonth / count))));
        }
        const used = new Set<number>();
        for (const t of targets) {
          let done = false;
          for (let radius = 0; radius <= daysInMonth && !done; radius++) {
            for (const day of [t - radius, t + radius]) {
              if (day < 1 || day > daysInMonth || used.has(day)) continue;
              const slot = canAssignConditional(emp, day, code, hoursPerEmp[i], daysInMonth, shifts, c);
              if (slot === null) continue;
              emp.attendance[slotKey(day, slot)] = code;
              hoursPerEmp[i] += st.hours;
              used.add(day);
              need--;
              done = true;
              break;
            }
          }
          if (!done) break;
        }
        if (need > 0) {
          warnings.push(`⚠️ ${emp.name}: نقص ${need} يوم في الوردية ${code} (أفقي)`);
        }
      });
    }
  }

  // ✨ رمز الراحة: أول وردية ساعاتها = 0، أو restCode، أو "R"
  const restCode =
    c.shiftCodes.find(code => (shifts[code]?.hours ?? 0) === 0) ?? c.restCode ?? "R";

  // ورديات عمل غير ليلية تُستخدم لتعبئة الخانات المتبقية (حتى لا تُنشئ ليلة جديدة
  // تستوجب راحة بعدها فتُخلّ بالقاعدة)
  const fillCodes = orderedCodes.filter(code => !isNightCode(code, shifts));

  next.forEach(emp => {
    // 1) قاعدة إجبارية: بعد نهاية سلسلة ليالٍ N يأتي يوم راحة R.
    //    لو اليوم السابق ليلة واليوم الحالي ليس ليلة → اجعل اليوم الحالي راحة.
    for (let day = 2; day <= daysInMonth; day++) {
      const prevNight =
        isNightCode(getSlot(emp, day - 1, 1), shifts) ||
        isNightCode(getSlot(emp, day - 1, 2), shifts);
      const todayNight =
        isNightCode(getSlot(emp, day, 1), shifts) ||
        isNightCode(getSlot(emp, day, 2), shifts);
      if (prevNight && !todayNight) {
        emp.attendance[slotKey(day, 1)] = restCode;
        emp.attendance[slotKey(day, 2)] = "";
      }
    }

    // 2) تعبئة كل الأيام: أي خانة فارغة تُملأ بوردية عمل مؤهلة، وإلا راحة.
    const hoursNow = calcTotalHours(emp.attendance, shifts);
    let running = hoursNow;
    for (let day = 1; day <= daysInMonth; day++) {
      // لا نلمس يوم الراحة الإجباري بعد الليل (اليوم السابق ليلة)
      const prevNight =
        day > 1 &&
        (isNightCode(getSlot(emp, day - 1, 1), shifts) ||
          isNightCode(getSlot(emp, day - 1, 2), shifts));

      // حاول ملء الخانتين بوردية عمل مؤهلة (غير ليلية بعد ليلة)
      if (!prevNight) {
        for (let guard = 0; guard < 4; guard++) {
          const hasFree = !getSlot(emp, day, 1) || !getSlot(emp, day, 2);
          if (!hasFree) break;

          // اختر الوردية الأقل تكراراً لهذا الموظف لموازنة الأنواع
          const counts: Record<string, number> = {};
          for (let d = 1; d <= daysInMonth; d++) {
            const a = getSlot(emp, d, 1), b = getSlot(emp, d, 2);
            if (a) counts[a] = (counts[a] || 0) + 1;
            if (b) counts[b] = (counts[b] || 0) + 1;
          }
          const cands = [...fillCodes].sort(
            (x, y) => (counts[x] || 0) - (counts[y] || 0)
          );

          let picked = false;
          for (const code of cands) {
            const slot = canAssignConditional(emp, day, code, running, daysInMonth, shifts, c);
            if (slot === null) continue;
            emp.attendance[slotKey(day, slot)] = code;
            running += shifts[code]?.hours ?? 0;
            picked = true;
            break;
          }
          if (!picked) break;
        }
      }

      // لو بقي اليوم فارغاً تماماً → راحة (خلية مدمجة)
      if (!getSlot(emp, day, 1) && !getSlot(emp, day, 2)) {
        emp.attendance[slotKey(day, 1)] = restCode;
        emp.attendance[slotKey(day, 2)] = "";
      }
    }
  });
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

  // ✨ فرع التوزيع حسب شروط كل وردية (اتجاه + عدد) بترتيب الإضافة
  if (c.useShiftConditions) {
    autoAssignByConditions(next, shifts, year, month, daysInMonth, c, warnings);
    enforceFullDayMerge(next, shifts, daysInMonth);
    const finalHours = next.map(emp => calcTotalHours(emp.attendance, shifts));
    const stats: AutoAssignStats = {
      maxHours: finalHours.length ? Math.max(...finalHours) : 0,
      minHours: finalHours.length ? Math.min(...finalHours) : 0,
      avgHours: finalHours.length ? Math.round(finalHours.reduce((s, h) => s + h, 0) / finalHours.length) : 0,
      spread: finalHours.length ? Math.max(...finalHours) - Math.min(...finalHours) : 0,
    };
    return { employees: next, warnings, stats };
  }

  // ✨ فرع التوزيع الأفقي العشوائي: يملأ الصفوف عشوائياً مع موازنة الساعات ثم يعود مبكراً
  if (c.randomHorizontal) {
    autoAssignRandomHorizontal(next, shifts, year, month, daysInMonth, c, warnings);
    enforceFullDayMerge(next, shifts, daysInMonth);
    const finalHours = next.map(emp => calcTotalHours(emp.attendance, shifts));
    const stats: AutoAssignStats = {
      maxHours: finalHours.length ? Math.max(...finalHours) : 0,
      minHours: finalHours.length ? Math.min(...finalHours) : 0,
      avgHours: finalHours.length ? Math.round(finalHours.reduce((s, h) => s + h, 0) / finalHours.length) : 0,
      spread: finalHours.length ? Math.max(...finalHours) - Math.min(...finalHours) : 0,
    };
    return { employees: next, warnings, stats };
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

      // Sort by a combined score (lower better): hours, work units, consecutive, and lastShift preference
      candidates.sort((a, b) => {
        const as = candidateScore(a.i, hoursPerEmp, workUnits, consecutive, lastShiftPerEmp[a.i], code, c);
        const bs = candidateScore(b.i, hoursPerEmp, workUnits, consecutive, lastShiftPerEmp[b.i], code, c);
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
        if ((shifts[code]?.hours ?? 0) > 0) workUnits[i]++;
        counts[code] = (counts[code] || 0) + 1;
        lastShiftPerEmp[i] = code;
      }
    }

    // === PASS 2: fill remaining free slots while balancing hours ===
    // Build employee order: prefer those with lower hours (then fewer work units) to balance load
    const empOrder = next.map((_, i) => i).sort((a, b) =>
      hoursPerEmp[a] !== hoursPerEmp[b] ? hoursPerEmp[a] - hoursPerEmp[b] : workUnits[a] - workUnits[b]
    );

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
        if ((shifts[code]?.hours ?? 0) > 0) workUnits[empIdx]++;
        counts[code] = (counts[code] || 0) + 1;
        lastShiftPerEmp[empIdx] = code;
      }
    }

    // end of day loop
  }

  // === PASS 3: fairness rebalancing ===
  // Move working shifts from the most-loaded employee to the least-loaded one
  // as long as it reduces the hours spread without violating any constraint.
  if (c.fairDistribution && next.length > 1) {
    rebalanceHours(next, shifts, year, month, c, hoursPerEmp);
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

  // ✨ دمج مباشر: أي خلية فيها 12 ساعة أو R تُفرَّغ خانتها الثانية
  enforceFullDayMerge(next, shifts, daysInMonth);

  // Compute fairness stats over final hours
  const finalHours = next.map(emp => calcTotalHours(emp.attendance, shifts));
  const stats: AutoAssignStats = {
    maxHours: finalHours.length ? Math.max(...finalHours) : 0,
    minHours: finalHours.length ? Math.min(...finalHours) : 0,
    avgHours: finalHours.length ? Math.round(finalHours.reduce((s, h) => s + h, 0) / finalHours.length) : 0,
    spread: finalHours.length ? Math.max(...finalHours) - Math.min(...finalHours) : 0,
  };

  return { employees: next, warnings, stats };
}

/** Validate a single employee's schedule against hard constraints. */
function isEmployeeScheduleValid(
  emp: Employee,
  shifts: Record<string, ShiftType>,
  year: number,
  month: number,
  c: AutoAssignConstraints
): boolean {
  const daysInMonth = getDaysInMonth(year, month);
  // Max monthly hours
  if (calcTotalHours(emp.attendance, shifts) > c.maxMonthlyHours) return false;

  const maxNights = c.maxConsecutiveNights ?? 2;
  let consecutive = 0;
  let consecutiveNights = 0;
  let prevNight = false;

  for (let day = 1; day <= daysInMonth; day++) {
    const s1 = getSlot(emp, day, 1);
    const s2 = getSlot(emp, day, 2);
    const worked = (shifts[s1]?.hours ?? 0) > 0 || (shifts[s2]?.hours ?? 0) > 0;
    const night = isNightCode(s1, shifts) || isNightCode(s2, shifts);

    // Consecutive working days
    consecutive = worked ? consecutive + 1 : 0;
    if (consecutive > c.maxConsecutiveDays) return false;

    if (c.safeSequences) {
      // No morning immediately after a night (prev day)
      if (prevNight && (isMorningCode(s1, shifts) || isMorningCode(s2, shifts))) return false;
      // Cap consecutive nights
      consecutiveNights = night ? consecutiveNights + 1 : 0;
      if (consecutiveNights > maxNights) return false;
    }
    prevNight = night;
  }
  return true;
}

/**
 * Iteratively transfer working shifts from the employee with the most hours to
 * the one with the least, shrinking the spread while respecting all constraints.
 */
function rebalanceHours(
  employees: Employee[],
  shifts: Record<string, ShiftType>,
  year: number,
  month: number,
  c: AutoAssignConstraints,
  hoursPerEmp: number[]
): void {
  const daysInMonth = getDaysInMonth(year, month);
  const maxIterations = employees.length * daysInMonth * 2 + 50;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Find most- and least-loaded employees
    let hi = 0, lo = 0;
    for (let i = 1; i < employees.length; i++) {
      if (hoursPerEmp[i] > hoursPerEmp[hi]) hi = i;
      if (hoursPerEmp[i] < hoursPerEmp[lo]) lo = i;
    }
    if (hi === lo) break;
    const spread = hoursPerEmp[hi] - hoursPerEmp[lo];
    if (spread <= 0) break;

    const hiEmp = employees[hi];
    const loEmp = employees[lo];
    let moved = false;

    for (let day = 1; day <= daysInMonth && !moved; day++) {
      for (const slot of [1, 2] as const) {
        const code = getSlot(hiEmp, day, slot);
        const sh = shifts[code]?.hours ?? 0;
        if (!code || sh <= 0) continue;
        // Only move if it strictly reduces the gap between this pair.
        // After moving: hi -= sh, lo += sh → new pair gap = |spread - 2*sh|.
        if (Math.abs(spread - 2 * sh) >= spread) continue;
        // lo must not already have this code that day
        if (getSlot(loEmp, day, 1) === code || getSlot(loEmp, day, 2) === code) continue;
        // Find a free slot for lo on that day
        const loFree: 1 | 2 | null = !getSlot(loEmp, day, 1) ? 1 : !getSlot(loEmp, day, 2) ? 2 : null;
        if (loFree === null) continue;
        // Respect minimum staffing: removing from hi must not drop below the minimum
        const min = c.minStaffPerShift[code] ?? 0;
        if (min > 0) {
          let count = 0;
          for (const e of employees) {
            if (getSlot(e, day, 1) === code || getSlot(e, day, 2) === code) count++;
          }
          if (count - 1 < min) continue;
        }

        // Tentatively apply the transfer
        const hiKey = slotKey(day, slot);
        const loKey = slotKey(day, loFree);
        hiEmp.attendance[hiKey] = "";
        loEmp.attendance[loKey] = code;

        if (isEmployeeScheduleValid(loEmp, shifts, year, month, c) &&
            isEmployeeScheduleValid(hiEmp, shifts, year, month, c)) {
          hoursPerEmp[hi] -= sh;
          hoursPerEmp[lo] += sh;
          moved = true;
          break;
        }
        // Revert
        hiEmp.attendance[hiKey] = code;
        loEmp.attendance[loKey] = "";
      }
    }

    if (!moved) break;
  }
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
  let available = workingCodes.filter(code => {
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

  // If ordering provided as per-employee map, prefer that first
  let empOrdering: string[] | undefined = undefined;
  if (c.ordering && !Array.isArray(c.ordering)) {
    empOrdering = (c.ordering as Record<string, string[]>)[emp.name];
  } else if (Array.isArray(c.ordering)) {
    empOrdering = c.ordering;
  }

  // If available empty and fillAllDays requested, try relaxed available (ignore hours/consecutive)
  if (available.length === 0 && c.fillAllDays) {
    available = workingCodes.filter(code => {
      if (code === otherCode) return false;
      if (c.safeSequences && isNightCode(lastShift, shifts) && isMorningCode(code, shifts)) return false;
      return true;
    });
  }

  if (available.length === 0) return null;

  // If empOrdering present, pick first available in that order unless strictPriority forbids fallback
  if (empOrdering && empOrdering.length > 0) {
    for (const oc of empOrdering) if (available.includes(oc)) return oc;
    if (c.strictPriority) return null;
  }

  // If fairDistribution and availability, choose shift with fewest assignments today.
  if (c.fairDistribution) {
    let best = available[0];
    let bestCount = Infinity;
    let bestRepeat = true;
    let bestHours = -1;
    for (const code of available) {
      let count = 0;
      employees.forEach(e => { if (getSlot(e, day, 1) === code || getSlot(e, day, 2) === code) count++; });
      const repeat = code === lastShift;
      const hrs = shifts[code]?.hours ?? 0;
      const better =
        count < bestCount ||
        (count === bestCount && !repeat && bestRepeat) ||
        (count === bestCount && repeat === bestRepeat && hrs > bestHours);
      if (better) { bestCount = count; bestRepeat = repeat; bestHours = hrs; best = code; }
    }
    return best;
  }

  // If no fairness requirement, but ordering exists (global), prefer it
  if (Array.isArray(c.ordering) && c.ordering.length > 0) {
    for (const oc of c.ordering) if (available.includes(oc)) return oc;
  }

  // Fallback round-robin by day index
  return available[(day - 1) % available.length];
}
