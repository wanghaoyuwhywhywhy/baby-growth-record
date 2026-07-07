import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import NavHeader from '@/components/NavHeader';
import CalendarPicker from '@/components/CalendarPicker';
import { feishuAPI, type VaccineRecord } from '@/api/feishu';
import { isEditMode } from '@/lib/auth';
import { Plus, X, Search, Calendar } from 'lucide-react';

// 免费疫苗（免疫规划）— 2025版国家免疫规划
const FREE_VACCINES = [
  { 疫苗名称: '卡介苗', 剂次: 1, 总剂次: 1, 费用类型: '免费' as const, 月龄: '刚出生' },
  { 疫苗名称: '乙肝疫苗', 剂次: 1, 总剂次: 3, 费用类型: '免费' as const, 月龄: '刚出生' },
  { 疫苗名称: '乙肝疫苗', 剂次: 2, 总剂次: 3, 费用类型: '免费' as const, 月龄: '1月龄' },
  { 疫苗名称: '脊灰灭活疫苗', 剂次: 1, 总剂次: 4, 费用类型: '免费' as const, 月龄: '2月龄' },
  { 疫苗名称: '百白破疫苗', 剂次: 1, 总剂次: 5, 费用类型: '免费' as const, 月龄: '3月龄' },
  { 疫苗名称: '脊灰减毒疫苗', 剂次: 1, 总剂次: 3, 费用类型: '免费' as const, 月龄: '3月龄' },
  { 疫苗名称: '百白破疫苗', 剂次: 2, 总剂次: 5, 费用类型: '免费' as const, 月龄: '4月龄' },
  { 疫苗名称: '脊灰减毒疫苗', 剂次: 2, 总剂次: 3, 费用类型: '免费' as const, 月龄: '4月龄' },
  { 疫苗名称: '百白破疫苗', 剂次: 3, 总剂次: 5, 费用类型: '免费' as const, 月龄: '5月龄' },
  { 疫苗名称: '乙肝疫苗', 剂次: 3, 总剂次: 3, 费用类型: '免费' as const, 月龄: '6月龄' },
  { 疫苗名称: 'A群流脑疫苗', 剂次: 1, 总剂次: 2, 费用类型: '免费' as const, 月龄: '6月龄' },
  { 疫苗名称: '麻腮风疫苗', 剂次: 1, 总剂次: 2, 费用类型: '免费' as const, 月龄: '8月龄' },
  { 疫苗名称: '乙脑减毒疫苗', 剂次: 1, 总剂次: 2, 费用类型: '免费' as const, 月龄: '8月龄' },
  { 疫苗名称: 'A群流脑疫苗', 剂次: 2, 总剂次: 2, 费用类型: '免费' as const, 月龄: '9月龄' },
  { 疫苗名称: '百白破疫苗', 剂次: 4, 总剂次: 5, 费用类型: '免费' as const, 月龄: '18月龄' },
  { 疫苗名称: '麻腮风疫苗', 剂次: 2, 总剂次: 2, 费用类型: '免费' as const, 月龄: '18月龄' },
  { 疫苗名称: '脊灰灭活疫苗', 剂次: 2, 总剂次: 4, 费用类型: '免费' as const, 月龄: '18月龄' },
  { 疫苗名称: '甲肝减毒疫苗', 剂次: 1, 总剂次: 1, 费用类型: '免费' as const, 月龄: '18月龄' },
  { 疫苗名称: '乙脑减毒疫苗', 剂次: 2, 总剂次: 2, 费用类型: '免费' as const, 月龄: '2周岁' },
  { 疫苗名称: 'A+C群流脑疫苗', 剂次: 1, 总剂次: 2, 费用类型: '免费' as const, 月龄: '3周岁' },
  { 疫苗名称: '脊灰灭活疫苗', 剂次: 3, 总剂次: 4, 费用类型: '免费' as const, 月龄: '4周岁' },
  { 疫苗名称: '脊灰灭活疫苗', 剂次: 4, 总剂次: 4, 费用类型: '免费' as const, 月龄: '4周岁' },
  { 疫苗名称: '白破疫苗', 剂次: 1, 总剂次: 1, 费用类型: '免费' as const, 月龄: '6周岁' },
  { 疫苗名称: '百白破疫苗', 剂次: 5, 总剂次: 5, 费用类型: '免费' as const, 月龄: '6周岁' },
  { 疫苗名称: 'A+C群流脑疫苗', 剂次: 2, 总剂次: 2, 费用类型: '免费' as const, 月龄: '6周岁' },
];

