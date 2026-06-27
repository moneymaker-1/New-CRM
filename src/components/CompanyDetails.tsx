import React, { useState, useEffect } from "react";
import { 
  X, 
  Calendar, 
  Tag, 
  Clock, 
  MessageSquare, 
  TrendingUp, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Activity, 
  ShieldAlert, 
  Save, 
  Loader2,
  Users,
  FileText,
  CheckCircle2,
  Send,
  DollarSign,
  Plus,
  ExternalLink,
  FileSpreadsheet,
  Building,
  Percent,
  Printer,
  Share2,
  Trash2
} from "lucide-react";
import { motion } from "motion/react";
import { 
  Company, 
  Followup, 
  ALLOWED_STATUSES, 
  ALLOWED_PRIORITIES 
} from "../types";

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

interface CompanyDetailsProps {
  company: Company | null;
  onClose: () => void;
  onUpdate: (updatedFields: {
    الحالة: string;
    الأولوية: string;
    آخر_تواصل: string;
    ملاحظات: string;
    "اسم الشركة"?: string;
    "كود الشركة"?: string;
    "النشاط"?: string;
    "المدينة"?: string;
    "الجوال الرئيسي"?: string;
    "البريد الإلكتروني"?: string;
    "مسؤول المبيعات"?: string;
  }) => Promise<void>;
  salesperson: string;
  isManager?: boolean;
  employeesList?: any[];
}

