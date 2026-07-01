import { useState } from 'react';
import { login, type AuthRole, getAuthToken } from '@/lib/auth';
import { Lock, Eye, Pencil, Loader2 } from 'lucide-react';
import { cloudLogAccess } from '@/lib/cloud';

const WORKER_URL = 'https://api.tongxi.xyz';

interface LoginPageProps {
  onSuccess: (role: AuthRole) => void;
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
      // 异步记录登录日志
      cloudLogAccess('login');
      // 异步触发数据迁移（创建字段、回填上传时间、创建日志表）
      const token = getAuthToken();
      if (token) {
        fetch(`${WORKER_URL}/api/migrate`, {
          headers: { 'X-Auth-Token': token },
        }).catch(() => {});
      }
      onSuccess(result.role || 'view');
    } else {
      setError(result.error || '登录失败');
    }
  }

  return (
    <div className="bg-gradient-to-br from-cream via-cream-light to-cream-dark flex items-center justify-center px-5" style={{ minHeight: '100dvh' }}>
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

        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted/50">
            <Eye size={12} />
            <span>查看密码：可浏览所有记录</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted/50">
            <Pencil size={12} />
            <span>编辑密码：可添加、编辑、删除记录</span>
          </div>
        </div>

        <p className="text-xs text-muted/40 text-center mt-8">
          数据安全存储于飞书云端
        </p>
      </div>
    </div>
  );
}
