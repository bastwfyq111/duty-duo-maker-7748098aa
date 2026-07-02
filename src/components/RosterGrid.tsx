import { useEffect, useMemo, useState } from "react";
import { getDaysArray, getDayName, isFriday, calcTotalHours, type ShiftType } from "@/lib/roster";
import { getShiftCellStyle, generateDistinctHslColors } from "@/lib/color-utils";
import { computeAutoSchedule } from "@/lib/scheduler";
import type { Employee } from "@/hooks/useRosterData";
import { useRosterData } from "@/hooks/useRosterData";
import { Button } from "@/components/ui/button";

interface RosterGridProps {
  employees: Employee[];
  shifts: Record<string, ShiftType>;
  month: number;
  year: number;
  slotsPerDay?: number; // عدد الخلايا لكل يوم (افتراضي 2)
  onCellClick: (empIdx: number, day: number, slot?: number) => void;
  onRemoveEmployee: (idx: number) => void;
  onSwapEmployee?: (fromIdx: number, toIdx: number) => void;
  onMergeCell?: (empIdx: number, day: number) => void;
  onSplitCell?: (empIdx: number, day: number) => void;
}

type SchedulerSettings = {
  minRestHours: number;
  maxConsecutiveDays: number;
  maxDailyShiftsPerEmployee: number;
};

const SETTINGS_KEY = "schedulerSettings";

