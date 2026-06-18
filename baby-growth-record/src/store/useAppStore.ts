import { create } from 'zustand';
import { feishuAPI, type Baby, type DailyRecord } from '@/api/feishu';

interface AppState {
  baby: Baby | null;
  records: DailyRecord[];
  filterCategory: string;
  loading: boolean;

  fetchBaby: () => Promise<void>;
  fetchRecords: (category?: string) => Promise<void>;
  fetchRecentRecords: () => Promise<DailyRecord[]>;
  createRecord: (data: { 记录内容: string; 分类: string; 是否为里程碑: boolean }) => Promise<DailyRecord>;
  setFilterCategory: (category: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  baby: null,
  records: [],
  filterCategory: '全部',
  loading: false,

  fetchBaby: async () => {
    const [baby] = await feishuAPI.getBabies();
    set({ baby });
  },

  fetchRecords: async (category?: string) => {
    set({ loading: true });
    const records = await feishuAPI.getRecords({ category });
    set({ records, loading: false });
  },

  fetchRecentRecords: async () => {
    return feishuAPI.getRecentRecords(5);
  },

  createRecord: async (data) => {
    const record = await feishuAPI.createRecord(data);
    set((state) => ({ records: [record, ...state.records] }));
    return record;
  },

  setFilterCategory: (category: string) => {
    set({ filterCategory: category });
    get().fetchRecords(category === '全部' ? undefined : category);
  },
}));
