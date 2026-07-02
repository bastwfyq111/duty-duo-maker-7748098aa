import { useState, useCallback, useMemo } from "react";
import { MONTH_NAMES, getDaysInMonth, getDaysArray, getDayName, isFriday, calcTotalHours } from "@/lib/roster";
import { getShiftFillHex, getShiftFillRgb, hslStringToHsla, hslStringToCss, hslToRgb } from "@/lib/color-utils";
import { useRosterData } from "@/hooks/useRosterData";
import RosterGrid from "@/components/RosterGrid";
import ShiftPicker from "@/components/ShiftPicker";
import { AddShiftDialog, EditShiftDialog } from "@/components/AddShiftDialog";
import InstallBanner from "@/components/InstallBanner";
import StatsView from "@/components/StatsView";
import AutoAssignDialog from "@/components/AutoAssignDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { downloadBackup, restoreBackup } from "@/lib/storage";

export default function RosterPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [newName, setNewName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ empIdx: number; day: number; slot?: number } | null>(null);
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);

  const { employees, shifts, addEmployee, removeEmployee, setShift, bulkSetShifts, swapEmployees, clearAll, clearShiftsOnly, addShiftType, removeShiftType } = useRosterData();

  // KPI summary
  const summary = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    let totalShifts = 0, totalHours = 0;
    employees.forEach(emp => {
      Object.values(emp.attendance).forEach(code => {
        if (code) {
          totalShifts++;
          totalHours += shifts[code]?.hours ?? 0;
        }
      });
    });
    return { totalEmployees: employees.length, totalShifts, totalHours, daysInMonth };
  }, [employees, shifts, year, month]);

  const handleCellClick = useCallback((empIdx: number, day: number, slot?: number) => {
    setActiveCell({ empIdx, day, slot });
    setPickerOpen(true);
  }, []);

  const handleShiftSelect = useCallback((shift: string) => {
    if (activeCell) setShift(activeCell.empIdx, activeCell.day, shift, activeCell.slot);
    setPickerOpen(false);
    setActiveCell(null);
  }, [activeCell, setShift]);

  const handleAdd = useCallback(() => {
    if (newName.trim() && addEmployee(newName)) setNewName("");
  }, [newName, addEmployee]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  }, [handleAdd]);

  // Build a clean clone of the roster table for export:
  // - Replace the <select> in the employee column with the correct employee's name (by row index)
  // - Remove the "حذف" (delete) button
  // NOTE: cloneNode does not reliably preserve <select> selectedIndex in all browsers,
  // so we map each body row to employees[rowIndex].name instead of reading the cloned select.
  const buildExportTable = useCallback((): HTMLTableElement | null => {
    const table = document.getElementById("rosterTable") as HTMLTableElement | null;
    if (!table) return null;
    const clone = table.cloneNode(true) as HTMLTableElement;

    // Replace each row's employee-name <select> with the correct name based on row order
    const bodyRows = Array.from(clone.tBodies[0]?.rows ?? []);
    bodyRows.forEach((row, rowIdx) => {
      const sel = row.querySelector("select");
      if (sel) {
        const span = document.createElement("span");
        span.textContent = employees[rowIdx]?.name ?? "";
        span.style.fontWeight = "700";
        sel.replaceWith(span);
      }
    });

    // Remove action buttons (e.g. حذف)
    clone.querySelectorAll("button").forEach((b) => b.remove());
    return clone;
  }, [employees]);

  const handleExportExcel = useCallback(async () => {
    try {
      if (employees.length === 0) {
        alert("لا يوجد موظفون للتصدير");
        return;
      }
      const [XLSX, { saveAs }] = await Promise.all([
        import("xlsx-js-style"),
        import("file-saver"),
      ]);

      const daysInMonth = getDaysInMonth(year, month);
      const days = getDaysArray(year, month);
      const shiftEntries = Object.entries(shifts);

      // Common style fragments
      const border = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      };
      const center = { horizontal: "center", vertical: "center", wrapText: true };
      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { patternType: "solid", fgColor: { rgb: "1F2937" } },
        alignment: center,
        border,
      };
      const fridayHeaderStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { patternType: "solid", fgColor: { rgb: "16A34A" } },
        alignment: center,
        border,
      };
      const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: "1F2937" } },
        alignment: center,
      };
      const legendHeaderStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "374151" } },
        alignment: center,
        border,
      };
      const empNameStyle = {
        font: { bold: true, sz: 11 },
        fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
        alignment: center,
        border,
      };
      const totalCellStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1F2937" } },
        alignment: center,
        border,
      };
      const dailyTotalLabelStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "374151" } },
        alignment: center,
        border,
      };
      const fridayBaseFill = "DCFCE7"; // light green

      const ws: any = {};
      const merges: any[] = [];
      let r = 0; // 0-indexed row pointer

      const setCell = (row: number, col: number, value: any, style?: any, isFormula = false) => {
        const addr = XLSX.utils.encode_cell({ r: row, c: col });
        if (isFormula) {
          ws[addr] = { t: "n", f: value, s: style };
        } else if (typeof value === "number") {
          ws[addr] = { t: "n", v: value, s: style };
        } else {
          ws[addr] = { t: "s", v: value ?? "", s: style };
        }
      };

      const totalCols = 1 + days.length + 1; // employee + days + total

      // Row 0: Title (merged)
      setCell(r, 0, `جدول الورديات - ${MONTH_NAMES[month]} ${year}`, titleStyle);
      merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
      r++;

      // Row 1: empty spacer
      r++;

      // Legend header
      setCell(r, 0, "الرمز", legendHeaderStyle);
      setCell(r, 1, "اسم الوردية", legendHeaderStyle);
      setCell(r, 2, "عدد الساعات", legendHeaderStyle);
      r++;
      const lookupStartRow = r + 1; // 1-indexed
      shiftEntries.forEach(([code, s]) => {
        const fill = getShiftFillHex(s.color);
        const codeStyle: any = {
          font: { bold: true },
          alignment: center,
          border,
          ...(fill ? { fill: { patternType: "solid", fgColor: { rgb: fill } } } : {}),
        };
        setCell(r, 0, code, codeStyle);
        setCell(r, 1, s.label ?? "", { alignment: center, border });
        setCell(r, 2, Number(s.hours ?? 0), { alignment: center, border });
        r++;
      });
      const lookupEndRow = r; // 1-indexed last
      const codeRange = `$A$${lookupStartRow}:$A$${lookupEndRow}`;
      const hoursRange = `$C$${lookupStartRow}:$C$${lookupEndRow}`;

      // spacer
      r++;

      // Roster header row: employee | day1 | ... | total
      setCell(r, 0, "الموظف", headerStyle);
      days.forEach((d, i) => {
        const we = isFriday(year, month, d);
        setCell(r, 1 + i, `${getDayName(year, month, d)}\n${d}`, we ? fridayHeaderStyle : headerStyle);
      });
      setCell(r, 1 + days.length, "إجمالي الساعات", headerStyle);
      const rosterHeaderRowIdx = r + 1; // 1-indexed
      r++;

      const firstDayColLetter = XLSX.utils.encode_col(1);
      const lastDayColLetter = XLSX.utils.encode_col(days.length);
      const totalColLetter = XLSX.utils.encode_col(days.length + 1);

      // Employee rows (two rows per employee: slot 1 and slot 2)
      const firstEmpRow = r + 1; // 1-indexed
      employees.forEach((emp) => {
        const row1 = r;
        const row2 = r + 1;
        const excelRow1 = row1 + 1;
        const excelRow2 = row2 + 1;

        // Row 1 (slot 1)
        setCell(row1, 0, emp.name, empNameStyle);
        days.forEach((d, i) => {
          const code = emp.attendance[`${d}-1`] || emp.attendance[d] || "";
          const shift = code ? shifts[code] : undefined;
          const we = isFriday(year, month, d);
          let fillHex: string | undefined;
          if (shift?.color) fillHex = getShiftFillHex(shift.color);
          else if (we) fillHex = fridayBaseFill;
          const cellStyle: any = {
            font: { bold: !!shift, sz: 11 },
            alignment: center,
            border,
            ...(fillHex ? { fill: { patternType: "solid", fgColor: { rgb: fillHex } } } : {}),
          };
          setCell(row1, 1 + i, code, cellStyle);
        });

        // Row 2 (slot 2) - ✅ تصحيح الخطأ: استبدال shiftFillHex بـ getShiftFillHex
        setCell(row2, 0, "", empNameStyle);
        days.forEach((d, i) => {
          const code = emp.attendance[`${d}-2`] || "";
          const shift = code ? shifts[code] : undefined;
          const we = isFriday(year, month, d);
          let fillHex: string | undefined;
          if (shift?.color) fillHex = getShiftFillHex(shift.color);
          else if (we) fillHex = fridayBaseFill;
          const cellStyle: any = {
            font: { bold: !!shift, sz: 11 },
            alignment: center,
            border,
            ...(fillHex ? { fill: { patternType: "solid", fgColor: { rgb: fillHex } } } : {}),
          };
          setCell(row2, 1 + i, code, cellStyle);
        });

        // Total hours: sum of both rows using SUMPRODUCT
        const totalFormula = shiftEntries.length > 0
          ? `SUMPRODUCT(SUMIF(${codeRange},${firstDayColLetter}${excelRow1}:${lastDayColLetter}${excelRow1},${hoursRange}))+SUMPRODUCT(SUMIF(${codeRange},${firstDayColLetter}${excelRow2}:${lastDayColLetter}${excelRow2},${hoursRange}))`
          : `0`;
        setCell(row1, 1 + days.length, totalFormula, totalCellStyle, true);

        // Merge employee name cell and total cell across both rows
        merges.push({ s: { r: row1, c: 0 }, e: { r: row2, c: 0 } });
        merges.push({ s: { r: row1, c: 1 + days.length }, e: { r: row2, c: 1 + days.length } });

        r += 2;
      });
      const lastEmpRow = r; // 1-indexed

      // Daily totals row
      setCell(r, 0, "الإجمالي اليومي", dailyTotalLabelStyle);
      days.forEach((d, i) => {
        const colLetter = XLSX.utils.encode_col(1 + i);
        const f = shiftEntries.length > 0
          ? `SUMPRODUCT(SUMIF(${codeRange},${colLetter}${firstEmpRow}:${colLetter}${lastEmpRow},${hoursRange}))`
          : `0`;
        const we = isFriday(year, month, d);
        const style: any = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: we ? "16A34A" : "374151" } },
          alignment: center,
          border,
        };
        setCell(r, 1 + i, f, style, true);
      });
      setCell(r, 1 + days.length, `SUM(${totalColLetter}${firstEmpRow}:${totalColLetter}${lastEmpRow})`, totalCellStyle, true);
      r++;

      // Set worksheet range
      ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: totalCols - 1 } });
      ws["!merges"] = merges;
      ws["!dir"] = "rtl";

      // Column widths
      const cols: any[] = [{ wch: 18 }];
      for (let i = 0; i < days.length; i++) cols.push({ wch: 6 });
      cols.push({ wch: 14 });
      ws["!cols"] = cols;

      // Row heights: header rows taller
      const rows: any[] = [];
      rows[0] = { hpt: 24 };
      rows[rosterHeaderRowIdx - 1] = { hpt: 32 };
      ws["!rows"] = rows;

      const wb = XLSX.utils.book_new();
      (wb as any).Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, "الدوام");

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), `جدول_دوام_${MONTH_NAMES[month]}_${year}.xlsx`);
    } catch (e) {
      console.error("Excel export error:", e);
      alert("حدث خطأ في تصدير الملف: " + (e instanceof Error ? e.message : "خطأ غير معروف"));
    }
  }, [month, year, shifts, employees]);

  const handleExportPDF = useCallback(async () => {
    try {
      if (employees.length === 0) {
        alert("لا يوجد موظفون للتصدير");
        return;
      }

      const [{ default: jsPDF }, autoTableMod, { amiriBase64 }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
        import("@/lib/amiri-font"),
      ]);
      const autoTable = (autoTableMod as any).default || (autoTableMod as any);

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Embed Amiri font for proper Arabic rendering
      try {
        pdf.addFileToVFS("Amiri-Regular.ttf", amiriBase64);
        pdf.addFont("Amiri-Regular.ttf", "Amiri", "normal");
        pdf.setFont("Amiri", "normal");
      } catch (fontErr) {
        console.warn("Failed to embed Amiri font, falling back to default:", fontErr);
      }

      const pageWidth = pdf.internal.pageSize.getWidth();

      // Title
      pdf.setFontSize(16);
      pdf.text(`جدول الدوام - ${MONTH_NAMES[month]} ${year}`, pageWidth / 2, 12, { align: "center" });

      // Build day list
      const daysInMonth = getDaysInMonth(year, month);
      const days = getDaysArray(year, month);

      // Build head: two rows (day name, day number) + employee + total
      const headRow1: any[] = [{ content: "الموظف", rowSpan: 2, styles: { halign: "center", valign: "middle", fillColor: [30, 30, 30], textColor: [255, 255, 255] } }];
      days.forEach((d) => {
        const we = isFriday(year, month, d);
        headRow1.push({
          content: getDayName(year, month, d),
          styles: {
            halign: "center",
            fillColor: we ? [16, 150, 80] : [40, 40, 40],
            textColor: [255, 255, 255],
          },
        });
      });
      headRow1.push({ content: "ساعات", rowSpan: 2, styles: { halign: "center", valign: "middle", fillColor: [30, 30, 30], textColor: [255, 255, 255] } });

      const headRow2: any[] = [];
      days.forEach((d) => {
        const we = isFriday(year, month, d);
        headRow2.push({
          content: String(d),
          styles: {
            halign: "center",
            fillColor: we ? [60, 180, 110] : [60, 60, 60],
            textColor: [255, 255, 255],
          },
        });
      });

      // Build body rows (two rows per employee: slot 1 and slot 2)
      const body: any[][] = [];
      employees.forEach((emp) => {
        // Row 1 (slot 1)
        const row1: any[] = [{ content: emp.name, rowSpan: 2, styles: { halign: "center", valign: "middle", fontStyle: "normal", fillColor: [245, 245, 245] } }];
        days.forEach((d) => {
          const code = emp.attendance[`${d}-1`] || emp.attendance[d] || "";
          const shift = code ? shifts[code] : undefined;
          let text = "";
          if (code && shift) {
            const hoursPart = shift.hours > 0 ? `\n${shift.hours}س` : "";
            text = `${code}\n${shift.label}${hoursPart}`;
          }
          let fillColor: number[] | undefined;
          if (shift?.color) {
            fillColor = getShiftFillRgb(shift.color);
          } else if (isFriday(year, month, d)) {
            fillColor = [200, 240, 215];
          }
          row1.push({
            content: text,
            styles: { halign: "center", valign: "middle", fontSize: 4.5, fillColor },
          });
        });
        const total = calcTotalHours(emp.attendance, shifts);
        row1.push({ content: String(total), rowSpan: 2, styles: { halign: "center", valign: "middle", fontStyle: "normal", fillColor: [30, 30, 30], textColor: [255, 255, 255] } });
        body.push(row1);

        // Row 2 (slot 2)
        const row2: any[] = [];
        days.forEach((d) => {
          const code = emp.attendance[`${d}-2`] || "";
          const shift = code ? shifts[code] : undefined;
          let text = "";
          if (code && shift) {
            const hoursPart = shift.hours > 0 ? `\n${shift.hours}س` : "";
            text = `${code}\n${shift.label}${hoursPart}`;
          }
          let fillColor: number[] | undefined;
          if (shift?.color) {
            fillColor = getShiftFillRgb(shift.color);
          } else if (isFriday(year, month, d)) {
            fillColor = [200, 240, 215];
          }
          row2.push({
            content: text,
            styles: { halign: "center", valign: "middle", fontSize: 4.5, fillColor },
          });
        });
        body.push(row2);
      });

      // A4 landscape: distribute width across employee + days + total
      const margin = 5;
      const usableWidth = pageWidth - margin * 2;
      const empCol = 24;
      const totalCol = 10;
      const dayCol = Math.max(4.5, (usableWidth - empCol - totalCol) / days.length);

      const columnStyles: Record<number, any> = {
        0: { cellWidth: empCol },
        [days.length + 1]: { cellWidth: totalCol },
      };
      for (let i = 1; i <= days.length; i++) columnStyles[i] = { cellWidth: dayCol };

      autoTable(pdf, {
        head: [headRow1, headRow2],
        body,
        startY: 18,
        theme: "grid",
        styles: {
          font: "Amiri",
          fontSize: 5.5,
          cellPadding: 0.5,
          lineColor: [0, 0, 0],
          lineWidth: 0.1,
          halign: "center",
          valign: "middle",
          overflow: "linebreak",
        },
        headStyles: {
          font: "Amiri",
          fontSize: 6,
          fontStyle: "normal",
          fillColor: [40, 40, 40],
          textColor: [255, 255, 255],
        },
        columnStyles,
        margin: { left: margin, right: margin },
        tableWidth: "auto",
        didDrawPage: () => {
          pdf.setFont("Amiri", "normal");
        },
      });

      // Shifts legend at the bottom
      const finalY = (pdf as any).lastAutoTable?.finalY ?? 18;
      const legendY = finalY + 6;
      pdf.setFontSize(10);
      pdf.text("مفتاح الورديات:", pageWidth - 10, legendY, { align: "right" });

      const legendBody = Object.entries(shifts).map(([code, s]) => {
        const fill = getShiftFillRgb(s.color);
        return [
          { content: code, styles: { halign: "center", fillColor: fill } },
          { content: s.label, styles: { halign: "center" } },
          { content: `${s.hours} ساعة`, styles: { halign: "center" } },
        ];
      });

      autoTable(pdf, {
        head: [["الرمز", "اسم الوردية", "عدد الساعات"]],
        body: legendBody,
        startY: legendY + 3,
        theme: "grid",
        styles: { font: "Amiri", fontSize: 9, halign: "center", lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { font: "Amiri", fillColor: [40, 40, 40], textColor: [255, 255, 255] },
        margin: { left: pageWidth / 2, right: 10 },
        tableWidth: "auto",
      });

      pdf.save(`جدول_دوام_${MONTH_NAMES[month]}_${year}.pdf`);
    } catch (e) {
      console.error("PDF export error:", e);
      alert("حدث خطأ في تصدير PDF: " + (e instanceof Error ? e.message : "خطأ غير معروف"));
    }
  }, [month, year, employees, shifts]);


  const handleClear = useCallback(() => {
    if (confirm("سيتم مسح جميع الموظفين والبيانات، هل أنت متأكد؟")) clearAll();
  }, [clearAll]);

  const handleClearShiftsOnly = useCallback(() => {
    if (confirm("سيتم مسح جميع الورديات مع الاحتفاظ بأسماء الموظفين، هل أنت متأكد؟")) clearShiftsOnly();
  }, [clearShiftsOnly]);

  const handleBackup = useCallback(() => {
    try {
      downloadBackup(`roster-backup-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) {
      alert("فشل إنشاء النسخة الاحتياطية: " + (e instanceof Error ? e.message : "خطأ"));
    }
  }, []);

  const handleRestore = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!confirm("سيتم استبدال بيانات التطبيق الحالية بمحتوى الملف، هل أنت متأكد؟")) return;
      try {
        const n = await restoreBackup(file);
        alert(`تمت الاستعادة بنجاح (${n} عنصر). سيتم إعادة تحميل الصفحة.`);
        location.reload();
      } catch (e) {
        alert("فشلت الاستعادة: " + (e instanceof Error ? e.message : "خطأ"));
      }
    };
    input.click();
  }, []);

  const inputClass = "px-3 py-2.5 rounded-lg border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

  return (
    <div className="min-h-screen py-2 safe-area-inset">
      <InstallBanner />
      <div className="roster-container">
        <div className="text-center mb-4">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-2"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
          >
            <span className="text-lg">✨</span>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#f5f0e0]">
              نظام إدارة المناوبات
            </h1>
            <span className="text-lg">✨</span>
          </div>
          <div className="h-0.5 w-24 mx-auto rounded-full" style={{ background: "var(--gradient-gold)" }} />
        </div>

        {/* KPI Summary cards */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          <Card className="p-2 text-center border-primary/20" style={{ boxShadow: "var(--shadow-md)" }}>
            <div className="text-[0.6rem] text-muted-foreground">موظفين</div>
            <div className="text-sm font-bold text-primary">{summary.totalEmployees}</div>
          </Card>
          <Card className="p-2 text-center border-primary/20" style={{ boxShadow: "var(--shadow-md)" }}>
            <div className="text-[0.6rem] text-muted-foreground">ورديات</div>
            <div className="text-sm font-bold text-primary">{summary.totalShifts}</div>
          </Card>
          <Card className="p-2 text-center border-accent/40" style={{ boxShadow: "var(--shadow-gold)" }}>
            <div className="text-[0.6rem] text-muted-foreground">ساعات</div>
            <div className="text-sm font-bold" style={{ color: "hsl(44 55% 40%)" }}>{summary.totalHours}</div>
          </Card>
          <Card className="p-2 text-center border-primary/20" style={{ boxShadow: "var(--shadow-md)" }}>
            <div className="text-[0.6rem] text-muted-foreground">أيام</div>
            <div className="text-sm font-bold text-primary">{summary.daysInMonth}</div>
          </Card>
        </div>


        {/* Month/Year controls (always visible) */}
        <Card className="p-2 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className={inputClass}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className={inputClass}>
              {Array.from({ length: 7 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </Card>

        <Tabs defaultValue="schedule" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-3">
            <TabsTrigger value="schedule" className="text-xs">📅 الجدول</TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">📊 إحصائيات</TabsTrigger>
            <TabsTrigger value="auto" className="text-xs">⚡ توزيع تلقائي</TabsTrigger>
          </TabsList>

          {/* SCHEDULE TAB */}
          <TabsContent value="schedule" className="mt-0 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={handleKeyDown} placeholder="اسم الموظف" className={inputClass}
              />
              <button onClick={handleAdd} disabled={!newName.trim()} className="px-3 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed">
                إضافة موظف
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[0.7rem] text-muted-foreground font-semibold">الورديات:</span>
              {Object.entries(shifts).map(([code, cfg]) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: cfg.color ? hslStringToHsla(cfg.color, 0.15) : undefined,
                    color: cfg.color ? hslStringToCss(cfg.color) : undefined,
                  }}
                  onClick={() => setEditingShift(code)}
                >
                  {code} ({cfg.hours}س)
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`حذف الوردية ${code}؟`)) removeShiftType(code); }}
                    className="mr-0.5 hover:opacity-70 text-[0.55rem]"
                  >✕</button>
                </span>
              ))}
              <button
                onClick={() => setShiftDialogOpen(true)}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                + وردية
              </button>
            </div>

            <RosterGrid
              employees={employees}
              shifts={shifts}
              month={month}
              year={year}
              onCellClick={handleCellClick}
              onRemoveEmployee={(idx) => { if (confirm("هل تريد حذف هذا الموظف؟")) removeEmployee(idx); }}
              onSwapEmployee={swapEmployees}
            />

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleExportExcel} className="py-2.5 rounded-lg btn-primary-emerald text-xs active:scale-[0.97] transition-transform">
                📊 تصدير Excel
              </button>
              <button onClick={handleExportPDF} className="py-2.5 rounded-lg btn-gold text-xs active:scale-[0.97] transition-transform">
                📄 تصدير PDF
              </button>
              <button onClick={handleBackup} className="py-2.5 rounded-lg bg-primary/10 text-primary border border-primary/30 font-bold text-xs hover:bg-primary/20 transition-all active:scale-[0.97]">
                💾 نسخة احتياطية
              </button>
              <button onClick={handleRestore} className="py-2.5 rounded-lg bg-accent/15 text-accent-foreground border border-accent/40 font-bold text-xs hover:bg-accent/25 transition-all active:scale-[0.97]">
                📥 استعادة نسخة
              </button>
              <button onClick={handleClearShiftsOnly} className="py-2.5 rounded-lg bg-[hsl(38,92%,50%)] text-white font-semibold text-xs hover:opacity-90 transition-all active:scale-[0.97]">
                🔄 مسح الورديات فقط
              </button>
              <button onClick={handleClear} className="py-2.5 rounded-lg bg-destructive text-destructive-foreground font-semibold text-xs hover:opacity-90 transition-all active:scale-[0.97]">
                🗑️ مسح البيانات
              </button>
            </div>

          </TabsContent>

          {/* STATS TAB */}
          <TabsContent value="stats" className="mt-0">
            <StatsView employees={employees} shifts={shifts} month={month} year={year} />
          </TabsContent>

          {/* AUTO-ASSIGN TAB */}
          <TabsContent value="auto" className="mt-0">
            <Card className="p-4 space-y-3 text-right">
              <h3 className="text-sm font-bold text-foreground">⚡ التوزيع التلقائي للورديات</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                وزّع الورديات تلقائياً على الموظفين بناءً على شروط تحددها أنت:
                الحد الأقصى للساعات، أيام العمل المتتالية، يوم الراحة الأسبوعي،
                والحد الأدنى من الموظفين لكل وردية يومياً.
              </p>
              <ul className="text-[0.7rem] text-muted-foreground space-y-1 mr-3 list-disc">
                <li>توزيع عادل لموازنة الساعات بين الموظفين</li>
                <li>معاينة قبل التطبيق لمراجعة النتيجة</li>
                <li>إمكانية الاحتفاظ بالخلايا الممتلئة أو استبدالها</li>
              </ul>
              <button
                onClick={() => setAutoAssignOpen(true)}
                disabled={employees.length === 0}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {employees.length === 0 ? "أضف موظفين أولاً" : "بدء التوزيع التلقائي"}
              </button>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ShiftPicker open={pickerOpen} shifts={shifts} onSelect={handleShiftSelect} onClose={() => { setPickerOpen(false); setActiveCell(null); }} />
      <AddShiftDialog open={shiftDialogOpen} onClose={() => setShiftDialogOpen(false)} onAdd={addShiftType} existingCodes={Object.keys(shifts)} />
      <EditShiftDialog
        open={!!editingShift}
        onClose={() => setEditingShift(null)}
        onSave={addShiftType}
        shiftCode={editingShift || ""}
        shiftData={editingShift ? shifts[editingShift] : null}
      />
      <AutoAssignDialog
        open={autoAssignOpen}
        onClose={() => setAutoAssignOpen(false)}
        employees={employees}
        shifts={shifts}
        month={month}
        year={year}
        onApply={bulkSetShifts}
      />
    </div>
  );
}
