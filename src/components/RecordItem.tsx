import { useState, useEffect } from 'react';
import { type DailyRecord } from '@/api/feishu';
import { formatDate } from '@/utils/date';
import { CATEGORY_MAP } from '@/utils/constants';
import { feishuAPI } from '@/api/feishu';
import { getCloudAssetUrl } from '@/lib/cloud';

interface MediaInfo {
  id: string;
  type: 'image' | 'video';
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

  useEffect(() => {
    if (!record.媒体附件 || record.媒体附件.length === 0) {
      setMediaList([]);
      return;
    }

    // 判断云端 file_tokens（非本地ID格式）
    // 本地ID格式: media_xxx, img_xxx, vid_xxx, voice_xxx
    const cloudTokens = record.媒体附件.filter(
      t => !t.startsWith('media_') && !t.startsWith('img_') && !t.startsWith('vid_') && !t.startsWith('voice_')
    );

    if (cloudTokens.length > 0) {
      // 使用云端 URL
      const media = cloudTokens.map(token => ({
        id: token,
        type: (record.媒体类型 === 'video' ? 'video' : 'image') as 'image' | 'video',
        url: getCloudAssetUrl(record.record_id, token),
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
        {/* 媒体附件 */}
        {mediaList.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {mediaList.map((media) => (
              <div key={media.id} className="flex-shrink-0">
                {media.type === 'image' ? (
                  <img
                    src={media.url}
                    alt=""
                    className={`rounded-lg object-cover border border-rule ${compact ? 'w-16 h-16' : 'w-20 h-20'}`}
                  />
                ) : (
                  <div className={`rounded-lg bg-ink/80 flex items-center justify-center border border-rule ${compact ? 'w-16 h-16' : 'w-20 h-20'}`}>
                    <span className="text-white text-lg">▶</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {compact && (
          <span className="text-xs text-muted/60 mt-0.5 block">{formatDate(record.记录时间)}</span>
        )}
      </div>
    </div>
  );
}
