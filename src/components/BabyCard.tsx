import { type Baby } from '@/api/feishu';
import { calcAge } from '@/utils/date';
import { useAppStore } from '@/store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Edit3, Plus } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface BabyCardProps {
  baby: Baby;
}

export default function BabyCard({ baby }: BabyCardProps) {
  const age = calcAge(baby.出生日期);
  const initials = baby.宝宝姓名.charAt(0);
  const { babies, switchBaby } = useAppStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="card-shadow p-5 mb-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white text-2xl font-outfit font-bold shadow-soft flex-shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-outfit font-bold text-ink truncate">{baby.宝宝姓名}</h1>
            {babies.length > 1 && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
                  aria-label="切换宝宝"
                >
                  <ChevronDown size={16} className="text-muted" />
                </button>
                {menuOpen && (
                  <div className="absolute top-7 left-0 z-50 min-w-[180px] bg-cream-light border border-rule rounded-2xl shadow-float py-1.5 animate-fade-up">
                    {babies.map((b) => (
                      <button
                        key={b.record_id}
                        onClick={() => {
                          switchBaby(b.record_id);
                          setMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-cream-dark transition-colors ${
                          b.record_id === baby.record_id ? 'text-coral font-medium' : 'text-ink'
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-coral to-warm-orange text-white text-xs flex items-center justify-center font-bold">
                          {b.宝宝姓名.charAt(0)}
                        </span>
                        <span className="flex-1 truncate">{b.宝宝姓名}</span>
                        {b.record_id === baby.record_id && <span className="text-xs">✓</span>}
                      </button>
                    ))}
                    <div className="border-t border-rule/40 mt-1 pt-1">
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          navigate('/baby/edit');
                        }}
                        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-muted hover:bg-cream-dark transition-colors"
                      >
                        <Plus size={16} />
                        <span>添加宝宝</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-muted">{age}</span>
            <span className="w-1 h-1 rounded-full bg-rule" />
            <span className="text-sm text-muted">
              {baby.性别 === '男' ? '👦 男宝' : '👧 女宝'}
            </span>
          </div>
          <p className="text-xs text-muted/70 mt-1">
            {new Date(baby.出生日期).toLocaleDateString('zh-CN')} 出生
          </p>
        </div>

        <button
          onClick={() => navigate('/baby/detail')}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors flex-shrink-0"
          aria-label="编辑宝宝信息"
        >
          <Edit3 size={18} className="text-muted" />
        </button>
      </div>
    </div>
  );
}
