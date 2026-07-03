import { useState } from 'react';
import { X } from 'lucide-react';

interface CalendarPickerProps {
  initialDate: string;
  onConfirm: (date1: string, date2: string) => void;
  onClose: () => void;
  title: string;
  maxDate?: string;
  mode?: 'single' | 'range';
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function CalendarPicker({ initialDate, onConfirm, onClose, title, maxDate, mode = 'single' }: CalendarPickerProps) {
  const d0 = new Date(initialDate);
  const [viewYear, setViewYear] = useState(d0.getFullYear());
  const [viewMonth, setViewMonth] = useState(d0.getMonth());
  const today = new Date();

  const [date1, setDate1] = useState<string | null>(null);
  const [date2, setDate2] = useState<string | null>(null);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const calendarCells: { day: number; current: boolean }[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) calendarCells.push({ day: daysInPrevMonth - i, current: false });
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push({ day: d, current: true });
  const rows = 6;
  const remaining = rows * 7 - calendarCells.length;
  for (let d = 1; d <= remaining; d++) calendarCells.push({ day: d, current: false });

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); }
  function prevYear() { setViewYear(viewYear - 1); }
  function nextYear() { setViewYear(viewYear + 1); }
  const isToday = (d: number) => viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate();

  function isAfterMax(d: number): boolean {
    if (!maxDate) return false;
    const max = new Date(maxDate);
    const date = new Date(viewYear, viewMonth, d);
    return date > max;
  }

  function handleDateClick(d: number) {
    if (isAfterMax(d)) return;
    const clicked = toDateStr(viewYear, viewMonth, d);

    if (mode === 'single') {
      onConfirm(clicked, clicked);
      return;
    }

    if (!date1 || date2) {
      setDate1(clicked);
      setDate2(null);
    } else {
      if (clicked === date1) {
        setDate1(null);
        setDate2(null);
      } else {
        setDate2(clicked);
      }
    }
  }

  function handleConfirm() {
    if (mode === 'range') {
      if (date1 && date2) {
        const sorted = [date1, date2].sort();
        onConfirm(sorted[0], sorted[1]);
      } else if (date1) {
        onConfirm(date1, date1);
      }
    } else {
      // single mode 不会到这里，但保险起见
      if (date1) onConfirm(date1, date1);
    }
  }

  function handleToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    handleDateClick(now.getDate());
  }

  // 获取范围高亮条样式
  function getRangeBarClass(cellDateStr: string): string {
    if (mode !== 'range' || !date1 || !date2) return '';
    const sorted = [date1, date2].sort();
    if (cellDateStr < sorted[0] || cellDateStr > sorted[1]) return '';

    const isStart = cellDateStr === sorted[0];
    const isEnd = cellDateStr === sorted[1];
    if (isStart && !isEnd) {
      return 'after:content-[""] after:absolute after:top-0 after:right-0 after:w-1/2 after:h-full after:bg-coral/15';
    }
    if (isEnd && !isStart) {
      return 'before:content-[""] before:absolute before:top-0 before:left-0 before:w-1/2 before:h-full before:bg-coral/15';
    }
    if (!isStart && !isEnd) {
      return 'before:content-[""] before:absolute before:inset-0 before:bg-coral/15';
    }
    // 同一天既开始又结束（不会到这里因为上面已排除）
    return '';
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
            {calendarCells.map((c, i) => {
              const todayMark = c.current && isToday(c.day);
              const disabled = !c.current || isAfterMax(c.day);
              const cellDateStr = c.current ? toDateStr(viewYear, viewMonth, c.day) : '';

              let isEndpoint = false;
              let isInRange = false;
              let rangeBarClass = '';

              if (mode === 'range' && c.current) {
                if (date1 && date2) {
                  const sorted = [date1, date2].sort();
                  if (cellDateStr === sorted[0] || cellDateStr === sorted[1]) {
                    isEndpoint = true;
                  } else if (cellDateStr > sorted[0] && cellDateStr < sorted[1]) {
                    isInRange = true;
                  }
                  rangeBarClass = getRangeBarClass(cellDateStr);
                } else if (date1 && !date2) {
                  if (cellDateStr === date1) isEndpoint = true;
                }
              }

              return (
                <button key={i} disabled={disabled}
                  onClick={() => c.current && !isAfterMax(c.day) && handleDateClick(c.day)}
                  className={`relative w-8 h-8 mx-auto flex items-center justify-center text-xs transition-all overflow-visible
                    ${disabled ? 'text-muted/30 cursor-default' : 'text-ink hover:bg-coral/10 active:scale-95'}
                    ${isEndpoint ? 'bg-coral text-white hover:bg-coral-dark font-semibold rounded-full z-10' : ''}
                    ${isInRange ? 'text-coral font-medium' : ''}
                    ${!isEndpoint && !disabled ? 'rounded-full' : ''}
                    ${rangeBarClass}`}
                >
                  {c.day}
                  {todayMark && !isEndpoint && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-coral z-10" />}
                </button>
              );
            })}
          </div>
        </div>

        {mode === 'range' ? (
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted">
              {date1 && date2
                ? <span className="font-outfit text-ink font-medium">{[date1, date2].sort().join(' ～ ')}</span>
                : date1
                  ? <span>请选择第二个日期</span>
                  : <span>点击选择日期范围</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="text-xs text-muted border border-rule rounded-full px-3 py-1.5 hover:bg-cream-dark transition-colors">取消</button>
              <button onClick={handleConfirm} disabled={!date1 || !date2}
                className="btn-primary py-1.5 px-4 text-xs rounded-btn disabled:opacity-40 disabled:cursor-not-allowed">确认</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button onClick={handleToday} className="text-xs text-coral border border-coral rounded-full px-3 py-1.5 hover:bg-coral/5 transition-colors">今天</button>
            <button onClick={handleConfirm} className="btn-primary py-1.5 px-4 text-xs rounded-btn">确认</button>
          </div>
        )}
      </div>
    </div>
  );
}
