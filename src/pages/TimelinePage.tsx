import { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord } from '@/api/feishu';
import { feishuAPI } from '@/api/feishu';
import { CATEGORIES, CATEGORY_MAP } from '@/utils/constants';
import { getCloudAssetUrl } from '@/lib/cloud';
import { isEditMode } from '@/lib/auth';
import CalendarPicker from '@/components/CalendarPicker';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';
import { FileText, Mic, Video, Camera, Play, Pause, Pencil, X, Calendar } from 'lucide-react';

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

// 视频 + 自动重试
function VideoWithRetry({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const retryCount = useRef(0);
  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      className="w-full max-h-48 rounded-lg"
      onError={() => {
        if (retryCount.current < 2) {
          retryCount.current++;
          setTimeout(() => { if (ref.current) ref.current.load(); }, 1000 * retryCount.current);
        }
      }}
    />
  );
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
  const retryCount = useRef(0);

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
      setPlaying(false);
    } else {
      // 如果音频还没准备好，等待 canplay 事件再播放
      if (audio.readyState < 3) {
        audio.addEventListener('canplay', function onCanPlay() {
          audio.removeEventListener('canplay', onCanPlay);
          audio.play().catch((e) => {
            console.warn('语音播放失败:', e);
            setLoadError(true);
          });
        }, { once: true });
        audio.load(); // 触发加载
      } else {
        audio.play().catch((e) => {
          console.warn('语音播放失败:', e);
          setLoadError(true);
        });
      }
      setPlaying(true);
    }
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
          onError={() => {
            if (retryCount.current < 2) {
              retryCount.current++;
              setTimeout(() => { if (audioRef.current) audioRef.current.load(); }, 1000 * retryCount.current);
            } else {
              setLoadError(true);
              setPlaying(false);
            }
          }}
          preload="auto"
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
          <VideoWithRetry src={getCloudAssetUrl(record.record_id, videoTokens[0].id, 'video')} />
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
        <video src={localVideoUrl} controls playsInline className="w-full max-h-48 rounded-lg" />
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

