import { type Baby } from '@/api/feishu';
import { calcAge } from '@/utils/date';

interface BabyCardProps {
  baby: Baby;
}

export default function BabyCard({ baby }: BabyCardProps) {
  const age = calcAge(baby.出生日期);
  const initials = baby.宝宝姓名.charAt(0);

  return (
    <div className="card-shadow p-5 mb-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white text-2xl font-outfit font-bold shadow-soft flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-outfit font-bold text-ink">{baby.宝宝姓名}</h1>
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
      </div>
    </div>
  );
}
