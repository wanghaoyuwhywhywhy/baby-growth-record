import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, ImagePlus, Video, X, Mic, Square } from 'lucide-react';

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'voice';
  blob: Blob;
  url: string;
}

interface MediaInputProps {
  onTranscriptChange: (text: string) => void;
  onMediaAdd: (media: MediaItem) => void;
  onMediaRemove: (id: string) => void;
  mediaItems: MediaItem[];
  initialText?: string;
}

export default function MediaInput({
  onTranscriptChange,
  onMediaAdd,
  onMediaRemove,
  mediaItems,
  initialText = '',
}: MediaInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);

  // 录音时长计时
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordingDuration(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // 格式化时长 mm:ss
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const url = URL.createObjectURL(blob);
        onMediaAdd({ id, type: 'voice', blob, url });
        // 停止所有音频轨道
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('录音失败:', err);
      alert('无法访问麦克风，请检查权限设置');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const url = URL.createObjectURL(file);
      onMediaAdd({ id, type, blob: file, url });
    });
    e.target.value = '';
  }

  return (
    <div>
      {/* 已选媒体预览 */}
      {mediaItems.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
          {mediaItems.map((item) => (
            <div key={item.id} className="relative flex-shrink-0 group">
              {item.type === 'image' ? (
                <img src={item.url} alt="" className="w-20 h-20 rounded-xl object-cover border border-rule" />
              ) : item.type === 'voice' ? (
                <div className="w-20 h-20 rounded-xl bg-coral/15 flex items-center justify-center border border-coral/30">
                  <Mic size={24} className="text-coral" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-ink/80 flex items-center justify-center border border-rule">
                  <Video size={24} className="text-white" />
                </div>
              )}
              <button
                onClick={() => onMediaRemove(item.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-coral text-white flex items-center justify-center shadow-float"
              >
                <X size={12} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 录音状态 */}
      {isRecording && (
        <div className="card-shadow p-3 mb-3 flex items-center gap-3 animate-fade-up">
          <div className="flex items-center gap-2 flex-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coral opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-coral"></span>
            </span>
            <span className="text-sm text-muted">
              录音中 {formatDuration(recordingDuration)}
            </span>
          </div>
          <button
            onClick={toggleRecording}
            className="w-8 h-8 rounded-full bg-coral text-white flex items-center justify-center"
          >
            <Square size={14} fill="white" />
          </button>
        </div>
      )}

      {/* 输入工具栏 */}
      <div className="flex items-center gap-2">
        {/* 语音录音按钮 */}
        <button
          onClick={toggleRecording}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-coral text-white shadow-float animate-pulse'
              : 'bg-cream-dark text-coral hover:bg-coral/10'
          }`}
          aria-label="录音"
        >
          <Mic size={20} />
        </button>

        {/* 拍照按钮 */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="w-11 h-11 rounded-full bg-cream-dark text-ink flex items-center justify-center hover:bg-rule/50 transition-all"
          aria-label="拍照"
        >
          <Camera size={20} />
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => handleFileSelect(e, 'image')}
          className="hidden"
        />

        {/* 相册按钮 */}
        <button
          onClick={() => galleryInputRef.current?.click()}
          className="w-11 h-11 rounded-full bg-cream-dark text-ink flex items-center justify-center hover:bg-rule/50 transition-all"
          aria-label="从相册选择"
        >
          <ImagePlus size={20} />
        </button>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFileSelect(e, 'image')}
          className="hidden"
        />

        {/* 视频按钮 */}
        <button
          onClick={() => videoInputRef.current?.click()}
          className="w-11 h-11 rounded-full bg-cream-dark text-ink flex items-center justify-center hover:bg-rule/50 transition-all"
          aria-label="录制视频"
        >
          <Video size={20} />
        </button>
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={(e) => handleFileSelect(e, 'video')}
          className="hidden"
        />
      </div>
    </div>
  );
}
