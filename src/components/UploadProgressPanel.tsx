import { useUploadStore } from '@/store/useUploadStore';
import { Upload, X, CheckCircle2, AlertCircle, Loader2, ChevronUp, Image, Video, Mic } from 'lucide-react';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function MediaIcon({ type }: { type: 'image' | 'video' | 'voice' }) {
  if (type === 'image') return <Image size={14} className="text-coral" />;
  if (type === 'video') return <Video size={14} className="text-coral" />;
  return <Mic size={14} className="text-coral" />;
}

export default function UploadProgressPanel() {
  const groups = useUploadStore((s) => s.groups);
  const panelOpen = useUploadStore((s) => s.panelOpen);
  const setPanelOpen = useUploadStore((s) => s.setPanelOpen);
  const removeGroup = useUploadStore((s) => s.removeGroup);
  const clearAll = useUploadStore((s) => s.clearAll);

  const hasActiveUploads = groups.some((g) =>
    g.tasks.some((t) => t.status === 'pending' || t.status === 'uploading')
  );

  // 没有任何上传任务时不显示
  if (groups.length === 0) return null;

  // 计算总数
  const totalTasks = groups.reduce((sum, g) => sum + g.tasks.length, 0);
  const doneTasks = groups.reduce(
    (sum, g) => sum + g.tasks.filter((t) => t.status === 'success').length,
    0
  );
  const errorTasks = groups.reduce(
    (sum, g) => sum + g.tasks.filter((t) => t.status === 'error').length,
    0
  );

  // 是否全部完成（无活跃任务）—— 用于显示关闭按钮
  const allDone = !hasActiveUploads;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-lg mx-auto">
      {/* 折叠状态：小型浮动条 */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl shadow-float backdrop-blur-md
            ${hasActiveUploads
              ? 'bg-coral/90 text-white'
              : errorTasks > 0
                ? 'bg-amber-500/90 text-white'
                : 'bg-white/90 text-ink border border-rule/50'
            }`}
        >
          {hasActiveUploads ? (
            <Loader2 size={18} className="animate-spin flex-shrink-0" />
          ) : errorTasks > 0 ? (
            <AlertCircle size={18} className="flex-shrink-0" />
          ) : (
            <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium flex-1 text-left">
            {hasActiveUploads
              ? `上传中 ${doneTasks}/${totalTasks}`
              : errorTasks > 0
                ? `${doneTasks}个完成，${errorTasks}个失败`
                : `全部上传完成 (${totalTasks})`}
          </span>
          {allDone ? (
            /* 全部完成时：显示关闭按钮，点击清空列表 */
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); clearAll(); }}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
              aria-label="关闭"
            >
              <X size={16} className="opacity-70" />
            </span>
          ) : (
            <ChevronUp size={16} className="flex-shrink-0 opacity-60" />
          )}
        </button>
      )}

      {/* 展开状态：传输列表面板 */}
      {panelOpen && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-float border border-rule/30 overflow-hidden">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-rule/30">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-coral" />
              <span className="text-sm font-bold text-ink">传输列表</span>
              {hasActiveUploads && (
                <span className="text-xs text-coral bg-coral/10 px-2 py-0.5 rounded-full">
                  上传中
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {allDone && (
                <button
                  onClick={() => clearAll()}
                  className="text-xs text-muted/60 hover:text-coral transition-colors px-2 py-1"
                >
                  全部清空
                </button>
              )}
              <button
                onClick={() => setPanelOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
              >
                <X size={16} className="text-muted" />
              </button>
            </div>
          </div>

          {/* 任务列表 */}
          <div className="max-h-60 overflow-y-auto">
            {groups.map((group) => {
              const groupDone = group.tasks.every((t) => t.status === 'success' || t.status === 'error');
              const groupProgress = group.tasks.reduce((sum, t) => sum + t.progress, 0) / group.tasks.length;

              return (
                <div key={group.recordId} className="border-b border-rule/20 last:border-b-0">
                  {/* 分组头 */}
                  <div className="flex items-center justify-between px-4 py-2 bg-cream-light/50">
                    <span className="text-xs text-muted truncate flex-1">
                      {group.summary}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {groupDone && (
                        <button
                          onClick={() => removeGroup(group.recordId)}
                          className="text-xs text-muted/60 hover:text-coral transition-colors"
                        >
                          清除
                        </button>
                      )}
                      <span className="text-xs text-muted/60">
                        {group.tasks.filter((t) => t.status === 'success').length}/{group.tasks.length}
                      </span>
                    </div>
                  </div>

                  {/* 进度条 */}
                  {!groupDone && (
                    <div className="h-1 bg-rule/20">
                      <div
                        className="h-full bg-coral transition-all duration-300 ease-out"
                        style={{ width: `${groupProgress}%` }}
                      />
                    </div>
                  )}

                  {/* 单个任务 */}
                  {group.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-2">
                      <MediaIcon type={task.mediaType} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-ink truncate">
                            {task.mediaType === 'image' ? '图片' : task.mediaType === 'video' ? '视频' : '语音'}
                          </span>
                          <span className="text-xs text-muted/50">{formatSize(task.fileSize)}</span>
                        </div>
                        {task.status === 'error' && task.error && (
                          <p className="text-xs text-red-400 truncate">{task.error}</p>
                        )}
                      </div>
                      {task.status === 'uploading' && (
                        <Loader2 size={14} className="animate-spin text-coral flex-shrink-0" />
                      )}
                      {task.status === 'success' && (
                        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                      )}
                      {task.status === 'error' && (
                        <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                      )}
                      {task.status === 'pending' && (
                        <span className="text-xs text-muted/40 flex-shrink-0">等待</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
