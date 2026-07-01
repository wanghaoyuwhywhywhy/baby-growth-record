import { useState, useEffect } from 'react';
import NavHeader from '@/components/NavHeader';
import { useAppStore } from '@/store/useAppStore';
import { Cloud, RefreshCw, Check, LogOut, User, Plus, Trash2, Edit3, Shield, X, Loader2 } from 'lucide-react';
import { clearAuthInfo, getAuthRole, getAuthAccount, isAdmin } from '@/lib/auth';
import { cloudLogAccess } from '@/lib/cloud';
import { cloudGetAccounts, cloudCreateAccount, cloudUpdateAccount, cloudDeleteAccount, type AccountRecord } from '@/lib/cloud';

export default function SettingsPage() {
  const { syncStatus, lastSyncResult, cloudConnected, syncFromCloud, checkCloudConnection } = useAppStore();
  const role = getAuthRole();
  const accountName = getAuthAccount();
  const isAdminUser = isAdmin();

  // 账号管理状态
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('view');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  function handleLogout() {
    clearAuthInfo();
    window.location.reload();
    cloudLogAccess('logout');
  }

  // 加载账号列表
  async function loadAccounts() {
    if (!isAdminUser) return;
    setAccountsLoading(true);
    const list = await cloudGetAccounts();
    setAccounts(list);
    setAccountsLoading(false);
  }

  useEffect(() => {
    if (isAdminUser) loadAccounts();
  }, [isAdminUser]);

  // 新增账号
  async function handleAddAccount() {
    if (!formName.trim()) { setFormError('请输入账号名'); return; }
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
    if (!confirm(`确定删除账号 "${account.账号名}" 吗？`)) return;
    await cloudDeleteAccount(account.record_id);
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
    if (r === 'admin') return '管理员';
    if (r === 'edit') return '编辑';
    return '查看';
  };

  const roleColor = (r: string) => {
    if (r === 'admin') return 'bg-purple-100 text-purple-700';
    if (r === 'edit') return 'bg-amber-100 text-amber-700';
    return 'bg-sky-100 text-sky-700';
  };

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
                {role === 'admin' ? '管理员权限（全部操作）' : role === 'edit' ? '编辑权限（可增删改）' : '查看权限（仅浏览）'}
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

        {/* 账号管理（仅admin可见） */}
        {isAdminUser && (
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

            {/* 账号列表 */}
            {accountsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={20} className="animate-spin text-muted" />
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                {accounts.map(acc => (
                  <div key={acc.record_id} className="flex items-center justify-between bg-cream-light/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-medium text-ink">{acc.账号名}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor(acc.权限)}`}>
                        {roleLabel(acc.权限)}
                      </span>
                      {!acc.hasPassword && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">无密码</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => startEdit(acc)}
                        className="p-1.5 rounded-lg hover:bg-cream-dark/50 text-muted hover:text-ink transition-colors"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(acc)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => { setFormPassword(e.target.value); setFormError(''); }}
                  placeholder={editingAccount ? '新密码（留空不修改）' : '密码（可选）'}
                  className="w-full bg-white border border-rule rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-muted/40 outline-none focus:border-coral/50 focus:ring-2 focus:ring-coral/5"
                  disabled={formSubmitting}
                />
                <select
                  value={formRole}
                  onChange={e => setFormRole(e.target.value)}
                  className="w-full bg-white border border-rule rounded-xl px-3 py-2.5 text-sm text-ink outline-none focus:border-coral/50 focus:ring-2 focus:ring-coral/5"
                  disabled={formSubmitting}
                >
                  <option value="view">查看权限</option>
                  <option value="edit">编辑权限</option>
                  <option value="admin">管理员权限</option>
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

        {/* 云端同步 */}
        <div className="card-shadow p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky to-blue-500 flex items-center justify-center text-white shadow-soft">
              <Cloud size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-sm font-outfit font-bold text-ink">飞书云端同步</h3>
              <p className="text-xs text-muted">数据备份到飞书多维表格</p>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { checkCloudConnection(); syncFromCloud(); }}
              disabled={syncStatus === 'syncing'}
              className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-1.5"
            >
              {syncStatus === 'syncing' ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  同步中...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  从云端拉取
                </>
              )}
            </button>
          </div>

          {cloudConnected !== null && (
            <p className={`text-xs mt-2 flex items-center gap-1 ${cloudConnected ? 'text-mint-dark' : 'text-coral'}`}>
              <Check size={14} />
              {cloudConnected ? '云端连接正常' : '云端连接失败'}
            </p>
          )}

          {syncStatus === 'success' && lastSyncResult && (
            <p className="text-xs text-mint-dark mt-1">
              同步完成：新增 {lastSyncResult.babies} 个宝宝、{lastSyncResult.records} 条记录、{lastSyncResult.growth} 条成长数据
            </p>
          )}

          {syncStatus === 'error' && (
            <p className="text-xs text-coral mt-1">同步失败，请检查网络连接</p>
          )}

          <div className="mt-3 pt-3 border-t border-rule/40">
            <p className="text-xs text-muted/50">
              本地创建的记录会自动推送到云端
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