// 滚轮列组件
function ScrollColumn({ items, value, onChange }: { items: number[]; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const ITEM_H = 36;
  const isManualScroll = useRef(false);

  useEffect(() => {
    if (isManualScroll.current) {
      isManualScroll.current = false;
      return;
    }
    const idx = items.indexOf(value);
    if (idx >= 0 && ref.current) {
      ref.current.scrollTop = idx * ITEM_H;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleScroll = () => {
    if (!ref.current) return;
    const idx = Math.round(ref.current.scrollTop / ITEM_H);
    if (idx >= 0 && idx < items.length && items[idx] !== value) {
      isManualScroll.current = true;
      onChange(items[idx]);
    }
  };

  return (
    <div className="relative w-14">
      {/* 高亮背景条 */}
      <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[36px] bg-coral/10 rounded-lg pointer-events-none" />
      <div
        ref={ref}
        className="h-[180px] overflow-y-scroll snap-y snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
        onScroll={handleScroll}
      >
        {/* 顶部占位 */}
        <div style={{ height: ITEM_H * 2 }} />
        {items.map((item) => (
          <div
            key={item}
            className="h-[36px] snap-center flex items-center justify-center font-outfit font-medium select-none cursor-pointer"
            style={{
              color: item === value ? '#FF7B7B' : '#8B7D7A',
              fontSize: item === value ? 18 : 14,
              transition: 'color 0.15s, font-size 0.15s',
            }}
          >
            {String(item).padStart(2, '0')}
          </div>
        ))}
        {/* 底部占位 */}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  );
}

// 编辑记录弹窗
function EditRecordModal({ record, onClose, onSave }: { record: DailyRecord; onClose: () => void; onSave: () => void }) {
  const updateRecord = useAppStore((s) => s.updateRecord);
  const [saving, setSaving] = useState(false);

  // 初始化为记录时间的本地时间，精确到秒
  const dt = new Date(record.记录时间);
  const [year, setYear] = useState(dt.getFullYear());
  const [month, setMonth] = useState(dt.getMonth()); // 0-indexed
  const [day, setDay] = useState(dt.getDate());
  const [hour, setHour] = useState(dt.getHours());
  const [minute, setMinute] = useState(dt.getMinutes());
  const [second, setSecond] = useState(dt.getSeconds());
  const [category, setCategory] = useState(record.分类);

  // 日历面板的视图月份
  const [viewYear, setViewYear] = useState(dt.getFullYear());
  const [viewMonth, setViewMonth] = useState(dt.getMonth());

  const today = new Date();

  async function handleSave() {
    setSaving(true);
    try {
      const isoStr = new Date(year, month, day, hour, minute, second).toISOString();
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

  function handleNow() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setDay(now.getDate());
    setHour(now.getHours());
    setMinute(now.getMinutes());
    setSecond(now.getSeconds());
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  }

  // 日历相关计算
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  // 生成日期格子
  const calendarCells: { day: number; current: boolean }[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    calendarCells.push({ day: daysInPrevMonth - i, current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push({ day: d, current: true });
  }
  const rows = 6; // 固定6行，避免5/6行切换时高度跳动
  const remaining = rows * 7 - calendarCells.length;
  for (let d = 1; d <= remaining; d++) {
    calendarCells.push({ day: d, current: false });
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }
  function prevYear() { setViewYear(viewYear - 1); }
  function nextYear() { setViewYear(viewYear + 1); }

  function selectDate(d: number) {
    setYear(viewYear);
    setMonth(viewMonth);
    setDay(d);
  }

  const isSelected = (d: number) => viewYear === year && viewMonth === month && d === day;
  const isToday = (d: number) => viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate();

  const rangeOptions = (max: number) => Array.from({ length: max }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-cream-light rounded-t-3xl p-5 pb-8 animate-fade-up font-outfit"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-ink">编辑记录</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
          >
            <X size={18} className="text-muted" />
          </button>
        </div>

        {/* 日历 + 滚轮：移动端垂直，桌面端水平 */}
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          {/* 日历面板 */}
          <div className="flex-1 min-w-0">
            {/* 年月导航 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <button onClick={prevYear} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors text-ink active:scale-95">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M9 12L5 8L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 12L9 8L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors text-ink active:scale-95">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
              <span className="text-sm font-semibold text-ink">{viewYear}年{viewMonth + 1}月</span>
              <div className="flex items-center">
                <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors text-ink active:scale-95">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button onClick={nextYear} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors text-ink active:scale-95">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4L7 8L3 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 4L11 8L7 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
            {/* 星期头 */}
            <div className="grid grid-cols-7 mb-1">
              {['日', '一', '二', '三', '四', '五', '六'].map(w => (
                <div key={w} className="text-[11px] text-muted text-center font-medium py-1">{w}</div>
              ))}
            </div>
            {/* 日期网格 */}
            <div className="grid grid-cols-7">
              {calendarCells.map((cell, i) => {
                const selected = cell.current && isSelected(cell.day);
                const todayMark = cell.current && isToday(cell.day);
                return (
                  <button
                    key={i}
                    disabled={!cell.current}
                    onClick={() => cell.current && selectDate(cell.day)}
                    className={`
                      relative w-8 h-8 mx-auto flex items-center justify-center text-xs rounded-full transition-all
                      ${!cell.current ? 'text-muted/30 cursor-default' : 'text-ink hover:bg-coral/10 active:scale-95'}
                      ${selected ? 'bg-coral text-white hover:bg-coral-dark font-semibold' : ''}
                    `}
                  >
                    {cell.day}
                    {todayMark && !selected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-coral" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 分隔线（桌面端显示） */}
          <div className="hidden md:block w-px bg-rule/60 self-stretch" />

          {/* 时分秒滚轮 */}
          <div className="flex items-center justify-center gap-1">
            <div className="text-center">
              <ScrollColumn items={rangeOptions(24)} value={hour} onChange={setHour} />
              <div className="text-[10px] text-muted mt-1">时</div>
            </div>
            <span className="text-muted/60 font-bold text-base self-center mb-5">:</span>
            <div className="text-center">
              <ScrollColumn items={rangeOptions(60)} value={minute} onChange={setMinute} />
              <div className="text-[10px] text-muted mt-1">分</div>
            </div>
            <span className="text-muted/60 font-bold text-base self-center mb-5">:</span>
            <div className="text-center">
              <ScrollColumn items={rangeOptions(60)} value={second} onChange={setSecond} />
              <div className="text-[10px] text-muted mt-1">秒</div>
            </div>
          </div>
        </div>

        {/* 分类选择 */}
        <div className="mb-5">
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

        {/* 底部按钮 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleNow}
            className="px-4 py-2.5 text-xs font-medium text-coral bg-coral/10 rounded-btn hover:bg-coral/20 active:scale-95 transition-all"
          >
            现在
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="btn-secondary text-sm px-5"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm px-5"
          >
            {saving ? '保存中...' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimelinePage() {
  const { records, fetchRecords, fetchBabies, currentBaby } = useAppStore();
  const currentBabyId = currentBaby()?.record_id;
  const [mediaFilter, setMediaFilter] = useState('全部');
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DailyRecord | null>(null);
  const editMode = isEditMode();

  // 懒加载：初始显示 10 条，每次加载 10 条
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { fetchBabies(); }, [fetchBabies]);
  useEffect(() => { fetchRecords(); }, [fetchRecords, currentBabyId]);

  // 切换筛选时重置显示数量
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [mediaFilter, categoryFilter, dateFilter]);

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
    let matchDate = true;
    if (dateFilter) {
      const recordDate = new Date(r.记录时间);
      const pad = (n: number) => String(n).padStart(2, '0');
      const recordDateStr = `${recordDate.getFullYear()}-${pad(recordDate.getMonth() + 1)}-${pad(recordDate.getDate())}`;
      matchDate = recordDateStr === dateFilter;
    }
    return matchMedia && matchCategory && matchDate;
  });

  const visibleRecords = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // IntersectionObserver 监听底部哨兵元素
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries;
    if (entry.isIntersecting && hasMore) {
      setVisibleCount(prev => prev + PAGE_SIZE);
    }
  }, [hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(handleObserver, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleObserver]);

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

        {/* 媒体类型筛选 + 日期选择器 */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5 mb-3 items-center">
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
          {/* 日期筛选按钮 */}
          <button
            onClick={() => setShowDatePicker(true)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0 ${
              dateFilter
                ? 'bg-coral text-white shadow-soft font-medium'
                : 'bg-cream-dark text-muted hover:bg-rule/50'
            }`}
          >
            <Calendar size={14} />
            {dateFilter ? `${dateFilter.slice(5)}` : '日期'}
            {dateFilter && (
              <span
                onClick={(e) => { e.stopPropagation(); setDateFilter(null); }}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/30 active:scale-95"
              >
                <X size={10} />
              </span>
            )}
          </button>
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
              {visibleRecords.map((record, index) => {
                const mediaTypes = record.媒体类型 || ['text'];
                const primaryMedia = mediaTypes.find(t => t !== 'text') || 'text';
                const style = MEDIA_TYPE_STYLE[primaryMedia] || MEDIA_TYPE_STYLE['text'];
                const category = CATEGORY_MAP[record.分类];
                const emoji = category?.emoji ?? '📝';
                const color = category?.color ?? '#8B7D7A';

                return (
                  <div key={record.record_id} className="relative pl-10 animate-fade-up" style={{ animationDelay: `${Math.min(index, 9) * 50}ms` }}>
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
              {/* 哨兵元素：滚动到此处时加载更多 */}
              {hasMore && (
                <div ref={sentinelRef} className="py-4 text-center text-xs text-muted/50">
                  加载中...
                </div>
              )}
              {!hasMore && filtered.length > 0 && (
                <div className="py-4 text-center text-xs text-muted/40">
                  共 {filtered.length} 条记录
                </div>
              )}
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

      {/* 日期选择弹窗 */}
      {showDatePicker && (
        <CalendarPicker
          initialDate={dateFilter || new Date().toISOString().slice(0, 10)}
          onConfirm={(date) => { setDateFilter(date); setShowDatePicker(false); }}
          onClose={() => setShowDatePicker(false)}
          title="选择日期"
        />
      )}
    </div>
  );
}
