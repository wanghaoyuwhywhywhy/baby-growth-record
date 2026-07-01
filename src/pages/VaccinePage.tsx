import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import NavHeader from '@/components/NavHeader';
import { feishuAPI, type VaccineRecord } from '@/api/feishu';
import { Plus, X, Search } from 'lucide-react';

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
  { 疫苗名称: '白破疫苗', 剂次: 1, 总剂次: 1, 费用类型: '免费' as const, 月龄: '6周岁' },
  { 疫苗名称: '百白破疫苗', 剂次: 5, 总剂次: 5, 费用类型: '免费' as const, 月龄: '6周岁' },
  { 疫苗名称: 'A+C群流脑疫苗', 剂次: 2, 总剂次: 2, 费用类型: '免费' as const, 月龄: '6周岁' },
];

// 自费疫苗（非免疫规划）
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

const AGE_ORDER = ['刚出生', '1月龄', '2月龄', '3月龄', '4月龄', '5月龄', '6月龄', '7月龄', '8月龄', '9月龄', '12月龄', '18月龄', '2周岁', '3周岁', '4周岁', '6周岁'];

function calcExpectedDate(birthDate: string, 月龄: string): string {
  const birth = new Date(birthDate);
  if (月龄 === '刚出生') return birthDate;

  const match = 月龄.match(/^(\d+)(月龄|周岁|月)$/);
  if (!match) return birthDate;

  const num = parseInt(match[1], 10);
  const unit = match[2];

  const result = new Date(birth);
  if (unit === '月龄' || unit === '月') {
    result.setMonth(result.getMonth() + num);
  } else if (unit === '周岁') {
    result.setFullYear(result.getFullYear() + num);
  }
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

  const baby = currentBaby();
  const [loading, setLoading] = useState(true);
  const [vaccinating, setVaccinating] = useState<string | null>(null);
  const [datePickerId, setDatePickerId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // 添加疫苗弹窗
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addFilter, setAddFilter] = useState<'全部' | '免费' | '自费'>('全部');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await fetchVaccines();
      setLoading(false);
    }
    if (baby?.record_id) load();
  }, [baby?.record_id, fetchVaccines]);

  // 首次加载：如果疫苗为空，自动创建默认疫苗记录
  useEffect(() => {
    async function initDefault() {
      if (!baby?.record_id || !baby.出生日期) return;
      if (vaccines.length > 0 || loading) return;

      const promises = DEFAULT_VACCINES.map((v) =>
        feishuAPI.createVaccine({
          疫苗名称: v.疫苗名称,
          剂次: v.剂次,
          总剂次: v.总剂次,
          费用类型: v.费用类型,
          月龄: v.月龄,
          预计接种时间: calcExpectedDate(baby.出生日期, v.月龄),
          接种状态: '未接种',
          关联宝宝: [baby.record_id],
        })
      );

      await Promise.allSettled(promises);
      await fetchVaccines();
    }
    initDefault();
  }, [vaccines.length, loading, baby?.record_id, baby?.出生日期, fetchVaccines]);

  // 按月龄分组排序
  const grouped = useMemo(() => {
    const sorted = [...vaccines].sort((a, b) => {
      const idxA = AGE_ORDER.indexOf(a.月龄);
      const idxB = AGE_ORDER.indexOf(b.月龄);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
    const groups: Record<string, VaccineRecord[]> = {};
    for (const v of sorted) {
      if (!groups[v.月龄]) groups[v.月龄] = [];
      groups[v.月龄].push(v);
    }
    return AGE_ORDER
      .filter((age) => groups[age])
      .map((age) => ({ 月龄: age, records: groups[age] }));
  }, [vaccines]);

  // 已存在的疫苗标识（名称+剂次）用于过滤可选列表
  const existingKeys = useMemo(() => {
    return new Set(vaccines.map((v) => `${v.疫苗名称}_${v.剂次}`));
  }, [vaccines]);

  // 可选疫苗列表（过滤已存在的）
  const availableVaccines = useMemo(() => {
    let list = ALL_VACCINES.filter((v) => !existingKeys.has(`${v.疫苗名称}_${v.剂次}`));
    if (addFilter !== '全部') {
      list = list.filter((v) => v.费用类型 === addFilter);
    }
    if (addSearch.trim()) {
      const q = addSearch.trim().toLowerCase();
      list = list.filter((v) => v.疫苗名称.toLowerCase().includes(q));
    }
    return list;
  }, [existingKeys, addFilter, addSearch]);

  // 按疫苗名称分组（选择弹窗用）
  const groupedAvailable = useMemo(() => {
    const groups: Record<string, VaccineTemplate[]> = {};
    for (const v of availableVaccines) {
      if (!groups[v.疫苗名称]) groups[v.疫苗名称] = [];
      groups[v.疫苗名称].push(v);
    }
    return Object.entries(groups).sort((a, b) => {
      const ageA = AGE_ORDER.indexOf(a[1][0].月龄);
      const ageB = AGE_ORDER.indexOf(b[1][0].月龄);
      return (ageA === -1 ? 999 : ageA) - (ageB === -1 ? 999 : ageB);
    });
  }, [availableVaccines]);

  async function handleVaccinate(recordId: string, date: string) {
    setVaccinating(recordId);
    setDatePickerId(null);
    await updateVaccineStatus(recordId, new Date(date).toISOString());
    setVaccinating(null);
  }

  async function handleAddVaccine(template: VaccineTemplate) {
    if (!baby?.record_id || !baby.出生日期 || adding) return;
    setAdding(true);
    try {
      await feishuAPI.createVaccine({
        疫苗名称: template.疫苗名称,
        剂次: template.剂次,
        总剂次: template.总剂次,
        费用类型: template.费用类型,
        月龄: template.月龄,
        预计接种时间: calcExpectedDate(baby.出生日期, template.月龄),
        接种状态: '未接种',
        关联宝宝: [baby.record_id],
      });
      await fetchVaccines();
    } catch (e) {
      console.error('添加疫苗失败', e);
    }
    setAdding(false);
  }

  async function handleAddAllByGroup(group: VaccineTemplate[]) {
    if (!baby?.record_id || !baby.出生日期 || adding) return;
    setAdding(true);
    try {
      const promises = group.map((v) =>
        feishuAPI.createVaccine({
          疫苗名称: v.疫苗名称,
          剂次: v.剂次,
          总剂次: v.总剂次,
          费用类型: v.费用类型,
          月龄: v.月龄,
          预计接种时间: calcExpectedDate(baby.出生日期, v.月龄),
          接种状态: '未接种',
          关联宝宝: [baby.record_id],
        })
      );
      await Promise.allSettled(promises);
      await fetchVaccines();
    } catch (e) {
      console.error('批量添加疫苗失败', e);
    }
    setAdding(false);
  }

  if (!baby) {
    return (
      <div className="page-container">
        <NavHeader title="疫苗接种" showBack />
        <div className="mt-20 text-center text-muted text-sm">请先添加宝宝</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <NavHeader title="疫苗接种" showBack />

      <div className="mt-4">
        {/* +添加疫苗按钮 */}
        <button
          onClick={() => { setShowAddModal(true); setAddSearch(''); setAddFilter('全部'); }}
          className="w-full card-shadow p-3 mb-4 flex items-center justify-center gap-2 hover:shadow-float transition-all duration-200 active:scale-[0.98] border-2 border-dashed border-coral/40"
        >
          <Plus size={18} className="text-coral" />
          <span className="text-sm font-outfit font-bold text-coral">添加疫苗</span>
        </button>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="w-8 h-8 border-3 border-coral/30 border-t-coral rounded-full animate-spin" />
            <p className="text-sm text-muted">加载中...</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-2">💉</p>
            <p className="text-sm text-muted">暂无疫苗记录</p>
          </div>
        ) : (
          grouped.map((group, gIdx) => (
            <div key={group.月龄} className="mb-5">
              {/* 月龄标题 */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex flex-col items-center">
                  <div className="w-3.5 h-3.5 rounded-full bg-coral flex-shrink-0" />
                  {gIdx < grouped.length - 1 && (
                    <div className="w-0.5 h-6 bg-coral/30 mt-1" />
                  )}
                </div>
                <h3 className="text-sm font-outfit font-bold text-ink">{group.月龄}</h3>
              </div>

              {/* 疫苗卡片列表 */}
              <div className="ml-1.5 pl-5 border-l-2 border-coral/20 space-y-2.5">
                {group.records.map((v) => (
                  <VaccineCard
                    key={v.record_id}
                    vaccine={v}
                    vaccinating={vaccinating === v.record_id}
                    datePickerOpen={datePickerId === v.record_id}
                    selectedDate={selectedDate}
                    onOpenDatePicker={() => {
                      setDatePickerId(datePickerId === v.record_id ? null : v.record_id);
                      setSelectedDate(new Date().toISOString().split('T')[0]);
                    }}
                    onDateChange={setSelectedDate}
                    onConfirmDate={() => handleVaccinate(v.record_id, selectedDate)}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* 免责提示 */}
        <p className="text-xs text-coral/70 text-center mt-6 mb-4 px-4">
          疫苗信息仅供参考，接种安排请以当地卫生部门指导为准
        </p>
      </div>

      {/* 添加疫苗弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowAddModal(false)}>
          <div
            className="w-full max-w-lg bg-cream-light rounded-t-3xl max-h-[85vh] flex flex-col animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-rule/20">
              <h3 className="text-base font-outfit font-bold text-ink">添加疫苗</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors"
              >
                <X size={18} className="text-muted" />
              </button>
            </div>

            {/* 搜索和筛选 */}
            <div className="px-5 py-3 space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="搜索疫苗名称"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-cream-dark text-sm text-ink placeholder-muted outline-none focus:ring-2 focus:ring-coral/30"
                />
              </div>
              <div className="flex gap-2">
                {(['全部', '免费', '自费'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setAddFilter(f)}
                    className={`text-xs rounded-full px-3 py-1.5 transition-colors ${
                      addFilter === f
                        ? 'bg-coral text-white'
                        : 'bg-cream-dark text-muted hover:bg-cream-dark/80'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* 疫苗列表 */}
            <div className="flex-1 overflow-y-auto px-5 pb-8">
              {groupedAvailable.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">
                  {addSearch ? '未找到匹配的疫苗' : '所有疫苗已添加'}
                </div>
              ) : (
                groupedAvailable.map(([name, items]) => (
                  <div key={name} className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-outfit font-bold text-ink">{name}</span>
                        <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                          items[0].费用类型 === '自费'
                            ? 'bg-coral/15 text-coral'
                            : 'bg-cream-dark text-muted'
                        }`}>
                          {items[0].费用类型}
                        </span>
                      </div>
                      <button
                        onClick={() => handleAddAllByGroup(items)}
                        disabled={adding}
                        className="text-xs text-coral font-medium flex items-center gap-1 hover:text-coral-dark transition-colors disabled:opacity-50"
                      >
                        <Plus size={14} />
                        全部添加
                      </button>
                    </div>
                    <div className="space-y-1">
                      {items.map((v, i) => (
                        <button
                          key={i}
                          onClick={() => handleAddVaccine(v)}
                          disabled={adding}
                          className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-cream-dark/60 transition-colors disabled:opacity-50 text-left"
                        >
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
  vaccinating,
  datePickerOpen,
  selectedDate,
  onOpenDatePicker,
  onDateChange,
  onConfirmDate,
}: {
  vaccine: VaccineRecord;
  vaccinating: boolean;
  datePickerOpen: boolean;
  selectedDate: string;
  onOpenDatePicker: () => void;
  onDateChange: (d: string) => void;
  onConfirmDate: () => void;
}) {
  const isVaccinated = vaccine.接种状态 === '已接种';
  const isPaid = vaccine.费用类型 === '自费';

  return (
    <div className="card-shadow p-3.5 animate-fade-up">
      {/* 第一行：疫苗名称 + 剂次 + 费用 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-outfit font-bold text-ink flex-1">{vaccine.疫苗名称}</span>
        <span className="text-xs bg-cream-dark text-muted rounded-full px-2 py-0.5">
          第{vaccine.剂次}/{vaccine.总剂次}针
        </span>
        <span className={`text-xs rounded-full px-2 py-0.5 ${isPaid ? 'bg-coral/15 text-coral' : 'bg-cream-dark text-muted'}`}>
          {vaccine.费用类型}
        </span>
      </div>

      {/* 第二行：时间 + 状态 */}
      <div className="flex items-center justify-between">
        {isVaccinated ? (
          <span className="text-xs text-muted">
            接种时间: {formatDateShort(vaccine.接种时间 || vaccine.预计接种时间)}
          </span>
        ) : (
          <span className="text-xs text-muted">
            预计接种: {formatDateShort(vaccine.预计接种时间)}
          </span>
        )}

        {isVaccinated ? (
          <span className="text-xs text-muted">已接种</span>
        ) : (
          <button
            onClick={onOpenDatePicker}
            disabled={vaccinating}
            className="text-xs border border-coral text-coral rounded-full px-3 py-1 hover:bg-coral/5 transition-colors disabled:opacity-50"
          >
            {vaccinating ? '提交中...' : '未接种'}
          </button>
        )}
      </div>

      {/* 日期选择器 */}
      {datePickerOpen && !isVaccinated && (
        <div className="mt-2.5 pt-2.5 border-t border-rule/30 flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="flex-1 input-field py-2 text-xs"
          />
          <button
            onClick={onConfirmDate}
            disabled={!selectedDate || vaccinating}
            className="btn-primary py-2 px-3 text-xs rounded-btn"
          >
            确认
          </button>
        </div>
      )}
    </div>
  );
}
