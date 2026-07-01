import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

// تحميل متغيرات البيئة من .env أو بيئة التشغيل
dotenv.config();

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
const PORT = 3000;

app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ limit: "150mb", extended: true }));

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
  { id: 5, "الاسم": "نبيل الزبير", "البريد الإلكتروني": "nabilalzubair@gmail.com" }
];

// بيانات تجريبية (Mock Data) للشركات في حال عدم توفر الاتصال بـ Baserow
const defaultCompanies: any[] = [];

let mockCompanies: any[] = [];

// سجلات المتابعات للتجربة المحلية
const defaultFollowups: any[] = [];

let mockFollowups: any[] = [];

// ==========================================
// 1.5. نظام التخزين المحلي المحمي للملفات وتكامل البيانات
// ==========================================
const COMPANIES_FILE = path.join(process.cwd(), "companies-db.json");
const FOLLOWUPS_FILE = path.join(process.cwd(), "followups-db.json");
const EMPLOYEES_FILE = path.join(process.cwd(), "employees-db.json");
const QUOTATIONS_FILE = path.join(process.cwd(), "quotations-db.json");
const SETTINGS_FILE = path.join(process.cwd(), "settings-db.json");
const CHATS_FILE = path.join(process.cwd(), "chats-db.json");
const WORKSPACE_CHATS_FILE = path.join(process.cwd(), "workspace-chats-db.json");
const EXHIBITIONS_FILE = path.join(process.cwd(), "exhibitions-db.json");
const TRANSFER_REQUESTS_FILE = path.join(process.cwd(), "transfer-requests-db.json");
const EXHIBITION_REQUESTS_FILE = path.join(process.cwd(), "exhibition-requests-db.json");

