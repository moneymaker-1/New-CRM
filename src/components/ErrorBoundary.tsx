/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * حدود الأخطاء (Error Boundary) لمنع انهيار التطبيق بالكامل (شاشة بيضاء)
 * عند حدوث خطأ غير متوقع في أي مكوّن، وإظهار رسالة ودّية مع إمكانية إعادة التحميل.
 */
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "خطأ غير معروف" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // تسجيل الخطأ في وحدة التحكم (يمكن لاحقاً ربطه بخدمة مراقبة مثل Sentry)
    console.error("تم التقاط خطأ في واجهة المستخدم:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#e2e8f0",
            fontFamily: "system-ui, sans-serif",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              textAlign: "center",
              background: "#1e293b",
              padding: "32px",
              borderRadius: "16px",
              border: "1px solid #334155",
            }}
          >
            <h1 style={{ fontSize: "22px", marginBottom: "12px" }}>
              حدث خطأ غير متوقع
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: "20px", lineHeight: 1.7 }}>
              نعتذر عن الإزعاج. حدث خلل أثناء عرض هذه الصفحة. يمكنك إعادة التحميل
              للمتابعة، وإذا تكرر الأمر يرجى التواصل مع المدير.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "10px 24px",
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "15px",
              }}
            >
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
