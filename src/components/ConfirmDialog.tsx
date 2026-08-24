"use client";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmDialog({ 
  title, 
  message, 
  confirmText = 'تأكيد', 
  cancelText = 'إلغاء',
  onConfirm, 
  onCancel, 
  isOpen, 
  type = 'danger' 
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const typeStyles = {
    danger: 'border-red-200 bg-red-50',
    warning: 'border-yellow-200 bg-yellow-50', 
    info: 'border-blue-200 bg-blue-50'
  };

  const buttonStyles = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    info: 'bg-blue-600 hover:bg-blue-700 text-white'
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border-2 ${typeStyles[type]}`}>
        <div className="text-center">
          <div className="text-3xl mb-2">
            {type === 'danger' ? '⚠️' : type === 'warning' ? '⚡' : 'ℹ️'}
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        
        <div className="flex gap-3 pt-2">
          <button 
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${buttonStyles[type]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}