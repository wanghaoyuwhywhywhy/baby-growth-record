import { useState, useEffect, useRef } from 'react';
import { type DailyRecord } from '@/api/feishu';
import { formatDate } from '@/utils/date';
import { CATEGORY_MAP } from '@/utils/constants';
import { feishuAPI } from '@/api/feishu';
import { getCloudAssetUrl } from '@/lib/cloud';
import { Play, Pause, Mic } from 'lucide-react';

interface MediaInfo {
  id: string;
  type: 'image' | 'video' | 'voice';
  url: string;
}

// 判断是否为云端 file_token
function isCloudToken(token: string): boolean {
  return !token.startsWith('media_') && !token.startsWith('img_') && !token.startsWith('vid_') && !token.startsWith('voice_');
}

// 根据记录的媒体类型，将云端 tokens 分配到对应的媒体类型
function assignTokenTypes(tokens: string[], mediaTypes: string[]): MediaInfo[] {
  const result: MediaInfo[] = [];
  let idx = 0;

  // 按优先级分配：先 voice，再 video，最后 photo
  if (mediaTypes.includes('voice') && idx < tokens.length) {
    result.push({ id: tokens[idx], type: 'voice', url: '' });
    idx++;
  }
  if (mediaTypes.includes('video') && idx < tokens.length) {
    result.push({ id: tokens[idx], type: 'video', url: '' });
    idx++;
  }
  if (mediaTypes.includes('photo')) {
    while (idx < tokens.length) {
      result.push({ id: tokens[idx], type: 'image', url: '' });
      idx++;
    }
  }
  // 剩余未分配的 token 默认当图片
  while (idx < tokens.length) {
    result.push({ id: tokens[idx], type: 'image', url: '' });
    idx++;
  }
  return result;
}

interface RecordItemProps {
  record: DailyRecord;
  compact?: boolean;
}

