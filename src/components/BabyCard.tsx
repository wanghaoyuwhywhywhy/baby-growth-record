import { type Baby } from '@/api/feishu';
import { calcAge } from '@/utils/date';
import { useAppStore } from '@/store/useAppStore';

interface BabyCardProps {
  baby: Baby;
}

export default function BabyCard({ baby }: BabyCardProps) {
  const age = calcAge(baby.出生日期);
  const { growthRecords } = useAppStore();

  // 获取最新的身高体重
  const latestGrowth = growthRecords.length > 0
    ? growthRecords[growthRecords.length - 1]
    : null;

  // 出生日期格式化：2023.5.15
  const birthDate = new Date(baby.出生日期);
  const birthStr = `${birthDate.getFullYear()}.${birthDate.getMonth() + 1}.${birthDate.getDate()}`;

  const height = latestGrowth?.身高;
  const weight = latestGrowth?.体重;

  return (
    <div className="card-shadow p-4 mb-6 animate-fade-up">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">🎂</span>
          <span className="text-sm text-muted truncate">{birthStr}</span>
        </div>
        <span className="w-1 h-1 rounded-full bg-rule shrink-0" />
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">📅</span>
          <span className="text-sm text-muted truncate">{age}</span>
        </div>
        <span className="w-1 h-1 rounded-full bg-rule shrink-0" />
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">📏</span>
          <span className="text-sm text-muted truncate">{height != null ? `${height}cm` : '—'}</span>
        </div>
        <span className="w-1 h-1 rounded-full bg-rule shrink-0" />
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">⚖️</span>
          <span className="text-sm text-muted truncate">{weight != null ? `${weight}kg` : '—'}</span>
        </div>
      </div>
    </div>
  );
}
