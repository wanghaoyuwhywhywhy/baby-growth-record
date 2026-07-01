import { useState } from 'react';
import { login, type AuthRole, getAuthToken } from '@/lib/auth';
import { User, Lock, Loader2 } from 'lucide-react';
import { cloudLogAccess } from '@/lib/cloud';

const WORKER_URL = 'https://api.tongxi.xyz';

interface LoginPageProps {
  onSuccess: (role: AuthRole) => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account.trim()) return;
    setLoading(true);
    setError('');
    const result = await login(account.trim(), password || undefined);
    setLoading(false);
    if (result.ok) {
      // 异步记录登录日志
      cloudLogAccess('login');
      // 异步触发数据迁移（创建字段、回填上传时间、创建日志表、创建账号表）
      const token = getAuthToken();
      if (token) {
        fetch(`${WORKER_URL}/api/migrate`, {
          headers: { 'X-Auth-Token': token },
        }).catch(() => {});
      }
      onSuccess(result.role || 'view');
    } else if (result.needsSetup) {
      setShowSetupModal(true);
    } else {
      setError(result.error || '登录失败');
    }
  }

  return (
    <div className="bg-gradient-to-br from-cream via-cream-light to-cream-dark flex items-center justify-center px-5" style={{ minHeight: '100dvh' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center mx-auto mb-4 shadow-float">
            <User size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-outfit font-bold text-ink">宝宝成长记录</h1>
          <p className="text-sm text-muted mt-1">请输入账号进入</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={account}
              onChange={(e) => { setAccount(e.target.value); setError(''); }}
              placeholder="账号名"
              className="w-full bg-white border border-rule rounded-2xl px-4 py-3.5 text-ink
                         placeholder:text-muted/40 outline-none
                         focus:border-coral/50 focus:ring-4 focus:ring-coral/5
                         transition-all duration-200 text-center text-lg"
              autoFocus
              disabled={loading}
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="密码"
              required
              className="w-full bg-white border border-rule rounded-2xl px-4 py-3.5 text-ink
                         placeholder:text-muted/40 outline-none
                         focus:border-coral/50 focus:ring-4 focus:ring-coral/5
                         transition-all duration-200 text-center text-lg tracking-widest"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!account.trim() || !password || loading}
            className="btn-primary w-full text-base flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              '进入'
            )}
          </button>
        </form>

        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted/50">
            <Lock size={12} />
            <span>所有账号均需输入密码</span>
          </div>
        </div>

        <p className="text-xs text-muted/40 text-center mt-8">
          数据安全存储于飞书云端
        </p>
      </div>

      {showSetupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-outfit font-bold text-ink mb-2">设置管理员密码</h2>
            <p className="text-sm text-muted mb-4">首次使用admin账号，请在密码栏输入您想设置的密码后重新登录。</p>
            <button
              onClick={() => { setShowSetupModal(false); setPassword(''); setError(''); }}
              className="btn-primary w-full py-2.5 text-sm"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
