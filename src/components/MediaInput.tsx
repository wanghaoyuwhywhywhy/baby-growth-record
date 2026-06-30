import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, ImagePlus, Video, X, Mic, Square } from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'voice';
  blob: Blob;
  url: string;
}

interface MediaInputProps {
  onVoiceTranscript: (text: string) => void;
  onMediaAdd: (media: MediaItem) => void;
  onMediaRemove: (id: string) => void;
  mediaItems: MediaItem[];
}

export default function MediaInput({
  onVoiceTranscript,
  onMediaAdd,
  onMediaRemove,
  mediaItems,
}: MediaInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const transcriptRef = useRef<string>(''); // 保存当前录音的转写文字

  // Web Speech API 用于录音同时转文字
  const {
    isListening: isSpeechListening,
    transcript,
    interimTranscript,
    error: speechError,
    isSupported: speechSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

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

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  async function startRecording() {
    try {
      transcriptRef.current = '';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const url = URL.createObjectURL(blob);
        onMediaAdd({ id, type: 'voice', blob, url });
        stream.getTracks().forEach(t => t.stop());
        // 录音结束时，把最终转写文字传给父组件（独立字段，不填入文本框）
        if (transcriptRef.current) {
          onVoiceTranscript(transcriptRef.current);
        }
        // 确保关闭语音识别
        stopListening();
      };

      mediaRecorder.start();
      setIsRecording(true);

      // 同时启动语音识别转文字
      if (speechSupported) {
        resetTranscript();
        startListening();
      }
    } catch (err) {
      console.error('录音失败:', err);
      alert('无法访问麦克风，请检查权限设置');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      // 保存最终转写结果
      transcriptRef.current = transcript || interimTranscript || '';
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  function toggleRecording() {
    if (isRecording) stopRecording();
    else startRecording();
  }

  // 通用文件选择（自动识别图片/视频）
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith('video/');
      const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const url = URL.createObjectURL(file);
      onMediaAdd({ id, type: isVideo ? 'video' : 'image', blob: file, url });
    });
    e.target.value = '';
  }

  // 实时显示的转写文字
  const liveTranscript = isRecording ? (transcript || interimTranscript) : '';

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
          {liveTranscript && (
            <span className="text-xs text-coral/70 flex-1 truncate">{liveTranscript}</span>
          )}
          <button
            onClick={toggleRecording}
            className="w-8 h-8 rounded-full bg-coral text-white flex items-center justify-center"
          >
            <Square size={14} fill="white" />
          </button>
        </div>
      )}

      {/* 已完成的语音转文字预览 */}
      {!isRecording && mediaItems.some(m => m.type === 'voice') && transcriptRef.current && (
        <div className="mb-3 p-2.5 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-600 mb-0.5 font-medium">语音转文字</p>
          <p className="text-sm text-ink">{transcriptRef.current}</p>
        </div>
      )}

      {speechError && !isRecording && (
        <p className="text-xs text-muted/50 mb-2">语音转文字不可用（{speechError}），录音功能正常</p>
      )}

      {/* 输入工具栏：录音 | 相机 | 相册 */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleRecording}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-coral text-white shadow-float animate-pulse'
              : 'bg-cream-dark text-coral hover:bg-coral/10'
          }`}
          aria-label="录音"
        >
          <Mic size={22} />
        </button>

        <button
          onClick={() => cameraInputRef.current?.click()}
          className="w-12 h-12 rounded-full bg-cream-dark text-ink flex items-center justify-center hover:bg-rule/50 transition-all"
          aria-label="拍照/录像"
        >
          <Camera size={22} />
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          onClick={() => galleryInputRef.current?.click()}
          className="w-12 h-12 rounded-full bg-cream-dark text-ink flex items-center justify-center hover:bg-rule/50 transition-all"
          aria-label="从相册选择"
        >
          <ImagePlus size={22} />
        </button>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