export default function RosterGrid({ 
  employees: propEmployees, shifts: propShifts, month, year, slotsPerDay = 2, onCellClick, onRemoveEmployee, onSwapEmployee, onMergeCell, onSplitCell 
}: RosterGridProps) {
  const days = useMemo(() => getDaysArray(year, month), [year, month]);
  const [mergedCells, setMergedCells] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ empIdx: number; day: number; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const { bulkSetShifts, addShiftType } = useRosterData();

  // scheduler settings stored locally
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SchedulerSettings>({ minRestHours: 12, maxConsecutiveDays: 5, maxDailyShiftsPerEmployee: 1 });

  // preview modal state and undo snapshot
  const [previewSchedule, setPreviewSchedule] = useState<any | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<Employee[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings(prev => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const saveSettings = (s: SchedulerSettings) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  };

  const isMerged = (empIdx: number, day: number): boolean => {
    return mergedCells.has(`${empIdx}-${day}`);
  };

  const handleMerge = (empIdx: number, day: number) => {
    const key = `${empIdx}-${day}`;
    const newMerged = new Set(mergedCells);
    if (newMerged.has(key)) {
      newMerged.delete(key);
    } else {
      newMerged.add(key);
    }
    setMergedCells(newMerged);
    onMergeCell?.(empIdx, day);
    setContextMenu(null);
  };

  const handleSplit = (empIdx: number, day: number) => {
    const key = `${empIdx}-${day}`;
    const newMerged = new Set(mergedCells);
    newMerged.delete(key);
    setMergedCells(newMerged);
    onSplitCell?.(empIdx, day);
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, empIdx: number, day: number) => {
    e.preventDefault();
    setContextMenu({ empIdx, day, x: e.clientX, y: e.clientY });
  };

  const handleCellClickWithContext = (empIdx: number, day: number, slot?: number) => {
    if (mergedCells.has(`${empIdx}-${day}`) && slot) {
      // عند دمج الخلايا، استخدم slot 1 دائماً
      onCellClick(empIdx, day, 1);
    } else {
      onCellClick(empIdx, day, slot);
    }
  };

  // ----- New actions: generate color palette, auto-schedule with preview, undo -----
  const handleGenerateColors = async () => {
    try {
      setBusy(true);
      const codes = Object.keys(propShifts);
      const count = Math.max(12, codes.length);
      const palette = generateDistinctHslColors(count, { saturation: 85, lightness: 50, lightnessVariance: 8 });
      codes.forEach((code, i) => {
        const base = propShifts[code] || { hours: 0, label: code };
        // assign a color from palette
        addShiftType(code, { ...base, color: palette[i % palette.length] });
      });
      // small delay to ensure storage updated
      await new Promise(res => setTimeout(res, 120));
      console.log("Generated and applied palette for shift codes", codes);
    } catch (err) {
      console.error("Failed to generate colors", err);
    } finally {
      setBusy(false);
    }
  };

  const handleAutoSchedule = async () => {
    try {
      setBusy(true);
      // prepare employees snapshot from props
      const emps = propEmployees.map(e => ({ name: e.name, attendance: { ...(e.attendance || {}) } }));
      const opts = {
        employees: emps,
        shifts: propShifts,
        month,
        year,
        slotsPerDay,
        constraints: { minRestHours: settings.minRestHours, maxConsecutiveDays: settings.maxConsecutiveDays, maxDailyShiftsPerEmployee: settings.maxDailyShiftsPerEmployee }
      };
      const res = computeAutoSchedule(opts as any);
      if (res.success) {
        // show preview modal instead of applying immediately
        setPreviewSchedule(res);
      } else {
        // still show details so user knows why
        setPreviewSchedule(res);
      }
    } catch (err) {
      console.error("Auto-schedule error", err);
    } finally {
      setBusy(false);
    }
  };

  const applyPreview = async () => {
    if (!previewSchedule) return;
    try {
      setBusy(true);
      // keep undo snapshot
      setLastSnapshot(propEmployees.map(e => ({ ...e, attendance: { ...(e.attendance || {}) } })));
      await bulkSetShifts(previewSchedule.employees as Employee[]);
      setPreviewSchedule(null);
    } catch (err) {
      console.error("Failed applying schedule", err);
    } finally {
      setBusy(false);
    }
  };

  const cancelPreview = () => setPreviewSchedule(null);

  const undoLast = async () => {
    if (!lastSnapshot) return;
    try {
      setBusy(true);
      await bulkSetShifts(lastSnapshot);
      setLastSnapshot(null);
    } catch (err) {
      console.error("Undo failed", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="table-wrapper overflow-x-auto -webkit-overflow-scrolling-touch mt-4 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleGenerateColors} disabled={busy}>
            توليد ألوان تلقائية
          </Button>
          <Button size="sm" onClick={handleAutoSchedule} variant="secondary" disabled={busy}>
            توزيع تلقائي للورديات
          </Button>
          <Button size="sm" onClick={() => setSettingsOpen(s => !s)} variant="ghost">
            ⚙️ إعدادات
          </Button>
          {lastSnapshot && (
            <Button size="sm" onClick={undoLast} variant="destructive" disabled={busy}>
              تراجع عن آخر تغييرات
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">ملحوظة: التعديلات تُطبّق فوراً على التخزين المحلي</div>
      </div>

      {settingsOpen && (
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="flex gap-4 flex-wrap items-center">
            <label className="text-xs">Min rest hours:
              <input
                type="number"
                className="ml-2 w-20 text-xs"
                value={settings.minRestHours}
                onChange={(e) => setSettings({ ...settings, minRestHours: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="text-xs">Max consecutive days:
              <input
                type="number"
                className="ml-2 w-20 text-xs"
                value={settings.maxConsecutiveDays}
                onChange={(e) => setSettings({ ...settings, maxConsecutiveDays: Math.max(1, Number(e.target.value)) })}
              />
            </label>
            <label className="text-xs">Max daily shifts per employee:
              <input
                type="number"
                className="ml-2 w-20 text-xs"
                value={settings.maxDailyShiftsPerEmployee}
                onChange={(e) => setSettings({ ...settings, maxDailyShiftsPerEmployee: Math.max(1, Number(e.target.value)) })}
              />
            </label>
            <div className="ml-2">
              <Button size="sm" onClick={() => saveSettings(settings)}>حفظ الإعدادات</Button>
            </div>
          </div>
        </div>
      )}

      <table id="rosterTable" className="roster-table" dir="rtl">
        <thead>
          <tr className="bg-foreground text-background">
            <th className="emp-name-col !bg-foreground !text-background text-xs font-bold">اليوم</th>
            {days.map(d => {
              const we = isFriday(year, month, d);
              return (
                <th key={`day-${d}`} className={`text-[0.7rem] font-bold ${we ? "!bg-emerald-600 !text-white" : ""}`}>
                  {getDayName(year, month, d)}
                </th>
              );
            })}
            <th className="total-col text-xs">الإجمالي</th>
          </tr>
          <tr className="bg-foreground/90 text-background">
            <th className="emp-name-col !bg-foreground/90 !text-background text-xs font-bold">الموظف</th>
            {days.map(d => {
              const we = isFriday(year, month, d);
              return (
                <th key={`date-${d}`} className={`text-xs ${we ? "!bg-emerald-500 !text-white" : ""}`}>
                  {d}
                </th>
              );
            })}
            <th className="total-col text-xs">ساعات</th>
          </tr>
        </thead>
        <tbody>
          {propEmployees.map((emp, empIdx) => {
            const totalHours = calcTotalHours(emp.attendance, propShifts);
            return (
              <tr key={empIdx} className="hover:bg-accent/30 transition-colors">
                <td className="emp-name-col text-xs">
                  <div className="flex flex-col items-center gap-1">
                    <select
                      value={empIdx}
                      onChange={(e) => onSwapEmployee?.(empIdx, Number(e.target.value))}
                      className="w-full max-w-[110px] text-xs font-semibold bg-transparent border border-border rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary [...]"
                      title="تبديل الموقع مع موظف آخر"
                    >
                      {propEmployees.map((e, i) => (
                        <option key={i} value={i}>{e.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => onRemoveEmployee(empIdx)}
                      className="text-[0.65rem] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      حذف
                    </button>
                  </div>
                </td>
                
                {days.map(d => {
                  const we = isFriday(year, month, d);
                  const merged = isMerged(empIdx, d);

                  // نقرأ كل خانة (slot) بناءً على slotsPerDay
                  const slotValues: string[] = [];
                  for (let s = 1; s <= slotsPerDay; s++) {
                    const key = `${d}-${s}`;
                    const val = emp.attendance[key] || (s === 1 ? emp.attendance[d] || "" : "") || "";
                    slotValues.push(val);
                  }

                  const shiftFor = (val: string) => val ? propShifts[val] : undefined;

                  return (
                    <td
                      key={d}
                      className={`p-0 select-none ${we && slotValues.every(v => !v) ? "weekend-col" : ""}`}
                      onContextMenu={(e) => handleContextMenu(e, empIdx, d)}
                    >
                      {merged ? (
                        // خلي�� مدمجة: نظهر المحتوى من slot 1 فقط ممتدّاً على كامل المساحة
                        <div
                          className="flex h-[56px] w-full items-center justify-center cursor-pointer transition-all duration-150 hover:ring-2 hover:ring-inset hover:ring-primary active:scale-95"
                          style={slotValues[0] ? getShiftCellStyle(shiftFor(slotValues[0])?.color) : undefined}
                          onClick={() => handleCellClickWithContext(empIdx, d, 1)}
                          onContextMenu={(e) => handleContextMenu(e, empIdx, d)}
                        >
                          {slotValues[0] && shiftFor(slotValues[0]) ? (
                            <div className="flex flex-col items-center justify-center leading-none w-full px-0.5 gap-1">
                              <span className="font-bold text-[0.75rem] truncate max-w-full">{slotValues[0]}</span>
                              <span className="text-[0.5rem] opacity-90 truncate max-w-full">{shiftFor(slotValues[0])?.label}</span>
                              {shiftFor(slotValues[0])?.hours > 0 && (
                                <span className="text-[0.5rem] opacity-80 font-semibold">{shiftFor(slotValues[0])?.hours}س</span>
                              )}
                            </div>
                          ) : <span className="text-[0.6rem] truncate max-w-full px-0.5">{slotValues[0]}</span>}
                        </div>
                      ) : (
                        // عدة خانات منفصلة
                        <div className="flex flex-col h-[56px]">
                          {slotValues.map((val, idx) => {
                            const shift = shiftFor(val);
                            return (
                              <div
                                key={idx}
                                className={`flex-1 min-h-[${Math.max(20, Math.floor(56 / slotsPerDay))}px] overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all [...]`}
                                style={val ? getShiftCellStyle(shift?.color) : undefined}
                                onClick={() => handleCellClickWithContext(empIdx, d, idx + 1)}
                                onContextMenu={(e) => handleContextMenu(e, empIdx, d)}
                              >
                                {val && shift ? (
                                  <div className="flex flex-col items-center justify-center leading-none w-full px-0.5">
                                    <span className="font-bold text-[0.65rem] truncate max-w-full">{val}</span>
                                    <span className="text-[0.45rem] opacity-90 truncate max-w-full">{shift.label}</span>
                                    {shift.hours > 0 && (
                                      <span className="text-[0.45rem] opacity-80">{shift.hours}س</span>
                                    )}
                                  </div>
                                ) : <span className="text-[0.6rem] truncate max-w-full px-0.5">{val}</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="bg-muted font-bold text-sm">{totalHours}</td>
              </tr>
            );
          })}
          {propEmployees.length === 0 && (
            <tr>
              <td colSpan={days.length + 2} className="py-12 text-muted-foreground text-sm">
                لا يوجد موظفين. أضف موظفاً للبدء.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* قائمة السياق (Context Menu) */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-lg shadow-lg"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-0.5 p-1">
            {isMerged(contextMenu.empIdx, contextMenu.day) ? (
              <button
                onClick={() => handleSplit(contextMenu.empIdx, contextMenu.day)}
                className="px-3 py-1.5 text-xs text-left hover:bg-accent rounded transition-colors"
              >
                تقسيم الخلية 📂
              </button>
            ) : (
              <button
                onClick={() => handleMerge(contextMenu.empIdx, contextMenu.day)}
                className="px-3 py-1.5 text-xs text-left hover:bg-accent rounded transition-colors"
              >
                دمج الخليتين 🔗
              </button>
            )}
          </div>
        </div>
      )}

      {/* Preview Modal for schedule */}
      {previewSchedule && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-bold mb-2">معاينة الجدول التلقائي</h3>
            <div className="text-xs text-muted-foreground mb-3">تفاصيل التغييرات المعروضة لن تُحفظ حتى تضغط "تطبيق".</div>

            <div className="overflow-auto max-h-72 border rounded p-2 bg-muted">
              {previewSchedule.details?.violations && previewSchedule.details.violations.length > 0 && (
                <div className="text-sm text-destructive mb-2">انتهاكات: {previewSchedule.details.violations.join(", ")}</div>
              )}

              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left">الموظف</th>
                    <th className="text-left">نمط الحضور (مقتطف)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewSchedule.employees.map((e: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="py-1">{e.name}</td>
                      <td className="py-1">
                        {/* show up to first 6 assigned slots */}
                        {Object.entries(e.attendance || {}).slice(0, 6).map(([k, v]: any, idx: number) => (
                          <span key={idx} className="inline-block px-1 py-0.5 mr-1 rounded bg-accent/20">{k}: {v}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <Button size="sm" onClick={cancelPreview} variant="ghost">إلغاء</Button>
              <Button size="sm" onClick={applyPreview} disabled={busy}>تطبيق وحفظ</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
