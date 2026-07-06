import { type Baby, type GrowthRecord } from '@/api/feishu';
import { calcAge } from '@/utils/date';
import { useAppStore } from '@/store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { Edit3 } from 'lucide-react';
import { getAuthBabyRelations } from '@/lib/auth';

interface BabyCardProps {
  baby: Baby;
}

export default function BabyCard({ baby }: BabyCardProps) {
  const age = calcAge(baby.出生日期);
  const initials = String(baby.宝宝姓名 || '').charAt(0);
  const babyRelations = getAuthBabyRelations();
  const relation = babyRelations[baby.record_id];
  const { growthRecords } = useAppStore();
  const navigate = useNavigate();

  // 获取最新的身高体重
  const latestGrowth = growthRecords.length > 0
    ? growthRecords[growthRecords.length - 1]
    : null;

  return (
    <div className="card-shadow p-5 mb-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white text-2xl font-outfit font-bold shadow-soft flex-shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-outfit font-bold text-ink truncate">{baby.宝宝姓名}</h1>
            {relation && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-coral/10 text-coral font-medium flex-shrink-0">
                {relation}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-muted">{age}</span>
            <span className="w-1 h-1 rounded-full bg-rule" />
            <span className="text-sm text-muted">
              {baby.性别 === '男' ? '👦 男孩' : '👧 女孩'}
            </span>
          </div>
          {latestGrowth && (latestGrowth.身高 || latestGrowth.体重) && (
            <div className="flex items-center gap-3 mt-1">
              {latestGrowth.身高 != null && (
                <span className="text-sm text-muted">📏 {latestGrowth.身高}cm</span>
              )}
              {latestGrowth.体重 != null && (
                <span className="text-sm text-muted">⚖️ {latestGrowth.体重}kg</span>
              )}
            </div>
          )}
          <p className="text-xs text-muted/70 mt-1">
            {new Date(baby.出生日期).toLocaleDateString('zh-CN')} 出生
          </p>
          {baby.备注 && (
            <p className="text-xs text-ink/60 mt-1 truncate">💬 {baby.备注}</p>
          )}
        </div>

        <button
          onClick={() => navigate('/baby/detail')}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors flex-shrink-0"
          aria-label="宝宝档案"
        >
          <Edit3 size={18} className="text-muted" />
        </button>
      </div>
    </div>
  );
}