export default function RecordItem({ record, compact = false }: RecordItemProps) {
  const category = CATEGORY_MAP[record.分类];
  const emoji = category?.emoji ?? '📝';
  const color = category?.color ?? '#8B7D7A';
  const [mediaList, setMediaList] = useState<MediaInfo[]>([]);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const attachments = record.媒体附件 || [];

    let revoked = false;
    let urls: string[] = [];
    const cleanup = () => {
      revoked = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };

    async function loadAll() {
      const cloudTokens = attachments.filter(isCloudToken);
      const cloudMedia: MediaInfo[] = [];

      if (cloudTokens.length > 0) {
        const mediaTypes = record.媒体类型 || ['text'];
        const assigned = assignTokenTypes(cloudTokens, mediaTypes);
        for (const m of assigned) {
          cloudMedia.push({
            ...m,
            url: getCloudAssetUrl(record.record_id, m.id, m.type === 'image' ? 'photo' : m.type),
          });
        }
      }

      // 始终尝试本地兜底：上传失败时云端附件为空，但本地 IndexedDB 仍有 blob
      // （重要：即使 attachments 为空也要尝试，避免"刷新后视频消失"）
      const localItems = await feishuAPI.getMediaByRecord(record.record_id);
      if (revoked) {
        cleanup();
        return;
      }
      // 云端媒体全部展示（支持多张照片）；本地仅补充云端缺失的媒体类型
      const cloudTypes = new Set(cloudMedia.map(m => m.type));
      const merged: MediaInfo[] = [...cloudMedia];
      for (const item of localItems) {
        if (!cloudTypes.has(item.type)) {
          const url = URL.createObjectURL(item.blob);
          urls.push(url);
          merged.push({ id: item.id, type: item.type, url });
        }
      }

      setMediaList(merged);
    }

    // 没有任何附件也没媒体类型，纯文本记录 —— 直接清空
    const hasMediaType = (record.媒体类型 || []).some(t => t === 'voice' || t === 'video' || t === 'photo');
    if (attachments.length === 0 && !hasMediaType) {
      setMediaList([]);
      return;
    }

    loadAll();
    return cleanup;
  }, [record.record_id, record.媒体附件, record.媒体类型]);

  const voiceItems = mediaList.filter(m => m.type === 'voice');
  const imageItems = mediaList.filter(m => m.type === 'image');
  const videoItems = mediaList.filter(m => m.type === 'video');

  // 全屏预览：键盘左右切换 / Esc 关闭
  useEffect(() => {
    if (previewIndex < 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreviewIndex(-1);
      else if (e.key === 'ArrowLeft' && previewIndex > 0) setPreviewIndex(previewIndex - 1);
      else if (e.key === 'ArrowRight' && previewIndex < imageItems.length - 1) setPreviewIndex(previewIndex + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewIndex, imageItems.length]);

  return (
    <div className="flex items-start gap-3 py-3 group">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 mt-0.5"
        style={{ backgroundColor: color + '20' }}
      >
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        {!compact && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '18', color }}>
              {record.分类}
            </span>
            <span className="text-xs text-muted/60">{formatDate(record.记录时间)}</span>
            {record.是否为里程碑 && (
              <span className="text-xs">⭐</span>
            )}
          </div>
        )}
        <p className={`text-ink leading-relaxed ${compact ? 'text-sm' : 'text-[15px]'}`}>
          {record.记录内容}
        </p>

        {/* 语音播放 + 转文字 */}
        {voiceItems.length > 0 && (
          <VoicePlayerCompact url={voiceItems[0].url} transcript={record.语音转文字} />
        )}

        {/* 图片 */}
        {imageItems.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {imageItems.map((media, index) => (
              <img
                key={media.id}
                src={media.url}
                alt=""
                className={`rounded-lg object-cover border border-rule cursor-pointer ${compact ? 'w-16 h-16' : 'w-20 h-20'}`}
                onClick={() => setPreviewIndex(index)}
              />
            ))}
          </div>
        )}

        {/* 视频 */}
        {videoItems.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {videoItems.map((media) => (
              <VideoWithRetry key={media.id} src={media.url} />
            ))}
          </div>
        )}

        {compact && (
          <span className="text-xs text-muted/60 mt-0.5 block">{formatDate(record.记录时间)}</span>
        )}
      </div>

      {/* 图片全屏预览（支持左右滑动切换） */}
      {previewIndex >= 0 && previewIndex < imageItems.length && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewIndex(-1)}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - (touchStartX.current ?? 0);
            if (dx > 40 && previewIndex > 0) setPreviewIndex(previewIndex - 1);
            else if (dx < -40 && previewIndex < imageItems.length - 1) setPreviewIndex(previewIndex + 1);
            touchStartX.current = null;
          }}
        >
          {previewIndex > 0 && (
            <button
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/20 text-white text-xl flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setPreviewIndex(previewIndex - 1); }}
            >‹</button>
          )}
          <img
            src={imageItems[previewIndex].url}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {previewIndex < imageItems.length - 1 && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/20 text-white text-xl flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setPreviewIndex(previewIndex + 1); }}
            >›</button>
          )}
          {imageItems.length > 1 && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-xs">
              {previewIndex + 1} / {imageItems.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
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

// 语音播放器（紧凑版，用于首页和时间线）
function VoicePlayerCompact({ url, transcript }: { url: string; transcript?: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryCount = useRef(0);

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
      if (audio.readyState < 3) {
        audio.addEventListener('canplay', function onCanPlay() {
          audio.removeEventListener('canplay', onCanPlay);
          audio.play().catch((e) => {
            console.warn('语音播放失败:', e);
            setLoadError(true);
          });
        }, { once: true });
        audio.load();
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
          src={url}
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
      {transcript && (
        <div className="mt-1.5 p-2 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-center gap-1 mb-0.5">
            <Mic size={10} className="text-amber-500" />
            <span className="text-[10px] text-amber-600 font-medium">语音转文字</span>
          </div>
          <p className="text-xs text-ink leading-relaxed">{transcript}</p>
        </div>
      )}
    </div>
  );
}