const PAID_VACCINES = [
  { 疫苗名称: '13价肺炎疫苗', 剂次: 1, 总剂次: 4, 费用类型: '自费' as const, 月龄: '2月龄' },
  { 疫苗名称: '13价肺炎疫苗', 剂次: 2, 总剂次: 4, 费用类型: '自费' as const, 月龄: '4月龄' },
  { 疫苗名称: '13价肺炎疫苗', 剂次: 3, 总剂次: 4, 费用类型: '自费' as const, 月龄: '6月龄' },
  { 疫苗名称: '13价肺炎疫苗', 剂次: 4, 总剂次: 4, 费用类型: '自费' as const, 月龄: '18月龄' },
  { 疫苗名称: '五联疫苗', 剂次: 1, 总剂次: 4, 费用类型: '自费' as const, 月龄: '2月龄' },
  { 疫苗名称: '五联疫苗', 剂次: 2, 总剂次: 4, 费用类型: '自费' as const, 月龄: '3月龄' },
  { 疫苗名称: '五联疫苗', 剂次: 3, 总剂次: 4, 费用类型: '自费' as const, 月龄: '4月龄' },
  { 疫苗名称: '五联疫苗', 剂次: 4, 总剂次: 4, 费用类型: '自费' as const, 月龄: '18月龄' },
  { 疫苗名称: '轮状病毒疫苗', 剂次: 1, 总剂次: 3, 费用类型: '自费' as const, 月龄: '2月龄' },
  { 疫苗名称: '轮状病毒疫苗', 剂次: 2, 总剂次: 3, 费用类型: '自费' as const, 月龄: '4月龄' },
  { 疫苗名称: '轮状病毒疫苗', 剂次: 3, 总剂次: 3, 费用类型: '自费' as const, 月龄: '6月龄' },
  { 疫苗名称: 'Hib疫苗', 剂次: 1, 总剂次: 4, 费用类型: '自费' as const, 月龄: '2月龄' },
  { 疫苗名称: 'Hib疫苗', 剂次: 2, 总剂次: 4, 费用类型: '自费' as const, 月龄: '4月龄' },
  { 疫苗名称: 'Hib疫苗', 剂次: 3, 总剂次: 4, 费用类型: '自费' as const, 月龄: '6月龄' },
  { 疫苗名称: 'Hib疫苗', 剂次: 4, 总剂次: 4, 费用类型: '自费' as const, 月龄: '18月龄' },
  { 疫苗名称: 'EV71手足口疫苗', 剂次: 1, 总剂次: 2, 费用类型: '自费' as const, 月龄: '6月龄' },
  { 疫苗名称: 'EV71手足口疫苗', 剂次: 2, 总剂次: 2, 费用类型: '自费' as const, 月龄: '7月龄' },
  { 疫苗名称: '水痘疫苗', 剂次: 1, 总剂次: 2, 费用类型: '自费' as const, 月龄: '12月龄' },
  { 疫苗名称: '水痘疫苗', 剂次: 2, 总剂次: 2, 费用类型: '自费' as const, 月龄: '4周岁' },
  { 疫苗名称: '流感疫苗', 剂次: 1, 总剂次: 1, 费用类型: '自费' as const, 月龄: '6月龄' },
  { 疫苗名称: '23价肺炎疫苗', 剂次: 1, 总剂次: 1, 费用类型: '自费' as const, 月龄: '2周岁' },
  { 疫苗名称: '甲肝灭活疫苗', 剂次: 1, 总剂次: 2, 费用类型: '自费' as const, 月龄: '18月龄' },
  { 疫苗名称: '甲肝灭活疫苗', 剂次: 2, 总剂次: 2, 费用类型: '自费' as const, 月龄: '2周岁' },
  { 疫苗名称: '四联疫苗', 剂次: 1, 总剂次: 4, 费用类型: '自费' as const, 月龄: '3月龄' },
  { 疫苗名称: '四联疫苗', 剂次: 2, 总剂次: 4, 费用类型: '自费' as const, 月龄: '4月龄' },
  { 疫苗名称: '四联疫苗', 剂次: 3, 总剂次: 4, 费用类型: '自费' as const, 月龄: '5月龄' },
  { 疫苗名称: '四联疫苗', 剂次: 4, 总剂次: 4, 费用类型: '自费' as const, 月龄: '18月龄' },
  { 疫苗名称: 'AC结合疫苗', 剂次: 1, 总剂次: 2, 费用类型: '自费' as const, 月龄: '6月龄' },
  { 疫苗名称: 'AC结合疫苗', 剂次: 2, 总剂次: 2, 费用类型: '自费' as const, 月龄: '9月龄' },
];

