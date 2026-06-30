import { useState } from 'react';
import { login } from '@/lib/auth';
import { Lock, Loader2 } from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    const result = await login(password);
    setLoading(false);
    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error || '登录失败');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-cream-light to-cream-dark flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center mx-auto mb-4 shadow-float">
            <Lock size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-outfit font-bold text-ink">宝宝成长记录</h1>
          <p className="text-sm text-muted mt-1">请输入密码进入</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="请输入访问密码"
              className="w-full bg-white border border-rule rounded-2xl px-4 py-3.5 text-ink
                         placeholder:text-muted/40 outline-none
                         focus:border-coral/50 focus:ring-4 focus:ring-coral/5
                         transition-all duration-200 text-center text-lg tracking-widest"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password.trim() || loading}
            className="btn-primary w-full text-base flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              '进入'
            )}
          </button>
        </form>

        <p className="text-xs text-muted/40 text-center mt-8">
          数据安全存储于飞书云端
        </p>
      </div>
    </div>
  );
}
