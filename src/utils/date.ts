export function calcAge(birthDate: string): string {
  const birth = new Date(birthDate);
  const now = new Date();
  const diffMs = now.getTime() - birth.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);

  if (years > 0) {
    return `${years}岁${months > 0 ? months + '个月' : ''}`;
  }
  if (months > 0) {
    return `${months}个月`;
  }
  const days = totalDays % 30;
  return `${days}天`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) return `今天 ${time}`;
  if (diffDays === 1) return `昨天 ${time}`;
  if (diffDays < 7) return `${diffDays}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

export function formatTimelineDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

export function getMonthDay(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}
