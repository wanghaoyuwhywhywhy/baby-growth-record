import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord } from '@/api/feishu';
import BabyCard from '@/components/BabyCard';
import RecordItem from '@/components/RecordItem';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';
import { useNavigate } from 'react-router-dom';
import { Activity, Sparkles, Loader2, X, MessageCircle } from 'lucide-react';
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
  const aiAbortRef = useRef<AbortController | null>(null);

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
    // 如果正在分析，再次点击取消
    if (aiAnalyzing) {
      aiAbortRef.current?.abort();
      setAiAnalyzing(false);
      setAiResult(null);
      return;
    }
    // 如果已有结果，再次点击关闭弹窗
    if (aiResult) {
      setAiResult(null);
      return;
    }
    if (!baby) return;
    setAiAnalyzing(true);
    setAiResult(null);
    const abort = new AbortController();
    aiAbortRef.current = abort;
    try {
      const result = await analyzeBaby(baby, growthRecords, records, abort.signal);
      setAiResult(result);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setAiResult(`分析失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setAiAnalyzing(false);
      aiAbortRef.current = null;
    }
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

        {/* 四个快捷入口并排 */}
        <div className="grid grid-cols-4 gap-2.5 mb-3">
          {/* 身高体重入口 */}
          <button
            onClick={() => navigate('/growth')}
            className="card-shadow p-3 flex flex-col items-center gap-1.5 hover:shadow-float transition-all duration-200 active:scale-[0.97]"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mint to-sky flex items-center justify-center text-white shadow-soft">
              <Activity size={18} strokeWidth={2.5} />
            </div>
            <p className="text-xs font-outfit font-bold text-ink">身高体重</p>
          </button>

          {/* 疫苗接种入口 */}
          <button
            onClick={() => navigate('/vaccine')}
            className="card-shadow p-3 flex flex-col items-center gap-1.5 hover:shadow-float transition-all duration-200 active:scale-[0.97]"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white shadow-soft">
              <span className="text-base">💉</span>
            </div>
            <p className="text-xs font-outfit font-bold text-ink">疫苗接种</p>
          </button>

          {/* AI 成长分析入口 */}
          <button
            onClick={handleAIAnalysis}
            className="card-shadow p-3 flex flex-col items-center gap-1.5 hover:shadow-float transition-all duration-200 active:scale-[0.97]"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-warm-orange to-coral flex items-center justify-center text-white shadow-soft">
              {aiAnalyzing ? (
                <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <Sparkles size={18} strokeWidth={2.5} />
              )}
            </div>
            <p className="text-xs font-outfit font-bold text-ink">{aiAnalyzing ? '取消' : 'AI 分析'}</p>
          </button>

          {/* AI 咨询入口 */}
          <button
            onClick={() => navigate('/chat')}
            className="card-shadow p-3 flex flex-col items-center gap-1.5 hover:shadow-float transition-all duration-200 active:scale-[0.97]"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky to-mint flex items-center justify-center text-white shadow-soft">
              <MessageCircle size={18} strokeWidth={2.5} />
            </div>
            <p className="text-xs font-outfit font-bold text-ink">AI 咨询</p>
          </button>
        </div>

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
