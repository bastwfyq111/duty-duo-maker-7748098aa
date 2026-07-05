import { useState, useEffect } from "react";  
import { AnimatePresence, motion } from "framer-motion";  
import type { ShiftType, ShiftDirection } from "@/lib/roster";  
import { hslStringToCss } from "@/lib/color-utils";  
  
const PRESET_COLORS = [  
  "195 100% 50%",  // سماوي كهربائي  
  "231 97% 65%",   // أزرق نيلي لامع  
  "265 89% 66%",   // بنفسجي كهربائي  
  "292 84% 61%",   // أرجواني ماجنتا  
  "322 90% 62%",   // وردي نيون  
  "348 90% 61%",   // أحمر توتي  
  "8 92% 62%",     // مرجاني ناري  
  "27 96% 55%",    // برتقالي مانجو  
  "43 96% 56%",    // كهرماني ذهبي  
  "58 92% 52%",    // أصفر ليموني  
  "88 68% 50%",    // أخضر تفاحي  
  "142 76% 45%",   // أخضر زمردي  
  "162 84% 43%",   // أخضر بحري  
  "174 80% 45%",   // تركوازي مائي  
  "186 90% 47%",   // فيروزي لامع  
  "210 90% 56%",   // أزرق ياقوتي  
  "246 70% 58%",   // بنفسجي ملكي  
  "279 66% 55%",   // أوركيد عميق  
  "312 72% 52%",   // فوشيا غامق  
  "334 78% 52%",   // توتي غامق  
  "14 78% 48%",    // نحاسي محروق  
  "36 70% 45%",    // كهرماني ترابي  
  "168 55% 38%",   // أخضر صنوبري  
  "222 47% 42%",   // أزرق ليلي  
];  
  
const inputClass = "px-2.5 py-2 rounded-md border border-input bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";  
  
// ---- Add Shift Dialog ----  
interface AddShiftDialogProps {  
  open: boolean;  
  onClose: () => void;  
  onAdd: (code: string, shift: ShiftType) => void;  
  existingCodes: string[];  
}  
  
export function AddShiftDialog({ open, onClose, onAdd, existingCodes }: AddShiftDialogProps) {  
  const [code, setCode] = useState("");  
  const [label, setLabel] = useState("");  
  const [hours, setHours] = useState("");  
  const [color, setColor] = useState(PRESET_COLORS[0]);  
  const [error, setError] = useState("");  
  
  const reset = () => { setCode(""); setLabel(""); setHours(""); setColor(PRESET_COLORS[0]); setError(""); };  
  
  const handleAdd = () => {  
    const trimCode = code.trim().toUpperCase();  
    if (!trimCode || !label.trim()) { setError("يرجى ملء الرمز والاسم"); return; }  
    if (trimCode.length > 4) { setError("الرمز يجب ألا يتجاوز 4 أحرف"); return; }  
    if (existingCodes.includes(trimCode)) { setError("هذا الرمز موجود بالفعل"); return; }  
    onAdd(trimCode, { hours: Number(hours) || 0, label: label.trim(), color });  
    reset();  
    onClose();  
  };  
  
  return (  
    <DialogShell open={open} onClose={() => { reset(); onClose(); }} title="إضافة وردية جديدة">  
      <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="الرمز (مثال: E)" maxLength={4} className={`${inputClass} text-center`} />  
      <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="اسم الوردية (مثال: مسائي)" className={inputClass} />  
      <input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="عدد الساعات" min={0} max={24} className={inputClass} />  
      <ColorPicker value={color} onChange={setColor} />  
      {error && <p className="text-xs text-destructive text-center">{error}</p>}  
      <button onClick={handleAdd} className="py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.97]">  
        إضافة  
      </button>  
    </DialogShell>  
  );  
}  
  
// ---- Edit Shift Dialog ----  
interface EditShiftDialogProps {  
  open: boolean;  
  onClose: () => void;  
  onSave: (code: string, shift: ShiftType) => void;  
  shiftCode: string;  
  shiftData: ShiftType | null;  
}  
  
export function EditShiftDialog({ open, onClose, onSave, shiftCode, shiftData }: EditShiftDialogProps) {  
  const [label, setLabel] = useState("");  
  const [hours, setHours] = useState("");  
  const [color, setColor] = useState(PRESET_COLORS[0]);  
  
  useEffect(() => {  
    if (shiftData) {  
      setLabel(shiftData.label);  
      setHours(String(shiftData.hours));  
      setColor(shiftData.color || PRESET_COLORS[0]);  
    }  
  }, [shiftData]);  
  
  const handleSave = () => {  
    if (!label.trim()) return;  
    onSave(shiftCode, { hours: Number(hours) || 0, label: label.trim(), color });  
    onClose();  
  };  
  
  return (  
    <DialogShell open={open} onClose={onClose} title={`تعديل الوردية: ${shiftCode}`}>  
      <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="اسم الوردية" className={inputClass} />  
      <input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="عدد الساعات" min={0} max={24} className={inputClass} />  
      <ColorPicker value={color} onChange={setColor} />  
      <button onClick={handleSave} className="py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.97]">  
        حفظ التعديلات  
      </button>  
    </DialogShell>  
  );  
}  
  
// ---- Shared components ----  
function DialogShell({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {  
  return (  
    <AnimatePresence>  
      {open && (  
        <>  
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50" onClick={onClose} />  
          <motion.div  
            initial={{ opacity: 0, scale: 0.9, y: 20 }}  
            animate={{ opacity: 1, scale: 1, y: 0 }}  
            exit={{ opacity: 0, scale: 0.95, y: 10 }}  
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}  
            className="fixed bottom-[15%] left-[20%] -translate-x-1/2 translate-y-1/2 z-50 bg-card p-2 rounded-lg shadow-xl border-2 border-foreground/20 w-[55%] max-w-[200px] max-h-[70vh] overflow-y-auto"  
          >  
            <p className="text-sm font-bold text-foreground mb-2 text-center">{title}</p>  
            <div className="flex flex-col gap-2">{children}</div>  
          </motion.div>  
        </>  
      )}  
    </AnimatePresence>  
  );  
}  
  
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {  
  return (  
    <div>  
      <p className="text-[0.7rem] font-semibold text-foreground mb-1.5">اللون</p>  
      <div className="grid grid-cols-6 gap-1.5 max-h-36 overflow-y-auto p-0.5">  
        {PRESET_COLORS.map(c => (  
          <button  
            key={c}  
            onClick={() => onChange(c)}  
            className={`w-8 h-8 rounded-full border-2 transition-all active:scale-95 ${value === c ? "ring-2 ring-foreground ring-offset-1 border-foreground scale-110" : "border-foreground/20 hover:scale-110"}`}  
            style={{ backgroundColor: hslStringToCss(c) }}  
          />  
        ))}  
      </div>  
    </div>  
  );  
}  
  
export default AddShiftDialog;
