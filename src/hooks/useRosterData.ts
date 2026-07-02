import { useState, useCallback } from "react";
import { loadShifts, saveShifts, type ShiftType } from "@/lib/roster";
import { loadFromStorage, saveToStorage } from "@/lib/storage-utils";

export interface Employee {
  name: string;
  // التعديل الأول: المفتاح يقبل string ليتوافق مع التقسيم الجديد
  attendance: Record<string | number, string>;
}

const STORAGE_KEY = "rosterData";

function loadEmployees(): Employee[] {
  return loadFromStorage<Employee[]>(STORAGE_KEY, []);
}

function saveEmployeesToStorage(employees: Employee[]) {
  saveToStorage(STORAGE_KEY, employees);
}

export function useRosterData() {
  const [employees, setEmployees] = useState<Employee[]>(loadEmployees);
  const [shifts, setShifts] = useState<Record<string, ShiftType>>(loadShifts);

  // تحديث الموظفين في الحالة والتخزين معاً
  const updateEmployees = useCallback((next: Employee[]) => {
    setEmployees(next);
    saveEmployeesToStorage(next);
  }, []);

  const addEmployee = useCallback((name: string) => {
    if (!name.trim()) return false;
    
    // نستخدم الحالة السابقة (prev) لإضافة الموظف الجديد
    setEmployees((prev) => {
      const updated = [...prev, { name: name.trim(), attendance: {} }];
      saveEmployeesToStorage(updated);
      return updated;
    });
    return true;
  }, []);

  const removeEmployee = useCallback((idx: number) => {
    setEmployees((prev) => {
      const updated = [...prev]; // إنشاء نسخة جديدة من المصفوفة
      updated.splice(idx, 1);    // إزالة الموظف
      saveEmployeesToStorage(updated);
      return updated;
    });
  }, []);

  // التعديل الثاني: إضافة معامل slot لتحديد الخلية الفرعية
  const setShift = useCallback((empIdx: number, day: number, shift: string, slot?: number) => {
    setEmployees((prev) => {
      const updated = [...prev];
      if (updated[empIdx]) {
        // إنشاء نسخة جديدة للموظف وسجل حضوره لتجنب التعديل المباشر (Mutation)
        const updatedEmployee = { ...updated[empIdx] };
        updatedEmployee.attendance = { ...updatedEmployee.attendance };
        
        const key = slot ? `${day}-${slot}` : day.toString();
        updatedEmployee.attendance[key] = shift;
        
        updated[empIdx] = updatedEmployee;
        saveEmployeesToStorage(updated);
      }
      return updated;
    });
  }, []);

  const bulkSetShifts = useCallback((newEmployees: Employee[]) => {
    updateEmployees(newEmployees);
  }, [updateEmployees]);

  const swapEmployees = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    
    setEmployees((prev) => {
      const updated = [...prev];
      if (!updated[fromIdx] || !updated[toIdx]) return prev;
      
      // تبديل الأماكن باستخدام التفكيك (Destructuring)
      [updated[fromIdx], updated[toIdx]] = [updated[toIdx], updated[fromIdx]];
      saveEmployeesToStorage(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    updateEmployees([]);
  }, [updateEmployees]);

  const clearShiftsOnly = useCallback(() => {
    setEmployees((prev) => {
      const cleared = prev.map(emp => ({ ...emp, attendance: {} }));
      saveEmployeesToStorage(cleared);
      return cleared;
    });
  }, []);

  const addShiftType = useCallback((code: string, shiftType: ShiftType) => {
    setShifts((prev) => {
      const updated = { ...prev, [code]: shiftType };
      saveShifts(updated);
      return updated;
    });
  }, []);

  const removeShiftType = useCallback((code: string) => {
    setShifts((prev) => {
      const updated = { ...prev };
      delete updated[code];
      saveShifts(updated);
      return updated;
    });
  }, []);

  return { 
    employees, 
    shifts, 
    addEmployee, 
    removeEmployee, 
    setShift, 
    bulkSetShifts, 
    swapEmployees, 
    clearAll, 
    clearShiftsOnly, 
    addShiftType, 
    removeShiftType 
  };
}