export default function CompanyDetails({
  company,
  onClose,
  onUpdate,
  salesperson,
  isManager = false,
  employeesList = [],
}: CompanyDetailsProps) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [lastContact, setLastContact] = useState("");
  const [notes, setNotes] = useState("");
  
  // حالات الصلاحيات الإدارية الكاملة لتعديل كل الحقول
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [companyActivity, setCompanyActivity] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyRep, setCompanyRep] = useState("");

  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // حالات عروض الأسعار المالية (Quotations)
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [newQuotationAmount, setNewQuotationAmount] = useState("");
  const [newQuotationDetails, setNewQuotationDetails] = useState("");
  const [newQuotationExhibition, setNewQuotationExhibition] = useState("");
  const [submittingQuotation, setSubmittingQuotation] = useState(false);

  // حالات بنود عرض السعر الحالي أثناء الإنشاء
  const [quotationItems, setQuotationItems] = useState<{ id: number; description: string; qty: number; price: number; total: number }[]>([
    { id: 1, description: "", qty: 1, price: 0, total: 0 }
  ]);
  
  // حالة عرض تفاصيل السعر في المودال الرسمي للاستعراض والطباعة
  const [selectedPreviewQuote, setSelectedPreviewQuote] = useState<any | null>(null);
  const [isSendingClientEmail, setIsSendingClientEmail] = useState<string | null>(null);

  // حالات ملفات السندات الرسمية المرفقة للمحاسب
  const [taxNumberFile, setTaxNumberFile] = useState<{ name: string; content: string } | null>(null);
  const [crNumberFile, setCrNumberFile] = useState<{ name: string; content: string } | null>(null);
  const [nationalAddressFile, setNationalAddressFile] = useState<{ name: string; content: string } | null>(null);
  const [generatingNote, setGeneratingNote] = useState(false);

  // قائمة الحالات الديناميكية (قابلة للإضافة والتثبيت)
  const [statusesList, setStatusesList] = useState<string[]>(() => {
    const stored = localStorage.getItem("custom_statuses");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return Array.from(new Set([...ALLOWED_STATUSES, ...parsed]));
        }
      } catch (e) {}
    }
    return ALLOWED_STATUSES;
  });

  // مستندات التعميد القانونية للعميل المراد إرسالها للمحاسب
  const [tempTaxNumber, setTempTaxNumber] = useState("");
  const [tempNationalAddress, setTempNationalAddress] = useState("");
  const [tempCrNumber, setTempCrNumber] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState<string | null>(null);
  const [emailSuccessId, setEmailSuccessId] = useState<string | null>(null);
  const [accountingUploadStatus, setAccountingUploadStatus] = useState<string | null>(null);
  const [accountingUploadProgress, setAccountingUploadProgress] = useState<number>(0);

  // تحديث الحقول المحلية عند تغيير الشركة المحددة
  useEffect(() => {
    if (company) {
      setStatus(getSafeString(company["الحالة"]) || "جديد");
      setPriority(getSafeString(company["الأولوية"]) || "متوسطة");
      setLastContact(getSafeString(company["آخر تواصل"]) || "");
      setNotes(getSafeString(company["ملاحظات"]) || "");
      
      // تعبئة حقول الإدارة للمزامنة والتعديل الشامل
      setCompanyName(getSafeString(company["اسم الشركة"]) || "");
      setCompanyCode(getSafeString(company["كود الشركة"]) || "");
      setCompanyActivity(getSafeString(company["النشاط"]) || "");
      setCompanyCity(getSafeString(company["المدينة"]) || "الرياض");
      setCompanyPhone(getSafeString(company["الجوال الرئيسي"]) || "");
      setCompanyEmail(getSafeString(company["البريد الإلكتروني"]) || "");
      setCompanyRep(getSafeString(company["مسؤول المبيعات"]) || salesperson || "مؤيدة");

      setIsEditingAll(false);
      setError("");
      setSuccess(false);
      
      // جلب سجل المتابعات الخاص بالشركة
      fetchFollowups(company.id);
      fetchCompanyQuotations();
      
      // تهيئة حقول التعميد القانونية
      setTempTaxNumber(company["الرقم الضريبي"] || "");
      setTempNationalAddress(company["العنوان الوطني"] || "");
      setTempCrNumber(company["السجل التجاري"] || "");
      setEmailSuccessId(null);
    }
  }, [company]);

  const fetchCompanyQuotations = async () => {
    if (!company) return;
    setLoadingQuotations(true);
    try {
      const response = await fetch(`/api/quotations?companyId=${company.id}`);
      if (response.ok) {
        const data = await response.json();
        setQuotations(data);
      }
    } catch (err) {
      console.error("فشل جلب عروض الأسعار:", err);
    } finally {
      setLoadingQuotations(false);
    }
  };

  // المرفقات وملفات المستندات الرسمية للمحاسب
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: "tax" | "cr" | "address") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (fileType === "tax") {
        setTaxNumberFile({ name: file.name, content: result });
      } else if (fileType === "cr") {
        setCrNumberFile({ name: file.name, content: result });
      } else if (fileType === "address") {
        setNationalAddressFile({ name: file.name, content: result });
      }
    };
    reader.readAsDataURL(file);
  };

  // معالجة تغيير الحالة وتوليد ملاحظة ذكية من جيمناي فوراً
  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    if (!newStatus) return;

    setGeneratingNote(true);
    try {
      const response = await fetch("/api/ai/generate-followup-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: getSafeString(company["اسم الشركة"]),
          companyActivity: getSafeString(company["النشاط"] || company["نوع النشاط"]),
          exhibition: getSafeString(company["المعرض"] || ""),
          status: newStatus
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.note) {
          setNotes(data.note);
        }
      }
    } catch (e) {
      console.error("خطأ توليد ملاحظة ذكية من جيمناي:", e);
    } finally {
      setGeneratingNote(false);
    }
  };

  // إضافة حالة مخصصة ديناميكية من المستخدم وحفظها وتثبيتها
  const addNewCustomStatus = () => {
    const input = prompt("يرجى إدخال اسم حالة المتابعة المخصصة الجديدة:");
    if (!input || !input.trim()) return;

    const cleanStatus = input.trim();
    if (statusesList.includes(cleanStatus)) {
      alert("هذه الحالة موجودة بالفعل في القائمة.");
      setStatus(cleanStatus);
      return;
    }

    const updated = [...statusesList, cleanStatus];
    setStatusesList(updated);
    
    // حفظ الحالات المضافة في localStorage لتثبيتها كخيار افتراضي لاحقاً
    const stored = localStorage.getItem("custom_statuses");
    let customArray: string[] = [];
    if (stored) {
      try { customArray = JSON.parse(stored); } catch (e) {}
    }
    customArray.push(cleanStatus);
    localStorage.setItem("custom_statuses", JSON.stringify(Array.from(new Set(customArray))));

    setStatus(cleanStatus);
    handleStatusChange(cleanStatus);
    alert(`تمت إضافة وتثبيت الحالة الجديدة [ ${cleanStatus} ] بنجاح! 🎉`);
  };

  // دوال إدارة بنود عرض السعر الديناميكي
  const addQuotationItemLine = () => {
    setQuotationItems([
      ...quotationItems,
      { id: Date.now() + Math.random(), description: "", qty: 1, price: 0, total: 0 }
    ]);
  };

  const removeQuotationItemLine = (id: number) => {
    if (quotationItems.length === 1) {
      alert("يجب وجود بند واحد على الأقل في عرض السعر.");
      return;
    }
    setQuotationItems(quotationItems.filter(item => item.id !== id));
  };

  const updateQuotationItemLine = (id: number, field: string, value: any) => {
    setQuotationItems(
      quotationItems.map(item => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === "qty" || field === "price") {
            updated.total = (Number(updated.qty) || 0) * (Number(updated.price) || 0);
          }
          return updated;
        }
        return item;
      })
    );
  };

  const calculatedSubtotal = quotationItems.reduce((acc, item) => acc + (Number(item.qty) * Number(item.price) || 0), 0);
  const calculatedTax = calculatedSubtotal * 0.15;
  const calculatedGrandTotal = calculatedSubtotal * 1.15;

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;

    // التحقق من صحة بنود العرض
    const invalidItem = quotationItems.find(it => !it.description.trim() || Number(it.price) < 0);
    if (invalidItem) {
      alert("يرجى إدخال وصف صحيح وسعر أكبر من أو يساوي صفر لكافة البنود.");
      return;
    }

    setSubmittingQuotation(true);
    try {
      const response = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          companyName: getSafeString(company["اسم الشركة"]),
          amount: calculatedSubtotal, // مبلغ العرض الإجمالي قبل الضريبة
          details: quotationItems.map(it => `${it.description} (الكمية: ${it.qty})`).join(" | "),
          exhibition: newQuotationExhibition || company["المعرض"] || "",
          items: quotationItems.map(it => ({
            description: it.description,
            qty: Number(it.qty) || 1,
            price: Number(it.price) || 0,
            total: (Number(it.qty) || 1) * (Number(it.price) || 0)
          }))
        }),
      });
      if (response.ok) {
        setNewQuotationAmount("");
        setNewQuotationDetails("");
        setNewQuotationExhibition("");
        setQuotationItems([{ id: 1, description: "", qty: 1, price: 0, total: 0 }]);
        setShowQuotationForm(false);
        await fetchCompanyQuotations();
        alert("تم إنشاء وتسجيل عرض السعر الجديد للعميل بنجاح! 🟢");
      }
    } catch (err) {
      console.error("خطأ أثناء تسجيل عرض السعر:", err);
    } finally {
      setSubmittingQuotation(false);
    }
  };

  const handleSendClientQuotationEmail = async (q: any) => {
    setIsSendingClientEmail(q.id);
    try {
      const emailToUse = company["البريد الإلكتروني"] || company["بريد"] || "";
      if (!emailToUse) {
        const customEmail = prompt("بريد العميل غير مسجل في البيانات. يرجى إدخال البريد الإلكتروني للعميل لإرسال العرض:", "");
        if (!customEmail) {
          setIsSendingClientEmail(null);
          return;
        }
        company["البريد الإلكتروني"] = customEmail;
      }

      const response = await fetch("/api/quotations/send-client-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotationId: q.id,
          clientName: getSafeString(company["اسم الشركة"]),
          clientEmail: company["البريد الإلكتروني"] || company["بريد"] || emailToUse,
          items: q.items || [
            { description: q["تفاصيل الخدمة / المعرض"] || "تصميم وتنفيذ جناح عرض", qty: 1, price: q["مبلغ العرض"], total: q["مبلغ العرض"] }
          ],
          amount: q["مبلغ العرض"],
          exhibition: q["المعرض"] || company["المعرض"] || "",
          repName: salesperson || "مبيعات إكسبو تايم"
        }),
      });

      if (response.ok) {
        alert(`تم إرسال عرض السعر رقم (${q.id}) للعميل عبر البريد الإلكتروني بنجاح! ✉️`);
      } else {
        alert("فشل إرسال البريد الإلكتروني للعميل، يرجى المحاولة لاحقاً.");
      }
    } catch (err) {
      console.error("خطأ إرسال بريد العميل:", err);
      alert("حدث خطأ غير متوقع أثناء إرسال البريد.");
    } finally {
      setIsSendingClientEmail(null);
    }
  };

  const handleSendClientQuotationWhatsApp = (q: any) => {
    const rawPhone = getSafeString(company["الجوال الرئيسي"] || company["جوال"]);
    if (!rawPhone) {
      alert("رقم جوال العميل غير متوفر في السجلات.");
      return;
    }

    // تنظيف وتجهيز الرقم بصيغة دولية (مثل: 9665...)
    let cleanPhone = rawPhone.replace(/\D/g, "");
    if (cleanPhone.startsWith("05")) {
      cleanPhone = "966" + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith("5") && cleanPhone.length === 9) {
      cleanPhone = "966" + cleanPhone;
    } else if (!cleanPhone.startsWith("966") && cleanPhone.length === 9) {
      cleanPhone = "966" + cleanPhone;
    }

    const itemsStr = (q.items || [
      { description: q["تفاصيل الخدمة / المعرض"] || "تصميم وتنفيذ جناح عرض", qty: 1, price: q["مبلغ العرض"], total: q["مبلغ العرض"] }
    ]).map((it: any, idx: number) => `- ${it.description} (الكمية: ${it.qty} | السعر: ${it.price} ر.س)`).join("\n");

    const messageText = `السلام عليكم ورحمة الله وبركاته،
أ. ${getSafeString(company["اسم الشركة"])}،

يسعدنا في إكسبو تايم لتنظيم المعارض والمؤتمرات تزويدكم بعرض السعر المالي لـ: ${q["المعرض"] || company["المعرض"] || "مشاركتكم الموقرة"}.

رقم العرض: ${q["رقم العرض"]}
التاريخ: ${q["تاريخ العرض"]}

البنود المشمولة بالعرض:
${itemsStr}

المجموع قبل الضريبة: ${q["مبلغ العرض"]} ر.س
ضريبة القيمة المضافة (15%): ${(Number(q["مبلغ العرض"]) * 0.15).toFixed(2)} ر.س
الإجمالي شامل الضريبة: ${(Number(q["مبلغ العرض"]) * 1.15).toFixed(2)} ر.س

نتطلع للتعاون المثمر معكم لتقديم جناح عرض متميز واستثنائي بالمعرض.

تحياتنا،
مبيعات إكسبو تايم (ExpoTime) 🌟`;

    const encodedText = encodeURIComponent(messageText);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
    window.open(whatsappUrl, "_blank");
  };

  const handleUpdateQuotationStatus = async (qId: string, nextStatus: string) => {
    try {
      const payload: any = { status: nextStatus };
      if (nextStatus === "تم التعميد") {
        payload.taxNumber = tempTaxNumber;
        payload.nationalAddress = tempNationalAddress;
        payload.crNumber = tempCrNumber;
      }
      const response = await fetch(`/api/quotations/${qId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        await fetchCompanyQuotations();
        if (nextStatus === "تم التعميد") {
          setStatus("تم التعميد");
        }
        alert("تم تحديث حالة عرض السعر بنجاح! 🟢");
      }
    } catch (err) {
      console.error("فشل تحديث عرض السعر:", err);
    }
  };

  const handleSendAccountingEmail = async (q: any) => {
    setIsSendingEmail(q.id);
    setAccountingUploadProgress(10);
    setAccountingUploadStatus("جاري تحضير وترميز ملفات التعميد والمستندات القانونية المرفقة... 📁");
    try {
      await new Promise(resolve => setTimeout(resolve, 600));
      setAccountingUploadProgress(35);
      setAccountingUploadStatus("جاري رفع السندات القانونية والمرفقات الثبوتية لخادم النظام الآمن... 📤");

      // 1. تسجيل الطلب كبند مطلوب من المحاسب اتخاذ إجراء عليه وإرفاق الملفات والمستندات
      const response = await fetch("/api/accounting-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          companyName: getSafeString(company["اسم الشركة"]),
          quotationId: q.id,
          amount: q["مبلغ العرض"],
          details: q["تفاصيل الخدمة / المعرض"] || "تصميم وتنفيذ جناح معرض",
          exhibition: q["المعرض"] || company["المعرض"] || "",
          repName: salesperson || "مبيعات إكسبو تايم",
          taxNumber: tempTaxNumber || q["الرقم الضريبي"] || "",
          nationalAddress: tempNationalAddress || q["العنوان الوطني"] || "",
          crNumber: tempCrNumber || q["السجل التجاري"] || "",
          taxNumberFileName: taxNumberFile?.name || "",
          taxNumberFileContent: taxNumberFile?.content || "",
          nationalAddressFileName: nationalAddressFile?.name || "",
          nationalAddressFileContent: nationalAddressFile?.content || "",
          crNumberFileName: crNumberFile?.name || "",
          crNumberFileContent: crNumberFile?.content || ""
        })
      });

      if (response.ok) {
        setAccountingUploadProgress(70);
        setAccountingUploadStatus("تم الرفع بنجاح! جاري إعداد وإرسال البريد الإلكتروني المباشر للمحاسب... 📧");
        await new Promise(resolve => setTimeout(resolve, 600));

        // 2. إرسال البريد الإلكتروني الفوري للمحاسب للمزامنة
        await fetch("/api/send-accounting-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quotationId: q.id,
            clientName: getSafeString(company?.["اسم الشركة"]),
            clientPhone: getSafeString(company?.["الجوال الرئيسي"]),
            taxNumber: q["الرقم الضريبي"] || tempTaxNumber,
            nationalAddress: q["العنوان الوطني"] || tempNationalAddress,
            crNumber: q["السجل التجاري"] || tempCrNumber,
            amount: q["مبلغ العرض"],
            details: q["تفاصيل الخدمة / المعرض"],
            exhibition: q["المعرض"] || company?.["المعرض"] || "",
            repName: salesperson,
          }),
        });

        setAccountingUploadProgress(100);
        setAccountingUploadStatus("تمت عملية الرفع وإخطار المحاسب بالكامل بنجاح 100%! 🎉🟢");
        setEmailSuccessId(q.id);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        alert(`تم رفع المستندات الرسمية المرفقة (العنوان الوطني، السجل التجاري، الرقم الضريبي) وإرسال بند "إضافة العميل" إلى المحاسب بنجاح! يظهر كبند معلق ومستند رسمي مطلوب اتخاذ إجراء عليه فوراً في المنظومة 📊🟢`);
      } else {
        alert("فشل رفع وإرسال طلب التعميد للمحاسب.");
      }
    } catch (err) {
      console.error("فشل رفع وإرسال طلب التعميد للمحاسب:", err);
      alert("حدث خطأ أثناء الاتصال بالخادم.");
    } finally {
      setIsSendingEmail(null);
      setAccountingUploadStatus(null);
      setAccountingUploadProgress(0);
    }
  };

  const fetchFollowups = async (companyId: number | string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/followups?companyId=${encodeURIComponent(companyId)}`);
      if (response.ok) {
        const data = await response.json();
        setFollowups(data);
      }
    } catch (err) {
      console.error("فشل جلب سجل المتابعات المسبقة:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!company) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const fieldsToSave: any = {
        الحالة: status,
        الأولوية: priority,
        آخر_تواصل: lastContact,
        ملاحظات: notes,
      };

      if (isEditingAll && isManager) {
        fieldsToSave["اسم الشركة"] = companyName;
        fieldsToSave["كود الشركة"] = companyCode;
        fieldsToSave["النشاط"] = companyActivity;
        fieldsToSave["المدينة"] = companyCity;
        fieldsToSave["الجوال الرئيسي"] = companyPhone;
        fieldsToSave["البريد الإلكتروني"] = companyEmail;
        fieldsToSave["مسؤول المبيعات"] = companyRep;
        // نمرر المندوب كحقل معتمد للمتابعة
        fieldsToSave["المندوب"] = companyRep;
      }

      await onUpdate(fieldsToSave);
      setSuccess(true);
      setIsEditingAll(false);
      // إعادة جلب المتابعات فوراً لإظهار السجل الجديد المضاف
      fetchFollowups(company.id);
      setTimeout(() => setSuccess(false), 3050);
    } catch (err: any) {
      setError(err?.message || "فشل حفظ التعديلات، يرجى المحاولة لاحقاً.");
    } finally {
      setSaving(false);
    }
  };

  // ألوان وستايل الأولوية بالثيم الفاتح المطوّر
  const getPriorityColor = (p: string) => {
    switch (p) {
      case "عالية":
        return "bg-rose-50 text-rose-700 border border-rose-200/60 font-semibold";
      case "متوسطة":
        return "bg-amber-50 text-amber-700 border border-amber-200/60 font-semibold";
      case "منخفضة":
        return "bg-slate-100 text-slate-600 border border-slate-200/60";
      default:
        return "bg-slate-100 text-slate-600 border border-slate-200/60";
    }
  };

  // تفاصيل التسميات بالألوان للحالات بالنمط الفاتح المتناسق
  const getStatusColor = (s: string) => {
    switch (s) {
      case "جديد":
        return "bg-slate-100 text-slate-700 border border-slate-200/60";
      case "تم التواصل":
        return "bg-blue-50 text-blue-700 border border-blue-200/60";
      case "تم إرسال البروفايل":
        return "bg-indigo-50 text-indigo-700 border border-indigo-200/60";
      case "تم طلب التصميم":
        return "bg-purple-50 text-purple-700 border border-purple-200/60";
      case "تم إرسال العرض":
        return "bg-pink-50 text-pink-700 border border-pink-200/60";
      case "تفاوض":
        return "bg-orange-50 text-orange-700 border border-orange-200/60";
      case "تم التعميد":
        return "bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold";
      case "تم التنفيذ":
        return "bg-teal-50 text-teal-700 border border-teal-300 font-semibold";
      case "غير مهتم":
        return "bg-rose-50 text-rose-700 border border-rose-200/60";
      default:
        return "bg-slate-100 text-slate-600 border border-slate-200/60";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" id="details-backdrop">
      {/* غطاء الخلفية الداكن الشفاف مع إمكانية الغلق عند الضغط الخارجي */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* لوحة التفاصيل الجانبية المتحركة */}
      <motion.div 
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="relative z-10 w-full max-w-xl bg-white text-slate-800 h-full shadow-2xl flex flex-col overflow-hidden border-r border-slate-200"
        style={{ direction: "rtl" }}
        id="details-card-container"
      >
        {/* الهيدر للبطاقة - مجهّز لوجو وتصميم أنيق */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/10 text-blue-600 rounded-xl border border-blue-200 shadow-sm">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-mono font-bold tracking-wider">{getSafeString(company["كود الشركة"])}</p>
              <h3 className="text-base font-extrabold text-slate-900">{getSafeString(company["اسم الشركة"])}</h3>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            id="close-panel-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* جسم البطاقة القابل للتمرير */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* رسائل التنبيه والنجاح */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}
          
          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="font-semibold">تم حفظ التحديثات للشركة وإدخال سجل متابعة فوري بنجاح!</span>
            </div>
          )}

          {/* البداية: تفاصيل الشركة الثابتة "القابلة للقراءة فقط" أو نماذج الإدخال الإدارية */}
          {isManager && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-800 mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
                  <ShieldAlert className="w-5 h-5 animate-pulse text-amber-650" />
                </div>
                <div>
                  <h5 className="text-xs font-black">وضع صلاحيات المدير الشاملة</h5>
                  <p className="text-[10px] text-slate-500">أنت مخوّل لتعديل الهوية والاسم والمندوب وبيانات التواصل مباشرة.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingAll(!isEditingAll)}
                className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                  isEditingAll 
                    ? "bg-amber-600 border-amber-700 text-white shadow-md font-extrabold" 
                    : "bg-white border-amber-300 text-amber-700 hover:bg-amber-100"
                }`}
              >
                {isEditingAll ? "🔒 إلغاء وضع التعديل البيني" : "📋 تفعيل تعديل الهوية وبيانات الشركة"}
              </button>
            </div>
          )}

          {isEditingAll && isManager ? (
            <div className="space-y-4 p-4 border-2 border-dashed border-amber-300 bg-amber-50/15 rounded-xl">
              <h4 className="text-xs font-black text-amber-800 flex items-center gap-1.5 pb-2 border-b border-amber-100">
                <span>تعديل الهوية والبيانات الأساسية للمستند</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">اسم الشركة</label>
                  <input 
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-850 focus:ring-2 focus:ring-amber-400"
                    placeholder="اسم المنشأة"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">كود الشركة الموحد</label>
                  <input 
                    type="text"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-850 focus:ring-2 focus:ring-amber-400"
                    placeholder="كود المزامنة"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">النشاط التجاري</label>
                  <input 
                    type="text"
                    value={companyActivity}
                    onChange={(e) => setCompanyActivity(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-850 focus:ring-2 focus:ring-amber-400"
                    placeholder="المجال الصناعي"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">المدينة</label>
                  <input 
                    type="text"
                    value={companyCity}
                    onChange={(e) => setCompanyCity(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-850 focus:ring-2 focus:ring-amber-400"
                    placeholder="المحافظة"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">جوال التواصل الرئيسي</label>
                  <input 
                    type="text"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-850 focus:ring-2 focus:ring-amber-400"
                    placeholder="رقم الهاتف"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">البريد الإلكتروني للشركة</label>
                  <input 
                    type="text"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-850 focus:ring-2 focus:ring-amber-400 font-mono"
                    placeholder="info@company.com"
                  />
                </div>
              </div>
              <div className="space-y-1 pt-1">
                <label className="text-[10px] font-bold text-slate-500">إسناد وتكليف مندوب المبيعات المسؤول</label>
                <select
                  value={companyRep}
                  onChange={(e) => setCompanyRep(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-850 focus:ring-2 focus:ring-amber-400 cursor-pointer animate-none"
                >
                  {employeesList && employeesList.length > 0 ? (
                    employeesList.map((emp: any) => (
                      <option key={emp.id} value={emp["الاسم"] || emp.name}>{emp["الاسم"] || emp.name}</option>
                    ))
                  ) : (
                    <>
                      <option value="مؤيدة">مؤيدة</option>
                      <option value="نصر">نصر</option>
                      <option value="محمود">محمود</option>
                      <option value="جميلة">جميلة</option>
                      <option value="نبيل">نبيل</option>
                    </>
                  )}
                </select>
                <p className="text-[9px] text-amber-700 mt-1">سيتم تغيير مسؤول الشركة المسجل في Baserow فور الحفظ.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Activity className="w-4 h-4 text-blue-600" />
                <span>معلومات الشركة الأساسية (للقراءة فقط)</span>
              </h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-500 block mb-1">كود الشركة الموحد</span>
                  <span className="text-xs font-bold text-slate-800 font-mono">{getSafeString(company["كود الشركة"])}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-500 block mb-1">النشاط التجاري</span>
                  <span className="text-xs font-bold text-slate-800">{getSafeString(company["النشاط"]) || "—"}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-500 block mb-1">المدينة</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {getSafeString(company["المدينة"]) || "—"}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-500 block mb-1">مسؤول المبيعات</span>
                  <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-blue-500" />
                    {getSafeString(company["مسؤول المبيعات"]) || "غير مسند"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <a 
                  href={`tel:${getSafeString(company["الجوال الرئيسي"])}`} 
                  className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex flex-col justify-between transition-colors cursor-pointer group"
                >
                  <span className="text-[10px] text-slate-500 block mb-1">الجوال الرئيسي</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 group-hover:text-blue-600">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    {getSafeString(company["الجوال الرئيسي"]) || "—"}
                  </span>
                </a>
                <a 
                  href={`mailto:${getSafeString(company["البريد الإلكتروني"])}`}
                  className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex flex-col justify-between transition-colors cursor-pointer group"
                >
                  <span className="text-[10px] text-slate-500 block mb-1">البريد الإلكتروني للشركة</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate group-hover:text-blue-600 font-mono">
                    <Mail className="w-4 h-4 text-blue-500" />
                    {getSafeString(company["البريد الإلكتروني"]) || "—"}
                  </span>
                </a>
              </div>
              <p className="text-[10px] text-slate-400 flex items-center gap-1 px-1 leading-relaxed">
                <span>* لا يمكن تعديل بيانات التواصل والرموز الأساسية من هذه الشاشة لحماية سلامة المزامنة وجداول الخادم. يمكن للمدير استخدام الضوابط الإدارية أعلاه للتجاوز والتعديل المباشر.</span>
              </p>
            </div>
          )}

          {/* نموذج التحديث (Form) */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>تحديث وتنسيق التواصل الحالي</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* خيار الحالة */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <span>حالة المتابعة الحالية</span>
                  </label>
                  <button
                    type="button"
                    onClick={addNewCustomStatus}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-extrabold cursor-pointer transition-all hover:underline"
                  >
                    ➕ إضافة حالة مخصصة
                  </button>
                </div>
                <select 
                  value={status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2.5 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-extrabold"
                  required
                >
                  <option value="" disabled className="text-slate-400">اختر الحالة الجديدة</option>
                  {statusesList.map((st) => (
                    <option key={st} value={st} className="text-slate-800 font-sans">{st}</option>
                  ))}
                </select>
              </div>

              {/* حقل الأولوية */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                  <span>مستوى الأولوية</span>
                </label>
                <select 
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2.5 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  {ALLOWED_PRIORITIES.map((pr) => (
                    <option key={pr} value={pr} className="text-slate-800">{pr}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* تاريخ آخر تواصل */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>تاريخ آخر تواصل ومتابعة</span>
              </label>
              <input 
                type="date"
                value={lastContact}
                onChange={(e) => setLastContact(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2.5 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 cursor-pointer"
              />
            </div>

            {/* ملاحظات التواصل */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  <span>ملاحظات وإيضاحات التواصل (الحالية والتالية)</span>
                </label>
                {generatingNote && (
                  <span className="text-[10px] text-blue-600 font-extrabold flex items-center gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                    <span>جاري كتابة مسودة تلقائية بذكاء Gemini...</span>
                  </span>
                )}
              </div>
              <textarea 
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اكتب خلاصة التواصل الحالي، والخطوة التالية بالتفصيل..."
                className={`w-full text-xs rounded-lg border px-3 py-2.5 bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${generatingNote ? "border-blue-300 ring-2 ring-blue-500/10 opacity-70" : "border-slate-200"}`}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl py-3 px-4 shadow-md transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري تسجيل وحفظ المتابعة في السجل...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 transition-transform group-hover:scale-110" />
                  <span>حفظ التعديلات وتسجيل متابعة جديدة</span>
                </>
              )}
            </button>
          </form>

          {/* الخط الزمني للمتابعات السابقة (Followups Timeline) */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>سجل المتابعات واللمسات السابقة للشركة</span>
            </h4>

            {loadingHistory ? (
              <div className="flex justify-center items-center py-6 gap-2 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>جاري تحميل سجل المراجعات من خادم البيانات...</span>
              </div>
            ) : followups.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                لا يوجد متابعات مسجلة مسبقاً لهذه الشركة. سيتم إنشاء السجل الأول عند حفظ التعديلات أعلاه.
              </div>
            ) : (
              <div className="relative border-r-2 border-slate-100 pr-4 mr-2 space-y-4">
                {followups.map((item, idx) => (
                  <div key={item.id || idx} className="relative">
                    {/* نقطة التفرع */}
                    <div className="absolute right-[-23px] top-1.5 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-white" />
                    
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-slate-700 flex items-center gap-0.5">
                          تواصل بواسطة: <span className="text-blue-650 font-extrabold">{getSafeString(item["الموظف المرتبط"]) || salesperson}</span>
                        </span>
                        <span className="text-slate-400 font-mono">{getSafeString(item["تاريخ المتابعة"])}</span>
                      </div>
                      <div className="flex items-center gap-1.5 py-0.5">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${getStatusColor(getSafeString(item["الحالة"]))}`}>
                          {getSafeString(item["الحالة"])}
                        </span>
                        <span className="text-[9px] bg-slate-200/50 text-slate-550 border border-slate-200 px-2 py-0.5 rounded">
                          المصدر: {getSafeString(item["المصدر"]) || "واجهة المندوب"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed pt-1">
                        {item["الملاحظات"]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ======================================================= */}
          {/* قسم عروض الأسعار والتعميد المالي الفوري للمحاسبة */}
          {/* ======================================================= */}
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>عروض الأسعار والتعميد المالي الفوري 💰</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowQuotationForm(!showQuotationForm)}
                className="text-[11px] font-extrabold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-150 transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>تسجيل عرض سعر مالي ➕</span>
              </button>
            </div>

            {/* نموذج تسجيل عرض سعر جديد */}
            {showQuotationForm && (
              <motion.form
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleCreateQuotation}
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 text-right"
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h5 className="text-xs font-black text-slate-800">إعداد وتسجيل عرض مالي رسمي جديد ✍️</h5>
                  <span className="text-[10px] text-slate-400 font-sans">مع التحديث والبنود الديناميكية</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600">المعرض المرتبط بالعرض:</label>
                    <input
                      type="text"
                      required
                      value={newQuotationExhibition}
                      onChange={(e) => setNewQuotationExhibition(e.target.value)}
                      placeholder={company["المعرض"] || "أدخل اسم المعرض المستهدف"}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* منشئ بنود عرض السعر الفعلي */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-700">تفاصيل بنود وخدمات عرض السعر:</span>
                    <button
                      type="button"
                      onClick={addQuotationItemLine}
                      className="text-[9px] font-extrabold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 transition-all flex items-center gap-0.5"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      إضافة بند / خدمة ➕
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-right text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                          <th className="p-2 font-bold w-1/12 text-center">#</th>
                          <th className="p-2 font-bold w-5/12">البند / الخدمة</th>
                          <th className="p-2 font-bold w-2/12 text-center">الكمية</th>
                          <th className="p-2 font-bold w-2/12 text-center">سعر الوحدة</th>
                          <th className="p-2 font-bold w-2/12 text-center">الإجمالي</th>
                          <th className="p-2 font-bold w-1/12 text-center"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotationItems.map((item, idx) => (
                          <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                            <td className="p-2 text-center text-slate-400 font-bold">{idx + 1}</td>
                            <td className="p-1">
                              <input
                                type="text"
                                required
                                value={item.description}
                                onChange={(e) => updateQuotationItemLine(item.id, "description", e.target.value)}
                                placeholder="مثال: تنفيذ ديكور خشبي للجناح"
                                className="w-full text-xs px-2 py-1 border border-slate-150 rounded-md focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                min={1}
                                required
                                value={item.qty}
                                onChange={(e) => updateQuotationItemLine(item.id, "qty", parseInt(e.target.value) || 1)}
                                className="w-full text-xs text-center px-1 py-1 border border-slate-150 rounded-md focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                required
                                value={item.price}
                                onChange={(e) => updateQuotationItemLine(item.id, "price", parseFloat(e.target.value) || 0)}
                                className="w-full text-xs text-center px-1 py-1 border border-slate-150 rounded-md focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-2 text-center font-mono font-bold text-slate-700">
                              {(item.qty * item.price).toLocaleString()} ر.س
                            </td>
                            <td className="p-1 text-center">
                              <button
                                type="button"
                                onClick={() => removeQuotationItemLine(item.id)}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-all inline-flex"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ملخص الحسابات قبل وبعد الضريبة */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col items-end space-y-1.5 font-sans">
                    <div className="flex items-center gap-2 justify-between w-full max-w-xs text-slate-600 text-xs">
                      <span>المجموع قبل الضريبة:</span>
                      <span className="font-bold text-slate-800">{calculatedSubtotal.toLocaleString()} ر.س</span>
                    </div>
                    <div className="flex items-center gap-2 justify-between w-full max-w-xs text-slate-500 text-[11px]">
                      <span>ضريبة القيمة المضافة (15%):</span>
                      <span className="font-mono text-slate-700">{calculatedTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س</span>
                    </div>
                    <div className="flex items-center gap-2 justify-between w-full max-w-xs border-t border-slate-100 pt-1.5 text-xs">
                      <span className="font-extrabold text-slate-900 text-sm">الإجمالي النهائي:</span>
                      <span className="font-black text-emerald-700 text-sm font-mono">{calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setQuotationItems([{ id: 1, description: "", qty: 1, price: 0, total: 0 }]);
                      setShowQuotationForm(false);
                    }}
                    className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg text-xs font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submittingQuotation}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold shadow-md shadow-emerald-600/10 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {submittingQuotation ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>جاري التسجيل...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>حفظ وتسجيل عرض السعر 💾</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            )}

            {/* قائمة عروض الأسعار المسجلة */}
            {loadingQuotations ? (
              <div className="flex justify-center items-center py-4 gap-2 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>جاري سحب عروض الأسعار القانونية...</span>
              </div>
            ) : quotations.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-sans">
                لا يوجد عروض أسعار مسجلة لهذا العميل حتى الآن. يمكنك تسجيل عرض سعر عبر الزر أعلاه.
              </div>
            ) : (
              <div className="space-y-3">
                {quotations.map((q) => {
                  const isApproved = q["حالة العرض"] === "تم التعميد";
                  
                  return (
                    <div
                      key={q.id}
                      className={`border rounded-xl p-4 text-right space-y-3 transition-all shadow-xs ${
                        isApproved
                          ? "border-emerald-250 bg-emerald-50/20"
                          : "border-slate-250 bg-white"
                      }`}
                    >
                      {/* هيدر كارت العرض */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 font-mono block">{q["رقم العرض"]}</span>
                          <span className="text-xs font-extrabold text-slate-800">{q["المعرض"] || company["المعرض"] || "معرض عام"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900 font-mono">{q["مبلغ العرض"]} ر.س</span>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full border font-extrabold ${
                              isApproved
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-50 text-slate-600 border-slate-200"
                            }`}
                          >
                            {q["حالة العرض"]}
                          </span>
                        </div>
                      </div>

                      {/* تفاصيل الخدمة */}
                      {q["تفاصيل الخدمة / المعرض"] && (
                        <p className="text-xs text-slate-600 leading-relaxed font-sans">
                          {q["تفاصيل الخدمة / المعرض"]}
                        </p>
                      )}

                      {/* المواعيد والتاريخ */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans border-t border-slate-100 pt-2 pb-1">
                        <span>تاريخ العرض: {q["تاريخ العرض"]}</span>
                        <span>آخر تحديث: {q["تاريخ التحديث"]}</span>
                      </div>

                      {/* لوحة إجراءات إرسال واستعراض عرض السعر */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-right">
                        <span className="text-[10px] text-slate-500 font-bold">إجراءات عرض السعر:</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* 1. زر عرض السعر الرسمي كـ PDF / طباعة */}
                          <button
                            type="button"
                            onClick={() => setSelectedPreviewQuote(q)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>عرض وطباعة العرض الرسمي 📄</span>
                          </button>

                          {/* 2. زر الإرسال بالواتساب بضغطة زر */}
                          <button
                            type="button"
                            onClick={() => handleSendClientQuotationWhatsApp(q)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>إرسال واتساب 🟢</span>
                          </button>

                          {/* 3. زر الإرسال بالبريد الإلكتروني للعميل */}
                          <button
                            type="button"
                            onClick={() => handleSendClientQuotationEmail(q)}
                            disabled={isSendingClientEmail === q.id}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm disabled:opacity-50"
                          >
                            {isSendingClientEmail === q.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                <span>جاري الإرسال للعميل...</span>
                              </>
                            ) : (
                              <>
                                <Mail className="w-3.5 h-3.5" />
                                <span>إرسال بريد للعميل ✉️</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* واجهة إدخال بيانات التعميد عند النقر */}
                      {!isApproved && (
                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                          <p className="text-[10px] text-amber-700 font-bold leading-relaxed flex items-center gap-1">
                            <span>💡 لتغيير حالة هذا العرض إلى <b>تم التعميد</b>، يجب تزويد البيانات الرسمية وإرفاق المستندات الرسمية المعتمدة للعميل للمطالبة المالية والتحويل للمحاسب:</span>
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-bold text-slate-500">الرقم الضريبي</span>
                              <input
                                type="text"
                                value={tempTaxNumber}
                                onChange={(e) => setTempTaxNumber(e.target.value.trim())}
                                placeholder="مثال: 300012345600003"
                                className="w-full text-[11px] border border-slate-200 rounded-lg bg-white px-2.5 py-2 focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-bold text-slate-500">السجل التجاري</span>
                              <input
                                type="text"
                                value={tempCrNumber}
                                onChange={(e) => setTempCrNumber(e.target.value.trim())}
                                placeholder="مثال: 1010123456"
                                className="w-full text-[11px] border border-slate-200 rounded-lg bg-white px-2.5 py-2 focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-bold text-slate-500">العنوان الوطني</span>
                              <input
                                type="text"
                                value={tempNationalAddress}
                                onChange={(e) => setTempNationalAddress(e.target.value.trim())}
                                placeholder="مثال: 1234 الرياض 12345"
                                className="w-full text-[11px] border border-slate-200 rounded-lg bg-white px-2.5 py-2 focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                              />
                            </div>
                          </div>

                          {/* إرفاق المستندات كملفات */}
                          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* 1. السجل التجاري */}
                            <div className="bg-white p-2.5 rounded-lg border border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-1.5">
                              <span className="text-[9.5px] font-bold text-slate-600">📄 وثيقة السجل التجاري</span>
                              <label className="bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded text-[9px] font-bold text-slate-700 cursor-pointer transition-all">
                                <span>{crNumberFile ? "🔄 تغيير الملف" : "📤 اختر ملف السجل"}</span>
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={(e) => handleFileChange(e, "cr")}
                                  className="hidden"
                                />
                              </label>
                              {crNumberFile && (
                                <span className="text-[9px] text-emerald-600 font-bold truncate max-w-full">
                                  ✅ {crNumberFile.name}
                                </span>
                              )}
                            </div>

                            {/* 2. شهادة الرقم الضريبي */}
                            <div className="bg-white p-2.5 rounded-lg border border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-1.5">
                              <span className="text-[9.5px] font-bold text-slate-600">📄 شهادة الرقم الضريبي</span>
                              <label className="bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded text-[9px] font-bold text-slate-700 cursor-pointer transition-all">
                                <span>{taxNumberFile ? "🔄 تغيير الملف" : "📤 اختر شهادة الضريبة"}</span>
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={(e) => handleFileChange(e, "tax")}
                                  className="hidden"
                                />
                              </label>
                              {taxNumberFile && (
                                <span className="text-[9px] text-emerald-600 font-bold truncate max-w-full">
                                  ✅ {taxNumberFile.name}
                                </span>
                              )}
                            </div>

                            {/* 3. العنوان الوطني */}
                            <div className="bg-white p-2.5 rounded-lg border border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-1.5">
                              <span className="text-[9.5px] font-bold text-slate-600">📄 وثيقة العنوان الوطني</span>
                              <label className="bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded text-[9px] font-bold text-slate-700 cursor-pointer transition-all">
                                <span>{nationalAddressFile ? "🔄 تغيير الملف" : "📤 اختر وثيقة العنوان"}</span>
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={(e) => handleFileChange(e, "address")}
                                  className="hidden"
                                />
                              </label>
                              {nationalAddressFile && (
                                <span className="text-[9px] text-emerald-600 font-bold truncate max-w-full">
                                  ✅ {nationalAddressFile.name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!tempTaxNumber || !tempCrNumber || !tempNationalAddress) {
                                  alert("الرجاء إدخال كافة المستندات (الرقم الضريبي، السجل التجاري، العنوان الوطني) قبل التعميد.");
                                  return;
                                }
                                handleUpdateQuotationStatus(q.id, "تم التعميد");
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>تغيير الحالة إلى [ تم التعميد ] وتثبيت السندات الرسمية والمرفقات ✅</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* زر إرسال مستندات التعميد للمحاسب أ. جمال */}
                      {isApproved && (
                        <div className="bg-emerald-50/50 border border-emerald-150 p-3 rounded-lg space-y-2">
                          <div className="space-y-1 font-sans text-xs">
                            <span className="font-extrabold text-emerald-850 block">📋 المستندات والبيانات القانونية المعتمدة:</span>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-[11px] text-slate-700">
                              <span>• الرقم الضريبي: <b>{q["الرقم الضريبي"] || tempTaxNumber || "غير مسجل"}</b></span>
                              <span>• السجل التجاري: <b>{q["السجل التجاري"] || tempCrNumber || "غير مسجل"}</b></span>
                              <span>• العنوان الوطني: <b>{q["العنوان الوطني"] || tempNationalAddress || "غير مسجل"}</b></span>
                            </div>
                          </div>

                          {isSendingEmail === q.id && accountingUploadStatus && (
                            <div className="bg-white border border-slate-150 p-3 rounded-lg space-y-2 text-right">
                              <div className="flex items-center justify-between text-[10px] font-bold text-blue-900">
                                <span>{accountingUploadStatus}</span>
                                <span className="font-mono text-blue-600">{accountingUploadProgress}%</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div 
                                  className="bg-blue-600 h-full rounded-full transition-all duration-300" 
                                  style={{ width: `${accountingUploadProgress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="pt-2 border-t border-emerald-100 flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[10px] text-slate-500 font-sans">بريد المحاسب: jamal@expo-time.co</span>
                            {emailSuccessId === q.id ? (
                              <div className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>تم إرسال التعميد والمستندات للمحاسب بنجاح! 📨📧</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSendAccountingEmail(q)}
                                disabled={isSendingEmail === q.id}
                                className={`bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-300 ${isSendingEmail === q.id ? "opacity-50 cursor-not-allowed" : ""}`}
                              >
                                {isSendingEmail === q.id ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>جاري الرفع والإرسال...</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3 h-3" />
                                    <span>إرسال بيانات التعميد للمحاسب أ. جمال فوراً 📧</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* ======================================================= */}

        </div>
      </motion.div>
    </div>
  );
}
