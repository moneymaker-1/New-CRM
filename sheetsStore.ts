/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * طبقة الوصول إلى بيانات Google Sheets عبر حساب خدمة (Service Account).
 * توفّر هذه الوحدة قراءة/كتابة الجداول (Tabs) في ملف Google Sheet واحد
 * لتُستخدم كقاعدة بيانات رئيسية للنظام، مع رجوع آمن للملفات المحلية عند
 * عدم توفّر بيانات الاعتماد.
 */

import { google, sheets_v4 } from "googleapis";

// معرّف ملف Google Sheet (يُقرأ من البيئة، مع قيمة افتراضية لشيت العميل)
const SHEET_ID =
  process.env.GOOGLE_SHEET_ID ||
  "1051_4gL-dAPark13F4c7fH3WIIQd-N0fZxonlbR9CTk";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

let sheetsClient: sheets_v4.Sheets | null = null;
let enabled = false;
let initError = "";

/**
 * تحميل بيانات اعتماد حساب الخدمة من البيئة.
 * يدعم طريقتين:
 *  1) GOOGLE_SERVICE_ACCOUNT_JSON: محتوى ملف المفتاح كنص JSON مباشرة.
 *  2) GOOGLE_SERVICE_ACCOUNT_FILE / GOOGLE_APPLICATION_CREDENTIALS: مسار ملف المفتاح.
 */
function loadCredentials(): { client_email: string; private_key: string } | null {
  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inlineJson && inlineJson.trim()) {
    try {
      const parsed = JSON.parse(inlineJson);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
        };
      }
    } catch {
      initError = "تعذّر تحليل GOOGLE_SERVICE_ACCOUNT_JSON كـ JSON صالح.";
    }
  }

  // المسار البديل: قراءة ملف المفتاح من القرص
  const filePath =
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath && filePath.trim()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("fs");
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
        };
      }
    } catch {
      initError = `تعذّر قراءة ملف حساب الخدمة من المسار: ${filePath}`;
    }
  }

  return null;
}

/** تهيئة عميل Google Sheets. تُستدعى مرة واحدة عند الإقلاع. */
export async function initSheets(): Promise<boolean> {
  const creds = loadCredentials();
  if (!creds) {
    enabled = false;
    return false;
  }

  try {
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: SCOPES,
    });
    await auth.authorize();
    sheetsClient = google.sheets({ version: "v4", auth });
    enabled = true;
    console.log(
      `🟢 تم الاتصال بـ Google Sheets بنجاح (الحساب: ${creds.client_email}).`
    );
    return true;
  } catch (e: any) {
    enabled = false;
    initError = e?.message || String(e);
    console.error("🔴 فشل الاتصال بـ Google Sheets:", initError);
    return false;
  }
}

export function isSheetsEnabled(): boolean {
  return enabled && !!sheetsClient;
}

export function getSheetInfo() {
  return { enabled: isSheetsEnabled(), sheetId: SHEET_ID, initError };
}

/* ----------------------------- (de)serialization ----------------------------- */

/** تحويل قيمة حقل إلى نص صالح للتخزين في خلية. */
function serializeCell(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

/**
 * تحويل نص الخلية إلى قيمة. نحافظ على الأرقام كنصوص (لتجنّب فقدان الأصفار
 * البادئة في أرقام الجوال)، ونحاول فك JSON فقط للكائنات/المصفوفات.
 */
function deserializeCell(raw: string): any {
  if (raw === undefined || raw === null || raw === "") return "";
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

/* ------------------------------- tab utilities ------------------------------- */

/** التأكد من وجود التبويب (Tab) المطلوب وإنشاؤه إن لم يكن موجوداً. */
async function ensureTab(tabName: string): Promise<void> {
  if (!sheetsClient) throw new Error("Sheets client غير مهيأ.");
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = (meta.data.sheets || []).some(
    (s) => s.properties?.title === tabName
  );
  if (!exists) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
  }
}

/**
 * قراءة تبويب وإرجاعه كمصفوفة كائنات. الصف الأول يُعتبر رؤوس الأعمدة.
 * يُرجع null عند الفشل ليتمكّن المستدعي من الرجوع للتخزين المحلي.
 */
export async function loadTable(tabName: string): Promise<any[] | null> {
  if (!isSheetsEnabled() || !sheetsClient) return null;
  try {
    const resp = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tabName}`,
    });
    const values = resp.data.values || [];
    if (values.length < 1) return [];
    const headers = (values[0] || []).map((h) => String(h));
    const rows: any[] = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i] || [];
      // تجاهل الصفوف الفارغة تماماً
      if (row.every((c) => c === "" || c === undefined || c === null)) continue;
      const obj: any = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        obj[h] = deserializeCell(row[idx]);
      });
      rows.push(obj);
    }
    return rows;
  } catch (e: any) {
    console.error(
      `🔴 فشل قراءة التبويب "${tabName}" من Google Sheets:`,
      e?.message || e
    );
    return null;
  }
}

/**
 * كتابة مصفوفة كائنات إلى تبويب (استبدال كامل للمحتوى).
 * تُجمع الأعمدة من اتحاد مفاتيح كل الصفوف مع إعطاء أولوية للأعمدة المهمة.
 */
export async function saveTable(
  tabName: string,
  rows: any[],
  preferredHeaders: string[] = []
): Promise<boolean> {
  if (!isSheetsEnabled() || !sheetsClient) return false;
  try {
    await ensureTab(tabName);

    // بناء قائمة الأعمدة
    const headerSet = new Set<string>(preferredHeaders);
    for (const r of rows) {
      Object.keys(r || {}).forEach((k) => headerSet.add(k));
    }
    const headers = Array.from(headerSet);

    const matrix: string[][] = [headers];
    for (const r of rows) {
      matrix.push(headers.map((h) => serializeCell(r ? r[h] : "")));
    }

    // مسح التبويب ثم كتابة البيانات الجديدة (لإزالة الصفوف القديمة الزائدة)
    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${tabName}`,
    });
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: matrix },
    });
    return true;
  } catch (e: any) {
    console.error(
      `🔴 فشل كتابة التبويب "${tabName}" إلى Google Sheets:`,
      e?.message || e
    );
    return false;
  }
}

/* ------------------------------ debounced flush ------------------------------ */

const pendingTimers: { [tab: string]: NodeJS.Timeout } = {};
const FLUSH_DELAY_MS = 1500;

/**
 * جدولة كتابة مؤجّلة (debounced) لتفادي إرهاق واجهة Google Sheets API عند
 * تعدّد التعديلات المتتالية. آخر استدعاء خلال نافذة التأجيل هو الذي يُكتب.
 */
export function scheduleSave(
  tabName: string,
  getRows: () => any[],
  preferredHeaders: string[] = []
): void {
  if (!isSheetsEnabled()) return;
  if (pendingTimers[tabName]) clearTimeout(pendingTimers[tabName]);
  pendingTimers[tabName] = setTimeout(() => {
    delete pendingTimers[tabName];
    void saveTable(tabName, getRows() || [], preferredHeaders);
  }, FLUSH_DELAY_MS);
}

/** أسماء التبويبات الموحّدة للنظام. */
export const TABS = {
  companies: "Companies",
  employees: "Employees",
  quotations: "Quotations",
  followups: "Followups",
  settings: "Settings",
} as const;
