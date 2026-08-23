import { create } from 'zustand';
import { cloudUploadMedia } from '@/lib/cloud';
import { feishuAPI } from '@/api/feishu';

export interface UploadTask {
  id: string;
  recordId: string;
  mediaId: string;
  fileName: string;
  fileSize: number;
  mediaType: 'image' | 'video' | 'voice';
  blob: Blob;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number; // 0-100
  error?: string;
  fileToken?: string;
}

interface UploadGroup {
  recordId: string;
  tasks: UploadTask[];
  createdAt: number;
  summary: string; // 记录内容摘要
}

interface UploadState {
  groups: UploadGroup[];
  panelOpen: boolean;

  addGroup: (group: UploadGroup) => void;
  updateTask: (recordId: string, mediaId: string, updates: Partial<UploadTask>) => void;
  removeGroup: (recordId: string) => void;
  clearAll: () => void;
  setPanelOpen: (open: boolean) => void;
  startUpload: (group: UploadGroup) => void;
  hasActiveUploads: () => boolean;
  activeCount: () => number;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  groups: [],
  panelOpen: false,

  addGroup: (group) => {
    set((state) => ({ groups: [group, ...state.groups] }));
  },

  updateTask: (recordId, mediaId, updates) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.recordId === recordId
          ? { ...g, tasks: g.tasks.map((t) => (t.mediaId === mediaId ? { ...t, ...updates } : t)) }
          : g
      ),
    }));
  },

  removeGroup: (recordId) => {
    set((state) => ({ groups: state.groups.filter((g) => g.recordId !== recordId) }));
  },

  // 清空所有已完成的分组（仅当无活跃上传任务时使用）
  clearAll: () => {
    if (get().hasActiveUploads()) return;
    set({ groups: [], panelOpen: false });
  },

  setPanelOpen: (open) => set({ panelOpen: open }),

  hasActiveUploads: () => {
    return get().groups.some((g) => g.tasks.some((t) => t.status === 'pending' || t.status === 'uploading'));
  },

  activeCount: () => {
    return get().groups.reduce(
      (sum, g) => sum + g.tasks.filter((t) => t.status === 'pending' || t.status === 'uploading').length,
      0
    );
  },

  startUpload: async (group) => {
    const { addGroup, updateTask } = get();
    addGroup(group);

    const fileTokens: string[] = [];
    const uploadErrors: string[] = [];

    // 逐个上传（避免并发过多占带宽）
    for (const task of group.tasks) {
      updateTask(group.recordId, task.mediaId, { status: 'uploading', progress: 10 });

      try {
        // 存到本地 IndexedDB
        await feishuAPI.addMedia(task.mediaId, task.mediaType, task.blob, group.recordId);

        updateTask(group.recordId, task.mediaId, { progress: 40 });

        // 上传到飞书云端
        const extMap: Record<string, string> = { video: 'mp4', image: 'jpg', voice: 'webm' };
        let ext = extMap[task.mediaType] || 'bin';
        if (task.mediaType === 'voice') {
          ext = task.blob.type.includes('mp4') ? 'mp4' : 'webm';
        }

        // 模拟进度：Worker 内部分片上传到飞书的过程前端拿不到实际进度，
        // 用估算耗时让 progress 从 40 缓慢增长到 90，避免大文件卡住视觉不动
        const sizeMB = task.blob.size / 1024 / 1024;
        // 估算总耗时（秒）：4MB/片每片约 1.5s + 2s 基础开销，限制在 [3, 120] 秒
        const estimatedSeconds = Math.max(3, Math.min(120, (sizeMB / 4) * 1.5 + 2));
        const intervalMs = 500;
        const step = (90 - 40) / (estimatedSeconds * 1000 / intervalMs);
        let fakeProgress = 40;
        const fakeTimer = window.setInterval(() => {
          fakeProgress = Math.min(90, fakeProgress + step);
          updateTask(group.recordId, task.mediaId, { progress: Math.round(fakeProgress) });
        }, intervalMs);

        try {
          const fileToken = await cloudUploadMedia(group.recordId, task.blob, `${task.mediaId}.${ext}`);
          clearInterval(fakeTimer);
          if (fileToken) {
            updateTask(group.recordId, task.mediaId, { status: 'success', progress: 100, fileToken });
            fileTokens.push(fileToken);
          } else {
            throw new Error('未获取到 file_token');
          }
        } catch (e) {
          clearInterval(fakeTimer);
          throw e;
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : '上传失败';
        updateTask(group.recordId, task.mediaId, { status: 'error', progress: 0, error: errMsg });
        uploadErrors.push(errMsg);
      }
    }

    // 用云端 file_tokens 替换本地 media IDs，持久化到 IndexedDB
    if (fileTokens.length > 0) {
      try {
        await feishuAPI.updateRecordMedia(group.recordId, fileTokens);
      } catch (e) {
        console.error('[UploadStore] 更新记录媒体附件失败:', e);
      }
    }
  },
}));
