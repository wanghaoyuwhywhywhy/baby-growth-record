import { ArrowLeft, Settings } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface NavHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  titleAction?: React.ReactNode;
}

export default function NavHeader({ title, showBack = false, rightAction, titleAction }: NavHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

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
            <span className="text-xl">👶</span>
          )}
          <h1 className="text-lg font-outfit font-bold text-ink">{title}</h1>
          {titleAction}
        </div>
        <div className="flex items-center gap-2">
          {rightAction ?? (
            <button
              onClick={() => navigate('/settings')}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors
                ${location.pathname === '/settings'
                  ? 'bg-coral/10 text-coral'
                  : 'text-muted hover:bg-cream-dark'
                }`}
              aria-label="设置"
            >
              <Settings size={20} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
