import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "installBannerDismissedAt";

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    // Show again after 7 days
    const last = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (last && Date.now() - last < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const installedHandler = () => setDismissed(true);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const install = async () => {
    if (!deferredPrompt) {
      setShowInstructions(true);
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") handleDismiss();
    setDeferredPrompt(null);
  };

  // Standalone already? Hide entirely.
  if (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) {
    return null;
  }
  if (dismissed) return null;

  return (
    <>
      <div
        className="mx-2 sm:mx-4 mb-3 p-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg border border-accent/30"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 w-10 h-10 rounded-xl grid place-items-center"
            style={{ background: "var(--gradient-gold)" }}
          >
            <Download className="w-5 h-5 text-[#064e3b]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#f5f0e0]">ثبّت التطبيق على هاتفك</div>
            <div className="text-[0.7rem] text-[#f5f0e0]/80 truncate">يعمل بدون إنترنت — شاومي، سامسونج، وجميع هواتف أندرويد</div>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={install}
            className="px-3 py-1.5 rounded-lg text-[#064e3b] text-xs font-bold active:scale-95 transition-transform"
            style={{ background: "var(--gradient-gold)" }}
          >
            تثبيت
          </button>
          <button
            onClick={handleDismiss}
            aria-label="لاحقاً"
            className="p-1.5 rounded-lg bg-white/10 text-[#f5f0e0] active:scale-95 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showInstructions && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowInstructions(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-accent/30 text-right"
          >
            <h3 className="text-lg font-bold text-primary mb-3">كيفية التثبيت</h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-bold text-primary mb-1">🟢 شاومي / Redmi / MIUI</div>
                <p className="text-muted-foreground text-xs">
                  اضغط زر القائمة (⋮) في متصفح Chrome أو Mi Browser → اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».
                </p>
              </div>
              <div>
                <div className="font-bold text-primary mb-1">🔵 سامسونج / Samsung Internet</div>
                <p className="text-muted-foreground text-xs">
                  اضغط زر القائمة (☰) → «إضافة الصفحة إلى» → «الشاشة الرئيسية».
                </p>
              </div>
              <div>
                <div className="font-bold text-primary mb-1"> Safari (آيفون)</div>
                <p className="text-muted-foreground text-xs">
                  زر المشاركة → «إضافة إلى الشاشة الرئيسية».
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowInstructions(false)}
              className="w-full mt-4 py-2 rounded-lg btn-primary-emerald"
            >
              حسناً
            </button>
          </div>
        </div>
      )}
    </>
  );
}
