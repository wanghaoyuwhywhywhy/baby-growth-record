const WORKER_URL = 'https://api.tongxi.xyz';
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_ROLE_KEY = 'auth_role'; // 'edit' | 'view' | 'admin'
const AUTH_ACCOUNT_KEY = 'auth_account'; // 账号名
const AUTH_BABIES_KEY = 'auth_babies'; // 关联宝宝列表

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
  localStorage.removeItem(AUTH_BABIES_KEY);
}

// 获取关联宝宝列表
export function getAuthBabies(): any[] {
  try {
    const raw = localStorage.getItem(AUTH_BABIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// 保存认证关联宝宝
export function setAuthBabies(babies: any[]): void {
  localStorage.setItem(AUTH_BABIES_KEY, JSON.stringify(babies));
}

// 是否已认证
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

// 账号登录（account 必填，password 必填）
export async function login(account: string, password?: string): Promise<{ ok: boolean; token?: string; role?: AuthRole; accountName?: string; error?: string; code?: string; needsSetup?: boolean; accountNotFound?: boolean; status?: string; babies?: any[] }> {
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
      if (data.babies) setAuthBabies(data.babies);
      return { ok: true, token: data.token, role, accountName, status: data.status, babies: data.babies };
    }
    // 账号待审核
    if (data.code === 'pending') {
      return { ok: false, error: data.error || '账号待审核', code: 'pending' };
    }
    // 账号被拒绝
    if (data.code === 'rejected') {
      return { ok: false, error: data.error || '账号已被拒绝', code: 'rejected' };
    }
    // 账号不存在时自动登出
    if (data.code === 'account_not_found' || (data.error && data.error.includes('账号不存在'))) {
      clearAuthInfo();
      return { ok: false, error: data.error || '账号不存在', accountNotFound: true };
    }
    // admin首次登录需要设置密码
    if (data.needsSetup) {
      return { ok: false, error: data.error || '请设置管理员密码', needsSetup: true };
    }
    return { ok: false, error: data.error || '登录失败' };
  } catch (e) {
    return { ok: false, error: '网络错误，请重试' };
  }
}

// 自助注册
export async function register(account: string, password: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const resp = await fetch(`${WORKER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', account, password }),
    });
    const data = await resp.json();
    return data;
  } catch (e) {
    return { ok: false, error: '网络错误，请重试' };
  }
}

// 验证 token 是否仍有效（含状态检查）
export async function verifyAuth(): Promise<{ ok: boolean; role?: AuthRole; accountName?: string; status?: string; babies?: any[] }> {
  const token = getAuthToken();
  if (!token) return { ok: false };
  try {
    const resp = await fetch(`${WORKER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', token }),
    });
    const data = await resp.json();
    if (data.ok) {
      setAuthInfo(token, data.role, data.accountName);
      if (data.babies) setAuthBabies(data.babies);
      return { ok: true, role: data.role, accountName: data.accountName, status: data.status, babies: data.babies };
    }
    clearAuthInfo();
    return { ok: false };
  } catch (e) {
    return { ok: false };
  }
}
