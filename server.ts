import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import {
  initSheets,
  isSheetsEnabled,
  getSheetInfo,
  loadTable,
  scheduleSave,
  TABS,
} from "./sheetsStore";
import { sendEmail, getMailProvider } from "./mailer";

// تحميل متغيرات البيئة من .env أو بيئة التشغيل
dotenv.config();

// ==========================================
// إعدادات عامة قابلة للضبط عبر متغيرات البيئة (بدل القيم المضمّنة في الكود)
// ==========================================
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const MANAGER_WHATSAPP = process.env.MANAGER_WHATSAPP || "966551016181";
const BODY_LIMIT = process.env.BODY_LIMIT || "25mb";
// أصول مسموح لها بالوصول (CORS). افتراضياً يُسمح للأصل نفسه فقط؛ يمكن وضع "*" أو قائمة مفصولة بفواصل.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ==========================================
// أدوات تشفير كلمات المرور (scrypt المدمج في Node — بدون اعتماديات خارجية)
// ==========================================
const HASH_PREFIX = "scrypt$";
function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(plain), salt, 64).toString("hex");
  return `${HASH_PREFIX}${salt}$${derived}`;
}
function isHashed(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith(HASH_PREFIX);
}
function verifyPassword(plain: string, stored: string): boolean {
  if (!stored || plain === undefined || plain === null) return false;
  if (isHashed(stored)) {
    const parts = stored.split("$");
    const salt = parts[1];
    const hash = parts[2];
    if (!salt || !hash) return false;
    const derived = crypto.scryptSync(String(plain), salt, 64).toString("hex");
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(derived, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // توافق رجعي: كلمات المرور القديمة المخزّنة كنص صريح
  return String(plain) === String(stored);
}
// كلمة المرور الافتراضية للمندوبين الجدد (يُنصح بتغييرها عبر البيئة)
const DEFAULT_EMPLOYEE_PASSWORD =
  process.env.DEFAULT_EMPLOYEE_PASSWORD || "123456";

// ==========================================
// نظام التوكن (JWT مبسّط موقّع بـ HMAC — بدون اعتماديات خارجية) وصلاحيات RBAC
// ==========================================
const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  (() => {
    const s = crypto.randomBytes(32).toString("hex");
    console.warn(
      "⚠️ لم يتم ضبط AUTH_SECRET — تم توليد سر مؤقت (ستُبطل الجلسات عند كل إعادة تشغيل). يُنصح بضبطه في البيئة."
    );
    return s;
  })();
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS) || 12 * 60 * 60; // 12 ساعة

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function signToken(payload: Record<string, any>): string {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const data = b64url(JSON.stringify(body));
  const sig = b64url(
    crypto.createHmac("sha256", AUTH_SECRET).update(`${head}.${data}`).digest()
  );
  return `${head}.${data}.${sig}`;
}
function verifyToken(token: string): Record<string, any> | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, data, sig] = parts;
  const expected = b64url(
    crypto.createHmac("sha256", AUTH_SECRET).update(`${head}.${data}`).digest()
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
function getBearer(req: express.Request): string {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

// تهيئة عميل Gemini الذكي بالذكاء الاصطناعي
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

// ترويسات أمان أساسية (بديل خفيف عن helmet بدون اعتماديات)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-XSS-Protection", "0");

  // ضبط CORS عند تحديد أصول مسموح بها
  const origin = req.headers.origin as string | undefined;
  if (ALLOWED_ORIGINS.length > 0 && origin) {
    if (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS"
      );
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// محدّد معدّل بسيط في الذاكرة لحماية المسارات الحساسة (تسجيل الدخول والذكاء الاصطناعي)
const rateBuckets: { [key: string]: { count: number; reset: number } } = {};
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets[key];
    if (!bucket || now > bucket.reset) {
      rateBuckets[key] = { count: 1, reset: now + windowMs };
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res
        .status(429)
        .json({ error: "عدد كبير من الطلبات، يرجى المحاولة بعد قليل." });
    }
    bucket.count++;
    next();
  };
}

// حماية مسارات الذكاء الاصطناعي من الاستهلاك المفرط (مكلفة)
app.use("/api/ai", rateLimit(30, 60 * 1000));

// بوابة المصادقة المركزية: تحمي كل مسارات /api عدا المسارات العامة
const PUBLIC_API_PATHS = new Set([
  "/api/login",
  "/api/login/google",
  "/api/config",
]);
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  if (req.method === "OPTIONS") return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();

  const payload = verifyToken(getBearer(req));
  if (!payload) {
    return res
      .status(401)
      .json({ error: "غير مصرّح — يرجى تسجيل الدخول مجدداً.", code: "UNAUTHORIZED" });
  }
  (req as any).user = payload;
  next();
});

// التحقق من صلاحية المدير لمسار معيّن
function requireManager(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== "manager") {
    return res
      .status(403)
      .json({ error: "هذا الإجراء متاح للمدير العام فقط.", code: "FORBIDDEN" });
  }
  next();
}

// تشخيص حالة الاتصال بـ Baserow - تم التعطيل بالكامل والاعتماد على قوقل شيت والملفات المحلية بناء على طلب العميل
const getBaserowConfig = () => {
  return {
    token: "",
    databaseId: "",
    tableCompanies: "",
    tableEmployees: "",
    tableFollowups: "",
    isConfigured: false,
  };
};

function serverFormatPhone(ph: string): string {
  if (!ph) return "";
  let val = ph.trim();
  const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  for (let i = 0; i < 10; i++) {
    val = val.replace(new RegExp(arabicDigits[i], "g"), String(i));
  }
  const hasPlus = val.startsWith("+");
  val = val.replace(/[^\d]/g, "");
  if (hasPlus) {
    val = "+" + val;
  }
  if (/^5\d{8}$/.test(val)) {
    val = "0" + val;
  }
  if (val.startsWith("9665") && val.length === 12) {
    val = "05" + val.slice(4);
  } else if (val.startsWith("+9665") && val.length === 13) {
    val = "05" + val.slice(5);
  }
  return val;
}

function serverFormatEmail(em: string): string {
  if (!em) return "";
  return em.trim().toLowerCase();
}

// قائمة المندوبين والمستخدمين الافتراضية والنشطة
let mockEmployeesList = [
  { id: 1, "الاسم": "مؤيدة", "البريد الإلكتروني": "mouida@expotime.com" },
  { id: 2, "الاسم": "نصر", "البريد الإلكتروني": "nasr@expotime.com" },
  { id: 3, "الاسم": "محمود", "البريد الإلكتروني": "mahmoud@expotime.com" },
  { id: 4, "الاسم": "جميلة", "البريد الإلكتروني": "jamila@expotime.com" },
  { id: 5, "الاسم": "نبيل", "البريد الإلكتروني": "nabil@expotime.com" }
];

// بيانات تجريبية (Mock Data) للشركات في حال عدم توفر الاتصال بـ Baserow
let mockCompanies = [
  {
    id: 1,
    "كود الشركة": "COMP-101",
    "اسم الشركة": "شركة سدير للمقاولات والإعمار",
    "النشاط": "مقاولات عامة وتطوير عقاري",
    "المدينة": "الرياض",
    "الجوال الرئيسي": "0501234567",
    "البريد الإلكتروني": "info@sudair.sa",
    "الحالة": "جديد",
    "مسؤول المبيعات": "مؤيدة",
    "الأولوية": "عالية",
    "آخر تواصل": "",
    "المصدر": "معرض فعاليات الرياض",
    "ملاحظات": "الشركة مهتمة بتركيب جناح عرض بمساحة 100م٢ في الربع الثالث وتطلب اتصالاً أولياً"
  },
  {
    id: 2,
    "كود الشركة": "COMP-102",
    "اسم الشركة": "شركة آفاق الغد للحلول الذكية",
    "النشاط": "تقنية معلومات واتصالات",
    "المدينة": "جدة",
    "الجوال الرئيسي": "0549876543",
    "البريد الإلكتروني": "contact@afaqtech.com",
    "الحالة": "تفاوض",
    "مسؤول المبيعات": "مؤيدة",
    "الأولوية": "متوسطة",
    "آخر تواصل": "2026-06-01",
    "المصدر": "الموقع الإلكتروني",
    "ملاحظات": "تم تقديم مراجعة لتصميم المبنى ويجري مناقشة حجز المساحة"
  },
  {
    id: 3,
    "كود الشركة": "COMP-103",
    "اسم الشركة": "مجموعة الشايع للتجزئة والأغذية",
    "النشاط": "تجارة تجزئة وضيافة",
    "المدينة": "الدمام",
    "الجوال الرئيسي": "0561112223",
    "البريد الإلكتروني": "shaya@retail-gulf.com",
    "الحالة": "تم إرسال البروفايل",
    "مسؤول المبيعات": "نصر",
    "الأولوية": "منخفضة",
    "آخر تواصل": "2026-05-20",
    "المصدر": "حملة بريد الكتروني",
    "ملاحظات": "طلبوا نسخة مطبوعة من بروفايل الفعاليات الأخير لإرسالها للإدارة الإقليمية"
  },
  {
    id: 4,
    "كود الشركة": "COMP-104",
    "اسم الشركة": "شركة الرؤية الرقمية لتنظيم المعارض",
    "النشاط": "تنظيم فعاليات وخدمات بروموشن",
    "المدينة": "الرياض",
    "الجوال الرئيسي": "0534445556",
    "البريد الإلكتروني": "info@digitalvision.sa",
    "الحالة": "جديد",
    "مسؤول المبيعات": "نصر",
    "الأولوية": "عالية",
    "آخر تواصل": "",
    "المصدر": "توصية عميل سابق",
    "ملاحظات": "طلب تفاصيل نظام الرعاية والخصومات للشركاء الاستراتيجيين"
  },
  {
    id: 5,
    "كود الشركة": "COMP-105",
    "اسم الشركة": "شركة المروة للتطوير السكني",
    "النشاط": "استثمار عقاري وتطوير",
    "المدينة": "الخبر",
    "الجوال الرئيسي": "0556667778",
    "البريد الإلكتروني": "sales@almarwa.sa",
    "الحالة": "تم التواصل",
    "مسؤول المبيعات": "محمود",
    "الأولوية": "عالية",
    "آخر تواصل": "2026-06-03",
    "المصدر": "معرض سيتي سكيب",
    "ملاحظات": "تم النقاش الأولي، يطلبون تصميماً ثلاثي الأبعاد لجناحهم قبل إرسال كراسة الشروط"
  },
  {
    id: 6,
    "كود الشركة": "COMP-106",
    "اسم الشركة": "مؤسسة النخبة للسياحة والضيافة",
    "النشاط": "خدمات سفر وسياحة",
    "المدينة": "المدينة المنورة",
    "الجوال الرئيسي": "0543332221",
    "البريد الإلكتروني": "info@elitetravel.com.sa",
    "الحالة": "غير مهتم",
    "مسؤول المبيعات": "محمود",
    "الأولوية": "منخفضة",
    "آخر تواصل": "2026-05-15",
    "المصدر": "اتصال بارد",
    "ملاحظات": "أفاد المندوب بأن الميزانية مجمدة حتى بداية العام القادم ومكتفون بالمشاركة الرقمية"
  },
  {
    id: 7,
    "كود الشركة": "COMP-107",
    "اسم الشركة": "الشركة الوطنية للصناعات الغذائية",
    "النشاط": "تصنيع وتوزيع مواد غذائية",
    "المدينة": "القصيم",
    "الجوال الرئيسي": "0512223334",
    "البريد الإلكتروني": "procurement@nationalfood.sa",
    "الحالة": "تم إرسال العرض",
    "مسؤول المبيعات": "جميلة",
    "الأولوية": "عالية",
    "آخر تواصل": "2026-06-05",
    "المصدر": "لقاء في ملتقى بيبان",
    "ملاحظات": "المعرض القادم هو الأسبوع الوطني للغذاء، تم إرسال تسعيرة الجناح القياسي بقيمة 45,000 ريال وبانتظار رد المالية"
  },
  {
    id: 8,
    "كود الشركة": "COMP-108",
    "اسم الشركة": "مستشفى الموسى التخصصي",
    "النشاط": "خدمات صحية وطبية",
    "المدينة": "الأحساء",
    "الجوال الرئيسي": "0559998887",
    "البريد الإلكتروني": "expo@almoosahospital.com.sa",
    "الحالة": "تم طلب التصميم",
    "مسؤول المبيعات": "جميلة",
    "الأولوية": "متوسطة",
    "آخر تواصل": "2026-06-04",
    "المصدر": "اتصال مباشر من العميل",
    "ملاحظات": "يرغبون في تصميم جذاب يبرز شعار المستشفى ومزود بقسم مخصص لإجراء فحوصات فورية للزوار"
  },
  {
    id: 9,
    "كود الشركة": "COMP-109",
    "اسم الشركة": "شركة البحر الأحمر الدولية",
    "النشاط": "تطوير سياحي وعقاري",
    "المدينة": "تبوك",
    "الجوال الرئيسي": "0509990001",
    "البريد الإلكتروني": "proc@redseaintl.com",
    "الحالة": "تم التواصل",
    "مسؤول المبيعات": "نبيل",
    "الأولوية": "عالية",
    "آخر تواصل": "2026-06-02",
    "المصدر": "عميل متكرر",
    "ملاحظات": "مكالمة هاتفية مع مدير الفعاليات لمناقشة تجديد جناح العرض الخاص بهم في موسم الصيف"
  },
  {
    id: 10,
    "كود الشركة": "COMP-110",
    "اسم الشركة": "الشركة السعودية للكهرباء",
    "النشاط": "طاقة وقوى كهربائية",
    "المدينة": "الرياض",
    "الجوال الرئيسي": "0590001112",
    "البريد الإلكتروني": "exhibition@se.com.sa",
    "الحالة": "جديد",
    "مسؤول المبيعات": "نبيل",
    "الأولوية": "متوسطة",
    "آخر تواصل": "",
    "المصدر": "طلب عبر البريد الرسمي",
    "ملاحظات": "تواصلوا للاستعلام عن المساحات المتاحة في معرض الطاقة المتجددة"
  },
  {
    id: 11,
    "كود الشركة": "COMP-111",
    "اسم الشركة": "شركة طيران أديل المحدودة",
    "النشاط": "خدمات طيران ونقل جوي",
    "المدينة": "جدة",
    "الجوال الرئيسي": "0548887771",
    "البريد الإلكتروني": "marketing@flyadeal.com",
    "الحالة": "تم التعميد",
    "مسؤول المبيعات": "نصر",
    "الأولوية": "عالية",
    "آخر تواصل": "2026-06-06",
    "المصدر": "مناقصة حكومية",
    "ملاحظات": "تم تعميد العقد رسمياً ولله الحمد، وباشرت الإدارة الهندسية إعداد المخططات التفصيلية"
  },
  {
    id: 12,
    "كود الشركة": "COMP-112",
    "اسم الشركة": "مجموعة السديري القابضة",
    "النشاط": "استثمارات عامة وتجارة",
    "المدينة": "عرعر",
    "الجوال الرئيسي": "0531110009",
    "البريد الإلكتروني": "info@alsudairy.com",
    "الحالة": "متردد",
    "مسؤول المبيعات": "نبيل",
    "الأولوية": "منخفضة",
    "آخر تواصل": "2026-05-10",
    "المصدر": "معرض فعاليات الشمال",
    "ملاحظات": "مشاركتهم مترددة وتعتمد على رعاية إمارة المنطقة للمعرض"
  }
];

