import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord } from '@/api/feishu';
import BabyCard from '@/components/BabyCard';
import RecordItem from '@/components/RecordItem';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';
import { useNavigate } from 'react-router-dom';
import { Activity, Sparkles, Loader2, X } from 'lucide-react';
import { analyzeBaby } from '@/lib/ai';

export default function HomePage() {
  const currentBaby = useAppStore((s) => s.currentBaby);
  const fetchRecentRecords = useAppStore((s) => s.fetchRecentRecords);
  const fetchGrowthRecords = useAppStore((s) => s.fetchGrowthRecords);
  const [recentRecords, setRecentRecords] = useState<DailyRecord[]>([]);
  const navigate = useNavigate();

  const baby = currentBaby();
  const records = useAppStore((s) => s.records);
  const growthRecords = useAppStore((s) => s.growthRecords);

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  // 首次加载和 records 变化时刷新最近记录
  useEffect(() => {
    fetchRecentRecords().then(setRecentRecords);
  }, [fetchRecentRecords, baby?.record_id, records]);

  // 加载成长记录（用于 BabyCard 显示身高体重）
  useEffect(() => {
    if (baby?.record_id) {
      fetchGrowthRecords();
    }
  }, [baby?.record_id, fetchGrowthRecords]);

  async function handleAIAnalysis() {
    if (!baby || aiAnalyzing) return;
    setAiAnalyzing(true);
    setAiResult(null);
    try {
      const result = await analyzeBaby(baby, growthRecords, records);
      setAiResult(result);
    } catch (e) {
      setAiResult(`分析失败：${e instanceof Error ? e.message : '未知错误'}`);
    }
    setAiAnalyzing(false);
  }

  if (!baby) {
    return (
      <div className="page-container">
        <NavHeader title="宝宝成长记录" />
        <div className="mt-20 flex flex-col items-center text-center">
          <span className="text-6xl mb-4">👶</span>
          <h2 className="text-lg font-outfit font-bold text-ink mb-2">加载中...</h2>
          <p className="text-sm text-muted">正在获取宝宝档案</p>
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

        {/* AI 成长分析入口 */}
        <button
          onClick={handleAIAnalysis}
          disabled={aiAnalyzing}
          className="card-shadow w-full p-4 mb-3 flex items-center gap-3 hover:shadow-float transition-all duration-200 active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-warm-orange to-coral flex items-center justify-center text-white shadow-soft">
            {aiAnalyzing ? (
              <Loader2 size={22} strokeWidth={2.5} className="animate-spin" />
            ) : (
              <Sparkles size={22} strokeWidth={2.5} />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-outfit font-bold text-ink">AI 成长分析</p>
            <p className="text-xs text-muted">
              {aiAnalyzing ? '正在分析中...' : '智能分析发育趋势与建议'}
            </p>
          </div>
          <span className="text-muted text-lg">›</span>
        </button>

        {/* AI 分析结果弹窗 */}
        {aiResult && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setAiResult(null)}>
            <div
              className="w-full max-w-lg bg-cream-light rounded-t-3xl p-6 pb-10 max-h-[80vh] overflow-y-auto animate-fade-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-warm-orange to-coral flex items-center justify-center text-white">
                    <Sparkles size={16} />
                  </div>
                  <h3 className="text-base font-outfit font-bold text-ink">AI 成长分析</h3>
                </div>
                <button
                  onClick={() => setAiResult(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
                >
                  <X size={18} className="text-muted" />
                </button>
              </div>
              <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                {aiResult}
              </div>
            </div>
          </div>
        )}

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
