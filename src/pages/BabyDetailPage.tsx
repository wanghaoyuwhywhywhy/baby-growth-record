import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useNavigate } from 'react-router-dom';
import NavHeader from '@/components/NavHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { calcAge } from '@/utils/date';
import { Edit3, User, Calendar, Heart, Plus, Trash2, Copy, Users } from 'lucide-react';
import { getAuthBabyRelations, getAuthBabyLinkRoles } from '@/lib/auth';
import { cloudGetBabyContacts, cloudCreateInvite, cloudRemoveContact, cloudUpdateContact } from '@/lib/cloud';

interface Contact {
  record_id: string;
  accountName: string;
  babyId: string;
  role: string;
  relation: string;
  inviteCode: string;
  isPending: boolean;
  lastLoginTime?: number | null;
}

export default function BabyDetailPage() {
  const { currentBaby } = useAppStore();
  const navigate = useNavigate();
  const baby = currentBaby();
  const babyRelations = getAuthBabyRelations();
  const babyLinkRoles = getAuthBabyLinkRoles();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteRelation, setInviteRelation] = useState('妈妈');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteCode, setInviteCode] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editRelation, setEditRelation] = useState('');
  const [editRole, setEditRole] = useState('');

  const isOwner = baby ? babyLinkRoles[baby.record_id] === 'owner' : false;

  useEffect(() => {
    if (baby?.record_id) {
      loadContacts();
    }
  }, [baby?.record_id]);

  async function loadContacts() {
    if (!baby?.record_id) return;
    const result = await cloudGetBabyContacts(baby.record_id);
    if (result.ok && result.contacts) {
      setContacts(result.contacts);
    }
  }

  async function handleCreateInvite() {
    if (!baby?.record_id) return;
    const result = await cloudCreateInvite(baby.record_id, inviteRole, inviteRelation);
    if (result.ok && result.code) {
      setInviteCode(result.code);
      loadContacts();
    }
  }

  async function handleRemoveContact(contact: Contact) {
    await cloudRemoveContact(contact.record_id);
    setRemoveTarget(null);
    loadContacts();
  }

  async function handleUpdateContactRole(contact: Contact) {
    if (!baby?.record_id) return;
    const newRole = contact.role === 'editor' ? 'viewer' : 'editor';
    const { cloudUpdateContactRole } = await import('@/lib/cloud');
    const result = await cloudUpdateContactRole(contact.record_id, newRole);
    if (result.ok) {
      loadContacts();
    }
  }

  async function handleSaveEditContact() {
    if (!editingContact) return;
    const updates: { relation?: string; role?: string } = {};
    if (editRelation !== editingContact.relation) updates.relation = editRelation;
    if (editRole !== editingContact.role) updates.role = editRole;
    if (Object.keys(updates).length > 0) {
      const result = await cloudUpdateContact(editingContact.record_id, updates);
      if (result.ok) {
        loadContacts();
      }
    }
    setEditingContact(null);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      alert('邀请码已复制：' + code);
    }).catch(() => {
      prompt('请复制邀请码：', code);
    });
  }

  if (!baby) {
    return (
      <div className="page-container">
        <NavHeader title="宝宝档案" showBack />
        <div className="mt-20 text-center text-muted text-sm">暂无宝宝信息</div>
      </div>
    );
  }

  const age = calcAge(baby.出生日期);
  const relation = babyRelations[baby.record_id];

  const RELATION_OPTIONS = ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '姑姑', '叔叔', '舅舅', '阿姨', '其他'];

  return (
    <div className="page-container">
      <NavHeader
        title="宝宝档案"
        showBack
        rightAction={
          <button
            onClick={() => navigate(`/baby/edit?id=${baby.record_id}`)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
            aria-label="编辑"
          >
            <Edit3 size={18} className="text-ink" />
          </button>
        }
      />

      <div className="mt-6">
        {/* 头像和基本信息 */}
        <div className="card-shadow p-6 mb-5 text-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white text-4xl font-outfit font-bold shadow-float mx-auto mb-3">
            {baby.宝宝姓名.charAt(0)}
          </div>
          <h2 className="text-2xl font-outfit font-bold text-ink">{baby.宝宝姓名}</h2>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-sm text-muted">{age}</p>
            {relation && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-coral/10 text-coral font-medium">{relation}</span>
            )}
          </div>
          {baby.备注 && (
            <p className="text-xs text-muted/70 mt-2 italic">"{baby.备注}"</p>
          )}
        </div>

        {/* 基本信息 */}
        <div className="card-shadow mb-5 overflow-hidden">
          <div className="px-4 py-3 border-b border-rule/40 bg-cream-dark/30">
            <h3 className="text-sm font-outfit font-bold text-ink">基本信息</h3>
          </div>
          <div className="divide-y divide-rule/30">
            <InfoRow icon={<User size={18} className="text-coral" />} label="性别" value={baby.性别 === '男' ? '👦 男' : '👧 女'} />
            <InfoRow icon={<Calendar size={18} className="text-coral" />} label="出生日期" value={new Date(baby.出生日期).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <InfoRow icon={<Heart size={18} className="text-coral" />} label="年龄" value={age} />
          </div>
        </div>

        {/* 联系人 */}
        <div className="card-shadow mb-5 overflow-hidden">
          <div className="px-4 py-3 border-b border-rule/40 bg-cream-dark/30 flex items-center justify-between">
            <h3 className="text-sm font-outfit font-bold text-ink">联系人</h3>
            {isOwner && (
              <button
                onClick={() => { setShowInviteForm(true); setInviteCode(''); }}
                className="text-xs text-coral font-medium flex items-center gap-1"
              >
                <Plus size={12} />
                邀请家属
              </button>
            )}
          </div>
          <div className="divide-y divide-rule/30">
            {contacts.length > 0 ? contacts.map(c => (
              <div key={c.record_id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-cream-dark/60 flex items-center justify-center flex-shrink-0">
                  <Users size={16} className="text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink">{c.accountName || '待领取'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-coral/10 text-coral">{c.relation}</span>
                    {c.role === 'owner' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">创建者</span>
                    ) : isOwner ? (
                      <button
                        onClick={() => handleUpdateContactRole(c)}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                          c.role === 'editor' ? 'bg-coral/10 text-coral hover:bg-coral/20' : 'bg-cream-dark text-muted hover:bg-rule/50'
                        }`}
                      >
                        {c.role === 'editor' ? '可编辑' : '仅浏览'} ✎
                      </button>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream-dark text-muted">{c.role === 'editor' ? '可编辑' : '仅浏览'}</span>
                    )}
                  </div>
                  {c.isPending && c.inviteCode && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <code className="text-xs text-coral bg-coral/5 px-1.5 py-0.5 rounded">{c.inviteCode}</code>
                      <button onClick={() => copyCode(c.inviteCode)} className="text-muted hover:text-ink">
                        <Copy size={12} />
                      </button>
                    </div>
                  )}
                  {c.lastLoginTime && (
                    <div className="text-[10px] text-muted/50 mt-0.5">
                      最后登录: {new Date(c.lastLoginTime).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </div>
                  )}
                </div>
                {isOwner && c.role !== 'owner' && (
                  <>
                    <button
                      onClick={() => { setEditingContact(c); setEditRelation(c.relation); setEditRole(c.role); }}
                      className="p-1.5 rounded-lg hover:bg-coral/10 text-muted hover:text-coral transition-colors"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => setRemoveTarget(c)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            )) : (
              <div className="px-4 py-6 text-center text-sm text-muted">
                暂无联系人
              </div>
            )}
          </div>

          {/* 邀请家属表单 */}
          {showInviteForm && (
            <div className="px-4 py-4 border-t border-rule/30 bg-cream-light/30 space-y-3">
              <h4 className="text-sm font-outfit font-bold text-ink">邀请家属</h4>
              <div>
                <label className="block text-xs text-muted mb-1">与宝宝的关系</label>
                <div className="flex flex-wrap gap-1.5">
                  {RELATION_OPTIONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setInviteRelation(r)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        inviteRelation === r ? 'bg-coral text-white' : 'bg-cream-dark text-muted hover:text-ink'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">权限</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setInviteRole('editor')}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      inviteRole === 'editor' ? 'bg-coral text-white' : 'bg-cream-dark text-muted'
                    }`}
                  >
                    可编辑
                  </button>
                  <button
                    onClick={() => setInviteRole('viewer')}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      inviteRole === 'viewer' ? 'bg-coral text-white' : 'bg-cream-dark text-muted'
                    }`}
                  >
                    仅浏览
                  </button>
                </div>
              </div>
              {inviteCode ? (
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-600 mb-1">邀请码已生成，请分享给家属</p>
                  <code className="text-lg font-bold text-green-700">{inviteCode}</code>
                  <button
                    onClick={() => copyCode(inviteCode)}
                    className="ml-2 text-green-600 hover:text-green-800"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCreateInvite}
                  className="btn-primary w-full py-2 text-sm"
                >
                  生成邀请码
                </button>
              )}
              <button
                onClick={() => setShowInviteForm(false)}
                className="w-full text-center text-xs text-muted py-1"
              >
                关闭
              </button>
            </div>
          )}
        </div>

        {/* 输入邀请码 */}
        <div className="card-shadow mb-5 overflow-hidden">
          <div className="px-4 py-3 border-b border-rule/40 bg-cream-dark/30">
            <h3 className="text-sm font-outfit font-bold text-ink">使用邀请码</h3>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-muted mb-2">输入收到的邀请码，关联到新的宝宝</p>
            <InviteCodeInput onRedeem={() => { loadContacts(); }} />
          </div>
        </div>
      </div>

      {/* 编辑联系人弹窗 */}
      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingContact(null)}>
          <div className="w-full max-w-sm bg-cream-light rounded-2xl p-5 mx-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-outfit font-bold text-ink">编辑联系人</h3>
              <button onClick={() => setEditingContact(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark">
                <span className="text-muted text-lg">×</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-muted mb-1">与宝宝的关系</label>
                <div className="flex flex-wrap gap-1.5">
                  {RELATION_OPTIONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setEditRelation(r)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        editRelation === r ? 'bg-coral text-white' : 'bg-cream-dark text-muted hover:text-ink'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">权限</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setEditRole('editor')}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      editRole === 'editor' ? 'bg-coral text-white' : 'bg-cream-dark text-muted'
                    }`}
                  >
                    可编辑
                  </button>
                  <button
                    onClick={() => setEditRole('viewer')}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      editRole === 'viewer' ? 'bg-coral text-white' : 'bg-cream-dark text-muted'
                    }`}
                  >
                    仅浏览
                  </button>
                </div>
              </div>
              <button
                onClick={handleSaveEditContact}
                className="btn-primary w-full py-2 text-sm"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除联系人确认 */}
      {removeTarget && (
        <ConfirmDialog
          title="移除联系人"
          message={`确定移除${removeTarget.accountName ? ` "${removeTarget.accountName}" ` : '该待领取邀请'}？`}
          confirmText="移除"
          onConfirm={() => handleRemoveContact(removeTarget)}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

function InviteCodeInput({ onRedeem }: { onRedeem: () => void }) {
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
      setResult({ ok: true, msg: '关联成功！' });
      setCode('');
      onRedeem();
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

function InfoRow({ icon, label, value, empty }: { icon: React.ReactNode; label: string; value: string; empty?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-cream-dark/60 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <span className="text-sm text-muted w-16">{label}</span>
      <span className={`text-sm flex-1 text-right ${empty ? 'text-muted/40 italic' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
