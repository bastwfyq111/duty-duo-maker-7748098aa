import { AnimatePresence, motion } from "framer-motion";
import type { ShiftType } from "@/lib/roster";
import { hslStringToHsla, hslStringToCss } from "@/lib/color-utils";

interface ShiftPickerProps {
  open: boolean;
  shifts: Record<string, ShiftType>;
  onSelect: (shift: string) => void;
  onClose: () => void;
}

export default function ShiftPicker({ open, shifts, onSelect, onClose }: ShiftPickerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: 10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed top-1/2 right-3 -translate-y-1/2 z-50 bg-card p-3 rounded-xl shadow-xl border-2 border-foreground/20 w-[88%] max-w-[300px] max-h-[85vh] overflow-y-auto"
          >
            <p className="text-sm font-bold text-foreground mb-2 text-center">اختر نوع المناوبة</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(shifts).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => onSelect(key)}
                  style={{
                    backgroundColor: cfg.color ? hslStringToHsla(cfg.color, 0.18) : undefined,
                    color: cfg.color ? hslStringToCss(cfg.color) : undefined,
                    borderColor: cfg.color ? hslStringToCss(cfg.color) : undefined,
                  }}
                  className="flex flex-col items-center justify-center gap-0.5 py-3 px-1 rounded-lg font-bold text-sm border-2 transition-all duration-150 active:scale-95 hover:opacity-80 min-h-[60px]"
                >
                  <span className="text-lg leading-none">{key}</span>
                  <span className="text-[0.7rem] opacity-80 leading-tight text-center break-words">{cfg.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => onSelect("")}
              className="w-full mt-2 py-2 rounded-lg bg-destructive/10 text-destructive font-semibold text-xs hover:bg-destructive/20 transition-colors active:scale-[0.98]"
            >
              مسح
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
