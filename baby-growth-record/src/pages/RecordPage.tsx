import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import CategoryPicker from '@/components/CategoryPicker';
import NavHeader from '@/components/NavHeader';
import { Check } from 'lucide-react';

export default function RecordPage() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('饮食');
  const [isMilestone, setIsMilestone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { createRecord } = useAppStore();
  const navigate = useNavigate();

  const canSubmit = content.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    await createRecord({
      记录内容: content.trim(),
      分类: category,
      是否为里程碑: isMilestone,
    });
    setSubmitting(false);
    setSuccess(true);
    setTimeout(() => navigate('/'), 800);
  }

  if (success) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="text-center animate-pop">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center mx-auto mb-5 shadow-float">
            <Check size={40} className="text-white" strokeWidth={2.5} />
          </div>
          <h2 className="text-xl font-outfit font-bold text-ink mb-2">记录成功！</h2>
          <p className="text-sm text-muted">成长的一刻已被珍藏 ✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container flex flex-col">
      <NavHeader title="添加记录" showBack />

      <div className="flex-1 flex flex-col mt-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-muted mb-3">选择分类</label>
          <CategoryPicker selected={category} onSelect={setCategory} />
        </div>

        <div className="flex-1 mb-4">
          <label className="block text-sm font-medium text-muted mb-3">记录内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="今天宝宝做了什么？"
            maxLength={500}
            rows={6}
            className="w-full bg-cream-light border border-rule rounded-2xl p-4 text-ink
                       placeholder:text-muted/40 resize-none outline-none
                       focus:border-coral/50 focus:ring-4 focus:ring-coral/5
                       transition-all duration-200 text-[15px] leading-relaxed"
            autoFocus
          />
          <p className="text-xs text-muted/50 text-right mt-1">{content.length}/500</p>
        </div>

        <div className="mb-6">
          <button
            type="button"
            onClick={() => setIsMilestone(!isMilestone)}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all duration-200
              ${isMilestone
                ? 'border-warm-orange bg-warm-light/30 text-warm-orange'
                : 'border-rule bg-cream-light text-muted'
              }
            `}
          >
            <span className="text-2xl">{isMilestone ? '⭐' : '☆'}</span>
            <div className="text-left">
              <p className="text-sm font-medium">标记为成长里程碑</p>
              <p className="text-xs opacity-70">如：第一次翻身、第一次叫妈妈</p>
            </div>
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary w-full text-base flex items-center justify-center gap-2"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span>记录这一刻 📝</span>
          )}
        </button>
      </div>
    </div>
  );
}
