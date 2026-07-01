const WORKER_URL = 'https://api.tongxi.xyz';
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_ROLE_KEY = 'auth_role'; // 'edit' | 'view' | 'admin'
const AUTH_ACCOUNT_KEY = 'auth_account'; // 账号名

export type AuthRole = 'edit' | 'view' | 'admin';

// 获取存储的认证 token
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// 获取当前角色
export function getAuthRole(): AuthRole | null {
  return localStorage.getItem(AUTH_ROLE_KEY) as AuthRole | null;
}

// 获取当前账号名
export function getAuthAccount(): string | null {
  return localStorage.getItem(AUTH_ACCOUNT_KEY);
}

// 是否为编辑权限（edit 或 admin）
export function isEditMode(): boolean {
  const role = getAuthRole();
  return role === 'edit' || role === 'admin';
}

// 是否为管理员
export function isAdmin(): boolean {
  return getAuthRole() === 'admin';
}

// 保存认证信息
export function setAuthInfo(token: string, role: AuthRole, accountName?: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_ROLE_KEY, role);
  if (accountName) {
    localStorage.setItem(AUTH_ACCOUNT_KEY, accountName);
  } else {
    localStorage.removeItem(AUTH_ACCOUNT_KEY);
  }
}

// 清除认证信息
export function clearAuthInfo(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_ROLE_KEY);
  localStorage.removeItem(AUTH_ACCOUNT_KEY);
}

// 是否已认证
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

// 账号登录（account 必填，password 选填）
export async function login(account: string, password?: string): Promise<{ ok: boolean; token?: string; role?: AuthRole; accountName?: string; error?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
    });
    const data = await resp.json();
    if (data.ok && data.token) {
      const role = data.role || 'view';
      const accountName = data.accountName || account;
      setAuthInfo(data.token, role, accountName);
      return { ok: true, token: data.token, role, accountName };
    }
    return { ok: false, error: data.error || '登录失败' };
  } catch (e) {
    return { ok: false, error: '网络错误，请重试' };
  }
}
