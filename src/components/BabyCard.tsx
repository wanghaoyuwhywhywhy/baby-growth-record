import { type Baby } from '@/api/feishu';
import { calcAge } from '@/utils/date';
import { useAppStore } from '@/store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { Edit3 } from 'lucide-react';

interface BabyCardProps {
  baby: Baby;
}

export default function BabyCard({ baby }: BabyCardProps) {
  const age = calcAge(baby.出生日期);
  const { growthRecords } = useAppStore();
  const navigate = useNavigate();

  // 获取最新的身高体重
  const latestGrowth = growthRecords.length > 0
    ? growthRecords[growthRecords.length - 1]
    : null;

  // 出生日期格式化：2023年5月15日
  const birthDate = new Date(baby.出生日期);
  const birthStr = `${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日`;

  const height = latestGrowth?.身高;
  const weight = latestGrowth?.体重;

  return (
    <div className="card-shadow p-5 mb-6 animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted tracking-wide">成长档案</span>
        <button
          onClick={() => navigate(`/baby/detail?id=${baby.record_id}`)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
          aria-label="编辑"
        >
          <Edit3 size={16} className="text-muted" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-cream-dark/40 rounded-2xl p-3.5">
          <div className="text-[11px] text-muted mb-1">出生日期</div>
          <div className="text-sm font-medium text-ink font-outfit">{birthStr}</div>
        </div>
        <div className="bg-cream-dark/40 rounded-2xl p-3.5">
          <div className="text-[11px] text-muted mb-1">年龄</div>
          <div className="text-sm font-medium text-ink font-outfit">{age}</div>
        </div>
        <div className="bg-cream-dark/40 rounded-2xl p-3.5">
          <div className="text-[11px] text-muted mb-1">身高</div>
          <div className="text-sm font-medium text-ink font-outfit">
            {height != null ? `${height}cm` : '暂无'}
          </div>
        </div>
        <div className="bg-cream-dark/40 rounded-2xl p-3.5">
          <div className="text-[11px] text-muted mb-1">体重</div>
          <div className="text-sm font-medium text-ink font-outfit">
            {weight != null ? `${weight}kg` : '暂无'}
          </div>
        </div>
      </div>
    </div>
  );
}
