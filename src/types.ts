/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Company {
  id: number | string;
  "كود الشركة": string;
  "اسم الشركة": string;
  "النشاط"?: string;
  "المدينة"?: string;
  "الجوال الرئيسي": string;
  "البريد الإلكتروني": string;
  "الحالة": string;
  "مسؤول المبيعات": string;
  "الأولوية": string;
  "آخر تواصل": string;
  "المصدر"?: string;
  "ملاحظات"?: string;
  "المعرض"?: string;
  "المعارض"?: string[];
}

export interface Employee {
  id: string | number;
  "الاسم": string;
  "القسم"?: string;
  "الجوال"?: string;
  "البريد الإلكتروني"?: string;
}

export interface Followup {
  id: number | string;
  "الشركة المرتبطة": any;
  "الموظف المرتبط": string;
  "تاريخ المتابعة": string;
  "الحالة": string;
  "الملاحظات": string;
  "المصدر": string;
}

export interface ConfigResponse {
  isMockEnabled: boolean;
  configuredTables: {
    companies: boolean;
    employees: boolean;
    followups: boolean;
  };
  message: string;
}

export const ALLOWED_STATUSES = [
  "جديد",
  "تم التواصل",
  "تم إرسال البروفايل",
  "تم طلب التصميم",
  "تم إرسال العرض",
  "تفاوض",
  "تم التعميد",
  "تم التنفيذ",
  "غير مهتم"
];

export const ALLOWED_PRIORITIES = [
  "عالية",
  "متوسطة",
  "منخفضة"
];
