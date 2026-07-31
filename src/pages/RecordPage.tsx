import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useUploadStore, type UploadTask } from '@/store/useUploadStore';
import CategoryPicker from '@/components/CategoryPicker';
import NavHeader from '@/components/NavHeader';
import MediaInput, { type MediaItem } from '@/components/MediaInput';
import { autoCategory, polishContent } from '@/lib/ai';
import { Check, Sparkles, Wand2, Loader2 } from 'lucide-react';

type MediaType = 'text' | 'voice' | 'video' | 'photo';

export default function RecordPage() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [aiLoading, setAiLoading] = useState<'category' | 'polish' | null>(null);
  const { createRecord } = useAppStore();
  const navigate = useNavigate();

  const canSubmit = (content.trim().length > 0 || mediaItems.length > 0) && !submitting;

  const handleVoiceTranscript = useCallback((text: string) => {
    setVoiceTranscript(text);
  }, []);

  const handleMediaAdd = useCallback((media: MediaItem) => {
    setMediaItems((prev) => [...prev, media]);
  }, []);

  const handleMediaRemove = useCallback((id: string) => {
    setMediaItems((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  const handleCategorySelect = useCallback((cat: string) => {
    setCategory(cat);
    setCategoryManuallySet(true);
  }, []);

  // AI 自动分类
  async function handleAutoCategory() {
    const textToAnalyze = content.trim() || voiceTranscript.trim();
    if (!textToAnalyze) return;
    setAiLoading('category');
    try {
      const result = await autoCategory(textToAnalyze);
      setCategory(result);
      setCategoryManuallySet(true);
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
      // 收集所有涉及的媒体类型（多选）
      const mediaTypes: MediaType[] = [];
      if (content.trim()) mediaTypes.push('text');
      if (mediaItems.some(m => m.type === 'voice')) mediaTypes.push('voice');
      if (mediaItems.some(m => m.type === 'image')) mediaTypes.push('photo');
      if (mediaItems.some(m => m.type === 'video')) mediaTypes.push('video');
      if (mediaTypes.length === 0) mediaTypes.push('text');

      // 分类自动识别：未手动选择时，自动 AI 识别
      let finalCategory = category;
      if (!categoryManuallySet || !category) {
        const textToAnalyze = content.trim() || voiceTranscript.trim();
        if (textToAnalyze) {
          try {
            finalCategory = await autoCategory(textToAnalyze);
          } catch {
            finalCategory = '其他';
          }
        } else {
          finalCategory = '其他';
        }
      }

      const mediaIds = mediaItems.map(m => m.id);

      // 1. 先创建记录（快速完成，不涉及大文件上传）
      const record = await createRecord({
        记录内容: content.trim(),
        分类: finalCategory,
        是否为里程碑: false,
        媒体类型: mediaTypes,
        媒体附件: mediaIds.length > 0 ? mediaIds : undefined,
        语音转文字: voiceTranscript.trim() || undefined,
      });

      // 2. 如果有媒体文件，交由后台上传任务
      if (mediaItems.length > 0) {
        const uploadTasks: UploadTask[] = mediaItems.map((media) => ({
          id: `upload_${media.id}`,
          recordId: record.record_id,
          mediaId: media.id,
          fileName: `${media.id}.${media.type === 'voice' ? (media.blob.type.includes('mp4') ? 'mp4' : 'webm') : media.type === 'video' ? 'mp4' : 'jpg'}`,
          fileSize: media.blob.size,
          mediaType: media.type,
          blob: media.blob,
          status: 'pending' as const,
          progress: 0,
        }));

        const { startUpload } = useUploadStore.getState();
        startUpload({
          recordId: record.record_id,
          tasks: uploadTasks,
          createdAt: Date.now(),
          summary: content.trim().slice(0, 30) || '媒体记录',
        });
      }

      // 3. 立即返回首页，上传在后台继续
      setSubmitting(false);
      setSuccess(true);
      mediaItems.forEach((m) => URL.revokeObjectURL(m.url));
      setTimeout(() => navigate('/'), 600);
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
          <p className="text-sm text-muted">媒体文件将在后台上传 ✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container flex flex-col">
      <NavHeader title="添加记录" showBack />

      <div className="flex-1 flex flex-col mt-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-muted">选择分类</label>
            {(content.trim() || voiceTranscript.trim()) && (
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
          <CategoryPicker
            selected={category}
            onSelect={handleCategorySelect}
            placeholder="未选择（提交时自动识别）"
          />
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
            onChange={(e) => setContent(e.target.value)}
            placeholder="记录内容（可选，也可直接拍照/录音）"
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
            onVoiceTranscript={handleVoiceTranscript}
            onMediaAdd={handleMediaAdd}
            onMediaRemove={handleMediaRemove}
            mediaItems={mediaItems}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary w-full text-base flex items-center justify-center gap-2"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span>记录这一刻</span>
          )}
        </button>
      </div>
    </div>
  );
}
