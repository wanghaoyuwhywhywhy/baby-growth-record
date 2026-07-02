import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({ title, message, confirmText = '确定', cancelText = '取消', onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-cream-light rounded-t-3xl p-5 pb-8 animate-fade-up" onClick={(e) => e.stopPropagation()}>
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
            className="flex-1 btn-secondary py-2.5 text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className="flex-1 bg-coral text-white py-2.5 rounded-xl text-sm font-medium hover:bg-coral/90 transition-colors"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
