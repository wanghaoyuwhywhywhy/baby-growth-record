const WORKER_URL = 'https://api.tongxi.xyz';
const AUTH_TOKEN_KEY = 'auth_token';

// 获取存储的认证 token
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// 保存认证 token
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

// 清除认证 token
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

// 登录
export async function login(password: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await resp.json();
    if (data.ok && data.token) {
      setAuthToken(data.token);
      return { ok: true, token: data.token };
    }
    return { ok: false, error: data.error || '登录失败' };
  } catch (e) {
    return { ok: false, error: '网络错误，请重试' };
  }
}

// 检查是否已认证
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}
