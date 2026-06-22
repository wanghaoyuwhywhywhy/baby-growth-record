import { useAppStore } from '@/store/useAppStore';
import { useNavigate } from 'react-router-dom';
import NavHeader from '@/components/NavHeader';
import { calcAge } from '@/utils/date';
import { Edit3, Trash2, User, Calendar, Heart } from 'lucide-react';
import { useState } from 'react';

export default function BabyDetailPage() {
  const { currentBaby, deleteBaby, babies, switchBaby } = useAppStore();
  const navigate = useNavigate();
  const baby = currentBaby();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!baby) {
    return (
      <div className="page-container">
        <NavHeader title="宝宝档案" showBack />
        <div className="mt-20 text-center text-muted text-sm">暂无宝宝信息</div>
      </div>
    );
  }

  const age = calcAge(baby.出生日期);

  async function handleDelete() {
    if (!baby) return;
    await deleteBaby(baby.record_id);
    if (babies.length <= 1) {
      navigate('/baby/edit');
    } else {
      navigate('/');
    }
  }

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
          <p className="text-sm text-muted mt-1">{age}</p>
          {baby.备注 && (
            <p className="text-xs text-muted/70 mt-2 italic">"{baby.备注}"</p>
          )}
        </div>

        {/* 详细信息 */}
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

        {/* 爸爸妈妈信息 */}
        <div className="card-shadow mb-5 overflow-hidden">
          <div className="px-4 py-3 border-b border-rule/40 bg-cream-dark/30">
            <h3 className="text-sm font-outfit font-bold text-ink">爸爸妈妈</h3>
          </div>
          <div className="divide-y divide-rule/30">
            <InfoRow
              icon={<span className="text-lg">👩</span>}
              label="妈妈"
              value={baby.妈妈名字 || '未填写'}
              empty={!baby.妈妈名字}
            />
            <InfoRow
              icon={<span className="text-lg">👨</span>}
              label="爸爸"
              value={baby.爸爸名字 || '未填写'}
              empty={!baby.爸爸名字}
            />
          </div>
        </div>

        {/* 多宝宝切换 */}
        {babies.length > 1 && (
          <div className="card-shadow mb-5 overflow-hidden">
            <div className="px-4 py-3 border-b border-rule/40 bg-cream-dark/30">
              <h3 className="text-sm font-outfit font-bold text-ink">切换宝宝</h3>
            </div>
            <div className="divide-y divide-rule/30">
              {babies.map((b) => (
                <button
                  key={b.record_id}
                  onClick={() => {
                    switchBaby(b.record_id);
                    navigate('/');
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-cream-dark/40 transition-colors ${
                    b.record_id === baby.record_id ? 'bg-coral/5' : ''
                  }`}
                >
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-coral to-warm-orange text-white text-sm flex items-center justify-center font-bold">
                    {b.宝宝姓名.charAt(0)}
                  </span>
                  <span className={`flex-1 text-left text-sm ${b.record_id === baby.record_id ? 'text-coral font-medium' : 'text-ink'}`}>
                    {b.宝宝姓名}
                  </span>
                  {b.record_id === baby.record_id && <span className="text-xs text-coral">当前</span>}
                </button>
              ))}
              <button
                onClick={() => navigate('/baby/edit')}
                className="w-full flex items-center gap-3 px-4 py-3 text-muted hover:bg-cream-dark/40 transition-colors"
              >
                <span className="w-9 h-9 rounded-full border-2 border-dashed border-rule flex items-center justify-center text-lg">+</span>
                <span className="text-sm">添加新宝宝</span>
              </button>
            </div>
          </div>
        )}

        {/* 删除按钮 */}
        <div className="mt-8">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-coral-dark border border-coral/30 rounded-btn hover:bg-coral/5 transition-colors"
            >
              <Trash2 size={16} />
              删除宝宝档案
            </button>
          ) : (
            <div className="card-shadow p-4 border-coral/30">
              <p className="text-sm text-ink mb-3 text-center">确认删除"{baby.宝宝姓名}"的档案吗？相关记录将保留但不再关联。</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 btn-secondary py-2.5 text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 bg-coral text-white py-2.5 rounded-btn text-sm font-medium hover:bg-coral-dark transition-colors"
                >
                  确认删除
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
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
