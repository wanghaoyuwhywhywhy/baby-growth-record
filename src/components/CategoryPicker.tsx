import { CATEGORIES } from '@/utils/constants';

interface CategoryPickerProps {
  selected: string;
  onSelect: (key: string) => void;
  placeholder?: string;
}

export default function CategoryPicker({ selected, onSelect, placeholder }: CategoryPickerProps) {
  return (
    <div>
      {!selected && placeholder && (
        <p className="text-xs text-muted/50 mb-1.5">{placeholder}</p>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-5 px-5">
        {CATEGORIES.map((cat) => {
          const isSelected = selected === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => onSelect(cat.key)}
              className={`
                flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all duration-200 flex-shrink-0
                ${isSelected
                  ? 'bg-coral text-white shadow-soft font-medium'
                  : 'bg-cream-dark text-muted hover:bg-cream-dark/80 active:scale-95'
                }
              `}
            >
              <span className="text-sm">{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
