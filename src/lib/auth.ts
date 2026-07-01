const WORKER_URL = 'https://api.tongxi.xyz';
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_ROLE_KEY = 'auth_role'; // 'edit' | 'view'

export type AuthRole = 'edit' | 'view';

// 获取存储的认证 token
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// 获取当前角色
export function getAuthRole(): AuthRole | null {
  return localStorage.getItem(AUTH_ROLE_KEY) as AuthRole | null;
}

// 是否为编辑权限
export function isEditMode(): boolean {
  return getAuthRole() === 'edit';
}

// 保存认证信息
export function setAuthInfo(token: string, role: AuthRole): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_ROLE_KEY, role);
}

// 清除认证信息
export function clearAuthInfo(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_ROLE_KEY);
}

// 是否已认证
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

// 登录
export async function login(password: string): Promise<{ ok: boolean; token?: string; role?: AuthRole; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await resp.json();
    if (data.ok && data.token) {
      const role = data.role || 'view';
      setAuthInfo(data.token, role);
      return { ok: true, token: data.token, role };
    }
    return { ok: false, error: data.error || '登录失败' };
  } catch (e) {
    return { ok: false, error: '网络错误，请重试' };
  }
}