const ALL_VACCINES = [...FREE_VACCINES, ...PAID_VACCINES];
const DEFAULT_VACCINES = FREE_VACCINES;

// 根据日期差计算月龄标签（2周岁前以月龄展示，2周岁后以周岁展示）
function calcAgeLabel(birthDate: string, targetDate: string): string {
  const birth = new Date(birthDate);
  const target = new Date(targetDate);
  let years = target.getFullYear() - birth.getFullYear();
  let months = target.getMonth() - birth.getMonth();
  let days = target.getDate() - birth.getDate();
  if (days < 0) months--;
  if (months < 0) { years--; months += 12; }
  const totalMonths = years * 12 + months;

  if (totalMonths <= 0 && days <= 0) return '刚出生';
  if (totalMonths === 0) return '刚出生';
  if (totalMonths < 24) return `${totalMonths}月龄`;
  return `${years}周岁`;
}

// 标准月龄的排序值
function ageSortKey(label: string): number {
  if (label === '刚出生') return 0;
  const mMatch = label.match(/^(\d+)月龄$/);
  if (mMatch) return parseInt(mMatch[1]);
  const yMatch = label.match(/^(\d+)周岁$/);
  if (yMatch) return parseInt(yMatch[1]) * 12;
  return 999;
}

function calcExpectedDate(birthDate: string, 月龄: string): string {
  const birth = new Date(birthDate);
  if (月龄 === '刚出生') return birthDate;
  const match = 月龄.match(/^(\d+)(月龄|周岁|月)$/);
  if (!match) return birthDate;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const result = new Date(birth);
  if (unit === '月龄' || unit === '月') result.setMonth(result.getMonth() + num);
  else if (unit === '周岁') result.setFullYear(result.getFullYear() + num);
  return result.toISOString().split('T')[0];
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type VaccineTemplate = typeof ALL_VACCINES[number];

export default function VaccinePage() {
  const currentBaby = useAppStore((s) => s.currentBaby);
  const vaccines = useAppStore((s) => s.vaccines);
  const fetchVaccines = useAppStore((s) => s.fetchVaccines);
  const updateVaccineStatus = useAppStore((s) => s.updateVaccineStatus);
  const updateVaccineExpectedDate = useAppStore((s) => s.updateVaccineExpectedDate);
  const updateVaccineVaccinateDate = useAppStore((s) => s.updateVaccineVaccinateDate);

  const baby = currentBaby();
  const canEdit = isEditMode();

  // 日历弹窗状态
  const [calendarTarget, setCalendarTarget] = useState<{ id: string; type: 'vaccinate' | 'vaccinateDate' | 'expected'; currentDate: string } | null>(null);

  // 添加疫苗弹窗
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addFilter, setAddFilter] = useState<'全部' | '免费' | '自费'>('全部');
  const [adding, setAdding] = useState(false);

  const birthDate = baby?.出生日期 || '';

  // 进入页面时后台刷新（不阻塞渲染，数据已在 store 中）
  useEffect(() => {
    if (baby?.record_id) fetchVaccines();
  }, [baby?.record_id, fetchVaccines]);

  // 动态计算每条记录的月龄标签 + 分组
  const grouped = useMemo(() => {
    if (!birthDate) return [];

    // 每条记录计算动态月龄
    const withAge = vaccines.map((v) => {
      let ageLabel: string;
      if (v.接种状态 === '已接种' && v.接种时间) {
        ageLabel = calcAgeLabel(birthDate, v.接种时间);
      } else if (v.预计接种时间) {
        ageLabel = calcAgeLabel(birthDate, v.预计接种时间);
      } else {
        ageLabel = v.月龄 || '未知';
      }
      return { ...v, _ageLabel: ageLabel, _ageSort: ageSortKey(ageLabel) };
    });

    // 按月龄排序
    withAge.sort((a, b) => a._ageSort - b._ageSort);

    // 分组
    const groups: Record<string, VaccineRecord[]> = {};
    const ageOrder: string[] = [];
    for (const v of withAge) {
      if (!groups[v._ageLabel]) { groups[v._ageLabel] = []; ageOrder.push(v._ageLabel); }
      groups[v._ageLabel].push(v);
    }
    return ageOrder.map((age) => ({ 月龄: age, records: groups[age] }));
  }, [vaccines, birthDate]);

  const existingKeys = useMemo(() => new Set(vaccines.map((v) => `${v.疫苗名称}_${v.剂次}`)), [vaccines]);

  const availableVaccines = useMemo(() => {
    let list = ALL_VACCINES.filter((v) => !existingKeys.has(`${v.疫苗名称}_${v.剂次}`));
    if (addFilter !== '全部') list = list.filter((v) => v.费用类型 === addFilter);
    if (addSearch.trim()) { const q = addSearch.trim().toLowerCase(); list = list.filter((v) => v.疫苗名称.toLowerCase().includes(q)); }
    return list;
  }, [existingKeys, addFilter, addSearch]);

  const groupedAvailable = useMemo(() => {
    const groups: Record<string, VaccineTemplate[]> = {};
    for (const v of availableVaccines) { if (!groups[v.疫苗名称]) groups[v.疫苗名称] = []; groups[v.疫苗名称].push(v); }
    return Object.entries(groups).sort((a, b) => ageSortKey(a[1][0].月龄) - ageSortKey(b[1][0].月龄));
  }, [availableVaccines]);

  function handleVaccinate(recordId: string, date: string) {
    setCalendarTarget(null);
    updateVaccineStatus(recordId, new Date(date).toISOString());
  }

  function handleUpdateVaccinateDate(recordId: string, date: string) {
    setCalendarTarget(null);
    updateVaccineVaccinateDate(recordId, new Date(date).toISOString());
  }

  function handleUpdateExpected(recordId: string, date: string) {
    setCalendarTarget(null);
    updateVaccineExpectedDate(recordId, new Date(date).toISOString());
  }

  async function handleAddVaccine(template: VaccineTemplate) {
    if (!baby?.record_id || !birthDate || adding) return;
    setAdding(true);
    try {
      await feishuAPI.createVaccine({ 疫苗名称: template.疫苗名称, 剂次: template.剂次, 总剂次: template.总剂次, 费用类型: template.费用类型, 月龄: template.月龄, 预计接种时间: calcExpectedDate(birthDate, template.月龄), 接种状态: '未接种', 关联宝宝: [baby.record_id] });
      await fetchVaccines();
    } catch (e) { console.error('添加疫苗失败', e); }
    setAdding(false);
  }

  async function handleAddAllByGroup(group: VaccineTemplate[]) {
    if (!baby?.record_id || !birthDate || adding) return;
    setAdding(true);
    try {
      const promises = group.map((v) => feishuAPI.createVaccine({ 疫苗名称: v.疫苗名称, 剂次: v.剂次, 总剂次: v.总剂次, 费用类型: v.费用类型, 月龄: v.月龄, 预计接种时间: calcExpectedDate(birthDate, v.月龄), 接种状态: '未接种', 关联宝宝: [baby.record_id] }));
      await Promise.allSettled(promises);
      await fetchVaccines();
    } catch (e) { console.error('批量添加疫苗失败', e); }
    setAdding(false);
  }

  if (!baby) {
    return (<div className="page-container"><NavHeader title="疫苗接种" showBack /><div className="mt-20 text-center text-muted text-sm">请先添加宝宝</div></div>);
  }

  return (
    <div className="page-container">
      <NavHeader
        title="疫苗接种"
        showBack
        titleAction={
          canEdit ? (
            <button onClick={() => { setShowAddModal(true); setAddSearch(''); setAddFilter('全部'); }}
              className="ml-2 flex items-center gap-0.5 text-coral text-[11px] font-outfit font-bold border border-dashed border-coral/50 rounded-md px-1.5 py-0.5 hover:bg-coral/5 transition-colors active:scale-95">
              <Plus size={11} /> 添加疫苗
            </button>
          ) : null
        }
      />

      <div className="mt-4">
        {grouped.length === 0 ? (
          <div className="py-16 text-center"><p className="text-4xl mb-2">💉</p><p className="text-sm text-muted">暂无疫苗记录</p></div>
        ) : (
          grouped.map((group, gIdx) => (
            <div key={group.月龄} className="mb-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex flex-col items-center">
                  <div className="w-3.5 h-3.5 rounded-full bg-coral flex-shrink-0" />
                  {gIdx < grouped.length - 1 && <div className="w-0.5 h-6 bg-coral/30 mt-1" />}
                </div>
                <h3 className="text-sm font-outfit font-bold text-ink">{group.月龄}</h3>
              </div>
              <div className="ml-1.5 pl-5 border-l-2 border-coral/20 space-y-2.5">
                {group.records.map((v) => (
                  <VaccineCard
                    key={v.record_id}
                    vaccine={v}
                    canEdit={canEdit}
                    onVaccinate={() => setCalendarTarget({ id: v.record_id, type: 'vaccinate', currentDate: new Date().toISOString().split('T')[0] })}
                    onEditExpected={() => setCalendarTarget({ id: v.record_id, type: 'expected', currentDate: v.预计接种时间 })}
                    onEditVaccinateDate={() => setCalendarTarget({ id: v.record_id, type: 'vaccinateDate', currentDate: v.接种时间 ?? new Date().toISOString().split('T')[0] })}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-coral/70 text-center mt-6 mb-4 px-4">疫苗信息仅供参考，接种安排请以当地卫生部门指导为准</p>
      </div>

      {/* 日历选择弹窗 */}
      {calendarTarget && (
        <CalendarPicker
          initialDate={calendarTarget.currentDate}
          title={calendarTarget.type === 'vaccinate' ? '选择接种日期' : calendarTarget.type === 'vaccinateDate' ? '修改接种时间' : '修改预计接种时间'}
          onConfirm={(date1) => {
            if (calendarTarget.type === 'vaccinate') handleVaccinate(calendarTarget.id, date1);
            else if (calendarTarget.type === 'vaccinateDate') handleUpdateVaccinateDate(calendarTarget.id, date1);
            else handleUpdateExpected(calendarTarget.id, date1);
          }}
          onClose={() => setCalendarTarget(null)}
        />
      )}

      {/* 添加疫苗弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-lg bg-cream-light rounded-t-3xl h-[75vh] flex flex-col animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-rule/20">
              <h3 className="text-base font-outfit font-bold text-ink">添加疫苗</h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"><X size={18} className="text-muted" /></button>
            </div>
            <div className="px-5 py-3 space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input type="text" value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="搜索疫苗名称"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-cream-dark text-sm text-ink placeholder-muted outline-none focus:ring-2 focus:ring-coral/30" />
              </div>
              <div className="flex gap-2">
                {(['全部', '免费', '自费'] as const).map((f) => (
                  <button key={f} onClick={() => setAddFilter(f)}
                    className={`text-xs rounded-full px-3 py-1.5 transition-colors ${addFilter === f ? 'bg-coral text-white' : 'bg-cream-dark text-muted hover:bg-cream-dark/80'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-8">
              {groupedAvailable.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">{addSearch ? '未找到匹配的疫苗' : '所有疫苗已添加'}</div>
              ) : (
                groupedAvailable.map(([name, items]) => (
                  <div key={name} className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-outfit font-bold text-ink">{name}</span>
                        <span className={`text-xs rounded-full px-1.5 py-0.5 ${items[0].费用类型 === '自费' ? 'bg-coral/15 text-coral' : 'bg-cream-dark text-muted'}`}>{items[0].费用类型}</span>
                      </div>
                      <button onClick={() => handleAddAllByGroup(items)} disabled={adding} className="text-xs text-coral font-medium flex items-center gap-1 hover:text-coral-dark transition-colors disabled:opacity-50">
                        <Plus size={14} /> 全部添加
                      </button>
                    </div>
                    <div className="space-y-1">
                      {items.map((v, i) => (
                        <button key={i} onClick={() => handleAddVaccine(v)} disabled={adding}
                          className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-cream-dark/60 transition-colors disabled:opacity-50 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted">第{v.剂次}/{v.总剂次}针</span>
                            <span className="text-xs text-muted">{v.月龄}</span>
                          </div>
                          <Plus size={14} className="text-coral/60" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VaccineCard({
  vaccine,
  canEdit,
  onVaccinate,
  onEditExpected,
  onEditVaccinateDate,
}: {
  vaccine: VaccineRecord;
  canEdit: boolean;
  onVaccinate: () => void;
  onEditExpected: () => void;
  onEditVaccinateDate: () => void;
}) {
  const isVaccinated = vaccine.接种状态 === '已接种';
  const isPaid = vaccine.费用类型 === '自费';

  return (
    <div className="card-shadow p-3.5 animate-fade-up">
      {/* 第一行：疫苗名称 + 剂次 + 费用 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-outfit font-bold text-ink flex-1">{vaccine.疫苗名称}</span>
        <span className="text-xs bg-cream-dark text-muted rounded-full px-2 py-0.5">第{vaccine.剂次}/{vaccine.总剂次}针</span>
        <span className={`text-xs rounded-full px-2 py-0.5 ${isPaid ? 'bg-coral/15 text-coral' : 'bg-cream-dark text-muted'}`}>{vaccine.费用类型}</span>
      </div>

      {/* 第二行：时间 + 状态 */}
      <div className="flex items-center justify-between">
        {isVaccinated ? (
          canEdit ? (
            <button onClick={onEditVaccinateDate} className="text-xs text-muted hover:text-coral transition-colors flex items-center gap-1">
              <Calendar size={12} className="text-coral/60" />
              接种时间: {formatDateShort(vaccine.接种时间 || vaccine.预计接种时间)}
            </button>
          ) : (
            <span className="text-xs text-muted">
              接种时间: {formatDateShort(vaccine.接种时间 || vaccine.预计接种时间)}
            </span>
          )
        ) : (
          canEdit ? (
            <button onClick={onEditExpected} className="text-xs text-muted hover:text-coral transition-colors flex items-center gap-1">
              <Calendar size={12} className="text-coral/60" />
              预计接种时间: {formatDateShort(vaccine.预计接种时间)}
            </button>
          ) : (
            <span className="text-xs text-muted">
              预计接种时间: {formatDateShort(vaccine.预计接种时间)}
            </span>
          )
        )}

        {isVaccinated ? (
          <span className="text-xs text-muted">已接种</span>
        ) : (
          canEdit ? (
            <button onClick={onVaccinate}
              className="text-xs border border-coral text-coral rounded-full px-3 py-1 hover:bg-coral/5 transition-colors">
              未接种
            </button>
          ) : (
            <span className="text-xs text-muted">未接种</span>
          )
        )}
      </div>
    </div>
  );
}
