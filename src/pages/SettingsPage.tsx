import { useState, useEffect } from 'react';
import NavHeader from '@/components/NavHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { LogOut, User, Plus, Trash2, Edit3, Shield, X, Loader2, Eye, EyeOff, Check, XCircle, Clock, Users } from 'lucide-react';
import { clearAuthInfo, getAuthRole, getAuthAccount, isAdmin, isSuperAdmin } from '@/lib/auth';
import { cloudLogAccess } from '@/lib/cloud';
import { cloudGetAccounts, cloudCreateAccount, cloudUpdateAccount, cloudDeleteAccount, cloudApproveAccount, cloudRejectAccount, type AccountRecord } from '@/lib/cloud';

export default function SettingsPage() {
  const role = getAuthRole();
  const accountName = getAuthAccount();
  const isAdminUser = isAdmin();
  const isSuperAdminUser = isSuperAdmin();
  const [deleteTarget, setDeleteTarget] = useState<AccountRecord | null>(null);

  // 账号管理状态
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [accountPage, setAccountPage] = useState(1);
  const ACCOUNTS_PER_PAGE = 10;

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('view');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);

  function handleLogout() {
    clearAuthInfo();
    window.location.reload();
    cloudLogAccess('logout');
  }

  // 加载账号列表：先从 localStorage 缓存秒开，后台刷新
  async function loadAccounts() {
    if (!isSuperAdminUser) return;
    // 优先读取缓存，秒级显示
    try {
      const cached = localStorage.getItem('accounts_cache');
      if (cached) {
        setAccounts(JSON.parse(cached));
      }
    } catch {}
    // 后台刷新最新数据
    const list = await cloudGetAccounts();
    setAccounts(list);
    try {
      localStorage.setItem('accounts_cache', JSON.stringify(list));
    } catch {}
  }

  useEffect(() => {
    if (isSuperAdminUser) loadAccounts();
  }, [isSuperAdminUser]);

  // 新增账号
  async function handleAddAccount() {
    if (!formName.trim()) { setFormError('请输入账号名'); return; }
    if (!formPassword) { setFormError('请输入密码'); return; }
    setFormSubmitting(true);
    setFormError('');
    const result = await cloudCreateAccount(formName.trim(), formPassword, formRole);
    setFormSubmitting(false);
    if (result) {
      setShowAddForm(false);
      setFormName(''); setFormPassword(''); setFormRole('view'); setFormError('');
      loadAccounts();
    } else {
      setFormError('创建失败，账号名可能已存在');
    }
  }

  // 编辑账号
  async function handleEditAccount() {
    if (!editingAccount) return;
    if (!formName.trim()) { setFormError('请输入账号名'); return; }
    if (!formPassword) { setFormError('请输入新密码'); return; }
    setFormSubmitting(true);
    setFormError('');
    const updates: { accountName?: string; password?: string; role?: string } = {};
    if (formName.trim() !== editingAccount.账号名) updates.accountName = formName.trim();
    if (formPassword) updates.password = formPassword;
    if (formRole !== editingAccount.权限) updates.role = formRole;
    const ok = await cloudUpdateAccount(editingAccount.record_id, updates);
    setFormSubmitting(false);
    if (ok) {
      setEditingAccount(null);
      setFormName(''); setFormPassword(''); setFormRole('view'); setFormError('');
      loadAccounts();
    } else {
      setFormError('更新失败');
    }
  }

  // 删除账号
  async function handleDeleteAccount(account: AccountRecord) {
    await cloudDeleteAccount(account.record_id);
    loadAccounts();
  }

  // 审核通过
  async function handleApprove(acc: AccountRecord, approveRole?: string) {
    await cloudApproveAccount(acc.record_id, approveRole || 'edit');
    loadAccounts();
  }

  // 审核拒绝
  async function handleReject(acc: AccountRecord) {
    await cloudRejectAccount(acc.record_id);
    loadAccounts();
  }

  // 开始编辑
  function startEdit(account: AccountRecord) {
    setEditingAccount(account);
    setFormName(account.账号名);
    setFormPassword('');
    setFormRole(account.权限);
    setFormError('');
  }

  // 取消表单
  function cancelForm() {
    setShowAddForm(false);
    setEditingAccount(null);
    setFormName(''); setFormPassword(''); setFormRole('view'); setFormError('');
  }

  const roleLabel = (r: string) => {
    if (r === 'superadmin') return '超级管理员';
    if (r === 'admin') return '管理员';
    if (r === 'edit') return '编辑';
    return '查看';
  };

  const roleColor = (r: string) => {
    if (r === 'superadmin') return 'bg-purple-100 text-purple-700';
    if (r === 'admin') return 'bg-indigo-100 text-indigo-700';
    if (r === 'edit') return 'bg-amber-100 text-amber-700';
    return 'bg-sky-100 text-sky-700';
  };

  const statusLabel = (s: string) => {
    if (s === '待审批') return '待审批';
    if (s === '冻结') return '冻结';
    if (s === '删除') return '删除';
    return '正常';
  };

  const statusColor = (s: string) => {
    if (s === '待审批') return 'bg-amber-100 text-amber-700';
    if (s === '冻结') return 'bg-red-100 text-red-700';
    if (s === '删除') return 'bg-gray-100 text-gray-500';
    return 'bg-green-100 text-green-700';
  };

  const filteredAccounts = accounts.filter(a =>
    !searchQuery || a.账号名.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredAccounts.length / ACCOUNTS_PER_PAGE);
  const paginatedAccounts = filteredAccounts.slice(
    (accountPage - 1) * ACCOUNTS_PER_PAGE,
    accountPage * ACCOUNTS_PER_PAGE
  );

  const pendingAccounts = filteredAccounts.filter(a => a.状态 === '待审批');
  const approvedAccounts = paginatedAccounts.filter(a => a.状态 !== '待审批');

  useEffect(() => { setAccountPage(1); }, [searchQuery]);

  return (
    <div className="page-container">
      <NavHeader title="设置" showBack />

      <div className="mt-6 space-y-5">
        {/* 当前用户 */}
        <div className="card-shadow p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white shadow-soft">
              <User size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-sm font-outfit font-bold text-ink">
                {accountName || '未知账号'}
              </h3>
              <p className="text-xs text-muted">
                {role === 'superadmin' ? '超级管理员权限（全部操作）' : role === 'admin' ? '管理员权限（全部操作）' : role === 'edit' ? '编辑权限（可增删改）' : '查看权限（仅浏览）'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full mt-4 py-2.5 rounded-xl border border-coral/30 text-coral text-sm font-medium flex items-center justify-center gap-2 hover:bg-coral/5 active:scale-[0.98] transition-all"
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>

        {/* 使用邀请码 */}
        <div className="card-shadow p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky to-mint flex items-center justify-center text-white shadow-soft">
              <Users size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-sm font-outfit font-bold text-ink">加入宝宝</h3>
              <p className="text-xs text-muted">输入邀请码关联到新的宝宝</p>
            </div>
          </div>
          <SettingsInviteCodeInput />
        </div>

        {/* 账号管理（仅superadmin可见） */}
        {isSuperAdminUser && (
          <div className="card-shadow p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white shadow-soft">
                <Shield size={22} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-sm font-outfit font-bold text-ink">账号管理</h3>
                <p className="text-xs text-muted">管理系统中的所有账号</p>
              </div>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索账号..."
              className="w-full bg-white border border-rule rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50 focus:ring-2 focus:ring-coral/5 mb-3"
            />

            {/* 待审核账号 */}
            {pendingAccounts.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={14} className="text-amber-500" />
                  <span className="text-xs font-medium text-amber-700">待审核 ({pendingAccounts.length})</span>
                </div>
                <div className="space-y-2">
                  {pendingAccounts.map(acc => (
                    <div key={acc.record_id} className="flex items-center justify-between bg-amber-50/50 rounded-xl px-3 py-2.5 border border-amber-100">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-medium text-ink">{acc.账号名}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor(acc.状态)}`}>
                          {statusLabel(acc.状态)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          defaultValue="edit"
                          onChange={e => handleApprove(acc, e.target.value)}
                          className="text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-2 py-1 outline-none cursor-pointer"
                        >
                          <option value="edit">通过(编辑)</option>
                          <option value="view">通过(查看)</option>
                          <option value="admin">通过(管理员)</option>
                          <option value="superadmin">通过(超管)</option>
                        </select>
                        <button
                          onClick={() => handleReject(acc)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
                          title="拒绝"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 已通过/已拒绝账号列表 */}
            <div className="space-y-2 mt-2">
              {approvedAccounts.map(acc => (
                <div key={acc.record_id} className="flex items-center justify-between bg-cream-light/50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-ink">{acc.账号名}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor(acc.权限)}`}>
                      {roleLabel(acc.权限)}
                    </span>
                    {acc.状态 !== '正常' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor(acc.状态)}`}>
                        {statusLabel(acc.状态)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => startEdit(acc)}
                      className="p-1.5 rounded-lg hover:bg-cream-dark/50 text-muted hover:text-ink transition-colors"
                    >
                      <Edit3 size={14} />
                    </button>
                    {acc.账号名 !== accountName && (
                      <button
                        onClick={() => setDeleteTarget(acc)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 新增按钮 */}
            {!showAddForm && !editingAccount && (
              <button
                onClick={() => { setShowAddForm(true); setFormName(''); setFormPassword(''); setFormRole('view'); setFormError(''); }}
                className="w-full mt-3 py-2.5 rounded-xl border border-dashed border-rule text-muted text-sm font-medium flex items-center justify-center gap-2 hover:bg-cream-light/50 active:scale-[0.98] transition-all"
              >
                <Plus size={16} />
                新增账号
              </button>
            )}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={() => setAccountPage(p => Math.max(1, p - 1))}
                  disabled={accountPage <= 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-cream-dark text-muted disabled:opacity-30"
                >
                  上一页
                </button>
                <span className="text-xs text-muted">{accountPage}/{totalPages}</span>
                <button
                  onClick={() => setAccountPage(p => Math.min(totalPages, p + 1))}
                  disabled={accountPage >= totalPages}
                  className="px-3 py-1.5 text-xs rounded-lg bg-cream-dark text-muted disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
            )}

            {/* 新增/编辑表单 */}
            {(showAddForm || editingAccount) && (
              <div className="mt-3 p-4 bg-cream-light/30 rounded-xl border border-rule/40 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-outfit font-bold text-ink">
                    {editingAccount ? '编辑账号' : '新增账号'}
                  </h4>
                  <button onClick={cancelForm} className="p-1 rounded-lg hover:bg-cream-dark/50 text-muted">
                    <X size={16} />
                  </button>
                </div>
                <input
                  type="text"
                  value={formName}
                  onChange={e => { setFormName(e.target.value); setFormError(''); }}
                  placeholder="账号名"
                  className="w-full bg-white border border-rule rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50 focus:ring-2 focus:ring-coral/5"
                  disabled={formSubmitting}
                />
                <div className="relative">
                  <input
                    type={showFormPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={e => { setFormPassword(e.target.value); setFormError(''); }}
                    placeholder={editingAccount ? '新密码' : '密码'}
                    required={!editingAccount}
                    className="w-full bg-white border border-rule rounded-xl px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50 focus:ring-2 focus:ring-coral/5"
                    disabled={formSubmitting}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setShowFormPassword(!showFormPassword); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-muted transition-colors"
                  >
                    {showFormPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <select
                  value={formRole}
                  onChange={e => setFormRole(e.target.value)}
                  className="w-full bg-white border border-rule rounded-xl px-3 py-2.5 text-sm text-ink outline-none focus:border-coral/50 focus:ring-2 focus:ring-coral/5"
                  disabled={formSubmitting}
                >
                  <option value="view">查看权限</option>
                  <option value="edit">编辑权限</option>
                  <option value="admin">管理员权限</option>
                  <option value="superadmin">超级管理员权限</option>
                </select>
                {formError && <p className="text-xs text-red-500">{formError}</p>}
                <button
                  onClick={editingAccount ? handleEditAccount : handleAddAccount}
                  disabled={formSubmitting}
                  className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {formSubmitting ? <Loader2 size={14} className="animate-spin" /> : (editingAccount ? '保存' : '创建')}
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* 删除账号确认弹窗 */}
      {deleteTarget && (
        <ConfirmDialog
          title="删除账号"
          message={`确定删除账号 "${deleteTarget.账号名}" 吗？删除后无法恢复。`}
          confirmText="删除"
          onConfirm={() => handleDeleteAccount(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function SettingsInviteCodeInput() {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleRedeem() {
    if (!code.trim()) return;
    setSubmitting(true);
    setResult(null);
    const { cloudRedeemInvite } = await import('@/lib/cloud');
    const res = await cloudRedeemInvite(code.trim());
    setSubmitting(false);
    if (res.ok) {
      setResult({ ok: true, msg: '关联成功！刷新页面后即可看到新宝宝' });
      setCode('');
    } else {
      setResult({ ok: false, msg: res.error || '关联失败' });
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setResult(null); }}
          placeholder="输入邀请码，如 INV-A3B5C7"
          maxLength={10}
          className="flex-1 bg-white border border-rule rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50"
        />
        <button
          onClick={handleRedeem}
          disabled={!code.trim() || submitting}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {submitting ? '...' : '关联'}
        </button>
      </div>
      {result && (
        <p className={`text-xs mt-1.5 ${result.ok ? 'text-green-600' : 'text-red-500'}`}>{result.msg}</p>
      )}
    </div>
  );
}
