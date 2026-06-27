/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * توليد مستند عرض السعر الرسمي كـ PDF في المتصفح (يدعم العربية RTL بشكل مثالي
 * عبر تحويل DOM مُنسّق إلى PDF). يُستخدم للتنزيل وللإرسال كمرفق بالبريد.
 */
import html2pdf from "html2pdf.js";
import { getSafeString } from "./helpers";

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export interface QuoteTotals {
  items: any[];
  subtotal: number;
  vat: number;
  grand: number;
}

export function buildQuoteTotals(q: any): QuoteTotals {
  const items =
    Array.isArray(q.items) && q.items.length > 0
      ? q.items
      : [
          {
            description: q["تفاصيل الخدمة / المعرض"] || "تصميم وتنفيذ جناح عرض",
            qty: 1,
            price: Number(q["مبلغ العرض"]) || 0,
            total: Number(q["مبلغ العرض"]) || 0,
          },
        ];
  const subtotal = items.reduce(
    (acc: number, it: any) => acc + (Number(it.qty) || 1) * (Number(it.price) || 0),
    0
  );
  const vat = subtotal * 0.15;
  return { items, subtotal, vat, grand: subtotal + vat };
}

/** بناء عنصر DOM بتنسيقات مضمّنة (inline) للمستند الرسمي. */
function buildQuoteElement(q: any, company: any, salesperson?: string): HTMLElement {
  const { items, subtotal, vat, grand } = buildQuoteTotals(q);
  const clientName = getSafeString(company["اسم الشركة"]);
  const clientPhone = getSafeString(company["الجوال الرئيسي"] || company["جوال"]);
  const clientEmail = getSafeString(company["البريد الإلكتروني"] || company["بريد"]);
  const exhibition = q["المعرض"] || company["المعرض"] || "—";
  const rep = salesperson || "مبيعات إكسبو تايم";
  const taxNo = q["الرقم الضريبي"] || company["الرقم الضريبي"] || "";
  const crNo = q["السجل التجاري"] || company["السجل التجاري"] || "";

  const rows = items
    .map(
      (it: any, i: number) => `
      <tr>
        <td style="border:1px solid #e2e8f0;padding:8px;text-align:center">${i + 1}</td>
        <td style="border:1px solid #e2e8f0;padding:8px">${getSafeString(it.description)}</td>
        <td style="border:1px solid #e2e8f0;padding:8px;text-align:center">${Number(it.qty) || 1}</td>
        <td style="border:1px solid #e2e8f0;padding:8px;text-align:center">${fmt(Number(it.price) || 0)}</td>
        <td style="border:1px solid #e2e8f0;padding:8px;text-align:center">${fmt((Number(it.qty) || 1) * (Number(it.price) || 0))}</td>
      </tr>`
    )
    .join("");

  const el = document.createElement("div");
  el.setAttribute("dir", "rtl");
  el.style.cssText =
    "width:794px;padding:36px;background:#fff;color:#1e293b;font-family:Tahoma,Arial,sans-serif;box-sizing:border-box;";
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:20px">
      <div>
        <div style="font-size:26px;font-weight:800;color:#2563eb">ExpoTime <span style="color:#0f172a">إكسبو تايم</span></div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">لتصميم وتنفيذ أجنحة المعارض والمؤتمرات والديكورات الفاخرة</div>
      </div>
      <div style="text-align:left">
        <div style="font-size:20px;font-weight:800;color:#0f172a">عرض سعر رسمي</div>
        <div style="font-size:12px;color:#475569;margin-top:6px;line-height:1.9">
          رقم العرض: <b>${getSafeString(q["رقم العرض"]) || q.id}</b><br/>
          تاريخ العرض: ${getSafeString(q["تاريخ العرض"]) || "—"}<br/>
          صالح حتى: ${getSafeString(q["تاريخ التحديث"]) || "15 يوماً من تاريخه"}
        </div>
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:18px">
      <h3 style="margin:0 0 8px;font-size:13px;color:#2563eb">بيانات العميل</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px 28px;font-size:13px">
        <div style="min-width:220px">الشركة: <b>${clientName || "—"}</b></div>
        <div style="min-width:180px">الجوال: ${clientPhone || "—"}</div>
        <div style="min-width:220px">البريد: ${clientEmail || "—"}</div>
        <div style="min-width:180px">المعرض: ${exhibition}</div>
        ${taxNo ? `<div style="min-width:220px">الرقم الضريبي: ${taxNo}</div>` : ""}
        ${crNo ? `<div style="min-width:180px">السجل التجاري: ${crNo}</div>` : ""}
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:6px">
      <thead>
        <tr style="background:#2563eb;color:#fff">
          <th style="padding:9px">#</th><th style="padding:9px;text-align:right">الوصف / البند</th>
          <th style="padding:9px">الكمية</th><th style="padding:9px">السعر (ر.س)</th><th style="padding:9px">الإجمالي (ر.س)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table style="width:300px;margin-right:auto;font-size:13px;margin-top:8px">
      <tr><td style="padding:5px">المجموع قبل الضريبة:</td><td style="padding:5px;text-align:left">${fmt(subtotal)} ر.س</td></tr>
      <tr><td style="padding:5px">ضريبة القيمة المضافة (15%):</td><td style="padding:5px;text-align:left">${fmt(vat)} ر.س</td></tr>
      <tr><td style="padding:8px 5px;font-weight:800;font-size:15px;border-top:2px solid #2563eb">الإجمالي شامل الضريبة:</td><td style="padding:8px 5px;font-weight:800;font-size:15px;border-top:2px solid #2563eb;text-align:left">${fmt(grand)} ر.س</td></tr>
    </table>

    <div style="font-size:11.5px;color:#475569;line-height:1.9;margin-top:18px">
      <b>الشروط والأحكام:</b><br/>
      • هذا العرض صالح لمدة 15 يوماً من تاريخ إصداره.<br/>
      • تُدفع 50% دفعة مقدمة عند اعتماد العرض والباقي قبل التسليم.<br/>
      • تشمل الأسعار التصميم والتنفيذ والتركيب داخل أرض المعرض.<br/>
      • يُعتمد العرض رسمياً بتوقيع العميل أدناه ويصبح ملزماً للطرفين.
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:54px;gap:40px">
      <div style="flex:1;text-align:center;font-size:12px;color:#334155"><b>اعتماد وتوقيع العميل</b><div style="margin-top:46px;border-top:1px dashed #94a3b8;padding-top:6px">الاسم / التوقيع / التاريخ</div></div>
      <div style="flex:1;text-align:center;font-size:12px;color:#334155"><b>عن إكسبو تايم (${rep})</b><div style="margin-top:46px;border-top:1px dashed #94a3b8;padding-top:6px">التوقيع والختم</div></div>
    </div>

    <div style="margin-top:28px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">إكسبو تايم ExpoTime · عرض سعر رسمي مُولّد إلكترونياً</div>
  `;
  return el;
}

function pdfOptions(filename: string) {
  return {
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };
}

async function withOffscreen<T>(el: HTMLElement, fn: () => Promise<T>): Promise<T> {
  el.style.position = "fixed";
  el.style.left = "-10000px";
  el.style.top = "0";
  document.body.appendChild(el);
  try {
    return await fn();
  } finally {
    document.body.removeChild(el);
  }
}

export function quoteFileName(q: any): string {
  return `عرض-سعر-${getSafeString(q["رقم العرض"]) || q.id}.pdf`;
}

/** تنزيل عرض السعر كملف PDF. */
export async function downloadQuotePdf(q: any, company: any, salesperson?: string): Promise<void> {
  const el = buildQuoteElement(q, company, salesperson);
  const filename = quoteFileName(q);
  await withOffscreen(el, async () => {
    await html2pdf().set(pdfOptions(filename)).from(el).save();
  });
}

/** توليد عرض السعر كـ PDF وإرجاعه Base64 (بدون بادئة) لإرساله كمرفق. */
export async function getQuotePdfBase64(q: any, company: any, salesperson?: string): Promise<string> {
  const el = buildQuoteElement(q, company, salesperson);
  const filename = quoteFileName(q);
  return withOffscreen(el, async () => {
    const dataUri: string = await html2pdf().set(pdfOptions(filename)).from(el).outputPdf("datauristring");
    const idx = dataUri.indexOf("base64,");
    return idx >= 0 ? dataUri.slice(idx + "base64,".length) : dataUri;
  });
}
