# Duty Scheduler — HTML renderer

أضفت سكربتًا يولد ملف CSV وملف HTML ملون (RTL/عربي) يشبه شكل الجدول في الصورة المرفقة.

ملفات جديدة:
- src/render-schedule.ts — دالة تولد HTML من جداول التوزيع.
- scripts/generate-and-render.ts — سكربت CLI يدمج المولد الحالي ويصدر CSV وHTML داخل مجلد outputs/.

كيفية التشغيل:
- لتوليد جدول افتراضي (10 موظفين، 31 يوم، بدون التفاف شهر):
  npx ts-node scripts/generate-and-render.ts --cells 10 --days 31 --shifts N,R,M,AF --month يوليو --year 2026

- لتفعيل التفاف الشهر (يُعتبر يوم 1 التالي ليوم 31):
  npx ts-node scripts/generate-and-render.ts --cells 10 --days 31 --shifts N,R,M,AF --wrap --month يوليو --year 2026

المخرجات:
- outputs/schedule-<month>-<year>.csv
- outputs/schedule-<month>-<year>.html

ملاحظات:
- الأسماء الافتراضية باللغة العربية مضمّنة داخل السكربت. يمكنك تحرير السكربت لقراءة ملف أسماء أو استقبال ملف CSV بالأسماء.
- يمكنك تعديل الألوان عبر تعديل الكائن shiftColors داخل السكربت.
