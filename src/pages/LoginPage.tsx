import { useState } from 'react';
import { login, type AuthRole } from '@/lib/auth';
import { User, Loader2, Eye, EyeOff } from 'lucide-react';
import { cloudLogAccess } from '@/lib/cloud';

interface LoginPageProps {
  onSuccess: (role: AuthRole) => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account.trim()) return;
    setLoading(true);
    setError('');
    const result = await login(account.trim(), password || undefined);
    setLoading(false);
    if (result.ok) {
      cloudLogAccess('login');
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
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={account}
              onChange={(e) => { setAccount(e.target.value); setError(''); }}
              placeholder="账号"
              className="w-full bg-white border border-rule rounded-2xl px-4 py-3.5 text-ink
                         placeholder:text-muted/40 outline-none
                         focus:border-coral/50 focus:ring-4 focus:ring-coral/5
                         transition-all duration-200 text-lg"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="密码"
              required
              className="w-full bg-white border border-rule rounded-2xl px-4 py-3.5 pr-12 text-ink
                         placeholder:text-muted/40 outline-none
                         focus:border-coral/50 focus:ring-4 focus:ring-coral/5
                         transition-all duration-200 text-lg"
              disabled={loading}
            />
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setShowPassword(!showPassword); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted/50 hover:text-muted transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
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
