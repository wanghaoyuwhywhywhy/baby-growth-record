# 宝宝成长记录 - 产品文档

> 最后更新：2026-07-01

---

## 一、产品概述

**产品名称**：宝宝成长记录（Baby Growth Record）

**产品定位**：面向新生宝宝家庭的个人成长记录工具，支持文字/语音/图片/视频多模态记录，AI 智能分类与分析，数据安全存储于飞书云端。

**访问地址**：https://tongxi.xyz

**核心价值**：
- 随时随地记录宝宝成长点滴，支持语音快速记录
- AI 自动分类 + 润色，降低记录成本
- 身高体重曲线追踪，直观了解发育状况
- AI 综合分析，提供个性化成长建议
- 数据云端存储，多设备同步

---

## 二、产品架构

### 2.1 技术架构

```
┌─────────────────────────────────────────────┐
│                  用户设备                     │
│  ┌─────────────────────────────────────────┐ │
│  │      PWA 前端 (React + Vite + TS)       │ │
│  │  ┌───────┐ ┌───────┐ ┌───────┐         │ │
│  │  │首页   │ │添加记录│ │时间线  │  ...    │ │
│  │  └───┬───┘ └───┬───┘ └───┬───┘         │ │
│  │      └─────────┼─────────┘              │ │
│  │            ┌────┴────┐                   │ │
│  │            │ Zustand  │                   │ │
│  │            │  Store   │                   │ │
│  │            └────┬────┘                   │ │
│  │          ┌──────┴──────┐                 │ │
│  │          │ IndexedDB   │  本地缓存       │ │
│  │          │  (Dexie)    │  离线可用       │ │
│  │          └─────────────┘                 │ │
│  └─────────────────────────────────────────┘ │
│                      │ HTTPS                  │
└──────────────────────┼───────────────────────┘
                       │
┌──────────────────────┼───────────────────────┐
│   Cloudflare Worker  │  api.tongxi.xyz        │
│  ┌───────────────────┴───────────────────┐   │
│  │         feishu-proxy.js               │   │
│  │  ┌──────────┐  ┌──────────┐          │   │
│  │  │密码认证   │  │CORS 白名单│          │   │
│  │  └──────────┘  └──────────┘          │   │
│  │  ┌──────────────────────────┐        │   │
│  │  │  API 代理 & 数据转换      │        │   │
│  │  │  /api/babies              │        │   │
│  │  │  /api/records             │        │   │
│  │  │  /api/growth              │        │   │
│  │  │  /api/upload (Drive)      │        │   │
│  │  │  /api/asset  (代理下载)   │        │   │
│  │  │  /api/ai     (DeepSeek)  │        │   │
│  │  └──────────────────────────┘        │   │
│  └───────────────────────────────────────┘   │
└──────────────────────┼───────────────────────┘
                       │
┌──────────────────────┼───────────────────────┐
│   飞书开放平台        │                       │
│  ┌───────────────────┴───────────────────┐   │
│  │  多维表格 (Bitable) - 数据存储         │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐    │   │
│  │  │宝宝表   │ │记录表   │ │成长表   │    │   │
│  │  └────────┘ └────────┘ └────────┘    │   │
│  │  云盘 (Drive) - 媒体文件存储           │   │
│  └───────────────────────────────────────┘   │
│                                               │
│  DeepSeek API - AI 能力                       │
│  (自动分类 / 润色 / 分析 / 建议)              │
└───────────────────────────────────────────────┘
```

### 2.2 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端框架 | React 18 + TypeScript | SPA 应用 |
| 构建 | Vite + vite-plugin-pwa | 快速构建 + PWA 支持 |
| 状态管理 | Zustand | 全局状态 |
| 本地存储 | Dexie (IndexedDB) | 离线数据缓存 |
| 样式 | Tailwind CSS | 原子化 CSS |
| 路由 | React Router (Hash) | 单页路由 |
| 后端 | Cloudflare Worker | API 代理 + 认证 |
| 数据库 | 飞书多维表格 (Bitable) | 结构化数据存储 |
| 文件存储 | 飞书云盘 (Drive) | 图片/语音/视频 |
| AI | DeepSeek Chat | 分类/润色/分析 |
| 部署 | Cloudflare Pages + GitHub | CI/CD 自动部署 |
| 图标 | Lucide React | UI 图标库 |

### 2.3 数据模型

**宝宝表 (Baby)**
| 字段 | 类型 | 说明 |
|------|------|------|
| 宝宝姓名 | 文本 | 宝宝名字 |
| 出生日期 | 日期 | ISO 日期 |
| 性别 | 单选 | 男/女 |
| 妈妈名字 | 文本 | 可选 |
| 爸爸名字 | 文本 | 可选 |
| 头像 | 文本 | 可选 |
| 备注 | 文本 | 宝宝备注/小名等 |

