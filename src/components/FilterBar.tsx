import { CATEGORIES } from '@/utils/constants';

interface FilterBarProps {
  selected: string;
  onSelect: (key: string) => void;
}

export default function FilterBar({ selected, onSelect }: FilterBarProps) {
  const allCategories = [{ key: '全部', label: '全部', emoji: '📋', color: '#8B7D7A' }, ...CATEGORIES];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5">
      {allCategories.map((cat) => {
        const isActive = selected === cat.key;
        return (
          <button
            key={cat.key}
            type="button"
            onClick={() => onSelect(cat.key)}
            className={`
              flex items-center gap-1.5 px-4 py-2 rounded-full text-sm whitespace-nowrap
              transition-all duration-200 flex-shrink-0
              ${isActive
                ? 'bg-coral text-white shadow-soft font-medium'
                : 'bg-cream-dark text-muted hover:bg-rule/50'
              }
            `}
          >
            <span className="text-sm">{cat.emoji}</span>
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
