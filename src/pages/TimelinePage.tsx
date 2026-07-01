import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord } from '@/api/feishu';
import { feishuAPI } from '@/api/feishu';
import { CATEGORIES, CATEGORY_MAP } from '@/utils/constants';
import { getCloudAssetUrl } from '@/lib/cloud';
import { isEditMode } from '@/lib/auth';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';
import { FileText, Mic, Video, Camera, Play, Pause, Pencil, X } from 'lucide-react';

const MEDIA_TYPES = [
  { key: '全部', label: '全部', icon: null },
  { key: 'text', label: '文字', icon: FileText },
  { key: 'voice', label: '语音', icon: Mic },
  { key: 'photo', label: '图片', icon: Camera },
  { key: 'video', label: '视频', icon: Video },
] as const;

const CATEGORY_FILTERS = [
  { key: '全部', label: '全部', emoji: '📋' },
  ...CATEGORIES.map(c => ({ key: c.key, label: c.label, emoji: c.emoji })),
];

const MEDIA_TYPE_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  text: { bg: 'bg-blue-100', text: 'text-blue-600', icon: <FileText size={12} /> },
  voice: { bg: 'bg-amber-100', text: 'text-amber-600', icon: <Mic size={12} /> },
  video: { bg: 'bg-purple-100', text: 'text-purple-600', icon: <Video size={12} /> },
  photo: { bg: 'bg-green-100', text: 'text-green-600', icon: <Camera size={12} /> },
};

function formatTimelineTime(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 判断是否为云端 file_token
function isCloudToken(token: string): boolean {
  return !token.startsWith('media_') && !token.startsWith('img_') && !token.startsWith('vid_') && !token.startsWith('voice_');
}

// 根据媒体类型优先级分配 token：voice → video → photo
function assignTokenTypes(tokens: string[], mediaTypes: string[]): { id: string; type: 'voice' | 'video' | 'image' }[] {
  const result: { id: string; type: 'voice' | 'video' | 'image' }[] = [];
  let idx = 0;
  if (mediaTypes.includes('voice') && idx < tokens.length) {
    result.push({ id: tokens[idx], type: 'voice' }); idx++;
  }
  if (mediaTypes.includes('video') && idx < tokens.length) {
    result.push({ id: tokens[idx], type: 'video' }); idx++;
  }
  while (idx < tokens.length) {
    result.push({ id: tokens[idx], type: 'image' }); idx++;
  }
  return result;
}

// 语音播放器组件
function VoicePlayer({ record }: { record: DailyRecord }) {
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mediaAttachments = record.媒体附件 || [];
  const cloudTokens = mediaAttachments.filter(isCloudToken);

  useEffect(() => {
    if (cloudTokens.length > 0) {
      const mediaTypes = record.媒体类型 || ['text'];
      if (mediaTypes.includes('voice')) {
        // 使用 assignTokenTypes 正确找到 voice token
        const assigned = assignTokenTypes(cloudTokens, mediaTypes);
        const voiceToken = assigned.find(a => a.type === 'voice');
        if (voiceToken) {
          setAudioUrl(getCloudAssetUrl(record.record_id, voiceToken.id, 'voice'));
          return;
        }
      }
    }
    // 本地 fallback
    let url = '';
    async function load() {
      const items = await feishuAPI.getMediaByRecord(record.record_id);
      const voiceItem = items.find(i => i.type === 'voice');
      if (voiceItem) {
        url = URL.createObjectURL(voiceItem.blob);
        setAudioUrl(url);
      }
    }
    load();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [record.record_id, record.媒体类型, cloudTokens.length]);

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setCurrentTime(audio.currentTime);
    setProgress((audio.currentTime / audio.duration) * 100);
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (audio && isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  }

  function handleEnded() {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.currentTime = 0;
      audio.play().catch((e) => {
        console.warn('语音播放失败:', e);
        setLoadError(true);
      });
    }
    setPlaying(!playing);
  }

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!audioUrl) return null;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          disabled={loadError}
          className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform disabled:opacity-50"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onError={() => { setLoadError(true); setPlaying(false); }}
          preload="metadata"
          className="hidden"
        />
        <div className="flex-1 h-1.5 bg-amber-100 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-[width] duration-200 ease-linear" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[10px] text-muted/70 flex-shrink-0 tabular-nums w-10 text-right">
          {playing ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>
      {loadError && (
        <p className="text-[10px] text-red-400 mt-1">语音加载失败</p>
      )}
      {/* 语音转文字 */}
      {record.语音转文字 && (
        <div className="mt-1.5 p-2 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-center gap-1 mb-0.5">
            <Mic size={10} className="text-amber-500" />
            <span className="text-[10px] text-amber-600 font-medium">语音转文字</span>
          </div>
          <p className="text-xs text-ink leading-relaxed">{record.语音转文字}</p>
        </div>
      )}
    </div>
  );
}

