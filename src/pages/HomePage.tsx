import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord } from '@/api/feishu';
import BabyCard from '@/components/BabyCard';
import RecordItem from '@/components/RecordItem';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';
import { useNavigate } from 'react-router-dom';
import { Activity, Settings } from 'lucide-react';

export default function HomePage() {
  const { currentBaby, fetchBabies } = useAppStore();
  const [recentRecords, setRecentRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const currentBabyId = currentBaby()?.record_id;

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchBabies();
      const records = await useAppStore.getState().fetchRecentRecords();
      setRecentRecords(records);
      setLoading(false);
    }
    init();
  }, [fetchBabies, currentBabyId]);

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

  const baby = currentBaby();

  if (!baby) {
    return (
      <div className="page-container">
        <NavHeader title="宝宝成长记录" />
        <div className="mt-20 flex flex-col items-center text-center">
          <span className="text-6xl mb-4">👶</span>
          <h2 className="text-lg font-outfit font-bold text-ink mb-2">还没有宝宝档案</h2>
          <p className="text-sm text-muted mb-6">快来添加第一个小宝贝吧</p>
          <button
            onClick={() => navigate('/baby/edit')}
            className="btn-primary"
          >
            添加宝宝
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <NavHeader title="宝宝成长记录" />

      <div className="mt-4">
        <BabyCard baby={baby} />

        {/* 身高体重入口 */}
        <button
          onClick={() => navigate('/growth')}
          className="card-shadow w-full p-4 mb-3 flex items-center gap-3 hover:shadow-float transition-all duration-200 active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mint to-sky flex items-center justify-center text-white shadow-soft">
            <Activity size={22} strokeWidth={2.5} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-outfit font-bold text-ink">身高体重</p>
            <p className="text-xs text-muted">记录成长曲线，见证每一厘米</p>
          </div>
          <span className="text-muted text-lg">›</span>
        </button>

        {/* 设置入口 */}
        <button
          onClick={() => navigate('/settings')}
          className="card-shadow w-full p-4 mb-6 flex items-center gap-3 hover:shadow-float transition-all duration-200 active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cream-dark to-rule flex items-center justify-center text-ink shadow-soft">
            <Settings size={22} strokeWidth={2.5} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-outfit font-bold text-ink">设置</p>
            <p className="text-xs text-muted">AI 配置、数据管理</p>
          </div>
          <span className="text-muted text-lg">›</span>
        </button>

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
