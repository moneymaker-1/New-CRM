/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * وحدة إرسال البريد الإلكتروني — تدعم مزوّدات متعددة عبر متغيرات البيئة:
 *   1) Resend (HTTP API)  — اضبط RESEND_API_KEY  (الأسهل، يعمل خلف الجدران النارية)
 *   2) SMTP (nodemailer)  — اضبط SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (مجاني عبر Brevo/Gmail)
 * عند عدم ضبط أي مزوّد يتم تسجيل الرسالة فقط (محاكاة) دون فشل.
 */
import nodemailer from "nodemailer";

export interface MailAttachment {
  filename: string;
  contentBase64: string; // المحتوى مُرمّز Base64 (بدون بادئة data:)
  contentType?: string;
}
export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}
export interface MailResult {
  ok: boolean;
  simulated?: boolean;
  id?: string;
  error?: string;
}

const MAIL_FROM = process.env.MAIL_FROM || "ExpoTime <no-reply@expo-time.co>";

export function getMailProvider(): "resend" | "smtp" | "none" {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return "none";
}

/** تنظيف base64 من بادئة data: إن وُجدت */
function stripDataPrefix(b64: string): string {
  if (!b64) return "";
  const idx = b64.indexOf("base64,");
  return idx >= 0 ? b64.slice(idx + "base64,".length) : b64;
}

export async function sendEmail(input: MailInput): Promise<MailResult> {
  const provider = getMailProvider();
  const attachments = (input.attachments || []).map((a) => ({
    ...a,
    contentBase64: stripDataPrefix(a.contentBase64),
  }));

  if (provider === "none") {
    console.log(
      `[EMAIL SIMULATED] إلى: ${input.to} | الموضوع: "${input.subject}" | مرفقات: ${attachments.length}`
    );
    return { ok: true, simulated: true };
  }

  try {
    if (provider === "resend") {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: MAIL_FROM,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.contentBase64,
          })),
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Resend ${resp.status}: ${t}`);
      }
      const data: any = await resp.json();
      return { ok: true, id: data?.id };
    }

    // SMTP عبر nodemailer
    const port = Number(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: String(process.env.SMTP_SECURE) === "true" || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, "base64"),
        contentType: a.contentType || "application/pdf",
      })),
    });
    return { ok: true, id: info.messageId };
  } catch (e: any) {
    console.error("🔴 فشل إرسال البريد:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
