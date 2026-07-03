const WORKER_URL = 'https://api.tongxi.xyz';
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_ROLE_KEY = 'auth_role'; // 'edit' | 'view' | 'admin'
const AUTH_ACCOUNT_KEY = 'auth_account'; // 账号名
const AUTH_BABIES_KEY = 'auth_babies'; // 关联宝宝列表
const AUTH_RELATIONS_KEY = 'auth_baby_relations';

export type AuthRole = 'edit' | 'view' | 'admin' | 'superadmin';

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

// 是否为编辑权限（基于当前宝宝的关联角色）
export function isEditMode(): boolean {
  const linkRoles = getAuthBabyLinkRoles();
  const currentBabyId = localStorage.getItem('current_baby_id');
  if (currentBabyId && linkRoles[currentBabyId]) {
    const role = linkRoles[currentBabyId];
    return role === 'owner' || role === 'editor';
  }
  // 降级：如果没有关联角色信息，检查是否有 owner/editor 角色
  for (const role of Object.values(linkRoles)) {
    if (role === 'owner' || role === 'editor') return true;
  }
  return false;
}

// 是否为当前宝宝的owner
export function isCurrentBabyOwner(): boolean {
  const linkRoles = getAuthBabyLinkRoles();
  const currentBabyId = localStorage.getItem('current_baby_id');
  if (currentBabyId && linkRoles[currentBabyId]) {
    return linkRoles[currentBabyId] === 'owner';
  }
  return false;
}

// 是否为管理员
export function isAdmin(): boolean {
  const role = getAuthRole();
  return role === 'admin' || role === 'superadmin';
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
  localStorage.removeItem(AUTH_RELATIONS_KEY);
  localStorage.removeItem('auth_baby_link_roles');
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

// 获取宝宝关系映射
export function getAuthBabyRelations(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AUTH_RELATIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// 保存宝宝关系映射
export function setAuthBabyRelations(relations: Record<string, string>): void {
  localStorage.setItem(AUTH_RELATIONS_KEY, JSON.stringify(relations));
}

// 获取宝宝链接角色映射
export function getAuthBabyLinkRoles(): Record<string, string> {
  try {
    const raw = localStorage.getItem('auth_baby_link_roles');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// 保存宝宝链接角色映射
export function setAuthBabyLinkRoles(roles: Record<string, string>): void {
  localStorage.setItem('auth_baby_link_roles', JSON.stringify(roles));
}

// 判断是否为超级管理员
export function isSuperAdmin(): boolean {
  const role = localStorage.getItem(AUTH_ROLE_KEY);
  return role === 'superadmin' || role === 'admin';
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
      if (data.babies) {
        const relations: Record<string, string> = {};
        const linkRoles: Record<string, string> = {};
        for (const baby of data.babies) {
          if (baby.record_id && baby.relation) {
            relations[baby.record_id] = baby.relation;
          }
          if (baby.record_id && baby.linkRole) {
            linkRoles[baby.record_id] = baby.linkRole;
          }
        }
        setAuthBabyRelations(relations);
        setAuthBabyLinkRoles(linkRoles);
      }
      return { ok: true, token: data.token, role, accountName, status: data.status, babies: data.babies };
    }
    // 账号待审批
    if (data.code === 'pending') {
      return { ok: false, error: data.error || '账号待审批', code: 'pending' };
    }
    // 账号被冻结
    if (data.code === 'frozen') {
      return { ok: false, error: data.error || '账号已被冻结', code: 'frozen' };
    }
    // 账号审批未通过
    if (data.code === 'rejected') {
      return { ok: false, error: data.error || '账号审批未通过', code: 'rejected' };
    }
    // 账号已删除
    if (data.code === 'deleted') {
      return { ok: false, error: data.error || '账号已删除', code: 'deleted' };
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
      if (data.babies) {
        const relations: Record<string, string> = {};
        const linkRoles: Record<string, string> = {};
        for (const baby of data.babies) {
          if (baby.record_id && baby.relation) {
            relations[baby.record_id] = baby.relation;
          }
          if (baby.record_id && baby.linkRole) {
            linkRoles[baby.record_id] = baby.linkRole;
          }
        }
        setAuthBabyRelations(relations);
        setAuthBabyLinkRoles(linkRoles);
      }
      return { ok: true, role: data.role, accountName: data.accountName, status: data.status, babies: data.babies };
    }
    clearAuthInfo();
    return { ok: false };
  } catch (e) {
    return { ok: false };
  }
}
