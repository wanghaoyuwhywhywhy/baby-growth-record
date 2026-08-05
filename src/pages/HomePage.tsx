import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord, type Baby } from '@/api/feishu';
import BabyCard from '@/components/BabyCard';
import RecordItem from '@/components/RecordItem';
import FloatingButton from '@/components/FloatingButton';
import UploadProgressPanel from '@/components/UploadProgressPanel';
import NavHeader from '@/components/NavHeader';
import { useNavigate } from 'react-router-dom';
import { Activity, Sparkles, Loader2, X, MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { analyzeBaby } from '@/lib/ai';

export default function HomePage() {
  const currentBaby = useAppStore((s) => s.currentBaby);
  const babies = useAppStore((s) => s.babies);
  const switchBaby = useAppStore((s) => s.switchBaby);
  const fetchRecentRecords = useAppStore((s) => s.fetchRecentRecords);
  const fetchGrowthRecords = useAppStore((s) => s.fetchGrowthRecords);
  const [recentRecords, setRecentRecords] = useState<DailyRecord[]>([]);
  const navigate = useNavigate();

  const baby = currentBaby();
  const records = useAppStore((s) => s.records);
  const growthRecords = useAppStore((s) => s.growthRecords);

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [forceRefreshing, setForceRefreshing] = useState(false);

  // 强制刷新：注销 Service Worker + 清除 Cache Storage，然后重载页面（保留业务数据）
  async function handleForceRefresh() {
    setForceRefreshing(true);
    try {
      // 1. 注销所有 Service Worker
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      // 2. 清除所有 Cache Storage（PWA 静态资源缓存）
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // 3. 强制重载（绕过缓存）
      window.location.reload();
    } catch (e) {
      console.warn('强制刷新失败，普通重载:', e);
      window.location.reload();
    }
  }
  const aiAbortRef = useRef<AbortController | null>(null);

  // 左右滑动切换宝宝
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    setTouchEnd(null);
    setTouchStart({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  }

  function onTouchMove(e: React.TouchEvent) {
    setTouchEnd({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  }

  function onTouchEnd() {
    if (!touchStart || !touchEnd) return;
    const dx = touchStart.x - touchEnd.x;
    const dy = touchStart.y - touchEnd.y;
    const minSwipeDistance = 50;
    // 必须水平滑动距离大于垂直距离，且超过50px才触发切换
    if (babies.length <= 1) return;
    if (Math.abs(dx) < minSwipeDistance) return;
    if (Math.abs(dx) < Math.abs(dy)) return;
    const currentIndex = babies.findIndex(b => b.record_id === (baby?.record_id));
    if (currentIndex < 0) return;
    if (dx > 0) {
      // 向左滑 → 下一个宝宝（循环：最后一个→第一个）
      const nextIndex = (currentIndex + 1) % babies.length;
      switchBaby(babies[nextIndex].record_id);
    } else {
      // 向右滑 → 上一个宝宝（循环：第一个→最后一个）
      const prevIndex = (currentIndex - 1 + babies.length) % babies.length;
      switchBaby(babies[prevIndex].record_id);
    }
  }

  useEffect(() => {
    fetchRecentRecords().then(setRecentRecords);
  }, [fetchRecentRecords, baby?.record_id, records]);

  useEffect(() => {
    if (baby?.record_id) {
      fetchGrowthRecords();
    }
  }, [baby?.record_id, fetchGrowthRecords]);

  async function handleAIAnalysis() {
    if (aiAnalyzing) {
      aiAbortRef.current?.abort();
      setAiAnalyzing(false);
      setAiResult(null);
      return;
    }
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
    } catch (e: unknown) {
      if ((e instanceof Error || e instanceof DOMException) && e.name === 'AbortError') return;
      setAiResult(`分析失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setAiAnalyzing(false);
      aiAbortRef.current = null;
    }
  }

  // 无宝宝引导页
  if (babies.length === 0) {
    return (
      <div className="page-container">
        <NavHeader title="嘻嘻成长记录" rightAction={
          <button
            onClick={handleForceRefresh}
            disabled={forceRefreshing}
            className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:bg-cream-dark transition-colors disabled:opacity-50"
            aria-label="强制刷新"
            title="清除缓存并刷新"
          >
            <RefreshCw size={18} className={forceRefreshing ? 'animate-spin' : ''} />
          </button>
        } />
        <div className="mt-20 flex flex-col items-center text-center px-8">
          <span className="text-6xl mb-4">👶</span>
          <h2 className="text-lg font-outfit font-bold text-ink mb-2">添加宝宝</h2>
          <p className="text-sm text-muted mb-6">记录宝宝的成长点滴，从添加宝宝档案开始</p>
          <button
            onClick={() => navigate('/baby/edit')}
            className="btn-primary flex items-center gap-2 mb-4"
          >
            <Plus size={18} />
            添加宝宝
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <NavHeader title="宝宝成长记录" rightAction={
        <button
          onClick={handleForceRefresh}
          disabled={forceRefreshing}
          className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:bg-cream-dark transition-colors disabled:opacity-50"
          aria-label="强制刷新"
          title="清除缓存并刷新"
        >
          <RefreshCw size={18} className={forceRefreshing ? 'animate-spin' : ''} />
        </button>
      } />

      <div className="mt-4">
        {/* 多宝宝切换标签 */}
        {babies.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
            {babies.map((b) => {
              const isActive = b.record_id === (baby?.record_id);
              return (
                <button
                  key={b.record_id}
                  onClick={() => switchBaby(b.record_id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all
                    ${isActive
                      ? 'bg-coral text-white shadow-soft'
                      : 'bg-cream-dark/50 text-muted hover:bg-cream-dark'
                    }`}
                >
                  <span>{b.宝宝姓名}</span>
                </button>
              );
            })}
          </div>
        )}

        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="mb-4">
          {baby && <BabyCard baby={baby} />}
        </div>

        {/* 四个快捷入口并排 */}
        <div className="grid grid-cols-4 gap-2.5 mb-3">
          <button
            onClick={() => navigate('/growth')}
            className="card-shadow p-3 flex flex-col items-center gap-1.5 hover:shadow-float transition-all duration-200 active:scale-[0.97]"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mint to-sky flex items-center justify-center text-white shadow-soft">
              <Activity size={18} strokeWidth={2.5} />
            </div>
            <p className="text-xs font-outfit font-bold text-ink">身高体重</p>
          </button>

          <button
            onClick={() => navigate('/vaccine')}
            className="card-shadow p-3 flex flex-col items-center gap-1.5 hover:shadow-float transition-all duration-200 active:scale-[0.97]"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white shadow-soft">
              <span className="text-base">💉</span>
            </div>
            <p className="text-xs font-outfit font-bold text-ink">疫苗接种</p>
          </button>

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
      <UploadProgressPanel />
    </div>
  );
}
