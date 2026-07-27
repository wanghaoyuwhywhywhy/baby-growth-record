import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import NavHeader from '@/components/NavHeader';
import { chatStream } from '@/lib/ai';
import { getAuthBabyRelations } from '@/lib/auth';
import {
  cloudGetActiveChatSession,
  cloudGetChatMessages,
  cloudCreateChatSession,
  cloudCreateChatMessage,
  cloudDeleteChatSession,
} from '@/lib/cloud';
import { Send, Mic, MicOff, Loader2, Sparkles, Trash2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  messageId?: string;   // 云端消息 ID（落库后回写）
  createdAt?: string;   // ISO 时间字符串
  status?: '成功' | '失败' | '流式中';
}

// 语音识别的最小类型（本机 TS lib.dom 未包含厂商前缀的 SpeechRecognition 构造函数）
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

const CHAT_HISTORY_KEY = 'ai_chat_history';
const MAX_HISTORY = 50; // 最多保存50条消息

// 本地缓存（作为离线兜底，主存储已迁移至云端飞书多维表）
function loadLocalHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const msgs = JSON.parse(raw);
    return Array.isArray(msgs) ? msgs.slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
  } catch {
    // localStorage满了就不存
  }
}

export default function AIChatPage() {
  const baby = useAppStore((s) => s.currentBaby)();
  const babies = useAppStore((s) => s.babies);
  const growthRecords = useAppStore((s) => s.growthRecords);
  const records = useAppStore((s) => s.records);
  const vaccines = useAppStore((s) => s.vaccines);
  const babyRelations = getAuthBabyRelations();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // 宝宝范围选择：'current' = 仅当前宝宝，'all' = 全部宝宝
  const [babyScope, setBabyScope] = useState<'current' | 'all'>('current');

  // 当前会话 ID（云端业务主键），首屏异步加载后填充；为 null 时表示当前无活跃会话
  const sessionRef = useRef<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 自动滚动到底部（不用smooth避免跳动）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages]);

  // 首屏：从云端加载最近活跃会话及其消息；失败时降级到 localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingHistory(true);
      try {
        const session = await cloudGetActiveChatSession();
        if (cancelled) return;
        if (session) {
          sessionRef.current = session.sessionId;
          const msgs = await cloudGetChatMessages(session.sessionId);
          if (cancelled) return;
          const restored: ChatMessage[] = msgs
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              messageId: m.messageId,
              createdAt: m.createdAt,
              status: m.status,
            }));
          setMessages(restored.slice(-MAX_HISTORY));
        } else {
          // 无云端会话，尝试从 localStorage 恢复（兼容旧版本数据）
          const local = loadLocalHistory();
          if (local.length > 0) setMessages(local);
        }
      } catch {
        if (!cancelled) {
          const local = loadLocalHistory();
          if (local.length > 0) setMessages(local);
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 本地缓存兜底（不阻塞主流程）
  const persistLocalCache = useCallback((msgs: ChatMessage[]) => {
    const complete = msgs.filter(m => m.content.trim());
    saveLocalHistory(complete);
  }, []);

  // 清理语音识别
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // 提取宝宝数据（发送给AI的上下文）
  function getBabyContext() {
    const scopeBabies = babyScope === 'current' && baby
      ? babies.filter(b => b.record_id === baby.record_id)
      : babies;
    return scopeBabies.map(b => ({
      宝宝姓名: b.宝宝姓名,
      性别: b.性别,
      出生日期: b.出生日期,
      备注: b.备注,
      关系: babyRelations[b.record_id] || '其他',
    }));
  }

  function getGrowthContext() {
    return growthRecords.slice(0, 10).map(g => ({
      测量日期: g.测量日期,
      身高: g.身高,
      体重: g.体重,
    }));
  }

  function getRecordsContext() {
    return records.slice(0, 15).map(r => ({
      记录时间: r.记录时间,
      分类: r.分类,
      记录内容: r.记录内容,
    }));
  }

  function getVaccinesContext() {
    return vaccines.map(v => ({
      疫苗名称: v.疫苗名称,
      剂次: v.剂次,
      总剂次: v.总剂次,
      接种状态: v.接种状态,
      接种时间: v.接种时间,
    }));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    // 自动调整输入框高度
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    const allMessages = [...newMessages, assistantMsg];
    setMessages(allMessages);

    const abort = new AbortController();
    abortRef.current = abort;

    // 1. 确保有会话（首次发送时创建）
    let sid = sessionRef.current;
    if (!sid) {
      const babyNameStr = babyScope === 'all' ? '全部宝宝' : (baby?.宝宝姓名 || '宝宝');
      const babyIdStr = babyScope === 'current' && baby ? baby.record_id : undefined;
      try {
        const session = await cloudCreateChatSession({
          babyScope: babyScope === 'all' ? '全部宝宝' : '指定宝宝',
          babyName: babyNameStr,
          babyId: babyIdStr,
          title: text.slice(0, 30),
          sourcePage: 'AI对话',
        });
        if (session) {
          sid = session.sessionId;
          sessionRef.current = sid;
        }
      } catch (e) {
        console.warn('创建AI会话失败，仅本地缓存:', e);
      }
    }

    // 2. 持久化 user 消息（fire-and-forget，不阻塞流式）
    if (sid) {
      cloudCreateChatMessage({
        sessionId: sid,
        role: 'user',
        content: text,
        sourcePage: 'AI对话',
      }).then(rec => {
        if (rec) {
          // 把 messageId 回写到对应消息
          setMessages(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(m => m.role === 'user' && m.content === text && !m.messageId);
            if (idx >= 0) updated[idx] = { ...updated[idx], messageId: rec.messageId, createdAt: rec.createdAt };
            return updated;
          });
        }
      }).catch(() => {});
    }

    // 本地缓存兜底
    persistLocalCache(newMessages);

    try {
      // 构建发送给DeepSeek的messages（不含最新assistant空消息）
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

      let finalContent = '';
      await chatStream(
        {
          baby: getBabyContext(),
          growthRecords: getGrowthContext(),
          records: getRecordsContext(),
          vaccines: getVaccinesContext(),
          messages: apiMessages,
        },
        (chunk) => {
          finalContent += chunk;
          // 流式追加内容
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: finalContent };
            }
            return updated;
          });
        },
        abort.signal,
      );
      // 流式完成后持久化 assistant 消息
      if (sid) {
        cloudCreateChatMessage({
          sessionId: sid,
          role: 'assistant',
          content: finalContent,
          status: '成功',
          sourcePage: 'AI对话',
        }).catch(() => {});
      }
      persistLocalCache([...newMessages, { role: 'assistant', content: finalContent }]);
    } catch (e: unknown) {
      if ((e instanceof Error || e instanceof DOMException) && e.name === 'AbortError') return;
      const errContent = `❌ 请求失败：${e instanceof Error ? e.message : '未知错误'}`;
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          updated[updated.length - 1] = { ...last, content: errContent };
        }
        return updated;
      });
      if (sid) {
        cloudCreateChatMessage({
          sessionId: sid,
          role: 'assistant',
          content: errContent,
          status: '失败',
          errorMessage: e instanceof Error ? e.message : '未知错误',
          sourcePage: 'AI对话',
        }).catch(() => {});
      }
      persistLocalCache([...newMessages, { role: 'assistant', content: errContent }]);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  // 语音输入
  function toggleVoice() {
    if (listening) {
      // 停止
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert('您的浏览器不支持语音输入，请使用Chrome或Safari');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // 自动调整高度
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  async function handleClearHistory() {
    const sid = sessionRef.current;
    setMessages([]);
    sessionRef.current = null;
    localStorage.removeItem(CHAT_HISTORY_KEY);
    setShowClearConfirm(false);
    // 同步删除云端会话及其所有消息（fire-and-forget）
    if (sid) {
      try {
        await cloudDeleteChatSession(sid);
      } catch (e) {
        console.warn('云端删除AI会话失败:', e);
      }
    }
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: '100dvh' }}>
      <NavHeader
        title="AI 咨询"
        showBack
        rightAction={
          <button
            onClick={() => messages.length > 0 && setShowClearConfirm(true)}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
              messages.length > 0 ? 'text-muted hover:bg-cream-dark' : 'text-muted/30'
            }`}
            aria-label="清空历史"
          >
            <Trash2 size={18} />
          </button>
        }
      />

      {/* 宝宝范围切换：当前宝宝 / 全部宝宝 */}
      {babies.length > 1 && (
        <div className="px-4 pt-2 pb-1 shrink-0">
          <div className="inline-flex p-0.5 rounded-full bg-cream-dark/60 text-xs">
            <button
              onClick={() => setBabyScope('current')}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                babyScope === 'current'
                  ? 'bg-coral text-white shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              当前宝宝{baby ? `·${baby.宝宝姓名}` : ''}
            </button>
            <button
              onClick={() => setBabyScope('all')}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                babyScope === 'all'
                  ? 'bg-coral text-white shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              全部宝宝
            </button>
          </div>
        </div>
      )}

      {/* 清空确认弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-cream-light rounded-2xl p-5 mx-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-outfit font-bold text-ink mb-2">清空咨询记录？</h3>
            <p className="text-sm text-muted mb-4">清空后无法恢复，历史对话将全部删除。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-ink bg-cream-dark hover:bg-cream-dark/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleClearHistory}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-coral hover:bg-coral-dark transition-colors"
              >
                清空
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 消息列表 - 独立滚动区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-2">
        {loadingHistory && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 size={24} className="animate-spin text-muted mb-3" />
            <p className="text-sm text-muted">正在加载历史对话...</p>
          </div>
        )}
        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky to-mint flex items-center justify-center text-white shadow-soft mb-4">
              <Sparkles size={24} strokeWidth={2.5} />
            </div>
            <h2 className="text-base font-outfit font-bold text-ink mb-2">小嘻助手</h2>
            <p className="text-sm text-muted leading-relaxed max-w-[260px]">
              你好！我是小嘻，{babies.map(b => b.宝宝姓名).join('、') || '宝宝'}的专属成长助手。你可以问我关于育儿、健康、营养、教育等方面的问题，我会结合宝宝的实际数据给出个性化建议。
            </p>
            {/* 快捷问题 */}
            <div className="mt-5 space-y-2 w-full max-w-[280px]">
              {[
                '宝宝现在的发育情况正常吗？',
                '接下来需要接种哪些疫苗？',
                '有什么适合这个月龄的早教建议？',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="w-full text-left text-xs text-ink bg-cream-dark/60 rounded-xl px-3 py-2.5 hover:bg-cream-dark transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky to-mint flex items-center justify-center text-white mr-2 mt-0.5 shrink-0">
                <Sparkles size={14} />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-coral text-white rounded-br-md'
                  : 'bg-cream-dark text-ink rounded-bl-md'
              }`}
            >
              {msg.content || (streaming && i === messages.length - 1 ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 size={14} className="animate-spin" />
                  思考中...
                </span>
              ) : null)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 - 固定底部不随滚动 */}
      <div className="shrink-0 bg-cream/95 backdrop-blur-md border-t border-rule/50 px-4 py-3">
        <div className="flex items-end gap-2 max-w-lg mx-auto">
          {/* 语音按钮 */}
          <button
            onClick={toggleVoice}
            className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-colors ${
              listening
                ? 'bg-coral text-white animate-pulse'
                : 'bg-cream-dark text-muted hover:text-ink'
            }`}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* 输入框 */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入问题..."
            rows={1}
            className="flex-1 resize-none rounded-2xl bg-cream-dark px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-sky/30 max-h-[120px]"
          />

          {/* 发送按钮 */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming || loadingHistory}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-coral text-white disabled:opacity-40 transition-opacity"
          >
            {streaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
