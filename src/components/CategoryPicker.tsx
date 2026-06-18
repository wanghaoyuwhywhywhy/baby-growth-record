import { CATEGORIES } from '@/utils/constants';

interface CategoryPickerProps {
  selected: string;
  onSelect: (key: string) => void;
}

export default function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CATEGORIES.map((cat) => {
        const isSelected = selected === cat.key;
        return (
          <button
            key={cat.key}
            type="button"
            onClick={() => onSelect(cat.key)}
            className={`
              flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all duration-200
              ${isSelected
                ? 'bg-coral/10 shadow-soft scale-105'
                : 'bg-cream-dark hover:bg-cream-dark/80 active:scale-95'
              }
            `}
            style={isSelected ? { borderColor: cat.color, borderWidth: '2px', borderStyle: 'solid' } : {}}
          >
            <span className="text-2xl">{cat.emoji}</span>
            <span className={`text-xs font-medium ${isSelected ? 'text-coral-dark' : 'text-muted'}`}>
              {cat.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
