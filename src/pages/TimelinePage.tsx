import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { type DailyRecord } from '@/api/feishu';
import { feishuAPI } from '@/api/feishu';
import { CATEGORIES, CATEGORY_MAP } from '@/utils/constants';
import { getCloudAssetUrl } from '@/lib/cloud';
import FloatingButton from '@/components/FloatingButton';
import NavHeader from '@/components/NavHeader';
import { FileText, Mic, Video, Camera, Play, Pause } from 'lucide-react';

const MEDIA_TYPES = [
  { key: '全部', label: '全部', icon: null },
  { key: 'text', label: '文字', icon: FileText },
  { key: 'voice', label: '语音', icon: Mic },
  { key: 'video', label: '视频', icon: Video },
  { key: 'photo', label: '照片', icon: Camera },
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

function VoicePlayer({ record }: { record: DailyRecord }) {
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 云端附件：媒体附件中非本地ID的都是云端file_token
  // 本地ID格式: media_xxx, img_xxx, vid_xxx, voice_xxx
  const mediaAttachments = record.媒体附件 || [];
  const cloudTokens = mediaAttachments.filter(t =>
    !t.startsWith('media_') && !t.startsWith('img_') && !t.startsWith('vid_') && !t.startsWith('voice_')
  );

  useEffect(() => {
    // 优先使用云端 URL
    if (cloudTokens.length > 0) {
      setAudioUrl(getCloudAssetUrl(record.record_id, cloudTokens[0]));
      return;
    }
    // 本地 fallback
    let url = '';
    async function load() {
      const items = await feishuAPI.getMediaByRecord(record.record_id);
      if (items.length > 0) {
        url = URL.createObjectURL(items[0].blob);
        setAudioUrl(url);
      }
    }
    load();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [record.record_id, cloudTokens.length]);

  function toggle() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  }

  if (!audioUrl) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} className="hidden" />
      <div className="flex-1 h-1.5 bg-amber-100 rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full" style={{ width: playing ? '100%' : '0%', transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function MediaPreview({ record }: { record: DailyRecord }) {
  const [localImages, setLocalImages] = useState<{ id: string; url: string }[]>([]);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);

  // 云端附件：媒体附件中非本地ID的都是云端file_token
  // 本地ID格式: media_xxx, img_xxx, vid_xxx, voice_xxx
  const mediaAttachments = record.媒体附件 || [];
  const cloudTokens = mediaAttachments.filter(t =>
    !t.startsWith('media_') && !t.startsWith('img_') && !t.startsWith('vid_') && !t.startsWith('voice_')
  );

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

  // 优先使用云端 URL
  if (cloudTokens.length > 0) {
    const hasVideo = (record.媒体类型 || ['text']).includes('video');
    if (hasVideo) {
      return (
        <div className="mt-2">
          <video src={getCloudAssetUrl(record.record_id, cloudTokens[0])} controls className="w-full max-h-48 rounded-lg" />
        </div>
      );
    }
    return (
      <div className="flex gap-2 mt-2 overflow-x-auto">
        {cloudTokens.map(token => (
          <img key={token} src={getCloudAssetUrl(record.record_id, token)} alt="" className="w-20 h-20 rounded-lg object-cover border border-rule flex-shrink-0" />
        ))}
      </div>
    );
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
      <div className="flex gap-2 mt-2 overflow-x-auto">
        {localImages.map(img => (
          <img key={img.id} src={img.url} alt="" className="w-20 h-20 rounded-lg object-cover border border-rule flex-shrink-0" />
        ))}
      </div>
    );
  }
  return null;
}

export default function TimelinePage() {
  const { records, fetchRecords, fetchBabies, currentBaby } = useAppStore();
  const currentBabyId = currentBaby()?.record_id;
  const [mediaFilter, setMediaFilter] = useState('全部');
  const [categoryFilter, setCategoryFilter] = useState('全部');

  useEffect(() => { fetchBabies(); }, [fetchBabies]);
  useEffect(() => { fetchRecords(); }, [fetchRecords, currentBabyId]);

  const filtered = records.filter(r => {
    // 多选匹配：媒体类型数组中任一匹配即显示
    const mediaTypes = r.媒体类型 || ['text'];
    const matchMedia = mediaFilter === '全部' || mediaTypes.includes(mediaFilter as any);
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
                // 显示第一个非text的媒体类型图标，或者text
                const primaryMedia = mediaTypes.find(t => t !== 'text') || 'text';
                const style = MEDIA_TYPE_STYLE[primaryMedia] || MEDIA_TYPE_STYLE['text'];
                const category = CATEGORY_MAP[record.分类];
                const emoji = category?.emoji ?? '📝';
                const color = category?.color ?? '#8B7D7A';

                return (
                  <div key={record.record_id} className="relative pl-10 animate-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="absolute left-[17px] top-4 w-2 h-2 rounded-full bg-coral shadow-sm" />
                    <div className="card-shadow p-3.5">
                      {/* 时间 + 标签 */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
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
                      </div>

                      {/* 内容 */}
                      <p className="text-sm text-ink leading-relaxed">
                        {record.记录内容}
                      </p>

                      {/* 语音播放 */}
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
    </div>
  );
}
