/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * مكوّن عرض الإشعارات ومربع التأكيد. يُركَّب مرة واحدة في جذر التطبيق.
 */
import { useEffect, useState, ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X, AlertTriangle } from "lucide-react";
import {
  ToastItem,
  ConfirmRequest,
  subscribeToasts,
  subscribeConfirm,
  dismissToast,
  resolveConfirm,
} from "../lib/toast";

const STYLES: Record<string, { bg: string; icon: ReactNode }> = {
  success: {
    bg: "bg-emerald-600",
    icon: <CheckCircle2 className="w-5 h-5 shrink-0" />,
  },
  error: { bg: "bg-red-600", icon: <XCircle className="w-5 h-5 shrink-0" /> },
  info: { bg: "bg-slate-800", icon: <Info className="w-5 h-5 shrink-0" /> },
};

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const u1 = subscribeToasts(setToasts);
    const u2 = subscribeConfirm(setConfirmReq);
    return () => {
      u1();
      u2();
    };
  }, []);

  return (
    <div dir="rtl">
      {/* الإشعارات */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[92%] max-w-md pointer-events-none">
        {toasts.map((t) => {
          const st = STYLES[t.type] || STYLES.info;
          return (
            <div
              key={t.id}
              className={`${st.bg} text-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 pointer-events-auto animate-[fadeIn_.2s_ease-out]`}
            >
              {st.icon}
              <span className="text-sm font-medium leading-snug flex-1">
                {t.message}
              </span>
              <button
                onClick={() => dismissToast(t.id)}
                className="opacity-80 hover:opacity-100"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* مربع التأكيد */}
      {confirmReq && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
            </div>
            <p className="text-slate-700 text-sm leading-relaxed mb-5">
              {confirmReq.message}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => resolveConfirm(true)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors"
              >
                تأكيد
              </button>
              <button
                onClick={() => resolveConfirm(false)}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-sm transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
