/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * دوال مساعدة نقية (بدون حالة) لتنسيق القيم وأرقام الجوال والبريد.
 */

/** استخراج نص آمن من قيمة قد تكون كائناً أو مصفوفة (حقول Baserow/Sheets). */
export function getSafeString(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    if (val.length === 0) return "";
    return getSafeString(val[0]);
  }
  if (typeof val === "object") {
    if (val.value !== undefined) return getSafeString(val.value);
    if (val.name !== undefined) return getSafeString(val.name);
    if (val.id !== undefined) return getSafeString(val.id);
    return "";
  }
  return String(val);
}

/** تطبيع رقم الجوال السعودي وتحويل الأرقام العربية. */
export function formatPhone(ph: string): string {
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

/** تطبيع البريد الإلكتروني. */
export function formatEmail(em: string): string {
  if (!em) return "";
  return em.trim().toLowerCase();
}

/** تحويل رقم الجوال إلى الصيغة الدولية المناسبة لروابط واتساب. */
export function cleanPhoneForWhatsApp(ph: string): string {
  if (!ph) return "";
  let clean = ph.trim();
  clean = clean.replace(/[\s\-\(\)\+]+/g, "");
  if (clean.startsWith("05") && clean.length === 10) {
    clean = "966" + clean.substring(1);
  } else if (clean.startsWith("5") && clean.length === 9) {
    clean = "966" + clean;
  }
  return clean;
}
