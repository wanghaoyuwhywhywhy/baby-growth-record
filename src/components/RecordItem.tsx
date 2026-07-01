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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    const attachments = record.媒体附件;
    if (!attachments || attachments.length === 0) {
      setMediaList([]);
      return;
    }

    const cloudTokens = attachments.filter(isCloudToken);

    if (cloudTokens.length > 0) {
      const mediaTypes = record.媒体类型 || ['text'];
      const assigned = assignTokenTypes(cloudTokens, mediaTypes);
      // 生成带 type 参数的 URL
      const media = assigned.map(m => ({
        ...m,
        url: getCloudAssetUrl(record.record_id, m.id, m.type === 'image' ? 'photo' : m.type),
      }));
      setMediaList(media);
      return;
    }

    // 本地 fallback
    let revoked = false;
    let urls: string[] = [];
    async function loadMedia() {
      const items = await feishuAPI.getMediaByRecord(record.record_id);
      if (revoked) {
        urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      const media = items.map((item) => {
        const url = URL.createObjectURL(item.blob);
        urls.push(url);
        return { id: item.id, type: item.type, url };
      });
      setMediaList(media);
    }
    loadMedia();
    return () => {
      revoked = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [record.record_id, record.媒体附件, record.媒体类型]);

  const voiceItems = mediaList.filter(m => m.type === 'voice');
  const imageItems = mediaList.filter(m => m.type === 'image');
  const videoItems = mediaList.filter(m => m.type === 'video');

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
            {imageItems.map((media) => (
              <img
                key={media.id}
                src={media.url}
                alt=""
                className={`rounded-lg object-cover border border-rule cursor-pointer ${compact ? 'w-16 h-16' : 'w-20 h-20'}`}
                onClick={() => setPreviewImage(media.url)}
              />
            ))}
          </div>
        )}

        {/* 视频 */}
        {videoItems.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {videoItems.map((media) => (
              <video
                key={media.id}
                src={media.url}
                controls
                className="w-full max-h-48 rounded-lg"
              />
            ))}
          </div>
        )}

        {compact && (
          <span className="text-xs text-muted/60 mt-0.5 block">{formatDate(record.记录时间)}</span>
        )}
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

// 语音播放器（紧凑版，用于首页和时间线）
function VoicePlayerCompact({ url, transcript }: { url: string; transcript?: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
          onError={() => { setLoadError(true); setPlaying(false); }}
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
