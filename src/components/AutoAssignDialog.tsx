import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [maxHours, setMaxHours] = useState(180);
  const [maxConsecutive, setMaxConsecutive] = useState(6);
  const [override, setOverride] = useState(false);
  const [safeSequences, setSafeSequences] = useState(true);
  const [maxConsecutiveNights, setMaxConsecutiveNights] = useState(2);

  // New UI state for ordering and fill behavior
  const [orderingText, setOrderingText] = useState(""); // CSV like: A,B,C
  const [usePerEmployeeOrdering, setUsePerEmployeeOrdering] = useState(false);
  const [perEmployeeOrderingText, setPerEmployeeOrderingText] = useState("{}"); // JSON map: { "Name": ["A","B"] }
  const [fillAllDays, setFillAllDays] = useState(false);
  const [strictPriority, setStrictPriority] = useState(false);

  const [preview, setPreview] = useState<Employee[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<AutoAssignStats | null>(null);

  const toggleShift = (code: string) => {
    setSelectedShifts(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const handleGenerate = () => {
    let ordering: string[] | Record<string, string[]> | undefined = undefined;
    if (usePerEmployeeOrdering) {
      try {
        const parsed = JSON.parse(perEmployeeOrderingText || "{}");
        // ensure values are arrays of strings
        const ok = Object.values(parsed).every((v: any) => Array.isArray(v) && v.every((x: any) => typeof x === "string"));
        if (ok) ordering = parsed;
        else warnings.push("تنسيق تفضيلات الموظفين غير صحيح — يجب أن تكون قيم المخرجات مصفوفات نصية.");
      } catch (e) {
        warnings.push("خطأ في JSON لتفضيلات الموظفين: " + (e as Error).message);
      }
    } else if (orderingText.trim().length > 0) {
      ordering = orderingText.split(",").map(s => s.trim()).filter(Boolean);
    }

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
      randomHorizontal: true,        // ✨ التوزيع الأفقي العشوائي هو الوضع الوحيد
      ordering,
      fillAllDays,
      strictPriority,
    };

    const result = autoAssign(employees, shifts, year, month, constraints);
    setPreview(result.employees);
    setWarnings(result.warnings.concat(warnings));
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
          <p className="text-[0.7rem] text-muted-foreground bg-secondary/20 border border-secondary/40 rounded p-2">
            ↔️ توزيع أفقي عشوائي: يملأ صف كل موظف عشوائياً في الخانتين مع موازنة إجمالي الساعات بين الجميع. الخلية [...]
          </p>

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

          {/* Ordering controls */}
          <div>
            <Label className="text-xs">ترتيب تفضيلي عام لأكواد الورديات (بفاصل ,)</Label>
            <Input type="text" className="h-8 text-xs mt-1" value={orderingText}
              placeholder="مثال: A,B,C أو N,M" onChange={e => setOrderingText(e.target.value)} />
            <label className="flex items-center gap-2 text-xs mt-1">
              <Checkbox checked={usePerEmployeeOrdering} onCheckedChange={(v) => setUsePerEmployeeOrdering(!!v)} />
              استخدم تفضيلات لكل موظف (JSON)
            </label>
            {usePerEmployeeOrdering && (
              <div className="mt-1">
                <Label className="text-xs">تفضيلات الموظفين (JSON) — مثال: {`{"أحمد":["N","M"],"ليلى":["M","A"]}`}</Label>
                <textarea
                  value={perEmployeeOrderingText}
                  onChange={(e) => setPerEmployeeOrderingText(e.target.value)}
                  className="w-full mt-1 text-xs p-2 rounded border border-input bg-card"
                  rows={4}
                />
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={fillAllDays} onCheckedChange={(v) => setFillAllDays(!!v)} />
            ملء جميع الأيام (قد يتطلب تجاوز بعض القيود)
          </label>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={strictPriority} onCheckedChange={(v) => setStrictPriority(!!v)} />
            تطبيق الترتيب كقيد صارم (لا تراجع)
          </label>

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
