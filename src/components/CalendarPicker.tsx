import { useState } from 'react';
import { X } from 'lucide-react';

interface CalendarPickerProps {
  initialDate: string;
  onConfirm: (date: string) => void;
  onClose: () => void;
  title: string;
  maxDate?: string; // 最大可选日期（如今天）
}

export default function CalendarPicker({ initialDate, onConfirm, onClose, title, maxDate }: CalendarPickerProps) {
  const d0 = new Date(initialDate);
  const [year, setYear] = useState(d0.getFullYear());
  const [month, setMonth] = useState(d0.getMonth());
  const [day, setDay] = useState(d0.getDate());
  const [viewYear, setViewYear] = useState(d0.getFullYear());
  const [viewMonth, setViewMonth] = useState(d0.getMonth());
  const today = new Date();

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const calendarCells: { day: number; current: boolean }[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) calendarCells.push({ day: daysInPrevMonth - i, current: false });
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push({ day: d, current: true });
  const rows = 6; // 固定6行，避免5/6行切换时高度跳动
  const remaining = rows * 7 - calendarCells.length;
  for (let d = 1; d <= remaining; d++) calendarCells.push({ day: d, current: false });

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); }
  function prevYear() { setViewYear(viewYear - 1); }
  function nextYear() { setViewYear(viewYear + 1); }
  function selectDate(d: number) { setYear(viewYear); setMonth(viewMonth); setDay(d); }
  const isSelected = (d: number) => viewYear === year && viewMonth === month && d === day;
  const isToday = (d: number) => viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate();

  // 检查日期是否超过最大可选日期
  function isAfterMax(d: number): boolean {
    if (!maxDate) return false;
    const max = new Date(maxDate);
    const date = new Date(viewYear, viewMonth, d);
    return date > max;
  }

  function handleConfirm() {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onConfirm(dateStr);
  }
  function handleToday() {
    const now = new Date();
    setYear(now.getFullYear()); setMonth(now.getMonth()); setDay(now.getDate());
    setViewYear(now.getFullYear()); setViewMonth(now.getMonth());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-cream-light rounded-t-3xl p-5 pb-8 animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-outfit font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors">
            <X size={18} className="text-muted" />
          </button>
        </div>
        <div className="mb-4">
          {/* 《 < 年月 > 》 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <button onClick={prevYear} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors text-ink active:scale-95">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M9 12L5 8L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 12L9 8L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors text-ink active:scale-95">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <span className="text-sm font-outfit font-semibold text-ink">{viewYear}年{viewMonth + 1}月</span>
            <div className="flex items-center">
              <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors text-ink active:scale-95">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={nextYear} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-dark transition-colors text-ink active:scale-95">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4L7 8L3 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 4L11 8L7 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {['日', '一', '二', '三', '四', '五', '六'].map(w => (
              <div key={w} className="text-[11px] text-muted text-center font-medium py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarCells.map((cell, i) => {
              const selected = cell.current && isSelected(cell.day);
              const todayMark = cell.current && isToday(cell.day);
              const disabled = !cell.current || isAfterMax(cell.day);
              return (
                <button key={i} disabled={disabled} onClick={() => cell.current && !isAfterMax(cell.day) && selectDate(cell.day)}
                  className={`relative w-8 h-8 mx-auto flex items-center justify-center text-xs rounded-full transition-all
                    ${disabled ? 'text-muted/30 cursor-default' : 'text-ink hover:bg-coral/10 active:scale-95'}
                    ${selected ? 'bg-coral text-white hover:bg-coral-dark font-semibold' : ''}`}
                >
                  {cell.day}
                  {todayMark && !selected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-coral" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">已选：</span>
            <span className="text-sm font-outfit font-bold text-ink">{year}-{String(month + 1).padStart(2, '0')}-{String(day).padStart(2, '0')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleToday} className="text-xs text-coral border border-coral rounded-full px-3 py-1.5 hover:bg-coral/5 transition-colors">今天</button>
            <button onClick={handleConfirm} className="btn-primary py-1.5 px-4 text-xs rounded-btn">确认</button>
          </div>
        </div>
      </div>
    </div>
  );
}