// سجلات المتابعات للتجربة المحلية
let mockFollowups = [
  {
    id: 1,
    "الشركة المرتبطة": 2,
    "الموظف المرتبط": "مؤيدة",
    "تاريخ المتابعة": "2026-06-01",
    "الحالة": "تفاوض",
    "الملاحظات": "تم تقديم مراجعة لتصميم المبنى ومناقشة عروض ومساحة الجناح الأولي.",
    "المصدر": "واجهة المندوب"
  },
  {
    id: 2,
    "الشركة المرتبطة": 11,
    "الموظف المرتبط": "نصر",
    "تاريخ المتابعة": "2026-06-06",
    "الحالة": "تم التعميد",
    "الملاحظات": "استلام التعميد الرسمي من مكتب المشتريات بمقر طيران أديل بالكامل.",
    "المصدر": "واجهة المندوب"
  }
];

// ==========================================
// 1.5. نظام التخزين المحلي المحمي للملفات وتكامل البيانات
// ==========================================
const COMPANIES_FILE = path.join(process.cwd(), "companies-db.json");
const FOLLOWUPS_FILE = path.join(process.cwd(), "followups-db.json");
const EMPLOYEES_FILE = path.join(process.cwd(), "employees-db.json");
const QUOTATIONS_FILE = path.join(process.cwd(), "quotations-db.json");
const SETTINGS_FILE = path.join(process.cwd(), "settings-db.json");

