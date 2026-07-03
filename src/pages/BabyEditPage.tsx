import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import NavHeader from '@/components/NavHeader';
import CalendarPicker from '@/components/CalendarPicker';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Check, Calendar, Trash2 } from 'lucide-react';
import { getAuthBabyRelations, getAuthBabyLinkRoles } from '@/lib/auth';

const RELATION_OPTIONS = ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '姑姑', '叔叔', '舅舅', '阿姨', '其他'];

export default function BabyEditPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const isEdit = !!editId;

  const { babies, addBaby, updateBaby, deleteBaby } = useAppStore();
  const editingBaby = isEdit ? babies.find((b) => b.record_id === editId) : null;

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'男' | '女'>('男');
  const [relation, setRelation] = useState('其他');
  const [momName, setMomName] = useState('');
  const [dadName, setDadName] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showBirthPicker, setShowBirthPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 判断是否为宝宝拥有者（linkRole 为 owner）
  const linkRoles = getAuthBabyLinkRoles();
  const isOwner = isEdit && editId ? linkRoles[editId] === 'owner' : true;

  useEffect(() => {
    if (editingBaby) {
      setName(editingBaby.宝宝姓名);
      setBirthDate(editingBaby.出生日期);
      setGender(editingBaby.性别 as '男' | '女');
      setMomName(editingBaby.妈妈名字 || '');
      setDadName(editingBaby.爸爸名字 || '');
      setRemark(editingBaby.备注 || '');
      // 从 auth 中获取关系
      const relations = getAuthBabyRelations();
      if (editingBaby.record_id && relations[editingBaby.record_id]) {
        setRelation(relations[editingBaby.record_id]);
      }
    }
  }, [editingBaby]);

  const canSubmit = name.trim().length > 0 && birthDate && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const data = {
        宝宝姓名: name.trim(),
        出生日期: birthDate,
        性别: gender,
        关系: relation,
        妈妈名字: momName.trim() || undefined,
        爸爸名字: dadName.trim() || undefined,
        备注: remark.trim() || undefined,
      };
      if (isEdit && editId) {
        await updateBaby(editId, data);
      } else {
        await addBaby(data);
      }
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => navigate(-1), 600);
    } catch (e) {
      setSubmitting(false);
      alert(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function handleDeleteBaby() {
    if (!editId) return;
    try {
      await deleteBaby(editId);
      navigate('/');
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  }

  if (success) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="text-center animate-pop">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center mx-auto mb-5 shadow-float">
            <Check size={40} className="text-white" strokeWidth={2.5} />
          </div>
          <h2 className="text-xl font-outfit font-bold text-ink mb-2">{isEdit ? '保存成功！' : '添加成功！'}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container flex flex-col">
      <NavHeader title={isEdit ? '编辑宝宝' : '添加宝宝'} showBack />

      <div className="flex-1 mt-6 space-y-5">
        {/* 头像预览 */}
        <div className="flex justify-center mb-2">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-coral to-warm-orange flex items-center justify-center text-white text-3xl font-outfit font-bold shadow-float">
            {name.charAt(0) || '?'}
          </div>
        </div>

        <Field label="宝宝姓名" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="给宝宝起个名字"
            maxLength={20}
            className="input-field"
            autoFocus
          />
        </Field>

        <Field label="出生日期" required>
          <button
            type="button"
            onClick={() => setShowBirthPicker(true)}
            className="input-field text-left flex items-center gap-2"
          >
            <Calendar size={16} className="text-coral/60" />
            <span className={birthDate ? 'text-ink' : 'text-muted'}>
              {birthDate || '请选择出生日期'}
            </span>
          </button>
        </Field>

        <Field label="性别">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setGender('男')}
              className={`flex-1 py-3 rounded-btn border-2 transition-all ${
                gender === '男'
                  ? 'border-skyblue bg-skyblue/10 text-ink'
                  : 'border-rule bg-cream-light text-muted'
              }`}
            >
              <span className="text-xl mr-1">👦</span> 男孩
            </button>
            <button
              type="button"
              onClick={() => setGender('女')}
              className={`flex-1 py-3 rounded-btn border-2 transition-all ${
                gender === '女'
                  ? 'border-coral bg-coral/10 text-ink'
                  : 'border-rule bg-cream-light text-muted'
              }`}
            >
              <span className="text-xl mr-1">👧</span> 女孩
            </button>
          </div>
        </Field>

        <Field label="关系">
          <div className="flex flex-wrap gap-2">
            {RELATION_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setRelation(opt)}
                className={`px-3 py-2 rounded-btn border-2 text-sm transition-all ${
                  relation === opt
                    ? 'border-coral bg-coral/10 text-coral font-medium'
                    : 'border-rule bg-cream-light text-muted'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </Field>

        <div className="card-shadow p-4 space-y-4">
          <p className="text-xs font-medium text-muted">爸爸妈妈（选填）</p>
          <Field label="👩 妈妈名字" small>
            <input
              type="text"
              value={momName}
              onChange={(e) => setMomName(e.target.value)}
              placeholder="妈妈的名字"
              maxLength={20}
              className="input-field"
            />
          </Field>
          <Field label="👨 爸爸名字" small>
            <input
              type="text"
              value={dadName}
              onChange={(e) => setDadName(e.target.value)}
              placeholder="爸爸的名字"
              maxLength={20}
              className="input-field"
            />
          </Field>
        </div>

        <Field label="备注（选填）">
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="写点什么吧..."
            maxLength={100}
            rows={3}
            className="input-field resize-none"
          />
        </Field>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary w-full text-base"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          ) : isEdit ? (
            '保存修改'
          ) : (
            '添加宝宝 🎉'
          )}
        </button>

        {isOwner && editId && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full mt-6 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-50 active:scale-[0.98] transition-all"
          >
            <Trash2 size={16} />
            删除宝宝
          </button>
        )}
      </div>

      {/* 出生日期日历选择器 */}
      {showBirthPicker && (
        <CalendarPicker
          initialDate={birthDate || new Date().toISOString().split('T')[0]}
          title="选择出生日期"
          maxDate={new Date().toISOString().split('T')[0]}
          onConfirm={(date1) => { setBirthDate(date1); setShowBirthPicker(false); }}
          onClose={() => setShowBirthPicker(false)}
        />
      )}

      {/* 删除宝宝确认弹窗 */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="删除宝宝"
          message={`确定删除宝宝 "${name}" 吗？删除后所有相关记录将无法恢复。`}
          confirmText="删除"
          onConfirm={handleDeleteBaby}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

function Field({ label, required, small, children }: { label: string; required?: boolean; small?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={`block ${small ? 'text-xs' : 'text-sm'} font-medium text-muted mb-2`}>
        {label}{required && <span className="text-coral ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
