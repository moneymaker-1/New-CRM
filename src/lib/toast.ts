/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * نظام إشعارات (Toasts) ومربعات تأكيد عصري — واجهة برمجية مفردة (singleton)
 * يمكن استدعاؤها من أي مكان (بما في ذلك الدوال غير المتزامنة) دون hooks.
 */

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface ConfirmRequest {
  id: number;
  message: string;
  resolve: (ok: boolean) => void;
}

type ToastListener = (toasts: ToastItem[]) => void;
type ConfirmListener = (req: ConfirmRequest | null) => void;

let toasts: ToastItem[] = [];
let confirmReq: ConfirmRequest | null = null;
let seq = 1;

const toastListeners = new Set<ToastListener>();
const confirmListeners = new Set<ConfirmListener>();

function emitToasts() {
  toastListeners.forEach((l) => l([...toasts]));
}
function emitConfirm() {
  confirmListeners.forEach((l) => l(confirmReq));
}

export function subscribeToasts(l: ToastListener): () => void {
  toastListeners.add(l);
  l([...toasts]);
  return () => toastListeners.delete(l);
}
export function subscribeConfirm(l: ConfirmListener): () => void {
  confirmListeners.add(l);
  l(confirmReq);
  return () => confirmListeners.delete(l);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

function push(type: ToastType, message: string, ttl = 4000) {
  const id = seq++;
  toasts = [...toasts, { id, type, message: String(message) }];
  emitToasts();
  if (ttl > 0) setTimeout(() => dismissToast(id), ttl);
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m, 6000),
  info: (m: string) => push("info", m),
  /** بديل عصري لـ window.confirm — يُرجع Promise<boolean> */
  confirm: (message: string): Promise<boolean> =>
    new Promise((resolve) => {
      confirmReq = { id: seq++, message, resolve };
      emitConfirm();
    }),
};

export function resolveConfirm(ok: boolean) {
  if (confirmReq) {
    const r = confirmReq;
    confirmReq = null;
    emitConfirm();
    r.resolve(ok);
  }
}