// تحميل السجلات المحفوظة مسبقاً لمنع أي فقدان للبيانات
try {
  if (fs.existsSync(COMPANIES_FILE)) {
    mockCompanies = JSON.parse(fs.readFileSync(COMPANIES_FILE, "utf8"));
  } else {
    fs.writeFileSync(COMPANIES_FILE, JSON.stringify(mockCompanies, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف شركات:", e.message);
}

try {
  if (fs.existsSync(FOLLOWUPS_FILE)) {
    mockFollowups = JSON.parse(fs.readFileSync(FOLLOWUPS_FILE, "utf8"));
  } else {
    fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify(mockFollowups, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف المتابعات:", e.message);
}

try {
  if (fs.existsSync(EMPLOYEES_FILE)) {
    mockEmployeesList = JSON.parse(fs.readFileSync(EMPLOYEES_FILE, "utf8"));
  } else {
    fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(mockEmployeesList, null, 2), "utf8");
  }
  
  // التأكد من وجود اسم المستخدم وكلمة مرور لكل مندوب لتسهيل تسجيل الدخول المباشر باليوزر والباسورد
  const arabicToEnglishMap: { [key: string]: string } = {
    "مؤيدة": "mouida",
    "نصر": "nasr",
    "محمود": "mahmoud",
    "جميلة": "jamila",
    "نبيل": "nabil"
  };

  let updatedEmployees = false;
  mockEmployeesList = mockEmployeesList.map((emp: any) => {
    const name = emp["الاسم"] || "";
    const currentUsername = emp["اسم المستخدم"] || emp["username"];
    const currentPassword = emp["كلمة المرور"] || emp["password"];
    
    const username = currentUsername || arabicToEnglishMap[name] || name.toLowerCase().replace(/\s+/g, "");
    // عند غياب كلمة المرور نولّد كلمة افتراضية مُشفّرة (لا تُخزّن كنص صريح)
    const password = currentPassword || hashPassword(DEFAULT_EMPLOYEE_PASSWORD);

    if (!currentUsername || !currentPassword) {
      updatedEmployees = true;
    }

    return {
      ...emp,
      "اسم المستخدم": username,
      "كلمة المرور": password
    };
  });
  
  if (updatedEmployees) {
    fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(mockEmployeesList, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف الموظفين:", e.message);
}

// قائمة عروض الأسعار (Quotations) الموثقة والمترابطة
let mockQuotations = [
  {
    id: "QT-2026-001",
    companyId: 1,
    "اسم الشركة": "شركة سدير للمقاولات والإعمار",
    "رقم العرض": "QT-2026-001",
    "تاريخ العرض": "2026-06-15",
    "مبلغ العرض": 25000,
    "تفاصيل الخدمة / المعرض": "تصميم وتجهيز جناح عرض بمساحة 100م٢ في معرض الخمسة الكبار",
    "المعرض": "معرض الخمسة الكبار بالرياض",
    "حالة العرض": "تم إرسال العرض",
    "الرقم الضريبي": "",
    "العنوان الوطني": "",
    "السجل التجاري": "",
    "تاريخ التحديث": "2026-06-15"
  },
  {
    id: "QT-2026-002",
    companyId: 2,
    "اسم الشركة": "شركة آفاق الغد للحلول الذكية",
    "رقم العرض": "QT-2026-002",
    "تاريخ العرض": "2026-06-20",
    "مبلغ العرض": 48000,
    "تفاصيل الخدمة / المعرض": "بناء جناح بمساحة 150م٢ وحلول تقنية وتفاعلية متكاملة",
    "المعرض": "معرض الرياض الدولي للاتصالات وتقنية المعلومات",
    "حالة العرض": "تم التعميد",
    "الرقم الضريبي": "310123456700003",
    "العنوان الوطني": "الرياض، حي العليا، طريق الملك فهد",
    "السجل التجاري": "1010987654",
    "تاريخ التحديث": "2026-06-25"
  }
];

try {
  if (fs.existsSync(QUOTATIONS_FILE)) {
    mockQuotations = JSON.parse(fs.readFileSync(QUOTATIONS_FILE, "utf8"));
  } else {
    fs.writeFileSync(QUOTATIONS_FILE, JSON.stringify(mockQuotations, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف العروض:", e.message);
}

// إعدادات التطبيق الموحدة لجميع المناديب والمدراء
let appSettings = {
  googleSheetId: "1V6B6g_b-3S4v_gE92S3P9h91yRAdF3uH2O1R82b3c",
  googleSheetUrl: "https://docs.google.com/spreadsheets/d/1V6B6g_b-3S4v_gE92S3P9h91yRAdF3uH2O1R82b3c/edit?usp=sharing",
  googleDriveFolderId: "1_DrIvE_FoLdEr_ID_SpAcE_ExPoTiMe",
  googleDriveFolderUrl: "https://drive.google.com/drive/folders/1_DrIvE_FoLdEr_ID_SpAcE_ExPoTiMe?usp=sharing",
  accountantEmail: "jamal@expo-time.co"
};

try {
  if (fs.existsSync(SETTINGS_FILE)) {
    appSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } else {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف الإعدادات العامة:", e.message);
}

// دوال مساعدة لحفظ التغييرات فوراً إلى التخزين المحلي (كنسخة احتياطية/كاش)
// مع مزامنة كتابة فورية مؤجّلة (write-through) إلى Google Sheets عند تفعيله.
const saveCompaniesLocal = () => {
  try { fs.writeFileSync(COMPANIES_FILE, JSON.stringify(mockCompanies, null, 2), "utf8"); }
  catch (e: any) { console.error("تعذّر حفظ ملف الشركات محلياً:", e?.message || e); }
  scheduleSave(TABS.companies, () => mockCompanies);
};
const saveFollowupsLocal = () => {
  try { fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify(mockFollowups, null, 2), "utf8"); }
  catch (e: any) { console.error("تعذّر حفظ ملف المتابعات محلياً:", e?.message || e); }
  scheduleSave(TABS.followups, () => mockFollowups);
};
const saveEmployeesLocal = () => {
  try { fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(mockEmployeesList, null, 2), "utf8"); }
  catch (e: any) { console.error("تعذّر حفظ ملف الموظفين محلياً:", e?.message || e); }
  scheduleSave(TABS.employees, () => mockEmployeesList);
};
const saveQuotationsLocal = () => {
  try { fs.writeFileSync(QUOTATIONS_FILE, JSON.stringify(mockQuotations, null, 2), "utf8"); }
  catch (e: any) { console.error("تعذّر حفظ ملف العروض محلياً:", e?.message || e); }
  scheduleSave(TABS.quotations, () => mockQuotations);
};
const saveSettingsLocal = () => {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2), "utf8"); }
  catch (e: any) { console.error("تعذّر حفظ ملف الإعدادات محلياً:", e?.message || e); }
  scheduleSave(TABS.settings, () => [appSettings]);
};

// مساعد لتهيئة الهيدرز لـ Baserow
const getBaserowHeaders = (token: string) => {
  const formattedToken = token.startsWith("Token ") || token.startsWith("Bearer ")
    ? token
    : `Token ${token}`;
  return {
    "Authorization": formattedToken,
    "Content-Type": "application/json",
  };
};

/* --- الروابط (API Routes) --- */

// 1. رابط جلب حالة وتجهيزات النظام
app.get("/api/config", (req, res) => {
  const cfg = getBaserowConfig();
  const sheets = getSheetInfo();
  res.json({
    isMockEnabled: !cfg.isConfigured && !sheets.enabled,
    configuredTables: {
      companies: !!cfg.tableCompanies,
      employees: !!cfg.tableEmployees,
      followups: !!cfg.tableFollowups,
    },
    googleSheets: {
      enabled: sheets.enabled,
      sheetId: sheets.sheetId,
    },
    email: { provider: getMailProvider() },
    message: sheets.enabled
      ? "متصل بقاعدة بيانات Google Sheets الحية بنجاح."
      : "يعمل حالياً بالتخزين المحلي. لتفعيل Google Sheets يرجى ضبط بيانات حساب الخدمة في متغيرات البيئة."
  });
});

// ==========================================
// روابط إعدادات التطبيق الموحدة وعروض الأسعار والتعميد المحمي
// ==========================================

// أ) جلب إعدادات التطبيق العامة
app.get("/api/app-settings", (req, res) => {
  res.json(appSettings);
});

// ب) تحديث إعدادات التطبيق العامة (متاح للمدير فقط)
app.post("/api/app-settings", requireManager, (req, res) => {
  const { googleSheetId, googleSheetUrl, googleDriveFolderId, googleDriveFolderUrl, accountantEmail } = req.body;
  
  if (googleSheetId !== undefined) appSettings.googleSheetId = googleSheetId;
  if (googleSheetUrl !== undefined) appSettings.googleSheetUrl = googleSheetUrl;
  if (googleDriveFolderId !== undefined) appSettings.googleDriveFolderId = googleDriveFolderId;
  if (googleDriveFolderUrl !== undefined) appSettings.googleDriveFolderUrl = googleDriveFolderUrl;
  if (accountantEmail !== undefined) appSettings.accountantEmail = accountantEmail;

  saveSettingsLocal();
  res.json({ success: true, message: "تم حفظ الإعدادات الموحدة بنجاح في السيرفر 🟢", settings: appSettings });
});

// ج) جلب عروض الأسعار
app.get("/api/quotations", (req, res) => {
  const { companyId } = req.query;
  if (companyId) {
    const compIdNum = Number(companyId);
    const filtered = mockQuotations.filter(q => q.companyId === compIdNum || String(q.companyId) === String(companyId));
    return res.json(filtered);
  }
  res.json(mockQuotations);
});

// د) إضافة عرض سعر جديد
app.post("/api/quotations", (req, res) => {
  const { companyId, companyName, amount, details, exhibition, items } = req.body;

  if (!companyId || !companyName) {
    return res.status(400).json({ error: "معرف واسم الشركة مطلوبين لإنشاء عرض سعر." });
  }

  // التحقق من صحة المبلغ (إن وُجد): رقم منتهٍ وغير سالب وضمن حد منطقي
  if (amount !== undefined && amount !== null && amount !== "") {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0 || amt > 1_000_000_000) {
      return res.status(400).json({ error: "قيمة المبلغ غير صالحة." });
    }
  }
  if (items !== undefined && !Array.isArray(items)) {
    return res.status(400).json({ error: "بنود العرض يجب أن تكون قائمة (مصفوفة)." });
  }

  const quotationNumber = `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const newQuotation = {
    id: quotationNumber,
    companyId: isNaN(Number(companyId)) ? companyId : Number(companyId),
    "اسم الشركة": companyName,
    "رقم العرض": quotationNumber,
    "تاريخ العرض": new Date().toISOString().split("T")[0],
    "مبلغ العرض": Number(amount) || 0,
    "تفاصيل الخدمة / المعرض": details || "",
    "المعرض": exhibition || "",
    "حالة العرض": "جديد",
    "الرقم الضريبي": "",
    "العنوان الوطني": "",
    "السجل التجاري": "",
    "تاريخ التحديث": new Date().toISOString().split("T")[0],
    "items": items || []
  };

  mockQuotations.push(newQuotation);
  saveQuotationsLocal();

  res.json({ success: true, message: "تم تسجيل عرض السعر المالي بنجاح في السيرفر 🟢", quotation: newQuotation });
});

// هـ) تعديل حالة وتفاصيل عرض السعر (التعميد وإدخال البيانات القانونية وتعديل البنود)
app.patch("/api/quotations/:id", (req, res) => {
  const { id } = req.params;
  const { status, taxNumber, nationalAddress, crNumber, items, amount, details, exhibition } = req.body;

  const qIdx = mockQuotations.findIndex(q => q.id === id);
  if (qIdx === -1) {
    return res.status(404).json({ error: "عذراً، عرض السعر غير موجود في النظام." });
  }

  if (status !== undefined) {
    mockQuotations[qIdx]["حالة العرض"] = status;
  }
  if (taxNumber !== undefined) {
    mockQuotations[qIdx]["الرقم الضريبي"] = taxNumber;
  }
  if (nationalAddress !== undefined) {
    mockQuotations[qIdx]["العنوان الوطني"] = nationalAddress;
  }
  if (crNumber !== undefined) {
    mockQuotations[qIdx]["السجل التجاري"] = crNumber;
  }
  if (items !== undefined) {
    mockQuotations[qIdx]["items"] = items;
  }
  if (amount !== undefined) {
    mockQuotations[qIdx]["مبلغ العرض"] = Number(amount) || 0;
  }
  if (details !== undefined) {
    mockQuotations[qIdx]["تفاصيل الخدمة / المعرض"] = details;
  }
  if (exhibition !== undefined) {
    mockQuotations[qIdx]["المعرض"] = exhibition;
  }

  mockQuotations[qIdx]["تاريخ التحديث"] = new Date().toISOString().split("T")[0];

  saveQuotationsLocal();
  res.json({ success: true, message: "تم تحديث تفاصيل عرض السعر وحفظها بنجاح 🟢", quotation: mockQuotations[qIdx] });
});

// و2) إرسال بريد إلكتروني فوري للعميل بعرض السعر (مع إرفاق ملف PDF رسمي)
app.post("/api/quotations/send-client-email", async (req, res) => {
  const { quotationId, clientName, clientEmail, items, amount, exhibition, repName, pdfBase64, pdfFileName } = req.body;

  if (!clientEmail) {
    return res.status(400).json({ error: "بريد العميل الإلكتروني مطلوب لإرسال العرض." });
  }

  const subtotal = Number(amount) || 0;
  const vat = subtotal * 0.15;
  const grand = subtotal + vat;
  const itemsHtml = (items || [])
    .map(
      (it: any, i: number) =>
        `<tr><td style="border:1px solid #e2e8f0;padding:6px">${i + 1}</td><td style="border:1px solid #e2e8f0;padding:6px">${it.description}</td><td style="border:1px solid #e2e8f0;padding:6px;text-align:center">${it.qty}</td><td style="border:1px solid #e2e8f0;padding:6px;text-align:center">${it.price}</td></tr>`
    )
    .join("");

  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1e293b;line-height:1.8">
    <h2 style="color:#2563eb">عرض سعر رسمي من إكسبو تايم</h2>
    <p>مرحباً أ. ${clientName || "العميل الكريم"}،</p>
    <p>يسعدنا في <b>إكسبو تايم</b> لتصميم وتنفيذ أجنحة المعارض تزويدكم بعرض السعر الرسمي لـ: <b>${exhibition || "مشاركتكم"}</b>.</p>
    <p>رقم العرض: <b>${quotationId}</b></p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#2563eb;color:#fff"><th style="padding:6px">#</th><th style="padding:6px">البند</th><th style="padding:6px">الكمية</th><th style="padding:6px">السعر</th></tr>
      ${itemsHtml}
    </table>
    <p>المجموع قبل الضريبة: ${subtotal.toFixed(2)} ر.س<br/>
    ض.ق.م (15%): ${vat.toFixed(2)} ر.س<br/>
    <b>الإجمالي شامل الضريبة: ${grand.toFixed(2)} ر.س</b></p>
    <p>تجدون مرفقاً عرض السعر الرسمي بصيغة PDF جاهزاً للاعتماد والتوقيع.</p>
    <p>مسؤول المبيعات: ${repName || "إكسبو تايم"}<br/>تحياتنا،<br/>إكسبو تايم للمعارض والمؤتمرات 🌟</p>
  </div>`;

  const attachments = pdfBase64
    ? [{ filename: pdfFileName || `عرض-سعر-${quotationId}.pdf`, contentBase64: pdfBase64, contentType: "application/pdf" }]
    : [];

  const result = await sendEmail({
    to: clientEmail,
    subject: `عرض سعر رسمي من إكسبو تايم - رقم ${quotationId}`,
    html,
    attachments,
  });

  if (!result.ok) {
    return res.status(502).json({
      error: "تعذّر إرسال البريد عبر مزوّد البريد. تحقق من إعدادات البريد.",
      details: result.error,
    });
  }

  res.json({
    success: true,
    delivered: !result.simulated,
    simulated: !!result.simulated,
    hasAttachment: attachments.length > 0,
    message: result.simulated
      ? `تم تجهيز عرض السعر (${quotationId}) — وضع المحاكاة فعّال (لم يُضبط مزوّد بريد بعد).`
      : `تم إرسال عرض السعر رقم (${quotationId}) مع ملف PDF رسمي لبريد العميل (${clientEmail}) بنجاح! ✉️`,
  });
});

// و) إرسال بريد إلكتروني فوري للمحاسب عن التعميد
app.post("/api/send-accounting-email", async (req, res) => {
  const { quotationId, clientName, clientPhone, taxNumber, nationalAddress, crNumber, amount, details, exhibition, repName } = req.body;

  const targetEmail = appSettings.accountantEmail || "jamal@expo-time.co";

  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1e293b;line-height:1.8">
    <h2 style="color:#2563eb">تعميد رسمي ومستندات ضريبية</h2>
    <p>مرحباً أ. جمال،</p>
    <p>تم تعميد عرض السعر رقم <b>${quotationId || "—"}</b> بقيمة <b>${amount || "—"}</b> ر.س للمعرض: ${exhibition || "غير محدد"}.</p>
    <p><b>بيانات العميل القانونية:</b></p>
    <ul>
      <li>اسم العميل: ${clientName || "—"}</li>
      <li>الرقم الضريبي: ${taxNumber || "غير متوفر"}</li>
      <li>السجل التجاري: ${crNumber || "غير متوفر"}</li>
      <li>العنوان الوطني: ${nationalAddress || "غير متوفر"}</li>
      <li>جوال العميل: ${clientPhone || "غير متوفر"}</li>
      <li>مسؤول المبيعات: ${repName || "غير محدد"}</li>
    </ul>
    <p>الرجاء اتخاذ الإجراءات المحاسبية وإصدار الفاتورة الضريبية ومتابعة الدفعة.</p>
    <p>نظام ExpoTime CRM</p>
  </div>`;

  const result = await sendEmail({
    to: targetEmail,
    subject: `[تعميد رسمي] ${clientName || ""} - عرض السعر ${quotationId || ""}`,
    html,
  });

  if (!result.ok) {
    return res.status(502).json({ error: "تعذّر إرسال بريد التعميد للمحاسب.", details: result.error });
  }

  res.json({
    success: true,
    delivered: !result.simulated,
    simulated: !!result.simulated,
    message: result.simulated
      ? `تم تجهيز بريد التعميد للمحاسب — وضع المحاكاة فعّال (لم يُضبط مزوّد بريد بعد).`
      : `تم إرسال بريد التعميد القانوني للمحاسب (${targetEmail}) بنجاح 🟢`,
    emailLog: { recipient: targetEmail, sentAt: new Date().toISOString() },
  });
});

// ==========================================
// إدارة طلبات المحاسبة لتسجيل وإضافة العملاء
// ==========================================
const accountingRequestsFile = path.join(process.cwd(), "accounting-requests.json");

function readAccountingRequests() {
  try {
    if (fs.existsSync(accountingRequestsFile)) {
      return JSON.parse(fs.readFileSync(accountingRequestsFile, "utf8"));
    }
  } catch (err) {
    console.error("خطأ قراءة ملف طلبات المحاسبة:", err);
  }
  return [];
}

function writeAccountingRequests(requests: any[]) {
  try {
    fs.writeFileSync(accountingRequestsFile, JSON.stringify(requests, null, 2), "utf8");
  } catch (err) {
    console.error("خطأ حفظ ملف طلبات المحاسبة:", err);
  }
  scheduleSave(TABS.accounting, () => requests);
}

// أ) جلب طلبات المحاسبة
app.get("/api/accounting-requests", (req, res) => {
  const requests = readAccountingRequests();
  res.json(requests);
});

// ب) إنشاء طلب محاسبي جديد (إضافة العميل وتعميده) مع إرفاق المستندات الرسمية
app.post("/api/accounting-requests", (req, res) => {
  const { 
    companyId, 
    companyName, 
    quotationId, 
    amount, 
    details, 
    exhibition, 
    repName,
    taxNumber,
    nationalAddress,
    crNumber,
    taxNumberFileName,
    taxNumberFileContent,
    nationalAddressFileName,
    nationalAddressFileContent,
    crNumberFileName,
    crNumberFileContent
  } = req.body;

  if (!companyId || !companyName) {
    return res.status(400).json({ error: "معرف العميل واسم الشركة مطلوبان." });
  }

  const requests = readAccountingRequests();
  
  const newRequest = {
    id: `REQ-${Date.now()}`,
    companyId,
    companyName,
    quotationId: quotationId || `Q-${Date.now()}`,
    amount: Number(amount) || 0,
    details: details || "تصميم وتنفيذ جناح المعرض",
    exhibition: exhibition || "معرض عام",
    repName: repName || "مبيعات إكسبو تايم",
    status: "pending", // pending | added_to_program | rejected
    taxNumber: taxNumber || "",
    nationalAddress: nationalAddress || "",
    crNumber: crNumber || "",
    taxNumberFile: taxNumberFileContent ? { name: taxNumberFileName || "tax_certificate.png", content: taxNumberFileContent } : null,
    nationalAddressFile: nationalAddressFileContent ? { name: nationalAddressFileName || "national_address.png", content: nationalAddressFileContent } : null,
    crNumberFile: crNumberFileContent ? { name: crNumberFileName || "cr_certificate.png", content: crNumberFileContent } : null,
    createdAt: new Date().toISOString(),
    actionTakenAt: null,
    notes: ""
  };

  requests.push(newRequest);
  writeAccountingRequests(requests);

  res.json({
    success: true,
    message: "تم تسجيل العميل وبند التعميد كطلب رسمي معلق ومستندات كاملة ومرفقة للمحاسب بنجاح! 📊🟢",
    request: newRequest
  });
});

// ج) تحديث حالة طلب محاسبي (إجراء المحاسب/المدير) — متاح للمدير فقط
app.patch("/api/accounting-requests/:id", requireManager, (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const requests = readAccountingRequests();
  const idx = requests.findIndex((r: any) => String(r.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "الطلب المحاسبي غير موجود." });
  }

  if (status !== undefined) requests[idx].status = status;
  if (notes !== undefined) requests[idx].notes = notes;
  requests[idx].actionTakenAt = new Date().toISOString();

  writeAccountingRequests(requests);
  res.json({ success: true, message: "تم تحديث حالة الطلب المحاسبي بنجاح. ✅", request: requests[idx] });
});

// قوالب ملاحظات المتابعة الافتراضية (تعمل بدون ذكاء اصطناعي) — مرتبطة بحالة المتابعة
const FOLLOWUP_NOTE_TEMPLATES: { [key: string]: string } = {
  "جديد":
    "📌 الوضع الحالي: عميل جديد لم يبدأ التواصل معه بعد.\n➡️ الخطوة التالية: إجراء أول اتصال للتعريف بخدمات إكسبو تايم في تصميم وتنفيذ المعارض، وتحديد احتياج الجناح والمعرض المستهدف.",
  "تم التواصل":
    "📌 الوضع الحالي: تم التواصل الأولي مع العميل وعرض نبذة عن الخدمات.\n➡️ الخطوة التالية: إرسال بروفايل الشركة والأعمال السابقة، وتحديد موعد لمناقشة تصميم الجناح.",
  "تم إرسال البروفايل":
    "📌 الوضع الحالي: تم إرسال بروفايل إكسبو تايم وأعمالنا السابقة.\n➡️ الخطوة التالية: متابعة انطباع العميل وطلب تفاصيل مساحة الجناح والميزانية التقديرية.",
  "تم طلب التصميم":
    "📌 الوضع الحالي: طلب العميل تصميماً مبدئياً للجناح.\n➡️ الخطوة التالية: تجهيز التصميم ثلاثي الأبعاد للجناح وإرساله للعميل لمراجعته واعتماده.",
  "تم إرسال العرض":
    "📌 الوضع الحالي: تم إرسال عرض السعر الرسمي للعميل.\n➡️ الخطوة التالية: متابعة العميل للرد على العرض ومناقشة أي ملاحظات أو تعديلات على البنود.",
  "تفاوض":
    "📌 الوضع الحالي: العميل في مرحلة تفاوض على السعر أو نطاق التنفيذ.\n➡️ الخطوة التالية: تقديم أفضل عرض ممكن وحسم نقاط التفاوض تمهيداً لاعتماد العرض.",
  "تم التعميد":
    "📌 الوضع الحالي: تم اعتماد العرض من العميل رسمياً. 🎉\n➡️ الخطوة التالية: تجهيز العقد والمستندات الرسمية والبدء في تنفيذ الجناح حسب الجدول الزمني المتفق عليه.",
  "تم التنفيذ":
    "📌 الوضع الحالي: تم تنفيذ وتسليم جناح المعرض بنجاح. ✅\n➡️ الخطوة التالية: متابعة رضا العميل بعد المعرض وفتح فرص للتعاون في المعارض القادمة.",
  "غير مهتم":
    "📌 الوضع الحالي: أبدى العميل عدم اهتمامه بالخدمة حالياً.\n➡️ الخطوة التالية: الإبقاء على العلاقة وإعادة التواصل قبل موسم المعرض القادم المناسب لنشاطه.",
};

function defaultFollowupNote(status: string, companyName?: string, exhibition?: string): string {
  const base =
    FOLLOWUP_NOTE_TEMPLATES[status] ||
    `📌 الوضع الحالي: تم تحديث حالة المتابعة إلى "${status}".\n➡️ الخطوة التالية: تحديد الإجراء المناسب لإتمام صفقة جناح المعرض مع العميل.`;
  const ctx = exhibition ? `\n🎪 المعرض المستهدف: ${exhibition}.` : "";
  return base + ctx;
}

// 0. توليد ملاحظة متابعة احترافية مرتبطة بحالة المتابعة (مع قالب افتراضي يعمل بدون مفتاح)
app.post("/api/ai/generate-followup-note", async (req, res) => {
  const { companyName, companyActivity, exhibition, status } = req.body;
  if (!status || typeof status !== "string") {
    return res.status(400).json({ error: "حالة المتابعة مطلوبة لتوليد الملاحظة." });
  }

  // عند غياب مفتاح Gemini نعيد قالباً احترافياً جاهزاً (لا يفشل أبداً)
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ success: true, note: defaultFollowupNote(status, companyName, exhibition) });
  }

  try {
    const prompt = `أنت مساعد مبيعات محترف في شركة "إكسبو تايم" المتخصصة في تصميم وتنفيذ أجنحة المعارض.
اكتب ملاحظة متابعة موجزة ومنسّقة باللغة العربية لعميل، مرتبطة مباشرةً بحالة المتابعة الحالية.
- اسم العميل: ${companyName || "غير محدد"}
- نشاط العميل: ${companyActivity || "غير محدد"}
- المعرض المستهدف: ${exhibition || "غير محدد"}
- حالة المتابعة الحالية: ${status}

المطلوب: سطران فقط بصيغة:
"📌 الوضع الحالي: ... (وصف موجز للوضع وفق الحالة)"
"➡️ الخطوة التالية: ... (إجراء عملي واضح ومناسب لمجال تصميم وتنفيذ المعارض)"
اجعلها عملية ومختصرة ومهنية دون مقدمات.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    const note = (response.text || "").trim() || defaultFollowupNote(status, companyName, exhibition);
    return res.json({ success: true, note });
  } catch (error: any) {
    console.error("خطأ توليد ملاحظة المتابعة:", error.message);
    // سقوط آمن للقالب الافتراضي
    return res.json({ success: true, note: defaultFollowupNote(status, companyName, exhibition) });
  }
});

// 1. معالجة وتطهير البيانات العشوائية وتوطينها وترتيبها في الـ CRM وقابلية تعديلها
app.post("/api/ai/clean-data", async (req, res) => {
  const { companies, text, salesRep } = req.body;
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "مفتاح Gemini API Key غير مبرمج في السيرفر بعد." });
  }

  let inputStr = "";
  if (companies && Array.isArray(companies)) {
    inputStr = JSON.stringify(companies);
  } else if (text) {
    inputStr = String(text);
  } else {
    return res.status(400).json({ error: "الرجاء توفير البيانات العشوائية المراد تنظيمها." });
  }

  try {
    const prompt = `You are an elite Arab-centric CRM data engineer.
I will give you a messy, unstructured, or random dataset representing client leads/companies.
Some values are misplaced, formatted poorly, or in wrong columns.
Your task is to analyze and reconstruct this data into a highly organized, clean JSON array of companies.
Every item in the returned array MUST strictly follow this Arabic schema:
{
  "اسم الشركة": "اسم المنشأة أو الشركة بشكل واضح ورسمي",
  "كود الشركة": "توليد كود مميز للشركة بصيغة COMP-XXXX تلقائياً لو لم يتوفر",
  "النشاط": "نشاط الشركة الرئيسي مثل مقاولات، تقنية، تصنيع، تجارة، ضيافة... إلخ",
  "المدينة": "المدينة داخل المملكة العربية السعودية مثل الرياض، جدة، الدمام... إلخ",
  "الجوال الرئيسي": "رقم الجوال منسقاً بشكل صحيح وموحد مثل 05XXXXXXXX أو 966XXXXXXXXX",
  "البريد الإلكتروني": "بريد إلكتروني صالح للشركة أو فارغ",
  "الحالة": "أحد القيم التالية فقط: 'جديد'، 'تم الاتصال'، 'تفاوض'، 'تم إرسال العرض'، 'تم التعميد'، 'مستبعد'",
  "الأولوية": "أحد القيم التالية فقط: 'عالية'، 'متوسطة'، 'منخفضة'",
  "ملاحظات": "ملخص ذكي ومختصر لاهتمام العميل أو المعرض أو بنود الطلب",
  "المعرض": "اسم المعرض المرتبط بالعميل إن وجد في الملاحظات أو البيانات (مثل 'معرض الخمسة الكبار'، 'معرض الرياض للاتصالات'، إلخ)، وإلا اتركه فارغاً"
}

Here is the messy input dataset:
${inputStr}

Return ONLY a valid, parseable JSON array of objects without any markdown blocks, trailing commas, or surrounding explanation. Start with [ and end with ].`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const cleanedText = response.text || "[]";
    const cleanedRows = JSON.parse(cleanedText.trim());

    if (Array.isArray(cleanedRows)) {
      const initializedRows = cleanedRows.map((row: any, idx: number) => {
        const idNum = Date.now() + idx;
        return {
          id: idNum,
          "اسم الشركة": row["اسم الشركة"] || "شركة جديدة غير مسمى",
          "كود الشركة": row["كود الشركة"] || `COMP-${Math.floor(1000 + Math.random() * 9000)}`,
          "النشاط": row["النشاط"] || "معارض وفعاليات",
          "المدينة": row["المدينة"] || "الرياض",
          "الجوال الرئيسي": row["الجوال الرئيسي"] || "",
          "البريد الإلكتروني": row["البريد الإلكتروني"] || "",
          "الحالة": row["الحالة"] || "جديد",
          "مسؤول المبيعات": salesRep || row["مسؤول المبيعات"] || "مؤيدة",
          "الأولوية": row["الأولوية"] || "متوسطة",
          "آخر تواصل": row["آخر تواصل"] || "",
          "المصدر": "ذكاء اصطناعي منظم (Gemini AI)",
          "ملاحظات": row["ملاحظات"] || "",
          "المعرض": row["المعرض"] || ""
        };
      });

      // إضافة الشركات الجديدة للذاكرة وحفظها محلياً
      mockCompanies = mockCompanies.concat(initializedRows);
      saveCompaniesLocal();

      return res.json({
        success: true,
        message: `تم تنظيم وتطهير عدد ${initializedRows.length} عميل بالذكاء الاصطناعي بنجاح وحفظهم في قاعدة البيانات 🟢`,
        data: initializedRows
      });
    } else {
      throw new Error("Gemini returned invalid non-array structure.");
    }
  } catch (error: any) {
    console.error("خطأ أثناء معالجة وتنظيم البيانات بـ Gemini:", error.message);
    return res.status(500).json({ error: "فشل ذكاء Gemini الاصطناعي في تنظيم البيانات وترتيبها تلقائياً.", details: error.message });
  }
});

