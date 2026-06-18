import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord } from '@/api/feishu';
import BabyCard from '@/components/BabyCard';
import RecordItem from '@/components/RecordItem';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const { baby, fetchBaby } = useAppStore();
  const [recentRecords, setRecentRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function init() {
      await fetchBaby();
      const records = await useAppStore.getState().fetchRecentRecords();
      setRecentRecords(records);
      setLoading(false);
    }
    init();
  }, [fetchBaby]);

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-coral/30 border-t-coral rounded-full animate-spin" />
          <p className="text-sm text-muted">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <NavHeader title="宝宝成长记录" />

      <div className="mt-4">
        {baby && <BabyCard baby={baby} />}

        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-outfit font-bold text-ink">最近记录</h2>
            <button
              onClick={() => navigate('/timeline')}
              className="text-xs text-coral font-medium hover:text-coral-dark transition-colors"
            >
              查看全部 →
            </button>
          </div>
          <div className="card-shadow divide-y divide-rule/30 px-4">
            {recentRecords.length > 0 ? (
              recentRecords.map((record) => (
                <RecordItem key={record.record_id} record={record} />
              ))
            ) : (
              <div className="py-10 text-center">
                <p className="text-4xl mb-2">📝</p>
                <p className="text-sm text-muted">还没有记录，快来记录宝宝的成长吧</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <FloatingButton />
    </div>
  );
}