**每日记录表 (DailyRecord)**
| 字段 | 类型 | 说明 |
|------|------|------|
| 记录内容 | 文本 | 记录描述 |
| 分类 | 单选 | 饮食/睡眠/语言/运动/健康/其他 |
| 记录时间 | 日期 | Unix 毫秒时间戳 |
| 是否为里程碑 | 复选框 | 标记重要节点 |
| 关联宝宝 | 关联字段 | 关联宝宝表 |
| 媒体类型 | 多选 | text/voice/video/photo |
| 附件 | 附件 | 图片/语音/视频文件 |
| 语音转文字 | 文本 | 语音识别结果（独立字段） |

**成长记录表 (GrowthRecord)**
| 字段 | 类型 | 说明 |
|------|------|------|
| 测量日期 | 日期 | ISO 日期 |
| 身高 | 数字 | cm |
| 体重 | 数字 | kg |
| 备注 | 文本 | 可选 |
| 关联宝宝 | 关联字段 | 关联宝宝表 |

---

## 三、功能模块

### 3.1 密码登录

- 访问网站需输入密码（密码哈希 SHA-256 存储于 Worker 环境变量）
- 无状态 token 认证：token 由密码哈希确定性派生，Worker 重启不影响
- 前端 token 存储于 localStorage，401 时自动跳转登录页
- 图片/语音/视频 URL 也携带 token 参数

### 3.2 首页

- **宝宝卡片**：显示姓名、年龄、性别、身高体重、出生日期、备注
- **身高体重入口**：跳转成长记录页
- **AI 成长分析入口**：调用 DeepSeek 综合分析
- **最近记录**：最近 10 条记录（支持语音播放、图片预览、语音转文字）
- **浮动添加按钮**：快速添加记录

### 3.3 添加记录

- **分类选择**：横向滚动胶囊按钮（饮食/睡眠/语言/运动/健康/其他）
- **AI 自动分类**：未手动选择分类时，提交时自动 AI 识别归类
- **AI 润色**：对文字内容一键润色
- **文本输入**：记录内容（500 字上限）
- **媒体输入**：
  - 录音按钮：MediaRecorder 录音 + Web Speech API 实时转文字
  - 相机按钮：调起摄像头拍照/录像
  - 相册按钮：从相册选择图片/视频
- **语音转文字**：独立字段，不填入文本框，录音结束后存储
- **里程碑标记**：标记为成长里程碑

### 3.4 成长时间线

- **分类筛选**：全部 + 各分类
- **媒体类型筛选**：全部/文字/语音/图片/视频
  - 文字：纯文字记录
  - 语音：包含 voice 类型的记录
  - 图片：包含 photo 类型的记录
  - 视频：包含 video 类型的记录
- **语音播放**：播放按钮 + 实时进度条 + 时长显示 + 转文字描述框
- **图片预览**：点击全屏预览
- **视频播放**：内联播放控件

### 3.5 身高体重

- 记录身高、体重、测量日期、备注
- 成长曲线图表
- 与同龄标准对比

### 3.6 宝宝档案

- 查看宝宝基本信息（姓名、性别、出生日期、年龄）
- 爸爸妈妈信息
- 编辑宝宝信息
- 固定单宝宝，不支持新增/删除

### 3.7 AI 能力

| 能力 | 调用时机 | 说明 |
|------|----------|------|
| 自动分类 | 提交记录时（未手动选择） | 根据内容识别分类 |
| 内容润色 | 用户点击"AI 润色" | 使文字更温暖有画面感 |
| 成长分析 | 用户点击"AI 成长分析" | 综合分析发育趋势 |
| 记录建议 | 预留 | 根据最近记录建议新内容 |

---

## 四、安全设计

### 4.1 认证机制

- **密码保护**：Worker 环境变量存储密码 SHA-256 哈希 (`ACCESS_PASSWORD_HASH`)
- **无状态 Token**：`token = SHA256(密码哈希 + ":baby-growth-auth-v1")`，确定性派生，Worker 重启不影响
- **Token 传递**：API 请求通过 `X-Auth-Token` 头；媒体资源通过 URL `token` 参数

### 4.2 CORS 白名单

仅允许以下域名访问 API：
- `https://tongxi.xyz`（生产）
- `https://baby-growth-record.pages.dev`（Cloudflare Pages 预览）
- `http://localhost:5173`（本地开发）

### 4.3 安全措施

- 移除了 `/api/debug` 接口，避免泄露飞书配置
- API 密钥（飞书、DeepSeek）仅存储于 Worker 环境变量，不上传代码仓库
- 媒体文件 Content-Type 根据文件魔数修正，防止 MIME 嗅探攻击

