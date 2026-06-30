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
    if (!record.媒体附件 || record.媒体附件.length === 0) {
      setMediaList([]);
      return;
    }

    // 判断云端 file_tokens（非本地ID格式）
    const cloudTokens = record.媒体附件.filter(
      t => !t.startsWith('media_') && !t.startsWith('img_') && !t.startsWith('vid_') && !t.startsWith('voice_')
    );

    if (cloudTokens.length > 0) {
      // 使用云端 URL，根据媒体类型分配每个 token 的类型
      const mediaTypes = record.媒体类型 || ['text'];
      const media = cloudTokens.map((token, index) => {
        // 根据记录的媒体类型推断每个 token 的类型
        let type: 'image' | 'video' | 'voice' = 'image';
        if (mediaTypes.includes('voice') && index === 0 && !mediaTypes.includes('photo') && !mediaTypes.includes('video')) {
          type = 'voice';
        } else if (mediaTypes.includes('video') && index === 0 && !mediaTypes.includes('photo')) {
          type = 'video';
        }
        // 如果有voice类型，第一个token是voice
        if (mediaTypes.includes('voice')) {
          const voiceCount = cloudTokens.length - (mediaTypes.includes('photo') ? cloudTokens.length - 1 : 0);
          if (index < 1) type = 'voice'; // 第一个是语音
          else type = 'image'; // 其余是图片
        }
        if (mediaTypes.includes('video') && !mediaTypes.includes('voice') && index === 0) {
          type = 'video';
        }
        if (mediaTypes.includes('photo') && !mediaTypes.includes('voice') && !mediaTypes.includes('video')) {
          type = 'image';
        }
        // 更精确：有voice类型时第一个是voice，其余根据类型判断
        if (mediaTypes.includes('voice') && index === 0) {
          type = 'voice';
        } else if (mediaTypes.includes('video') && !mediaTypes.includes('photo') && index === 0 && !mediaTypes.includes('voice')) {
          type = 'video';
        } else {
          type = 'image';
        }
        return { id: token, type, url: getCloudAssetUrl(record.record_id, token) };
      });
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggle() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else {
      audioRef.current.play().catch(() => {});
    }
    setPlaying(!playing);
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <audio
          ref={audioRef}
          src={url}
          onEnded={() => setPlaying(false)}
          onError={() => console.warn('语音播放失败:', url)}
          className="hidden"
        />
        <div className="flex-1 h-1.5 bg-amber-100 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full" style={{ width: playing ? '100%' : '0%', transition: 'width 0.3s' }} />
        </div>
      </div>
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