let mockExhibitions: any[] = [];
try {
  if (fs.existsSync(EXHIBITIONS_FILE)) {
    mockExhibitions = JSON.parse(fs.readFileSync(EXHIBITIONS_FILE, "utf8"));
  } else {
    mockExhibitions = [
      {
        id: "ex-1",
        "اسم المعرض": "معرض البناء السعودي 2026",
        "المدينة": "الرياض",
        "التاريخ": "2026-10-12",
        "المندوب المسؤول": "مؤيدة"
      },
      {
        id: "ex-2",
        "اسم المعرض": "معرض الفندقة والأغذية السعودي",
        "المدينة": "جدة",
        "التاريخ": "2026-11-05",
        "المندوب المسؤول": "نصر"
      },
      {
        id: "ex-3",
        "اسم المعرض": "معرض الرياض الدولي للكتاب 2026",
        "المدينة": "الرياض",
        "التاريخ": "2026-09-25",
        "المندوب المسؤول": "غير مسند"
      }
    ];
    fs.writeFileSync(EXHIBITIONS_FILE, JSON.stringify(mockExhibitions, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("Error reading exhibitions file:", e.message);
}

const saveExhibitionsLocal = () => {
  try { fs.writeFileSync(EXHIBITIONS_FILE, JSON.stringify(mockExhibitions, null, 2), "utf8"); } catch(e){}
};

let mockTransferRequests: any[] = [];
try {
  if (fs.existsSync(TRANSFER_REQUESTS_FILE)) {
    mockTransferRequests = JSON.parse(fs.readFileSync(TRANSFER_REQUESTS_FILE, "utf8"));
  } else {
    mockTransferRequests = [];
    fs.writeFileSync(TRANSFER_REQUESTS_FILE, JSON.stringify(mockTransferRequests, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("Error reading transfer requests file:", e.message);
}

const saveTransferRequestsLocal = () => {
  try { fs.writeFileSync(TRANSFER_REQUESTS_FILE, JSON.stringify(mockTransferRequests, null, 2), "utf8"); } catch(e){}
};

let mockExhibitionRequests: any[] = [];
try {
  if (fs.existsSync(EXHIBITION_REQUESTS_FILE)) {
    mockExhibitionRequests = JSON.parse(fs.readFileSync(EXHIBITION_REQUESTS_FILE, "utf8"));
  } else {
    mockExhibitionRequests = [];
    fs.writeFileSync(EXHIBITION_REQUESTS_FILE, JSON.stringify(mockExhibitionRequests, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("Error reading exhibition requests file:", e.message);
}

const saveExhibitionRequestsLocal = () => {
  try { fs.writeFileSync(EXHIBITION_REQUESTS_FILE, JSON.stringify(mockExhibitionRequests, null, 2), "utf8"); } catch(e){}
};

let mockWorkspaceChats: any[] = [];
try {
  if (fs.existsSync(WORKSPACE_CHATS_FILE)) {
    mockWorkspaceChats = JSON.parse(fs.readFileSync(WORKSPACE_CHATS_FILE, "utf8"));
  } else {
    mockWorkspaceChats = [
      {
        id: "wmsg-1",
        sender: "المدير العام",
        message: "السلام عليكم يا زملاء العمل، أرجو التركيز التام على استقطاب وتعميد عملاء المعارض القادمة. تم تفعيل مزامنة ملف قوقل شيت الموحد.",
        type: "general",
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString()
      },
      {
        id: "wmsg-2",
        sender: "مؤيدة",
        message: "وعليكم السلام يا فندم. أبشرك تم حسم ومراجعة التفاصيل مع شركة سدير وسيتم رفع التعميد للمحاسب اليوم.",
        type: "general",
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString()
      },
      {
        id: "wmsg-3",
        sender: "محمود",
        message: "هل من الممكن تحويل عميل شركة آفاق الغد لحسابي لمتابعتهم في مدينة جدة؟",
        type: "transfer",
        companyName: "شركة آفاق الغد للحلول الذكية",
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        id: "wmsg-4",
        sender: "مؤيدة",
        message: "تفضل يا محمود، ليس لدي مانع من نقل العميل لك لمتابعة فرع جدة لديهم.",
        type: "general",
        timestamp: new Date(Date.now() - 3600000 * 1).toISOString()
      }
    ];
    fs.writeFileSync(WORKSPACE_CHATS_FILE, JSON.stringify(mockWorkspaceChats, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف دردشة زملاء العمل الموحد:", e.message);
}

const saveWorkspaceChatsLocal = () => {
  try { fs.writeFileSync(WORKSPACE_CHATS_FILE, JSON.stringify(mockWorkspaceChats, null, 2), "utf8"); } catch(e){}
};

let mockChats: any[] = [];
try {
  if (fs.existsSync(CHATS_FILE)) {
    mockChats = JSON.parse(fs.readFileSync(CHATS_FILE, "utf8"));
  } else {
    // رسائل افتراضية لتبدأ المحادثات بشكل ممتع وتوضيحي
    mockChats = [];
    fs.writeFileSync(CHATS_FILE, JSON.stringify(mockChats, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف دردشة المتابعة:", e.message);
}

// تحميل السجلات المحفوظة مسبقاً لمنع أي فقدان للبيانات
try {
  if (fs.existsSync(COMPANIES_FILE)) {
    const raw = fs.readFileSync(COMPANIES_FILE, "utf8").trim();
    if (raw && raw !== "[]") {
      mockCompanies = JSON.parse(raw);
    } else {
      mockCompanies = defaultCompanies;
      fs.writeFileSync(COMPANIES_FILE, JSON.stringify(mockCompanies, null, 2), "utf8");
    }
  } else {
    mockCompanies = defaultCompanies;
    fs.writeFileSync(COMPANIES_FILE, JSON.stringify(mockCompanies, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف شركات:", e.message);
  mockCompanies = defaultCompanies;
}

try {
  if (fs.existsSync(FOLLOWUPS_FILE)) {
    const raw = fs.readFileSync(FOLLOWUPS_FILE, "utf8").trim();
    if (raw && raw !== "[]") {
      mockFollowups = JSON.parse(raw);
    } else {
      mockFollowups = defaultFollowups;
      fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify(mockFollowups, null, 2), "utf8");
    }
  } else {
    mockFollowups = defaultFollowups;
    fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify(mockFollowups, null, 2), "utf8");
  }
} catch (e: any) {
  console.error("خطأ في قراءة ملف المتابعات:", e.message);
  mockFollowups = defaultFollowups;
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
    "نبيل الزبير": "nabilalzubair",
    "نبيل": "nabil"
  };

  let updatedEmployees = false;
  mockEmployeesList = mockEmployeesList.map((emp: any) => {
    const name = emp["الاسم"] || "";
    const currentUsername = emp["اسم المستخدم"] || emp["username"];
    const currentPassword = emp["كلمة المرور"] || emp["password"];
    
    const username = currentUsername || arabicToEnglishMap[name] || name.toLowerCase().replace(/\s+/g, "");
    const password = currentPassword || "123456";
    
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
  accountantEmail: "jamal@expo-time.co",
  accountantPhone: "+966500000000"
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

// دوال مساعدة لحفظ التغييرات فوراً إلى السيرفر
const saveCompaniesLocal = () => {
  try { fs.writeFileSync(COMPANIES_FILE, JSON.stringify(mockCompanies, null, 2), "utf8"); } catch(e){}
};
const saveFollowupsLocal = () => {
  try { fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify(mockFollowups, null, 2), "utf8"); } catch(e){}
};
const saveEmployeesLocal = () => {
  try { fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(mockEmployeesList, null, 2), "utf8"); } catch(e){}
};
const saveChatsLocal = () => {
  try { fs.writeFileSync(CHATS_FILE, JSON.stringify(mockChats, null, 2), "utf8"); } catch(e){}
};
const saveQuotationsLocal = () => {
  try { fs.writeFileSync(QUOTATIONS_FILE, JSON.stringify(mockQuotations, null, 2), "utf8"); } catch(e){}
};
const saveSettingsLocal = () => {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2), "utf8"); } catch(e){}
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
  res.json({
    isMockEnabled: !cfg.isConfigured,
    configuredTables: {
      companies: !!cfg.tableCompanies,
      employees: !!cfg.tableEmployees,
      followups: !!cfg.tableFollowups,
    },
    message: cfg.isConfigured 
      ? "متصل بقاعدة بيانات Baserow الحية بنجاح." 
      : "يعمل حالياً بنمط البيانات التجريبية النشطة (Mock Database). لربط Baserow الحقيقي، يرجى ضبط المتغيرات المطلوبة في لوحة الإعدادات."
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
app.post("/api/app-settings", (req, res) => {
  const { googleSheetId, googleSheetUrl, googleDriveFolderId, googleDriveFolderUrl, accountantEmail, accountantPhone } = req.body;
  
  if (googleSheetId !== undefined) appSettings.googleSheetId = googleSheetId;
  if (googleSheetUrl !== undefined) appSettings.googleSheetUrl = googleSheetUrl;
  if (googleDriveFolderId !== undefined) appSettings.googleDriveFolderId = googleDriveFolderId;
  if (googleDriveFolderUrl !== undefined) appSettings.googleDriveFolderUrl = googleDriveFolderUrl;
  if (accountantEmail !== undefined) appSettings.accountantEmail = accountantEmail;
  if (accountantPhone !== undefined) appSettings.accountantPhone = accountantPhone;

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
  const { companyId, companyName, amount, details, exhibition, items, terms } = req.body;
  
  if (!companyId || !companyName) {
    return res.status(400).json({ error: "معرف واسم الشركة مطلوبين لإنشاء عرض سعر." });
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
    "الشروط": terms || "",
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
  const { status, taxNumber, nationalAddress, crNumber, items, amount, details, exhibition, terms, reason } = req.body;

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
  if (terms !== undefined) {
    mockQuotations[qIdx]["الشروط"] = terms;
  }
  if (reason !== undefined) {
    mockQuotations[qIdx]["سبب الرفض أو التأجيل"] = reason;
  }

  mockQuotations[qIdx]["تاريخ التحديث"] = new Date().toISOString().split("T")[0];

  saveQuotationsLocal();
  res.json({ success: true, message: "تم تحديث تفاصيل عرض السعر وحفظها بنجاح 🟢", quotation: mockQuotations[qIdx] });
});

// و2) إرسال بريد إلكتروني فوري للعميل بعرض السعر المعتمد
app.post("/api/quotations/send-client-email", (req, res) => {
  const { quotationId, clientName, clientEmail, items, amount, exhibition, repName } = req.body;

  if (!clientEmail) {
    return res.status(400).json({ error: "بريد العميل الإلكتروني مطلوب لإرسال العرض." });
  }

  console.log(`[EMAIL SIMULATOR] Sending quotation email to client: ${clientEmail}...`);
  console.log(`[EMAIL DETAILS]
    المستلم: ${clientEmail}
    العنوان: عرض سعر رسمي وموثق من إكسبو تايم - رقم ${quotationId}
    المحتوى:
    مرحباً أ. ${clientName}،
    يسعدنا في إكسبو تايم لتنظيم المعارض والمؤتمرات (ExpoTime) تقديم عرض السعر الرسمي الخاص بكم لـ ${exhibition || "المعرض المعني"}.
    
    تفاصيل عرض السعر رقم: ${quotationId}
    الإجمالي قبل الضريبة: ${amount} ر.س
    ضريبة القيمة المضافة (15%): ${(Number(amount) * 0.15).toFixed(2)} ر.س
    الإجمالي النهائي: ${(Number(amount) * 1.15).toFixed(2)} ر.س
    
    البنود المشمولة بالعرض:
    ${(items || []).map((it: any, i: number) => `- البند ${i+1}: ${it.description} (الكمية: ${it.qty} | سعر الوحدة: ${it.price} ر.س | الإجمالي: ${it.total} ر.س)`).join("\n")}
    
    مسؤول المبيعات المختص بمتابعة طلبكم: ${repName || "إكسبو تايم مبيعات"}.
    نشكركم لثقتكم بنا، ونتطلع للتعاون المثمر معكم لتقديم تجربة مشاركة استثنائية بالمعرض.
    
    تحياتنا،
    إدارة المبيعات والعلاقات العامة | إكسبو تايم للمعارض والمؤتمرات
  `);

  res.json({
    success: true,
    message: `تم إرسال عرض السعر رقم (${quotationId}) رسمياً لبريد العميل (${clientEmail}) بنجاح! ✉️`
  });
});

// و) إرسال بريد إلكتروني فوري للمحاسب عن التعميد
app.post("/api/send-accounting-email", (req, res) => {
  const { quotationId, clientName, clientPhone, taxNumber, nationalAddress, crNumber, amount, details, exhibition, repName } = req.body;

  const targetEmail = appSettings.accountantEmail || "jamal@expo-time.co";

  console.log(`[EMAIL SIMULATOR] Sending email to ${targetEmail}...`);
  console.log(`[EMAIL DETAILS]
    العنوان: تعميد رسمي ومستندات ضريبية للعميل: ${clientName}
    المحتوى:
    مرحباً أ. جمال،
    نفيدكم علماً بأنه قد تم تعميد عرض السعر رقم: ${quotationId} بقيمة: ${amount} ريال سعودي.
    الخاص بالمعرض: ${exhibition || "غير محدد"}.
    مسؤول المبيعات: ${repName || "غير محدد"}.
    
    تفاصيل العميل القانونية والضريبية المعتمدة:
    - الرقم الضريبي: ${taxNumber || "غير متوفر"}
    - السجل التجاري: ${crNumber || "غير متوفر"}
    - العنوان الوطني: ${nationalAddress || "غير متوفر"}
    - جوال العميل: ${clientPhone || "غير متوفر"}
    
    الرجاء اتخاذ الإجراءات المحاسبية وإصدار الفاتورة الضريبية وإرسالها للعميل ومتابعة الدفعة.
    شكراً لكم،
    نظام بورتال مبيعات ExpoTime CRM المطور.
  `);

  res.json({
    success: true,
    message: `تم إرسال بريد التعميد القانوني الفوري بنجاح إلى المحاسب أ. جمال عبر البريد المعتمد (${targetEmail}) 🟢`,
    emailLog: {
      recipient: targetEmail,
      subject: `[تعميد رسمي] ${clientName} - عرض السعر ${quotationId}`,
      sentAt: new Date().toISOString()
    }
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
    status: "معلق", // معلق | مكتمل
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

// ت) تحديث حالة طلب المحاسب (مثل الاعتماد والتعميد)
app.patch("/api/accounting-requests/:id", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const requests = readAccountingRequests();
  const requestIndex = requests.findIndex((r: any) => String(r.id) === String(id));

  if (requestIndex === -1) {
    return res.status(404).json({ error: "الطلب المطلوب غير موجود." });
  }

  requests[requestIndex].status = status || "مكتمل";
  requests[requestIndex].actionTakenAt = new Date().toISOString();

  writeAccountingRequests(requests);

  res.json({
    success: true,
    message: "تم تحديث حالة طلب التعميد بنجاح! 🟢",
    request: requests[requestIndex]
  });
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
      model: "gemini-3.5-flash",
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

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "مفتاح Gemini API Key غير مبرمج في السيرفر بعد." });
  }

  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: "الرجاء توفير مصفوفة الصفوف من ملف الإكسل لمعالجتها." });
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
      model: "gemini-3.5-flash",
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

    // حفظ البيانات في قاعدة البيانات وتصفية التكرار فورياً
    const cfg = getBaserowConfig();
    let existingCompanies: any[] = [];
    try {
      if (cfg.isConfigured) {
        existingCompanies = await fetchAllBaserowCompanies(cfg);
      } else {
        existingCompanies = mockCompanies;
      }
    } catch (error: any) {
      console.error("فشل تحميل قائمة فحص التكرار أثناء الاستيراد الذكي:", error.message);
      existingCompanies = mockCompanies;
    }

    const toAdd: any[] = [];
    const skippedCompanies: any[] = [];

    for (const comp of initializedRows) {
      const duplicate = findDuplicateCompany(comp, existingCompanies);
      if (duplicate) {
        skippedCompanies.push({
          name: comp["اسم الشركة"],
          code: duplicate["كود الشركة"] || "غير معروف",
          phone: comp["الجوال الرئيسي"]
        });
      } else {
        toAdd.push(comp);
        existingCompanies.push(comp); // منع التكرار داخل نفس الملف
      }
    }

    if (!cfg.isConfigured) {
      for (const comp of toAdd) {
        const newId = mockCompanies.length + 1;
        mockCompanies.push({ id: newId, ...comp });
      }
      saveCompaniesLocal();
    } else {
      // الرفع لـ Baserow
      const chunkSize = 200;
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
          console.error(`فشل إضافة دفعة ذكية في Baserow (${response.status}):`, text);
        }
      }
    }

    return res.json({
      success: true,
      message: "تم تنظيف وتنسيق وحفظ ملف الإكسل المبعثر بنجاح بواسطة الذكاء الاصطناعي 🟢",
      data: toAdd,
      count: toAdd.length,
      skippedCount: skippedCompanies.length,
      skipped: skippedCompanies
    });
  } catch (error) {
    console.error("خطأ معالجة ملف الإكسل بـ Gemini:", error.message);
    return res.status(500).json({ error: "فشل ذكاء Gemini الاصطناعي في تنظيم وتطهير ملف الإكسل المبعثر.", details: error.message });
  }
});

// رابط معالجة ملفات الإكسل متعددة الصفحات بالذكاء الاصطناعي (حتى 7 صفحات داخلية) مع إمكانية المراجعة والتعديل قبل الاستيراد
app.post("/api/ai/clean-excel-sheets", async (req, res) => {
  const { sheetsData, salesRep } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "مفتاح Gemini API Key غير مبرمج في السيرفر بعد." });
  }

  if (!sheetsData || !Array.isArray(sheetsData) || sheetsData.length === 0) {
    return res.status(400).json({ error: "الرجاء توفير مصفوفة الصفحات والبيانات من ملف الإكسل لمعالجتها." });
  }

  try {
    // تجميع وتسطيح كافة الصفوف من كافة الصفحات
    const flattenedRows: any[] = [];
    sheetsData.forEach((sheet: any) => {
      const sheetName = sheet.sheetName || "ورقة داخلية";
      if (Array.isArray(sheet.rows)) {
        sheet.rows.forEach((row: any) => {
          flattenedRows.push({
            "صفحة المصدر": sheetName,
            ...row
          });
        });
      }
    });

    if (flattenedRows.length === 0) {
      return res.json({ success: true, companies: [], totalParsed: 0 });
    }

    // لتجنب تجاوز حد استهلاك الحصة أو الذاكرة، سنقوم بمعالجة أول 250 صف
    const subsetRows = flattenedRows.slice(0, 250);

    const prompt = `أنت خبير متميز في معالجة وتنظيف وتطهير بيانات العملاء والشركات لشركتنا ExpoTime.
لقد قمنا برفع ملف إكسل يحتوي على عدة صفحات داخلية (Sheets) مبعثرة وغير منظمة.
مهمتك هي تحليل كافة الصفوف المستخرجة واستخلاص الشركات والعملاء، وتنسيقهم بشكل صحيح وموحد باللغة العربية.

الصفحات والصفوف الخام المدخلة هي:
${JSON.stringify(subsetRows, null, 2)}

شروط الاستخلاص والتنظيف:
1. "اسم الشركة" (إجباري): استخلص اسم الشركة أو المؤسسة أو العميل بوضوح تام.
2. "كود الشركة": توليد كود مميز وموحد للشركة يبدأ بـ COMP- ومتبوعاً بـ 4 أرقام عشوائية.
3. "النشاط": تحديد النشاط الملائم (مثل: معارض ومؤتمرات، تجارة، تقنية، مقاولات، تصنيع، إلخ).
4. "المدينة": المدينة السعودية المذكورة (مثل: الرياض، جدة، الدمام، مكة، إلخ) أو "الرياض" كقيمة افتراضية.
5. "الجوال الرئيسي": رقم الجوال بصيغة سعودية صحيحة (05xxxxxxxx).
6. "البريد الإلكتروني": البريد الإلكتروني الصالح للشركة أو قيمة فارغة.
7. "الحالة": "جديد" افتراضياً، أو حدد إحدى الحالات: (جديد، تواصل أولي، مهتم، تم تقديم عرض، مفاوضات، تم التعميد، مستبعد).
8. "الأولوية": (عالية، متوسطة، منخفضة) بحسب الاهتمام المذكور، أو "متوسطة" كافتراضي.
9. "ملاحظات": ملخص ذكي لأي ملاحظات أو متطلبات في الصف الخام، مع الإشارة إلى صفحة الإكسل التي تم استخراجه منها.
10. "المعرض": اسم المعرض المرتبط بالعميل إن وجد في البيانات.

الرجاء إرجاع كود JSON صالح تماماً ككائن يحتوي على مصفوفة باسم "cleanedRows".`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
                  "المعرض": { type: Type.STRING }
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

    const initializedRows = cleanedRows.map((row: any, idx: number) => {
      const uniqueId = `AI-SHEET-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
      return {
        id: uniqueId,
        "اسم الشركة": row["اسم الشركة"] || "شركة مستوردة غير مسمى",
        "كود الشركة": row["كود الشركة"] || `COMP-${Math.floor(1000 + Math.random() * 9000)}`,
        "النشاط": row["النشاط"] || "معارض وفعاليات",
        "المدينة": row["المدينة"] || "الرياض",
        "الجوال الرئيسي": serverFormatPhone(row["الجوال الرئيسي"] || ""),
        "البريد الإلكتروني": serverFormatEmail(row["البريد الإلكتروني"] || ""),
        "الحالة": row["الحالة"] || "جديد",
        "مسؤول المبيعات": salesRep || "مؤيدة",
        "الأولوية": row["الأولوية"] || "متوسطة",
        "آخر تواصل": new Date().toISOString().split("T")[0],
        "المصدر": "استيراد ذكي متعدد الصفحات (AI)",
        "ملاحظات": row["ملاحظات"] || "",
        "المعرض": row["المعرض"] || "",
        approved: true // مضاف بشكل افتراضي كـ معتمد للمراجعة في الجدول
      };
    });

    return res.json({
      success: true,
      companies: initializedRows,
      totalParsed: flattenedRows.length,
      subsetProcessed: subsetRows.length
    });
  } catch (err: any) {
    console.error("خطأ معالجة صفحات ملف الإكسل بالذكاء الاصطناعي:", err.message);
    return res.status(500).json({ error: "فشل ذكاء Gemini الاصطناعي في تنظيم وتطهير بيانات صفحات الإكسل.", details: err.message });
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
      model: "gemini-3.5-flash",
      contents: prompt
    });

    return res.json({
      success: true,
      emailText: response.text || "فشل صياغة البريد الإلكتروني بالذكاء الاصطناعي."
    });
  } catch (error) {
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
      model: "gemini-3.5-flash",
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
      model: "gemini-3.5-flash",
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
      model: "gemini-3.5-flash",
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
app.post("/api/employees", async (req, res) => {
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

  const whatsappUrl = `https://api.whatsapp.com/send?phone=966551016181&text=${encodeURIComponent(msgText)}`;

  if (!cfg.isConfigured || !cfg.tableEmployees) {
    const newId = Date.now();
    const empUser = req.body["اسم المستخدم"] || req.body["username"] || empName.toLowerCase().replace(/\s+/g, "");
    const empPass = req.body["كلمة المرور"] || req.body["password"] || "123456";

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
    
    // حفظ اسم المستخدم وكلمة المرور محلياً لمطابقتها فوراً عند تسجيل الدخول
    const empUser = req.body["اسم المستخدم"] || req.body["username"] || empName.toLowerCase().replace(/\s+/g, "");
    const empPass = req.body["كلمة المرور"] || req.body["password"] || "123456";
    
    const localEmp = {
      id: data.id,
      "الاسم": empName,
      "البريد الإلكتروني": empEmail,
      "القسم": empDept || "المبيعات",
      "الجوال": empPhone || "",
      "اسم المستخدم": empUser,
      "كلمة المرور": empPass
    };
    
    // التأكد من عدم تكراره محلياً
    mockEmployeesList = mockEmployeesList.filter((e) => e.id !== data.id && String(e["البريد الإلكتروني"]) !== String(empEmail));
    mockEmployeesList.push(localEmp);
    saveEmployeesLocal();

    return res.json({
      success: true,
      employee: localEmp,
      whatsappUrl,
      message: "تم إضافة المندوب في جدول Baserow والترخيص محلياً بنجاح! 🟢"
    });
  } catch (error: any) {
    console.error("خطأ أثناء إضافة موظف في Baserow:", error.message);
    return res.status(500).json({ error: "فشل حفظ المندوب في خادم Baserow الرئيسي", details: error.message });
  }
});

// حذف مندوب مبيعات
app.delete("/api/employees/:id", async (req, res) => {
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
    } catch (error) {
      console.error("خطأ أثناء جلب كافة الشركات للمدير من Baserow:", error.message);
      return res.json(mockCompanies);
    }
  } else {
    // ب) جلب الشركات الفردية الخاصة بالمندوب الفلاني
    // تعديل: إذا كان هناك استعلام بحث (searchQuery)، يتم البحث في كامل قاعدة البيانات ولا يقتصر على المندوب فقط!
    if (searchQuery) {
      if (!cfg.isConfigured) {
        const query = searchQuery.toLowerCase().trim();
        const matched = mockCompanies.filter(c => 
          String(c["اسم الشركة"] || "").toLowerCase().includes(query) ||
          String(c["كود الشركة"] || "").toLowerCase().includes(query) ||
          String(c["الجوال الرئيسي"] || "").toLowerCase().includes(query) ||
          String(c["مسؤول المبيعات"] || "").toLowerCase().includes(query)
        );
        return res.json(matched);
      }

      try {
        let baseUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true&size=${size}&search=${encodeURIComponent(searchQuery)}`;
        const response = await fetch(baseUrl, { headers: getBaserowHeaders(cfg.token) });
        if (!response.ok) {
          throw new Error(`Baserow Search Fetch Error ${response.status}`);
        }
        const data = await response.json();
        return res.json(data.results || []);
      } catch (error) {
        console.error("خطأ أثناء البحث العام للمندوب من Baserow:", error.message);
        const query = searchQuery.toLowerCase().trim();
        const matched = mockCompanies.filter(c => 
          String(c["اسم الشركة"] || "").toLowerCase().includes(query) ||
          String(c["كود الشركة"] || "").toLowerCase().includes(query) ||
          String(c["الجوال الرئيسي"] || "").toLowerCase().includes(query) ||
          String(c["مسؤول المبيعات"] || "").toLowerCase().includes(query)
        );
        return res.json(matched);
      }
    } else {
      // جلب الشركات الخاصة بالمندوب فقط لعدم وجود استعلام بحث
      if (!cfg.isConfigured) {
        const filtered = mockCompanies.filter(
          (c) => c["مسؤول المبيعات"] && c["مسؤول المبيعات"].trim() === representativeName.trim()
        );
        return res.json(filtered);
      }

      try {
        let baseUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true&size=${size}&filter__field_مسؤول المبيعات__contains=${encodeURIComponent(representativeName.trim())}`;
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
      } catch (error) {
        console.error("خطأ أثناء جلب الشركات للمندوب من Baserow:", error.message);
        const filtered = mockCompanies.filter(
          (c) => c["مسؤول المبيعات"] && c["مسؤول المبيعات"].trim() === representativeName.trim()
        );
        return res.json(filtered);
      }
    }
  }
});

// ب) جلب الشركات الفردية الخاصة بالمندوب الفلاني عبر الرابط المخصص المباشر
app.get("/api/companies-by-rep/:repName", async (req, res) => {
  const representativeName = req.params.repName;
  const size = req.query.size || 150;
  const searchQuery = req.query.search ? String(req.query.search) : "";
  const cfg = getBaserowConfig();

  // تعديل: إذا كان هناك استعلام بحث (searchQuery)، يتم البحث في كامل قاعدة البيانات ولا يقتصر على المندوب فقط!
  if (searchQuery) {
    if (!cfg.isConfigured) {
      const query = searchQuery.toLowerCase().trim();
      const matched = mockCompanies.filter(c => 
        String(c["اسم الشركة"] || "").toLowerCase().includes(query) ||
        String(c["كود الشركة"] || "").toLowerCase().includes(query) ||
        String(c["الجوال الرئيسي"] || "").toLowerCase().includes(query) ||
        String(c["مسؤول المبيعات"] || "").toLowerCase().includes(query)
      );
      return res.json(matched);
    }

    try {
      let baseUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true&size=${size}&search=${encodeURIComponent(searchQuery)}`;
      const response = await fetch(baseUrl, { headers: getBaserowHeaders(cfg.token) });
      if (!response.ok) {
        throw new Error(`Baserow Search Fetch Error ${response.status}`);
      }
      const data = await response.json();
      return res.json(data.results || []);
    } catch (error) {
      console.error("خطأ أثناء البحث العام للمندوب من Baserow:", error.message);
      const query = searchQuery.toLowerCase().trim();
      const matched = mockCompanies.filter(c => 
        String(c["اسم الشركة"] || "").toLowerCase().includes(query) ||
        String(c["كود الشركة"] || "").toLowerCase().includes(query) ||
        String(c["الجوال الرئيسي"] || "").toLowerCase().includes(query) ||
        String(c["مسؤول المبيعات"] || "").toLowerCase().includes(query)
      );
      return res.json(matched);
    }
  } else {
    // جلب الشركات الخاصة بالمندوب فقط لعدم وجود استعلام بحث
    if (!cfg.isConfigured) {
      const filtered = mockCompanies.filter(
        (c) => c["مسؤول المبيعات"] && c["مسؤول المبيعات"].trim() === representativeName.trim()
      );
      return res.json(filtered);
    }

    try {
      let baseUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/?user_field_names=true&size=${size}&filter__field_مسؤول المبيعات__contains=${encodeURIComponent(representativeName.trim())}`;
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
    } catch (error) {
      console.error("خطأ أثناء جلب الشركات للمندوب من Baserow:", error.message);
      const filtered = mockCompanies.filter(
        (c) => c["مسؤول المبيعات"] && c["مسؤول المبيعات"].trim() === representativeName.trim()
      );
      return res.json(filtered);
    }
  }
});

// 5.5. بوابة تسجيل الدخول الموحدة باليوزر والباسورد (تم إلغاء الطرق السابقة والربط بـ Baserow)
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "الرجاء إدخال اسم المستخدم وكلمة المرور." });
  }

  const typedUsername = username.trim().toLowerCase();

  // 1. فحص المدير العام (نبيل الزبير)
  const managerUsername = (process.env.MANAGER_USERNAME || "nabilalzubair").trim().toLowerCase();
  const managerPassword = process.env.MANAGER_PASSWORD || "3429003";

  // 1.5. فحص مدير المبيعات
  const salesManagerUsername = (process.env.SALES_MANAGER_USERNAME || "salesmanager").trim().toLowerCase();
  const salesManagerPassword = process.env.SALES_MANAGER_PASSWORD || "salesmanager123";

  const isGM = (typedUsername === managerUsername);
  const isSalesManager = (typedUsername === salesManagerUsername);

  // 2. البحث عن المندوب باسم المستخدم
  const foundRepByUsername = mockEmployeesList.find((emp: any) => {
    const empUser = String(emp["اسم المستخدم"] || "").trim().toLowerCase();
    return empUser === typedUsername;
  });

  // إذا لم يكن المدير ولا مدير المبيعات ولا الموظف موجودين
  if (!isGM && !isSalesManager && !foundRepByUsername) {
    return res.status(401).json({ 
      error: "اسم المستخدم غير صحيح أو غير مسجل في النظام 🔍. يرجى التأكد من كتابة الاسم الصحيح أو مراجعة الإدارة." 
    });
  }

  // إذا كان المستخدم هو المدير العام
  if (isGM) {
    if (password === managerPassword) {
      return res.json({
        success: true,
        role: "manager",
        user: { name: "المدير العام (نبيل الزبير)", email: "nabilalzubair@gmail.com" }
      });
    } else {
      return res.status(401).json({ 
        error: "كلمة المرور التي أدخلتها غير صحيحة 🔑. يرجى التأكد من كلمة المرور الخاصة بحساب المدير." 
      });
    }
  }

  // إذا كان المستخدم هو مدير المبيعات
  if (isSalesManager) {
    if (password === salesManagerPassword) {
      return res.json({
        success: true,
        role: "sales_manager",
        user: { name: "مدير المبيعات المعتمد", email: "salesmanager@expotime.com" }
      });
    } else {
      return res.status(401).json({ 
        error: "كلمة المرور التي أدخلتها غير صحيحة 🔑. يرجى التأكد من كلمة المرور الخاصة بحساب مدير المبيعات." 
      });
    }
  }

  // إذا كان المستخدم هو أحد المناديب المعتمدين
  if (foundRepByUsername) {
    const empPass = String(foundRepByUsername["كلمة المرور"] || "").trim();
    if (password === empPass) {
      return res.json({
        success: true,
        role: "rep",
        user: { 
          id: foundRepByUsername.id,
          name: foundRepByUsername["الاسم"], 
          email: foundRepByUsername["البريد الإلكتروني"] || `${typedUsername}@expotime.com` 
        }
      });
    } else {
      return res.status(401).json({ 
        error: "كلمة المرور التي أدخلتها غير صحيحة 🔑. يرجى التحقق من كلمة المرور والمحاولة مرة أخرى." 
      });
    }
  }

  return res.status(401).json({ error: "حدث خطأ غير متوقع أثناء تسجيل الدخول." });
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
      "المصدر": c["المصدر"] || "يدوي / إكسل",
      "المعرض": c["المعرض"] || "",
      "المعارض": Array.isArray(c["المعارض"]) ? c["المعارض"].slice(0, 10) : (c["المعرض"] ? [c["المعرض"]] : [])
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

// ==========================================
// مضاف: نظام إدارة المعارض وطلبات نقل الإسناد والربط
// ==========================================

app.get("/api/exhibitions", (req, res) => {
  res.json(mockExhibitions);
});

app.post("/api/exhibitions", (req, res) => {
  const { name, city, date, rep } = req.body;
  if (!name) {
    return res.status(400).json({ error: "اسم المعرض حقل إجباري" });
  }
  const newEx = {
    id: "ex-" + Date.now(),
    "اسم المعرض": name,
    "المدينة": city || "الرياض",
    "التاريخ": date || "",
    "المندوب المسؤول": rep || "غير مسند"
  };
  mockExhibitions.push(newEx);
  saveExhibitionsLocal();
  res.json({ success: true, data: newEx });
});

app.patch("/api/exhibitions/:id", (req, res) => {
  const { id } = req.params;
  const { name, city, date, rep, "المندوب المسؤول": repName } = req.body;
  const idx = mockExhibitions.findIndex(ex => String(ex.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "المعرض غير موجود" });
  }
  if (name !== undefined) mockExhibitions[idx]["اسم المعرض"] = name;
  if (city !== undefined) mockExhibitions[idx]["المدينة"] = city;
  if (date !== undefined) mockExhibitions[idx]["التاريخ"] = date;
  
  const targetRep = rep !== undefined ? rep : repName;
  if (targetRep !== undefined) {
    mockExhibitions[idx]["المندوب المسؤول"] = targetRep || "غير مسند";
  }
  
  saveExhibitionsLocal();
  res.json({ success: true, data: mockExhibitions[idx] });
});

app.delete("/api/exhibitions/:id", (req, res) => {
  const { id } = req.params;
  const idx = mockExhibitions.findIndex(ex => String(ex.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "المعرض غير موجود" });
  }
  mockExhibitions.splice(idx, 1);
  saveExhibitionsLocal();
  res.json({ success: true, message: "تم حذف المعرض بنجاح" });
});

app.get("/api/transfer-requests", (req, res) => {
  res.json(mockTransferRequests);
});

app.post("/api/transfer-requests", (req, res) => {
  const { companyId, companyName, fromRep, toRep, reason } = req.body;
  if (!companyId || !toRep) {
    return res.status(400).json({ error: "بيانات الطلب غير مكتملة" });
  }
  
  // فحص ما إذا كان هناك طلب معلق بالفعل لنفس الشركة لنفس المندوب لتجنب التكرار
  const existingPending = mockTransferRequests.find(r => 
    String(r.companyId) === String(companyId) && 
    String(r.toRep).trim() === String(toRep).trim() && 
    r.status === "pending"
  );
  if (existingPending) {
    return res.status(400).json({ error: "لقد قمت بتقديم طلب لنقل إسناد هذا العميل وهو قيد المراجعة حالياً من قبل الإدارة." });
  }

  const newReq = {
    id: "tr-" + Date.now(),
    companyId,
    companyName: companyName || "",
    fromRep: fromRep || "غير مسند",
    toRep,
    reason: reason || "",
    status: "pending",
    requestDate: new Date().toISOString()
  };
  mockTransferRequests.push(newReq);
  saveTransferRequestsLocal();
  res.json({ success: true, data: newReq });
});

app.patch("/api/transfer-requests/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // "approved" | "rejected"
  if (!status || !["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "الحالة غير صالحة" });
  }
  const idx = mockTransferRequests.findIndex(r => String(r.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  mockTransferRequests[idx].status = status;
  
  if (status === "approved") {
    const { companyId, toRep } = mockTransferRequests[idx];
    
    // تحديث الشركة محلياً
    const companyIndex = mockCompanies.findIndex(c => String(c.id) === String(companyId));
    if (companyIndex !== -1) {
      mockCompanies[companyIndex]["مسؤول المبيعات"] = toRep;
      saveCompaniesLocal();
      console.log(`Updated company ${companyId} owner to ${toRep} via approved transfer request`);
    } else {
      // محاولة التحديث في Baserow إذا كان مفعلاً
      const cfg = getBaserowConfig();
      if (cfg.isConfigured) {
        try {
          const updateUrl = `https://api.baserow.io/api/database/rows/table/${cfg.tableCompanies}/${companyId}/?user_field_names=true`;
          await fetch(updateUrl, {
            method: "PATCH",
            headers: getBaserowHeaders(cfg.token),
            body: JSON.stringify({ "مسؤول المبيعات": toRep })
          });
          console.log(`Updated Baserow company ${companyId} owner to ${toRep}`);
        } catch (err: any) {
          console.error("Failed to update company owner in Baserow:", err.message);
        }
      }
    }
  }
  
  saveTransferRequestsLocal();
  res.json({ success: true, data: mockTransferRequests[idx] });
});

app.get("/api/exhibition-requests", (req, res) => {
  res.json(mockExhibitionRequests);
});

app.post("/api/exhibition-requests", (req, res) => {
  const { exhibitionId, exhibitionName, repName, notes } = req.body;
  if (!exhibitionId || !repName) {
    return res.status(400).json({ error: "بيانات الطلب غير مكتملة" });
  }
  
  // تجنب تكرار الطلبات المعلقة
  const existingPending = mockExhibitionRequests.find(r => 
    String(r.exhibitionId) === String(exhibitionId) && 
    String(r.repName).trim() === String(repName).trim() && 
    r.status === "pending"
  );
  if (existingPending) {
    return res.status(400).json({ error: "لقد قمت بتقديم طلب مسبق لربط هذا المعرض وهو قيد الدراسة من الإدارة." });
  }

  const newReq = {
    id: "er-" + Date.now(),
    exhibitionId,
    exhibitionName: exhibitionName || "",
    repName,
    notes: notes || "",
    status: "pending",
    requestDate: new Date().toISOString()
  };
  mockExhibitionRequests.push(newReq);
  saveExhibitionRequestsLocal();
  res.json({ success: true, data: newReq });
});

app.patch("/api/exhibition-requests/:id", (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // "approved" | "rejected"
  if (!status || !["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "الحالة غير صالحة" });
  }
  const idx = mockExhibitionRequests.findIndex(r => String(r.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  mockExhibitionRequests[idx].status = status;
  
  if (status === "approved") {
    const { exhibitionId, repName } = mockExhibitionRequests[idx];
    const exIdx = mockExhibitions.findIndex(ex => String(ex.id) === String(exhibitionId));
    if (exIdx !== -1) {
      mockExhibitions[exIdx]["المندوب المسؤول"] = repName;
      saveExhibitionsLocal();
    }
  }
  
  saveExhibitionRequestsLocal();
  res.json({ success: true, data: mockExhibitionRequests[idx] });
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
      "المصدر": c["المصدر"] || "يدوي / إكسل",
      "المعرض": c["المعرض"] || "",
      "المعارض": Array.isArray(c["المعارض"]) ? c["المعارض"].slice(0, 10) : (c["المعرض"] ? [c["المعرض"]] : [])
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
          id: duplicate.id || duplicate["id"],
          "كود الشركة": duplicate["كود الشركة"] || "غير متوفر",
          "اسم الشركة": duplicate["اسم الشركة"] || "غير معروف",
          "مسؤول المبيعات": duplicate["مسؤول المبيعات"] || "غير محدد",
          "الحالة": duplicate["الحالة"] || "جديد",
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
      "مسؤول المبيعات": مسؤول_المبيعات || المندوب || mockCompanies[companyIndex]["مسؤول المبيعات"],
      "المعرض": req.body["المعرض"] !== undefined ? req.body["المعرض"] : mockCompanies[companyIndex]["المعرض"],
      "المعارض": req.body["المعارض"] !== undefined ? req.body["المعارض"] : mockCompanies[companyIndex]["المعارض"]
    };

    // إنشاء سجل متابعة جديد
    const newFollowupId = mockFollowups.length + 1;
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
    if (req.body["المعرض"] !== undefined) {
      companyPayload["المعرض"] = req.body["المعرض"];
    }
    if (req.body["المعارض"] !== undefined) {
      companyPayload["المعارض"] = req.body["المعارض"];
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
app.delete("/api/companies/:id", async (req, res) => {
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
app.patch("/api/employees/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, department } = req.body;
  const cfg = getBaserowConfig();

  const reqName = name || req.body["الاسم"];
  const reqEmail = email || req.body["البريد الإلكتروني"];
  const reqPhone = phone !== undefined ? phone : req.body["الجوال"];
  const reqDept = department !== undefined ? department : req.body["القسم"];
  const reqUsername = req.body["اسم المستخدم"];
  const reqPassword = req.body["كلمة المرور"];

  if (!cfg.isConfigured || !cfg.tableEmployees) {
    const targetId = Number(id) || id;
    const empIdx = mockEmployeesList.findIndex(e => e.id === targetId || String(e.id) === String(id));
    if (empIdx !== -1) {
      if (reqName) mockEmployeesList[empIdx]["الاسم"] = reqName;
      if (reqEmail) mockEmployeesList[empIdx]["البريد الإلكتروني"] = serverFormatEmail(reqEmail);
      if (reqPhone !== undefined) mockEmployeesList[empIdx]["الجوال"] = serverFormatPhone(reqPhone);
      if (reqDept !== undefined) mockEmployeesList[empIdx]["القسم"] = reqDept;
      if (reqUsername) mockEmployeesList[empIdx]["اسم المستخدم"] = reqUsername;
      if (reqPassword) mockEmployeesList[empIdx]["كلمة المرور"] = reqPassword;

      const finalEmp = mockEmployeesList[empIdx];
      const dbId = cfg.databaseId || "config_needed";
      const tblEmp = cfg.tableEmployees || "config_needed";
      const msgText = `📢 *إشعار CRM - تحديث بيانات المندوب*

👤 *الاسم الكامل:* ${finalEmp["الاسم"]}
📧 *البريد الإلكتروني:* ${finalEmp["البريد الإلكتروني"]}
📞 *رقم الجوال:* ${finalEmp["الجوال"] || 'غير رئيسي / غير متوفر'}
💼 *القسم الإداري:* ${finalEmp["القسم"] || 'المبيعات'}
👤 *اسم المستخدم:* ${finalEmp["اسم المستخدم"] || 'غير معين'}
🔄 *الإجراء:* تم تحديث وتعديل بيانات المندوب وحفظها محلياً بنجاح في المنظومة.

🔗 *رابط المندوب المباشر في جدول Baserow:*
https://baserow.io/database/${dbId}/table/${tblEmp}?grid-search=${encodeURIComponent(finalEmp["الاسم"])}`;

      const whatsappUrl = `https://api.whatsapp.com/send?phone=966551016181&text=${encodeURIComponent(msgText)}`;

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
    if (reqUsername) bodyPayload["اسم المستخدم"] = reqUsername;
    if (reqPassword) bodyPayload["كلمة المرور"] = reqPassword;

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

    const whatsappUrl = `https://api.whatsapp.com/send?phone=966551016181&text=${encodeURIComponent(msgText)}`;

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


// ==========================================
// 1.6. روابط دردشة المتابعة لكل عميل مع المندوب
// ==========================================

// جلب رسائل الدردشة الخاصة بالعميل ومتابعته
app.get("/api/companies/:id/chat", (req, res) => {
  const companyId = req.params.id;
  const filtered = mockChats.filter(
    (c) => String(c.companyId) === String(companyId)
  );
  return res.json(filtered);
});

// إرسال رسالة دردشة ومتابعة جديدة للعميل وتحديث حالته تلقائياً (تعميد أو رفض)
app.post("/api/companies/:id/chat", (req, res) => {
  const companyId = req.params.id;
  const { sender, message, statusUpdate, rejectionReason } = req.body;

  if (!sender || !message) {
    return res.status(400).json({ error: "اسم المرسل ومحتوى الرسالة حقول إجبارية" });
  }

  const newMessage = {
    id: `chat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    companyId: isNaN(Number(companyId)) ? companyId : Number(companyId),
    sender,
    message,
    statusUpdate,
    rejectionReason,
    timestamp: new Date().toISOString()
  };

  mockChats.push(newMessage);
  saveChatsLocal();

  // إذا كانت الرسالة تتضمن تحديثاً لحالة العميل (تعميد أو رفض)
  if (statusUpdate) {
    const comIdNum = isNaN(Number(companyId)) ? companyId : Number(companyId);
    const companyIndex = mockCompanies.findIndex((c) => c.id === comIdNum || String(c.id) === String(companyId));
    if (companyIndex !== -1) {
      if (statusUpdate === "تم التعميد") {
        mockCompanies[companyIndex]["الحالة"] = "تم التعميد";
        mockCompanies[companyIndex]["آخر تواصل"] = new Date().toISOString().split("T")[0];
        
        // أيضاً إنشاء سجل متابعة رسمي
        const newFollowup = {
          id: mockFollowups.length + 1,
          "الشركة المرتبطة": comIdNum,
          "الموظف المرتبط": sender,
          "تاريخ المتابعة": new Date().toISOString().split("T")[0],
          "الحالة": "تم التعميد",
          "الملاحظات": "تم تعميد العميل وإغلاق حالته بنجاح عبر لوحة دردشة المتابعة المباشرة.",
          "المصدر": "دردشة المتابعة"
        };
        mockFollowups.push(newFollowup);
        saveFollowupsLocal();

      } else if (statusUpdate === "مرفوض") {
        mockCompanies[companyIndex]["الحالة"] = "مرفوض";
        mockCompanies[companyIndex]["سبب الرفض"] = rejectionReason || "لم يذكر السبب";
        mockCompanies[companyIndex]["آخر تواصل"] = new Date().toISOString().split("T")[0];
        
        // أيضاً إنشاء سجل متابعة رسمي
        const newFollowup = {
          id: mockFollowups.length + 1,
          "الشركة المرتبطة": comIdNum,
          "الموظف المرتبط": sender,
          "تاريخ المتابعة": new Date().toISOString().split("T")[0],
          "الحالة": "مرفوض",
          "الملاحظات": `تم رفض العميل وإغلاق حالته لسبب: ${rejectionReason || "لم يذكر السبب"} عبر لوحة دردشة المتابعة.`,
          "المصدر": "دردشة المتابعة"
        };
        mockFollowups.push(newFollowup);
        saveFollowupsLocal();
      }
      saveCompaniesLocal();
    }
  }

  return res.json({ success: true, message: newMessage });
});


// ------------------------------------------------------------------------
// روابط دردشة زملاء العمل المشتركة ومناقشة الحالات وتبادل العملاء
// ------------------------------------------------------------------------

// جلب كافة رسائل دردشة زملاء العمل
app.get("/api/workspace-chats", (req, res) => {
  return res.json(mockWorkspaceChats);
});

// إرسال رسالة دردشة جديدة لزملاء العمل
app.post("/api/workspace-chats", (req, res) => {
  const { sender, message, type, companyName } = req.body;

  if (!sender || !message) {
    return res.status(400).json({ error: "الرجاء إدخال اسم المرسل ومحتوى الرسالة ⚠️" });
  }

  const newMessage = {
    id: `wmsg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sender,
    message,
    type: type || "general",
    companyName: companyName || "",
    timestamp: new Date().toISOString()
  };

  mockWorkspaceChats.push(newMessage);
  saveWorkspaceChatsLocal();

  return res.json({ success: true, data: newMessage });
});


// دمج Vite Middleware في وضع التطوير
const startServer = async () => {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`خادم ExpoTime CRM متصل ويعمل على: http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("خطأ فادح أثناء تشغيل الخادم:", err);
});
