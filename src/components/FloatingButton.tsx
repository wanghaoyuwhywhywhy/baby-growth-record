import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FloatingButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/record')}
      className="fixed bottom-8 right-8 w-14 h-14 bg-coral text-white rounded-full
                 shadow-float flex items-center justify-center
                 hover:bg-coral-dark active:scale-95 transition-all duration-200
                 animate-float-in z-40"
      aria-label="添加记录"
    >
      <Plus size={28} strokeWidth={2.5} />
    </button>
  );
}
