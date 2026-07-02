
## 1) تحسين الهوية البصرية (زمردي فاخر + ذهبي)

- تحديث `src/index.css`:
  - `--background`: كريمي فاتح (`#f5f0e0` → HSL)
  - `--primary`: زمردي عميق `#064e3b`
  - `--accent`: ذهبي `#c9a84c`
  - `--card` مع ظلال ناعمة + `--gradient-primary` (زمردي→زمردي فاتح) و`--gradient-gold` للأزرار المميزة
  - تحسين حدود الجدول (بدل الأسود الصارم، حواف زمردية داكنة رفيعة مع تظليل خفيف للصفوف الفردية)
  - رأس الجدول: تدرج زمردي مع نص ذهبي، يوم الجمعة بذهبي مميز
- تحديث `tailwind.config.ts` لإضافة ألوان `emerald-brand` و `gold-brand` كـ tokens
- إضافة خلفية ناعمة للصفحة (تدرج زمردي شفاف + نقاط خفيفة) في `src/pages/Index.tsx`
- تنعيم أزرار الشريط العلوي مع أيقونات ذهبية

## 2) تحويله إلى تطبيق أندرويد قابل للتثبيت (PWA)

- إنشاء `public/manifest.webmanifest` باسم عربي، ألوان الثيم الزمردية، `display: standalone`
- إنشاء أيقونات PWA (192, 384, 512, maskable) بالهوية الجديدة عبر `imagegen`
- تحديث `index.html` بوسوم `manifest`, `theme-color`, `apple-touch-icon`
- تحسين `InstallBanner.tsx` بتصميم أنيق يظهر تعليمات التثبيت لهواتف شاومي/MIUI (Menu → Add to Home Screen)
- الإبقاء على SW موجود بالفعل (لا إضافة offline caching جديد سوى ما هو قائم)

## 3) تخزين البيانات في IndexedDB (ذاكرة داخلية)

- إضافة مكتبة `idb-keyval` (بسيطة، خفيفة)
- إنشاء `src/lib/storage.ts` بواجهة `getItem/setItem` غير متزامنة تستخدم IndexedDB مع fallback إلى LocalStorage
- ترحيل `useRosterData.ts` من `localStorage` مباشرة إلى الطبقة الجديدة
  - migration تلقائي: عند أول تشغيل، ينقل البيانات الحالية من LocalStorage إلى IndexedDB
- الفوائد: سعة أكبر (لا حد 5MB)، أداء أفضل مع بيانات كثيرة، يبقى offline كاملاً

## 4) تحسين التوزيع التلقائي

في `src/lib/auto-assign.ts` و `src/components/AutoAssignDialog.tsx`:

### أ) عدالة أدق في الساعات
- بعد التوزيع الأولي، تشغيل **pass تحسيني** يبادل ورديات بين موظف بأعلى ساعات وموظف بأقل ساعات لتقليص الفارق
- هدف: فرق أقصى بين أعلى وأدنى ساعات ≤ (متوسط ساعات وردية واحدة)
- عرض ملخص في نهاية التوزيع: أعلى/أدنى/متوسط الساعات

### ب) منع تعاقب ورديات متعبة
- إضافة قاعدة: **بعد وردية ليلية (N) يوم راحة إجباري** أو على الأقل عدم تعيين وردية صباحية (M) في اليوم التالي
- منع أكثر من ليليتين متتاليتين
- منع نمط M→N في نفس اليوم (سلوت 1 و 2)

### ج) احترام تفضيلات الموظف
- إضافة حقول للموظف في `useRosterData.ts`:
  - `preferredShifts: string[]` — ورديات مفضلة
  - `blockedShifts: string[]` — ورديات مرفوضة
  - `preferredRestDays: number[]` — أيام راحة مطلوبة (0-6)
- واجهة تعديل بسيطة: عند الضغط على اسم الموظف (خيار جديد في dropdown) → نافذة صغيرة لتحديد التفضيلات
- منطق التوزيع يعطي أفضلية عالية للورديات المفضلة، ولا يعيّن الورديات المرفوضة أبداً، ويحاول احترام أيام الراحة

## الملفات المتأثرة

| ملف | التغيير |
|---|---|
| `src/index.css` | لوحة زمردي/ذهبي كاملة + خلفيات + حدود جدول |
| `tailwind.config.ts` | tokens جديدة |
| `src/pages/Index.tsx` | خلفية الصفحة + تحسين الشريط العلوي |
| `src/components/RosterGrid.tsx` | ألوان الرأس، حدود، تنسيق |
| `src/components/InstallBanner.tsx` | تصميم أنيق + تعليمات شاومي |
| `public/manifest.webmanifest` | جديد |
| `public/icons/*` | أيقونات مولّدة |
| `index.html` | meta tags PWA |
| `src/lib/storage.ts` | جديد — طبقة IndexedDB |
| `src/hooks/useRosterData.ts` | ترحيل + حقول تفضيلات |
| `src/lib/auto-assign.ts` | pass تحسين العدالة + منع التعاقب + التفضيلات |
| `src/components/AutoAssignDialog.tsx` | عرض ملخص النتيجة |
| `src/components/EmployeePreferencesDialog.tsx` | جديد — تعديل تفضيلات الموظف |

## ملاحظات

- كل التغييرات متوافقة مع البيانات الحالية (migration تلقائي)
- الحفاظ على قواعد الذاكرة: RTL، Vazirmatn، تلوين الجمعة فقط، عدم تلوين السبت
- الحفاظ على منطق ShiftPicker وAddShiftDialog كما تم ضبطهما مؤخراً

هل أبدأ بالتنفيذ؟
