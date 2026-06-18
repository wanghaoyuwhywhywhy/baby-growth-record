import { type DailyRecord } from '@/api/feishu';
import { formatDate } from '@/utils/date';
import { CATEGORY_MAP } from '@/utils/constants';

interface RecordItemProps {
  record: DailyRecord;
  compact?: boolean;
}

export default function RecordItem({ record, compact = false }: RecordItemProps) {
  const category = CATEGORY_MAP[record.分类];
  const emoji = category?.emoji ?? '📝';
  const color = category?.color ?? '#8B7D7A';

  return (
    <div className="flex items-start gap-3 py-3 group">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 mt-0.5"
        style={{ backgroundColor: color + '20' }}
      >
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        {!compact && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '18', color }}>
              {record.分类}
            </span>
            <span className="text-xs text-muted/60">{formatDate(record.记录时间)}</span>
            {record.是否为里程碑 && (
              <span className="text-xs">⭐</span>
            )}
          </div>
        )}
        <p className={`text-ink leading-relaxed ${compact ? 'text-sm' : 'text-[15px]'}`}>
          {record.记录内容}
        </p>
        {compact && (
          <span className="text-xs text-muted/60 mt-0.5 block">{formatDate(record.记录时间)}</span>
        )}
      </div>
    </div>
  );
}
