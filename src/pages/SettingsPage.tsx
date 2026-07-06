import { useState, useEffect } from 'react';
import NavHeader from '@/components/NavHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { LogOut, User, Plus, Trash2, Edit3, Shield, X, Loader2, Eye, EyeOff, Check, XCircle, Clock } from 'lucide-react';
import { clearAuthInfo, getAuthAccount, isSuperAdmin } from '@/lib/auth';
import { cloudLogAccess } from '@/lib/cloud';
import { cloudGetAccounts, cloudCreateAccount, cloudUpdateAccount, cloudDeleteAccount, cloudApproveAccount, cloudRejectAccount, type AccountRecord } from '@/lib/cloud';

export default function SettingsPage() {
  const accountName = getAuthAccount();
  const isSuperAdminUser = isSuperAdmin();
  const [deleteTarget, setDeleteTarget] = useState<AccountRecord | null>(null);

  // 账号管理状态
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [accountPage, setAccountPage] = useState(1);
  const ACCOUNTS_PER_PAGE = 10;

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formStatus, setFormStatus] = useState('正常');

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
    const result = await cloudCreateAccount(formName.trim(), formPassword);
    setFormSubmitting(false);
    if (result) {
      setShowAddForm(false);
      setFormName(''); setFormPassword(''); setFormError('');
      loadAccounts();
    } else {
      setFormError('创建失败，账号名可能已存在');
    }
  }

  // 编辑账号（账号名不可修改）
  async function handleEditAccount() {
    if (!editingAccount) return;
    setFormSubmitting(true);
    setFormError('');
    const updates: { password?: string; status?: string } = {};
    if (formPassword) updates.password = formPassword;
    if (formStatus !== editingAccount.状态) updates.status = formStatus;
    const ok = await cloudUpdateAccount(editingAccount.record_id, updates);
    setFormSubmitting(false);
    if (ok) {
      setEditingAccount(null);
      setFormName(''); setFormPassword(''); setFormStatus('正常'); setFormError('');
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
  async function handleApprove(acc: AccountRecord) {
    await cloudApproveAccount(acc.record_id);
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
    setFormStatus(account.状态);
    setFormError('');
  }

  // 取消表单
  function cancelForm() {
    setShowAddForm(false);
    setEditingAccount(null);
    setFormName(''); setFormPassword(''); setFormStatus('正常'); setFormError('');
  }

  const statusLabel = (s: string) => {
    if (s === '待审批') return '待审批';
    if (s === '冻结') return '冻结';
    if (s === '删除') return '删除';
    if (s === '审批未通过') return '审批未通过';
    return '正常';
  };

  const statusColor = (s: string) => {
    if (s === '待审批') return 'bg-amber-100 text-amber-700';
    if (s === '冻结') return 'bg-red-100 text-red-700';
    if (s === '删除') return 'bg-gray-100 text-gray-500';
    if (s === '审批未通过') return 'bg-orange-100 text-orange-700';
    return 'bg-green-100 text-green-700';
  };

  const filteredAccounts = accounts.filter(a => {
    const matchSearch = !searchQuery || a.账号名.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === '全部' || a.状态 === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filteredAccounts.length / ACCOUNTS_PER_PAGE);
  const paginatedAccounts = filteredAccounts.slice(
    (accountPage - 1) * ACCOUNTS_PER_PAGE,
    accountPage * ACCOUNTS_PER_PAGE
  );

  const pendingAccounts = filteredAccounts.filter(a => a.状态 === '待审批');
  const approvedAccounts = paginatedAccounts.filter(a => a.状态 !== '待审批');

  useEffect(() => { setAccountPage(1); }, [searchQuery, statusFilter]);

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
              {isSuperAdminUser && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">超级管理员</span>
              )}
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

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索账号..."
                className="flex-1 bg-white border border-rule rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50 focus:ring-2 focus:ring-coral/5"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-white border border-rule rounded-xl px-3 py-2 text-sm text-ink outline-none focus:border-coral/50"
              >
                <option value="全部">全部状态</option>
                <option value="正常">正常</option>
                <option value="待审批">待审批</option>
                <option value="冻结">冻结</option>
                <option value="审批未通过">审批未通过</option>
                <option value="删除">已删除</option>
              </select>
            </div>

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
                        <button
                          onClick={() => handleApprove(acc)}
                          className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition-colors"
                          title="通过"
                        >
                          <Check size={14} />
                        </button>
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
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor(acc.状态)}`}>
                      {statusLabel(acc.状态)}
                    </span>
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
                onClick={() => { setShowAddForm(true); setFormName(''); setFormPassword(''); setFormError(''); }}
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

          </div>
        )}

      </div>

      {/* 删除账号确认弹窗 */}
      {deleteTarget && (
        <ConfirmDialog
          title="删除账号"
          message={`确定删除账号 "${deleteTarget.账号名}" 吗？该账号将被标记为已删除。`}
          confirmText="删除"
          onConfirm={() => handleDeleteAccount(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* 新增账号弹框 */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={cancelForm}>
          <div className="w-full max-w-sm bg-cream-light rounded-2xl p-5 mx-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-outfit font-bold text-ink">新增账号</h3>
              <button onClick={cancelForm} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark">
                <X size={18} className="text-muted" />
              </button>
            </div>
            <div className="space-y-3">
              <input type="text" value={formName} onChange={e => { setFormName(e.target.value); setFormError(''); }} placeholder="账号名" className="w-full bg-white border border-rule rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50" disabled={formSubmitting} />
              <div className="relative">
                <input type={showFormPassword ? 'text' : 'password'} value={formPassword} onChange={e => { setFormPassword(e.target.value); setFormError(''); }} placeholder="密码" className="w-full bg-white border border-rule rounded-xl px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50" disabled={formSubmitting} />
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowFormPassword(!showFormPassword); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-muted transition-colors">
                  {showFormPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <button onClick={handleAddAccount} disabled={formSubmitting} className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {formSubmitting ? <Loader2 size={14} className="animate-spin" /> : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑账号弹框 */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={cancelForm}>
          <div className="w-full max-w-sm bg-cream-light rounded-2xl p-5 mx-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-outfit font-bold text-ink">编辑账号</h3>
              <button onClick={cancelForm} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark">
                <X size={18} className="text-muted" />
              </button>
            </div>
            <div className="space-y-3">
              <input type="text" value={formName} className="w-full bg-gray-100 border border-rule rounded-xl px-3 py-2.5 text-sm text-muted outline-none cursor-not-allowed" disabled />
              <div className="relative">
                <input type={showFormPassword ? 'text' : 'password'} value={formPassword} onChange={e => { setFormPassword(e.target.value); setFormError(''); }} placeholder="新密码（留空则不修改）" className="w-full bg-white border border-rule rounded-xl px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50" disabled={formSubmitting} />
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowFormPassword(!showFormPassword); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-muted transition-colors">
                  {showFormPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {editingAccount.账号名 === accountName ? (
                <input type="text" value={formStatus} className="w-full bg-gray-100 border border-rule rounded-xl px-3 py-2.5 text-sm text-muted outline-none cursor-not-allowed" disabled />
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFormStatus('正常')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${formStatus === '正常' ? 'bg-coral text-white' : 'bg-white border border-rule text-muted hover:border-coral/40'}`} disabled={formSubmitting}>正常</button>
                  <button type="button" onClick={() => setFormStatus('冻结')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${formStatus === '冻结' ? 'bg-coral text-white' : 'bg-white border border-rule text-muted hover:border-coral/40'}`} disabled={formSubmitting}>冻结</button>
                </div>
              )}
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <button onClick={handleEditAccount} disabled={formSubmitting} className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {formSubmitting ? <Loader2 size={14} className="animate-spin" /> : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