// 媒体预览组件（图片/视频）
function MediaPreview({ record }: { record: DailyRecord }) {
  const [localImages, setLocalImages] = useState<{ id: string; url: string }[]>([]);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const mediaAttachments = record.媒体附件 || [];
  const cloudTokens = mediaAttachments.filter(isCloudToken);

  useEffect(() => {
    // 如果有云端 token，优先使用云端 URL，不需要加载本地
    if (cloudTokens.length > 0) return;

    let urls: string[] = [];
    let revoked = false;
    async function load() {
      const items = await feishuAPI.getMediaByRecord(record.record_id);
      if (revoked || items.length === 0) return;
      const hasVideo = (record.媒体类型 || ['text']).includes('video');
      if (hasVideo && items.length > 0) {
        const u = URL.createObjectURL(items[0].blob);
        urls.push(u);
        setLocalVideoUrl(u);
      } else {
        const imgs = items.filter(i => i.type === 'image').map(i => {
          const u = URL.createObjectURL(i.blob);
          urls.push(u);
          return { id: i.id, url: u };
        });
        setLocalImages(imgs);
      }
    }
    load();
    return () => { revoked = true; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [record.record_id, record.媒体类型, cloudTokens.length]);

  const mediaTypes = record.媒体类型 || ['text'];

  // 云端 URL
  if (cloudTokens.length > 0) {
    // 使用 assignTokenTypes 正确分配 token 类型
    const assigned = assignTokenTypes(cloudTokens, mediaTypes);
    const videoTokens = assigned.filter(a => a.type === 'video');
    const imageTokens = assigned.filter(a => a.type === 'image');

    if (videoTokens.length > 0) {
      return (
        <div className="mt-2">
          <video src={getCloudAssetUrl(record.record_id, videoTokens[0].id, 'video')} controls className="w-full max-h-48 rounded-lg" />
        </div>
      );
    }

    if (imageTokens.length > 0) {
      return (
        <div>
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {imageTokens.map(t => (
              <img
                key={t.id}
                src={getCloudAssetUrl(record.record_id, t.id, 'photo')}
                alt=""
                className="w-20 h-20 rounded-lg object-cover border border-rule flex-shrink-0 cursor-pointer"
                onClick={() => setPreviewImage(getCloudAssetUrl(record.record_id, t.id, 'photo'))}
              />
            ))}
          </div>
          {/* 图片全屏预览 */}
          {previewImage && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
              onClick={() => setPreviewImage(null)}
            >
              <img src={previewImage} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
            </div>
          )}
        </div>
      );
    }
  }

  // 本地 fallback
  if (localVideoUrl) {
    return (
      <div className="mt-2">
        <video src={localVideoUrl} controls className="w-full max-h-48 rounded-lg" />
      </div>
    );
  }
  if (localImages.length > 0) {
    return (
      <div>
        <div className="flex gap-2 mt-2 overflow-x-auto">
          {localImages.map(img => (
            <img
              key={img.id}
              src={img.url}
              alt=""
              className="w-20 h-20 rounded-lg object-cover border border-rule flex-shrink-0 cursor-pointer"
              onClick={() => setPreviewImage(img.url)}
            />
          ))}
        </div>
        {previewImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setPreviewImage(null)}
          >
            <img src={previewImage} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          </div>
        )}
      </div>
    );
  }
  return null;
}

