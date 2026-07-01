import NavHeader from '@/components/NavHeader';
import { useAppStore } from '@/store/useAppStore';
import { Cloud, RefreshCw, Check, LogOut, User } from 'lucide-react';
import { clearAuthInfo, getAuthRole } from '@/lib/auth';
import { cloudLogAccess } from '@/lib/cloud';

export default function SettingsPage() {
  const { syncStatus, lastSyncResult, cloudConnected, syncFromCloud, checkCloudConnection } = useAppStore();
  const role = getAuthRole();

  async function handleLogout() {
    await cloudLogAccess('logout'); // 记录登出日志
    clearAuthInfo();
    window.location.reload();
  }

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
              <h3 className="text-sm font-outfit font-bold text-ink">当前身份</h3>
              <p className="text-xs text-muted">{role === 'edit' ? '编辑权限（可增删改）' : '查看权限（仅浏览）'}</p>
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
