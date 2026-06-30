import { create } from 'zustand';
import { feishuAPI, type Baby, type DailyRecord, type GrowthRecord } from '@/api/feishu';

interface AppState {
  babies: Baby[];
  currentBabyId: string | null;
  records: DailyRecord[];
  growthRecords: GrowthRecord[];
  filterCategory: string;
  loading: boolean;
  initialized: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncResult: { babies: number; records: number; growth: number } | null;
  cloudConnected: boolean | null;

  currentBaby: () => Baby | null;
  initApp: () => Promise<void>;
  fetchBabies: () => Promise<void>;
  switchBaby: (id: string) => void;
  addBaby: (data: Omit<Baby, 'record_id'>) => Promise<Baby>;
  updateBaby: (record_id: string, data: Partial<Omit<Baby, 'record_id'>>) => Promise<void>;
  deleteBaby: (record_id: string) => Promise<void>;

  fetchRecords: (category?: string) => Promise<void>;
  fetchRecentRecords: () => Promise<DailyRecord[]>;
  createRecord: (data: { 记录内容: string; 分类: string; 是否为里程碑: boolean; 媒体类型?: 'text' | 'voice' | 'video' | 'photo'; 媒体附件?: string[] }) => Promise<DailyRecord>;
  setFilterCategory: (category: string) => void;

  fetchGrowthRecords: () => Promise<void>;
  createGrowthRecord: (data: { 测量日期: string; 身高?: number; 体重?: number; 备注?: string }) => Promise<GrowthRecord>;
  deleteGrowthRecord: (record_id: string) => Promise<void>;

  syncFromCloud: () => Promise<void>;
  checkCloudConnection: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  babies: [],
  currentBabyId: null,
  records: [],
  growthRecords: [],
  filterCategory: '全部',
  loading: false,
  initialized: false,
  syncStatus: 'idle',
  lastSyncResult: null,
  cloudConnected: null,

  currentBaby: () => {
    const { babies, currentBabyId } = get();
    if (!currentBabyId) return babies[0] ?? null;
    return babies.find((b) => b.record_id === currentBabyId) ?? babies[0] ?? null;
  },

  initApp: async () => {
    if (get().initialized) return;
    // 先从云端同步数据到本地，再加载本地数据（确保新设备能看到云端数据）
    try {
      await feishuAPI.syncFromCloud();
    } catch {
      // 云端同步失败不阻塞，继续用本地数据
    }
    const babies = await feishuAPI.getBabies();
    const { currentBabyId } = get();
    const stillExists = currentBabyId && babies.find((b) => b.record_id === currentBabyId);
    set({
      babies,
      currentBabyId: stillExists ? currentBabyId : babies[0]?.record_id ?? null,
      initialized: true,
    });
  },

  fetchBabies: async () => {
    if (!get().initialized) return;
    const babies = await feishuAPI.getBabies();
    const { currentBabyId } = get();
    const stillExists = currentBabyId && babies.find((b) => b.record_id === currentBabyId);
    set({
      babies,
      currentBabyId: stillExists ? currentBabyId : babies[0]?.record_id ?? null,
    });
  },

  switchBaby: (id: string) => {
    set({ currentBabyId: id });
    // 切换宝宝后刷新相关数据
    get().fetchRecords();
    get().fetchGrowthRecords();
  },

  addBaby: async (data) => {
    const baby = await feishuAPI.createBaby(data);
    set((state) => ({
      babies: [...state.babies, baby],
      currentBabyId: baby.record_id,
    }));
    return baby;
  },

  updateBaby: async (record_id, data) => {
    const updated = await feishuAPI.updateBaby(record_id, data);
    set((state) => ({
      babies: state.babies.map((b) => (b.record_id === record_id ? updated : b)),
    }));
  },

  deleteBaby: async (record_id) => {
    await feishuAPI.deleteBaby(record_id);
    const { babies, currentBabyId } = get();
    const remaining = babies.filter((b) => b.record_id !== record_id);
    set({
      babies: remaining,
      currentBabyId: currentBabyId === record_id ? remaining[0]?.record_id ?? null : currentBabyId,
    });
  },

  fetchRecords: async (category?: string) => {
    set({ loading: true });
    const { currentBabyId } = get();
    const records = await feishuAPI.getRecords({ category, babyId: currentBabyId ?? undefined });
    set({ records, loading: false });
  },

  fetchRecentRecords: async () => {
    const { currentBabyId } = get();
    return feishuAPI.getRecentRecords(5, currentBabyId ?? undefined);
  },

  createRecord: async (data) => {
    const { currentBabyId } = get();
    if (!currentBabyId) throw new Error('请先添加宝宝');
    const record = await feishuAPI.createRecord({
      ...data,
      关联宝宝: currentBabyId,
    });
    set((state) => ({ records: [record, ...state.records] }));
    return record;
  },

  setFilterCategory: (category: string) => {
    set({ filterCategory: category });
    get().fetchRecords(category === '全部' ? undefined : category);
  },

  fetchGrowthRecords: async () => {
    const { currentBabyId } = get();
    if (!currentBabyId) {
      set({ growthRecords: [] });
      return;
    }
    const records = await feishuAPI.getGrowthRecords(currentBabyId);
    set({ growthRecords: records });
  },

  createGrowthRecord: async (data) => {
    const { currentBabyId } = get();
    if (!currentBabyId) throw new Error('请先添加宝宝');
    const record = await feishuAPI.createGrowthRecord({
      ...data,
      关联宝宝: currentBabyId,
    });
    set((state) => ({ growthRecords: [...state.growthRecords, record] }));
    return record;
  },

  deleteGrowthRecord: async (record_id) => {
    await feishuAPI.deleteGrowthRecord(record_id);
    set((state) => ({
      growthRecords: state.growthRecords.filter((r) => r.record_id !== record_id),
    }));
  },

  syncFromCloud: async () => {
    set({ syncStatus: 'syncing' });
    try {
      const result = await feishuAPI.syncFromCloud();
      // 同步后刷新本地数据
      const { currentBabyId } = get();
      const babies = await feishuAPI.getBabies();
      const stillExists = currentBabyId && babies.find((b) => b.record_id === currentBabyId);
      set({
        syncStatus: 'success',
        lastSyncResult: result,
        babies,
        currentBabyId: stillExists ? currentBabyId : babies[0]?.record_id ?? null,
      });
      // 刷新当前数据
      await get().fetchRecords(get().filterCategory === '全部' ? undefined : get().filterCategory);
      await get().fetchGrowthRecords();
    } catch {
      set({ syncStatus: 'error' });
    }
  },

  checkCloudConnection: async () => {
    const connected = await feishuAPI.checkCloudConnection();
    set({ cloudConnected: connected });
  },
}));
