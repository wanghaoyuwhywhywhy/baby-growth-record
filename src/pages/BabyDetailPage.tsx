import { useAppStore } from '@/store/useAppStore';
import { useNavigate } from 'react-router-dom';
import NavHeader from '@/components/NavHeader';
import { calcAge } from '@/utils/date';
import { Edit3, User, Calendar, Heart } from 'lucide-react';

export default function BabyDetailPage() {
  const { currentBaby } = useAppStore();
  const navigate = useNavigate();
  const baby = currentBaby();

  if (!baby) {
    return (
      <div className="page-container">
        <NavHeader title="宝宝档案" showBack />
        <div className="mt-20 text-center text-muted text-sm">暂无宝宝信息</div>
      </div>
    );
  }

  const age = calcAge(baby.出生日期);

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