// معالجة وتنظيم ملف الإكسل المبعثر بالكامل عبر الذكاء الاصطناعي (Gemini AI)
app.post("/api/ai/clean-excel-data", async (req, res) => {
  const { rows, salesRep } = req.body;

  // التحقق من صحة المدخلات أولاً قبل فحص توفر المفتاح
  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: "الرجاء توفير مصفوفة الصفوف من ملف الإكسل لمعالجتها." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "مفتاح Gemini API Key غير مبرمج في السيرفر بعد." });
  }

  try {
    const sampleRows = rows.slice(0, 150);
    const prompt = `أنت مهندس بيانات متميز وخبير في تصنيف وتنظيف بيانات العملاء والشركات لشركة ExpoTime المتخصصة في بناء وتصميم أجنحة المعارض والديكورات الفاخرة.
لقد تم رفع ملف إكسل يحتوي على بيانات عملاء مبعثرة وغير منظمة ومكتوبة بأساليب مختلفة.
مهمتك هي تحليل صفوف البيانات المرفقة واستخلاص الحقول المهمة وتنسيقها في شكل كائن منظم باللغة العربية.

الصفوف الخام المستوردة هي:
\${JSON.stringify(sampleRows, null, 2)}

ملاحظات هامة جداً للاستخلاص والتنظيف:
1. "اسم الشركة" (حقل إجباري): ابحث عن اسم الشركة أو العميل واكتبه بوضوح.
2. "كود الشركة": إذا كان موجوداً في الملف استخرجه، وإذا لم يكن موجوداً، اتركه فارغاً (سيقوم النظام بتوليده تلقائياً بصيغة COMP-XXXX).
3. "النشاط" و "المدينة": استخرجهما إن وجدا، وبخلاف ذلك ضع قيماً افتراضية ملائمة (مثل: "معارض وفعاليات" للنشاط، و "الرياض" للمدينة).
4. "الجوال الرئيسي" و "البريد الإلكتروني": استخرجهما ونظفهما من أي مسافات أو رموز زائدة.
5. "الحالة" (حالة العميل في الـ CRM): حلل البيانات المتاحة والملاحظات في السطر، واكتب الحالة المناسبة تلقائياً حتى لو كانت هناك حالات متنوعة في الملف. الحالات المعتمدة هي: (جديد، تواصل أولي، مهتم، تم تقديم عرض، مفاوضات، تم التعميد، مستبعد).
6. "الأولوية": (عالية، متوسطة، منخفضة) حددها بناء على الاهتمام أو الملاحظات، أو ضع "متوسطة" كافتراضي.
7. "ملاحظات": أي معلومات إضافية أو متطلبات مكتوبة في الصف الخام.
8. "المعرض": اسم المعرض الرئيسي الذي يشارك فيه العميل حالياً.
9. "المعارض": مصفوفة تحتوي على كافة المعارض المشارك بها العميل (قد تصل إلى 10 معارض). ابحث عن أي أعمدة أو نصوص تذكر أسماء معارض متعددة وضعها في هذه مصفوفة المعارض.

الرجاء إرجاع كائن JSON منسق وصالح كقائمة كائنات تحتوي على هذه الحقول المحددة.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cleanedRows: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  "اسم الشركة": { type: Type.STRING },
                  "كود الشركة": { type: Type.STRING },
                  "النشاط": { type: Type.STRING },
                  "المدينة": { type: Type.STRING },
                  "الجوال الرئيسي": { type: Type.STRING },
                  "البريد الإلكتروني": { type: Type.STRING },
                  "الحالة": { type: Type.STRING },
                  "الأولوية": { type: Type.STRING },
                  "ملاحظات": { type: Type.STRING },
                  "المعرض": { type: Type.STRING },
                  "المعارض": {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["اسم الشركة"]
              }
            }
          },
          required: ["cleanedRows"]
        }
      }
    });

    const responseText = response.text || "{}";
    const parsed = JSON.parse(responseText);
    const cleanedRows = parsed.cleanedRows || [];

    const initializedRows = cleanedRows.map((row, idx) => {
      const idNum = Date.now() + idx;
      const finalCode = row["كود الشركة"] && row["كود الشركة"].trim() !== "" 
        ? row["كود الشركة"].trim() 
        : `COMP-${Math.floor(1000 + Math.random() * 9000)}`;

      return {
        id: idNum,
        "اسم الشركة": row["اسم الشركة"] || `شركة مجهولة ${idNum}`,
        "كود الشركة": finalCode,
        "النشاط": row["النشاط"] || "معارض وفعاليات",
        "المدينة": row["المدينة"] || "الرياض",
        "الجوال الرئيسي": serverFormatPhone(row["الجوال الرئيسي"] || ""),
        "البريد الإلكتروني": serverFormatEmail(row["البريد الإلكتروني"] || ""),
        "الحالة": row["الحالة"] || "جديد",
        "مسؤول المبيعات": salesRep || "مؤيدة",
        "الأولوية": row["الأولوية"] || "متوسطة",
        "آخر تواصل": new Date().toISOString().split("T")[0],
        "المصدر": "استيراد إكسل ذكي (Gemini AI)",
        "ملاحظات": row["ملاحظات"] || "",
        "المعرض": row["المعرض"] || "",
        "المعارض": Array.isArray(row["المعارض"]) ? row["المعارض"].slice(0, 10) : (row["المعرض"] ? [row["المعرض"]] : [])
      };
    });

    return res.json({
      success: true,
      message: "تم تنظيف وتنسيق ملف الإكسل المبعثر بنجاح بواسطة الذكاء الاصطناعي 🟢",
      data: initializedRows
    });
  } catch (error: any) {
    console.error("خطأ معالجة ملف الإكسل بـ Gemini:", error.message);
    return res.status(500).json({ error: "فشل ذكاء Gemini الاصطناعي في تنظيم وتطهير ملف الإكسل المبعثر.", details: error.message });
  }
});

// 4. صياغة إيميل احترافي للعميل بالذكاء الاصطناعي
app.post("/api/ai/generate-email", async (req, res) => {
  const { companyName, companyNotes, emailType, customPoints } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "مفتاح Gemini API Key غير متوفر في السيرفر." });
  }

  try {
    const prompt = `أنت ممثل خدمة عملاء وتسويق ذكي ومحترف لشركة ExpoTime المتخصصة في خدمات تصميم وبناء أجنحة المعارض والديكورات الفاخرة.
اكتب مسودة إيميل احترافي وجذاب باللغة العربية موجه للعميل التالي:
- اسم شركة العميل: ${companyName || "العميل الكريم"}
- نوع البريد المطلوب: ${emailType || "تذكير عام ومتابعة صفقات معلقة"}
- نقاط إضافية أو ملاحظات تود إدراجها: ${customPoints || "تأكيد جودة التصاميم وطلب اجتماع قصير للتنسيق"}
- ملخص متطلبات العميل السابقة: ${companyNotes || "لا توجد ملاحظات سابقة مضافة."}

المطلوب:
صياغة رسالة بريد إلكتروني أنيقة ومنظمة ومحفزة جداً لفتح آفاق تواصل وبناء جناح متميز وجذاب في المعرض القادم. استخدم نبرة احترافية وعملية تعزز ثقة العميل بـ ExpoTime كشريك نجاح.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });

    return res.json({
      success: true,
      emailText: response.text || "فشل صياغة البريد الإلكتروني بالذكاء الاصطناعي."
    });
  } catch (error: any) {
    console.error("خطأ أثناء صياغة الإيميل بالذكاء الاصطناعي:", error.message);
    return res.status(500).json({ error: "فشل صياغة الإيميل بالذكاء الاصطناعي.", details: error.message });
  }
});

