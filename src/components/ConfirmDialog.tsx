import { AlertTriangle } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  /** 危险操作：确认按钮渲染为红色样式 */
  confirmDanger?: boolean;
  /** 确认按钮 loading（用于异步操作中禁止重复点击） */
  loading?: boolean;
}

export default function ConfirmDialog({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onClose,
  confirmDanger = false,
  loading = false,
}: ConfirmDialogProps) {
  const confirmBtnClass = confirmDanger
    ? 'flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:bg-red-300'
    : 'flex-1 bg-coral text-white py-2.5 rounded-xl text-sm font-medium hover:bg-coral/90 transition-colors disabled:bg-coral/50';

  async function handleConfirm() {
    if (loading) return;
    // 允许异步：不自动 close，由外部在异步完成后关闭（便于展示 loading 状态）
    const result = onConfirm();
    if (result instanceof Promise) {
      // 交给外部 await 完成后自己调 onClose
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
      <div className="w-full max-w-sm bg-cream-light rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-coral/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-coral" />
          </div>
          <h3 className="text-base font-outfit font-bold text-ink">{title}</h3>
        </div>
        <p className="text-sm text-muted mb-5 pl-12">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 btn-secondary py-2.5 text-sm disabled:opacity-50"
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`${confirmBtnClass} flex items-center justify-center gap-1.5`}
            disabled={loading}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
