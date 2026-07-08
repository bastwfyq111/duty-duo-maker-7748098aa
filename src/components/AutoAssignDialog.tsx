import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { Employee } from "@/hooks/useRosterData";
import type { ShiftType } from "@/lib/roster";
import { autoAssign, type AutoAssignConstraints, type AutoAssignStats } from "@/lib/auto-assign";

interface AutoAssignDialogProps {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  shifts: Record<string, ShiftType>;
  month: number;
  year: number;
  onApply: (next: Employee[]) => void;
}
export default function AutoAssignDialog({
  open, onClose, employees, shifts, month, year, onApply,
}: AutoAssignDialogProps) {
  const allShiftCodes = useMemo(() => Object.keys(shifts), [shifts]);
  const workingShiftCodes = useMemo(
    () => Object.keys(shifts).filter(c => (shifts[c]?.hours ?? 0) > 0),
    [shifts]
  );

  const [selectedShifts, setSelectedShifts] = useState<string[]>(workingShiftCodes);
  const [useShiftConditions, setUseShiftConditions] = useState(true);
  const [maxHours, setMaxHours] = useState(180);
  const [maxConsecutive, setMaxConsecutive] = useState(6);
  const [override, setOverride] = useState(false);
  const [safeSequences, setSafeSequences] = useState(true);
  const [maxConsecutiveNights, setMaxConsecutiveNights] = useState(2);

  // keep selected shifts in sync if shift types change (avoids stale initial value)
  useEffect(() => {
    setSelectedShifts(workingShiftCodes);
  }, [workingShiftCodes]);

  // Ordering / fill behavior state (logic already existed — now wired to a visible UI)
  const [useCustomOrdering, setUseCustomOrdering] = useState(false);
  const [orderingText, setOrderingText] = useState(""); // CSV like: A,B,C
  const [usePerEmployeeOrdering, setUsePerEmployeeOrdering] = useState(false);
  const [perEmployeeOrderingText, setPerEmployeeOrderingText] = useState("{}"); // JSON map: { "Name": ["A","B"] }
  const [fillAllDays, setFillAllDays] = useState(false);
  const [strictPriority, setStrictPriority] = useState(false);

  // ✨ نمط تسلسلي شهري (مثال: M,D,R يتكرر طول الشهر)
  const [useSequencePattern, setUseSequencePattern] = useState(false);
  const [sequencePatternText, setSequencePatternText] = useState("");
  const [sequenceStagger, setSequenceStagger] = useState(true);

  // ✨ حصة ثابتة لكل نوع وردية (نفس العدد لكل الموظفين)
  const [useShiftQuotas, setUseShiftQuotas] = useState(false);
  const [quotas, setQuotas] = useState<Record<string, number>>({});

  const setQuota = (code: string, value: number) => {
    setQuotas(prev => ({ ...prev, [code]: value }));
  };

  const [preview, setPreview] = useState<Employee[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<AutoAssignStats | null>(null);

  const toggleShift = (code: string) => {
    setSelectedShifts(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const handleGenerate = () => {
    // use a local warnings array instead of mutating state directly
    const localWarnings: string[] = [];

    let ordering: string[] | Record<string, string[]> | undefined = undefined;

    if (useCustomOrdering) {
      if (usePerEmployeeOrdering) {
        try {
          const parsed = JSON.parse(perEmployeeOrderingText || "{}");
          // ensure values are arrays of strings
          const ok = Object.values(parsed).every(
            (v: any) => Array.isArray(v) && v.every((x: any) => typeof x === "string")
          );
          if (ok) {
            // validate that every referenced shift code actually exists
            const unknownCodes = new Set<string>();
            Object.values(parsed).forEach((arr: any) => {
              (arr as string[]).forEach((code) => {
                if (!allShiftCodes.includes(code)) unknownCodes.add(code);
              });
            });
            if (unknownCodes.size > 0) {
              localWarnings.push(
                `رموز ورديات غير معروفة في تفضيلات الموظفين: ${[...unknownCodes].join(", ")}`
              );
            }
            ordering = parsed;
          } else {
            localWarnings.push("تنسيق تفضيلات الموظفين غير صحيح — يجب أن تكون قيم المخرجات مصفوفات نصية.");
          }
        } catch (e) {
          localWarnings.push("خطأ في JSON لتفضيلات الموظفين: " + (e as Error).message);
        }
      } else if (orderingText.trim().length > 0) {
        const codes = orderingText.split(",").map(s => s.trim()).filter(Boolean);
        const unknownCodes = codes.filter(c => !allShiftCodes.includes(c));
        if (unknownCodes.length > 0) {
          localWarnings.push(`رموز ورديات غير معروفة في الترتيب العام: ${unknownCodes.join(", ")}`);
        }
        ordering = codes;
      }
    }

    // ✨ النمط التسلسلي الشهري
    let sequencePattern: string[] | undefined = undefined;
    if (useSequencePattern) {
      sequencePattern = sequencePatternText.split(",").map(s => s.trim()).filter(Boolean);
      const unknownCodes = sequencePattern.filter(c => !allShiftCodes.includes(c));
      if (unknownCodes.length > 0) {
        localWarnings.push(`رموز غير معروفة في النمط التسلسلي: ${unknownCodes.join(", ")}`);
      }
      if (sequencePattern.length === 0) {
        localWarnings.push("النمط التسلسلي فارغ — تم تجاهله.");
      }
    }

    // ✨ الحصص الثابتة لكل وردية
    const shiftQuotas: Record<string, number> | undefined = useShiftQuotas
      ? Object.fromEntries(Object.entries(quotas).filter(([, v]) => v > 0))
      : undefined;

    const constraints: AutoAssignConstraints = {
      shiftCodes: selectedShifts,
      maxMonthlyHours: maxHours,
      maxConsecutiveDays: maxConsecutive,
      weeklyRestDayOfWeek: null,
      minStaffPerShift: {},
      fairDistribution: true,        // موازنة الساعات دائماً
      overrideExisting: override,
      safeSequences,
      maxConsecutiveNights,
      randomHorizontal: !useShiftConditions, // العشوائي فقط إذا لم يُفعّل وضع الشروط
      useShiftConditions,                    // ✨ التوزيع حسب شروط كل وردية
      ordering,
      fillAllDays,
      strictPriority: useCustomOrdering ? strictPriority : false,
      useSequencePattern,
      sequencePattern,
      sequenceStagger,
      useShiftQuotas,
      shiftQuotas,
    };

    const result = autoAssign(employees, shifts, year, month, constraints);
    setPreview(result.employees);
    setWarnings([...(result.warnings || []), ...localWarnings]);
    setStats(result.stats ?? null);
  };

  const handleApply = () => {
    if (preview) {
      onApply(preview);
      setPreview(null);
      setWarnings([]);
      setStats(null);
      onClose();
    }
  };

  const handleClose = () => {
    setPreview(null);
    setWarnings([]);
    setStats(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">التوزيع التلقائي الأفقي</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-right">
          {/* ✨ الوضع الرئيسي: التوزيع حسب شروط كل وردية */}
          <label className="flex items-center gap-2 text-xs cursor-pointer bg-primary/10 border border-primary/40 rounded p-2">
            <Checkbox checked={useShiftConditions} onCheckedChange={(v) => setUseShiftConditions(!!v)} />
            <div className="flex flex-col flex-1">
              <span className="font-semibold">🧭 التوزيع حسب شروط كل وردية</span>
              <span className="text-[0.7rem] text-muted-foreground">
                يوزّع كل وردية حسب اتجاهها (عمودي/أفقي) وعددها المحدد في نافذة تعديل الوردية، بترتيب إضافة الورديات، ويملأ الخانتين.
              </span>
            </div>
          </label>

          {useShiftConditions ? (
            <div className="bg-primary/5 border border-primary/20 rounded p-2 text-[0.7rem] space-y-1">
              <div className="font-semibold">شروط الورديات الحالية (بالترتيب):</div>
              {workingShiftCodes.filter(c => selectedShifts.includes(c)).map(code => {
                const st = shifts[code];
                const cnt = st?.count ?? 0;
                const dir = st?.direction ?? "vertical";
                return (
                  <div key={code} className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{code}</span>
                    {cnt > 0 ? (
                      <span className="text-muted-foreground">
                        {dir === "vertical" ? `⬇️ عمودي · ${cnt} موظف/يوم` : `➡️ أفقي · ${cnt} يوم/شهر`}
                      </span>
                    ) : (
                      <span className="text-amber-600">لا يوجد شرط — عدّل الوردية وحدد الاتجاه والعدد</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[0.7rem] text-muted-foreground bg-secondary/20 border border-secondary/40 rounded p-2">
              ↔️ توزيع أفقي عشوائي: يملأ صف كل موظف عشوائياً في الخانتين مع موازنة إجمالي الساعات بين الجميع.
            </p>
          )}

          {/* Shifts to distribute */}
          <div>
            <Label className="text-xs">الورديات المراد توزيعها</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {allShiftCodes.map(code => {
                const isRest = (shifts[code]?.hours ?? 0) === 0;
                return (
                  <label key={code} className={`inline-flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded ${isRest ? "bg-accent/40 border border-accent" : "bg-muted/50"}`}>
                    <Checkbox
                      checked={selectedShifts.includes(code)}
                      onCheckedChange={() => toggleShift(code)}
                    />
                    {code} ({shifts[code]?.hours ?? 0}س){isRest && " · راحة"}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs">الحد الأقصى للساعات الشهرية لكل موظف</Label>
            <Input type="number" className="h-8 text-xs mt-1" value={maxHours}
              onChange={e => setMaxHours(Number(e.target.value))} />
          </div>

          <div>
            <Label className="text-xs">الحد الأقصى لأيام العمل المتتالية</Label>
            <Input type="number" className="h-8 text-xs mt-1" value={maxConsecutive}
              onChange={e => setMaxConsecutive(Number(e.target.value))} />
          </div>

          {/* ✨ تسلسلات آمنة */}
          <label className="flex items-center gap-2 text-xs cursor-pointer bg-accent/10 border border-accent/30 rounded p-2">
            <Checkbox checked={safeSequences} onCheckedChange={(v) => setSafeSequences(!!v)} />
            <div className="flex flex-col flex-1">
              <span className="font-semibold">🌙 تسلسلات آمنة</span>
              <span className="text-[0.7rem] text-muted-foreground">منع وردية الصباح مباشرة بعد الليل، وتحديد الليالي المتتالية</span>
            </div>
          </label>

          {safeSequences && (
            <label className="flex items-center gap-2 text-xs pr-8">
              أقصى عدد ليالي متتالية:
              <input
                type="number"
                min={1}
                max={5}
                value={maxConsecutiveNights}
                onChange={(e) => setMaxConsecutiveNights(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 px-2 py-1 rounded border border-input bg-card text-center"
              />
            </label>
          )}

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} />
            استبدال الخلايا الممتلئة مسبقاً
          </label>

          {/* ✨ الميزة الجديدة: ترتيب مخصص للورديات */}
          <label className="flex items-center gap-2 text-xs cursor-pointer bg-primary/5 border border-primary/30 rounded p-2">
            <Checkbox checked={useCustomOrdering} onCheckedChange={(v) => setUseCustomOrdering(!!v)} />
            <div className="flex flex-col flex-1">
              <span className="font-semibold">📋 ترتيب مخصص للورديات</span>
              <span className="text-[0.7rem] text-muted-foreground">
                حدد بنفسك أولوية الورديات بدل ما يكون التوزيع عشوائي بالكامل
              </span>
            </div>
          </label>

          {useCustomOrdering && (
            <div className="pr-2 space-y-2 border-r-2 border-primary/20 mr-1 pl-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={usePerEmployeeOrdering}
                  onCheckedChange={(v) => setUsePerEmployeeOrdering(!!v)}
                />
                ترتيب مختلف لكل موظف (بدل ترتيب عام واحد)
              </label>

              {!usePerEmployeeOrdering ? (
                <div>
                  <Label className="text-xs">الترتيب العام (افصل بين رموز الورديات بفاصلة)</Label>
                  <Input
                    className="h-8 text-xs mt-1 font-mono"
                    placeholder="مثال: A,B,C"
                    value={orderingText}
                    onChange={(e) => setOrderingText(e.target.value)}
                  />
                  <p className="text-[0.65rem] text-muted-foreground mt-1">
                    الرموز المتاحة: {allShiftCodes.join(", ")}
                  </p>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">ترتيب لكل موظف (بصيغة JSON)</Label>
                  <Textarea
                    className="text-xs mt-1 font-mono min-h-[90px]"
                    placeholder={`{\n  "اسم الموظف": ["A", "B"],\n  "موظف آخر": ["B", "A"]\n}`}
                    value={perEmployeeOrderingText}
                    onChange={(e) => setPerEmployeeOrderingText(e.target.value)}
                  />
                  <p className="text-[0.65rem] text-muted-foreground mt-1">
                    اكتب اسم كل موظف كما هو مسجل بالضبط، مع مصفوفة برموز الورديات مرتبة حسب الأولوية.
                  </p>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={strictPriority} onCheckedChange={(v) => setStrictPriority(!!v)} />
                <span>
                  التزام صارم بالترتيب
                  <span className="block text-[0.65rem] text-muted-foreground">
                    لو مفعّل: ما يعطي وردية لاحقة إلا بعد استحالة إعطاء الوردية ذات الأولوية الأعلى
                  </span>
                </span>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={fillAllDays} onCheckedChange={(v) => setFillAllDays(!!v)} />
                <span>
                  تعبئة كل الأيام
                  <span className="block text-[0.65rem] text-muted-foreground">
                    لو مفعّل: يحاول ملء كل خانة فاضية حتى لو تجاوز التوازن المثالي بين الموظفين
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* ✨ الميزة الجديدة: نمط تسلسلي شهري */}
          <label className="flex items-center gap-2 text-xs cursor-pointer bg-secondary/10 border border-secondary/40 rounded p-2">
            <Checkbox checked={useSequencePattern} onCheckedChange={(v) => setUseSequencePattern(!!v)} />
            <div className="flex flex-col flex-1">
              <span className="font-semibold">🔁 نمط تسلسلي شهري</span>
              <span className="text-[0.7rem] text-muted-foreground">
                دورة متكررة طول الشهر بدل التوزيع العشوائي (مثال: M ثم D ثم راحة، وتتكرر)
              </span>
            </div>
          </label>

          {useSequencePattern && (
            <div className="pr-2 space-y-2 border-r-2 border-secondary/30 mr-1 pl-1">
              <div>
                <Label className="text-xs">تسلسل الدورة (افصل بفاصلة، بالترتيب)</Label>
                <Input
                  className="h-8 text-xs mt-1 font-mono"
                  placeholder="مثال: M,D,R"
                  value={sequencePatternText}
                  onChange={(e) => setSequencePatternText(e.target.value)}
                />
                <p className="text-[0.65rem] text-muted-foreground mt-1">
                  الرموز المتاحة (تشمل رموز الراحة): {allShiftCodes.join(", ")}
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={sequenceStagger} onCheckedChange={(v) => setSequenceStagger(!!v)} />
                <span>
                  بداية مختلفة لكل موظف
                  <span className="block text-[0.65rem] text-muted-foreground">
                    لو مفعّل: كل موظف يبدأ الدورة من نقطة مختلفة (يمنع تطابق الجميع بنفس الوردية بنفس اليوم)
                  </span>
                </span>
              </label>

              <p className="text-[0.65rem] text-muted-foreground bg-muted/30 rounded p-1.5">
                ملاحظة: لو وردية الدورة تعارضت مع حد الساعات أو حصة معينة، يبحث النظام عن أقرب بديل مناسب ضمن نفس الدورة قبل ما يرجع للاختيار العشوائي.
              </p>
            </div>
          )}

          {/* ✨ الميزة الجديدة: حصة ثابتة لكل وردية */}
          <label className="flex items-center gap-2 text-xs cursor-pointer bg-secondary/10 border border-secondary/40 rounded p-2">
            <Checkbox checked={useShiftQuotas} onCheckedChange={(v) => setUseShiftQuotas(!!v)} />
            <div className="flex flex-col flex-1">
              <span className="font-semibold">🎯 حصة ثابتة لكل وردية</span>
              <span className="text-[0.7rem] text-muted-foreground">
                حدد عدد أيام ثابت لكل نوع وردية خلال الشهر (نفس العدد لكل الموظفين)
              </span>
            </div>
          </label>

          {useShiftQuotas && (
            <div className="pr-2 space-y-2 border-r-2 border-secondary/30 mr-1 pl-1">
              <div className="grid grid-cols-2 gap-2">
                {workingShiftCodes.map(code => (
                  <div key={code} className="flex items-center gap-2">
                    <Label className="text-xs w-10 shrink-0">{code}</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-xs"
                      value={quotas[code] ?? ""}
                      placeholder="0"
                      onChange={(e) => setQuota(code, Number(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[0.65rem] text-muted-foreground">
                لو مجموع الحصص أكبر من أيام الشهر المتاحة لكل موظف، بعض الحصص قد لا تتحقق بالكامل — بتظهر لك تنبيهات بعد التوليد توضح الناقص أو الزائد.
              </p>
            </div>
          )}

          {/* Warnings / Preview info */}
          {warnings.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded p-2 text-[0.7rem] text-destructive max-h-24 overflow-y-auto">
              <div className="font-semibold mb-1">تنبيهات ({warnings.length}):</div>
              {warnings.slice(0, 5).map((w, i) => (
                <div key={i} className="mb-1">
                  {w.includes("⚠️") ? (
                    <span className="text-amber-600">{w}</span>
                  ) : (
                    <span>• {w}</span>
                  )}
                </div>
              ))}
              {warnings.length > 5 && <div>… وغيرها</div>}
            </div>
          )}

          {preview && (
            <div className="bg-primary/10 border border-primary/30 rounded p-2 text-[0.7rem] text-foreground space-y-1.5">
              <div>✓ تم توليد الجدول. اضغط "تطبيق" لحفظ التوزيع.</div>
              {stats && (
                <div className="border-t border-primary/20 pt-1.5">
                  <div className="font-semibold mb-1">ملخص عدالة الساعات:</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <span>الأعلى: {stats.maxHours} س</span>
                    <span>الأدنى: {stats.minHours} س</span>
                    <span>المتوسط: {stats.avgHours} س</span>
                    <span className={stats.spread <= 12 ? "text-primary font-semibold" : "text-amber-600 font-semibold"}>
                      الفارق: {stats.spread} س
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleGenerate} className="flex-1 h-9 text-xs">
              {preview ? "إعادة توليد" : "توليد المعاينة"}
            </Button>
            <Button onClick={handleApply} disabled={!preview} className="flex-1 h-9 text-xs" variant="default">
              تطبيق
            </Button>
            <Button onClick={handleClose} variant="outline" className="h-9 text-xs">
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
