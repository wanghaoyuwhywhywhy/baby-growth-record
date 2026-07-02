import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { GrowthRecord } from '@/api/feishu';
import NavHeader from '@/components/NavHeader';
import CalendarPicker from '@/components/CalendarPicker';
import { Plus, Trash2, Pencil, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { calcAge } from '@/utils/date';

type MetricType = 'height' | 'weight' | 'head';

export default function GrowthPage() {
  const { currentBaby, growthRecords, fetchGrowthRecords, createGrowthRecord, updateGrowthRecord, deleteGrowthRecord } = useAppStore();
  const baby = currentBaby();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GrowthRecord | null>(null);
  const [measureDate, setMeasureDate] = useState(new Date().toISOString().split('T')[0]);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [headCircumference, setHeadCircumference] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [metric, setMetric] = useState<MetricType>('height');
  const [calendarTarget, setCalendarTarget] = useState<'date' | null>(null);

  useEffect(() => {
    if (baby) fetchGrowthRecords();
  }, [baby?.record_id, fetchGrowthRecords]);

  if (!baby) {
    return (
      <div className="page-container">
        <NavHeader title="身高体重" showBack />
        <div className="mt-20 text-center text-muted text-sm">请先添加宝宝</div>
      </div>
    );
  }

  // 按日期排序（升序）
  const sorted = [...growthRecords].sort((a, b) => new Date(a.测量日期).getTime() - new Date(b.测量日期).getTime());
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const heightDelta = latest?.身高 && previous?.身高 ? +(latest.身高 - previous.身高).toFixed(1) : 0;
  const weightDelta = latest?.体重 && previous?.体重 ? +(latest.体重 - previous.体重).toFixed(1) : 0;

  function startEdit(record: GrowthRecord) {
    setEditingRecord(record);
    setMeasureDate(record.测量日期);
    setHeight(record.身高?.toString() ?? '');
    setWeight(record.体重?.toString() ?? '');
    setHeadCircumference(record.头围?.toString() ?? '');
    setRemark(record.备注 ?? '');
    setShowForm(true);
  }

  function resetForm() {
    setHeight('');
    setWeight('');
    setHeadCircumference('');
    setRemark('');
    setMeasureDate(new Date().toISOString().split('T')[0]);
    setEditingRecord(null);
    setShowForm(false);
  }

  async function handleSubmit() {
    if (!measureDate || (!height && !weight && !headCircumference) || submitting) return;
    setSubmitting(true);
    try {
      if (editingRecord) {
        await updateGrowthRecord({
          ...editingRecord,
          测量日期: measureDate,
          身高: height ? parseFloat(height) : undefined,
          体重: weight ? parseFloat(weight) : undefined,
          头围: headCircumference ? parseFloat(headCircumference) : undefined,
          备注: remark.trim() || undefined,
        });
      } else {
        await createGrowthRecord({
          测量日期: measureDate,
          身高: height ? parseFloat(height) : undefined,
          体重: weight ? parseFloat(weight) : undefined,
          头围: headCircumference ? parseFloat(headCircumference) : undefined,
          备注: remark.trim() || undefined,
        });
      }
      resetForm();
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败');
    }
    setSubmitting(false);
  }

  // 图表数据：取最近12条
  const chartRecords = sorted.slice(-12);
  const currentData = chartRecords.map((r) => r[metric === 'height' ? '身高' : metric === 'weight' ? '体重' : '头围']).filter(Boolean) as number[];
  const minValue = currentData.length ? Math.min(...currentData) : 0;
  const maxValue = currentData.length ? Math.max(...currentData) : 100;
  const range = maxValue - minValue || 1;

  // 当前值显示
  const metricConfig = {
    height: { label: '当前身高', value: latest?.身高 ?? '--', unit: 'cm', delta: heightDelta },
    weight: { label: '当前体重', value: latest?.体重 ?? '--', unit: 'kg', delta: weightDelta },
    head: { label: '当前头围', value: latest?.头围 ?? '--', unit: 'cm', delta: null },
  };

  return (
    <div className="page-container">
      <NavHeader title="身高体重" showBack />

      <div className="mt-4">
        {/* 当前数据卡片 */}
        <div className="card-shadow p-5 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mint to-sky flex items-center justify-center text-white shadow-soft">
              <Activity size={22} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-outfit font-bold text-ink">{baby.宝宝姓名}的成长</p>
              <p className="text-xs text-muted">{calcAge(baby.出生日期)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(['height', 'weight', 'head'] as MetricType[]).map((m) => {
              const cfg = metricConfig[m];
              return (
                <button key={m} onClick={() => setMetric(m)}
                  className={`bg-cream-dark/40 rounded-card p-3.5 text-left transition-all ${metric === m ? 'ring-2 ring-coral/30' : ''}`}>
                  <p className="text-xs text-muted mb-1">{cfg.label}</p>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xl font-outfit font-bold text-ink">{cfg.value}</span>
                    <span className="text-[10px] text-muted">{cfg.unit}</span>
                  </div>
                  {cfg.delta != null && (
                    <p className={`text-xs mt-1 flex items-center gap-0.5 ${cfg.delta > 0 ? 'text-mint-dark' : 'text-coral'}`}>
                      {cfg.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {cfg.delta > 0 ? '+' : ''}{cfg.delta}{m === 'weight' ? 'kg' : 'cm'}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 图表 */}
        {chartRecords.filter(r => r[metric === 'height' ? '身高' : metric === 'weight' ? '体重' : '头围']).length >= 2 && (
          <div className="card-shadow p-5 mb-5">
            <h3 className="text-sm font-outfit font-bold text-ink mb-4">
              成长曲线 · {metricConfig[metric].label.replace('当前', '')}
            </h3>

            <GrowthChart
              data={chartRecords.map((r) => ({
                date: r.测量日期,
                value: metric === 'height' ? r.身高 : metric === 'weight' ? r.体重 : r.头围,
              }))}
              min={minValue}
              max={maxValue}
              range={range}
              color={metric === 'height' ? '#6FD3B5' : metric === 'weight' ? '#7BCEFF' : '#FF9F7F'}
              unit={metricConfig[metric].unit}
            />
          </div>
        )}

        {/* 添加按钮 */}
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary w-full mb-5 flex items-center justify-center gap-2"
        >
          <Plus size={18} strokeWidth={2.5} />
          添加记录
        </button>

        {/* 添加表单 */}
        {showForm && (
          <div className="card-shadow p-4 mb-5 animate-fade-up">
            <h3 className="text-sm font-outfit font-bold text-ink mb-3">{editingRecord ? '编辑测量数据' : '新增测量数据'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">测量日期</label>
                <button type="button"
                  onClick={() => setCalendarTarget('date')}
                  className="w-full py-2.5 px-3 rounded-xl bg-cream-dark text-sm text-ink outline-none focus:ring-2 focus:ring-coral/30 text-left flex justify-between items-center">
                  <span>{measureDate}</span>
                  <span className="text-xs text-muted">选择</span>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1.5">身高(cm)</label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="如 75"
                    step="0.1"
                    min="0"
                    className="input-field py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">体重(kg)</label>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="如 9.5"
                    step="0.1"
                    min="0"
                    className="input-field py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">头围(cm)</label>
                  <input
                    type="number"
                    value={headCircumference}
                    onChange={(e) => setHeadCircumference(e.target.value)}
                    placeholder="如 44"
                    step="0.1"
                    min="0"
                    className="input-field py-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">备注（选填）</label>
                <input
                  type="text"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="如 体检测量"
                  maxLength={50}
                  className="input-field py-2.5"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={resetForm}
                  className="flex-1 btn-secondary py-2.5 text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!measureDate || (!height && !weight && !headCircumference) || submitting}
                  className="flex-1 btn-primary py-2.5 text-sm"
                >
                  {submitting ? '保存中...' : editingRecord ? '更新' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 历史记录 */}
        <div className="card-shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-rule/40 bg-cream-dark/30">
            <h3 className="text-sm font-outfit font-bold text-ink">历史记录</h3>
          </div>
          {growthRecords.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-4xl mb-2">📏</p>
              <p className="text-sm text-muted">还没有测量数据</p>
            </div>
          ) : (
            <div className="divide-y divide-rule/30">
              {[...sorted].reverse().map((r) => {
                const d = new Date(r.测量日期);
                return (
                <div key={r.record_id} className="px-4 py-3 flex items-center gap-3 group">
                  <div className="w-[52px] flex-shrink-0 text-center">
                    <div className="text-[10px] text-muted">{d.getFullYear()}</div>
                    <div className="text-sm font-bold text-mint-dark">{d.getMonth() + 1}.{d.getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {r.身高 && (
                        <span className="text-sm text-ink">
                          <span className="text-muted text-xs">身高</span> {r.身高}cm
                        </span>
                      )}
                      {r.体重 && (
                        <span className="text-sm text-ink">
                          <span className="text-muted text-xs">体重</span> {r.体重}kg
                        </span>
                      )}
                      {r.头围 && (
                        <span className="text-sm text-ink">
                          <span className="text-muted text-xs">头围</span> {r.头围}cm
                        </span>
                      )}
                    </div>
                    {r.备注 && <p className="text-xs text-muted/70 mt-0.5">{r.备注}</p>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(r)}
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-mint/10 text-muted hover:text-mint-dark transition-all"
                      aria-label="编辑"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteGrowthRecord(r.record_id)}
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-coral/10 text-muted hover:text-coral transition-all"
                      aria-label="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 日历选择器 */}
      {calendarTarget && (
        <CalendarPicker
          initialDate={measureDate}
          title="选择测量日期"
          maxDate={new Date().toISOString().split('T')[0]}
          onConfirm={(date) => { setMeasureDate(date); setCalendarTarget(null); }}
          onClose={() => setCalendarTarget(null)}
        />
      )}
    </div>
  );
}

function GrowthChart({
  data,
  min,
  max,
  range,
  color,
  unit,
}: {
  data: { date: string; value?: number }[];
  min: number;
  max: number;
  range: number;
  color: string;
  unit: string;
}) {
  const width = 320;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 32, left: 36 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const validData = data.filter((d) => d.value !== undefined);
  if (validData.length < 2) return null;

  const points = validData.map((d, i) => {
    const x = padding.left + (i / (validData.length - 1)) * chartW;
    const y = padding.top + chartH - ((d.value! - min) / range) * chartH;
    return { x, y, value: d.value!, date: d.date };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${padding.top + chartH} L ${points[0].x.toFixed(1)} ${padding.top + chartH} Z`;

  // X轴日期格式化函数
  function formatXLabel(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 280 }}>
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding.top + chartH * t;
          const value = max - range * t;
          return (
            <g key={t}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#E8D5D0"
                strokeWidth="0.5"
                strokeDasharray="2 2"
              />
              <text x={padding.left - 4} y={y + 3} fontSize="9" fill="#8B7D7A" textAnchor="end">
                {value.toFixed(unit === 'kg' ? 1 : 0)}
              </text>
            </g>
          );
        })}

        {/* 区域 */}
        <path d={areaD} fill={color} opacity="0.12" />

        {/* 线 */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* 数据点 */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#FFFDFB" stroke={color} strokeWidth="2" />
            {(i === 0 || i === points.length - 1) && (
              <text x={p.x} y={p.y - 8} fontSize="9" fill="#3D2C2A" textAnchor="middle" fontWeight="600">
                {p.value}
              </text>
            )}
          </g>
        ))}

        {/* X轴日期（带年份） */}
        {points.map((p, i) => {
          if (points.length > 8 && i !== 0 && i !== points.length - 1 && i !== Math.floor(points.length / 2) && i !== Math.floor(points.length * 0.75)) return null;
          return (
            <text key={i} x={p.x} y={height - 8} fontSize="8" fill="#8B7D7A" textAnchor="middle">
              {formatXLabel(p.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