// 2. مستشار المبيعات ومساعد المندوب الذكي لتقديم نصائح وتذكيرات بالمتابعة لكل عميل
app.post("/api/ai/advise-rep", async (req, res) => {
  const { companyName, companyActivity, companyNotes, history } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "مفتاح Gemini API Key غير متوفر في السيرفر." });
  }

  try {
    const prompt = `أنت مستشار مبيعات خبير وذكي تعمل لصالح شركة ExpoTime للمعارض والديكورات الدولية.
ساعد مندوب المبيعات لتقديم تواصل ناجح وإبرام اتفاقية تعميد لشركة معينة:
- اسم الشركة العميل: ${companyName || "غير محدد"}
- النشاط التجاري: ${companyActivity || "غير محدد"}
- الملاحظات الحالية: ${companyNotes || "لا يوجد ملاحظات مسجلة"}
- تاريخ المتابعات السابقة: ${JSON.stringify(history || [])}

المطلوب:
1. تقديم 3 نصائح عملية وسريعة ومباشرة باللغة العربية مخصصة لجذب هذا العميل وإقناعه بحجز جناح أو ديكور المعرض.
2. تذكيرات محددة ومقترحة للمتابعة القادمة وصياغة جملة أولى ذكية لتبدأ بها الاتصال الهاتفي أو رسالة الواتساب.

تأكد من صياغة الإجابة بلغة عربية مهنية، واضحة، ومحفزة جداً للمندوب.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });

    return res.json({
      success: true,
      advice: response.text || "لم يتمكن المساعد من توليد نصائح في الوقت الحالي."
    });
  } catch (error: any) {
    console.error("خطأ مستشار المندوب الذكي:", error.message);
    return res.status(500).json({ error: "حدث خطأ أثناء معالجة نصائح الذكاء الاصطناعي.", details: error.message });
  }
});

// 3. التقرير الإداري اليومي والتحليلات الشاملة لمدير المنظومة (خامل، حركة، يجب فصله، تقصير)
app.post("/api/ai/daily-report", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "مفتاح Gemini API Key غير متوفر في السيرفر." });
  }

  try {
    const totalCompanies = mockCompanies.length;
    const totalFollowups = mockFollowups.length;
    const totalQuotations = mockQuotations.length;
    
    // إحصاء حركات المتابعة لكل مندوب
    const repActivities: { [key: string]: { followupsCount: number, companiesCount: number, approvedAmount: number, totalAmount: number } } = {};
    
    mockEmployeesList.forEach((emp: any) => {
      repActivities[emp["الاسم"]] = { followupsCount: 0, companiesCount: 0, approvedAmount: 0, totalAmount: 0 };
    });

    mockCompanies.forEach((c: any) => {
      const rep = c["مسؤول المبيعات"];
      if (rep && repActivities[rep]) {
        repActivities[rep].companiesCount++;
      }
    });

    mockFollowups.forEach((f: any) => {
      const rep = f["مسؤول المبيعات"];
      if (rep && repActivities[rep]) {
        repActivities[rep].followupsCount++;
      }
    });

    mockQuotations.forEach((q: any) => {
      const companyId = q.companyId;
      const comp = mockCompanies.find(c => c.id === companyId);
      if (comp) {
        const rep = comp["مسؤول المبيعات"];
        if (rep && repActivities[rep]) {
          const amt = Number(q["مبلغ العرض"] || 0);
          repActivities[rep].totalAmount += amt;
          if (q["حالة العرض"] === "تم التعميد") {
            repActivities[rep].approvedAmount += amt;
          }
        }
      }
    });

    const prompt = `أنت مستشار إداري ومحلل أعمال ذكي جداً وخبير في قياس كفاءة موظفي المبيعات لقطاع المعارض.
أقدم لك التقرير الإحصائي لنشاط ومبيعات مناديب مبيعات شركة ExpoTime لليوم:
- إجمالي عدد العملاء والشركات في الـ CRM: ${totalCompanies} شركة.
- إجمالي المتابعات والاتصالات الموثقة: ${totalFollowups} متابعة.
- إجمالي عروض الأسعار المسجلة ماليًا: ${totalQuotations} عرض.

بيانات وإحصائيات أداء كل مندوب تفصيلياً:
${JSON.stringify(repActivities, null, 2)}

المطلوب منك توليد تقرير تنبيهات يومي ذكي وتحليلي للغاية موجه لمدير النظام (أ. نبيل الزبير) باللغة العربية يحتوي على:
1. ممثلين نشطين للغاية ولديهم حركة مبيعات ومتابعات جيدة (المناديب ذوي الإنتاجية العالية).
2. ممثلين خاملين للغاية ومقصرين (يحتاجون إلى لفت نظر أو فصل بسبب عدم وجود نشاط كافٍ أو صفر متابعات).
3. ممثلين في المنتصف يحتاجون لمساعدة عاجلة أو توجيه وإرشاد لإتمام الصفقات المعلقة لديهم وتعميد عروضهم.
4. توصيات تشغيلية وتكتيكات إدارية ذكية ومباشرة يتبعها أ. نبيل لرفع كفاءة الفريق وتحسين الدخل فورياً.

صغ التقرير بطريقة رسمية وقوية وعملية خالية من الحشو الزائد، مستعيناً بإحصائيات وأرقام النشاط المذكورة ومبالغ التعميد والعروض.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });

    return res.json({
      success: true,
      report: response.text || "فشل توليد التقرير اليومي بالذكاء الاصطناعي."
    });
  } catch (error: any) {
    console.error("خطأ التقرير الإداري اليومي:", error.message);
    return res.status(500).json({ error: "فشل معالجة التقرير الإداري بالذكاء الاصطناعي.", details: error.message });
  }
});

// 5. جلب قائمة الموظفين (المندوبين والمسؤولين والمشرفين)
app.get("/api/employees", async (req, res) => {
  const cfg = getBaserowConfig();
  
  if (!cfg.isConfigured || !cfg.tableEmployees) {
    // في حالة عدم ضبط جدول المندوبين، نستخدم القائمة المرنة النشطة
    return res.json(mockEmployeesList);
  }

  try {
    const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableEmployees}/?user_field_names=true`;
    const response = await fetch(url, {
      headers: getBaserowHeaders(cfg.token)
    });
    
    if (!response.ok) {
      throw new Error(`Baserow returned status ${response.status}`);
    }
    
    const data: any = await response.json();
    if (data && Array.isArray(data.results)) {
      // إرجاع الأسماء والبريد من جدول الموظفين
      const list = data.results.map((row: any) => ({
        id: row.id,
        "الاسم": row["الاسم"] || row["Name"] || "",
        "القسم": row["القسم"] || "",
        "الجوال": row["الجوال"] || "",
        "البريد الإلكتروني": row["البريد الإلكتروني"] || row["البريد"] || row["Email"] || ""
      }));
      return res.json(list);
    }
    
    return res.json(mockEmployeesList);
  } catch (error: any) {
    console.error("خطأ أثناء جلب الموظفين من Baserow:", error.message);
    // السقوط الآمن للقائمة النشطة
    return res.json(mockEmployeesList);
  }
});

// إضافة مندوب مبيعات جديد
app.post("/api/employees", requireManager, async (req, res) => {
  const { name, email, phone, department } = req.body;
  const cfg = getBaserowConfig();

  const empName = name || req.body["الاسم"];
  const empEmail = email || req.body["البريد الإلكتروني"];
  const empPhone = phone !== undefined ? phone : req.body["الجوال"];
  const empDept = department !== undefined ? department : req.body["القسم"];

  if (!empName || !empEmail) {
    return res.status(400).json({ error: "الرجاء توفير مسمى الاسم والبريد الإلكتروني للمندوب." });
  }

  // إنشاء نص ورابط الواتساب لمدير المنظومة
  const dbId = cfg.databaseId || "config_needed";
  const tblEmp = cfg.tableEmployees || "config_needed";
  const msgText = `📢 *إشعار CRM - إضافة مندوب مبيعات جديد*

👤 *الاسم الكامل:* ${empName}
📧 *البريد الإلكتروني:* ${empEmail}
📞 *رقم الجوال:* ${empPhone || 'غير رئيسي / غير متوفر'}
💼 *القسم الإداري:* ${empDept || 'المبيعات'}
✅ *الإجراء:* تم إضافة المندوب وتفعيله في نظام الـ CRM الحياتي لمتابعة الـ 30k عميل.

🔗 *رابط المندوب المباشر في جدول Baserow:*
https://baserow.io/database/${dbId}/table/${tblEmp}?grid-search=${encodeURIComponent(empName)}`;

  const whatsappUrl = `https://api.whatsapp.com/send?phone=${MANAGER_WHATSAPP}&text=${encodeURIComponent(msgText)}`;

  if (!cfg.isConfigured || !cfg.tableEmployees) {
    const newId = Date.now();
    const empUser = req.body["اسم المستخدم"] || req.body["username"] || empName.toLowerCase().replace(/\s+/g, "");
    const rawPass = req.body["كلمة المرور"] || req.body["password"] || DEFAULT_EMPLOYEE_PASSWORD;
    // تُخزّن كلمة المرور دائماً بشكل مُشفّر (scrypt)
    const empPass = hashPassword(rawPass);

    const newEmp = {
      id: newId,
      "الاسم": empName,
      "البريد الإلكتروني": empEmail,
      "القسم": empDept || "المبيعات",
      "الجوال": empPhone || "",
      "اسم المستخدم": empUser,
      "كلمة المرور": empPass
    };
    mockEmployeesList.push(newEmp);
    saveEmployeesLocal();
    return res.json({ 
      success: true, 
      employee: newEmp, 
      whatsappUrl,
      message: "تم إضافة المندوب وتحديد يوزر وباسورد الدخول بنجاح! 🟢" 
    });
  }

  try {
    const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableEmployees}/?user_field_names=true`;
    
    const fieldsToSend = {
      "الاسم": empName,
      "البريد الإلكتروني": empEmail,
      "البريد": empEmail,
      "Email": empEmail,
      "الجوال": empPhone || "",
      "القسم": empDept || "المبيعات"
    };

    const response = await fetch(url, {
      method: "POST",
      headers: getBaserowHeaders(cfg.token),
      body: JSON.stringify(fieldsToSend)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`حدث خطأ من Baserow: ${text}`);
    }

    const data: any = await response.json();
    return res.json({
      success: true,
      employee: {
        id: data.id,
        "الاسم": data["الاسم"] || empName,
        "البريد الإلكتروني": empEmail
      },
      whatsappUrl,
      message: "تم إضافة المندوب في جدول Baserow الحقيقي بنجاح وجاري إرسال الإشعار لواتساب المدير."
    });
  } catch (error: any) {
    console.error("خطأ أثناء إضافة موظف في Baserow:", error.message);
    return res.status(500).json({ error: "فشل حفظ المندوب في خادم Baserow الرئيسي", details: error.message });
  }
});

// حذف مندوب مبيعات
app.delete("/api/employees/:id", requireManager, async (req, res) => {
  const { id } = req.params;
  const cfg = getBaserowConfig();

  if (!cfg.isConfigured || !cfg.tableEmployees) {
    const targetId = Number(id) || id;
    const initialLength = mockEmployeesList.length;
    mockEmployeesList = mockEmployeesList.filter(e => e.id !== targetId && String(e.id) !== String(id));
    
    if (mockEmployeesList.length < initialLength) {
      saveEmployeesLocal();
      return res.json({ success: true, message: "تم إزالة المندوب من النظام التجريبي." });
    }
    return res.status(404).json({ error: "المندوب غير موجود محلياً." });
  }

  try {
    const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableEmployees}/${id}/`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: getBaserowHeaders(cfg.token)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`فشل الطلب من Baserow: ${text}`);
    }

    return res.json({ success: true, message: "تم حذف المندوب من جدول Baserow بنجاح." });
  } catch (error: any) {
    console.error("خطأ أثناء حذف الموظف من Baserow:", error.message);
    return res.status(500).json({ error: "فشل حذف المندوب من خادم Baserow", details: error.message });
  }
});