---

## 五、媒体处理

### 5.1 录音

- Chrome/Firefox：`audio/webm` 格式
- Safari/iOS：`audio/mp4` 格式（自动检测 `MediaRecorder.isTypeSupported()`）
- 录音同时用 Web Speech API 实时转文字，结果存为独立字段
- 录音结束后确保关闭语音识别（`stopListening()`）

### 5.2 上传流程

```
1. 前端创建记录 → cloudCreateRecord()
2. 本地媒体存入 IndexedDB → addMedia()
3. 上传文件到飞书 Drive → /drive/v1/medias/upload_all → 获取 file_token
4. 更新记录附件字段 → PUT records/{id} 写入 file_token
5. 用云端 file_tokens 替换本地 media IDs
```

### 5.3 下载/展示

- Worker `/api/asset` 代理飞书 Drive 下载
- Content-Type 修正：MP4 魔数 → `audio/mp4`，WebM 魔数 → `audio/webm`
- 媒体 URL 携带认证 token

---

## 六、数据同步

### 6.1 同步策略

- **启动时**：先从 IndexedDB 加载本地数据立即显示，再后台 `syncFromCloud()`
- **创建记录时**：先本地创建，再推送到云端，上传媒体后用 file_tokens 替换本地 IDs
- **删除记录时**：本地和云端同步删除

### 6.2 syncFromCloud 流程

```
1. 并行请求云端 babies/records/growth（Promise.allSettled）
2. 全部失败 → 保留本地数据
3. 部分成功 → 清空本地 + 并行批量写入云端数据
4. 完成后自动刷新页面数据
```

---

## 七、PWA & 缓存

### 7.1 自动更新

- 监听 SW `controllerchange` 事件，自动刷新页面
- 每 30 分钟检查 SW 更新
- 切回页面时检查更新

### 7.2 缓存清理

- 超过 24 小时未刷新 → 清空 Cache Storage + reload
- 媒体文件缓存 1 小时过期
- `cleanupOutdatedCaches: true` 自动清理旧版本缓存

---

## 八、部署信息

| 组件 | 平台 | 地址 |
|------|------|------|
| 前端 | Cloudflare Pages | https://tongxi.xyz |
| 后端 | Cloudflare Worker | https://api.tongxi.xyz |
| 代码仓库 | GitHub | wanghaoyuwhywhywhy/baby-growth-record |

### 8.1 前端部署配置

- Framework preset: None
- Build command: `npm run build`
- Build output directory: `docs`
- Root directory: `baby-growth-record`
- GitHub Pages: 已禁用（防止 Jekyll 冲突）

### 8.2 Worker 环境变量

| 变量名 | 说明 |
|--------|------|
| FEISHU_APP_ID | 飞书应用 ID |
| FEISHU_APP_SECRET | 飞书应用密钥 |
| FEISHU_BASE_TOKEN | 多维表格 App Token |
| FEISHU_TABLE_BABY | 宝宝表 Table ID |
| FEISHU_TABLE_RECORD | 记录表 Table ID |
| FEISHU_TABLE_GROWTH | 成长表 Table ID |
| DEEPSEEK_API_KEY | DeepSeek API 密钥 |
| ACCESS_PASSWORD_HASH | 访问密码 SHA-256 哈希 |

### 8.3 飞书多维表格

| 表名 | Table ID |
|------|----------|
| 宝宝表 | REDACTED_TABLE_BABY |
| 记录表 | REDACTED_TABLE_RECORD |
| 成长表 | REDACTED_TABLE_GROWTH |

---

## 九、页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| / | HomePage | 首页（宝宝卡片+最近记录） |
| /record | RecordPage | 添加记录 |
| /timeline | TimelinePage | 成长时间线 |
| /baby/detail | BabyDetailPage | 宝宝档案详情 |
| /baby/edit | BabyEditPage | 编辑宝宝信息 |
| /growth | GrowthPage | 身高体重记录 |
| /settings | SettingsPage | 设置（已移除入口） |

---

## 十、文件结构

