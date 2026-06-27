import React, { useState, useEffect, useMemo } from "react";
import { 
  Building2, 
  Search, 
  Filter, 
  LogOut, 
  Globe, 
  RefreshCw, 
  SlidersHorizontal, 
  CheckCircle2, 
  Clock, 
  Users,
  AlertCircle,
  HelpCircle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Briefcase,
  Layers,
  Menu,
  MapPin,
  ClipboardList,
  Upload,
  Download,
  Loader2,
  Plus,
  ShieldCheck,
  Percent,
  CalendarDays,
  Trash2,
  X,
  Mail,
  Phone,
  UserPlus,
  UserCheck,
  Edit2,
  Bell,
  MessageSquare,
  CloudLightning,
  ExternalLink,
  Save,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import { Company, Employee, ConfigResponse, ALLOWED_STATUSES, ALLOWED_PRIORITIES } from "./types";
import CompanyDetails from "./components/CompanyDetails";
import { initAuth, googleSignIn, logoutGoogle } from "./lib/firebaseAuth";
import { setAuthToken, clearAuthToken, setUnauthorizedHandler } from "./lib/apiClient";
import { toast } from "./lib/toast";

import { getSafeString, formatPhone, formatEmail, cleanPhoneForWhatsApp } from "./lib/helpers";
export { getSafeString, formatPhone, formatEmail, cleanPhoneForWhatsApp };

export default function App() {
  const [loginTab, setLoginTab] = useState<"sales" | "admin">("sales");
  // الحالات المتعلقة بالاتصال والضبط
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedRep, setSelectedRep] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // حالات لوحة المحاسبة والطلبات الرسمية
  const [accountingRequests, setAccountingRequests] = useState<any[]>([]);
  const [loadingAccounting, setLoadingAccounting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsUploadStatus, setSettingsUploadStatus] = useState<string | null>(null);
  const [settingsUploadProgress, setSettingsUploadProgress] = useState<number>(0);

  // حالات تسجيل العمليات والولوج الأمنية الموحدة باليوزر والباسورد
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "companies" | "import" | "users" | "diagnostics" | "accounting">("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const selectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  // تنزيل نموذج إكسل مطابق تماماً لـ Baserow ويشتمل على كل الحقول المطلوبة
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "كود الشركة": "COMP-101",
        "اسم الشركة": "شركة الابتكار الرقمي للمقاولات",
        "النشاط": "اتصالات وتقنية معلومات",
        "المدينة": "الرياض",
        "الجوال الرئيسي": "0501234567",
        "البريد الإلكتروني": "info@digital-innov.sa",
        "الحالة": "جديد",
        "مسؤول المبيعات": "مؤيدة",
        "الأولوية": "عالية",
        "آخر تواصل": "",
        "المصدر": "معرض فعاليات الرياض",
        "ملاحظات": "عميل جديد مهتم بتركيب جناح عرض بمساحة 120م٢ وتجهيزات خاصة"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "الأعمدة المعتمدة");
    
    // ضبط اتجاه الورقة من اليمين لليسار للغة العربية
    worksheet["!dir"] = "rtl";

    XLSX.writeFile(workbook, "نموذج_استيراد_شركات_باسيرو_الكامل.xlsx");
  };
  const [loginError, setLoginError] = useState("");

  // حالات تقدم استيراد الإدخال الضخم لـ 100 ألف سطر
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percentage: number } | null>(null);
  
  // وضعية المدير لعرض الإحصائيات الشاملة والتحليلات
  const [isManagerMode, setIsManagerMode] = useState(false);
  const [managerCompanies, setManagerCompanies] = useState<Company[]>([]);
  const [managerFollowups, setManagerFollowups] = useState<any[]>([]);
  const [loadingManagerData, setLoadingManagerData] = useState(false);
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<"current_week" | "all_time">("all_time");

  // تفعيل التوبيب التلقائي المناسب فور تسجيل الدخول لمجاراة دور الصلاحيات المحدد
  useEffect(() => {
    if (isLoggedIn) {
      if (isManagerMode) {
        setActiveTab("dashboard");
      } else {
        setActiveTab("companies");
      }
    }
  }, [isLoggedIn, isManagerMode]);

  // الحالات المتعلقة بالبيانات والفلترة
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [companiesPage, setCompaniesPage] = useState(1);
  const [hasMoreCompanies, setHasMoreCompanies] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // الحالات التفاعلية
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showConfigGuide, setShowConfigGuide] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // حالات فتح لوحة الإضافة / الاستيراد
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [importTab, setImportTab] = useState<"excel" | "manual" | "google-sheets" | "ai-clean">("excel");
  const [aiInputText, setAiInputText] = useState("");
  const [isCleaningAi, setIsCleaningAi] = useState(false);
  const [aiCleanResult, setAiCleanResult] = useState<any[]>([]);

  // حالات تكامل قوقل شيت (Google Sheets Integration)
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleSheetId, setGoogleSheetId] = useState<string>(() => localStorage.getItem("expo_google_sheet_id") || "");
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>(() => localStorage.getItem("expo_google_sheet_url") || "");
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState<string>("");
  const [googleDriveFolderUrl, setGoogleDriveFolderUrl] = useState<string>("");
  const [accountantEmail, setAccountantEmail] = useState<string>("jamal@expo-time.co");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleStatusMsg, setGoogleStatusMsg] = useState("");
  const [googleErrorMsg, setGoogleErrorMsg] = useState("");

  // حالات عروض الأسعار (Quotations) الفورية والتعميد المالي
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [newQuotationAmount, setNewQuotationAmount] = useState("");
  const [newQuotationDetails, setNewQuotationDetails] = useState("");
  const [newQuotationExhibition, setNewQuotationExhibition] = useState("");
  const [submittingQuotation, setSubmittingQuotation] = useState(false);

  // حالات إدخال مستندات التعميد القانونية والضريبية للمحاسبة
  const [tempTaxNumber, setTempTaxNumber] = useState("");
  const [tempNationalAddress, setTempNationalAddress] = useState("");
  const [tempCrNumber, setTempCrNumber] = useState("");
  const [updatingQuotationStatusId, setUpdatingQuotationStatusId] = useState<string | null>(null);

  // حقل المعرض للعميل الجديد
  const [newCompanyExhibition, setNewCompanyExhibition] = useState("");

  // حالات فتح لوحة إدارة المستخدمين والمناديب
  const [showEmployeesPanel, setShowEmployeesPanel] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpPhone, setNewEmpPhone] = useState("");
  const [newEmpDept, setNewEmpDept] = useState("المبيعات");
  const [empActionLoading, setEmpActionLoading] = useState(false);
  const [empActionError, setEmpActionError] = useState("");
  const [empActionSuccess, setEmpActionSuccess] = useState("");
  const [latestWhatsappUrl, setLatestWhatsappUrl] = useState("");

  // حالات تعديل المناديب
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | number | null>(null);
  const [editingEmpName, setEditingEmpName] = useState("");
  const [editingEmpDept, setEditingEmpDept] = useState("المبيعات");
  const [editingEmpEmail, setEditingEmpEmail] = useState("");
  const [editingEmpPhone, setEditingEmpPhone] = useState("");
  
  // نموذج الإدخال اليدوي
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyCode, setNewCompanyCode] = useState("");
  const [newCompanyActivity, setNewCompanyActivity] = useState("");
  const [newCompanyCity, setNewCompanyCity] = useState("الرياض");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");
  const [newCompanyEmail, setNewCompanyEmail] = useState("");
  const [newCompanyStatus, setNewCompanyStatus] = useState("جديد");
  const [newCompanyPriority, setNewCompanyPriority] = useState("متوسطة");
  const [newCompanyRep, setNewCompanyRep] = useState("");
  const [newCompanyNotes, setNewCompanyNotes] = useState("");
  const [newCompanySource, setNewCompanySource] = useState("إدخال يدوي");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // ميزتان إضافيتان لتنبيهات تكرار العملاء ومخرجات استيراد الإكسل التفصيلية
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    existingCompany: {
      "كود الشركة": string;
      "اسم الشركة": string;
      "مسؤول المبيعات": string;
      "الجوال الرئيسي": string;
    };
  } | null>(null);

  const [excelImportResult, setExcelImportResult] = useState<{
    count: number;
    skippedCount: number;
    skipped: Array<{ name: string; code: string; phone: string }>;
  } | null>(null);

  // تعريف متغيرات ومصفوفات معتمدة بالوضع المحلي والتحكم الكامل للأدمن
  const [repEmail, setRepEmail] = useState("");
  const [newEmpUsername, setNewEmpUsername] = useState("");
  const [newEmpPassword, setNewEmpPassword] = useState("");

  // احتساب أفضل 5 عملاء مستنداً إلى التعاميد وعروض الأسعار وحجم العقد
  const topClients = useMemo(() => {
    const targetList = isManagerMode ? managerCompanies : companies;
    return targetList.map(c => {
      const clientQuotes = quotations.filter(q => q.companyId === c.id || String(q.companyId) === String(c.id));
      const totalQuoteValue = clientQuotes.reduce((sum, q) => sum + (Number(q["مبلغ العرض"]) || 0), 0);
      const isApproved = ["تم التعميد", "تم التنفيذ"].includes(c["الحالة"]) || clientQuotes.some(q => q["حالة العرض"] === "تم التعميد");
      
      const score = (isApproved ? 1000000 : 0) + totalQuoteValue;
      
      return {
        company: c,
        totalQuoteValue,
        isApproved,
        score,
        quotesCount: clientQuotes.length
      };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [isManagerMode, managerCompanies, companies, quotations]);

  // الإحصائيات الفورية لتعميد الثقة وحجم عروض الأسعار المقدمة
  const stats = useMemo(() => {
    const targetList = isManagerMode ? managerCompanies : companies;
    const total = targetList.length;
    const isNew = targetList.filter(c => c["الحالة"] === "جديد").length;
    const isInterest = targetList.filter(c => ["تم التواصل", "تم إرسال البروفايل", "تم طلب التصميم", "تم إرسال العرض", "تفاوض"].includes(c["الحالة"])).length;
    const isSigned = targetList.filter(c => ["تم التعميد", "تم التنفيذ"].includes(c["الحالة"])).length;
    return { total, isNew, isInterest, isSigned };
  }, [isManagerMode, managerCompanies, companies]);

  // الشركات المعروضة بعد الفلترة والبحث الفوري وتجنب التجميد
  const displayCompanies = useMemo(() => {
    let list = isManagerMode ? managerCompanies : companies;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c => 
        (c["اسم الشركة"] || "").toLowerCase().includes(q) ||
        (c["كود الشركة"] || "").toLowerCase().includes(q) ||
        (c["المدينة"] || "").toLowerCase().includes(q) ||
        (c["الجوال الرئيسي"] || "").includes(q) ||
        (c["مسؤول المبيعات"] || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      list = list.filter(c => c["الحالة"] === statusFilter);
    }
    if (priorityFilter) {
      list = list.filter(c => c["الأولوية"] === priorityFilter);
    }
    return list;
  }, [isManagerMode, managerCompanies, companies, searchQuery, statusFilter, priorityFilter]);

  // تحليلات وتصنيفات أداء المناديب اليومي والأسبوعي
  const delegateAnalytics = useMemo(() => {
    const targetCompanies = isManagerMode ? managerCompanies : companies;
    const targetFollowups = isManagerMode ? managerFollowups : [];
    
    const names = Array.from(new Set([
      ...employees.map(e => e["الاسم"]),
      ...targetCompanies.map(c => c["مسؤول المبيعات"]).filter(Boolean)
    ]));

    return names.map(name => {
      const comps = targetCompanies.filter(c => getSafeString(c["مسؤول المبيعات"]).trim() === getSafeString(name).trim());
      const totalCompanies = comps.length;
      
      const totalContacted = comps.filter(c => c["الحالة"] !== "جديد").length;
      const profilesSent = comps.filter(c => c["الحالة"] === "تم إرسال البروفايل").length;
      const designsRequested = comps.filter(c => c["الحالة"] === "تم طلب التصميم").length;
      const quotesSent = comps.filter(c => c["الحالة"] === "تم إرسال العرض").length;
      const signedAgreements = comps.filter(c => ["تم التعميد", "تم التنفيذ"].includes(c["الحالة"])).length;
      const uninterested = comps.filter(c => c["الحالة"] === "غير مهتم").length;
      
      const conversionRate = totalCompanies > 0 ? Math.round((signedAgreements / totalCompanies) * 100) : 0;
      
      const repsFollowups = targetFollowups.filter(f => getSafeString(f["الموظف المرتبط"]).trim() === getSafeString(name).trim());
      const weeklyActionsCount = repsFollowups.length;
      const monthlyActionsCount = repsFollowups.length;

      let weeklyRating = "خامل ومقصر 💤";
      let weeklyColor = "text-slate-500 bg-slate-50 border-slate-200";
      if (signedAgreements >= 3) {
        weeklyRating = "ممتاز ونشط البورصة 🌟";
        weeklyColor = "text-emerald-700 bg-emerald-50 border-emerald-250";
      } else if (signedAgreements >= 1 || totalContacted >= 5) {
        weeklyRating = "متوسط ومبادر 👍";
        weeklyColor = "text-blue-700 bg-blue-50 border-blue-250";
      }

      let monthlyRating = "أداء خامل ⚠️";
      let monthlyColor = "text-rose-700 bg-rose-50 border-rose-250";
      if (signedAgreements >= 5) {
        monthlyRating = "أداء استثنائي قفزة البورصة 🚀";
        monthlyColor = "text-emerald-700 bg-emerald-50 border-emerald-250";
      } else if (signedAgreements >= 2) {
        monthlyRating = "أداء مقبول وبحاجة لمتابعة 📈";
        monthlyColor = "text-amber-700 bg-amber-50 border-amber-250";
      }

      const effortScore = totalContacted * 10 + signedAgreements * 50;

      return {
        delegate: name,
        totalCompanies,
        totalContacted,
        profilesSent,
        designsRequested,
        quotesSent,
        signedAgreements,
        uninterested,
        conversionRate,
        weeklyActionsCount,
        monthlyActionsCount,
        weeklyRating,
        weeklyColor,
        monthlyRating,
        monthlyColor,
        effortScore
      };
    });
  }, [isManagerMode, managerCompanies, companies, managerFollowups, employees]);

  // دوال الجلب الفوري ومزامنة البيانات من الخادم
  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error("فشل جلب إعدادات الخادم", err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/employees");
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (err) {
      console.error("فشل جلب قائمة الموظفين", err);
    }
  };

  const fetchAppSettings = async () => {
    try {
      const res = await fetch("/api/app-settings");
      if (res.ok) {
        const data = await res.json();
        setGoogleSheetId(data.googleSheetId || "");
        setGoogleSheetUrl(data.googleSheetUrl || "");
        setGoogleDriveFolderId(data.googleDriveFolderId || "");
        setGoogleDriveFolderUrl(data.googleDriveFolderUrl || "");
        setAccountantEmail(data.accountantEmail || "jamal@expo-time.co");
        if (data.googleSheetId) {
          localStorage.setItem("expo_google_sheet_id", data.googleSheetId);
        }
        if (data.googleSheetUrl) {
          localStorage.setItem("expo_google_sheet_url", data.googleSheetUrl);
        }
      }
    } catch (err) {
      console.error("فشل جلب الضبط العام", err);
    }
  };

  const saveAppSettings = async (newSettings: any) => {
    try {
      const res = await fetch("/api/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        await fetchAppSettings();
        return true;
      }
      return false;
    } catch (err) {
      console.error("فشل حفظ إعدادات النظام", err);
      return false;
    }
  };

  const fetchQuotations = async () => {
    setLoadingQuotations(true);
    try {
      const res = await fetch("/api/quotations");
      if (res.ok) {
        const data = await res.json();
        setQuotations(data);
      }
    } catch (err) {
      console.error("فشل جلب عروض الأسعار", err);
    } finally {
      setLoadingQuotations(false);
    }
  };

  const fetchAccountingRequests = async () => {
    setLoadingAccounting(true);
    try {
      const res = await fetch("/api/accounting-requests");
      if (res.ok) {
        const data = await res.json();
        setAccountingRequests(data);
      }
    } catch (err) {
      console.error("فشل جلب طلبات المحاسبة:", err);
    } finally {
      setLoadingAccounting(false);
    }
  };

  const handleUpdateAccountingRequestStatus = async (id: string, status: "معلق" | "مكتمل") => {
    try {
      const res = await fetch(`/api/accounting-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        toast.success("تم تأكيد اتخاذ الإجراء وإضافة العميل للنظام المحاسبي بنجاح! 🚀✅");
        fetchAccountingRequests();
      } else {
        toast.error("فشل تحديث حالة الطلب المحاسبي.");
      }
    } catch (err) {
      console.error("خطأ تحديث طلب المحاسب:", err);
      toast.error("حدث خطأ أثناء الاتصال بالخادم.");
    }
  };

  const fetchCompanies = async (rep: string, search: string = "", page: number = 1) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const url = `/api/companies?representative=${encodeURIComponent(rep)}&search=${encodeURIComponent(search)}&page=${page}&limit=200`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (page === 1) {
          setCompanies(data || []);
        } else {
          setCompanies(prev => [...prev, ...(data || [])]);
        }
        setCompaniesPage(page);
        setHasMoreCompanies(data && data.length === 200);
      }
    } catch (err) {
      console.error("فشل جلب الشركات", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchAllManagerData = async (search: string = "", page: number = 1) => {
    if (page === 1) setLoadingManagerData(true);
    else setLoadingMore(true);
    try {
      const url = `/api/companies?search=${encodeURIComponent(search)}&page=${page}&limit=200`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (page === 1) {
          setManagerCompanies(data || []);
        } else {
          setManagerCompanies(prev => [...prev, ...(data || [])]);
        }
        setCompaniesPage(page);
        setHasMoreCompanies(data && data.length === 200);
      }
      
      const fRes = await fetch("/api/followups");
      if (fRes.ok) {
        const fData = await fRes.json();
        setManagerFollowups(fData);
      }
    } catch (err) {
      console.error("فشل جلب بيانات المدير", err);
    } finally {
      setLoadingManagerData(false);
      setLoadingMore(false);
    }
  };

  function findValueFuzzy(row: any, keys: string[]): any {
    for (const key of keys) {
      if (row[key] !== undefined) return row[key];
      const foundKey = Object.keys(row).find(k => k.toLowerCase().replace(/[\s\-\_]+/g, "") === key.toLowerCase().replace(/[\s\-\_]+/g, ""));
      if (foundKey) return row[foundKey];
    }
    return "";
  }

  const handleLogout = () => {
    clearAuthToken();
    setIsLoggedIn(false);
    setIsManagerMode(false);
    setSelectedRep("");
    setRepEmail("");
    setLoginUsername("");
    setLoginPassword("");
  };

  // إنهاء الجلسة تلقائياً عند انتهاء صلاحية التوكن (401)
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setIsLoggedIn(false);
      setIsManagerMode(false);
      setSelectedRep("");
      toast.error("انتهت الجلسة، يرجى تسجيل الدخول مجدداً.");
    });
  }, []);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      toast.error("الرجاء إدخال اسم الشركة.");
      return;
    }
    setIsSubmittingManual(true);
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: {
            "اسم الشركة": newCompanyName,
            "كود الشركة": newCompanyCode,
            "النشاط": newCompanyActivity || "معارض وفعاليات",
            "المدينة": newCompanyCity || "الرياض",
            "الجوال الرئيسي": newCompanyPhone,
            "البريد الإلكتروني": newCompanyEmail,
            "الحالة": newCompanyStatus || "جديد",
            "مسؤول المبيعات": newCompanyRep || selectedRep || "مؤيدة",
            "الأولوية": newCompanyPriority || "متوسطة",
            "ملاحظات": newCompanyNotes,
            "المصدر": newCompanySource || "إدخال يدوي"
          }
        })
      });
      const result = await response.json();
      if (response.ok) {
        toast.success("تم إضافة الشركة بنجاح.");
        setNewCompanyName("");
        setNewCompanyCode("");
        setNewCompanyActivity("");
        setNewCompanyPhone("");
        setNewCompanyEmail("");
        setNewCompanyNotes("");
        
        if (isManagerMode) {
          fetchAllManagerData();
        } else {
          fetchCompanies(selectedRep);
        }
      } else {
        toast.error(result.message || result.error || "فشل إضافة الشركة.");
      }
    } catch (err) {
      console.error("خطأ أثناء إضافة الشركة يدوياً", err);
      toast.error("حدث خطأ أثناء إضافة الشركة.");
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleAiCleanSubmit = async () => {
    if (!aiInputText.trim()) {
      toast.error("الرجاء إدخال أو لصق البيانات العشوائية أولاً.");
      return;
    }
    setIsCleaningAi(true);
    try {
      const response = await fetch("/api/ai/clean-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: aiInputText,
          salesRep: isManagerMode ? "نبيل الزبير" : selectedRep
        })
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setAiCleanResult(result.data || []);
        toast.success(`نجح الذكاء الاصطناعي ✨ في تنظيم ${result.data?.length || 0} من الشركات وحفظها بنجاح!`);
        
        if (isManagerMode) {
          fetchAllManagerData();
        } else {
          fetchCompanies(selectedRep);
        }
      } else {
        toast.error(result.error || "فشل الذكاء الاصطناعي في معالجة البيانات.");
      }
    } catch (err) {
      console.error("خطأ معالجة الذكاء الاصطناعي للبيانات العشوائية", err);
      toast.error("حدث خطأ أثناء الاتصال بخادم الذكاء الاصطناعي.");
    } finally {
      setIsCleaningAi(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpEmail.trim() || !newEmpUsername.trim() || !newEmpPassword.trim()) {
      setEmpActionError("الاسم، البريد، اسم المستخدم، وكلمة المرور حقول إجبارية.");
      return;
    }
    setEmpActionLoading(true);
    setEmpActionError("");
    setEmpActionSuccess("");
    setLatestWhatsappUrl("");
    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEmpName,
          email: newEmpEmail,
          phone: newEmpPhone,
          department: newEmpDept,
          "اسم المستخدم": newEmpUsername,
          "كلمة المرور": newEmpPassword
        })
      });
      const data = await response.json();
      if (response.ok) {
        setEmpActionSuccess(`تم إضافة المندوب ${newEmpName} بنجاح!`);
        if (data.whatsappUrl) {
          setLatestWhatsappUrl(data.whatsappUrl);
        }
        setNewEmpName("");
        setNewEmpEmail("");
        setNewEmpPhone("");
        setNewEmpDept("المبيعات");
        setNewEmpUsername("");
        setNewEmpPassword("");
        fetchEmployees();
      } else {
        setEmpActionError(data.error || "فشل إضافة المندوب.");
      }
    } catch (err) {
      console.error("خطأ أثناء إضافة المندوب", err);
      setEmpActionError("حدث خطأ في الشبكة أثناء الاتصال بالخادم.");
    } finally {
      setEmpActionLoading(false);
    }
  };

  const handleDeleteEmployee = async (id: string | number, name: string) => {
    if (!(await toast.confirm(`هل أنت متأكد من رغبتك في حذف وإلغاء تفويض المندوب: ${name}؟`))) {
      return;
    }
    setEmpActionLoading(true);
    setEmpActionError("");
    setEmpActionSuccess("");
    try {
      const response = await fetch(`/api/employees/${id}`, {
        method: "DELETE"
      });
      if (response.ok) {
        setEmpActionSuccess(`تم حذف المندوب ${name} بنجاح.`);
        fetchEmployees();
      } else {
        const data = await response.json();
        setEmpActionError(data.error || "فشل حذف المندوب.");
      }
    } catch (err) {
      console.error("خطأ أثناء حذف المندوب", err);
      setEmpActionError("حدث خطأ في الشبكة.");
    } finally {
      setEmpActionLoading(false);
    }
  };

  const handleUpdateCompany = async (companyId: string | number, updatedFields: any) => {
    try {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updatedFields,
          "المندوب": selectedRep || updatedFields["مسؤول المبيعات"] || "مؤيدة"
        })
      });
      if (response.ok) {
        setSelectedCompany(null);
        if (isManagerMode) {
          fetchAllManagerData();
        } else {
          fetchCompanies(selectedRep);
        }
      } else {
        const result = await response.json();
        toast.error(result.error || "فشل تحديث بيانات الشركة.");
      }
    } catch (err) {
      console.error("خطأ أثناء تحديث بيانات الشركة", err);
    }
  };

  const handleDeleteCompany = async (companyId: string | number, companyName: string) => {
    if (!(await toast.confirm(`هل أنت متأكد من رغبتك في حذف العميل: ${companyName}؟`))) {
      return;
    }
    try {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        toast.success("تم حذف العميل بنجاح.");
        if (isManagerMode) {
          fetchAllManagerData();
        } else {
          fetchCompanies(selectedRep);
        }
      } else {
        const result = await response.json();
        toast.error(result.error || "فشل حذف العميل.");
      }
    } catch (err) {
      console.error("خطأ أثناء حذف الشركة", err);
    }
  };

  const handleExportToExcel = () => {
    const targetList = isManagerMode ? managerCompanies : companies;
    if (targetList.length === 0) {
      toast.error("لا توجد بيانات عملاء لتصديرها.");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(targetList);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "العملاء");
    worksheet["!dir"] = "rtl";
    XLSX.writeFile(workbook, "تصدير_العملاء.xlsx");
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleImportExcel(e);
  };

  // تحميل إعدادات البيئة والموظفين وعروض الأسعار عند بدء التشغيل
  // fetchConfig عام (لا يتطلب مصادقة) — يُنفّذ عند الإقلاع
  useEffect(() => {
    fetchConfig();
  }, []);

  // باقي البيانات تتطلب مصادقة — تُجلب بعد تسجيل الدخول فقط لتفادي أخطاء 401
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchEmployees();
    fetchAppSettings();
    fetchQuotations();
    fetchAccountingRequests();
  }, [isLoggedIn]);

  // جلب الطلبات المحاسبية عند تفعيل التبويب المخصص لها
  useEffect(() => {
    if (activeTab === "accounting") {
      fetchAccountingRequests();
    }
  }, [activeTab]);

  // تهيئة مراقب حالة مصادقة قوقل
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleAccessToken(token);
        setGoogleStatusMsg("متصل بحساب Google بنجاح 🟢");
      },
      () => {
        setGoogleUser(null);
        setGoogleAccessToken(null);
        setGoogleStatusMsg("");
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setGoogleErrorMsg("");
    setGoogleStatusMsg("");
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleAccessToken(result.accessToken);
        setGoogleStatusMsg("متصل بحساب Google بنجاح 🟢");
      }
    } catch (err: any) {
      console.error("Google Login Error:", err);
      setGoogleErrorMsg("فشل تسجيل الدخول بـ Google. يرجى التحقق من الاتصال.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    setIsGoogleLoading(true);
    try {
      await logoutGoogle();
      setGoogleUser(null);
      setGoogleAccessToken(null);
      setGoogleStatusMsg("");
    } catch (err) {
      console.error("Google Logout Error:", err);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // تسجيل الدخول الآمن والفوري والمشفر بـ Google للبوابة كاملة
  const handleGoogleLoginForApp = async () => {
    setLoginError("");
    setLoading(true);
    try {
      const result = await googleSignIn();
      if (!result) {
        throw new Error("لم يتم الحصول على بيانات تسجيل الدخول من Google.");
      }
      const email = result.user.email;
      if (!email) {
        throw new Error("بريد Google غير متوفر.");
      }
      
      const response = await fetch("/api/login/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) setAuthToken(data.token);
        setGoogleUser(result.user);
        setGoogleAccessToken(result.accessToken);

        if (data.role === "manager") {
          setIsLoggedIn(true);
          setIsManagerMode(true);
          setSuccessMsg("مرحباً بك مجدداً يا حضرة المدير العام! تم تسجيل الدخول الآمن بـ Google بنجاح 🟢");
          fetchAllManagerData();
        } else if (data.role === "rep") {
          setSelectedRep(data.user.name);
          setIsLoggedIn(true);
          setIsManagerMode(false);
          setNewCompanyRep(data.user.name);
          setSuccessMsg(`مرحباً بك مجدداً يا ${data.user.name}! تم تسجيل دخولك الآمن بـ Google بنجاح 🟢`);
          fetchCompanies(data.user.name);
        }
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        const err = await response.json();
        setLoginError(err.error || "عذراً، حساب Google هذا غير مسجل في المنظومة كعضو معتمد.");
        await logoutGoogle();
      }
    } catch (err: any) {
      console.error(err);
      setLoginError(err.message || "فشل تسجيل الدخول الآمن بـ Google. يرجى التحقق وإعادة المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  // إنشاء ورقة قوقل شيت جديدة في حساب المستخدم
  const handleCreateGoogleSheet = async () => {
    if (!googleAccessToken) {
      toast.error("الرجاء تسجيل الدخول بـ Google أولاً.");
      return;
    }
    setIsGoogleLoading(true);
    setGoogleErrorMsg("");
    setGoogleStatusMsg("جاري إنشاء جدول بيانات Google Sheets جديد...");
    try {
      const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          properties: {
            title: "عملاء بورتال مبيعات ExpoTime CRM"
          }
        })
      });

      if (!response.ok) {
        throw new Error("فشل إنشاء الملف في Google Sheets.");
      }

      const data = await response.json();
      const sheetId = data.spreadsheetId;
      const sheetUrl = data.spreadsheetUrl;

      setGoogleSheetId(sheetId);
      setGoogleSheetUrl(sheetUrl);
      localStorage.setItem("expo_google_sheet_id", sheetId);
      localStorage.setItem("expo_google_sheet_url", sheetUrl);
      await saveAppSettings({ googleSheetId: sheetId, googleSheetUrl: sheetUrl });

      setGoogleStatusMsg("تم إنشاء ورقة Google Sheet جديدة وربطها بنجاح! 🎉");
      toast.success("تم إنشاء جدول البيانات الجديد بنجاح! يمكنك تصدير أو استيراد البيانات إليه الآن.");
    } catch (err: any) {
      console.error(err);
      setGoogleErrorMsg("حدث خطأ أثناء إنشاء ورقة Google Sheets: " + err.message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // مزامنة وتصدير جميع العملاء إلى قوقل شيت
  const handleExportToGoogleSheets = async () => {
    if (!googleAccessToken) {
      toast.error("الرجاء تسجيل الدخول بـ Google أولاً.");
      return;
    }
    if (!googleSheetId) {
      toast.error("الرجاء ربط أو إنشاء ملف Google Sheet أولاً.");
      return;
    }

    const targetList = isManagerMode ? managerCompanies : companies;
    if (targetList.length === 0) {
      toast.error("لا توجد بيانات عملاء حالية للتصدير.");
      return;
    }

    if (!(await toast.confirm(`هل أنت متأكد من رغبتك في تصدير ومزامنة ${targetList.length} عميل إلى جدول Google Sheet؟ سيقوم هذا باستبدال المحتوى بالكامل.`))) {
      return;
    }

    setIsGoogleLoading(true);
    setGoogleErrorMsg("");
    setGoogleStatusMsg("جاري تصدير وتزامن البيانات مع Google Sheets...");

    try {
      const headers = [
        "كود الشركة",
        "اسم الشركة",
        "النشاط",
        "المدينة",
        "الجوال الرئيسي",
        "البريد الإلكتروني",
        "الحالة",
        "مسؤول المبيعات",
        "الأولوية",
        "آخر تواصل",
        "ملاحظات",
        "المصدر"
      ];

      const rows = targetList.map((c) => [
        getSafeString(c["كود الشركة"]),
        getSafeString(c["اسم الشركة"]),
        getSafeString(c["النشاط"]),
        getSafeString(c["المدينة"]),
        getSafeString(c["الجوال الرئيسي"]),
        getSafeString(c["البريد الإلكتروني"]),
        getSafeString(c["الحالة"]),
        getSafeString(c["مسؤول المبيعات"]),
        getSafeString(c["الأولوية"]),
        getSafeString(c["آخر تواصل"]),
        getSafeString(c["ملاحظات"]),
        getSafeString(c["المصدر"] || "بورتال مبيعات ExpoTime")
      ]);

      const values = [headers, ...rows];

      // 1. مسح البيانات القديمة أولاً في النطاق لضمان عدم وجود بيانات متداخلة أو معلقة
      try {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}/values/A1:Z10000:clear`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${googleAccessToken}`,
              "Content-Type": "application/json"
            }
          }
        );
      } catch (clearErr) {
        console.warn("فشل تفريغ الورقة تلقائياً، جاري المتابعة للكتابة المباشرة:", clearErr);
      }

      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}/values/A1:Z10000?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            range: "A1:Z10000",
            majorDimension: "ROWS",
            values: values
          })
        }
      );

      if (!response.ok) {
        throw new Error("فشل إرسال البيانات إلى Google Sheets.");
      }

      setGoogleStatusMsg("تم تصدير وتحديث جميع البيانات في قوقل شيت بنجاح! 🟢");
      toast.success(`تم بنجاح تصدير ومزامنة ${targetList.length} عميل لجدول Google Sheet الخاص بك.`);
    } catch (err: any) {
      console.error(err);
      setGoogleErrorMsg("فشل تصدير ومزامنة البيانات: " + err.message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // استيراد ومزامنة العملاء من قوقل شيت
  const handleImportFromGoogleSheets = async () => {
    if (!googleAccessToken) {
      toast.error("الرجاء تسجيل الدخول بـ Google أولاً.");
      return;
    }
    if (!googleSheetId) {
      toast.error("الرجاء ربط أو إنشاء ملف Google Sheet أولاً.");
      return;
    }

    setIsGoogleLoading(true);
    setGoogleErrorMsg("");
    setGoogleStatusMsg("جاري جلب وقراءة البيانات من Google Sheets...");

    try {
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}/values/A1:Z5000?valueRenderOption=FORMATTED_VALUE`,
        {
          headers: {
            "Authorization": `Bearer ${googleAccessToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error("فشل قراءة الملف من Google Sheets. يرجى التأكد من الرمز وإذن الوصول.");
      }

      const data = await response.json();
      const values = data.values;

      if (!values || values.length < 2) {
        throw new Error("جدول قوقل شيت فارغ أو لا يحتوي على صفوف بيانات صالحة.");
      }

      const headers = values[0];
      const rawRows = values.slice(1).map((row: any) => {
        const obj: any = {};
        headers.forEach((h: string, idx: number) => {
          obj[h] = row[idx] !== undefined ? row[idx] : "";
        });
        return obj;
      });

      const normalizeText = (text: string): string => {
        if (!text) return "";
        return text
          .trim()
          .toLowerCase()
          .replace(/[أإآا]/g, "ا")
          .replace(/[ة]/g, "ه")
          .replace(/[ىي]/g, "ي")
          .replace(/[\s\-_]/g, "");
      };

      const findValueFuzzy = (row: any, keywords: string[]): string => {
        const keys = Object.keys(row);
        const normalizedKeywords = keywords.map(kw => normalizeText(kw));
        
        for (const normKeyword of normalizedKeywords) {
          const foundKey = keys.find(k => {
            const normKey = normalizeText(k);
            return normKey === normKeyword || normKey.includes(normKeyword) || normKeyword.includes(normKey);
          });
          if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
            return String(row[foundKey]).trim();
          }
        }
        return "";
      };

      const mappedRows = rawRows.map((row: any) => {
        const companyName = findValueFuzzy(row, ["اسم الشركة", "شركة", "الاسم", "عميل", "مؤسسة", "الجهة", "المنشأة", "العملاء", "الاسم الكامل", "اسم العميل", "company", "firm", "name", "customer", "client", "business", "corp", "org"]);
        const companyCode = findValueFuzzy(row, ["كود الشركة", "كود", "رمز", "رقم العميل", "رقم الشركة", "معرف", "مسلسل", "م", "الرقم", "رقم", "code", "id", "number", "serial", "no", "seq", "compcode"]);
        const activity = findValueFuzzy(row, ["النشاط", "النشاط التجاري", "مجال", "قطاع", "تصنيف", "نوع", "تخصص", "مجال العمل", "activity", "type", "category", "sector", "industry", "field"]);
        const city = findValueFuzzy(row, ["المدينة", "عنوان", "موقع", "بلد", "منطقة", "فرع", "الموقع", "الدولة", "city", "address", "location", "region", "branch", "country"]);
        const phone = findValueFuzzy(row, ["الجوال الرئيسي", "جوال", "هاتف", "تلفون", "موبايل", "رقم", "اتصال", "تواصل", "رقم الجوال", "رقم الهاتف", "الجوال", "الهاتف", "phone", "mobile", "tel", "contact", "cell"]);
        const email = findValueFuzzy(row, ["البريد الإلكتروني", "البريد", "إيميل", "الكتروني", "الايميل", "بريد الكتروني", "email", "mail", "e-mail"]);
        const status = findValueFuzzy(row, ["الحالة", "الوضع", "وضع", "حالة الشركة", "حالة التواصل", "status", "stage", "state"]);
        const salesRep = findValueFuzzy(row, ["مسؤول المبيعات", "مسؤول", "مندوب", "بائع", "موظف", "المندوب", "اسم المندوب", "الأخصائي", "sales", "rep", "agent", "seller", "employee", "handler", "staff"]);
        const priority = findValueFuzzy(row, ["الأولوية", "اهتمام", "مهم", "درجة", "الاولوية", "درجة الاهتمام", "درجة الأهمية", "priority", "importance", "rating", "level"]);
        const lastContact = findValueFuzzy(row, ["آخر تواصل", "تاريخ", "تواصل", "اخر تواصل", "تاريخ التواصل", "تاريخ اخر تواصل", "last", "contact", "date", "touch"]);
        const notes = findValueFuzzy(row, ["ملاحظات", "ملخص", "وصف", "تفاصيل", "ملاحظات وتوجيهات", "ملاحظات المندوب", "ملحوظة", "بينات إضافية", "notes", "remarks", "comment", "description", "details"]);

        return {
          "اسم الشركة": getSafeString(companyName),
          "كود الشركة": getSafeString(companyCode),
          "النشاط": getSafeString(activity || "معارض وفعاليات"),
          "المدينة": getSafeString(city || "الرياض"),
          "الجوال الرئيسي": formatPhone(String(phone || "")),
          "البريد الإلكتروني": formatEmail(getSafeString(email || "")),
          "الحالة": getSafeString(status || "جديد"),
          "مسؤول المبيعات": getSafeString(salesRep || selectedRep || "مؤيدة"),
          "الأولوية": getSafeString(priority || "متوسطة"),
          "آخر تواصل": getSafeString(lastContact || ""),
          "ملاحظات": getSafeString(notes || ""),
          "المصدر": "جدول قوقل شيت مستورد"
        };
      }).filter((r: any) => r["اسم الشركة"].trim() !== "");

      const totalRecords = mappedRows.length;
      if (totalRecords === 0) {
        throw new Error("فشل العثور على أي حقول مطابقة (مثل 'اسم الشركة') داخل جدول قوقل شيت. يرجى التأكد من احتواء الجدول على اسم الشركة على الأقل.");
      }

      const batchSize = 200;
      let successCount = 0;
      let skippedCount = 0;
      const skippedList: any[] = [];

      for (let i = 0; i < mappedRows.length; i += batchSize) {
        const chunk = mappedRows.slice(i, i + batchSize);
        const batchResponse = await fetch("/api/companies/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companies: chunk }),
        });

        if (batchResponse.ok) {
          const result = await batchResponse.json();
          successCount += result.count || 0;
          skippedCount += result.skippedCount || 0;
          if (result.skipped) skippedList.push(...result.skipped);
        } else {
          const errResult = await batchResponse.json().catch(() => ({}));
          if (errResult.error === "ALL_DUPLICATE_COMPANIES") {
            skippedCount += chunk.length;
            if (errResult.skipped) skippedList.push(...errResult.skipped);
          } else {
            console.error("فشل استيراد الدفعة:", errResult.message || batchResponse.statusText);
          }
        }
      }

      setExcelImportResult({
        count: successCount,
        skippedCount: skippedCount,
        skipped: skippedList
      });

      setGoogleStatusMsg(`تم مزامنة واستيراد ${successCount} شركة جديدة بنجاح!`);
      toast.success(`تم الاستيراد بنجاح! تم إضافة ${successCount} عميل جديد، وتخطي ${skippedCount} مكرر.`);
      
      // تحديث البيانات
      if (isManagerMode) {
        fetchAllManagerData();
      } else {
        fetchCompanies(selectedRep);
      }

    } catch (err: any) {
      console.error(err);
      setGoogleErrorMsg("حدث خطأ أثناء الاستيراد والمزامنة: " + err.message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // دالة استيراد شركات من ملف إكسل بطريقة متطورة وذكية
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<any>(worksheet);

        if (rawRows.length === 0) {
          toast.error("الملف فارغ أو غير صالح للاستيراد.");
          setLoading(false);
          return;
        }

        // تحري وتطويع أسماء الأعمدة غير المنظمة واستخراج البيانات بدقة وذكاء فائق
        const mappedRows = rawRows.map((row: any) => {
          const companyName = findValueFuzzy(row, ["اسم الشركة", "شركة", "الاسم", "عميل", "مؤسسة", "الجهة", "المنشأة", "العملاء", "الاسم الكامل", "اسم العميل", "company", "firm", "name", "customer", "client", "business", "corp", "org"]);
          const companyCode = findValueFuzzy(row, ["كود الشركة", "كود", "رمز", "رقم العميل", "رقم الشركة", "معرف", "مسلسل", "م", "الرقم", "رقم", "code", "id", "number", "serial", "no", "seq", "compcode"]);
          const activity = findValueFuzzy(row, ["النشاط", "النشاط التجاري", "مجال", "قطاع", "تصنيف", "نوع", "تخصص", "مجال العمل", "activity", "type", "category", "sector", "industry", "field"]);
          const city = findValueFuzzy(row, ["المدينة", "عنوان", "موقع", "بلد", "منطقة", "فرع", "الموقع", "الدولة", "city", "address", "location", "region", "branch", "country"]);
          const phone = findValueFuzzy(row, ["الجوال الرئيسي", "جوال", "هاتف", "تلفون", "موبايل", "رقم", "اتصال", "تواصل", "رقم الجوال", "رقم الهاتف", "الجوال", "الهاتف", "phone", "mobile", "tel", "contact", "cell"]);
          const email = findValueFuzzy(row, ["البريد الإلكتروني", "البريد", "إيميل", "الكتروني", "الايميل", "بريد الكتروني", "email", "mail", "e-mail"]);
          const status = findValueFuzzy(row, ["الحالة", "الوضع", "وضع", "حالة الشركة", "حالة التواصل", "status", "stage", "state"]);
          const salesRep = findValueFuzzy(row, ["مسؤول المبيعات", "مسؤول", "مندوب", "بائع", "موظف", "المندوب", "اسم المندوب", "الأخصائي", "sales", "rep", "agent", "seller", "employee", "handler", "staff"]);
          const priority = findValueFuzzy(row, ["الأولوية", "اهتمام", "مهم", "درجة", "الاولوية", "درجة الاهتمام", "درجة الأهمية", "priority", "importance", "rating", "level"]);
          const lastContact = findValueFuzzy(row, ["آخر تواصل", "تاريخ", "تواصل", "اخر تواصل", "تاريخ التواصل", "تاريخ اخر تواصل", "last", "contact", "date", "touch"]);
          const notes = findValueFuzzy(row, ["ملاحظات", "ملخص", "وصف", "تفاصيل", "ملاحظات وتوجيهات", "ملاحظات المندوب", "ملحوظة", "بينات إضافية", "notes", "remarks", "comment", "description", "details"]);

          return {
            "اسم الشركة": getSafeString(companyName),
            "كود الشركة": getSafeString(companyCode),
            "النشاط": getSafeString(activity || "معارض وفعاليات"),
            "المدينة": getSafeString(city || "الرياض"),
            "الجوال الرئيسي": formatPhone(String(phone || "")),
            "البريد الإلكتروني": formatEmail(getSafeString(email || "")),
            "الحالة": getSafeString(status || "جديد"),
            "مسؤول المبيعات": getSafeString(salesRep || selectedRep || "مؤيدة"),
            "الأولوية": getSafeString(priority || "متوسطة"),
            "آخر تواصل": getSafeString(lastContact || ""),
            "ملاحظات": getSafeString(notes || ""),
            "المصدر": "ملف إكسل مستورد"
          };
        }).filter(r => r["اسم الشركة"].trim() !== "");

        const totalRecords = mappedRows.length;
        if (totalRecords === 0) {
          toast.error("فشل العثور على أي حقول مطابقة (مثل 'اسم الشركة') داخل ملف الإكسل المرفوع. يرجى التأكد من احتواء الملف على اسم الشركة على الأقل.");
          setLoading(false);
          setImportProgress(null);
          return;
        }

        const batchSize = 200;
        let successCount = 0;
        let skippedCount = 0;
        const skippedList: any[] = [];

        for (let i = 0; i < mappedRows.length; i += batchSize) {
          const chunk = mappedRows.slice(i, i + batchSize);
          const response = await fetch("/api/companies/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companies: chunk }),
          });

          if (response.ok) {
            const result = await response.json();
            successCount += result.count || 0;
            skippedCount += result.skippedCount || 0;
            if (result.skipped) skippedList.push(...result.skipped);
          } else {
            const errResult = await response.json().catch(() => ({}));
            if (errResult.error === "ALL_DUPLICATE_COMPANIES") {
              skippedCount += chunk.length;
              if (errResult.skipped) skippedList.push(...errResult.skipped);
            } else {
              console.error("فشل استيراد الدفعة:", errResult.message || response.statusText);
            }
          }

          const currentProgress = Math.min(100, Math.round(((i + chunk.length) / mappedRows.length) * 100));
          setImportProgress({
            current: i + chunk.length,
            total: mappedRows.length,
            percentage: currentProgress,
          });
        }

        toast.success(`تمت عملية الاستيراد بنجاح! 🟢\nتم استيراد ${successCount} شركة جديدة.\nتم تخطي ${skippedCount} شركة مكررة.`);
        
        if (isManagerMode) {
          fetchAllManagerData();
        } else {
          fetchCompanies(selectedRep);
        }
      } catch (err: any) {
        console.error("خطأ أثناء قراءة ملف الإكسل:", err);
        toast.error("حدث خطأ أثناء معالجة ملف الإكسل. يرجى التأكد من صحة الملف وصيغته.");
      } finally {
        setLoading(false);
        setImportProgress(null);
        if (e.target) e.target.value = "";
      }
    };

    reader.readAsBinaryString(file);
  };

    // استخراج المندوب الأكثر تفوقاً
  const weeklyChampion = useMemo(() => {
    if (delegateAnalytics.length === 0) return null;
    return [...delegateAnalytics].sort((a, b) => b.signedAgreements - a.signedAgreements)[0];
  }, [delegateAnalytics]);

  // استخراج أداء وتقييم تواصل المندوب الحالي النشط
  const myAnalytics = useMemo(() => {
    return delegateAnalytics.find(row => getSafeString(row.delegate).trim() === getSafeString(selectedRep).trim()) || {
      delegate: selectedRep,
      totalCompanies: companies.length,
      totalContacted: 0,
      profilesSent: 0,
      designsRequested: 0,
      quotesSent: 0,
      signedAgreements: 0,
      uninterested: 0,
      conversionRate: 0,
      weeklyActionsCount: 0,
      monthlyActionsCount: 0,
      weeklyRating: "خامل ومقصر 💤",
      weeklyColor: "text-slate-500 bg-slate-50 border-slate-200",
      monthlyRating: "أداء خامل ⚠️",
      monthlyColor: "text-rose-700 bg-rose-50 border-rose-250",
      effortScore: 0
    };
  }, [delegateAnalytics, selectedRep, companies]);

  // استخراج تنبيهات المتابعة الذكية (مواعيد اليوم والردود المتأخرة على العروض المرسلة)
  const followupAlerts = useMemo(() => {
    const alerts: { type: "offer" | "appointment"; company: Company; daysCount?: number; description: string }[] = [];
    
    // تحديد قائمة الشركات المستهدفة للفحص
    const targetCompanies = isManagerMode ? managerCompanies : companies;
    if (!targetCompanies || targetCompanies.length === 0) return [];

    const todayDateStr = new Date().toISOString().split("T")[0]; // yyyy-mm-dd
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayNum = today.getTime();

    targetCompanies.forEach((c) => {
      // إذا كان مندوباً وليس مديرًا، نتحقق أن الملف يخصه
      const isOwner = isManagerMode || getSafeString(c["مسؤول المبيعات"]).trim() === getSafeString(selectedRep).trim();
      if (!isOwner) return;

      const lastContactDateStr = getSafeString(c["آخر تواصل"]);
      if (!lastContactDateStr) return;

      // مقارنة التواريخ
      const contactDateStrOnly = lastContactDateStr.split("T")[0];
      const contactDate = new Date(contactDateStrOnly);
      contactDate.setHours(0, 0, 0, 0);
      const contactNum = contactDate.getTime();

      const diffTime = todayNum - contactNum;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      const status = getSafeString(c["الحالة"]);

      // 1. تنبيه العروض المرسلة بعد 3 أيام دون رد
      if (status === "تم إرسال العرض") {
        if (diffDays >= 3) {
          alerts.push({
            type: "offer",
            company: c,
            daysCount: diffDays,
            description: `تم إرسال العرض المالي منذ ${diffDays} أيام ولم يتغير وضع الفايل بعد.`
          });
        }
      }

      // 2. المكالمات والمواعيد حسب الوقت المحدد (إذا كان تاريخ الموعد هو اليوم)
      if (contactDateStrOnly === todayDateStr) {
        alerts.push({
          type: "appointment",
          company: c,
          description: `لديك موعد تواصل معتمد ومكالمة مجدولة اليوم لإكمال المناقشة.`
        });
      }
    });

    return alerts;
  }, [managerCompanies, companies, isManagerMode, selectedRep]);

  // ألوانbadges الحالة المتناسقة مع المظهر الفاتح الراقي لـ ExpoTime CRM
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "جديد":
        return "bg-slate-100 text-slate-700 border border-slate-200 font-medium";
      case "تم التواصل":
        return "bg-blue-50 text-blue-700 border border-blue-200 font-medium";
      case "تم إرسال البروفايل":
        return "bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium";
      case "تم طلب التصميم":
        return "bg-purple-50 text-purple-700 border border-purple-200 font-medium";
      case "تم إرسال العرض":
        return "bg-pink-50 text-pink-700 border border-pink-200 font-medium";
      case "تفاوض":
        return "bg-orange-50 text-orange-700 border border-orange-200 font-medium";
      case "تم التعميد":
        return "bg-emerald-50 text-emerald-700 border border-emerald-350 font-bold";
      case "تم التنفيذ":
        return "bg-teal-50 text-teal-700 border border-teal-350 font-bold";
      case "غير مهتم":
        return "bg-rose-50 text-rose-700 border border-rose-200 font-medium";
      default:
        return "bg-slate-50 text-slate-500 border border-slate-200";
    }
  };

  const handleAdminLogin = async (e: React.FormEvent, isSales: boolean = false) => {
    e.preventDefault();
    setLoading(true);
    setLoginError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) setAuthToken(data.token);
        setIsLoggedIn(true);
        if (data.role === "manager") {
          setIsManagerMode(true);
          setSuccessMsg("مرحباً بك مجدداً يا حضرة المدير العام! تم تسجيل الدخول الآمن بنجاح 🟢");
          fetchAllManagerData();
        } else {
          setSelectedRep(data.user.name);
          setIsManagerMode(false);
          setNewCompanyRep(data.user.name);
          setSuccessMsg(`مرحباً بك مجدداً يا ${data.user.name}! تم تسجيل دخولك بنجاح 🟢`);
          fetchCompanies(data.user.name);
        }
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        const err = await response.json();
        setLoginError(err.error || "اسم المستخدم أو كلمة المرور غير صحيحة.");
      }
    } catch (err: any) {
      console.error(err);
      setLoginError("حدث خطأ أثناء الاتصال بالخادم. يرجى إعادة المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  // ألوان badges الأولوية للثيم الفاتح
  const getPriorityBadgeStyle = (priority: string) => {
    switch (priority) {
      case "عالية":
        return "bg-rose-50 text-rose-700 border border-rose-200 font-medium";
      case "متوسطة":
        return "bg-amber-50 text-amber-700 border border-amber-200 font-medium";
      case "منخفضة":
        return "bg-slate-50 text-slate-500 border border-slate-200 font-medium";
      default:
        return "bg-slate-50 text-slate-500 border border-slate-200";
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans relative antialiased text-slate-800 pb-12" style={{ direction: "rtl" }} id="main-app-root">
      
      {!isLoggedIn ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 relative overflow-hidden w-full">
          {/* خلفية جمالية ملونة */}
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-slate-100 to-blue-50/40 z-0" />
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-100/50 overflow-hidden relative z-10"
            id="login-card"
          >
            {/* الهيدر الخاص بكارت تسجيل الدخول */}
            <div className="p-8 pb-6 text-center border-b border-slate-100">
              <div className="inline-flex p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/20 mb-4">
                <ShieldCheck className="w-8 h-8 text-amber-300" />
              </div>
              <h1 className="text-xl font-black text-slate-950">بوابة الدخول الموحدة</h1>
              <p className="text-xs text-slate-500 font-bold mt-1.5">نظام متابعة المناديب الذكي • ExpoTime CRM</p>
            </div>

            {/* سويتش التبديل بين المناديب والإدارة */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 p-1">
              <button
                onClick={() => {
                  setLoginTab("sales");
                  setLoginError("");
                }}
                className={`flex-1 py-3 text-xs font-black rounded-xl transition-all cursor-pointer ${loginTab === "sales" ? "bg-white text-blue-600 shadow-xs border border-slate-150" : "text-slate-500 hover:text-slate-800"}`}
              >
                بوابة مناديب المبيعات
              </button>
              <button
                onClick={() => {
                  setLoginTab("admin");
                  setLoginError("");
                }}
                className={`flex-1 py-3 text-xs font-black rounded-xl transition-all cursor-pointer ${loginTab === "admin" ? "bg-white text-slate-900 shadow-xs border border-slate-150" : "text-slate-500 hover:text-slate-800"}`}
              >
                بوابة الإدارة والمشرفين
              </button>
            </div>

            <div className="p-8 space-y-6">
              {loginError && (
                <div className="bg-rose-50 border border-rose-150 text-rose-700 p-3.5 rounded-xl text-xs font-bold text-center">
                  {loginError}
                </div>
              )}

              <form onSubmit={(e) => handleAdminLogin(e, loginTab === "sales")} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">اسم المستخدم المعين لك:</label>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="أدخل اسم المستخدم"
                    className="w-full text-xs rounded-xl border border-slate-200 px-4 py-3 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 text-slate-800 font-bold focus:outline-hidden transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">الرمز السري المعتمد:</label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    className="w-full text-xs rounded-xl border border-slate-200 px-4 py-3 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 text-slate-800 focus:outline-hidden transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full font-bold text-xs text-white rounded-xl py-3.5 shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${loginTab === "sales" ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10" : "bg-slate-900 hover:bg-slate-850 shadow-slate-900/10"}`}
                >
                  <span>{loading ? "جاري التحقق والولوج..." : loginTab === "sales" ? "تسجيل الدخول كمندوب مبيعات" : "تسجيل الدخول كمدير للنظام"}</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div className="px-8 py-5 text-center text-[10px] text-slate-400 border-t border-slate-100 bg-slate-50 font-bold">
              معارض ومؤتمرات ExpoTime © 2026 • نظام متابعة المناديب الذكي وعروض الأسعار
            </div>
          </motion.div>
        </div>
      ) : (
  /* ================= 3. شاشة لوحة البيانات وإدارة الشركات للمندوب والمدير ================= */
          <div className="flex flex-col lg:flex-row gap-6 w-full items-start" id="dashboard-container">
            
            {/* شريط علوي ذكي للهواتف مع زر للتحكم بالقوائم */}
            <div className="lg:hidden w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-650 text-white rounded-xl shadow-xs shrink-0 cursor-pointer" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                  <Menu className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-800">بوابة المعارض</h2>
                  <p className="text-[9px] text-slate-500 font-bold">الموقع: {isManagerMode ? "لوحة الإدارة" : "لوحة المندوب"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-600/10 font-sans"
              >
                <Menu className="w-3.5 h-3.5" />
                <span>أقسام البوابة ☰</span>
              </button>
            </div>

            {/* القائمة الجانبية للتنقل الذكي RTL (Dynamic Adaptive Sidebar) */}
            <div className={`${isSidebarOpen ? "block animate-fade-in" : "hidden lg:block"} w-full lg:w-68 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5 shrink-0 transition-all duration-300`} id="sidebar-layout">
              {/* شعار الشركة و معلومات المستخدم */}
              <div className="space-y-4 border-b border-slate-150 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-650 text-white rounded-xl shadow-md shrink-0">
                    <svg className="w-6 h-6 text-[#facc15] fill-current" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15.5h-2v-2h2v2zm0-4.5h-2V7h2v6z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-1000 leading-tight">بوابة المعارض</h2>
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">ExpoTime CRM</p>
                  </div>
                </div>

                {/* بطاقة المستخدم المتصل */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col gap-1 text-right select-none">
                  <span className="text-[9px] text-[#2563eb] font-extrabold uppercase tracking-wider">
                    {isManagerMode ? "مدير ومسؤول النظام" : "مندوب المبيعات المعتمد"}
                  </span>
                  <div className="text-xs font-black text-slate-800 truncate">
                    {isManagerMode ? "نبيل الزبير" : selectedRep}
                  </div>
                  {!isManagerMode && repEmail && (
                    <div className="text-[9px] text-slate-500 font-mono truncate pt-0.5">
                      {repEmail}
                    </div>
                  )}
                </div>
              </div>

              {/* خدمات وأقسام المنظومة المتاحة */}
              <div className="space-y-1.5">
                <p className="text-[9.5px] text-slate-400 font-extrabold px-1 pb-1 uppercase tracking-wide">أقسام ومصادر البيانات:</p>
                
                {isManagerMode ? (
                  <>
                    <button
                      onClick={() => selectTab("dashboard")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "dashboard" ? "bg-blue-600 text-white shadow-md shadow-blue-600/10 font-bold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold"}`}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 animate-pulse" />
                        <span>لوحة الأداء والتحليلات</span>
                      </div>
                    </button>

                    <button
                      onClick={() => selectTab("companies")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "companies" ? "bg-blue-600 text-white shadow-md shadow-blue-600/10 font-bold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        <span>دليل الشركات والعملاء</span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${activeTab === "companies" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-655"}`}>
                        {managerCompanies.length}
                      </span>
                    </button>

                    <button
                      onClick={() => selectTab("import")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "import" ? "bg-blue-600 text-white shadow-md shadow-blue-600/10 font-bold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        <span>إكسل وإضافة عملاء</span>
                      </div>
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${activeTab === "import" ? "bg-blue-700 text-white" : "bg-emerald-50 text-emerald-700"}`}>XLSX</span>
                    </button>

                    <button
                      onClick={() => selectTab("users")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "users" ? "bg-blue-600 text-white shadow-md shadow-blue-600/10" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 animate-bounce" style={{ animationDuration: "3s" }} />
                        <span>تسجيل وإلغاء المستخدمين</span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${activeTab === "users" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-655"}`}>
                        {employees.length}
                      </span>
                    </button>

                    <button
                      onClick={() => selectTab("accounting")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "accounting" ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        <span>طلبات المحاسبة والمستندات 📊</span>
                      </div>
                    </button>

                    <button
                      onClick={() => selectTab("diagnostics")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "diagnostics" ? "bg-blue-600 text-white shadow-md shadow-blue-600/10" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>لوحة التحكم وإعدادات الربط ⚙️</span>
                      </div>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => selectTab("dashboard")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "dashboard" ? "bg-blue-600 text-white shadow-md shadow-blue-600/10 font-bold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold"}`}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        <span>لوحة الأداء والمتابعة</span>
                      </div>
                    </button>

                    <button
                      onClick={() => selectTab("companies")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "companies" ? "bg-blue-600 text-white shadow-md shadow-blue-600/10 font-bold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        <span>شركاتي وقائمتي المبيعية</span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${activeTab === "companies" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-655"}`}>
                        {companies.length}
                      </span>
                    </button>

                    <button
                      onClick={() => selectTab("accounting")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "accounting" ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        <span>طلبات المحاسبة والمستندات 📊</span>
                      </div>
                    </button>

                    <button
                      onClick={() => selectTab("import")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${activeTab === "import" ? "bg-blue-600 text-white shadow-md shadow-blue-600/10 font-bold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        <span>إضافة عميل يدوياً</span>
                      </div>
                    </button>
                  </>
                )}
              </div>

              {/* ذيل وتحديثات القائمة الجانبية للمستندات */}
              <div className="pt-4 border-t border-slate-150 space-y-2 select-none font-bold">
                <button
                  onClick={() => { if (isManagerMode) { fetchAllManagerData(); } else { fetchCompanies(selectedRep); } }}
                  className="w-full flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50/50 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingManagerData ? "animate-spin text-blue-600" : ""}`} />
                  <span>تحديث ومزامنة البيانات</span>
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 text-xs text-rose-600 hover:bg-rose-50 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>تسجيل خروج المنظومة</span>
                </button>
              </div>
            </div>

            {/* الجزء الرئيسي للمحتوى والتبويبات المقسمة لـ ExpoTime */}
            <div className="flex-1 w-full space-y-6">

              {/* ب. رسالة النجاح في حال العمليات الناجحة */}
              {successMsg && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-2xl text-xs font-bold shadow-xs flex items-center gap-2"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping gap-1"></span>
                  <span>{successMsg}</span>
                </motion.div>
              )}
            {/* جـ. لوحة إضافة بيانات جديدة واستيراد إكسل المتكاملة والأنيقة */}
            <AnimatePresence>
              {activeTab === "import" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Plus className="w-5 h-5 text-blue-600" />
                      <h3 className="font-bold text-sm text-slate-900">إضافة عملاء جدد لقاعدة البيانات</h3>
                    </div>
                    {/* تبديل التاب */}
                    <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg flex-wrap">
                      <button
                        onClick={() => setImportTab("excel")}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${importTab === "excel" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500"}`}
                      >
                        استيراد ملف إكسل (XLSX)
                      </button>
                      <button
                        onClick={() => setImportTab("google-sheets")}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${importTab === "google-sheets" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500"}`}
                      >
                        ربط ومزامنة Google Sheets 📊
                      </button>
                      <button
                        onClick={() => setImportTab("manual")}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${importTab === "manual" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500"}`}
                      >
                        إدخال عميل يدوي جديد
                      </button>
                      <button
                        onClick={() => setImportTab("ai-clean")}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${importTab === "ai-clean" ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs font-black animate-pulse" : "text-slate-500 hover:text-indigo-650"}`}
                      >
                        تنظيم وتطهير بالذكاء الاصطناعي ✨
                      </button>
                    </div>
                  </div>

                  {importTab === "excel" && (
                    /* واجهة سحب وإفلات لملف الإكسل */
                    <div className="space-y-4 text-center">
                      {importProgress ? (
                        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-8 text-center space-y-4 shadow-sm max-w-2xl mx-auto">
                          <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse" />
                              جاري معالجة ورفع جهات الاتصال لقاعدة البيانات...
                            </span>
                            <span className="font-mono text-sm bg-blue-600 text-white px-2 py-0.5 rounded-lg">{importProgress.percentage}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-3.5 overflow-hidden">
                            <div 
                              className="bg-blue-600 h-full rounded-full transition-all duration-350 ease-out" 
                              style={{ width: `${importProgress.percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed font-bold">
                            تمت مزامنة ورفع <span className="font-mono text-blue-800 text-[13px] bg-slate-100 px-1.5 py-0.5 rounded">{importProgress.current.toLocaleString()}</span> جهة اتصال من أصل <span className="font-mono text-blue-800 text-[13px] bg-slate-100 px-1.5 py-0.5 rounded">{importProgress.total.toLocaleString()}</span> في الملف.
                          </p>
                          <p className="text-[10px] text-slate-500 animate-pulse">
                            ⚠️ الرجاء عدم إغلاق بورتال مبيعات وعملاء ExpoTime حتى تكتمل عملية الاستيراد بنجاح.
                          </p>
                        </div>
                      ) : (
                        <div className="border-4 border-dashed border-slate-200 hover:border-blue-300 rounded-2xl p-8 transition-colors relative flex flex-col items-center justify-center bg-slate-50/50">
                          <Upload className="w-12 h-12 text-blue-500 mb-3" />
                          <h4 className="font-extrabold text-sm text-slate-800">اسحب وأفلت ملف الـ Excel هنا</h4>
                          <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                            يرجى اختيار ملف بامتداد (.xlsx) أو (.csv). سيتعرف النظام تلقائياً على الأعمدة العربية مثل "اسم الشركة" و "الجوال" ويقوم بمزامنتها مباشرة.
                          </p>
                          
                          <label className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" />
                            <span>تصفح ملفات جهازك</span>
                            <input 
                              type="file" 
                              accept=".xlsx, .csv" 
                              onChange={handleExcelImport} 
                              className="hidden" 
                            />
                          </label>
                        </div>
                      )}

                      <div className="bg-amber-50 border border-amber-250 rounded-xl p-4 text-right text-[11px] text-amber-900 leading-relaxed max-w-2xl mx-auto space-y-1">
                        <span className="font-bold block text-amber-950">💡 صيغة الملف المثالية لضمان المزامنة في Baserow:</span>
                        <p>
                          يجب أن تشتمل الأعمدة الرئيسية على التالي كحد أدنى وتتواءم مسمياتها: 
                          <span className="underline font-bold px-1 text-blue-800">"اسم الشركة"</span> أو "الاسم" • 
                          <span className="underline font-bold px-1 text-blue-800">"الجوال الرئيسي"</span> أو "الجوال" • 
                          <span className="underline font-bold px-1 text-blue-800">"البريد الإلكتروني"</span> أو "البريد" • 
                          <span className="underline font-bold px-1 text-blue-800">"النشاط"</span>.
                        </p>
                      </div>
                    </div>
                  )}

                  {importTab === "google-sheets" && (
                    /* واجهة ربط وتكامل جوجل شيت */
                    <div className="space-y-6 text-right">
                      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm flex items-center justify-center">
                            {/* Google Logo */}
                            <svg className="w-7 h-7" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.81-2.63-.81-3.07-.81-3.63z" />
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm text-slate-800 font-sans">حالة الربط مع حساب Google Workspace</h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {googleUser ? `متصل بالبريد: ${googleUser.email}` : "قم بتسجيل الدخول لتمكين ربط جداول البيانات وقراءة ملفاتك"}
                            </p>
                          </div>
                        </div>

                        <div>
                          {googleUser ? (
                            <button
                              onClick={handleGoogleLogout}
                              disabled={isGoogleLoading}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>قطع الاتصال بحساب Google</span>
                            </button>
                          ) : (
                            <button
                              onClick={handleGoogleSignIn}
                              disabled={isGoogleLoading}
                              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-blue-600/10 transition-all cursor-pointer flex items-center gap-2"
                            >
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              </svg>
                              <span>تسجيل الدخول الآمن بـ Google</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {googleUser && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-5 border border-slate-150 rounded-2xl p-5 bg-slate-50/50"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* إدخال أو ربط ملف */}
                            <div className="space-y-1.5 text-right">
                              <label className="font-extrabold text-xs text-slate-700">كود ملف Google Sheet الخاص بك (Spreadsheet ID)</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={googleSheetId}
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    setGoogleSheetId(val);
                                    localStorage.setItem("expo_google_sheet_id", val);
                                    
                                    // إذا تم توفير ID كامل أو رابط كامل، فلنحاول استخلاص الـ ID
                                    if (val.includes("docs.google.com/spreadsheets")) {
                                      const matches = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                                      if (matches && matches[1]) {
                                        setGoogleSheetId(matches[1]);
                                        localStorage.setItem("expo_google_sheet_id", matches[1]);
                                        setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${matches[1]}`);
                                        localStorage.setItem("expo_google_sheet_url", `https://docs.google.com/spreadsheets/d/${matches[1]}`);
                                      }
                                    } else {
                                      const url = val ? `https://docs.google.com/spreadsheets/d/${val}` : "";
                                      setGoogleSheetUrl(url);
                                      localStorage.setItem("expo_google_sheet_url", url);
                                    }
                                  }}
                                  placeholder="مثال: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800 text-xs font-mono text-left"
                                  dir="ltr"
                                />
                                {googleSheetId && (
                                  <a
                                    href={googleSheetUrl || `https://docs.google.com/spreadsheets/d/${googleSheetId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center border border-slate-200 transition-all"
                                    title="افتح جدول البيانات في علامة تبويب جديدة"
                                  >
                                    <Globe className="w-4 h-4 text-emerald-600" />
                                  </a>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400">
                                يمكنك نسخ ولصق رابط ملف قوقل شيت بالكامل، وسيتعرف النظام عليه تلقائياً.
                              </p>
                            </div>

                            {/* توليد تلقائي لجدول جديد */}
                            <div className="flex flex-col justify-end">
                              <button
                                onClick={handleCreateGoogleSheet}
                                disabled={isGoogleLoading}
                                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <FileSpreadsheet className="w-4 h-4" />
                                <span>إنشاء ملف Google Sheet جديد وتوصيله تلقائياً 📊</span>
                              </button>
                            </div>
                          </div>

                          {/* مؤشر الحالة والعمليات */}
                          {(googleStatusMsg || googleErrorMsg || isGoogleLoading) && (
                            <div className="p-3.5 rounded-xl text-xs font-bold space-y-1">
                              {isGoogleLoading && (
                                <div className="flex items-center gap-2 text-blue-800 animate-pulse">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>جاري معالجة وتدبير وتواصل عمليات Google Workspace...</span>
                                </div>
                              )}
                              {googleStatusMsg && (
                                <div className="text-emerald-700 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  <span>{googleStatusMsg}</span>
                                </div>
                              )}
                              {googleErrorMsg && (
                                <div className="text-rose-700 flex items-center gap-1.5">
                                  <AlertCircle className="w-4 h-4 text-rose-500" />
                                  <span>{googleErrorMsg}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* لوحة إجراءات التزامن */}
                          {googleSheetId && (
                            <div className="border-t border-slate-200 pt-4 mt-2">
                              <h5 className="font-extrabold text-xs text-slate-800 mb-3 block">إجراءات المزامنة والربط المباشرة مع CRM:</h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button
                                  onClick={handleExportToGoogleSheets}
                                  disabled={isGoogleLoading}
                                  className="py-4 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                                >
                                  <Upload className="w-4 h-4" />
                                  <span>تصدير وتحديث قوقل شيت بالعملاء الحاليين ⬆️</span>
                                </button>

                                <button
                                  onClick={handleImportFromGoogleSheets}
                                  disabled={isGoogleLoading}
                                  className="py-4 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                                >
                                  <Download className="w-4 h-4" />
                                  <span>استيراد وتحديث CRM من ملف قوقل شيت ⬇️</span>
                                </button>
                              </div>

                              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-right text-[11px] text-amber-900 leading-relaxed space-y-1 mt-4">
                                <span className="font-bold block text-amber-950">💡 نصيحة المزامنة الذكية:</span>
                                <p>
                                  عند قيامك بالاستيراد، يقوم محرك بورتال ExpoTime الذكي بالبحث التلقائي في جميع أعمدة ورقة العمل والتعرف تلقائياً على اسم الشركة، المدينة، الهاتف، النشاط، ومسؤول المبيعات بغض النظر عن ترتيب الأعمدة وتنزيلها وتحديثها مع منع تكرار الشركات مسبقاً.
                                </p>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  )}

                  {importTab === "manual" && (
                    /* واجهة نموذج الإدخال اليدوي */
                    <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs select-none">
                      <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">اسم الشركة / الجهة المشاركة *</label>
                        <input 
                          type="text" 
                          required 
                          value={newCompanyName} 
                          onChange={(e) => setNewCompanyName(e.target.value)}
                          placeholder="الاسم الرسمي المعتمد للشركة"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">كود الشركة (إذا لم يحدد، يتم توليده تلقائياً)</label>
                        <input 
                          type="text" 
                          value={newCompanyCode} 
                          onChange={(e) => setNewCompanyCode(e.target.value)}
                          placeholder="مثال: COMP-115"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">النشاط التجاري</label>
                        <input 
                          type="text" 
                          value={newCompanyActivity} 
                          onChange={(e) => setNewCompanyActivity(e.target.value)}
                          placeholder="مثال: مقاولات، تنظيم معارض"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">رقم الجوال الرئيسي للشركة</label>
                        <input 
                          type="tel" 
                          value={newCompanyPhone} 
                          onChange={(e) => setNewCompanyPhone(e.target.value)}
                          placeholder="مثل: 0501234567"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800 font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">البريد الإلكتروني للشركة</label>
                        <input 
                          type="email" 
                          value={newCompanyEmail} 
                          onChange={(e) => setNewCompanyEmail(e.target.value)}
                          placeholder="sales@company.com"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800 font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">المدينة مقر الشركة</label>
                        <select 
                          value={newCompanyCity} 
                          onChange={(e) => setNewCompanyCity(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800"
                        >
                          {["الرياض", "جدة", "الدمام", "الخبر", "مكة المكرمة", "المدينة المنورة", "القصيم", "تبوك", "الأحساء", "عسير"].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">مندوب المبيعات الموكل</label>
                        <select 
                          value={newCompanyRep} 
                          onChange={(e) => setNewCompanyRep(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800"
                        >
                          <option value="">حدد مندوب المبيعات</option>
                          {employees.length > 0 ? (
                            employees.map((emp) => (
                              <option key={emp.id} value={emp["الاسم"]}>
                                {emp["الاسم"]}
                              </option>
                            ))
                          ) : (
                            ["مؤيدة", "نصر", "محمود", "جميلة", "نبيل"].map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))
                          )}
                        </select>
                      </div>

                       <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">الأولوية</label>
                        <select 
                          value={newCompanyPriority} 
                          onChange={(e) => setNewCompanyPriority(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800"
                        >
                          {ALLOWED_PRIORITIES.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-extrabold text-slate-700">الحالة الأولية للتواصل</label>
                        <select 
                          value={newCompanyStatus} 
                          onChange={(e) => setNewCompanyStatus(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800"
                        >
                          {ALLOWED_STATUSES.map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-3 space-y-1">
                        <label className="font-extrabold text-slate-700">ملاحظات ووصوف التواصل المبدئي مع العميل</label>
                        <textarea 
                          rows={2}
                          value={newCompanyNotes}
                          onChange={(e) => setNewCompanyNotes(e.target.value)}
                          placeholder="مثل: اهتمام مبدئي بمساحة جناح 90 متر مربع تواصل هاتفي للتأكيد"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-850"
                        />
                      </div>

                      <div className="md:col-span-3 pt-2 text-left">
                        <button
                          type="submit"
                          disabled={isSubmittingManual}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer disabled:bg-slate-300"
                        >
                          {isSubmittingManual ? "جاري حفظ وإضافة العميل الجديد..." : "حفظ العميل الجديد فوراً"}
                        </button>
                      </div>
                    </form>
                  )}

                  {importTab === "ai-clean" && (
                    /* واجهة تنظيم جهات الاتصال بالذكاء الاصطناعي (Gemini AI) */
                    <div className="space-y-4 text-right">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
                        <span className="text-2xl animate-pulse">✨</span>
                        <div>
                          <h4 className="font-extrabold text-xs text-slate-800 font-sans">مُنظم البيانات الذكي (Gemini AI Model)</h4>
                          <p className="text-[10px] text-slate-500">انسخ والصق أي نصوص عشوائية، رسائل واتساب، أو سجلات غير مرتبة. سيقوم الذكاء الاصطناعي باستخلاص أسماء الشركات، الجوالات، وتنسيقها وترتيبها وحفظها تلقائياً.</p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-extrabold text-xs text-slate-700">ألصق هنا البيانات العشوائية أو نصوص المحادثات المبعثرة:</label>
                        <textarea
                          rows={6}
                          value={aiInputText}
                          onChange={(e) => setAiInputText(e.target.value)}
                          placeholder="مثال: شركة نماء للتجارة جوالهم 0551122334 ومقرهم الرياض مهتمين بالمعرض."
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white text-slate-800 font-medium text-xs font-sans leading-relaxed"
                        />
                      </div>

                      <div className="flex justify-between items-center flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleAiCleanSubmit}
                          disabled={isCleaningAi}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/10 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Sparkles className={`w-4 h-4 ${isCleaningAi ? "animate-spin" : ""}`} />
                          <span>{isCleaningAi ? "جاري المعالجة والتحليل والتنظيم..." : "رتب ونظّم جهات الاتصال بالذكاء الاصطناعي 🚀"}</span>
                        </button>

                        {aiCleanResult.length > 0 && googleSheetId && (
                          <button
                            type="button"
                            onClick={handleExportToGoogleSheets}
                            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>مزامنة جهات الاتصال المنظمة مع قوقل شيت المعتمد 📊</span>
                          </button>
                        )}
                      </div>

                      {aiCleanResult.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-slate-200">
                          <h5 className="font-black text-xs text-slate-850">الشركات المستخلصة والمنظمة حديثاً ({aiCleanResult.length})</h5>
                          <div className="overflow-x-auto border border-slate-150 rounded-xl max-h-[250px] overflow-y-auto">
                            <table className="w-full text-right border-collapse text-[11px]">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-150 text-slate-600 font-bold">
                                  <th className="py-2.5 px-3">اسم الشركة</th>
                                  <th className="py-2.5 px-3">الكود</th>
                                  <th className="py-2.5 px-3">النشاط</th>
                                  <th className="py-2.5 px-3">المدينة</th>
                                  <th className="py-2.5 px-3">الجوال</th>
                                  <th className="py-2.5 px-3">الأولوية</th>
                                  <th className="py-2.5 px-3">الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {aiCleanResult.map((comp, idx) => (
                                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                                    <td className="py-2 px-3 font-bold text-slate-800">{getSafeString(comp["اسم الشركة"])}</td>
                                    <td className="py-2 px-3 font-mono">{getSafeString(comp["كود الشركة"])}</td>
                                    <td className="py-2 px-3 text-slate-600">{getSafeString(comp["النشاط"])}</td>
                                    <td className="py-2 px-3">{getSafeString(comp["المدينة"])}</td>
                                    <td className="py-2 px-3 font-mono font-bold text-slate-700">{getSafeString(comp["الجوال الرئيسي"])}</td>
                                    <td className="py-2 px-3">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                        comp["الأولوية"] === "عالية" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"
                                      }`}>
                                        {getSafeString(comp["الأولوية"])}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3">
                                      <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                        {getSafeString(comp["الحالة"])}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
 
            {/* تسجيل وإلغاء تفويض مندوبي المبيعات (Active User Management Panel) */}
            {activeTab === "users" && isManagerMode && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6"
                id="inline-users-panel"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600 animate-pulse" />
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900">إدارة صلاحيات المستخدمين والمناديب</h3>
                      <p className="text-[10px] text-slate-550">توجيه وإضافة أو إلغاء صلاحيات ممثلي المبيعات بمتابعة المعارض</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* نموذج إضافة مندوب جديد */}
                  <div className="lg:col-span-1 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
                      <UserPlus className="w-4 h-4 text-blue-600" />
                      <h4 className="font-extrabold text-xs text-slate-800">تسجيل وتفويض مندوب جديد</h4>
                    </div>

                    {empActionError && (
                      <div className="p-3 bg-rose-50 border border-rose-250 text-rose-800 rounded-xl text-xs font-bold leading-relaxed">
                        <p>{empActionError}</p>
                      </div>
                    )}

                    {empActionSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold leading-relaxed space-y-2">
                        <p>{empActionSuccess}</p>
                        {latestWhatsappUrl && (
                          <div className="pt-1">
                            <a
                              href={latestWhatsappUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg shadow-sm transition-all cursor-pointer text-[11px]"
                            >
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-200"></span>
                              </span>
                              <span>إرسال التفاصيل لواتساب المدير فورا 💬</span>
                            </a>
                            <p className="text-[9px] text-emerald-600 mt-1 font-semibold">إذا لم يفتح الواتساب تلقائياً كعلامة تبويب جديدة، يرجى الضغط على الزر أعلاه 🚀</p>
                          </div>
                        )}
                      </div>
                    )}

                    <form onSubmit={handleAddEmployee} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-600 block flex justify-start">الاسم الكامل للمندوب:</label>
                        <input
                          type="text"
                          required
                          value={newEmpName}
                          onChange={(e) => setNewEmpName(e.target.value)}
                          placeholder="مثال: مؤيدة أحمد"
                          className="w-full text-xs rounded-xl border border-slate-250 px-3.5 py-3 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:outline-hidden font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-600 block font-bold flex justify-start">القسم:</label>
                        <select
                          value={newEmpDept}
                          onChange={(e) => setNewEmpDept(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-250 px-3.5 py-3 bg-white text-slate-800 focus:outline-hidden font-bold"
                        >
                          <option value="المبيعات">المبيعات والتسويق</option>
                          <option value="العلاقات العامة">العلاقات العامة</option>
                          <option value="الإدارة">الإشراف الإداري</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-600 block flex justify-start">البريد الإلكتروني المهني (للدخول بدون باسوورد):</label>
                        <input
                          type="email"
                          required
                          value={newEmpEmail}
                          onChange={(e) => setNewEmpEmail(e.target.value)}
                          placeholder="example@expotime.com"
                          className="w-full text-xs rounded-xl border border-slate-250 px-3.5 py-3 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:outline-hidden font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-600 block flex justify-start">رقم الجوال (اختياري):</label>
                        <input
                          type="tel"
                          value={newEmpPhone}
                          onChange={(e) => setNewEmpPhone(e.target.value)}
                          placeholder="05xxxxxxxx"
                          className="w-full text-xs rounded-xl border border-slate-250 px-3.5 py-3 bg-white text-slate-800 focus:outline-hidden font-mono"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={empActionLoading}
                        className="w-full font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl py-3.5 shadow-md shadow-blue-600/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>{empActionLoading ? "جاري الحفظ والمزامنة..." : "تأكيد إضافة وتفويض المندوب"}</span>
                      </button>
                    </form>
                  </div>

                  {/* قائمة المستخدمين الحاليين */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between select-none">
                      <h4 className="font-extrabold text-xs text-slate-700 font-bold">قائمة ممثلي المبيعات النشطين بالـ CRM ({employees.length})</h4>
                      <span className="text-[10px] text-slate-400">أي مندوب يتم حذفه من هنا سيفقد إمكانية تسجيل الدخول السري ببريده فوراً</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[450px] overflow-y-auto pr-1">
                      {employees.map((emp) => (
                        <div
                          key={emp.id}
                          className="p-4 bg-white border border-slate-250 rounded-xl flex items-center justify-between gap-3 hover:bg-slate-50 transition-all shadow-xs"
                        >
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100 uppercase select-none font-bold">
                              {emp["الاسم"]?.slice(0, 2) || "م"}
                            </div>
                            <div className="space-y-1 text-right">
                              <div className="flex items-center gap-1.5 justify-start flex-wrap">
                                <span className="font-bold text-xs text-slate-800">{emp["الاسم"]}</span>
                                <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black">
                                  {emp["القسم"] || "مبيعات"}
                                </span>
                              </div>
                              {emp["البريد الإلكتروني"] && (
                                <span className="text-[10px] text-slate-450 font-mono flex items-center gap-1 justify-start">
                                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  {emp["البريد الإلكتروني"]}
                                </span>
                              )}
                              {emp["الجوال"] && (
                                <span className="text-[10px] text-slate-450 font-mono flex items-center gap-1 justify-start font-bold">
                                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  {emp["الجوال"]}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(emp.id, emp["الاسم"])}
                            disabled={empActionLoading}
                            className="p-2.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all shrink-0 cursor-pointer text-left"
                            title="إلغاء المندوب وحذفه نهائياً"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      {employees.length === 0 && (
                        <div className="col-span-2 text-center py-12 text-xs text-slate-400 font-bold">
                          لا يوجد حالياً أي مندوبين مبيعات مسجلين في قاعدة بياناتك. يرجى تسجيل أول مندوب مبيعات لتسجيل الدخول السريع.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* لوحة متابعة طلبات المحاسبة وإقرار إضافة العملاء */}
            {activeTab === "accounting" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-right space-y-6"
                id="accounting-requests-panel"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 justify-start font-sans">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600 animate-pulse" />
                      <span>لوحة متابعة طلبات المحاسبة وإقرار تعميد العملاء 📊</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 font-sans">
                      تسمح هذه الواجهة للمحاسب (أو المدير) باتخاذ إجراء إقرار التعميد، ومطابقة البيانات الرسمية مع المرفقات وتنزيلها بضغطة زر.
                    </p>
                  </div>
                  <button
                    onClick={fetchAccountingRequests}
                    disabled={loadingAccounting}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0 self-start md:self-auto cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingAccounting ? "animate-spin text-blue-600" : ""}`} />
                    <span>تحديث القائمة</span>
                  </button>
                </div>

                {loadingAccounting ? (
                  <div className="py-20 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
                    <p className="text-xs text-slate-500 font-bold">جاري تحميل طلبات التعميد المرفوعة للمحاسب...</p>
                  </div>
                ) : accountingRequests.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-12 text-center space-y-3 select-none">
                    <div className="h-12 w-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto text-xl">📁</div>
                    <p className="text-xs text-slate-500 font-extrabold font-sans">لا توجد طلبات تعميد أو مستندات مرفوعة للمحاسب حالياً.</p>
                    <p className="text-[10px] text-slate-450 font-sans">
                      عند قيام المندوب بتغيير حالة عرض سعر إلى "تم التعميد" وتعبئة الرقم الضريبي ورفع المرفقات الرسمية، ستظهر الطلبات كبنود معلقة هنا.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      {accountingRequests.map((req) => {
                        const isPending = req.status === "معلق";
                        return (
                          <div
                            key={req.id}
                            className={`border rounded-2xl p-5 transition-all shadow-xs bg-white text-right space-y-4 ${
                              isPending ? "border-amber-200 ring-2 ring-amber-500/5 hover:border-amber-300" : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {/* الرأس: تفاصيل العميل والمسؤول */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                              <div className="space-y-1 text-right">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                                    طلب #{req.id?.slice(-6) || "N/A"}
                                  </span>
                                  <h4 className="font-extrabold text-sm text-slate-800">{req.companyName}</h4>
                                </div>
                                <p className="text-[10px] text-slate-450 font-sans">
                                  المعرض: <b className="text-slate-600">{req.exhibition || "غير محدد"}</b> | المبلغ الإجمالي للمطالبة المالية: <b className="text-emerald-600 font-mono">{req.amount} ريال</b>
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-sans">
                                  المندوب المسؤول: <b>{req.repName}</b>
                                </span>
                                {isPending ? (
                                  <span className="bg-amber-100 text-amber-800 text-[9.5px] font-black px-2.5 py-1 rounded-full animate-pulse">
                                    ⏳ معلق - بانتظار اتخاذ إجراء
                                  </span>
                                ) : (
                                  <span className="bg-emerald-100 text-emerald-800 text-[9.5px] font-black px-2.5 py-1 rounded-full">
                                    🟢 مكتمل - تم إضافة العميل
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* الحقول الرقمية والمستندات */}
                            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                              <span className="text-[10px] font-black text-slate-600 block border-b border-slate-200 pb-1.5">
                                📑 البيانات والمستندات الثبوتية القانونية للعميل:
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* 1. الرقم الضريبي */}
                                <div className="bg-white p-3 rounded-lg border border-slate-150 space-y-2">
                                  <span className="text-[10px] text-slate-400 block">الرقم الضريبي</span>
                                  <b className="text-xs text-slate-800 font-mono block select-all">{req.taxNumber || "—"}</b>
                                  {req.taxNumberFileContent ? (
                                    <a
                                      href={req.taxNumberFileContent}
                                      download={req.taxNumberFileName || "tax_certificate"}
                                      className="text-[9.5px] text-blue-600 hover:text-blue-800 font-black flex items-center gap-1 cursor-pointer select-none"
                                    >
                                      📥 تنزيل شهادة الضريبة المرفقة
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-bold block">❌ لم يتم إرفاق ملف</span>
                                  )}
                                </div>

                                {/* 2. السجل التجاري */}
                                <div className="bg-white p-3 rounded-lg border border-slate-150 space-y-2">
                                  <span className="text-[10px] text-slate-400 block">السجل التجاري</span>
                                  <b className="text-xs text-slate-800 font-mono block select-all">{req.crNumber || "—"}</b>
                                  {req.crNumberFileContent ? (
                                    <a
                                      href={req.crNumberFileContent}
                                      download={req.crNumberFileName || "cr_certificate"}
                                      className="text-[9.5px] text-blue-600 hover:text-blue-800 font-black flex items-center gap-1 cursor-pointer select-none"
                                    >
                                      📥 تنزيل وثيقة السجل التجاري
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-bold block">❌ لم يتم إرفاق ملف</span>
                                  )}
                                </div>

                                {/* 3. العنوان الوطني */}
                                <div className="bg-white p-3 rounded-lg border border-slate-150 space-y-2">
                                  <span className="text-[10px] text-slate-400 block">العنوان الوطني</span>
                                  <b className="text-xs text-slate-800 font-mono block select-all">{req.nationalAddress || "—"}</b>
                                  {req.nationalAddressFileContent ? (
                                    <a
                                      href={req.nationalAddressFileContent}
                                      download={req.nationalAddressFileName || "national_address"}
                                      className="text-[9.5px] text-blue-600 hover:text-blue-800 font-black flex items-center gap-1 cursor-pointer select-none"
                                    >
                                      📥 تنزيل وثيقة العنوان الوطني
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-bold block">❌ لم يتم إرفاق ملف</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* الجزء السفلي: زر الأكشن للمحاسب */}
                            {isPending ? (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/50 border border-amber-100 rounded-xl p-3.5">
                                <div className="text-right">
                                  <span className="text-[10px] text-amber-800 font-black block">📝 إجراء المحاسب المطلوب:</span>
                                  <span className="text-[9.5px] text-slate-500 font-bold block">مطابقة السندات ثم إضافتها في البرنامج المحاسبي الرسمي للشركة وتعميد التعميد.</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAccountingRequestStatus(req.id, "مكتمل")}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-all shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 shrink-0"
                                >
                                  ✅ تم اتخاذ الإجراء وإضافة العميل للنظام الرسمي
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 justify-start select-none">
                                <span>🟢 تم اتخاذ الإجراء المالي بواسطة المحاسب، وتمت إضافة بيانات العميل ومستنداته إلى البرنامج المحاسبي بنجاح! 🎉</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* إعدادات الربط السحابي ومزامنة البيانات */}
            {activeTab === "diagnostics" && isManagerMode && (
              <motion.div
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm text-right space-y-6"
                id="inline-diagnostics-panel"
              >
                {/* لوحة إدارة وضبط الخدمات السحابية للشركة (قوقل شيت ودرايف والمحاسب) */}
                <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 space-y-6 text-right">
                  <div className="flex items-center gap-2 border-b border-slate-700/50 pb-3">
                    <CloudLightning className="w-5 h-5 text-blue-400 animate-pulse" />
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-100 font-sans">لوحة التحكم في ربط قوقل شيت وجوجل درايف والمحاسب الموحدة ⚙️</h4>
                      <p className="text-[10px] text-slate-400 font-sans">خاص بالمدير - هذه الإعدادات تُحفظ مركزياً على الخادم لضمان استقرار ومزامنة جميع المناديب مع نفس المصادر</p>
                    </div>
                  </div>

                  {/* 1. رابط قوقل شيت الموحد للجميع */}
                  <div className="bg-emerald-950/40 border border-emerald-900/50 rounded-xl p-4 space-y-3">
                    <span className="font-extrabold text-xs text-emerald-400 flex items-center gap-1 justify-start">
                      🟢 ملف قوقل شيت الموحد لحفظ جميع عملاء المناديب:
                    </span>
                    {googleSheetId ? (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-300 font-sans leading-relaxed">
                          تم ربط ملف العمل الرئيسي بنجاح. يمكن لجميع المندوبين تصدير ومزامنة بيانات العملاء إليه مباشرة.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <a
                            href={googleSheetUrl || `https://docs.google.com/spreadsheets/d/${googleSheetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg text-center transition-all flex items-center gap-1 justify-center shadow-md shadow-emerald-900/30 font-sans"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>عرض وفتح ملف قوقل شيت الموحد 🔗</span>
                          </a>
                          <button
                            onClick={async () => {
                              if (!googleAccessToken) {
                                toast.error("الرجاء ربط حساب Google أولاً عبر زر تسجيل الدخول أعلاه.");
                                return;
                              }
                              await handleExportToGoogleSheets();
                            }}
                            className="bg-slate-700 hover:bg-slate-650 text-slate-100 text-xs font-bold px-4 py-2 rounded-lg text-center transition-all flex items-center gap-1 justify-center border border-slate-600 cursor-pointer font-sans"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>مزامنة وتصدير العملاء فورياً للشيت 🚀</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-right font-sans">
                        <p className="text-xs text-amber-300">
                          لم يتم إنشاء أو ربط ورقة عمل موحدة للعملاء بعد.
                        </p>
                        {googleUser && (
                          <button
                            onClick={handleCreateGoogleSheet}
                            disabled={isGoogleLoading}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-4 py-2.5 rounded-lg transition-all cursor-pointer"
                          >
                            إنشاء ورقة قوقل شيت موحدة للجميع فوراً ➕
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 2. تعديل الحقول الموحدة */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 text-right">
                        <label className="font-bold text-xs text-slate-300 font-sans">كود ملف قوقل شيت (Spreadsheet ID) أو الرابط:</label>
                        <input
                          type="text"
                          value={googleSheetId}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setGoogleSheetId(val);
                            if (val.includes("docs.google.com/spreadsheets")) {
                              const matches = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                              if (matches && matches[1]) {
                                setGoogleSheetId(matches[1]);
                                setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${matches[1]}`);
                              }
                            } else {
                              setGoogleSheetUrl(val ? `https://docs.google.com/spreadsheets/d/${val}` : "");
                            }
                          }}
                          placeholder="ألصق كود الشيت أو الرابط هنا للربط"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs font-mono text-left"
                          dir="ltr"
                        />
                      </div>

                      <div className="space-y-1.5 text-right">
                        <label className="font-bold text-xs text-slate-300 font-sans">البريد الإلكتروني للمحاسب المعتمد (أ. جمال):</label>
                        <input
                          type="email"
                          value={accountantEmail}
                          onChange={(e) => setAccountantEmail(e.target.value.trim())}
                          placeholder="jamal@expo-time.co"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs font-mono text-left"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 text-right">
                        <label className="font-bold text-xs text-slate-300 font-sans">معرف مجلد Google Drive المرتبط بالمستندات (Folder ID):</label>
                        <input
                          type="text"
                          value={googleDriveFolderId}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setGoogleDriveFolderId(val);
                            if (val.includes("drive.google.com")) {
                              const matches = val.match(/\/folders\/([a-zA-Z0-9-_]+)/);
                              if (matches && matches[1]) {
                                setGoogleDriveFolderId(matches[1]);
                                setGoogleDriveFolderUrl(`https://drive.google.com/drive/folders/${matches[1]}`);
                              }
                            } else {
                              setGoogleDriveFolderUrl(val ? `https://drive.google.com/drive/folders/${val}` : "");
                            }
                          }}
                          placeholder="ألصق كود مجلد درايف (مثال: 1zYxWvUt...)"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs font-mono text-left"
                          dir="ltr"
                        />
                      </div>

                      <div className="space-y-1.5 text-right">
                        <label className="font-bold text-xs text-slate-300 font-sans">رابط مجلد Google Drive المعتمد:</label>
                        <input
                          type="text"
                          value={googleDriveFolderUrl}
                          onChange={(e) => setGoogleDriveFolderUrl(e.target.value.trim())}
                          placeholder="رابط مجلد قوقل درايف للمستندات"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs font-mono text-left"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    {googleDriveFolderId && (
                      <div className="pt-1 flex justify-start">
                        <a
                          href={googleDriveFolderUrl || `https://drive.google.com/drive/folders/${googleDriveFolderId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-450 hover:text-blue-300 text-xs font-bold flex items-center gap-1 font-sans"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>تصفح وفتح مجلد درايف المعتمد لحفظ المستندات 📁</span>
                        </a>
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-700/50 space-y-3 text-right">
                      {isSavingSettings && (
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2 text-right transition-all">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-300 font-bold">{settingsUploadStatus}</span>
                            <span className="text-xs font-mono text-blue-400 font-bold">{settingsUploadProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-blue-500 h-full rounded-full transition-all duration-300" 
                              style={{ width: `${settingsUploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 items-center">
                        {settingsUploadStatus && settingsUploadProgress === 100 && (
                          <span className="text-xs text-emerald-400 font-bold font-sans animate-pulse">
                            ✓ تم الرفع والتعميم بنجاح 100%!
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={isSavingSettings}
                          onClick={async () => {
                            setIsSavingSettings(true);
                            setSettingsUploadProgress(15);
                            setSettingsUploadStatus("جاري مراجعة صحة المدخلات والروابط... 🔍");
                            
                            await new Promise(resolve => setTimeout(resolve, 600));
                            setSettingsUploadProgress(45);
                            setSettingsUploadStatus("جاري تهيئة حزم الإعدادات الموحدة للرفع... 📦");
                            
                            await new Promise(resolve => setTimeout(resolve, 500));
                            setSettingsUploadProgress(75);
                            setSettingsUploadStatus("جاري رفع البيانات وتحديث الإعدادات الموحدة على خادم السيرفر... 📤");
                            
                            const success = await saveAppSettings({
                              googleSheetId,
                              googleSheetUrl,
                              googleDriveFolderId,
                              googleDriveFolderUrl,
                              accountantEmail,
                            });
                            
                            await new Promise(resolve => setTimeout(resolve, 600));
                            
                            if (success) {
                              setSettingsUploadProgress(100);
                              setSettingsUploadStatus("تم الرفع والتعميم الموحد لجميع المناديب بنجاح! 🟢🚀");
                              setTimeout(() => {
                                setIsSavingSettings(false);
                                setSettingsUploadStatus(null);
                                setSettingsUploadProgress(0);
                              }, 3500);
                            } else {
                              setIsSavingSettings(false);
                              setSettingsUploadStatus(null);
                              setSettingsUploadProgress(0);
                              toast.error("حدث خطأ أثناء الاتصال بالسيرفر لحفظ الإعدادات.");
                            }
                          }}
                          className={`bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold px-6 py-3 rounded-xl shadow-lg shadow-blue-900/40 transition-all flex items-center gap-2 cursor-pointer font-sans ${isSavingSettings ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {isSavingSettings ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                              <span>جاري الرفع والتعميم...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>حفظ وتثبيت الإعدادات الموحدة لجميع المناديب 💾</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* د. لوحة الأداء والتنبيهات المبيعية الذكية الموحدة للجميع */}
            {activeTab === "dashboard" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
                id="crm-dashboard-portal"
              >
                {/* 1. قسم التنبيهات المبيعية الذكية الفورية */}
                <div className="bg-white p-6 border border-slate-200 shadow-sm rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-rose-50 border border-rose-250 rounded-xl text-rose-600 animate-pulse">
                        <Bell className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-950 text-sm">مركز التنبيهات الذكية وإشعارات المتابعة المجدولة</h3>
                        <p className="text-[10px] text-slate-500">مكالمات مجدولة اليوم وعروض أسعار مرسلة دون رد بعد 3 أيام أو أكثر</p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-100 px-2 py-0.5 rounded-full font-bold">
                      {followupAlerts.length} تنبيهات معلقة
                    </span>
                  </div>

                  {followupAlerts.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs select-none">
                      🎉 ممتاز! لا توجد عروض متأخرة أو مواعيد تواصل معلقة بدون رد حالياً. كل الملفات محدثة أولاً بأول.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {followupAlerts.map((alert, idx) => (
                        <div 
                          key={idx} 
                          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                            alert.type === "offer" 
                              ? "bg-rose-50/40 border-rose-150" 
                              : "bg-emerald-50/20 border-emerald-150"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="text-base mt-0.5">
                              {alert.type === "offer" ? "⏳" : "📞"}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-black text-slate-900 text-xs">{getSafeString(alert.company["اسم الشركة"])}</span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                  alert.type === "offer" 
                                    ? "bg-rose-50 text-rose-700 border-rose-200" 
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}>
                                  {alert.type === "offer" ? "عرض سعر معلق" : "موعد تواصل اليوم"}
                                </span>
                              </div>
                              <p className="text-[10.5px] text-slate-600 mt-1 leading-relaxed">
                                {alert.description}
                              </p>
                              <div className="text-[9.5px] text-slate-400 font-mono mt-1">
                                مسؤول المبيعات: {getSafeString(alert.company["مسؤول المبيعات"])} • اتصال رئيسي: {getSafeString(alert.company["الجوال الرئيسي"])}
                              </div>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => {
                              setSelectedCompany(alert.company);
                            }}
                            className="self-end px-3 py-1.5 bg-white text-slate-700 border border-slate-200 hover:border-blue-500 hover:text-blue-600 text-[10.5px] font-bold rounded-lg transition-all shadow-xs cursor-pointer"
                          >
                            فتح سجل التواصل والتحديث المباشر ←
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. قسم التحليلات التفصيلي */}
                {isManagerMode ? (
                  <div className="bg-white p-6 border border-slate-250 shadow-sm rounded-2xl space-y-6" id="manager-analytics-panel">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-200 pb-4 gap-4">
                      <div className="flex items-center gap-2.5">
                        <TrendingUp className="w-6 h-6 text-indigo-650" />
                        <div>
                          <h3 className="font-black text-slate-900 text-base">منظومة إحصائيات الأعمال المبيعية</h3>
                          <p className="text-xs text-slate-550">تتبع مستويات التعميد وعقود المندوبين المتصلة بجدول Baserow</p>
                        </div>
                      </div>

                      {/* فلاتر رصد الأسبوع أو التراكمي */}
                      <div className="flex bg-slate-100 p-1 rounded-xl self-end text-xs">
                        <button
                          onClick={() => setSelectedWeekFilter("current_week")}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${selectedWeekFilter === "current_week" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-indigo-800"}`}
                        >
                          متابعة الأسبوع الحالي (7 أيام)
                        </button>
                        <button
                          onClick={() => setSelectedWeekFilter("all_time")}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${selectedWeekFilter === "all_time" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-indigo-800"}`}
                        >
                          تتبع الإجمالي التراكمي
                        </button>
                      </div>
                    </div>

                    {loadingManagerData ? (
                      <div className="flex justify-center items-center py-12 gap-2 text-slate-500 text-sm">
                        <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                        <span>جاري تجميع وحساب أرقام مندوبي المبيعات من Baserow...</span>
                      </div>
                    ) : (
                      <>
                        {/* البطل الأسبوعي أو أعلى إنجاز تم */}
                        {weeklyChampion && weeklyChampion.totalContacted > 0 && (
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">🏆</span>
                              <div>
                                <span className="text-xs text-indigo-600 font-extrabold">المندوب المتصدر في قفل العقود ({selectedWeekFilter === "current_week" ? "لهذا الأسبوع" : "تراكمياً"})</span>
                                <h4 className="text-base font-extrabold text-slate-900 mt-0.5">المندوب: {weeklyChampion.delegate}</h4>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-center">
                              <div className="bg-white px-3 py-1.5 rounded-lg border border-indigo-150">
                                <span className="text-[10px] text-slate-500 block">العقود المعمدة</span>
                                <span className="text-sm font-black text-emerald-600">{weeklyChampion.signedAgreements} عقود عمد</span>
                              </div>
                              <div className="bg-white px-3 py-1.5 rounded-lg border border-indigo-150">
                                <span className="text-[10px] text-slate-500 block">معدل تحويل الصفقات</span>
                                <span className="text-sm font-black text-indigo-600">{weeklyChampion.conversionRate}%</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* قسم أفضل العملاء والمشاركين وفقاً للتعميد وقيمة العروض المقدمة */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-right">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-lg">⭐</span>
                              <div>
                                <h4 className="font-extrabold text-xs text-slate-900 font-sans">أفضل العملاء والمشاركين بالمعرض (VIP Clients)</h4>
                                <p className="text-[10px] text-slate-500">العملاء الأكثر قيمة من حيث حجم عروض الأسعار المسجلة وحالة التعميد الفعلي</p>
                              </div>
                            </div>
                            <span className="text-[10px] bg-blue-50 text-blue-800 border border-blue-100 px-2 py-0.5 rounded-md font-bold">
                              رصد آلي ذكي
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                            {topClients.map((tc, idx) => (
                              <div 
                                key={idx}
                                className={`p-3.5 bg-white border rounded-xl flex flex-col justify-between gap-2.5 transition-all shadow-xs relative overflow-hidden ${
                                  tc.isApproved 
                                    ? "border-emerald-250 bg-emerald-50/5 hover:bg-emerald-50/10" 
                                    : "border-slate-200 hover:border-slate-350"
                                }`}
                              >
                                {tc.isApproved && (
                                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl">
                                    معمد وموثق
                                  </div>
                                )}
                                
                                <div className="space-y-1">
                                  <span className="text-[10px] text-slate-400 font-bold block">الترتيب #{idx + 1}</span>
                                  <h5 className="font-black text-slate-800 text-xs line-clamp-1">{getSafeString(tc.company["اسم الشركة"])}</h5>
                                  <span className="text-[9px] text-slate-500 block">كود: {getSafeString(tc.company["كود الشركة"])}</span>
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400">قيمة العروض:</span>
                                    <span className="font-black text-indigo-600 font-mono">{tc.totalQuoteValue.toLocaleString()} ريال</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400">عدد العروض:</span>
                                    <span className="font-bold text-slate-600">{tc.quotesCount}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400">المندوب:</span>
                                    <span className="font-bold text-slate-600 truncate max-w-[70px]">{getSafeString(tc.company["مسؤول المبيعات"])}</span>
                                  </div>
                                </div>

                                <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                                    tc.isApproved 
                                      ? "bg-emerald-100 text-emerald-800" 
                                      : "bg-amber-100 text-amber-850"
                                  }`}>
                                    {tc.isApproved ? "تم التعميد 🟢" : getSafeString(tc.company["الحالة"])}
                                  </span>
                                  
                                  <button
                                    onClick={() => setSelectedCompany(tc.company)}
                                    className="p-1 hover:bg-slate-100 rounded text-blue-600 cursor-pointer"
                                    title="عرض كامل السجل"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {topClients.length === 0 && (
                              <div className="col-span-full text-center py-6 text-slate-400 text-xs">
                                لا توجد بيانات عملاء كافية لرصد أفضل العملاء حالياً.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* جدول المقارنة وتحليل الأداء */}
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                          <table className="w-full text-right border-collapse text-xs select-none">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black">
                                <th className="py-3 px-4">مسؤول المبيعات</th>
                                <th className="py-3 px-4 text-center">إجمالي الشركات المسندة</th>
                                <th className="py-3 px-4 text-center text-blue-600">كلم كم؟ (التواصل)</th>
                                <th className="py-3 px-4 text-center">أرسل بروفايل</th>
                                <th className="py-3 px-4 text-center text-purple-600">طلب تصميم</th>
                                <th className="py-3 px-4 text-center text-pink-600">أرسل عرض سعر 💵</th>
                                <th className="py-3 px-4 text-center text-emerald-600">كم عمد وصار عقد؟ 📋</th>
                                <th className="py-3 px-4 text-center">غير مهتم</th>
                                <th className="py-3 px-4 text-center text-indigo-700">نسبة الإنجاز %</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150 font-bold">
                              {delegateAnalytics.map(row => (
                                <tr key={row.delegate} className="hover:bg-slate-50">
                                  <td className="py-3 px-4 text-slate-900 text-sm font-extrabold">{row.delegate}</td>
                                  <td className="py-3 px-4 text-center text-slate-500">{row.totalCompanies} عملاء</td>
                                  <td className="py-3 px-4 text-center text-blue-700 text-sm font-mono">{row.totalContacted} تواصل وطرقات</td>
                                  <td className="py-3 px-4 text-center text-slate-600">{row.profilesSent}</td>
                                  <td className="py-3 px-4 text-center text-purple-605">{row.designsRequested}</td>
                                  <td className="py-3 px-4 text-center text-pink-600 font-mono">{row.quotesSent} عروض أسعار</td>
                                  <td className="py-3 px-4 text-center">
                                    <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-2e0">
                                      {row.signedAgreements} معمد ناجح
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center text-rose-500">{row.uninterested}</td>
                                  <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <span className="font-mono text-indigo-750 text-sm">{row.conversionRate}%</span>
                                      <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                        <div className="bg-indigo-650 h-full" style={{ width: `${row.conversionRate}%` }}></div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* لوحة التقييم السلوكي ومجهود المناديب الذكية - أسبوعي وشهري */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                          <div className="border-b border-slate-200 pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <h4 className="font-extrabold text-[#1e3a8a] text-sm flex items-center gap-1">
                                <span>🎖️ لوحة تقييم ومراقبة جهود المناديب (أسبوعياً وشهرياً)</span>
                              </h4>
                              <p className="text-[10px] text-slate-500 mt-0.5">تحديث تلقائي للمجاميع ونطاقات المتابعة، والبروفايلات، وعروض الأسعار لتحديد مستوى الجهد ومكافأة المتميزين</p>
                            </div>
                            <span className="text-[10px] bg-indigo-100 text-indigo-800 border border-indigo-200 font-extrabold px-2.5 py-1 rounded-lg self-start">
                              سجل التتبع التلقائي النشط
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {delegateAnalytics.map(row => (
                              <div key={row.delegate} className="bg-white p-4 border border-slate-150 rounded-xl space-y-3 shadow-xs font-sans">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 bg-indigo-50 text-indigo-700 font-extrabold text-xs rounded-full flex items-center justify-center border border-indigo-120 uppercase">
                                      {row.delegate.slice(0, 2)}
                                    </div>
                                    <div>
                                      <h5 className="font-extrabold text-slate-900 text-xs">المندوب: {row.delegate}</h5>
                                      <span className="text-[9px] text-slate-400 block font-mono">حجم كبرى الشركات المسندة: {row.totalCompanies} شركات</span>
                                    </div>
                                  </div>
                                  
                                  {/* درجة المجهود من 100 */}
                                  <div className="text-left">
                                    <span className="text-[9px] text-slate-450 block leading-tight">علامة الجهد المئوية</span>
                                    <span className="text-sm font-black text-indigo-700 font-mono">{row.effortScore} / 100</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                  {/* التقييم الأسبوعي */}
                                  <div className={`p-2 rounded-lg border text-right space-y-0.5 ${row.weeklyColor}`}>
                                    <span className="text-[9px] text-slate-500 block">الجهد الأسبوعي (7 أيام):</span>
                                    <span className="font-extrabold text-xs block py-0.5">{row.weeklyRating}</span>
                                    <span className="text-[9px] text-slate-400 block font-mono">{row.weeklyActionsCount} متابعة دقيقة</span>
                                  </div>

                                  {/* التقييم الشهري */}
                                  <div className={`p-2 rounded-lg border text-right space-y-0.5 ${row.monthlyColor}`}>
                                    <span className="text-[9px] text-slate-500 block font-bold">الجهد الشهري (30 يوم):</span>
                                    <span className="font-extrabold text-xs block py-0.5">{row.monthlyRating}</span>
                                    <span className="text-[9px] text-slate-400 block font-mono">{row.monthlyActionsCount} متابعة إجمالية</span>
                                  </div>
                                </div>

                                {/* تعليق وتحليل الأداء الفني والتوجيه الذكي */}
                                <div className="p-2.5 bg-slate-50 rounded-xl text-[10.5px] text-slate-600 leading-normal border border-slate-100">
                                  <span className="font-extrabold text-slate-700 block mb-0.5">💡 توصية التطوير المبيعي للمشرف:</span>
                                  {row.effortScore >= 70 ? (
                                    <span>أداء عملي استثنائي يمتلك دافعية عالية! يوصى بترشيحه للحوافز الأسبوعية ورفع كفاءته لمساعدة المناديب الأقل نشاطاً.</span>
                                  ) : row.effortScore >= 35 ? (
                                    <span>نشاط مستقر ويحقق صفقات تواصل مستقرة. لزيادة التعميد، يحتاج لدفع عروض أسعار أسرع ومتابعة الاتصالات بشكل يومي ومباشر.</span>
                                  ) : (
                                    <span>الجهد متدنٍ ويؤثر على فرص الحصول على تعميد المعرض. يرجى توجيهه للاتصال الهاتفي بالعملاء الجدد واستنهاض الملفات الراكدة.</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="bg-white p-6 border border-slate-200 shadow-sm rounded-2xl space-y-4">
                    <h4 className="text-slate-900 font-extrabold text-sm border-b border-slate-100 pb-2">📊 تحليلات أدائك ومؤشراتك الفردية</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2 select-none">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                        <span className="text-[10px] text-slate-500 block mb-1">إجمالي شركاتك</span>
                        <span className="text-xl font-black text-slate-900">{companies.length} عملاء</span>
                      </div>
                      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-150">
                        <span className="text-[10px] text-blue-600 block mb-1">مسار التواصل الفاعل</span>
                        <span className="text-xl font-black text-blue-700">
                          {companies.filter(c => getSafeString(c["الحالة"]) !== "جديد").length} تواصل
                        </span>
                      </div>
                      <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-150">
                        <span className="text-[10px] text-emerald-600 block mb-1">صفقات عمد ونجحت</span>
                        <span className="text-xl font-black text-emerald-700">
                          {companies.filter(c => ["تم التعميد", "تم التنفيذ"].includes(getSafeString(c["الحالة"]))).length} عقود
                        </span>
                      </div>
                      <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-150">
                        <span className="text-[10px] text-indigo-650 block mb-1">معدل الإنجاز العام</span>
                        <span className="text-xl font-black text-indigo-700">
                          {companies.length > 0
                            ? Math.round((companies.filter(c => ["تم التعميد", "تم التنفيذ"].includes(getSafeString(c["الحالة"]))).length / companies.length) * 100)
                            : 0}%
                        </span>
                      </div>
                    </div>

                    {/* لوحة التقييم السلوكي الحية لمجهود المندوب الحالي */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <div>
                          <h5 className="font-extrabold text-indigo-900 text-xs text-right">🏅 تقييم مجهوداتك للأسبوع والشهر الحالي</h5>
                          <p className="text-[10px] text-slate-500 text-right">مستخرج فورياً بناءً على حجم نشاطك وتواصلاتك المقيدة بقاعدة البيانات</p>
                        </div>
                        <span className="text-[10px] bg-indigo-100 text-indigo-805 border border-indigo-200 px-2 py-0.5 rounded font-black">
                          الدرجة الحالية: {myAnalytics.effortScore} / 100
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className={`p-3 rounded-xl border text-right space-y-1 ${myAnalytics.weeklyColor || "bg-white"}`}>
                          <span className="text-[9px] text-slate-500 block">تقييمك الأسبوعي (7 أيام):</span>
                          <span className="font-extrabold text-sm block">{myAnalytics.weeklyRating}</span>
                          <p className="text-[10px] text-slate-450 font-mono">قمت بـ {myAnalytics.weeklyActionsCount || 0} متابعة وحركة تواصل مؤخراً</p>
                        </div>

                        <div className={`p-3 rounded-xl border text-right space-y-1 ${myAnalytics.monthlyColor || "bg-white"}`}>
                          <span className="text-[9px] text-slate-500 block">تقييمك الشهري (30 يوم):</span>
                          <span className="font-extrabold text-sm block">{myAnalytics.monthlyRating}</span>
                          <p className="text-[10px] text-slate-450 font-mono">قمت بـ {myAnalytics.monthlyActionsCount || 0} عملية تواصل إجمالي</p>
                        </div>
                      </div>

                      {/* توصية ذكية للتحفيز وتحسين الأرقام */}
                      <div className="p-3 bg-white border border-slate-150 rounded-xl text-xs text-slate-705 leading-relaxed text-right">
                        <span className="font-bold text-slate-800 block mb-0.5">💡 نصيحة الخبير للتفوق في معرضك:</span>
                        {myAnalytics.effortScore >= 70 ? (
                          <span>أنت تقوم بعمل مثالي ومجهودك يتكلم عن نفسه! استمر في قفل الصفقات ومتابعة العملاء الذين أرسلت لهم عروض أسعار للوصول لقمة التعميدات.</span>
                        ) : myAnalytics.effortScore >= 35 ? (
                          <span>أداؤك جيد، ولكنك تستطيع فعل المزيد! حاول تحويل العملاء المسجلين بحالة "تم إرسال بروفايل" أو "طلب تصميم" إلى تعميد حقيقي عبر الاتصال الهاتفي السريع ومناقشة تفاصيل المعرض معهم هاتفياً.</span>
                        ) : (
                          <span>مجهودك الحالي متواضع ويحتاج إلى تفعيل فوري. ابدأ الآن بالاتصال بالعملاء ذوي الحالة "جديد" أو إرسال بروفايلات لتنشيط محفظتك وتحقيق مبيعات ممتازة هذا الأسبوع.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "companies" && (
              <>
                {/* هـ. خط الأعداد والإحصائيات الفورية لتعميد الثقة بالثيم الفاتح الساطع */}
                <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              id="stats-grid"
            >
              {/* إجمالي الشركات المسندة */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4 transition-all hover:border-slate-300 hover:shadow-md">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-extrabold block">إجمالي الشركات المطروحة</span>
                  <span className="text-2xl font-black text-slate-800 font-mono mt-0.5 block">{loading || loadingManagerData ? "..." : stats.total}</span>
                </div>
              </div>
 
              {/* الشركات الجديدة */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4 transition-all hover:border-slate-300 hover:shadow-md">
                <div className="p-3 bg-cyan-50 text-cyan-600 rounded-xl border border-cyan-100">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-extrabold block">عملاء جدد (لم يتم طرقهم)</span>
                  <span className="text-2xl font-black text-cyan-600 font-mono mt-0.5 block">{loading || loadingManagerData ? "..." : stats.isNew}</span>
                </div>
              </div>
 
              {/* قيد المتابعة والتفاوض */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4 transition-all hover:border-slate-300 hover:shadow-md">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-extrabold block">تواصل ومفاوضات نشطة</span>
                  <span className="text-2xl font-black text-amber-600 font-mono mt-0.5 block">{loading || loadingManagerData ? "..." : stats.isInterest}</span>
                </div>
              </div>
 
              {/* معاملات منجزة وناجحة */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4 transition-all hover:border-slate-300 hover:shadow-md">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-extrabold block">تم التعميد والتنفيذ (عمد)</span>
                  <span className="text-2xl font-black text-emerald-600 font-mono mt-0.5 block">{loading || loadingManagerData ? "..." : stats.isSigned}</span>
                </div>
              </div>
            </motion.div>
 
            {/* و. واجهة البحث وأشرطة الفلترة الفورية للتخصيص اليدوي */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5"
              id="filters-container"
            >
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* صندوق البحث */}
                <div className="flex-1 flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="ابحث باسم الشركة، المدينة، كود الشركة، أو اسم المندوب..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs rounded-xl border border-slate-200 pl-4 pr-10 py-3.5 bg-slate-55 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:bg-white transition-all font-bold text-right"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      if (isManagerMode) {
                        fetchAllManagerData(searchQuery);
                      } else {
                        fetchCompanies(selectedRep, searchQuery);
                      }
                    }}
                    disabled={loading || loadingManagerData}
                    className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title="اضغط لتشغيل البحث السريع والذكي مباشرة على كامل الـ 30 ألف عميل في السيرفر"
                  >
                    <span>{loading || loadingManagerData ? "جاري الاستعلام..." : "استعلام حي قاعدة البيانات (30k+) ⚡"}</span>
                  </button>
                </div>

                {/* زر تصدير البيانات إلى Excel */}
                <button
                  onClick={handleExportToExcel}
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-750 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer max-w-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير البيانات المصنفة كملف إكسل</span>
                </button>
 
                {/* زر مسح فلاتر سريعة */}
                {(searchQuery || statusFilter || priorityFilter) && (
                  <button 
                    onClick={() => { setSearchQuery(""); setStatusFilter(""); setPriorityFilter(""); }}
                    className="px-4 py-2.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-slate-100 rounded-xl transition-all font-bold cursor-pointer border border-blue-250"
                  >
                    تفريغ فلاتر البحث x
                  </button>
                )}
              </div>
 
              {/* أشرطة التصنيف الدقيق */}
              <div className="flex flex-col gap-4 pt-4 border-t border-slate-100 text-xs text-slate-700">
                {/* فلتر حسب الحالة */}
                <div className="flex flex-col gap-2">
                  <span className="text-slate-600 font-bold inline-flex items-center gap-1.5 mb-1">
                    <Filter className="w-3.5 h-3.5 text-blue-600" />
                    <span>تصفية بحسب حالة تواصل الشركة:</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setStatusFilter("")}
                      className={`px-3 py-1.5 rounded-lg border font-bold transition-all cursor-pointer text-xs ${!statusFilter ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/10" : "bg-slate-50 text-slate-600 hover:bg-slate-150 border-slate-200"}`}
                    >
                      الكل
                    </button>
                    {["جديد", "تم التواصل", "تفاوض", "تم إرسال البروفايل", "تم طلب التصميم", "تم إرسال العرض", "تم التعميد", "تم التنفيذ", "غير مهتم"].map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${statusFilter === st ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-slate-50 text-slate-600 hover:bg-slate-150 border-slate-200"}`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
 
                {/* فلتر حسب الأولوية */}
                <span className="border-t border-slate-150 my-1 block"></span>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-slate-600 font-bold inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                    <span>تصفية بحسب الأولوية:</span>
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPriorityFilter("")}
                      className={`px-3 py-1.5 rounded-lg border font-bold text-xs transition-all cursor-pointer ${!priorityFilter ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-600 hover:bg-slate-150 border-slate-200"}`}
                    >
                      الكل
                    </button>
                    {["عالية", "متوسطة", "منخفضة"].map((pr) => (
                      <button
                        key={pr}
                        onClick={() => setPriorityFilter(pr)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${priorityFilter === pr ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-600 hover:bg-slate-150 border-slate-200"}`}
                        id={`priority-filter-${pr}`}
                      >
                        {pr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
 
            {/* ز. جدول الشركات والعملاء الرئيسي بالثيم الفاتح المتميز */}
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}
 
            {loading || loadingManagerData ? (
              <div className="bg-white rounded-2xl p-20 text-center border border-slate-200 shadow-sm flex flex-col justify-center items-center gap-4">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-slate-500 font-bold text-sm animate-pulse">جاري جلب ومزامنة قائمة الشركات من خادم جداول Baserow...</p>
              </div>
            ) : displayCompanies.length === 0 ? (
              /* حالة عدم وجود مطابقة للشركات */
              <div className="bg-white rounded-2xl p-20 text-center border border-slate-200 shadow-sm space-y-4">
                <div className="inline-flex p-4 bg-slate-50 rounded-2xl border border-slate-150 text-slate-400">
                  <ClipboardList className="w-12 h-12" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h3 className="font-extrabold text-lg text-slate-900">لا توجد شركات مسندة تتطابق مع البحث</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    لم نتبين وجود عملاء متطابقين مع خيارات البحث والفرز المطبقة حالياً في قاعدة بيانات ExpoTime. يرجى تعديل خيارات البحث والفلترة أو تفريغها بالكامل.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4" id="companies-data-view">
                
                {/* 1. القائمة في نمط الديسكتوب (Table) */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
                  <table className="w-full text-right border-collapse text-xs select-none">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 font-black text-slate-600">
                        <th className="py-4 px-6">كود الشركة</th>
                        <th className="py-4 px-6">اسم الشركة المشاركة</th>
                        <th className="py-4 px-6">الجوال الرئيسي</th>
                        <th className="py-4 px-6">البريد الإلكتروني</th>
                        {isManagerMode && <th className="py-4 px-6 text-center">المندوب المتابع</th>}
                        <th className="py-4 px-6 text-center">الحالة الحالية</th>
                        <th className="py-4 px-6 text-center">الأولوية</th>
                        <th className="py-2.5 px-6">آخر تواصل بالعميل</th>
                        <th className="py-4 px-6 text-center">الإجراء المتاح</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-sm font-semibold text-slate-700">
                      {displayCompanies.map((company) => (
                        <tr 
                          key={company.id} 
                          className="hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group"
                          onClick={() => setSelectedCompany(company)}
                          id={`company-row-${company.id}`}
                        >
                          <td className="py-4 px-6 font-mono text-slate-500 font-bold text-xs">
                            {company["كود الشركة"] || "—"}
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-extrabold text-slate-900 block group-hover:text-blue-600 transition-colors">
                              {company["اسم الشركة"]}
                            </span>
                            {company["النشاط"] && (
                              <span className="text-[11px] text-slate-500 mt-1 block font-bold">النشاط التجاري: {company["النشاط"]}</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-slate-800 font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              <span>{company["الجوال الرئيسي"] || "—"}</span>
                              {company["الجوال الرئيسي"] && (
                                <div className="flex items-center gap-1 select-none">
                                  <a 
                                    href={`tel:${company["الجوال الرئيسي"]}`}
                                    title="اتصال هاتفي مباشر"
                                    className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-150 flex items-center justify-center"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                  <a 
                                    href={`https://wa.me/${cleanPhoneForWhatsApp(company["الجوال الرئيسي"])}`}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    title="مراسلة واتساب فورية"
                                    className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-150 flex items-center justify-center gap-1 font-bold font-sans text-[10px]"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span className="hidden lg:inline">مراسلة</span>
                                  </a>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-slate-600 font-mono text-xs max-w-xs truncate">
                            {company["البريد الإلكتروني"] || "—"}
                          </td>
                          {isManagerMode && (
                            <td className="py-4 px-6 text-center">
                              <span className="font-extrabold text-blue-850 px-2 py-0.5 rounded bg-blue-50 text-xs border border-blue-150">
                                {company["مسؤول المبيعات"] || "غير معين"}
                              </span>
                            </td>
                          )}
                          <td className="py-4 px-6 text-center">
                            <span className={`inline-flex px-3 py-1 text-xs rounded-full border ${getStatusBadgeStyle(company["الحالة"])}`}>
                              {company["الحالة"]}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className={`inline-flex px-2.5 py-0.5 text-xs rounded-md ${getPriorityBadgeStyle(company["الأولوية"])}`}>
                              {company["الأولوية"]}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-slate-500 font-mono text-xs">
                            {company["آخر تواصل"] || "—"}
                          </td>
                          <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => setSelectedCompany(company)}
                                className="px-3.5 py-1.5 text-xs font-bold text-blue-600 bg-blue-55 hover:bg-blue-100 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer border border-blue-200"
                              >
                                <span>تحديث ومتابعة</span>
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              
                              {isManagerMode && (
                                <button
                                  onClick={() => handleDeleteCompany(company.id, company["اسم الشركة"])}
                                  className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all cursor-pointer"
                                  title="حذف الشركة نهائياً"
                                >
                                  <Trash2 className="w-4.5 h-4.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
 
                {/* 2. القائمة لنمط الجوال لضمان تفاعل متكامل (Mobile Cards) */}
                <div className="grid grid-cols-1 md:hidden gap-4">
                  {displayCompanies.map((company) => (
                    <div
                      key={company.id}
                      onClick={() => setSelectedCompany(company)}
                      className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-500/50 shadow-xs space-y-4 active:bg-slate-50 transition-all cursor-pointer text-xs"
                      id={`company-card-${company.id}`}
                    >
                      {/* الهيدر المحمول للبطاقة */}
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-mono font-bold block">{company["كود الشركة"]}</span>
                          <h3 className="font-extrabold text-slate-900 text-sm leading-snug">{company["اسم الشركة"]}</h3>
                        </div>
                        <span className={`px-2.5 py-0.5 text-[10px] rounded-md ${getPriorityBadgeStyle(company["الأولوية"])}`}>
                          {company["الأولوية"]}
                        </span>
                      </div>
 
                      {/* جهات التواصل السريعة للعملاء */}
                      <div className="grid grid-cols-1 gap-1.5 text-slate-650 py-1.5 border-y border-slate-100">
                        {company["الجوال الرئيسي"] && (
                          <div className="flex items-center justify-between gap-1.5 py-0.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">الجوال:</span>
                              <span className="font-mono text-slate-800 font-bold">{company["الجوال الرئيسي"]}</span>
                            </div>
                            <div className="flex items-center gap-2 select-none">
                              <a 
                                href={`tel:${company["الجوال الرئيسي"]}`}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg flex items-center gap-1 text-[10px] font-bold border border-blue-150 transition-colors"
                              >
                                <Phone className="w-3 h-3" />
                                <span>اتصال</span>
                              </a>
                              <a 
                                href={`https://wa.me/${cleanPhoneForWhatsApp(company["الجوال الرئيسي"])}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg flex items-center gap-1 text-[10px] font-bold border border-emerald-150 transition-colors"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>واتساب</span>
                              </a>
                            </div>
                          </div>
                        )}
                        {company["البريد الإلكتروني"] && (
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-slate-400 font-semibold">بريد:</span>
                            <span className="font-mono text-slate-800 truncate">{company["البريد الإلكتروني"]}</span>
                          </div>
                        )}
                        {isManagerMode && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">المندوب:</span>
                            <span className="font-bold text-indigo-700">{company["مسؤول المبيعات"] || "غير مسند"}</span>
                          </div>
                        )}
                      </div>
 
                      {/* المتابعة والتاريخ لحالة بطاقات الجوال */}
                      <div className="flex items-center justify-between pt-1 select-none">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-slate-400 block mb-1">الحالة:</span>
                          <span className={`inline-flex px-2.5 py-0.5 text-[11px] rounded-full border ${getStatusBadgeStyle(company["الحالة"])}`}>
                            {company["الحالة"]}
                          </span>
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 block mb-1">تاريخ آخر تواصل:</span>
                          <span className="text-xs font-mono text-slate-800 block leading-none font-bold">{company["آخر تواصل"] || "—"}</span>
                        </div>
                      </div>
 
                      {/* زر العمليات على بطاقات الجوال ليتجاوز 44 بيكسل لللمس */}
                      <div className="pt-2 flex gap-2">
                        <div className="flex-grow text-center py-2.5 px-4 bg-blue-50 text-blue-600 border border-blue-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-all">
                          <span>عرض التفاصيل والتاريخ والتحديث</span>
                          <ChevronLeft className="w-4 h-4" />
                        </div>
                        {isManagerMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCompany(company.id, company["اسم الشركة"]);
                            }}
                            className="p-2.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-250 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
                            title="حذف الشركة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
 
                {/* زر تحميل المزيد لتمكين تصفح 30,000 عميل بطريقة آمنة وسريعة بدون تجميد المتصفح */}
                {hasMoreCompanies && (
                  <div className="flex justify-center pt-2 pb-1" id="load-more-companies-block">
                    <button
                      onClick={() => {
                        const nextPage = companiesPage + 1;
                        if (isManagerMode) {
                          fetchAllManagerData(searchQuery, nextPage);
                        } else {
                          fetchCompanies(selectedRep, searchQuery, nextPage);
                        }
                      }}
                      disabled={loading || loadingManagerData || loadingMore}
                      className="px-6 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 text-xs font-black rounded-xl border border-blue-200 shadow-xs flex items-center gap-2 transition-all cursor-pointer"
                    >
                      {loadingMore ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                          <span>جاري تحميل المزيد من العملاء...</span>
                        </>
                      ) : (
                        <>
                          <span>عرض مزيد من العملاء (تحميل الصفحة {companiesPage + 1}) ⚡</span>
                          <span className="text-[10px] opacity-75">(تحميل 200 عميل إضافي من أصل 30k)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
 
                {/* مؤشر ترقيم بسيط وعدد السجلات */}
                <div className="flex items-center justify-between text-xs text-slate-500 px-2 py-1 select-none font-semibold">
                  <span>يعرض النظام **{displayCompanies.length}** من أصل **{isManagerMode ? managerCompanies.length : companies.length}** عملاء ومشارکین متاحين حالياً.</span>
                  <span>البرنامج مدعوم من ExpoTime CRM</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    )}
 
      {/* لوحة التفاصيل والبحث الفوري الجانبية (Slide Drawer) */}
      <AnimatePresence>
        {selectedCompany && (
          <CompanyDetails
            company={selectedCompany}
            onClose={() => setSelectedCompany(null)}
            onUpdate={(fields) => handleUpdateCompany(selectedCompany.id, fields)}
            salesperson={isManagerMode ? getSafeString(selectedCompany["مسؤول المبيعات"]) : selectedRep}
            isManager={isManagerMode}
            employeesList={employees}
          />
        )}
      </AnimatePresence>

      {/* لوحة إدارة المستخدمين والمناديب الجانبية (Slide Drawer) */}
      <AnimatePresence>
        {showEmployeesPanel && (
          <div className="fixed inset-0 z-50 flex justify-end" id="employees-panel-backdrop">
            {/* الخلفية المظلمة */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmployeesPanel(false)}
              className="absolute inset-0 bg-slate-900"
            />

            {/* محتوى اللوحة الجانبية */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white h-screen shadow-2xl z-10 flex flex-col overflow-hidden font-sans border-r border-slate-200"
              dir="rtl"
            >
              {/* هيدر اللوحة */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white select-none">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#facc15]" />
                  <div>
                    <h3 className="font-bold text-sm text-white">إدارة صلاحيات المستخدمين المبيعية</h3>
                    <p className="text-[10px] text-slate-300">أضف أو ألغِ مناديب المبيعات المسجلين بمتابعة المعارض</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEmployeesPanel(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
                  title="إغلاق التبويب"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* محتوى اللوحة الداخلي المقسم */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                
                {/* 1. نموذج إضافة مندوب جديد */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    <h4 className="font-extrabold text-xs text-slate-800">تسجيل وتفويض مندوب / مستخدم جديد</h4>
                  </div>

                  {empActionError && (
                    <div className="p-3 bg-rose-50 border border-rose-250 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                      <p>{empActionError}</p>
                    </div>
                  )}

                  {empActionSuccess && (
                     <div className="p-3 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-xl text-xs font-bold flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <p>{empActionSuccess}</p>
                      </div>
                      {latestWhatsappUrl && (
                        <div className="pt-1 select-none">
                          <a
                            href={latestWhatsappUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg shadow-xs transition-all cursor-pointer text-[10px]"
                          >
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-200"></span>
                            </span>
                            <span>إرسال التفاصيل لواتساب المدير 💬</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleAddEmployee} className="space-y-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-600 block">مسمى الاسم:</label>
                        <input
                          type="text"
                          required
                          value={newEmpName}
                          onChange={(e) => setNewEmpName(e.target.value)}
                          placeholder="مثال: مؤيدة أحمد"
                          className="w-full text-xs rounded-xl border border-slate-250 px-3 py-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:outline-hidden font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-600 block">القسم:</label>
                        <select
                          value={newEmpDept}
                          onChange={(e) => setNewEmpDept(e.target.value)}
                          className="w-full text-xs rounded-xl border border-slate-250 px-3 py-2.5 bg-white text-slate-800 focus:outline-hidden font-bold"
                        >
                          <option value="المبيعات">المبيعات والتسويق</option>
                          <option value="العلاقات العامة">العلاقات العامة</option>
                          <option value="الإدارة">الإشراف الإداري</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-slate-600 block">البريد الإلكتروني (مفتاح التحقق والدخول):</label>
                      <input
                        type="email"
                        required
                        value={newEmpEmail}
                        onChange={(e) => setNewEmpEmail(e.target.value)}
                        placeholder="example@expotime.com"
                        className="w-full text-xs rounded-xl border border-slate-250 px-3 py-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:outline-hidden font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-slate-600 block">رقم الجوال (اختياري):</label>
                      <input
                        type="tel"
                        value={newEmpPhone}
                        onChange={(e) => setNewEmpPhone(e.target.value)}
                        placeholder="05xxxxxxxx"
                        className="w-full text-xs rounded-xl border border-slate-250 px-3 py-2.5 bg-white text-slate-800 focus:outline-hidden font-mono"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={empActionLoading}
                      className="w-full font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl py-3 shadow-md shadow-blue-600/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>{empActionLoading ? "جاري تنفيذ إضافة الحساب بقاعدة البيانات..." : "تأكيد إضافة وتفويض المندوب"}</span>
                    </button>
                  </form>
                </div>

                {/* 2. جدول / قائمة المستخدمين الحاليين */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between select-none">
                    <h4 className="font-extrabold text-xs text-slate-700">قائمة المستخدمين والمناديب النشطين ({employees.length})</h4>
                    <span className="text-[10px] text-slate-400">امسح المندوب لإلغاء تفويضه</span>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {employees.map((emp) => (
                      <div 
                        key={emp.id} 
                        className="p-3.5 bg-white border border-slate-150 rounded-xl flex items-center justify-between gap-3 hover:bg-slate-50 transition-all shadow-xs"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="h-9 w-9 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100 uppercase select-none">
                            {emp["الاسم"]?.slice(0, 2) || "م"}
                          </div>
                          <div className="space-y-0.5 text-right">
                            <div className="flex items-center gap-1.5 justify-start">
                              <span className="font-bold text-xs text-slate-800">{emp["الاسم"]}</span>
                              <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                                {emp["القسم"] || "مبيعات"}
                              </span>
                            </div>
                            {emp["البريد الإلكتروني"] && (
                              <span className="text-[10px] text-slate-450 font-mono flex items-center gap-1 justify-start">
                                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {emp["البريد الإلكتروني"]}
                              </span>
                            )}
                            {emp["الجوال"] && (
                              <span className="text-[10px] text-slate-450 font-mono flex items-center gap-1 justify-start">
                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {emp["الجوال"]}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteEmployee(emp.id, emp["الاسم"])}
                          disabled={empActionLoading}
                          className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all shrink-0 cursor-pointer"
                          title="إلغاء المندوب وحذفه"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {employees.length === 0 && (
                      <div className="text-center py-8 text-xs text-slate-400">
                        لا يوجد حالياً أي مندوبين مبيعات مسجلين في قاعدة بياناتك.
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* ذيل اللوحة الجانبية */}
              <div className="p-4 bg-slate-50 border-t border-slate-150 text-center text-[10px] text-slate-400 font-bold select-none">
                برنامج ومتابعة معارض ExpoTime • الإدارة والتحكم بالأمان
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* نافذة تنبيه مكرر للعميل الفردي (رقم الجوال أو البريد) */}
      <AnimatePresence>
        {duplicateWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" id="duplicate-warning-backdrop">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setDuplicateWarning(null)}
              className="absolute inset-0 bg-slate-900"
            />
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl z-10 border border-amber-250 text-right space-y-4 font-sans"
              dir="rtl"
            >
              <div className="flex items-center gap-3 border-b border-amber-100 pb-3">
                <span className="text-3xl leading-none">⚠️</span>
                <div>
                  <h3 className="font-extrabold text-amber-900 text-sm">تنبيه: هذا العميل مكرر ومسجل مسبقاً!</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">رمز الكود وبروتوكول التحقق اكتشف تطابقاً مع قاعدة البيانات</p>
                </div>
              </div>

              <div className="bg-amber-50/50 border border-amber-100/70 rounded-2xl p-4 space-y-2 text-xs text-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">اسم العميل المسجل:</span>
                  <span className="font-extrabold text-slate-800">{duplicateWarning.existingCompany["اسم الشركة"]}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">كود الشركة الحالي:</span>
                  <span className="font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[11px]">{duplicateWarning.existingCompany["كود الشركة"]}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">الجوال المسجل:</span>
                  <span className="font-mono font-extrabold text-slate-800">{duplicateWarning.existingCompany["الجوال الرئيسي"] || "غير معروف"}</span>
                </div>
                {duplicateWarning.existingCompany["البريد الإلكتروني"] && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">البريد الإلكتروني:</span>
                    <span className="font-mono font-medium text-slate-750">{duplicateWarning.existingCompany["البريد الإلكتروني"]}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">مسؤول المبيعات المتابع:</span>
                  <span className="font-black text-indigo-700">{duplicateWarning.existingCompany["مسؤول المبيعات"] || "غير معين"}</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 leading-normal text-center">
                لم يتم إدخال العميل لتجنب تشتت المنافسات وتكرار البيانات. يمكنك المتابعة مع المندوب المذكور أو تحديث السجل مباشرة.
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    const matchedComp = (isManagerMode ? managerCompanies : companies).find(
                      c => c["كود الشركة"] === duplicateWarning.existingCompany["كود الشركة"]
                    );
                    setDuplicateWarning(null);
                    if (matchedComp) {
                      setSelectedCompany(matchedComp);
                    } else {
                      // إذا لم يتم جلب المستند النشط في الكاش، نبني سجل شركة مكتمل من البيانات المتوفرة
                      const ec = duplicateWarning.existingCompany;
                      setSelectedCompany({
                        id: ec["كود الشركة"] || ec["اسم الشركة"],
                        "كود الشركة": ec["كود الشركة"],
                        "اسم الشركة": ec["اسم الشركة"],
                        "مسؤول المبيعات": ec["مسؤول المبيعات"] || "",
                        "الجوال الرئيسي": ec["الجوال الرئيسي"] || "",
                        "البريد الإلكتروني": "",
                        "الحالة": "",
                        "الأولوية": "",
                        "آخر تواصل": "",
                      });
                    }
                  }}
                  className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition-colors text-center cursor-pointer shadow-xs"
                >
                  عرض تفاصيل العميل ومتابعته
                </button>
                <button
                  onClick={() => setDuplicateWarning(null)}
                  className="px-4 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* نافذة ملخص نتائج استيراد الإكسل وتوضيح المكررات المستبعدة */}
      <AnimatePresence>
        {excelImportResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" id="excel-import-result-backdrop">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setExcelImportResult(null)}
              className="absolute inset-0 bg-slate-900"
            />
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl z-10 border border-blue-200 text-right space-y-4 font-sans max-h-[85vh] flex flex-col"
              dir="rtl"
            >
              <div className="flex items-center gap-3 border-b border-blue-100 pb-3">
                <span className="text-3xl leading-none font-sans">📊</span>
                <div>
                  <h3 className="font-extrabold text-blue-900 text-sm">تم معالجة وتصفية ملف الإكسل بنجاح</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">تقرير الاستيراد الفوري والذكي استثنى المكررات لفرز المعارض والخطوط بمكانه الصحيح</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 shrink-0">
                <div className="bg-emerald-50 border border-emerald-100/70 rounded-2xl p-3.5 text-center">
                  <span className="text-[10px] text-emerald-700 block font-bold mb-0.5">سجلات أضيفت بنجاح:</span>
                  <span className="text-lg font-black text-emerald-600">{excelImportResult.count} شركة جديدة</span>
                </div>
                <div className="bg-amber-50 border border-amber-100/70 rounded-2xl p-3.5 text-center">
                  <span className="text-[10px] text-amber-700 block font-bold mb-0.5">شركات مكررة تم تخطيها:</span>
                  <span className="text-lg font-black text-amber-600">{excelImportResult.skippedCount} عملاء سابقين</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-60 border border-slate-100 rounded-2xl p-3 bg-slate-50/50">
                <span className="text-[11px] text-slate-500 font-extrabold block">قائمة العملاء المكررين الذين تم حمايتهم واستبعادهم من الاستيراد:</span>
                {excelImportResult.skipped && excelImportResult.skipped.length > 0 ? (
                  <div className="space-y-1.5">
                    {excelImportResult.skipped.map((skipItem: any, sIdx: number) => (
                      <div key={sIdx} className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs flex justify-between items-center gap-2">
                        <div>
                          <span className="font-extrabold text-slate-800 block text-right">{skipItem.name}</span>
                          <span className="text-[9.5px] text-slate-400 block text-right font-mono">رقم التواصل: {skipItem.phone || "غير مسجل"}</span>
                        </div>
                        <span className="text-[9.5px] bg-amber-50 text-amber-750 px-2 py-0.5 rounded border border-amber-150 font-mono font-black">
                          كود الشركة: {skipItem.code}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 text-center py-6">لم يتم رصد أي دمج مكرر لخطوط المبيعات في هذا الاستيراد.</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 shrink-0">
                <button
                  onClick={() => setExcelImportResult(null)}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
                >
                  حسناً، استكمال متابعة المعرض بنجاح
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* نافذة عائمة لعرض تفاصيل عمليات الرفع، التحميل، والمزامنة بالخلفية */}
      <AnimatePresence>
        {(isSavingSettings || isGoogleLoading || importProgress) && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 right-6 left-6 sm:left-auto sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl z-50 text-right space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-blue-400 font-mono text-[10px] bg-blue-950/50 border border-blue-900/40 px-2 py-0.5 rounded-full font-bold animate-pulse">
                عملية نشطة حالياً ⚙️
              </span>
              <h4 className="text-xs font-black text-white">مراقب المزامنة والرفع الذكي</h4>
            </div>

            {/* حالة 1: حفظ الإعدادات الموحدة */}
            {isSavingSettings && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-bold">حفظ وتثبيت الإعدادات الموحدة</span>
                  <span className="text-xs font-mono text-blue-400 font-bold">{settingsUploadProgress}%</span>
                </div>
                <p className="text-xs text-slate-200 font-semibold">{settingsUploadStatus || "جاري تحديث السيرفر..."}</p>
                <div className="w-full bg-slate-850 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-350" 
                    style={{ width: `${settingsUploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* حالة 2: تحميل أو تصدير غوغل شيت */}
            {isGoogleLoading && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-bold">تصدير واستيراد Google Sheets</span>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                </div>
                <p className="text-xs text-slate-200 font-semibold">{googleStatusMsg || "جاري الاتصال بقنوات غوغل شيت..."}</p>
                {googleErrorMsg && (
                  <p className="text-[10px] text-rose-400 font-bold bg-rose-950/20 p-2 rounded-lg border border-rose-900/30">{googleErrorMsg}</p>
                )}
                <div className="w-full bg-slate-850 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full animate-pulse w-full" />
                </div>
              </div>
            )}

            {/* حالة 3: استيراد ملف إكسل الضخم */}
            {importProgress && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-bold">استيراد ومعالجة ملف الإكسل</span>
                  <span className="text-xs font-mono text-emerald-400 font-bold">{importProgress.percentage}%</span>
                </div>
                <p className="text-xs text-slate-200 font-semibold">
                  جاري رفع ومزامنة جهات الاتصال... {importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()}
                </p>
                <div className="w-full bg-slate-850 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-350" 
                    style={{ width: `${importProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            <div className="text-[9px] text-slate-500 font-bold text-center pt-1">
              يرجى عدم مغادرة أو إغلاق الصفحة حتى اكتمال العمليات بنجاح 🟢
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