// 3. رابط جلب الشركات لمندوب معين (أو الكل في حال لم يحدد المندوب)
app.get("/api/companies", async (req, res) => {
  const representativeName = req.query.representative as string;
  const searchQuery = req.query.search as string;
  const pageParam = req.query.page as string;
  const sizeParam = req.query.size as string;

  const cfg = getBaserowConfig();

  // تحديد الصفحة وحجم الصفحة المطلوبين
  const page = parseInt(pageParam || "1", 10);
  const size = Math.min(200, parseInt(sizeParam || "200", 10));

  // أ) عدم وجود مندوب محدد (طلب المسؤول العام / المدير)
  if (!representativeName) {
    if (!cfg.isConfigured) {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const filtered = mockCompanies.filter(c => 
          String(c["اسم الشركة"] || "").toLowerCase().includes(query) ||
          String(c["كود الشركة"] || "").toLowerCase().includes(query) ||
          String(c["الجوال الرئيسي"] || "").toLowerCase().includes(query)
        );
        return res.json(filtered);
      }
      return res.json(mockCompanies);
    }
    try {
      // إذا حدد المندوب أو المتصفح صفحة معينة (pagination)، نجلبها هي فقط لتسريع العمليات لـ 30,000 عميل!
      let baseUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true&size=${size}`;
      
      if (searchQuery) {
        baseUrl += `&search=${encodeURIComponent(searchQuery)}`;
      }

      if (pageParam) {
        // طلب صفحة معينة مباشرة (أداء سريع جداً في طلبات التحميل اللاحقة)
        const url = `${baseUrl}&page=${page}`;
        const response = await fetch(url, { headers: getBaserowHeaders(cfg.token) });
        if (!response.ok) {
          throw new Error(`Baserow Page Fetch Error ${response.status}`);
        }
        const data = await response.json();
        return res.json(data.results || []);
      } else {
        // في حال لم يحدد العميل صفحة معينة، نجلب أول 10 صفحات كافتراض لتبسيط وتحسين جودة العرض الأولي (2000 شركة)
        let allResults = [];
        let nextUrl = baseUrl;
        let pageCount = 0;
        const maxPages = searchQuery ? 15 : 10;

        while (nextUrl && pageCount < maxPages) {
          const response = await fetch(nextUrl, { headers: getBaserowHeaders(cfg.token) });
          if (!response.ok) {
            throw new Error(`Baserow Error ${response.status}`);
          }
          const data = await response.json();
          if (data && Array.isArray(data.results)) {
            allResults = allResults.concat(data.results);
          }
          nextUrl = data.next || null;
          pageCount++;
        }
        return res.json(allResults);
      }
    } catch (error: any) {
      console.error("خطأ أثناء جلب كافة الشركات للمدير من Baserow:", error.message);
      return res.json(mockCompanies);
    }
  } else {
    // ب) جلب الشركات الفردية الخاصة بالمندوب الفلاني
    if (!cfg.isConfigured) {
      const filtered = mockCompanies.filter(
        (c) => c["مسؤول المبيعات"] && c["مسؤول المبيعات"].trim() === representativeName.trim()
      );
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return res.json(filtered.filter(c => 
          String(c["اسم الشركة"] || "").toLowerCase().includes(query) ||
          String(c["كود الشركة"] || "").toLowerCase().includes(query) ||
          String(c["الجوال الرئيسي"] || "").toLowerCase().includes(query)
        ));
      }
      return res.json(filtered);
    }

    try {
      // نطلب تصفية السجلات من خادم Baserow فورياً لزيادة سرعة الأداء وكفاءة الاستعلام لـ 30 ألف عميل!
      let baseUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true&size=${size}&filter__field_مسؤول المبيعات__contains=${encodeURIComponent(representativeName.trim())}`;
      
      if (searchQuery) {
        baseUrl += `&search=${encodeURIComponent(searchQuery)}`;
      }

      const response = await fetch(baseUrl, { headers: getBaserowHeaders(cfg.token) });
      if (!response.ok) {
        throw new Error(`Baserow Rep Fetch Error ${response.status}`);
      }
      const data = await response.json();
      const rows = data.results || [];
      
      // فلترة دقيقة إضافية للتأكد من عدم حدوث أي تداخل
      const filtered = rows.filter((row) => {
        const salesRep = row["مسؤول المبيعات"];
        if (Array.isArray(salesRep)) {
          return salesRep.some((item) => {
            const nameVal = typeof item === "object" ? (item.value || item["الاسم"] || "") : String(item);
            return nameVal.trim() === representativeName.trim();
          });
        } else if (typeof salesRep === "object" && salesRep !== null) {
          const nameVal = salesRep.value || salesRep["الاسم"] || "";
          return nameVal.trim() === representativeName.trim();
        } else if (typeof salesRep === "string") {
          return salesRep.trim() === representativeName.trim();
        }
        return false;
      });

      return res.json(filtered);
    } catch (error: any) {
      console.error("خطأ أثناء جلب الشركات التكراري للمندوب من Baserow:", error.message);
      const filtered = mockCompanies.filter(
        (c) => c["مسؤول المبيعات"] && c["مسؤول المبيعات"].trim() === representativeName.trim()
      );
      return res.json(filtered);
    }
  }
});

