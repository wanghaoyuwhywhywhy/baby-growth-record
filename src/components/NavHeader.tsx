import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NavHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  titleAction?: React.ReactNode;
  onLogoDoubleClick?: () => void;
}

export default function NavHeader({ title, showBack = false, rightAction, titleAction, onLogoDoubleClick }: NavHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-cream/80 backdrop-blur-md border-b border-rule/50 px-5 py-3">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {showBack ? (
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
              aria-label="返回"
            >
              <ArrowLeft size={20} className="text-ink" />
            </button>
          ) : (
            <span
              className="text-xl select-none"
              onDoubleClick={onLogoDoubleClick}
            >
              👶
            </span>
          )}
          <h1 className="text-lg font-outfit font-bold text-ink whitespace-nowrap shrink-0">{title}</h1>
          {titleAction}
        </div>
        <div className="flex items-center gap-2">
          {rightAction ?? null}
        </div>
      </div>
    </header>
  );
}
