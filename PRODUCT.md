# 宝宝成长记录 - 产品文档

> 最后更新：2026-07-03 00:30

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
│  │     ┌──────────┴──────────┐             │ │
│  │     │ localStorage 缓存   │             │ │
│  │     │ (auth/账号/聊天历史) │             │ │
│  │     └─────────────────────┘             │ │
│  └─────────────────────────────────────────┘ │
│                      │ HTTPS                  │
└──────────────────────┼───────────────────────┘
                       │
┌──────────────────────┼───────────────────────┐
│   Cloudflare Worker  │  api.tongxi.xyz        │
│  ┌───────────────────┴───────────────────┐   │
│  │         feishu-proxy.js               │   │
│  │  ┌──────────┐  ┌──────────┐          │   │
│  │  │账号认证   │  │CORS 白名单│          │   │
│  │  │AES加密    │  │          │          │   │
│  │  └──────────┘  └──────────┘          │   │
│  │  ┌──────────────────────────┐        │   │
│  │  │  API 代理 & 数据转换      │        │   │
│  │  │  /api/auth   (认证+verify)│        │   │
│  │  │  /api/babies              │        │   │
│  │  │  /api/records             │        │   │
│  │  │  /api/growth              │        │   │
│  │  │  /api/upload (Drive)      │        │   │
│  │  │  /api/asset  (代理下载)   │        │   │
│  │  │  /api/ai     (DeepSeek)  │        │   │
│  │  │  /api/log    (登录日志)   │        │   │
│  │  │  /api/vaccines (疫苗接种) │        │   │
│  │  │  /api/accounts(账号管理)  │        │   │
│  │  │  /api/migrate (数据迁移)  │        │   │
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
│  │  ┌────────┐ ┌────────┐ ┌────────┐    │   │
│  │  │疫苗表   │ │账号表   │ │登录日志 │    │   │
│  │  └────────┘ └────────┘ └────────┘    │   │
│  │  云盘 (Drive) - 媒体文件存储           │   │
│  └───────────────────────────────────────┘   │
│                                               │
│  DeepSeek API - AI 能力                       │
│  (自动分类 / 润色 / 分析 / 建议 / 咨询)      │
└───────────────────────────────────────────────┘
```

**数据流向**：所有数据操作都通过后端接口，前端不直连飞书。

```
前端 → Cloudflare Worker API → 飞书 Bitable API
```

| 操作 | 前端调用 | 后端处理 |
|------|---------|---------|
| 查询数据 | `GET /api/babies`、`/api/records` 等 | Worker 用 tenant_access_token 调飞书 API 查表，返回数据给前端 |
| 新增数据 | `POST /api/babies`、`/api/records` 等 | 前端传 fields，Worker 转发到飞书创建记录 |
| 修改数据 | `PUT /api/babies`、`/api/records` 等 | 前端传 record_id + fields，Worker 调飞书更新 |
| 删除数据 | `DELETE /api/xxx?record_id=xxx` | Worker 调飞书删除记录 |
| 文件上传 | `POST /api/upload` | Worker 代传到飞书云盘，拿回 file_token 写入附件字段 |
| 文件访问 | `GET /api/asset?file_token=xxx` | Worker 获取飞书临时下载链接，302 重定向到 CDN |
| AI 分析/咨询 | `POST /api/ai` | Worker 调 DeepSeek API，返回结果 |
| 登录认证 | `POST /api/auth` | Worker 查飞书账号表校验密码，返回 token |
| 账号管理 | `GET/POST/PUT/DELETE /api/accounts` | Worker 操作飞书账号表（仅 admin） |

### 2.2 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端框架 | React 18 + TypeScript | SPA 应用 |
| 构建 | Vite + vite-plugin-pwa | 快速构建 + PWA 支持 |
| 状态管理 | Zustand | 全局状态 |
| 本地存储 | localStorage | 认证token/账号缓存/聊天历史 |
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
| 记录时间 | 日期 | Unix 毫秒时间戳（可编辑） |
| 上传时间 | 日期 | 记录创建时间戳（后端字段，前端不展示） |
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

**登录日志表 (AccessLog)** — Worker 自动创建
| 字段 | 类型 | 说明 |
|------|------|------|
| 时间 | 日期 | 登录/登出时间 |
| 操作 | 文本 | login / logout |
| IP | 文本 | 访问者 IP（CF-Connecting-IP） |
| 设备型号 | 文本 | 解析后的设备类型（iPhone/Android/Mac 等） |
| 系统版本 | 文本 | 详细系统版本（iOS 17.5/Android 14 等） |
| 登录账号 | 文本 | 登录的账号名 |

**账号表 (Account)** — Worker 自动创建
| 字段 | 类型 | 说明 |
|------|------|------|
| 账号名 | 文本 | 登录账号名（唯一） |
| 加密密码 | 文本 | AES-256-GCM 加密后的密码（不可明文） |
| 权限 | 单选 | view / edit / admin |
| 最后修改时间 | 日期 | 最后修改时间戳 |

**疫苗接种表 (Vaccine)** — Worker 自动创建
| 字段 | 类型 | 说明 |
|------|------|------|
| 疫苗名称 | 文本 | 疫苗名称（如乙肝疫苗第1剂） |
| 月龄 | 数字 | 预计接种月龄 |
| 接种状态 | 单选 | 未接种/已接种 |
| 预计接种日期 | 日期 | 根据宝宝出生日期+月龄自动计算 |
| 实际接种日期 | 日期 | 接种后填写的实际接种日期 |
| 剂次 | 数字 | 第几剂（1/2/3/4） |
| 疫苗类型 | 单选 | 免费/自费 |
| 备注 | 文本 | 可选备注 |
| 关联宝宝 | 关联字段 | 关联宝宝表 |

---

## 三、功能模块

### 3.1 账号登录

- **账号表登录**：用户输入账号名+密码，Worker 查飞书账号表校验
- **三级权限区分**：
  - admin（管理员）：全部操作 + 账号管理
  - edit（编辑）：可增删改记录
  - view（查看）：只读，可浏览所有记录
- **密码安全**：AES-256-GCM 加密存储（密钥存 Worker 环境变量 AES_ENCRYPT_KEY），不可明文展示/存储
- **旧格式兼容**：仍支持旧 `role:hash` 格式 token（旧密码登录），自动分配 accountName=legacy
- **Token 格式 v3**：`role:accountName:hash`，确定性派生，Worker 重启不影响
- **前端 token 存储**：localStorage，401 时自动跳转登录页
- **媒体 URL**：图片/语音/视频 URL 也携带 token 参数
- **账号验证**：页面刷新时 /api/auth verify 检查账号是否仍存在，不存在自动登出
- **登录/登出日志**：自动记录到飞书"登录日志"表（时间、操作、IP、设备型号、系统版本、登录账号）
- **登录后跳转**：默认跳转首页（清除 hash）
- **admin 首次登录**：引导设置密码（needsSetup 弹窗）

### 3.2 设置页

- 所有页面右上角设置为齿轮图标，点击进入设置页
- 显示当前登录账号名和权限
- 退出登录按钮（立即跳转，日志后台发送）
- **账号管理**（仅 admin 可见）：账号列表+新增/编辑/删除，不可删除自己
  - localStorage 缓存账号列表，秒级显示，后台静默刷新

### 3.3 首页

- **宝宝卡片**：显示姓名、年龄、性别、身高体重、出生日期、备注
- **快捷入口**：4列小卡片并排（身高体重/疫苗接种/AI分析/AI咨询）
- **最近记录**：最近 10 条记录（支持语音播放、图片预览、语音转文字）
- **浮动添加按钮**：快速添加记录

### 3.4 添加记录

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

### 3.5 成长时间线

- **分类筛选**：全部 + 各分类
- **媒体类型筛选**：全部/文字/语音/图片/视频
  - 文字：纯文字记录
  - 语音：包含 voice 类型的记录
  - 图片：包含 photo 类型的记录
  - 视频：包含 video 类型的记录
- **语音播放**：播放按钮 + 实时进度条 + 时长显示 + 转文字描述框
- **图片预览**：点击全屏预览
- **视频播放**：内联播放控件
- **编辑记录**（编辑权限）：点击铅笔图标可修改记录时间和分类

### 3.6 身高体重

- 记录身高、体重、测量日期、备注
- 成长曲线图表
- 与同龄标准对比

### 3.7 宝宝档案

- 查看宝宝基本信息（姓名、性别、出生日期、年龄）
- 爸爸妈妈信息
- 编辑宝宝信息
- 固定单宝宝，不支持新增/删除

### 3.8 疫苗接种

- **2025版国家免疫规划免费疫苗**：24 种（乙肝、卡介苗、脊灰、百白破5剂次、麻腮风、乙脑、A群流脑、甲肝减毒、白破、A+C群流脑等）
- **非免疫规划自费疫苗**：29 种（13价肺炎、五联、轮状病毒、Hib、EV71手足口、水痘、流感、23价肺炎、四联、AC结合、甲肝灭活等）
- **"+添加疫苗"按钮**：点击弹出底部选择弹窗，支持搜索和免费/自费筛选
- **批量添加**：按疫苗名称一键添加所有剂次
- **按月龄分组时间线**：出生/1月/2月/3月/4月/5月/6月/7月/8月/9月/12月/18月/2岁/3岁/4岁/6岁
- **预计接种时间**：根据宝宝出生日期+月龄自动计算显示
- **接种操作**：点击"未接种"按钮弹出日期选择器，确认后变更为"已接种"
- **状态显示**：未接种显示预计时间，已接种显示实际接种日期
- **首次加载**：自动创建所有免费疫苗记录到飞书表

### 3.9 AI 能力

| 能力 | 调用时机 | 说明 |
|------|----------|------|
| 自动分类 | 提交记录时（未手动选择） | 根据内容识别分类 |
| 内容润色 | 用户点击"AI 润色" | 使文字更温暖有画面感 |
| 成长分析 | 用户点击"AI 成长分析" | 综合分析发育趋势 |
| 记录建议 | 预留 | 根据最近记录建议新内容 |
| AI 咨询 | 用户进入AI咨询页面 | 流式对话，结合宝宝数据回答育儿问题 |

### 3.10 AI 咨询

- **入口**：首页 AI 咨询卡片 → /chat 页面
- **聊天界面**：消息列表 + 底部输入区域
- **AI 名字**：小嘻（专业儿童成长顾问）
- **上下文**：自动携带宝宝档案+身高体重+成长记录+疫苗接种全部数据
- **流式响应**：DeepSeek SSE 流式输出，逐字显示
- **语音输入**：Web Speech API（zh-CN），点击麦克风按钮开始/停止
- **文字输入**：textarea，Enter发送，Shift+Enter换行，自动调整高度
- **快捷问题**：空消息时显示3个推荐问题（发育评估/疫苗提醒/早教建议）
- **多轮对话**：支持上下文连续问答
- **中止请求**：AbortController，页面卸载时自动中止

---

## 四、安全设计

### 4.1 认证机制

- **账号登录**：飞书账号表存储账号名+加密密码+权限
- **密码加密**：AES-256-GCM（密钥 AES_ENCRYPT_KEY 存 Worker 环境变量），fallback SHA-256 兼容旧数据
- **Token 格式 v3**：`role:accountName:SHA256(密码哈希 + ":baby-growth-auth-v3:" + role + ":" + accountName)`，确定性派生
- **旧格式兼容**：`role:hash` 格式 token（accountName=legacy），仍可登录
- **Token 传递**：API 请求通过 `X-Auth-Token` 头；媒体资源通过 URL `token` 参数
- **权限控制**：写操作（POST/PUT/DELETE）需要 `edit` 或 `admin` 角色；`/api/log`、`/api/ai` 只需认证
- **账号管理**：`/api/accounts` 仅 admin 可操作
- **账号验证**：页面刷新时 /api/auth verify 检查账号是否仍存在
- **登录日志**：自动记录到飞书"登录日志"表（时间、操作、IP、设备型号、系统版本、登录账号）

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
- Root directory: `/`（根目录即项目目录）
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
| FEISHU_TABLE_ACCOUNT | 账号表 Table ID（可选，不设则自动查找/创建） |
| DEEPSEEK_API_KEY | DeepSeek API 密钥 |
| AES_ENCRYPT_KEY | 密码 AES-256-GCM 加密密钥（64位十六进制） |
| EDIT_PASSWORD_HASH | 编辑密码 SHA-256 哈希（旧格式兼容） |
| VIEW_PASSWORD_HASH | 查看密码 SHA-256 哈希（旧格式兼容） |
| ACCESS_PASSWORD_HASH | 旧版访问密码 SHA-256 哈希（兼容） |

### 8.3 飞书多维表格

| 表名 | Table ID |
|------|----------|
| 宝宝表 | REDACTED_TABLE_BABY |
| 记录表 | REDACTED_TABLE_RECORD |
| 成长表 | REDACTED_TABLE_GROWTH |
| 登录日志表 | REDACTED_TABLE_LOG |
| 疫苗接种表 | REDACTED_TABLE_VACCINE |
| 账号表 | Worker 自动创建 |

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
| /settings | SettingsPage | 设置（含账号管理） |
| /vaccine | VaccinePage | 疫苗接种记录 |
| /chat | AIChatPage | AI 咨询对话 |

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
│   │   ├── CalendarPicker.tsx   # 通用日历选择器（月导航+年翻页+maxDate）
│   │   ├── CategoryPicker.tsx   # 分类选择器（横向胶囊）
│   │   ├── FloatingButton.tsx   # 浮动添加按钮
│   │   ├── MediaInput.tsx       # 媒体输入（录音+相机+相册）
│   │   ├── NavHeader.tsx        # 导航栏（支持titleAction）
│   │   └── RecordItem.tsx       # 记录条目（含语音播放+视频重试+图片预览）
│   ├── hooks/
│   │   └── useSpeechRecognition.ts  # Web Speech API Hook
│   ├── lib/
│   │   ├── ai.ts                # AI 能力（分类/润色/分析/流式咨询）
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
│   │   ├── SettingsPage.tsx     # 设置页
│   │   ├── VaccinePage.tsx     # 疫苗接种
│   │   └── AIChatPage.tsx      # AI 咨询对话
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

### v1.5 双密码 & 编辑（2026-07）
- 双密码权限区分（查看密码=只读，编辑密码=增删改）
- 所有页面右上角设置按钮（替代时间线图标）
- 退出登录 + 切换账号功能
- 登录后默认跳转首页
- 时间线编辑功能（编辑权限可修改记录时间+分类）
- 上传时间字段（后端字段，前端不展示，创建时自动填充）
- 历史数据上传时间回填（/api/migrate）
- 登录日志表（时间/操作/IP/设备型号/系统版本/登录账号）
- /api/migrate 数据迁移端点（含日期格式修正）
- /api/log 登录日志端点
- Worker 部署名修正（baby-growth-api）
- 视频语音 Content-Type 修正（type 参数区分）
- 飞书日期字段格式统一为 yyyy-MM-dd HH:mm:ss
- PRODUCT.md 文档持续维护

### v1.6 时间线优化 & 媒体下载重构（2026-07）
- 分类新增：学习 📖、玩耍 🎮
- 时间线懒加载：初始显示 10 条，滚动到底部自动加载更多（IntersectionObserver）
- 时间选择器改为日历+滚轮样式（年月日历面板 + 时分秒滚轮列）
- 支持"现在"快捷按钮一键设置当前时间
- 媒体下载重构：使用飞书 `batch_get_tmp_download_url` API
  - 语音：Worker 代理下载 + Content-Type 修正（video/webm→audio/webm，video/mp4→audio/mp4）
  - 照片/视频：302 重定向到飞书 CDN，避免大文件代理导致超时
- 编辑图标移至行末（ml-auto）

### v1.7 疫苗接种（2026-07）
- 疫苗接种表：Worker 自动创建（疫苗名称/月龄/接种状态/预计接种日期/实际接种日期/剂次/费用类型/备注/关联宝宝）
- 2025版国家免疫规划免费疫苗24种（乙肝、卡介苗、脊灰、百白破5剂次、麻腮风、乙脑、A群流脑、甲肝、白破、A+C群流脑等）
- 29种非免疫规划自费疫苗（13价肺炎、五联、轮状病毒、Hib、EV71手足口、水痘、流感、23价肺炎、四联、AC结合、甲肝灭活等）
- 首页快捷入口改为3列小卡片并排排列（身高体重/疫苗接种/AI分析）
- "+添加疫苗"按钮在标题文字右侧（虚线框），点击弹出底部选择弹窗，支持搜索和免费/自费筛选
- 可按疫苗名称批量添加，或逐剂次单独添加
- 已添加疫苗自动从选择列表中过滤
- 按月龄分组时间线展示，2周岁前以月龄展示（如18月龄），2周岁后以周岁展示
- 月龄动态计算：修改预计/实际接种时间后根据宝宝出生日期重新分组
- 预计接种时间：根据宝宝出生日期+月龄自动计算，支持点击编辑修改
- 接种时间也支持修改
- CalendarPicker 通用日历选择器组件：替代原生 date input
  - 月导航 `<< < 年月 > >>`，双箭头为年份翻页，单箭头为月份翻页，颜色统一
  - 星期头+日期网格+今天快捷按钮+确认
  - 固定6行显示，避免5/6行切换时高度跳动
  - 支持 maxDate 限制（如出生日期不超过今天）
- 宝宝档案出生日期改用 CalendarPicker 日历弹窗选择
- 成长时间线编辑记录时间选择器也增加年份翻页 `<< >>`
- NavHeader 新增 titleAction prop，标题后渲染额外元素（添加疫苗按钮），最右侧保留 rightAction（设置按钮）
- 疫苗编辑权限控制：浏览账号不能添加/编辑/接种疫苗（isEditMode() 判断）
- 点击"未接种"按钮弹出日历选择接种日期，确认后变更为"已接种"
- 已接种左侧显示实际接种日期，未接种显示"预计接种时间"（可编辑）
- 关联字段类型修复：type 7(复选框)→type 18(单向关联)
- ensureVaccineTable 策略：表已存在直接返回 ID，不再补全字段（避免重复创建）
- 费用类型从"付款"改为"自费"
- /vaccine 路由 → VaccinePage
- /api/vaccines 路由：GET/POST/PUT/DELETE 疫苗 CRUD

### v1.8 媒体加载修复 & 体验优化（2026-07）
- **PWA 媒体缓存移除**：/api/asset 不再经 service worker CacheFirst 缓存
  - 根因：跨域 302 重定向被 SW 缓存为 opaque 响应（status 0），<video>/<audio> 无法做 Range 请求导致加载失败
  - 浏览器原生 HTTP 缓存已足够处理媒体文件
- **Worker 302 重定向加 CORS 头**：`new Response(null, {status:302, headers:{Location,...CORS}})` 替代 `Response.redirect()`
- **视频/语音 onError 自动重试**：RecordItem 和 TimelinePage 中 <video>/<audio> 加 retry 逻辑（最多2次，间隔递增1s/2s）
- **退出登录秒回**：不再 await 日志请求，先 clearAuthInfo + 立即刷新，日志后台发送

### v1.9 AI 咨询模块（2026-07）
- **AI 咨询页面**（/chat → AIChatPage）
  - 聊天界面：消息列表 + 底部输入区域（语音按钮+文本框+发送按钮）
  - AI 名字"小嘻"，定位为专业儿童成长顾问
  - 自动携带宝宝档案+身高体重+成长记录+疫苗接种作为上下文
  - DeepSeek SSE 流式响应，逐字显示回答内容
  - 多轮对话：支持上下文连续问答
  - 语音输入：Web Speech API（zh-CN），点击麦克风按钮开始/停止
  - 文字输入：textarea，Enter发送，Shift+Enter换行，自动调整高度
  - 快捷问题：空消息时显示3个推荐问题（发育评估/疫苗提醒/早教建议）
  - AbortController 支持中止请求，页面卸载时自动中止
- **首页快捷入口**：3列改为4列（身高体重/疫苗接种/AI分析/AI咨询）
- **Worker chat action**：/api/ai 新增 chat action，返回 SSE 流式 Response（带 CORS 头）
- **chatStream 函数**：前端 ai.ts 新增 SSE 流解析函数，逐 chunk 回调显示

### v1.10 账号体系 & 安全加固（2026-07）
- **账号管理系统**：飞书"账号表"（账号名/加密密码/权限/最后修改时间）
  - 三级权限：浏览(view) / 编辑(edit) / 管理员(admin)
  - 自动初始化admin账号，首次登录引导设置密码
  - /api/accounts CRUD API，仅admin可操作
  - 不可删除自己的账号
- **密码安全**：AES-256-GCM加密存储（密钥Worker环境变量AES_ENCRYPT_KEY），不可明文展示/存储
- **账号登录**：登录页改为账号+密码登录，匹配账号表
- **账号验证**：页面刷新时verify action检查账号是否仍存在，不存在自动登出
- **登录日志**：日志表增加"登录账号"字段
- **密码小眼睛**：登录页和账号管理密码输入框可切换显示/隐藏明文
- **AI分析取消**：再次点击AI分析按钮可取消/中断分析
- **AI咨询优化**：输入框固定底部（height:100dvh，shrink-0），用宝宝名字称呼+家长替代
- **AI咨询历史**：localStorage持久化聊天记录（最多50条），支持清空
- **设置页**：移除同步模块，新增账号管理区域（admin可见）
- **首页**：快捷入口3列→4列，并行上传优化
- **登录页**：居中图标标题，左对齐输入框，小眼睛图标preventDefault保持输入法

### v1.11 性能优化 & 仓库迁移（2026-07）
- **Git 仓库根目录迁移**：从 `/Users/wanghaoyu68/Trae` 改为 `/Users/wanghaoyu68/Trae/baby-growth-record`，避免上传项目外文件
- **登录速度优化**：
  - Worker 缓存 adminExists 标记，跳过 ensureDefaultAdmin 重复查询
  - 前端去掉每次登录的 /api/migrate 调用（数据已迁移完成）
- **账号列表秒级显示**：localStorage 缓存账号数据，先显示缓存后静默刷新
- **视频播放**：playsInline 防止移动端默认全屏，"男宝/女宝"改为"男孩/女孩"
- **Cloudflare Pages Root directory**：从 `baby-growth-record` 改为 `/`
- **GitHub Actions deploy.yml**：路径从 `baby-growth-record/worker` 改为 `worker`

---

## 十二、产品规划

### 短期（v1.8）

- [ ] 记录内容编辑：支持修改记录文字内容
- [ ] 记录删除：支持删除已有记录
- [ ] 记录搜索：按关键词搜索记录
- [ ] 数据导出：导出为 PDF/图片（成长册）

### 中期（v2.0）

- [ ] 多宝宝支持：家庭多宝切换
- [ ] 家庭共享：多人共同记录（微信/飞书分享）
- [ ] 成长周报/月报：自动生成成长报告
- [ ] 里程碑时间轴：重要节点单独展示
- [ ] 语音转文字优化：支持更多方言/语言

### 长期（v3.0）

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
| 语音 token 分配错误 | 多媒体记录中 cloudTokens[0] 可能不是 voice | assignTokenTypes 按 voice→video→photo 优先级分配 |
| 语音/视频 Content-Type 错误 | 飞书返回 video/webm，Safari 无法在 audio 标签播放 | Worker 代理语音 + 魔数检测修正 Content-Type |
| 大文件代理超时 | Worker 代理下载 10MB+ 视频容易超时 | 照片/视频 302 重定向到飞书 CDN，仅语音走代理 |
| 时间线一次性加载太多 | 所有记录同时渲染导致语音/视频并发加载失败 | IntersectionObserver 懒加载，初始 10 条，滚动加载更多 |
| 视频/语音加载失败（控制台可访问） | PWA SW CacheFirst 缓存 302 为 opaque 响应，无法 Range 请求 | 移除 /api/asset 的 runtimeCaching + Worker 302 加 CORS 头 + 前端 retry |
| 退出登录卡几秒 | await cloudLogAccess('logout') 阻塞跳转 | 先 clearAuthInfo + 立即刷新，日志后台发送 |
| 疫苗表字段重复创建 | ensureVaccineTable 每次补全缺失字段 | 表已存在直接返回 ID，不再补全 |
| 日历5/6行切换高度跳动 | 部分月份占5行，部分6行 | 固定6行，多余行填充下月日期 |