// ب) جلب الشركات الفردية الخاصة بالمندوب الفلاني عبر الرابط المخصص المباشر
app.get("/api/companies-by-rep/:repName", async (req, res) => {
  const representativeName = req.params.repName;
  const size = req.query.size || 150;
  const searchQuery = req.query.search ? String(req.query.search) : "";
  const cfg = getBaserowConfig();

  if (!cfg.isConfigured) {
    const filtered = mockCompanies.filter(
      (c) => c["مسؤول المبيعات"] && c["مسؤول المبيعات"].trim() === representativeName.trim()
    );
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return res.json(filtered.filter(c => 
        String(c["اسم الشركة"] || "").toLowerCase().includes(query) ||
        String(c["كود الشركة"] || "").toLowerCase().includes(query) ||
        String(c["الجوال الرئيسي"] || "").toLowerCase().includes(query)
      ));
    }
    return res.json(filtered);
  }

  try {
    let baseUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true&size=${size}&filter__field_مسؤول المبيعات__contains=${encodeURIComponent(representativeName.trim())}`;
    
    if (searchQuery) {
      baseUrl += `&search=${encodeURIComponent(searchQuery)}`;
    }

    const response = await fetch(baseUrl, { headers: getBaserowHeaders(cfg.token) });
    if (!response.ok) {
      throw new Error(`Baserow Rep Fetch Error ${response.status}`);
    }
    const data = await response.json();
    const rows = data.results || [];
    
    const filtered = rows.filter((row) => {
      const salesRep = row["مسؤول المبيعات"];
      if (Array.isArray(salesRep)) {
        return salesRep.some((item) => {
          const nameVal = typeof item === "object" ? (item.value || item["الاسم"] || "") : String(item);
          return nameVal.trim() === representativeName.trim();
        });
      } else if (typeof salesRep === "object" && salesRep !== null) {
        const nameVal = salesRep.value || salesRep["الاسم"] || "";
        return nameVal.trim() === representativeName.trim();
      } else if (typeof salesRep === "string") {
        return salesRep.trim() === representativeName.trim();
      }
      return false;
    });

    return res.json(filtered);
  } catch (error: any) {
    console.error("خطأ أثناء جلب الشركات التكراري للمندوب من Baserow:", error.message);
    const filtered = mockCompanies.filter(
      (c) => c["مسؤول المبيعات"] && c["مسؤول المبيعات"].trim() === representativeName.trim()
    );
    return res.json(filtered);
  }
});

// 5.5. بوابة تسجيل الدخول الموحدة باليوزر والباسورد (تم إلغاء الطرق السابقة والربط بـ Baserow)
app.post("/api/login", rateLimit(10, 5 * 60 * 1000), async (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== "string" || !password || typeof password !== "string") {
    return res.status(400).json({ error: "الرجاء إدخال اسم المستخدم وكلمة المرور." });
  }

  const typedUsername = username.trim().toLowerCase();

  // 1. فحص المدير العام
  const managerUsername = (process.env.MANAGER_USERNAME || "admin").trim().toLowerCase();
  const managerPassword = process.env.MANAGER_PASSWORD || "";
  if (!process.env.MANAGER_PASSWORD) {
    console.warn(
      "⚠️ تحذير أمني: لم يتم ضبط MANAGER_PASSWORD في البيئة. دخول المدير معطّل حتى ضبطها."
    );
  }

  if (
    managerPassword &&
    typedUsername === managerUsername &&
    password === managerPassword
  ) {
    const user = { name: "المدير العام (نبيل الزبير)", email: "nabilalzubair@gmail.com" };
    return res.json({
      success: true,
      role: "manager",
      user,
      token: signToken({ sub: "manager", role: "manager", name: user.name, email: user.email }),
    });
  }

  // 2. فحص المناديب من قاعدة بيانات الموظفين (مع دعم كلمات المرور المشفّرة والقديمة)
  const foundRep = mockEmployeesList.find((emp: any) => {
    const empUser = String(emp["اسم المستخدم"] || "").trim().toLowerCase();
    if (empUser !== typedUsername) return false;
    return verifyPassword(password, String(emp["كلمة المرور"] || ""));
  });

  if (foundRep) {
    // ترقية كلمات المرور القديمة (النص الصريح) إلى نسخة مشفّرة عند أول دخول ناجح
    if (!isHashed(String((foundRep as any)["كلمة المرور"] || ""))) {
      (foundRep as any)["كلمة المرور"] = hashPassword(password);
      saveEmployeesLocal();
    }
    const user = {
      id: foundRep.id,
      name: foundRep["الاسم"],
      email: foundRep["البريد الإلكتروني"] || `${typedUsername}@expotime.com`,
    };
    return res.json({
      success: true,
      role: "rep",
      user,
      token: signToken({ sub: String(foundRep.id), role: "rep", name: user.name, email: user.email }),
    });
  }

  return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة، يرجى التواصل مع المدير العام لتعديل بيانات دخولك." });
});

// 5.6. تسجيل الدخول عبر Google (مطابقة البريد مع المدير أو قائمة المندوبين)
app.post("/api/login/google", rateLimit(15, 5 * 60 * 1000), async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "بريد Google مطلوب." });
  }
  const typedEmail = email.trim().toLowerCase();

  // 1) المدير العام عبر البريد
  const managerEmail = (process.env.MANAGER_EMAIL || "nabilalzubair@gmail.com").trim().toLowerCase();
  if (typedEmail === managerEmail) {
    const user = { name: "المدير العام (نبيل الزبير)", email: managerEmail };
    return res.json({
      success: true,
      role: "manager",
      user,
      token: signToken({ sub: "manager", role: "manager", name: user.name, email: user.email }),
    });
  }

  // 2) مطابقة بريد المندوب في قائمة الموظفين
  const foundRep = mockEmployeesList.find(
    (emp: any) => String(emp["البريد الإلكتروني"] || "").trim().toLowerCase() === typedEmail
  );
  if (foundRep) {
    const user = {
      id: foundRep.id,
      name: foundRep["الاسم"],
      email: foundRep["البريد الإلكتروني"],
    };
    return res.json({
      success: true,
      role: "rep",
      user,
      token: signToken({ sub: String(foundRep.id), role: "rep", name: user.name, email: user.email }),
    });
  }

  return res
    .status(401)
    .json({ error: "حساب Google هذا غير مسجّل في المنظومة كعضو معتمد." });
});

// دالة لجلب كافة الشركات من Baserow مع دعم الصفحات المتعددة للتأكد من فحص التكرار بدقة
async function fetchAllBaserowCompanies(cfg: { tableCompanies: string; token: string }): Promise<any[]> {
  let companies: any[] = [];
  let nextUrl: string | null = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true&size=200`;
  
  let pages = 0;
  // الحد الأقصى 6 صفحات (1200 عميل) للتأكد من تغطية كاملة سريعة دون تعليق
  while (nextUrl && pages < 6) {
    try {
      const resp = await fetch(nextUrl, {
        headers: getBaserowHeaders(cfg.token)
      });
      if (!resp.ok) {
        console.error(`خطأ أثناء جلب الصفحة ${pages} من Baserow:`, resp.status);
        break;
      }
      const data: any = await resp.json();
      if (data && Array.isArray(data.results)) {
        companies = companies.concat(data.results);
      }
      nextUrl = data.next || null;
      pages++;
    } catch (err: any) {
      console.error("خطأ التصفح والتكرار في جلب الشركات للتحقق من التكرار:", err.message);
      break;
    }
  }
  return companies;
}

// دالة التحقق من أن العميل مكرر (الاسم أو رقم الجوال الرئيسي أو البريد الإلكتروني)
function findDuplicateCompany(newComp: any, existingCompanies: any[]): any | null {
  const cleanName = (name: string) => {
    if (!name) return "";
    return name.replace(/[\s\-_]+/g, "").trim().toLowerCase();
  };

  const nameNew = cleanName(newComp["اسم الشركة"]);
  const phoneNew = serverFormatPhone(newComp["الجوال الرئيسي"] || "");
  const emailNew = (newComp["البريد الإلكتروني"] || "").trim().toLowerCase();

  for (const existing of existingCompanies) {
    const nameExt = cleanName(existing["اسم الشركة"] || "");
    const phoneExt = serverFormatPhone(existing["الجوال الرئيسي"] || "");
    const emailExt = (existing["البريد الإلكتروني"] || "").trim().toLowerCase();

    // 1. تحقق من الاسم
    if (nameNew && nameExt && nameNew === nameExt) {
      return existing;
    }

    // 2. تحقق من رقم الجوال الرئيسي
    if (phoneNew && phoneExt && phoneNew.length >= 7 && phoneExt.length >= 7 && phoneNew === phoneExt) {
      return existing;
    }

    // 3. تحقق من البريد الإلكتروني
    if (emailNew && emailExt && emailNew === emailExt) {
      return existing;
    }
  }

  return null;
}

// رابط لإدخال دفعات ضخمة من الشركات دفعة واحدة (يدعم حتى 100 ألف صف)
app.post("/api/companies/batch", async (req, res) => {
  const { companies } = req.body;
  const cfg = getBaserowConfig();

  if (!companies || !Array.isArray(companies)) {
    return res.status(400).json({ error: "البيانات المرسلة غير صالحة، يجب أن تكون مصفوفة شركات" });
  }

  const processedCompanies = companies.map((c) => {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const code = c["كود الشركة"] || `COMP-${Date.now().toString().slice(-4)}-${randomSuffix}`;
    return {
      "كود الشركة": code,
      "اسم الشركة": c["اسم الشركة"] || `شركة جديدة ${code}`,
      "النشاط": c["النشاط"] || "معارض وفعاليات",
      "المدينة": c["المدينة"] || "الرياض",
      "الجوال الرئيسي": serverFormatPhone(c["الجوال الرئيسي"] || ""),
      "البريد الإلكتروني": serverFormatEmail(c["البريد الإلكتروني"] || ""),
      "الحالة": c["الحالة"] || "جديد",
      "مسؤول المبيعات": c["مسؤول المبيعات"] || "مؤيدة",
      "الأولوية": c["الأولوية"] || "متوسطة",
      "آخر تواصل": c["آخر تواصل"] || "",
      "ملاحظات": c["ملاحظات"] || "",
      "المصدر": c["المصدر"] || "يدوي / إكسل"
    };
  });

  // فحص التكرار (Duplicate Check)
  let existingCompanies: any[] = [];
  try {
    if (cfg.isConfigured) {
      existingCompanies = await fetchAllBaserowCompanies(cfg);
    } else {
      existingCompanies = mockCompanies;
    }
  } catch (error: any) {
    console.error("فشل تحميل قائمة فحص التكرار، المتابعة دون الفحص الشامل:", error.message);
  }

  const toAdd: any[] = [];
  const skippedCompanies: any[] = [];

  for (const comp of processedCompanies) {
    const duplicate = findDuplicateCompany(comp, existingCompanies);
    if (duplicate) {
      skippedCompanies.push({
        name: comp["اسم الشركة"],
        code: duplicate["كود الشركة"] || "غير معروف",
        phone: comp["الجوال الرئيسي"]
      });
    } else {
      toAdd.push(comp);
      existingCompanies.push(comp); // منع التكرار داخل نفس الملف أيضاً
    }
  }

  if (toAdd.length === 0 && skippedCompanies.length > 0) {
    return res.status(400).json({
      success: false,
      error: "ALL_DUPLICATE_COMPANIES",
      message: `بيانات مكررة: لم يتم استيراد أي عميل، حيث أن كافة العملاء (${skippedCompanies.length} عميل) مسجلون مسبقاً في المنظومة!`,
      skipped: skippedCompanies
    });
  }

  if (!cfg.isConfigured) {
    for (const comp of toAdd) {
      const newId = mockCompanies.length + 1;
      mockCompanies.push({ id: newId, ...comp });
    }
    saveCompaniesLocal();
    return res.json({ 
      success: true, 
      message: `تم إضافة ${toAdd.length} عميل جديد بنجاح محلياً. تم تخطي وتصفية ${skippedCompanies.length} عميل مكرر مسبقاً.`,
      count: toAdd.length,
      skippedCount: skippedCompanies.length,
      skipped: skippedCompanies
    });
  }

  try {
    const chunkSize = 200;
    const addedCount = toAdd.length;
    
    // نقوم بالتحويل لشرائح دفعات يسهل على Baserow قبولها بطلب منفرد دون تجاوز حد الـ 200 صف
    for (let i = 0; i < toAdd.length; i += chunkSize) {
      const chunk = toAdd.slice(i, i + chunkSize);
      const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/batch/?user_field_names=true`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: getBaserowHeaders(cfg.token),
        body: JSON.stringify({ items: chunk })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`فشل إضافة دفعة في Baserow (${response.status}):`, text);
        throw new Error(`فشل استيراد الدفعة في Baserow: ${text}`);
      }
    }

    return res.json({ 
      success: true, 
      message: `تم مزامنة وإدخال ${addedCount} شركة بنجاح وتخطي ${skippedCompanies.length} عميل مكرر مسبقاً!`,
      count: addedCount,
      skippedCount: skippedCompanies.length,
      skipped: skippedCompanies
    });
  } catch (error: any) {
    console.error("خطأ أثناء استيراد الدفعة لـ Baserow:", error.message);
    return res.status(500).json({ error: "حدث خطأ غير متوقع أثناء إرسال الدفعة لبوابة Baserow", details: error.message });
  }
});

// مضاف: رابط إضافة شركة جديدة أو لوحة إدخال (يدوي أو من ملف إكسل)
app.post("/api/companies", async (req, res) => {
  const { companies } = req.body;
  const cfg = getBaserowConfig();

  if (!companies) {
    return res.status(400).json({ error: "البيانات المرسلة غير صالحة" });
  }

  const companiesArray = Array.isArray(companies) ? companies : [companies];

  const processedCompanies = companiesArray.map((c, index) => {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const code = c["كود الشركة"] || `COMP-${Date.now().toString().slice(-4)}-${randomSuffix}`;
    return {
      "كود الشركة": code,
      "اسم الشركة": c["اسم الشركة"] || `شركة جديدة ${code}`,
      "النشاط": c["النشاط"] || "معارض وفعاليات",
      "المدينة": c["المدينة"] || "الرياض",
      "الجوال الرئيسي": serverFormatPhone(c["الجوال الرئيسي"] || ""),
      "البريد الإلكتروني": serverFormatEmail(c["البريد الإلكتروني"] || ""),
      "الحالة": c["الحالة"] || "جديد",
      "مسؤول المبيعات": c["مسؤول المبيعات"] || "مؤيدة",
      "الأولوية": c["الأولوية"] || "متوسطة",
      "آخر تواصل": c["آخر تواصل"] || "",
      "ملاحظات": c["ملاحظات"] || "",
      "المصدر": c["المصدر"] || "يدوي / إكسل"
    };
  });

  // فحص التكرار للشركة الفردية
  let existingCompanies: any[] = [];
  try {
    if (cfg.isConfigured) {
      existingCompanies = await fetchAllBaserowCompanies(cfg);
    } else {
      existingCompanies = mockCompanies;
    }
  } catch (error: any) {
    console.error("فشل جلب قائمة الشركات للتحقق من التكرار:", error.message);
  }

  for (const comp of processedCompanies) {
    const duplicate = findDuplicateCompany(comp, existingCompanies);
    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: "DUPLICATE_COMPANY",
        message: `تنبيه: هذا العميل موجود مسبقاً! الكود الخاص به هو: ${duplicate["كود الشركة"] || "غير متوفر"}، واسم العميل المسجل هو: ${duplicate["اسم الشركة"]} ومسؤول المبيعات الحالي: ${duplicate["مسؤول المبيعات"] || "غير محدد"}.`,
        existingCompany: {
          "كود الشركة": duplicate["كود الشركة"] || "غير متوفر",
          "اسم الشركة": duplicate["اسم الشركة"] || "غير معروف",
          "مسؤول المبيعات": duplicate["مسؤول المبيعات"] || "غير محدد",
          "الجوال الرئيسي": duplicate["الجوال الرئيسي"] || "غير مسجل"
        }
      });
    }
  }

  if (!cfg.isConfigured) {
    const added = [];
    for (const comp of processedCompanies) {
      const newId = mockCompanies.length + 1;
      const newComp = { id: newId, ...comp };
      mockCompanies.push(newComp);
      added.push(newComp);
    }
    saveCompaniesLocal();
    return res.json({ success: true, message: "تم إضافة البيانات بنجاح في النظام التجريبي محلياً", data: added });
  }

  try {
    const added = [];
    for (const comp of processedCompanies) {
      const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true`;
      const response = await fetch(url, {
        method: "POST",
        headers: getBaserowHeaders(cfg.token),
        body: JSON.stringify(comp)
      });
      if (response.ok) {
        const data = await response.json();
        added.push(data);
      } else {
        const text = await response.text();
        console.error(`فشل إضافة صف في Baserow (${response.status}):`, text);
      }
    }
    return res.json({ success: true, message: `تم إضافة ${added.length} شركة في Baserow بنجاح!`, data: added });
  } catch (error: any) {
    console.error("خطأ أثناء إضافة البيانات لـ Baserow:", error.message);
    return res.status(500).json({ error: "فشل أثناء جلب وربط البيانات في Baserow" });
  }
});

// 4. رابط تحديث الشركة وإضافة المتابعة
app.patch("/api/companies/:id", async (req, res) => {
  const companyIdStr = req.params.id;
  const { 
    الحالة, 
    الأولوية, 
    آخر_تواصل, 
    ملاحظات, 
    المندوب,
    "اسم الشركة": اسم_الشركة,
    "كود الشركة": كود_الشركة,
    النشاط,
    المدينة,
    "الجوال الرئيسي": الجوال_الرئيسي,
    "البريد الإلكتروني": البريد_الرئيسي,
    "مسؤول المبيعات": مسؤول_المبيعات
  } = req.body;
  const cfg = getBaserowConfig();

  if (!الحالة || !المندوب) {
    return res.status(400).json({ error: "الحالة واسم المندوب حقول إجبارية للتعديل" });
  }

  // أ) التعديل في البيئة التجريبية للـ Mock Data
  if (!cfg.isConfigured) {
    const comIdNum = parseInt(companyIdStr, 10);
    const companyIndex = mockCompanies.findIndex((c) => c.id === comIdNum);

    if (companyIndex === -1) {
      return res.status(404).json({ error: "الشركة غير موجودة" });
    }

    // تحديث سجل الشركة
    mockCompanies[companyIndex] = {
      ...mockCompanies[companyIndex],
      "الحالة": الحالة,
      "الأولوية": الأولوية || mockCompanies[companyIndex]["الأولوية"],
      "آخر تواصل": آخر_تواصل || mockCompanies[companyIndex]["آخر تواصل"],
      "ملاحظات": ملاحظات || mockCompanies[companyIndex]["ملاحظات"],
      "اسم الشركة": اسم_الشركة || mockCompanies[companyIndex]["اسم الشركة"],
      "كود الشركة": كود_الشركة || mockCompanies[companyIndex]["كود الشركة"],
      "النشاط": النشاط || mockCompanies[companyIndex]["النشاط"],
      "المدينة": المدينة || mockCompanies[companyIndex]["المدينة"],
      "الجوال الرئيسي": الجوال_الرئيسي ? serverFormatPhone(الجوال_الرئيسي) : mockCompanies[companyIndex]["الجوال الرئيسي"],
      "البريد الإلكتروني": البريد_الرئيسي ? serverFormatEmail(البريد_الرئيسي) : mockCompanies[companyIndex]["البريد الإلكتروني"],
      // لا نغيّر مسؤول المبيعات إلا عند تمريره صراحةً (يمنع إعادة الإسناد غير المقصودة عبر حقل "المندوب")
      "مسؤول المبيعات": مسؤول_المبيعات || mockCompanies[companyIndex]["مسؤول المبيعات"],
    };

    // إنشاء سجل متابعة جديد بمعرّف فريد (لا يعتمد على طول المصفوفة لتفادي التعارض)
    const maxFollowupId = mockFollowups.reduce((mx, f) => {
      const n = Number(f.id);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    const newFollowupId = maxFollowupId + 1;
    const newFollowup = {
      id: newFollowupId,
      "الشركة المرتبطة": comIdNum,
      "الموظف المرتبط": مسؤول_المبيعات || المندوب,
      "تاريخ المتابعة": آخر_تواصل || new Date().toISOString().split("T")[0],
      "الحالة": الحالة,
      "الملاحظات": ملاحظات || `تعديل عام للملف وتحديث حالة التواصل إلى: ${الحالة}`,
      "المصدر": "واجهة المندوب"
    };
    mockFollowups.push(newFollowup);
    saveCompaniesLocal();
    saveFollowupsLocal();

    console.log("Mock database updated successfully", { companyIdStr, newFollowup });
    return res.json({ 
      success: true, 
      message: "تم تحديث بيانات الشركة وإنشاء سجل المتابعة بنجاح (نمط بيئة تجريبية)", 
      updatedCompany: mockCompanies[companyIndex] 
    });
  }

  // ب) التحديث في Baserow الفعلي
  try {
    const comIdRaw = isNaN(Number(companyIdStr)) ? companyIdStr : Number(companyIdStr);
    
    // 1. تحديث سجل الشركة في Baserow
    const updateCompanyUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/${comIdRaw}/?user_field_names=true`;
    const companyPayload: any = {
      "الحالة": الحالة,
    };
    if (الأولوية) {
      companyPayload["الأولوية"] = الأولوية;
    }
    if (آخر_تواصل) {
      companyPayload["آخر تواصل"] = آخر_تواصل;
    }
    if (ملاحظات) {
      companyPayload["ملاحظات"] = ملاحظات;
    }
    if (اسم_الشركة) {
      companyPayload["اسم الشركة"] = اسم_الشركة;
    }
    if (كود_الشركة) {
      companyPayload["كود الشركة"] = كود_الشركة;
    }
    if (النشاط) {
      companyPayload["النشاط"] = النشاط;
    }
    if (المدينة) {
      companyPayload["المدينة"] = المدينة;
    }
    if (الجوال_الرئيسي) {
      companyPayload["الجوال الرئيسي"] = serverFormatPhone(الجوال_الرئيسي);
    }
    if (البريد_الرئيسي) {
      companyPayload["البريد الإلكتروني"] = serverFormatEmail(البريد_الرئيسي);
    }
    if (مسؤول_المبيعات) {
      companyPayload["مسؤول المبيعات"] = مسؤول_المبيعات;
    }

    const updateResponse = await fetch(updateCompanyUrl, {
      method: "PATCH",
      headers: getBaserowHeaders(cfg.token),
      body: JSON.stringify(companyPayload),
    });

    if (!updateResponse.ok) {
      const errText = await updateResponse.text();
      throw new Error(`خطأ Baserow عند تعديل الشركة (${updateResponse.status}): ${errText}`);
    }

    const updatedCompanyData = await updateResponse.json();

    // 2. إنشاء سجل متابعة جديد في Baserow
    const createFollowupUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableFollowups}/?user_field_names=true`;
    
    // لربط الشركة في Baserow، نرسل مصفوفة تحتوي على المعرّف (ID)
    const followupPayload: any = {
      "الشركة المرتبطة": [comIdRaw],
      "الموظف المرتبط": مسؤول_المبيعات || المندوب,
      "تاريخ المتابعة": آخر_تواصل || new Date().toISOString().split("T")[0],
      "الحالة": الحالة,
      "الملاحظات": ملاحظات || `تنسيق التواصل وتحديث حالة الفايل والتقرير العام.`,
      "المصدر": "واجهة المندوب"
    };

    const followupResponse = await fetch(createFollowupUrl, {
      method: "POST",
      headers: getBaserowHeaders(cfg.token),
      body: JSON.stringify(followupPayload),
    });

    if (!followupResponse.ok) {
      const errText = await followupResponse.text();
      console.warn(`تنبيه: فشل إنشاء سجل المتابعة في Baserow (${followupResponse.status}): ${errText}`);
    }

    return res.json({
      success: true,
      message: "تم تحديث الشركة في Baserow وإنشاء سجل المتابعة بنجاح.",
      updatedCompany: updatedCompanyData
    });

  } catch (error: any) {
    console.error("خطأ أثناء معالجة التحديث في Baserow:", error.message);
    return res.status(500).json({ 
      error: "فشل الاتصال بخادم Baserow لتحديث البيانات", 
      details: error.message 
    });
  }
});

// حذف شركة/عميل (لصلاحيات المدير فقط)
app.delete("/api/companies/:id", requireManager, async (req, res) => {
  const companyIdStr = req.params.id;
  const cfg = getBaserowConfig();

  // أ) الحذف في بيئة Mock
  if (!cfg.isConfigured) {
    const comIdNum = parseInt(companyIdStr, 10);
    const initialLength = mockCompanies.length;
    mockCompanies = mockCompanies.filter((c) => c.id !== comIdNum && String(c.id) !== companyIdStr);

    if (mockCompanies.length < initialLength) {
      saveCompaniesLocal();
      return res.json({ success: true, message: "تم حذف الشركة بنجاح من النظام التجريبي." });
    }
    return res.status(404).json({ error: "الشركة غير موجودة محلياً أو تم حذفها مسبقاً." });
  }

  // ب) الحذف من Baserow
  try {
    const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/${companyIdStr}/`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: getBaserowHeaders(cfg.token)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`فشل طلب الحذف من बसيروو: ${text}`);
    }

    return res.json({ success: true, message: "تم حذف الشركة بنجاح من قاعدة بيانات Baserow." });
  } catch (error: any) {
    console.error("خطأ أثناء حذف الشركة:", error.message);
    return res.status(500).json({ error: "فشل حذف الشركة من خادم Baserow الرئيسي", details: error.message });
  }
});

// رابط لإجراء تعديل بيانات ممثل المبيعات (المندوب)
app.patch("/api/employees/:id", requireManager, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, department } = req.body;
  const cfg = getBaserowConfig();

  const reqName = name || req.body["الاسم"];
  const reqEmail = email || req.body["البريد الإلكتروني"];
  const reqPhone = phone !== undefined ? phone : req.body["الجوال"];
  const reqDept = department !== undefined ? department : req.body["القسم"];

  if (!cfg.isConfigured || !cfg.tableEmployees) {
    const targetId = Number(id) || id;
    const empIdx = mockEmployeesList.findIndex(e => e.id === targetId || String(e.id) === String(id));
    if (empIdx !== -1) {
      if (reqName) mockEmployeesList[empIdx]["الاسم"] = reqName;
      if (reqEmail) mockEmployeesList[empIdx]["البريد الإلكتروني"] = serverFormatEmail(reqEmail);
      if (reqPhone !== undefined) mockEmployeesList[empIdx]["الجوال"] = serverFormatPhone(reqPhone);
      if (reqDept !== undefined) mockEmployeesList[empIdx]["القسم"] = reqDept;

      const finalEmp = mockEmployeesList[empIdx];
      const dbId = cfg.databaseId || "config_needed";
      const tblEmp = cfg.tableEmployees || "config_needed";
      const msgText = `📢 *إشعار CRM - تحديث بيانات المندوب*

👤 *الاسم الكامل:* ${finalEmp["الاسم"]}
📧 *البريد الإلكتروني:* ${finalEmp["البريد الإلكتروني"]}
📞 *رقم الجوال:* ${finalEmp["الجوال"] || 'غير رئيسي / غير متوفر'}
💼 *القسم الإداري:* ${finalEmp["القسم"] || 'المبيعات'}
🔄 *الإجراء:* تم تحديث وتعديل بيانات المندوب وحفظها محلياً بنجاح في المنظومة.

🔗 *رابط المندوب المباشر في جدول Baserow:*
https://baserow.io/database/${dbId}/table/${tblEmp}?grid-search=${encodeURIComponent(finalEmp["الاسم"])}`;

      const whatsappUrl = `https://api.whatsapp.com/send?phone=${MANAGER_WHATSAPP}&text=${encodeURIComponent(msgText)}`;

      saveEmployeesLocal();
      return res.json({ 
        success: true, 
        message: "تم تحديث بيانات المندوب محلياً بنجاح وجاري إرسال الإشعار لواتساب المدير.", 
        employee: finalEmp,
        whatsappUrl
      });
    }
    return res.status(404).json({ error: "المندوب غير موجود محلياً." });
  }

  try {
    const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableEmployees}/${id}/?user_field_names=true`;
    
    const bodyPayload: any = {};
    if (reqName) bodyPayload["الاسم"] = reqName;
    if (reqEmail) bodyPayload["البريد الإلكتروني"] = serverFormatEmail(reqEmail);
    if (reqPhone !== undefined) bodyPayload["الجوال"] = serverFormatPhone(reqPhone);
    if (reqDept !== undefined) bodyPayload["القسم"] = reqDept;

    const response = await fetch(url, {
      method: "PATCH",
      headers: getBaserowHeaders(cfg.token),
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Baserow patch error: ${text}`);
    }

    const updatedData = await response.json();
    
    // بناء إشعار الواتساب
    const finalName = updatedData["الاسم"] || reqName || "مندوب مبيعات";
    const finalEmail = updatedData["البريد الإلكتروني"] || reqEmail || "غير متوفر";
    const finalPhone = updatedData["الجوال"] || reqPhone || "غير متوفر";
    const finalDept = updatedData["القسم"] || reqDept || "المبيعات";

    const dbId = cfg.databaseId || "config_needed";
    const tblEmp = cfg.tableEmployees || "config_needed";
    const msgText = `📢 *إشعار CRM - تحديث بيانات المندوب*

👤 *الاسم الكامل:* ${finalName}
📧 *البريد الإلكتروني:* ${finalEmail}
📞 *رقم الجوال:* ${finalPhone || 'غير رئيسي / غير متوفر'}
💼 *القسم الإداري:* ${finalDept || 'المبيعات'}
🔄 *الإجراء:* تم تحديث وتعديل بيانات المندوب ومزامنتها بنجاح مع جدول العمل الفعلي.

🔗 *رابط المندوب المباشر في جدول Baserow:*
https://baserow.io/database/${dbId}/table/${tblEmp}?grid-search=${encodeURIComponent(finalName)}`;

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${MANAGER_WHATSAPP}&text=${encodeURIComponent(msgText)}`;

    return res.json({ 
      success: true, 
      message: "تم تحديث بيانات المندوب في جدول Baserow بنجاح وجاري إرسال الإشعار لواتساب المدير.", 
      employee: updatedData,
      whatsappUrl
    });
  } catch (error: any) {
    console.error("خطأ أثناء تحديث الموظف في Baserow:", error.message);
    return res.status(500).json({ error: "فشل تحديث بيانات المندوب في خادم Baserow", details: error.message });
  }
});

// 5. جلب سجل المتابعة الخاص بشركة معينة (أو جلب كافة المتابعات للمدير في حال عدم تمرير المعرف)
app.get("/api/followups", async (req, res) => {
  const companyIdStr = req.query.companyId as string;
  const cfg = getBaserowConfig();

  if (!companyIdStr) {
    if (!cfg.isConfigured) {
      return res.json(mockFollowups);
    }
    try {
      const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableFollowups}/?user_field_names=true&size=200`;
      const response = await fetch(url, {
        headers: getBaserowHeaders(cfg.token)
      });
      if (!response.ok) {
        throw new Error(`Baserow followups fetch error ${response.status}`);
      }
      const data: any = await response.json();
      return res.json(data.results || []);
    } catch (error: any) {
      console.error("خطأ جلب كافة المتابعات للمدير من Baserow:", error.message);
      return res.json(mockFollowups);
    }
  }

  if (!cfg.isConfigured) {
    const comIdNum = parseInt(companyIdStr, 10);
    const filtered = mockFollowups.filter((f) => f["الشركة المرتبطة"] === comIdNum);
    return res.json(filtered);
  }

  try {
    const url = `https://api.baserow.io/api/database/rows/table/${cfg.tableFollowups}/?user_field_names=true&size=200`;
    const response = await fetch(url, {
      headers: getBaserowHeaders(cfg.token)
    });

    if (!response.ok) {
      throw new Error(`Baserow followups fetch error ${response.status}`);
    }

    const data: any = await response.json();
    if (data && Array.isArray(data.results)) {
      // فلترة المتابعات التي ترتبط بالشركة المطلوبة
      const filtered = data.results.filter((row: any) => {
        const link = row["الشركة المرتبطة"];
        if (!link) return false;
        
        const comIdRaw = isNaN(Number(companyIdStr)) ? companyIdStr : Number(companyIdStr);

        if (Array.isArray(link)) {
          return link.some((item: any) => {
            const val = typeof item === "object" ? item.id : item;
            return String(val) === String(comIdRaw);
          });
        } else if (typeof link === "object") {
          return String(link.id) === String(comIdRaw);
        }
        return String(link) === String(comIdRaw);
      });
      return res.json(filtered);
    }
    return res.json([]);
  } catch (error: any) {
    console.error("فشل جلب المتابعات من Baserow، سيتم جلب Mock:", error.message);
    const comIdNum = parseInt(companyIdStr, 10);
    const filtered = mockFollowups.filter((f) => f["الشركة المرتبطة"] === comIdNum);
    return res.json(filtered);
  }
});


