import { useState } from 'react';
import NavHeader from '@/components/NavHeader';
import { getApiKey, setApiKey, hasApiKey } from '@/lib/ai';
import { Check, Key, Sparkles, Eye, EyeOff } from 'lucide-react';

export default function SettingsPage() {
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle');

  function handleSave() {
    setApiKey(apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult('idle');
    try {
      setApiKey(apiKey.trim());
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: '你好' }],
          max_tokens: 10,
        }),
      });
      setTestResult(response.ok ? 'success' : 'fail');
    } catch {
      setTestResult('fail');
    }
    setTesting(false);
  }

  return (
    <div className="page-container">
      <NavHeader title="设置" showBack />

      <div className="mt-6 space-y-5">
        {/* AI 功能说明 */}
        <div className="card-shadow p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white shadow-soft">
              <Sparkles size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-sm font-outfit font-bold text-ink">AI 智能助手</h3>
              <p className="text-xs text-muted">DeepSeek 驱动</p>
            </div>
          </div>
          <div className="space-y-2 text-xs text-muted">
            <p>• 自动分类：根据内容智能判断分类</p>
            <p>• 内容润色：让记录更温暖有画面感</p>
            <p>• 智能建议：根据近期记录推荐内容</p>
          </div>
        </div>

        {/* API Key 配置 */}
        <div className="card-shadow p-5">
          <label className="block text-sm font-medium text-muted mb-3 flex items-center gap-2">
            <Key size={16} />
            DeepSeek API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              placeholder="sk-..."
              className="input-field pr-12"
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-1.5"
            >
              {saved ? (
                <>
                  <Check size={16} strokeWidth={2.5} />
                  已保存
                </>
              ) : (
                '保存'
              )}
            </button>
            <button
              onClick={handleTest}
              disabled={!apiKey.trim() || testing}
              className="btn-secondary py-2.5 px-4 text-sm"
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
          </div>

          {testResult === 'success' && (
            <p className="text-xs text-mint-dark mt-2 flex items-center gap-1">
              <Check size={14} /> 连接成功，AI 功能可用
            </p>
          )}
          {testResult === 'fail' && (
            <p className="text-xs text-coral mt-2">
              连接失败，请检查 API Key 是否正确
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-rule/40">
            <p className="text-xs text-muted/70">
              获取 API Key：
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-coral ml-1 underline"
              >
                DeepSeek 开放平台
              </a>
            </p>
            <p className="text-xs text-muted/50 mt-1">
              Key 仅存储在本地浏览器，不会上传
            </p>
          </div>
        </div>

        {/* 状态显示 */}
        <div className="card-shadow p-4 flex items-center justify-between">
          <span className="text-sm text-muted">AI 功能状态</span>
          <span className={`text-xs px-2 py-1 rounded-full ${
            hasApiKey()
              ? 'bg-mint/15 text-mint-dark'
              : 'bg-rule/40 text-muted'
          }`}>
            {hasApiKey() ? '已启用' : '未配置'}
          </span>
        </div>
      </div>
    </div>
  );
}