```
baby-growth-record/
├── worker/
│   ├── feishu-proxy.js          # Cloudflare Worker（API代理+认证）
│   └── wrangler.toml            # Worker 部署配置
├── src/
│   ├── api/
│   │   └── feishu.ts            # 飞书 API 封装（CRUD+同步）
│   ├── components/
│   │   ├── BabyCard.tsx         # 宝宝信息卡片
│   │   ├── CategoryPicker.tsx   # 分类选择器（横向胶囊）
│   │   ├── FloatingButton.tsx   # 浮动添加按钮
│   │   ├── MediaInput.tsx       # 媒体输入（录音+相机+相册）
│   │   ├── NavHeader.tsx        # 导航栏
│   │   └── RecordItem.tsx       # 记录条目（含语音播放+图片预览）
│   ├── hooks/
│   │   └── useSpeechRecognition.ts  # Web Speech API Hook
│   ├── lib/
│   │   ├── ai.ts                # AI 能力（分类/润色/分析）
│   │   ├── auth.ts              # 认证模块（登录/token管理）
│   │   ├── cloud.ts             # 云端 API 客户端
│   │   └── db.ts                # IndexedDB 数据库
│   ├── pages/
│   │   ├── HomePage.tsx         # 首页
│   │   ├── RecordPage.tsx       # 添加记录
│   │   ├── TimelinePage.tsx     # 成长时间线
│   │   ├── BabyDetailPage.tsx   # 宝宝档案
│   │   ├── BabyEditPage.tsx     # 编辑宝宝
│   │   ├── GrowthPage.tsx       # 身高体重
│   │   ├── LoginPage.tsx        # 登录页
│   │   └── SettingsPage.tsx     # 设置页（已移除入口）
│   ├── store/
│   │   └── useAppStore.ts       # Zustand 全局状态
│   ├── utils/
│   │   ├── constants.ts         # 常量（分类/表ID）
│   │   └── date.ts              # 日期工具
│   ├── App.tsx                  # 应用入口（认证+路由）
│   └── main.tsx                 # 渲染入口
├── docs/                        # 构建产物（Cloudflare Pages 部署）
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── PRODUCT.md                   # 本文档
```

---

## 十一、开发历史

### v1.0 MVP（2026-06）
- 基础记录功能：文字记录 + 分类
- 宝宝档案管理
- 飞书多维表格数据存储

### v1.1 媒体支持（2026-06）
- 图片上传与预览
- 飞书 Drive API 文件上传
- 云端媒体代理下载

### v1.2 语音能力（2026-06）
- 语音录音保存（MediaRecorder）
- 语音实时转文字（Web Speech API）
- 语音转文字独立字段（不填入文本框）
- 语音播放器（进度条+时长+转文字描述框）
- Safari/iOS MP4 格式兼容
- Worker Content-Type 魔数修正

### v1.3 AI 能力（2026-06）
- AI 自动分类（未手动选择时提交自动识别）
- AI 内容润色
- AI 成长分析

### v1.4 安全 & 优化（2026-06 ~ 2026-07）
- 密码保护（无状态 token 认证）
- CORS 白名单收紧
- 移除 debug 接口
- 页面加载优化（先本地后云端）
- PWA 自动更新 + 24h 缓存清理
- 固定单宝宝（移除新增/删除功能）
- 首页卡片显示备注
- 最近记录扩展到 10 条
- 媒体类型多选支持

---

## 十二、产品规划

### 短期（v1.5）

- [ ] 记录编辑功能：支持修改已有记录
- [ ] 记录搜索：按关键词搜索记录
- [ ] 数据导出：导出为 PDF/图片（成长册）
- [ ] 提醒功能：每日记录提醒推送

### 中期（v2.0）

- [ ] 多宝宝支持：家庭多宝切换
- [ ] 家庭共享：多人共同记录（微信/飞书分享）
- [ ] 成长周报/月报：自动生成成长报告
- [ ] 里程碑时间轴：重要节点单独展示
- [ ] 语音转文字优化：支持更多方言/语言

### 长期（v3.0）

- [ ] AI 育儿建议：基于记录的个性化育儿建议
- [ ] 社区功能：匿名化成长对比
- [ ] 打印服务：实体成长册打印
- [ ] 智能硬件接入：体重秤/身高仪自动记录

---

## 十三、已知问题 & 经验教训

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 图片刷新后丢失 | 上传 API 端点错误 + file_token 判断错 | Drive API 两步上传 + 排除本地 ID 前缀判断 |
| 语音无法播放 | Safari 输出 MP4 但标记为 webm | Worker 魔数检测修正 Content-Type + 前端动态 mimeType |
| 云端创建记录失败 | 飞书字段类型不匹配（单选→多选） | Worker ensureRecordFields 自动创建/修正字段 |
| 页面加载慢 | initApp 先等 syncFromCloud 再显示 | 先加载本地数据立即显示，后台同步 |
| Worker 重启后 token 失效 | token 存内存，重启清空 | 改为密码哈希确定性派生的无状态 token |
| 全局 fetch 拦截导致卡死 | img/audio 标签 401 触发登出 | 改为 API 层面 401 处理 + 自定义事件 |
| syncFromCloud 清空本地数据 | 先清空再逐条写入，断网丢数据 | Promise.allSettled + 全部失败保留本地 |
