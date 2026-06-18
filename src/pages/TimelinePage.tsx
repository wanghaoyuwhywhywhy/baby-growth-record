import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import RecordItem from '@/components/RecordItem';
import FilterBar from '@/components/FilterBar';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';


export default function TimelinePage() {
  const { records, filterCategory, loading, fetchRecords, setFilterCategory } = useAppStore();

  useEffect(() => {
    fetchRecords(filterCategory === '全部' ? undefined : filterCategory);
  }, [fetchRecords, filterCategory]);

  return (
    <div className="page-container">
      <NavHeader title="成长时间线" showBack />

      <div className="mt-4 mb-5">
        <FilterBar selected={filterCategory} onSelect={setFilterCategory} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-coral/30 border-t-coral rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <span className="text-5xl mb-3">📭</span>
          <p className="text-sm">暂无记录</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-rule/60" />
          <div className="space-y-1">
            {records.map((record, index) => (
              <div key={record.record_id} className="relative pl-10 animate-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="absolute left-[17px] top-4 w-2 h-2 rounded-full bg-coral shadow-sm" />
                <div className="card-shadow p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-muted/60">
                      {new Date(record.记录时间).toLocaleDateString('zh-CN', {
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short',
                      })}
                    </span>
                    {record.是否为里程碑 && <span className="text-xs">⭐ 里程碑</span>}
                  </div>
                  <RecordItem record={record} compact />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <FloatingButton />
    </div>
  );
}