// تهيئة Google Sheets وتحميل البيانات منه عند الإقلاع (إن كان مفعّلاً)
const bootstrapData = async () => {
  await initSheets();
  if (!isSheetsEnabled()) {
    console.log(
      "ℹ️ Google Sheets غير مفعّل — يعمل النظام بالتخزين المحلي. لتفعيله اضبط GOOGLE_SERVICE_ACCOUNT_JSON و GOOGLE_SHEET_ID."
    );
    return;
  }
  // تحميل كل جدول من الشيت؛ عند نجاح القراءة نعتمدها كمصدر رئيسي،
  // وإلا نبقى على البيانات المحلية ثم نزامنها للشيت لاحقاً.
  const loaders: Array<[string, (rows: any[]) => void]> = [
    [TABS.companies, (rows) => { if (rows.length) mockCompanies = rows; }],
    [TABS.employees, (rows) => { if (rows.length) mockEmployeesList = rows as any; }],
    [TABS.quotations, (rows) => { if (rows.length) mockQuotations = rows as any; }],
    [TABS.followups, (rows) => { if (rows.length) mockFollowups = rows; }],
  ];
  for (const [tab, apply] of loaders) {
    const rows = await loadTable(tab);
    if (rows && rows.length) {
      apply(rows);
      console.log(`🟢 تم تحميل ${rows.length} سجلاً من تبويب "${tab}".`);
    } else {
      // التبويب فارغ أو غير موجود: ندفع البيانات المحلية الحالية إليه
      console.log(`ℹ️ تبويب "${tab}" فارغ — ستتم مزامنة البيانات المحلية إليه.`);
    }
  }
  // طلبات المحاسبة (مخزّنة في ملف مستقل)
  const accRows = await loadTable(TABS.accounting);
  if (accRows && accRows.length) {
    writeAccountingRequests(accRows);
    console.log(`🟢 تم تحميل ${accRows.length} طلب محاسبة من تبويب "${TABS.accounting}".`);
  }

  // مزامنة أولية للتأكد من توافق الشيت مع الحالة الحالية
  scheduleSave(TABS.companies, () => mockCompanies);
  scheduleSave(TABS.employees, () => mockEmployeesList);
  scheduleSave(TABS.quotations, () => mockQuotations);
  scheduleSave(TABS.followups, () => mockFollowups);
  scheduleSave(TABS.accounting, () => readAccountingRequests());
};

// دمج Vite Middleware في وضع التطوير
const startServer = async () => {
  await bootstrapData();

  // 404 موحّد بصيغة JSON لمسارات الـ API غير المعروفة (قبل الواجهة الأمامية)
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "المسار المطلوب غير موجود." });
  });

  if (process.env.NODE_ENV !== "production") {
    // تحميل Vite ديناميكياً لتجنب مشاكل التشغيل في الإنتاج
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("تم تفعيل بيئة تطوير Vite الديناميكية.");
  } else {
    // خدمة الملفات الثابتة المبنية للإنتاج
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // معالج أخطاء مركزي (يضمن إرجاع JSON بدل تعطّل الطلب)
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      console.error("خطأ غير متوقع في الخادم:", err?.message || err);
      if (res.headersSent) return next(err);
      res.status(500).json({ error: "حدث خطأ داخلي في الخادم." });
    }
  );

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`خادم ExpoTime CRM متصل ويعمل على: http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("خطأ فادح أثناء تشغيل الخادم:", err);
});
