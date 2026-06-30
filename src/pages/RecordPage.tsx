import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import CategoryPicker from '@/components/CategoryPicker';
import NavHeader from '@/components/NavHeader';
import MediaInput, { type MediaItem } from '@/components/MediaInput';
import { feishuAPI } from '@/api/feishu';
import { autoCategory, polishContent } from '@/lib/ai';
import { Check, Sparkles, Wand2, Loader2 } from 'lucide-react';

type MediaType = 'text' | 'voice' | 'video' | 'photo';

export default function RecordPage() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('饮食');
  const [isMilestone, setIsMilestone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [aiLoading, setAiLoading] = useState<'category' | 'polish' | null>(null);
  const [inputMethod, setInputMethod] = useState<MediaType>('text');
  const { createRecord } = useAppStore();
  const navigate = useNavigate();

  const canSubmit = content.trim().length > 0 && !submitting;

  const handleTranscriptChange = useCallback((text: string) => {
    setContent(text);
    if (text.trim()) setInputMethod('voice');
  }, []);

  const handleMediaAdd = useCallback((media: MediaItem) => {
    setMediaItems((prev) => [...prev, media]);
    setInputMethod(media.type === 'image' ? 'photo' : 'video');
  }, []);

  const handleMediaRemove = useCallback((id: string) => {
    setMediaItems((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item) URL.revokeObjectURL(item.url);
      const remaining = prev.filter((m) => m.id !== id);
      // 如果没有媒体了，回退到 text 或 voice
      if (remaining.length === 0) {
        setInputMethod(content.trim() ? 'text' : 'text');
      }
      return remaining;
    });
  }, [content]);

  // AI 自动分类
  async function handleAutoCategory() {
    if (!content.trim()) return;
    setAiLoading('category');
    try {
      const result = await autoCategory(content.trim());
      setCategory(result);
    } catch (e) {
      console.error('自动分类失败:', e);
    }
    setAiLoading(null);
  }

  // AI 润色
  async function handlePolish() {
    if (!content.trim()) return;
    setAiLoading('polish');
    try {
      const polished = await polishContent(content.trim());
      if (polished) setContent(polished);
    } catch (e) {
      console.error('润色失败:', e);
    }
    setAiLoading(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // 确定最终媒体类型：如果有媒体附件，优先用附件类型；如果语音输入则用 voice；否则 text
      let finalMediaType: MediaType = inputMethod;
      if (mediaItems.length > 0) {
        const hasVideo = mediaItems.some(m => m.type === 'video');
        const hasImage = mediaItems.some(m => m.type === 'image');
        finalMediaType = hasVideo ? 'video' : hasImage ? 'photo' : inputMethod;
      }

      const record = await createRecord({
        记录内容: content.trim(),
        分类: category,
        是否为里程碑: isMilestone,
        媒体类型: finalMediaType,
      });

      for (const media of mediaItems) {
        await feishuAPI.addMedia(media.id, media.type, media.blob, record.record_id);
      }

      setSubmitting(false);
      setSuccess(true);
      mediaItems.forEach((m) => URL.revokeObjectURL(m.url));
      setTimeout(() => navigate('/'), 800);
    } catch (e) {
      setSubmitting(false);
      alert(e instanceof Error ? e.message : '保存失败');
    }
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

  const mediaTypeLabel: Record<MediaType, string> = {
    text: '文字', voice: '语音', video: '视频', photo: '照片',
  };
  const mediaTypeEmoji: Record<MediaType, string> = {
    text: '📝', voice: '🎙️', video: '🎬', photo: '📷',
  };

  return (
    <div className="page-container flex flex-col">
      <NavHeader title="添加记录" showBack />

      <div className="flex-1 flex flex-col mt-6">
        {/* 当前输入方式指示 */}
        {inputMethod !== 'text' && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm">{mediaTypeEmoji[inputMethod]}</span>
            <span className="text-xs text-muted">当前：{mediaTypeLabel[inputMethod]}记录</span>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-muted">选择分类</label>
            {content.trim() && (
              <button
                onClick={handleAutoCategory}
                disabled={aiLoading !== null}
                className="text-xs text-coral font-medium flex items-center gap-1 hover:text-coral-dark transition-colors disabled:opacity-50"
              >
                {aiLoading === 'category' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                AI 分类
              </button>
            )}
          </div>
          <CategoryPicker selected={category} onSelect={setCategory} />
        </div>

        <div className="flex-1 mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-muted">记录内容</label>
            {content.trim().length > 5 && (
              <button
                onClick={handlePolish}
                disabled={aiLoading !== null}
                className="text-xs text-coral font-medium flex items-center gap-1 hover:text-coral-dark transition-colors disabled:opacity-50"
              >
                {aiLoading === 'polish' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Wand2 size={12} />
                )}
                AI 润色
              </button>
            )}
          </div>
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); if (inputMethod === 'text' || !mediaItems.length) setInputMethod('text'); }}
            placeholder="今天宝宝做了什么？点击下方麦克风语音输入，或拍照记录"
            maxLength={500}
            rows={5}
            className="w-full bg-cream-light border border-rule rounded-2xl p-4 text-ink
                       placeholder:text-muted/40 resize-none outline-none
                       focus:border-coral/50 focus:ring-4 focus:ring-coral/5
                       transition-all duration-200 text-[15px] leading-relaxed"
            autoFocus
          />
          <p className="text-xs text-muted/50 text-right mt-1">{content.length}/500</p>
        </div>

        {/* 媒体输入工具栏 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-muted mb-3">语音 / 图片 / 视频</label>
          <MediaInput
            onTranscriptChange={handleTranscriptChange}
            onMediaAdd={handleMediaAdd}
            onMediaRemove={handleMediaRemove}
            mediaItems={mediaItems}
            initialText=""
          />
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
            <span>记录这一刻 {mediaTypeEmoji[inputMethod]}</span>
          )}
        </button>
      </div>
    </div>
  );
}
