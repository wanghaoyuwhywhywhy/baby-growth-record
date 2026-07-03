import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord, type Baby } from '@/api/feishu';
import BabyCard from '@/components/BabyCard';
import RecordItem from '@/components/RecordItem';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';
import { useNavigate } from 'react-router-dom';
import { Activity, Sparkles, Loader2, X, MessageCircle, Plus, Settings } from 'lucide-react';
import { analyzeBaby } from '@/lib/ai';
import { getAuthBabyRelations } from '@/lib/auth';

export default function HomePage() {
  const currentBaby = useAppStore((s) => s.currentBaby);
  const babies = useAppStore((s) => s.babies);
  const switchBaby = useAppStore((s) => s.switchBaby);
  const fetchRecentRecords = useAppStore((s) => s.fetchRecentRecords);
  const fetchGrowthRecords = useAppStore((s) => s.fetchGrowthRecords);
  const [recentRecords, setRecentRecords] = useState<DailyRecord[]>([]);
  const navigate = useNavigate();
  const babyRelations = getAuthBabyRelations();

  const baby = currentBaby();
  const records = useAppStore((s) => s.records);
  const growthRecords = useAppStore((s) => s.growthRecords);

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

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
    } catch (e: any) {
      if (e.name === 'AbortError') return;
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
        <NavHeader title="宝宝成长记录" rightAction={
          <button onClick={() => navigate('/settings')} className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:bg-cream-dark transition-colors">
            <Settings size={20} />
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
        <div className="mt-8 mx-5">
          <div className="card-shadow p-4">
            <h3 className="text-sm font-outfit font-bold text-ink mb-3">加入已有宝宝</h3>
            <p className="text-xs text-muted mb-3">输入邀请码，关联到已有的宝宝档案</p>
            <HomeInviteCodeInput />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <NavHeader title="宝宝成长记录" rightAction={
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('/baby/edit')}
            className="w-9 h-9 flex items-center justify-center rounded-full text-coral hover:bg-coral/5 transition-colors"
            aria-label="添加宝宝"
          >
            <Plus size={20} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:bg-cream-dark transition-colors"
            aria-label="设置"
          >
            <Settings size={20} />
          </button>
        </div>
      } />

      <div className="mt-4">
        {/* 多宝宝切换标签 */}
        {babies.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
            {babies.map((b) => {
              const isActive = b.record_id === (baby?.record_id);
              const relation = babyRelations[b.record_id];
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
                  {relation && (
                    <span className={`text-[10px] px-1 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-rule/30'}`}>
                      {relation}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {baby && <BabyCard baby={baby} />}

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
    </div>
  );
}

function HomeInviteCodeInput() {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleRedeem() {
    if (!code.trim()) return;
    setSubmitting(true);
    setResult(null);
    const { cloudRedeemInvite } = await import('@/lib/cloud');
    const res = await cloudRedeemInvite(code.trim());
    setSubmitting(false);
    if (res.ok) {
      setResult({ ok: true, msg: '关联成功！正在加载...' });
      setCode('');
      setTimeout(() => window.location.reload(), 800);
    } else {
      setResult({ ok: false, msg: res.error || '关联失败' });
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setResult(null); }}
          placeholder="输入邀请码，如 INV-A3B5C7"
          maxLength={10}
          className="flex-1 bg-white border border-rule rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50"
        />
        <button
          onClick={handleRedeem}
          disabled={!code.trim() || submitting}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {submitting ? '...' : '关联'}
        </button>
      </div>
      {result && (
        <p className={`text-xs mt-1.5 ${result.ok ? 'text-green-600' : 'text-red-500'}`}>{result.msg}</p>
      )}
    </div>
  );
}
