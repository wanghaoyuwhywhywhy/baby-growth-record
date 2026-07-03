import { create } from 'zustand';
import { feishuAPI, type Baby, type DailyRecord, type GrowthRecord, type VaccineRecord } from '@/api/feishu';

interface AppState {
  babies: Baby[];
  currentBabyId: string | null;
  records: DailyRecord[];
  growthRecords: GrowthRecord[];
  vaccines: VaccineRecord[];
  filterCategory: string;
  loading: boolean;
  initialized: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncResult: { babies: number; records: number; growth: number } | null;
  cloudConnected: boolean | null;
  babyRelations: Record<string, string>; // babyId -> relation

  currentBaby: () => Baby | null;
  initApp: () => Promise<void>;
  fetchBabies: () => Promise<void>;
  switchBaby: (id: string) => void;
  setBabyRelations: (relations: Record<string, string>) => void;
  addBaby: (data: Omit<Baby, 'record_id'>) => Promise<Baby>;
  updateBaby: (record_id: string, data: Partial<Omit<Baby, 'record_id'>>) => Promise<void>;
  deleteBaby: (record_id: string) => Promise<void>;

  fetchRecords: (category?: string) => Promise<void>;
  fetchRecentRecords: () => Promise<DailyRecord[]>;
  createRecord: (data: { 记录内容: string; 分类: string; 是否为里程碑: boolean; 媒体类型?: ('text' | 'voice' | 'video' | 'photo')[]; 媒体附件?: string[]; 语音转文字?: string }) => Promise<DailyRecord>;
  updateRecord: (record_id: string, data: { 记录时间?: string; 分类?: string }) => Promise<DailyRecord | null>;
  setFilterCategory: (category: string) => void;

  fetchGrowthRecords: () => Promise<void>;
  createGrowthRecord: (data: { 测量日期: string; 身高?: number; 体重?: number; 头围?: number; 备注?: string }) => Promise<GrowthRecord>;
  updateGrowthRecord: (record: GrowthRecord) => Promise<GrowthRecord>;
  deleteGrowthRecord: (record_id: string) => Promise<void>;

  syncFromCloud: () => Promise<void>;
  checkCloudConnection: () => Promise<void>;

  fetchVaccines: () => Promise<void>;
  updateVaccineStatus: (record_id: string, 接种时间: string) => Promise<void>;
  updateVaccineExpectedDate: (record_id: string, 预计接种时间: string) => Promise<void>;
  updateVaccineVaccinateDate: (record_id: string, 接种时间: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  babies: [],
  currentBabyId: null,
  records: [],
  growthRecords: [],
  vaccines: [],
  filterCategory: '全部',
  loading: false,
  initialized: false,
  syncStatus: 'idle',
  lastSyncResult: null,
  cloudConnected: null,
  babyRelations: {},

  currentBaby: () => {
    const { babies, currentBabyId } = get();
    if (!currentBabyId) return babies[0] ?? null;
    return babies.find((b) => b.record_id === currentBabyId) ?? babies[0] ?? null;
  },

  initApp: async () => {
    if (get().initialized) return;
    // 先加载本地数据，立即显示页面
    const babies = await feishuAPI.getBabies();
    const { currentBabyId } = get();
    const stillExists = currentBabyId && babies.find((b) => b.record_id === currentBabyId);
    set({
      babies,
      currentBabyId: stillExists ? currentBabyId : babies[0]?.record_id ?? null,
      initialized: true,
    });
    // 保存当前宝宝ID到localStorage供权限判断
    const newId = stillExists ? currentBabyId : babies[0]?.record_id ?? null;
    if (newId) localStorage.setItem('current_baby_id', newId);
    // 后台同步云端数据（不阻塞页面渲染）
    feishuAPI.syncFromCloud().then(async () => {
      const updatedBabies = await feishuAPI.getBabies();
      const { currentBabyId: cid } = get();
      const exists = cid && updatedBabies.find((b) => b.record_id === cid);
      set({
        babies: updatedBabies,
        currentBabyId: exists ? cid : updatedBabies[0]?.record_id ?? null,
      });
      // 并行刷新所有数据
      await Promise.all([
        get().fetchRecords(),
        get().fetchGrowthRecords(),
        get().fetchVaccines(),
      ]);
    }).catch(() => {
      // 云端同步失败，不影响本地使用
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
    localStorage.setItem('current_baby_id', id);
    // 切换宝宝后刷新相关数据
    get().fetchRecords();
    get().fetchGrowthRecords();
  },

  setBabyRelations: (relations) => set({ babyRelations: relations }),

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
    return feishuAPI.getRecentRecords(10, currentBabyId ?? undefined);
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

  updateRecord: async (record_id, data) => {
    const updated = await feishuAPI.updateRecord(record_id, data);
    if (updated) {
      set((state) => ({
        records: state.records.map((r) => (r.record_id === record_id ? updated : r)),
      }));
    }
    return updated;
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

  updateGrowthRecord: async (record) => {
    const updated = await feishuAPI.updateGrowthRecord(record);
    set((state) => ({
      growthRecords: state.growthRecords.map((r) => (r.record_id === record.record_id ? updated : r)),
    }));
    return updated;
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

  fetchVaccines: async () => {
    const { currentBabyId } = get();
    if (!currentBabyId) {
      set({ vaccines: [] });
      return;
    }
    const vaccines = await feishuAPI.getVaccines(currentBabyId);
    set({ vaccines });
  },

  updateVaccineStatus: async (record_id, 接种时间) => {
    // 乐观更新：先更新本地，后台同步云端
    set((state) => ({
      vaccines: state.vaccines.map((v) =>
        v.record_id === record_id
          ? { ...v, 接种状态: '已接种' as const, 接种时间, 预计接种时间: 接种时间 }
          : v
      ),
    }));
    feishuAPI.updateVaccine(record_id, {
      接种状态: '已接种',
      接种时间,
      预计接种时间: 接种时间,
    });
  },

  updateVaccineExpectedDate: async (record_id, 预计接种时间) => {
    set((state) => ({
      vaccines: state.vaccines.map((v) =>
        v.record_id === record_id
          ? { ...v, 预计接种时间 }
          : v
      ),
    }));
    feishuAPI.updateVaccine(record_id, {
      预计接种时间,
    });
  },

  updateVaccineVaccinateDate: async (record_id, 接种时间) => {
    set((state) => ({
      vaccines: state.vaccines.map((v) =>
        v.record_id === record_id
          ? { ...v, 接种时间 }
          : v
      ),
    }));
    feishuAPI.updateVaccine(record_id, {
      接种时间,
    });
  },
}));