// 编辑记录弹窗
function EditRecordModal({ record, onClose, onSave }: { record: DailyRecord; onClose: () => void; onSave: () => void }) {
  const updateRecord = useAppStore((s) => s.updateRecord);
  const [saving, setSaving] = useState(false);

  // 初始化为记录时间的本地时间，精确到秒
  const dt = new Date(record.记录时间);
  const pad = (n: number) => String(n).padStart(2, '0');
  const initialDateStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const [datePart, setDatePart] = useState(initialDateStr);
  const [hour, setHour] = useState(dt.getHours());
  const [minute, setMinute] = useState(dt.getMinutes());
  const [second, setSecond] = useState(dt.getSeconds());
  const [category, setCategory] = useState(record.分类);

  async function handleSave() {
    setSaving(true);
    try {
      const isoStr = new Date(`${datePart}T${pad(hour)}:${pad(minute)}:${pad(second)}`).toISOString();
      await updateRecord(record.record_id, {
        记录时间: isoStr,
        分类: category,
      });
      onSave();
      onClose();
    } catch (e) {
      console.error('更新记录失败:', e);
    }
    setSaving(false);
  }

  // 生成选项的辅助函数
  const rangeOptions = (max: number) => Array.from({ length: max }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-cream-light rounded-t-3xl p-6 pb-10 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-outfit font-bold text-ink">编辑记录</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
          >
            <X size={18} className="text-muted" />
          </button>
        </div>

        {/* 记录时间 */}
        <div className="mb-4">
          <label className="text-xs text-muted font-medium mb-1.5 block">记录时间</label>
          <input
            type="date"
            value={datePart}
            onChange={(e) => setDatePart(e.target.value)}
            className="w-full bg-white border border-rule rounded-xl px-4 py-3 text-sm text-ink outline-none focus:border-coral/50 focus:ring-4 focus:ring-coral/5 transition-all mb-2"
          />
          <div className="flex items-center gap-2">
            <select
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="flex-1 bg-white border border-rule rounded-xl px-3 py-3 text-sm text-ink outline-none focus:border-coral/50 focus:ring-4 focus:ring-coral/5 transition-all appearance-none text-center cursor-pointer"
            >
              {rangeOptions(24).map(h => (
                <option key={h} value={h}>{pad(h)}时</option>
              ))}
            </select>
            <span className="text-muted font-medium text-sm">:</span>
            <select
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              className="flex-1 bg-white border border-rule rounded-xl px-3 py-3 text-sm text-ink outline-none focus:border-coral/50 focus:ring-4 focus:ring-coral/5 transition-all appearance-none text-center cursor-pointer"
            >
              {rangeOptions(60).map(m => (
                <option key={m} value={m}>{pad(m)}分</option>
              ))}
            </select>
            <span className="text-muted font-medium text-sm">:</span>
            <select
              value={second}
              onChange={(e) => setSecond(Number(e.target.value))}
              className="flex-1 bg-white border border-rule rounded-xl px-3 py-3 text-sm text-ink outline-none focus:border-coral/50 focus:ring-4 focus:ring-coral/5 transition-all appearance-none text-center cursor-pointer"
            >
              {rangeOptions(60).map(s => (
                <option key={s} value={s}>{pad(s)}秒</option>
              ))}
            </select>
          </div>
        </div>

        {/* 分类选择 */}
        <div className="mb-6">
          <label className="text-xs text-muted font-medium mb-1.5 block">分类</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                  category === c.key
                    ? 'bg-coral text-white shadow-soft font-medium'
                    : 'bg-white border border-rule text-muted hover:border-coral/30'
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full text-sm flex items-center justify-center gap-2"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

export default function TimelinePage() {
  const { records, fetchRecords, fetchBabies, currentBaby } = useAppStore();
  const currentBabyId = currentBaby()?.record_id;
  const [mediaFilter, setMediaFilter] = useState('全部');
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [editingRecord, setEditingRecord] = useState<DailyRecord | null>(null);
  const editMode = isEditMode();

  useEffect(() => { fetchBabies(); }, [fetchBabies]);
  useEffect(() => { fetchRecords(); }, [fetchRecords, currentBabyId]);

  const filtered = records.filter(r => {
    const mediaTypes = r.媒体类型 || ['text'];
    let matchMedia = true;
    if (mediaFilter === 'text') {
      matchMedia = mediaTypes.length === 1 && mediaTypes[0] === 'text';
    } else if (mediaFilter === 'voice') {
      matchMedia = mediaTypes.includes('voice');
    } else if (mediaFilter === 'photo') {
      matchMedia = mediaTypes.includes('photo');
    } else if (mediaFilter === 'video') {
      matchMedia = mediaTypes.includes('video');
    }
    const matchCategory = categoryFilter === '全部' || r.分类 === categoryFilter;
    return matchMedia && matchCategory;
  });

  return (
    <div className="page-container">
      <NavHeader title="成长时间线" showBack />

      <div className="mt-4">
        {/* 分类筛选 */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5 mb-2">
          {CATEGORY_FILTERS.map(cf => {
            const isActive = categoryFilter === cf.key;
            return (
              <button
                key={cf.key}
                onClick={() => setCategoryFilter(cf.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? 'bg-ink text-white shadow-soft font-medium'
                    : 'bg-cream-dark text-muted hover:bg-rule/50'
                }`}
              >
                <span className="text-xs">{cf.emoji}</span>
                {cf.label}
              </button>
            );
          })}
        </div>

        {/* 媒体类型筛选 */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5 mb-3">
          {MEDIA_TYPES.map(mt => {
            const isActive = mediaFilter === mt.key;
            return (
              <button
                key={mt.key}
                onClick={() => setMediaFilter(mt.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? 'bg-coral text-white shadow-soft font-medium'
                    : 'bg-cream-dark text-muted hover:bg-rule/50'
                }`}
              >
                {mt.icon && <mt.icon size={14} />}
                {mt.label}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <span className="text-5xl mb-3">📭</span>
            <p className="text-sm">暂无记录</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-rule/60" />
            <div className="space-y-1">
              {filtered.map((record, index) => {
                const mediaTypes = record.媒体类型 || ['text'];
                const primaryMedia = mediaTypes.find(t => t !== 'text') || 'text';
                const style = MEDIA_TYPE_STYLE[primaryMedia] || MEDIA_TYPE_STYLE['text'];
                const category = CATEGORY_MAP[record.分类];
                const emoji = category?.emoji ?? '📝';
                const color = category?.color ?? '#8B7D7A';

                return (
                  <div key={record.record_id} className="relative pl-10 animate-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="absolute left-[17px] top-4 w-2 h-2 rounded-full bg-coral shadow-sm" />
                    <div className="card-shadow p-3.5">
                      {/* 时间 + 标签 + 编辑 */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-muted/80 font-mono">
                          {formatTimelineTime(record.记录时间)}
                        </span>
                        {style && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                            {style.icon}{primaryMedia === 'text' ? '文字' : primaryMedia === 'voice' ? '语音' : primaryMedia === 'video' ? '视频' : '照片'}
                          </span>
                        )}
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '18', color }}>
                          {emoji} {record.分类}
                        </span>
                        {record.是否为里程碑 && <span className="text-xs">⭐</span>}
                        {editMode && (
                          <button
                            onClick={() => setEditingRecord(record)}
                            className="ml-auto text-muted/60 hover:text-coral transition-colors"
                            aria-label="编辑"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>

                      {/* 内容 */}
                      <p className="text-sm text-ink leading-relaxed">
                        {record.记录内容}
                      </p>

                      {/* 语音播放 + 转文字 */}
                      {mediaTypes.includes('voice') ? (
                        <VoicePlayer record={record} />
                      ) : null}

                      {/* 媒体预览（照片/视频） */}
                      {(mediaTypes.includes('photo') || mediaTypes.includes('video')) ? (
                        <MediaPreview record={record} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <FloatingButton />

      {/* 编辑弹窗 */}
      {editingRecord && (
        <EditRecordModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={() => { fetchRecords(); }}
        />
      )}
    </div>
  );
}
