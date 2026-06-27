# ExpoTime CRM

نظام إدارة علاقات العملاء (CRM) لمندوبي مبيعات شركة **ExpoTime** المتخصصة في
تصميم وبناء أجنحة المعارض. واجهة عربية (RTL) مبنية على React + TypeScript،
وخادم Express، وتكامل مع Google Gemini للذكاء الاصطناعي، وربط البيانات
بـ **Google Sheets** كقاعدة بيانات رئيسية (مع رجوع آمن للتخزين المحلي).

## المتطلبات
- Node.js 18 أو أحدث

## التشغيل محلياً

1. تثبيت الاعتماديات:
   ```bash
   npm install
   ```
2. إنشاء ملف البيئة:
   ```bash
   cp .env.example .env
   ```
   ثم املأ القيم المطلوبة (انظر الأقسام أدناه).
3. التشغيل في وضع التطوير:
   ```bash
   npm run dev
   ```
4. البناء للإنتاج ثم التشغيل:
   ```bash
   npm run build
   npm start
   ```

## ربط البيانات بـ Google Sheets (Service Account)

النظام يقرأ ويكتب البيانات مباشرة في ملف Google Sheet واحد، موزّعة على
تبويبات: `Companies`, `Employees`, `Quotations`, `Followups`, `Settings`.
عند عدم ضبط بيانات الاعتماد، يعمل النظام تلقائياً بالتخزين المحلي (ملفات JSON).

### خطوات الإعداد
1. أنشئ مشروعاً في [Google Cloud Console](https://console.cloud.google.com/) وفعّل **Google Sheets API**.
2. أنشئ **Service Account** وحمّل ملف المفتاح (JSON).
3. شارك ملف Google Sheet مع البريد الخاص بحساب الخدمة
   (`xxxx@xxxx.iam.gserviceaccount.com`) بصلاحية **محرّر (Editor)**.
4. اضبط متغيرات البيئة في `.env`:
   ```env
   GOOGLE_SHEET_ID="1051_4gL-dAPark13F4c7fH3WIIQd-N0fZxonlbR9CTk"
   # إمّا لصق محتوى المفتاح مباشرة:
   GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account", ...}'
   # أو تحديد مسار الملف:
   GOOGLE_SERVICE_ACCOUNT_FILE="./service-account.json"
   ```
5. أعد تشغيل الخادم — ستظهر رسالة `🟢 تم الاتصال بـ Google Sheets بنجاح`.

> ملاحظة: تتم مزامنة الكتابة إلى الشيت بشكل مؤجّل (debounced) لتفادي إرهاق
> واجهة Google API عند تتابع التعديلات. التبويبات تُنشأ تلقائياً إن لم تكن موجودة.

## الأمان
- كلمات مرور المندوبين تُخزَّن **مشفّرة** (scrypt) مع ترقية تلقائية لأي كلمات
  قديمة مخزّنة كنص صريح عند أول تسجيل دخول.
- كلمة مرور المدير تُقرأ من `MANAGER_PASSWORD` فقط (لا توجد كلمة افتراضية).
- ترويسات أمان أساسية + تحديد معدّل للطلبات على مسارات الدخول والذكاء الاصطناعي.
- الأسرار وقواعد البيانات المحلية مستثناة من Git عبر `.gitignore`.

## أوامر مفيدة
| الأمر | الوظيفة |
|------|---------|
| `npm run dev` | تشغيل بيئة التطوير |
| `npm run build` | فحص الأنواع + بناء الواجهة والخادم |
| `npm start` | تشغيل النسخة المبنية |
| `npm run lint` | فحص أنواع TypeScript فقط |
