/**
 * 宝宝成长记录 - 飞书 API 代理（带密码保护）
 */
const FEISHU_API = 'https://open.feishu.cn/open-apis';

// 统一解析飞书文本字段（飞书可能返回字符串或富文本数组 [{text:'xxx',type:'text'}]）
function getText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return field.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && item.text !== undefined) return item.text;
    return '';
  }).join('');
  return String(field);
}

// 收紧 CORS：仅允许自己的前端域名
const ALLOWED_ORIGINS = [
  'https://tongxi.xyz',
  'https://baby-growth-record.pages.dev',
  'http://localhost:5173', // 本地开发
];

function getCORSHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
  };
}

// ============ 账号认证（兼容旧密码认证） ============
// 新 token 格式：role:accountName:hash  例如 "admin:admin:abc123..." 或 "view:guest:def456..."
// 旧 token 格式：role:hash  例如 "edit:abc123..." 或 "view:def456..."
// Worker 解析 token 前缀判断角色，校验哈希部分

// SHA-256 哈希
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// AES-256-GCM 加密/解密辅助函数
function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function aesEncrypt(plaintext, keyHex) {
  const key = await crypto.subtle.importKey('raw', hexToBuffer(keyHex), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return bufferToHex(iv) + ':' + bufferToHex(encrypted);
}

async function aesDecrypt(ciphertext, keyHex) {
  const key = await crypto.subtle.importKey('raw', hexToBuffer(keyHex), { name: 'AES-GCM' }, false, ['decrypt']);
  const parts = ciphertext.split(':');
  const iv = hexToBuffer(parts[0]);
  const data = hexToBuffer(parts[1]);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// 加密密码：优先AES-256-GCM，fallback到SHA-256
async function encryptPassword(plaintext, env) {
  const aesKey = env.AES_ENCRYPT_KEY;
  if (aesKey) {
    return await aesEncrypt(plaintext, aesKey);
  }
  return await sha256(plaintext);
}

// 解析 UA 为详细系统版本
function parseOS(ua) {
  // iOS
  let m = ua.match(/iPhone OS (\d+[._]\d+)/);
  if (m) return 'iOS ' + m[1].replace('_', '.');
  // iPadOS
  m = ua.match(/iPad.*OS (\d+[._]\d+)/);
  if (m) return 'iPadOS ' + m[1].replace('_', '.');
  // Android
  m = ua.match(/Android (\d+(\.\d+)?)/);
  if (m) return 'Android ' + m[1];
  // macOS
  m = ua.match(/Mac OS X (\d+[._]\d+)/);
  if (m) return 'macOS ' + m[1].replace('_', '.');
  // Windows
  m = ua.match(/Windows NT (\d+\.\d+)/);
  if (m) {
    const winMap = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    return 'Windows ' + (winMap[m[1]] || m[1]);
  }
  return '未知';
}

// 从密码哈希派生确定性 token，带角色和账号名前缀
// 新格式：role:accountName:hash
async function deriveToken(passwordHash, role, accountName) {
  const hash = await sha256(passwordHash + ':baby-growth-auth-v3:' + role + ':' + accountName);
  return `${role}:${accountName}:${hash}`;
}

// 解析 token 字符串，返回 { role: 'edit'|'view'|'admin', accountName, valid: boolean }
// 格式：role:accountName:hash（三段）
function parseAuthToken(tokenString) {
  if (!tokenString) return { role: null, accountName: null, valid: false };

  const parts = tokenString.split(':');
  if (parts.length >= 3) {
    const role = parts[0];
    const accountName = parts[1];
    if (role !== 'edit' && role !== 'view' && role !== 'admin' && role !== 'superadmin') {
      return { role: null, accountName: null, valid: false };
    }
    if (!accountName) {
      return { role: null, accountName: null, valid: false };
    }
    // token格式正确，但还需验证账号存在（由调用方负责）
    return { role, accountName, valid: true };
  }

  // 旧格式（两段）和无效格式一律拒绝
  return { role: null, accountName: null, valid: false };
}

// 从 Request 对象中提取并解析 token
async function parseAuth(request, env) {
  const token = request.headers.get('X-Auth-Token')
    || new URL(request.url).searchParams.get('token');
  return parseAuthToken(token);
}

// 获取 auth 对应的账号ID（账号表record_id，带缓存）
async function getAuthAccountId(auth, env) {
  if (!auth.accountName) return null;
  const info = await getAccountInfo(auth.accountName, env);
  return info?.record_id || null;
}

// 账号存在性缓存（避免每次请求都查飞书）
let validAccountsCache = { accounts: new Set(), expires: 0 };

// 验证账号是否仍存在于账号表中（带缓存，5分钟TTL）
async function verifyAccountExists(accountName, env) {
  const now = Date.now();
  if (validAccountsCache.expires > now && validAccountsCache.accounts.has(accountName)) {
    return true;
  }
  try {
    const accountInfo = await getAccountInfo(accountName, env);
    if (!accountInfo) return false;
    if (accountInfo.status !== '正常') return false;
    await refreshValidAccountsCache(env);
    return true;
  } catch (e) {
    console.error('[verifyAccountExists] 查询异常:', e.message);
    return true;
  }
}

// 刷新有效账号缓存
async function refreshValidAccountsCache(env) {
  try {
    const feishuToken = await getTenantToken(env);
    const tableId = await ensureAccountTable(feishuToken, env);
    const appToken = env.FEISHU_BASE_TOKEN;
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const listData = await listResp.json();
    if (listData.code === 0 && listData.data?.items) {
      const accounts = new Set();
      for (const item of listData.data.items) {
        const name = getText(item.fields?.['账号名']);
        if (name) accounts.add(name);
      }
      validAccountsCache = { accounts, expires: Date.now() + 5 * 60 * 1000 }; // 5分钟TTL
    }
  } catch (e) {
    console.error('[refreshValidAccountsCache] 异常:', e.message);
  }
}

// 查找或创建"账号表"，返回表 ID
let accountTableIdCache = null;
async function ensureAccountTable(token, env) {
  if (accountTableIdCache) return accountTableIdCache;

  const appToken = env.FEISHU_BASE_TOKEN;
  let tableId = null;

  // 如果环境变量中有 FEISHU_TABLE_ACCOUNT，优先使用
  if (env.FEISHU_TABLE_ACCOUNT) {
    tableId = env.FEISHU_TABLE_ACCOUNT;
  } else {
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const listData = await listResp.json();
    const tables = listData.data?.items || [];
    const existing = tables.find(t => t.name === '账号表');
    if (existing) {
      tableId = existing.table_id;
    }
  }

  if (!tableId) {
    // 创建"账号表"
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;
    const createResp = await fetch(listUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: { name: '账号表' } }),
    });
    const createData = await createResp.json();
    if (createData.code !== 0) {
      throw new Error(`创建账号表失败: ${createData.msg}`);
    }
    tableId = createData.data?.table_id;
    if (!tableId) {
      throw new Error('创建账号表成功但未获取到 table_id');
    }
  }

  // 检查并补充缺失字段
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const fieldsData = await fieldsResp.json();
  const existingFieldItems = fieldsData.data?.items || [];
  const existingFields = existingFieldItems.map(f => f.field_name);

  // 创建时间字段如果是数字类型(type 2)则删除重建为日期类型(type 5)
  const createTimeField = existingFieldItems.find(f => f.field_name === '创建时间');
  if (createTimeField && createTimeField.type === 2) {
    // 先保存已有数据
    const recordsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500`;
    const recordsResp = await fetch(recordsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const recordsData = await recordsResp.json();
    const createTimeMap = {};
    if (recordsData.code === 0 && recordsData.data?.items) {
      for (const item of recordsData.data.items) {
        if (item.fields?.['创建时间']) {
          createTimeMap[item.record_id] = item.fields['创建时间'];
        }
      }
    }
    // 删除旧字段
    await fetch(`${fieldsUrl}/${createTimeField.field_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    // 创建新的日期类型字段
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_name: '创建时间', type: 5 }),
    });
    // 回填数据
    for (const [recordId, value] of Object.entries(createTimeMap)) {
      const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
      await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { '创建时间': value } }),
      });
    }
  }

  const accountFields = [
    { field_name: '账号ID', type: 1 },
    { field_name: '加密密码', type: 1 },
    { field_name: '权限', type: 3, property: { options: [{ name: 'superadmin' }] } },
    { field_name: '状态', type: 3, property: { options: [{ name: '正常' }, { name: '冻结' }, { name: '删除' }, { name: '待审批' }, { name: '审批未通过' }] } },
    { field_name: '最后修改时间', type: 5 },
    { field_name: '最后登录时间', type: 5 },
    { field_name: '创建时间', type: 5 },
  ];
  for (const field of accountFields) {
    if (!existingFields.includes(field.field_name)) {
      await fetch(fieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(field),
      });
    }
  }

  accountTableIdCache = tableId;
  return tableId;
}

// 确保默认 admin 账号存在
async function ensureDefaultAdmin(token, env, tableId) {
  // 如果已确认admin存在，跳过
  if (adminExistsCache) return;

  const appToken = env.FEISHU_BASE_TOKEN;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=1`;
  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const listData = await listResp.json();

  // 如果账号表不为空，不需要创建默认账号
  if (listData.code === 0 && listData.data?.items?.length > 0) {
    adminExistsCache = true;
    return;
  }

  // 创建默认 admin 账号（默认密码 admin123）
  const encryptedPassword = await encryptPassword('admin123', env);
  const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
  await fetch(recordUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        '账号名': 'admin',
        '加密密码': encryptedPassword,
        '权限': 'superadmin',
        '状态': '正常',
        '最后修改时间': Date.now(),
        '创建时间': Date.now(),
      },
    }),
  });
  adminExistsCache = true;
}

// 查找或创建"账号宝宝关联"表，返回表 ID
async function ensureAccountBabyTable(token, env) {
  if (accountBabyTableIdCache) return accountBabyTableIdCache;

  const appToken = env.FEISHU_BASE_TOKEN;
  let tableId = null;
  let isNewTable = false;

  // 优先使用环境变量中的表 ID
  if (env.FEISHU_TABLE_ACCOUNT_BABY) {
    tableId = env.FEISHU_TABLE_ACCOUNT_BABY;
  } else {
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const listData = await listResp.json();
    const tables = listData.data?.items || [];
    const existing = tables.find(t => t.name === '账号宝宝关联');
    if (existing) {
      tableId = existing.table_id;
    }
  }

  if (!tableId) {
    // 表不存在，创建新表
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;
    const createResp = await fetch(listUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: { name: '账号宝宝关联' } }),
    });
    const createData = await createResp.json();
    if (createData.code !== 0) {
      throw new Error(`创建账号宝宝关联表失败: ${createData.msg}`);
    }
    tableId = createData.data?.table_id;
    if (!tableId) {
      throw new Error('创建账号宝宝关联表成功但未获取到 table_id');
    }
    isNewTable = true;
  }

  // 检查并补充缺失字段（无论新表还是已有表）
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const fieldsData = await fieldsResp.json();
  const existingFields = (fieldsData.data?.items || []).map(f => f.field_name);

  const abFields = [
    { field_name: '账号名', type: 1 },
    { field_name: '账号ID', type: 1 },
    { field_name: '宝宝ID', type: 1 },
    { field_name: '关联宝宝', type: 21, property: { table_id: env.FEISHU_TABLE_BABY, multiple: true } },
    { field_name: '角色', type: 3, property: { options: [{ name: 'owner' }, { name: 'editor' }, { name: 'viewer' }, { name: 'unlinked' }] } },
    { field_name: '关系', type: 3, property: { options: [{ name: '爸爸' }, { name: '妈妈' }, { name: '爷爷' }, { name: '奶奶' }, { name: '外公' }, { name: '外婆' }, { name: '姑姑' }, { name: '叔叔' }, { name: '舅舅' }, { name: '阿姨' }, { name: '其他' }] } },
    { field_name: '邀请码', type: 1 },
    { field_name: '修改人账号', type: 1 },
    { field_name: '修改时间', type: 2 },
  ];
  for (const field of abFields) {
    if (!existingFields.includes(field.field_name)) {
      try {
        await fetch(fieldsUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(field),
        });
      } catch (e) {
        // 关联字段创建可能因权限不足失败，静默忽略
      }
    }
  }

  accountBabyTableIdCache = tableId;
  return tableId;
}

// 获取账号关联的宝宝ID列表（带缓存，5分钟TTL）
// accountId: 账号表record_id（必须）
async function getAccountBabyIds(accountId, accountName, env) {
  if (!accountId) return [];
  const cacheKey = accountId;
  const now = Date.now();
  if (accountBabyCache.expires > now && accountBabyCache.data.has(cacheKey)) {
    return accountBabyCache.data.get(cacheKey);
  }

  try {
    const feishuToken = await getTenantToken(env);
    const tableId = await ensureAccountBabyTable(feishuToken, env);
    const appToken = env.FEISHU_BASE_TOKEN;
    // 只用账号ID查询
    const filterStr = `CurrentValue.[账号ID]="${accountId}"`;
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const listData = await listResp.json();

    const links = [];
    if (listData.code === 0 && listData.data?.items) {
      for (const item of listData.data.items) {
        const babyId = getText(item.fields?.['宝宝ID']);
        const role = getText(item.fields?.['角色']) || 'viewer';
        // 跳过已解绑的记录
        if (babyId && role !== 'unlinked') {
          links.push({
            babyId,
            role,
            relation: getText(item.fields?.['关系']) || '其他',
            record_id: item.record_id,
          });
        }
      }
    }

    accountBabyCache.data.set(cacheKey, links);
    accountBabyCache.expires = now + 5 * 60 * 1000;
    return links;
  } catch (e) {
    console.error('[getAccountBabyIds] Error:', e.message);
    return [];
  }
}

// 检查账号对某宝宝是否有写权限
async function canWriteBaby(accountId, accountName, babyId, env) {
  if (!accountId) return false;
  const links = await getAccountBabyIds(accountId, accountName, env);
  const link = links.find(l => l.babyId === babyId);
  return link && (link.role === 'owner' || link.role === 'editor');
}

// 将账号关联到宝宝（accountId必须非空）
async function linkAccountToBaby(accountId, accountName, babyId, role, env, relation) {
  if (!accountId) return; // 无账号ID不关联
  const feishuToken = await getTenantToken(env);
  const tableId = await ensureAccountBabyTable(feishuToken, env);
  const appToken = env.FEISHU_BASE_TOKEN;
  const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;

  // 检查是否已存在关联（只用账号ID+宝宝ID匹配）
  const filterStr = `CurrentValue.[账号ID]="${accountId}"&&CurrentValue.[宝宝ID]="${babyId}"`;
  const checkUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
  const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
  const checkData = await checkResp.json();

  if (checkData.code === 0 && checkData.data?.items?.length > 0) {
    // 已存在，更新关系和角色（包括从 unlinked 恢复）
    const existingRecordId = checkData.data.items[0].record_id;
    const updateFields = {};
    if (relation) updateFields['关系'] = relation;
    if (role) updateFields['角色'] = role;
    if (accountId) updateFields['账号ID'] = accountId;
    updateFields['关联宝宝'] = [babyId]; // 更新双向关联字段
    updateFields['修改人账号'] = accountName;
    updateFields['修改时间'] = Date.now();
    if (Object.keys(updateFields).length > 0) {
      const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${existingRecordId}`;
      await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: updateFields }),
      });
    }
    accountBabyCache = { data: new Map(), expires: 0 };
    return;
  }

  // 先创建记录（不含关联宝宝字段），再用PUT写入双向关联
  // 直接POST时传关联宝宝字段，飞书可能返回成功但实际未建立关联
  const fields = {
    '账号名': accountName,
    '账号ID': accountId || '',
    '宝宝ID': babyId,
    '角色': role || 'owner',
  };
  if (relation) fields['关系'] = relation;
  fields['修改人账号'] = accountName;
  fields['修改时间'] = Date.now();

  const createResp = await fetch(recordUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const createData = await createResp.json();

  // 创建成功后，单独PUT写入关联宝宝双向关联字段
  if (createData.code === 0 && createData.data?.record?.record_id) {
    const newRecordId = createData.data.record.record_id;
    const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${newRecordId}`;
    await fetch(updateUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { '关联宝宝': [babyId] } }),
    });
  }

  accountBabyCache = { data: new Map(), expires: 0 };
}

// 生成邀请码（6位随机字母数字）
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'INV-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 创建邀请码：将邀请码写入关联表（账号名为空，等待被领取）
async function createInviteCode(babyId, role, relation, env) {
  const feishuToken = await getTenantToken(env);
  const tableId = await ensureAccountBabyTable(feishuToken, env);
  const appToken = env.FEISHU_BASE_TOKEN;
  const code = generateInviteCode();
  const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
  await fetch(recordUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        '账号名': '',
        '宝宝ID': babyId,
        '角色': role || 'editor',
        '关系': relation || '其他',
        '邀请码': code,
      },
    }),
  });
  accountBabyCache = { data: new Map(), expires: 0 };
  return code;
}

// 使用邀请码：账号填入邀请码对应的关联记录
async function redeemInviteCode(accountName, accountId, code, env) {
  const feishuToken = await getTenantToken(env);
  const tableId = await ensureAccountBabyTable(feishuToken, env);
  const appToken = env.FEISHU_BASE_TOKEN;

  const filterStr = `CurrentValue.[邀请码]="${code}"`;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
  const listData = await listResp.json();

  if (listData.code !== 0 || !listData.data?.items || listData.data.items.length === 0) {
    return { ok: false, error: '邀请码无效' };
  }

  const record = listData.data.items[0];
  const fields = record.fields || {};

  // 检查是否已被使用
  if (getText(fields['账号名']) && getText(fields['账号名']).trim()) {
    return { ok: false, error: '邀请码已被使用' };
  }

  // 检查是否已关联该宝宝（用账号ID查询）
  if (accountId) {
    const checkFilter = `CurrentValue.[账号ID]="${accountId}"&&CurrentValue.[宝宝ID]="${getText(fields['宝宝ID'])}"`;
    const checkUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(checkFilter)}&page_size=1`;
    const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const checkData = await checkResp.json();
    if (checkData.code === 0 && checkData.data?.items?.length > 0) {
      return { ok: false, error: '您已关联该宝宝' };
    }
  }

  // 填入账号名 + 账号ID + 审计字段 + 关联宝宝
  const babyId = getText(fields['宝宝ID']);
  const updateFields = {
    '账号名': accountName,
    '关联宝宝': babyId ? [babyId] : [],
    '修改人账号': accountName,
    '修改时间': Date.now(),
  };
  if (accountId) updateFields['账号ID'] = accountId;
  const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${record.record_id}`;
  await fetch(updateUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: updateFields }),
  });

  accountBabyCache = { data: new Map(), expires: 0 };
  return { ok: true, babyId: getText(fields['宝宝ID']), relation: getText(fields['关系']) || '其他' };
}

// 获取宝宝的邀请码列表（仅owner可见）
async function getBabyInviteCodes(babyId, env) {
  const feishuToken = await getTenantToken(env);
  const tableId = await ensureAccountBabyTable(feishuToken, env);
  const appToken = env.FEISHU_BASE_TOKEN;

  const filterStr = `CurrentValue.[宝宝ID]="${babyId}"`;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=100`;
  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
  const listData = await listResp.json();

  const results = [];
  if (listData.code === 0 && listData.data?.items) {
    for (const item of listData.data.items) {
      const fields = item.fields || {};
      const role = getText(fields['角色']) || 'viewer';
      const accName = getText(fields['账号名']);
      results.push({
        record_id: item.record_id,
        accountName: accName || '',
        babyId: getText(fields['宝宝ID']),
        role,
        relation: getText(fields['关系']) || '其他',
        inviteCode: getText(fields['邀请码']) || '',
        isPending: !accName || !accName.trim(),
        modifiedBy: getText(fields['修改人账号']) || '',
        modifiedTime: fields['修改时间'] || null,
      });
    }
  }
  return results;
}

// 从关联字段提取 record_ids
function extractLinkedIds(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field.flatMap(item => {
      if (typeof item === 'string') return [item];
      if (item.record_ids) return item.record_ids;
      if (item.record_id) return [item.record_id];
      return [];
    });
  }
  if (typeof field === 'string') return [field];
  if (field.record_ids) return field.record_ids;
  if (field.record_id) return [field.record_id];
  return [];
}

// 获取账号信息（含状态）
// 使用 Cache API（边缘缓存）+ 内存缓存双重缓存，避免每次 verify 都查飞书
let accountInfoCache = { data: new Map(), expires: 0 };
const ACCOUNT_INFO_TTL = 2 * 60 * 1000; // 2分钟

// 清除账号信息缓存（内存 + Cache API）
async function clearAccountInfoCache(accountName) {
  accountInfoCache = { data: new Map(), expires: 0 };
  try {
    const cache = caches.default;
    await cache.delete(new Request(`https://cache.internal/account-info/${encodeURIComponent(accountName)}`));
  } catch (e) {}
}

async function getAccountInfo(accountName, env) {
  // 1. 先查内存缓存（最快，但 isolate 间不共享）
  const now = Date.now();
  if (accountInfoCache.expires > now && accountInfoCache.data.has(accountName)) {
    return accountInfoCache.data.get(accountName);
  }
  // 2. 查 Cache API（边缘缓存，同一节点共享）
  try {
    const cacheKey = new Request(`https://cache.internal/account-info/${encodeURIComponent(accountName)}`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const info = await cached.json();
      // 回填内存缓存
      accountInfoCache.data.set(accountName, info);
      accountInfoCache.expires = now + ACCOUNT_INFO_TTL;
      return info;
    }
  } catch (e) {}

  try {
    const feishuToken = await getTenantToken(env);
    const tableId = await ensureAccountTable(feishuToken, env);
    const appToken = env.FEISHU_BASE_TOKEN;
    const filterStr = `CurrentValue.[账号名]="${accountName}"`;
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const listData = await listResp.json();
    if (listData.code !== 0 || !listData.data?.items || listData.data.items.length === 0) {
      return null;
    }
    const fields = listData.data.items[0].fields || {};
    const info = {
      record_id: listData.data.items[0].record_id,
      accountName: getText(fields['账号名']),
      role: getText(fields['权限']) || 'view',
      status: getText(fields['状态']) || '正常',
      encryptedPassword: getText(fields['加密密码']) || '',
      lastModifiedTime: fields['最后修改时间'] || null,
      lastLoginTime: fields['最后登录时间'] || null,
    };
    // 写入双重缓存
    accountInfoCache.data.set(accountName, info);
    accountInfoCache.expires = now + ACCOUNT_INFO_TTL;
    try {
      const cache = caches.default;
      const cacheKey = new Request(`https://cache.internal/account-info/${encodeURIComponent(accountName)}`);
      const cacheResp = new Response(JSON.stringify(info), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ACCOUNT_INFO_TTL / 1000}` },
      });
      // 异步写入 Cache API，不阻塞响应
      cache.put(cacheKey, cacheResp.clone()).catch(() => {});
    } catch (e) {}
    return info;
  } catch (e) {
    console.error('[getAccountInfo] Error:', e.message);
    return null;
  }
}

// 解析飞书文本字段：兼容纯字符串和富文本数组 [{text: "xxx", type: "text"}]
function parseTextField(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return item;
      if (item && item.text) return item.text;
      return '';
    }).join('');
  }
  return String(value);
}

// 将飞书原始宝宝记录转换为前端可用的格式
function feishuToBaby(item) {
  const fields = item.fields || {};
  return {
    record_id: item.record_id || item.id,
    宝宝姓名: parseTextField(fields['宝宝姓名']),
    出生日期: typeof fields['出生日期'] === 'number'
      ? new Date(fields['出生日期']).toISOString().split('T')[0]
      : fields['出生日期'] || '',
    性别: parseTextField(fields['性别']),
    妈妈名字: parseTextField(fields['妈妈名字']),
    爸爸名字: parseTextField(fields['爸爸名字']),
    头像: fields['头像'] || '',
    备注: parseTextField(fields['备注']),
  };
}

// 根据宝宝ID列表获取宝宝详细信息（使用batch_get API，一次请求获取所有宝宝）
async function getBabiesByIds(babyIds, env) {
  if (!babyIds || babyIds.length === 0) return [];
  try {
    const feishuToken = await getTenantToken(env);
    const tableId = env.FEISHU_TABLE_BABY;
    const appToken = env.FEISHU_BASE_TOKEN;
    // 使用 batch_get API 一次性获取所有宝宝记录（比逐个查询快很多）
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_get`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_ids: babyIds }),
    });
    const data = await resp.json();
    if (data.code !== 0 || !data.data?.records) {
      console.error('[getBabiesByIds] batch_get failed:', data.msg);
      return [];
    }
    // 过滤掉状态为"删除"的宝宝，并转换为前端可用格式
    return data.data.records
      .filter(item => getText(item.fields?.['状态']) !== '删除')
      .map(feishuToBaby);
  } catch (e) {
    console.error('[getBabiesByIds] Error:', e.message);
    return [];
  }
}

// 处理认证请求（账号登录 + 旧密码登录兼容）
async function handleAuth(request, env, ctx) {
  if (request.method !== 'POST') return { error: 'Method not allowed' };

  const body = await request.json();

  // register action: 自助注册（状态pending，需管理员审核）
  if (body.action === 'register') {
    const account = body.account;
    const password = body.password;
    if (!account || !account.trim()) return { error: '请输入账号名' };
    if (!password) return { error: '请输入密码' };
    if (account.trim().length < 2) return { error: '账号名至少2个字符' };
    if (password.length < 4) return { error: '密码至少4个字符' };

    const feishuToken = await getTenantToken(env);
    const tableId = await ensureAccountTable(feishuToken, env);
    const appToken = env.FEISHU_BASE_TOKEN;

    // 检查账号名唯一性
    const filterStr = `CurrentValue.[账号名]="${account.trim()}"`;
    const checkUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
    const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const checkData = await checkResp.json();
    if (checkData.code === 0 && checkData.data?.items?.length > 0) {
      return { error: '账号名已存在', code: 'account_exists' };
    }

    const encryptedPassword = await encryptPassword(password, env);
    const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
    const resp = await fetch(recordUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          '账号名': account.trim(),
          '加密密码': encryptedPassword,
          '状态': '待审批',
          '最后修改时间': Date.now(),
          '创建时间': Date.now(),
        },
      }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { error: `注册失败: ${data.msg}` };
    // 回填账号ID（飞书record_id）
    if (data.data?.record?.record_id) {
      const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${data.data.record.record_id}`;
      await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { '账号ID': data.data.record.record_id } }),
      });
    }
    return { ok: true, message: '注册成功，请等待管理员审核' };
  }

  // verify action: 验证token是否仍有效
  if (body.action === 'verify' && body.token) {
    const auth = parseAuthToken(body.token);
    if (!auth.valid) {
      return { ok: false, error: 'token无效' };
    }
    if (!auth.accountName) {
      return { ok: false, error: 'token格式无效，请重新登录' };
    }
    // 检查账号是否仍存在且状态为approved
    const accountInfo = await getAccountInfo(auth.accountName, env);
    if (!accountInfo) {
      return { ok: false, error: '账号已不存在', code: 'account_not_found' };
    }
    if (accountInfo.status !== '正常') {
      return { ok: false, error: '账号状态异常', code: accountInfo.status === '待审批' ? 'pending' : accountInfo.status === '冻结' ? 'frozen' : accountInfo.status === '审批未通过' ? 'rejected' : 'deleted' };
    }
    // 密码校验：token中的hash部分必须与当前密码派生的hash匹配
    const storedEncryptedPassword = accountInfo.encryptedPassword || '';
    if (!storedEncryptedPassword) {
      return { ok: false, error: '账号密码异常，请重新登录', code: 'password_invalid' };
    }
    const currentRole = accountInfo.role === 'superadmin' ? 'superadmin' : 'view';
    const tokenHash = body.token.split(':').slice(2).join(':');
    // 并行：计算期望hash + 获取关联宝宝列表
    const [expectedHash, links] = await Promise.all([
      sha256(storedEncryptedPassword + ':baby-growth-auth-v3:' + currentRole + ':' + auth.accountName),
      getAccountBabyIds(accountInfo.record_id, auth.accountName, env),
    ]);
    if (expectedHash !== tokenHash) {
      return { ok: false, error: '账号密码已变更，请重新登录', code: 'password_changed' };
    }
    const babyIds = links.map(l => l.babyId);
    const babies = await getBabiesByIds(babyIds, env);
    const babiesWithRelation = babies.map(baby => {
      const link = links.find(l => l.babyId === baby.record_id);
      return { ...baby, relation: link?.relation || '其他', linkRole: link?.role || 'viewer' };
    });
    return { ok: true, role: currentRole, accountName: auth.accountName, accountId: accountInfo.record_id, status: accountInfo.status, babies: babiesWithRelation };
  }

  const account = body.account;
  const password = body.password;

  // 账号登录
  if (account) {
    const feishuToken = await getTenantToken(env);
    const tableId = await ensureAccountTable(feishuToken, env);
    // 移除 ensureDefaultAdmin 调用——admin账号已存在，无需每次登录检查
    // 如需初始化admin，请访问 /api/migrate?step=admin-password

    const appToken = env.FEISHU_BASE_TOKEN;
    const filterStr = `CurrentValue.[账号名]="${account}"`;
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const listData = await listResp.json();

    if (listData.code !== 0 || !listData.data?.items || listData.data.items.length === 0) {
      return { error: '账号不存在', code: 'account_not_found' };
    }

    const accountRecord = listData.data.items[0];
    const fields = accountRecord.fields || {};
    const storedEncryptedPassword = getText(fields['加密密码']) || '';
    const role = getText(fields['权限']) === 'superadmin' ? 'superadmin' : 'view';
    const accountName = getText(fields['账号名']) || account;
    const status = getText(fields['状态']) || '正常'; // 旧账号没有状态字段，默认正常
    const recordId = accountRecord.record_id;

    // 检查账号状态
    if (status === '待审批') {
      return { error: '账号待审批，请等待管理员审核', code: 'pending' };
    }
    if (status === '冻结') {
      return { error: '账号已被冻结，请联系管理员', code: 'frozen' };
    }
    if (status === '审批未通过') {
      return { error: '账号审批未通过，请联系管理员', code: 'rejected' };
    }
    if (status === '删除') {
      return { error: '账号已删除', code: 'deleted' };
    }

    // admin首次登录，密码字段为空
    if (!storedEncryptedPassword && (role === 'admin' || role === 'superadmin')) {
      if (!password) {
        return { error: '请设置管理员密码', needsSetup: true };
      }
      const encryptedPassword = await encryptPassword(password, env);
      const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
      await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { '加密密码': encryptedPassword, '状态': '正常', '最后修改时间': Date.now() } }),
      });
      // 使用存储的加密密码派生token（与verify保持一致）
      const token = await deriveToken(encryptedPassword, role, accountName);
      const links = await getAccountBabyIds(recordId, accountName, env);
      const babyIds = links.map(l => l.babyId);
      const babies = await getBabiesByIds(babyIds, env);
      const babiesWithRelation = babies.map(baby => {
        const link = links.find(l => l.babyId === baby.record_id);
        return { ...baby, relation: link?.relation || '其他', linkRole: link?.role || 'viewer' };
      });
      return { ok: true, token, role, accountName, accountId: recordId, status: '正常', babies: babiesWithRelation };
    }

    if (!storedEncryptedPassword) {
      return { error: '账号未设置密码，请联系管理员' };
    }

    if (!password) return { error: '请输入密码' };

    // 密码校验（仅AES解密比对，不再兼容SHA-256哈希）
    let passwordMatch = false;
    const aesKey = env.AES_ENCRYPT_KEY;
    if (aesKey) {
      try {
        const decryptedPassword = await aesDecrypt(storedEncryptedPassword, aesKey);
        if (decryptedPassword === password) passwordMatch = true;
      } catch (e) {}
    }
    if (!passwordMatch) return { error: '密码错误' };

    // 使用存储的加密密码派生token（与verify保持一致）
    const token = await deriveToken(storedEncryptedPassword, role, accountName);

    // 登录时间更新改为非阻塞（ctx.waitUntil），不等待返回
    const loginUpdateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(fetch(loginUpdateUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { '最后登录时间': Date.now() } }),
      }).catch(() => {}));
    }

    // 获取关联宝宝列表（登录时强制清除缓存，确保获取最新关联数据）
    accountBabyCache = { data: new Map(), expires: 0 };
    accountInfoCache = { data: new Map(), expires: 0 };
    const links = await getAccountBabyIds(recordId, accountName, env);
    const babyIds = links.map(l => l.babyId);
    const babies = await getBabiesByIds(babyIds, env);
    const babiesWithRelation = babies.map(baby => {
      const link = links.find(l => l.babyId === baby.record_id);
      return { ...baby, relation: link?.relation || '其他', linkRole: link?.role || 'viewer' };
    });
    return { ok: true, token, role, accountName, accountId: recordId, status, babies: babiesWithRelation };
  }

  return { error: '请输入账号名' };
}

// 处理账号管理请求（仅 superadmin 可操作）
async function handleAccounts(request, env, token, auth) {
  if (auth.role !== 'superadmin' && auth.role !== 'admin') {
    return { error: '只有超级管理员才能管理账号', code: 403 };
  }

  const feishuToken = await getTenantToken(env);
  const tableId = await ensureAccountTable(feishuToken, env);
  await ensureDefaultAdmin(feishuToken, env, tableId);
  const appToken = env.FEISHU_BASE_TOKEN;

  if (request.method === 'GET') {
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const data = await listResp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    const items = (data.data?.items || []).map(item => {
      const fields = item.fields || {};
      const hasPassword = !!getText(fields['加密密码']);
      return {
        record_id: item.record_id,
        账号名: getText(fields['账号名']) || '',
        权限: getText(fields['权限']) || '',
        状态: getText(fields['状态']) || '正常',
        最后修改时间: fields['最后修改时间'] || null,
        hasPassword,
      };
    });
    return { code: 0, data: { items } };
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const accountName = body.accountName;
    const password = body.password;

    if (!accountName) return { code: -1, msg: '账号名不能为空' };
    if (!password) return { code: -1, msg: '密码不能为空' };

    const filterStr = `CurrentValue.[账号名]="${accountName}"`;
    const checkUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
    const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const checkData = await checkResp.json();
    if (checkData.code === 0 && checkData.data?.items?.length > 0) {
      return { code: -1, msg: '账号名已存在' };
    }

    const encryptedPassword = await encryptPassword(password, env);
    const resp = await fetch(`${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          '账号名': accountName,
          '加密密码': encryptedPassword,
          '状态': '正常',
          '最后修改时间': Date.now(),
          '创建时间': Date.now(),
        },
      }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    // 回填账号ID
    if (data.data?.record?.record_id) {
      const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${data.data.record.record_id}`;
      await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { '账号ID': data.data.record.record_id } }),
      });
    }
    return { code: 0, data: { record: data.data?.record } };
  }

  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId && !body.action) return { code: -1, msg: 'record_id is required' };

    // 审核操作
    if (body.action === 'approve') {
      if (!recordId) return { code: -1, msg: 'record_id is required' };
      const updateFields = {
        '状态': '正常',
        '最后修改时间': Date.now(),
      };
      const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
      const resp = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: updateFields }),
      });
      const data = await resp.json();
      if (data.code !== 0) return { code: -1, msg: data.msg };
      // 清除缓存
      validAccountsCache = { accounts: new Set(), expires: 0 };
      accountInfoCache = { data: new Map(), expires: 0 };
      return { code: 0, data: { record: data.data?.record } };
    }

    if (body.action === 'reject') {
      if (!recordId) return { code: -1, msg: 'record_id is required' };
      const updateFields = {
        '状态': '审批未通过',
        '最后修改时间': Date.now(),
      };
      const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
      const resp = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: updateFields }),
      });
      const data = await resp.json();
      if (data.code !== 0) return { code: -1, msg: data.msg };
      validAccountsCache = { accounts: new Set(), expires: 0 };
      accountInfoCache = { data: new Map(), expires: 0 };
      return { code: 0, data: { record: data.data?.record } };
    }

    // 普通编辑（账号名不可修改）
    const updateFields = {};
    if (body.password !== undefined) {
      if (!body.password) return { code: -1, msg: '密码不能为空' };
      updateFields['加密密码'] = await encryptPassword(body.password, env);
    }
    if (body.status !== undefined) {
      if (!['正常', '冻结', '删除'].includes(body.status)) return { code: -1, msg: '状态值无效' };
      updateFields['状态'] = body.status;
    }
    updateFields['最后修改时间'] = Date.now();

    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: updateFields }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    // 清除缓存（密码或状态可能已变更）
    accountInfoCache = { data: new Map(), expires: 0 };
    validAccountsCache = { accounts: new Set(), expires: 0 };
    return { code: 0, data: { record: data.data?.record } };
  }

  if (request.method === 'DELETE') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { code: -1, msg: 'record_id is required' };

    // 逻辑删除：设置状态为"删除"，同时物理删除该账号的所有关联记录
    const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const resp = await fetch(updateUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { '状态': '删除', '最后修改时间': Date.now() } }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    // 物理删除该账号在关联表中的所有记录
    await deleteAccountAssociations(recordId, env);
    validAccountsCache = { accounts: new Set(), expires: 0 };
    accountInfoCache = { data: new Map(), expires: 0 };
    return { code: 0 };
  }

  return { code: -1, msg: 'Method not allowed' };
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCORSHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 认证接口（不需要 token）
      if (path === '/api/auth') {
        const result = await handleAuth(request, env, ctx);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // /api/health 无需认证
      if (path === '/api/health') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // /api/migrate GET 免认证（方便直接浏览器访问执行迁移）
      if (path === '/api/migrate' && request.method === 'GET') {
        const token = await getTenantToken(env);
        const step = url.searchParams.get('step');
        let result;
        if (step === 'admin-password') {
          result = await migrateAdminPassword(env, token);
        } else if (step === 'audit-fields') {
          result = await migrateAuditFields(env, token);
        } else if (step === 'create-time') {
          result = await migrateCreateTimeField(env, token);
        } else if (step === 'link-baby') {
          result = await migrateLinkBabyField(env, token);
        } else if (step === 'backfill-link') {
          result = await migrateBackfillLink(env, token);
        } else if (step === 'login-time') {
          result = await migrateLoginTimeField(env, token);
        } else if (step === 'backfill-account-id') {
          result = await migrateBackfillAccountId(env, token);
        } else {
          result = await handleMigrate(env, token);
        }
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // 所有其他接口需要认证
      const auth = await parseAuth(request, env);
      if (!auth.valid) {
        return new Response(JSON.stringify({ error: '未认证，请先登录', code: 401 }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      // 验证账号是否仍存在于账号表中（带缓存，5分钟TTL）
      if (auth.accountName) {
        const exists = await verifyAccountExists(auth.accountName, env);
        if (!exists) {
          return new Response(JSON.stringify({ error: '账号已不存在，请重新登录', code: 401 }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      }

      // /api/accounts 账号管理（需要 admin 权限）
      if (path === '/api/accounts') {
        const token = await getTenantToken(env);
        const result = await handleAccounts(request, env, token, auth);
        const status = result.code === 403 ? 403 : 200;
        return new Response(JSON.stringify(result), {
          status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // /api/invite 邀请码管理
      if (path === '/api/invite') {
        const token = await getTenantToken(env);
        if (request.method === 'POST') {
          const body = await request.json();
          if (body.action === 'create') {
            // 创建邀请码
            const { babyId, role, relation } = body;
            if (!babyId) return new Response(JSON.stringify({ error: 'babyId is required' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            // 验证当前用户是该宝宝的owner
            const _accountId = await getAuthAccountId(auth, env);
            const links = await getAccountBabyIds(_accountId, auth.accountName, env);
            const myLink = links.find(l => l.babyId === babyId);
            if (!myLink || (myLink.role !== 'owner' && myLink.role !== 'editor')) {
              return new Response(JSON.stringify({ error: '只有可编辑权限才能邀请' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            const code = await createInviteCode(babyId, role || 'editor', relation || '其他', env);
            return new Response(JSON.stringify({ ok: true, code }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (body.action === 'redeem') {
            // 使用邀请码
            const { code } = body;
            if (!code) return new Response(JSON.stringify({ error: '请输入邀请码' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const result = await redeemInviteCode(auth.accountName, await getAuthAccountId(auth, env), code, env);
            return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (body.action === 'list') {
            // 获取宝宝的联系人和待领取邀请码
            const { babyId } = body;
            if (!babyId) return new Response(JSON.stringify({ error: 'babyId is required' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const feishuToken = await getTenantToken(env);
            // 并行查询：联系人列表 + 所有账号列表（一次查询用于补全状态和最后登录时间）
            const [contacts, allAccounts] = await Promise.all([
              getBabyInviteCodes(babyId, env),
              (async () => {
                try {
                  const accountTableId = await ensureAccountTable(feishuToken, env);
                  const appToken = env.FEISHU_BASE_TOKEN;
                  const accountUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId}/records?page_size=100`;
                  const accountResp = await fetch(accountUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
                  const accountData = await accountResp.json();
                  if (accountData.code === 0 && accountData.data?.items) {
                    const map = {};
                    for (const aItem of accountData.data.items) {
                      const name = getText(aItem.fields?.['账号名']);
                      if (name) {
                        map[name] = {
                          lastLoginTime: aItem.fields?.['最后登录时间'] || aItem.fields?.['最后修改时间'] || null,
                          status: getText(aItem.fields?.['状态']) || '正常',
                        };
                      }
                    }
                    return map;
                  }
                } catch (e) {}
                return {};
              })(),
            ]);
            // 补全联系人状态和最后登录时间
            for (const item of contacts) {
              if (item.accountName && allAccounts[item.accountName]) {
                item.lastLoginTime = allAccounts[item.accountName].lastLoginTime;
                item.accountStatus = allAccounts[item.accountName].status;
              } else if (item.accountName) {
                item.accountStatus = 'deleted';
              }
            }
            // 显示所有联系人（包括已删除/冻结状态），用户可在页面看到状态标签
            return new Response(JSON.stringify({ ok: true, contacts }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (body.action === 'updateRole') {
            if (!body.record_id || !body.role) return new Response(JSON.stringify({ ok: false, error: '参数不完整' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            if (!['editor', 'viewer'].includes(body.role)) return new Response(JSON.stringify({ ok: false, error: '角色值无效' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const feishuToken = await getTenantToken(env);
            const linkTableId = await ensureAccountBabyTable(feishuToken, env);
            const appToken = env.FEISHU_BASE_TOKEN;
            const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${linkTableId}/records/${body.record_id}`;
            const resp = await fetch(updateUrl, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: { '角色': body.role, '修改人账号': auth.accountName, '修改时间': Date.now() } }),
            });
            const data = await resp.json();
            if (data.code !== 0) return new Response(JSON.stringify({ ok: false, error: data.msg }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            accountBabyCache = { data: new Map(), expires: 0 };
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (body.action === 'updateContact') {
            if (!body.record_id) return new Response(JSON.stringify({ ok: false, error: '参数不完整' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            // 权限检查：获取该关联记录对应的宝宝，判断当前用户角色
            const feishuToken = await getTenantToken(env);
            const linkTableId = await ensureAccountBabyTable(feishuToken, env);
            const appToken = env.FEISHU_BASE_TOKEN;
            const recUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${linkTableId}/records/${body.record_id}`;
            const recResp = await fetch(recUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
            const recData = await recResp.json();
            if (recData.code !== 0 || !recData.data?.record) {
              return new Response(JSON.stringify({ ok: false, error: '记录不存在' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            const recordAccountName = getText(recData.data.record.fields?.['账号名']) || '';
            const recordBabyId = getText(recData.data.record.fields?.['宝宝ID']) || '';
            const _accountId = await getAuthAccountId(auth, env);
            const links = await getAccountBabyIds(_accountId, auth.accountName, env);
            const myLink = links.find(l => l.babyId === recordBabyId);
            const isOwner = myLink && myLink.role === 'owner';
            const isSelf = recordAccountName === auth.accountName;
            // owner 可以修改任何人的关系和角色；非 owner 只能修改自己的关系，不能改角色
            if (!isOwner && !isSelf) {
              return new Response(JSON.stringify({ ok: false, error: '无权修改此联系人' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            const updates = {};
            if (body.relation) updates['关系'] = body.relation;
            if (isOwner && body.role && ['editor', 'viewer'].includes(body.role)) updates['角色'] = body.role;
            updates['修改人账号'] = auth.accountName;
            updates['修改时间'] = Date.now();
            if (Object.keys(updates).length === 0) return new Response(JSON.stringify({ ok: false, error: '无更新内容' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${linkTableId}/records/${body.record_id}`;
            const resp = await fetch(updateUrl, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: updates }),
            });
            const data = await resp.json();
            if (data.code !== 0) return new Response(JSON.stringify({ ok: false, error: data.msg }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            accountBabyCache = { data: new Map(), expires: 0 };
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (body.action === 'remove') {
            // 移除联系人或取消邀请：物理删除关联记录
            const { record_id } = body;
            if (!record_id) return new Response(JSON.stringify({ error: 'record_id is required' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            // 验证是owner才能移除
            const feishuToken = await getTenantToken(env);
            const abTableId = await ensureAccountBabyTable(feishuToken, env);
            const appToken = env.FEISHU_BASE_TOKEN;
            const recUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records/${record_id}`;
            const recResp = await fetch(recUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
            const recData = await recResp.json();
            if (recData.code === 0 && recData.data?.record) {
              const babyId = getText(recData.data.record.fields?.['宝宝ID']);
              const _accountId = await getAuthAccountId(auth, env);
            const links = await getAccountBabyIds(_accountId, auth.accountName, env);
              const myLink = links.find(l => l.babyId === babyId);
              if (!myLink || myLink.role !== 'owner') {
                return new Response(JSON.stringify({ error: '只有宝宝的创建者才能移除联系人' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
              }
            }
            // 物理删除关联记录
            const deleteUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records/${record_id}`;
            await fetch(deleteUrl, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${feishuToken}` },
            });
            accountBabyCache = { data: new Map(), expires: 0 };
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
        }
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

      // /api/account-baby 账号-宝宝关联管理
      if (path === '/api/account-baby') {
        const token = await getTenantToken(env);
        if (request.method === 'POST') {
          const body = await request.json();
          const babyId = body.babyId;
          if (!babyId) return new Response(JSON.stringify({ error: 'babyId is required' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          await linkAccountToBaby(await getAuthAccountId(auth, env), auth.accountName, babyId, 'owner', env, body.relation);
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

      // /api/vaccines 疫苗接种管理
      if (path === '/api/vaccines') {
        const token = await getTenantToken(env);
        const result = await handleVaccines(request, env, token, auth);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // /api/log 仅需认证，不需要编辑权限（view 也可以记录登录）
      if (path === '/api/log') {
        const token = await getTenantToken(env);
        // 从请求中获取真实 IP
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
        const logAuth = { ...auth, accountId: await getAuthAccountId(auth, env) || '' };
        const result = await handleLog(request, env, token, ip, logAuth);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // /api/ai 仅需认证（AI分析/咨询对所有登录用户开放）
      if (path === '/api/ai') {
        const aiResult = await handleAI(request, env);
        if (aiResult instanceof Response) return aiResult;
        return new Response(JSON.stringify(aiResult), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // 写操作权限检查在各个 handler 内部根据宝宝关联角色判断
      // superadmin 账号管理权限在 handleAccounts 内部检查

      let result;
      let binaryResponse = null;
      switch (path) {
        case '/api/babies': {
          const token = await getTenantToken(env);
          result = await handleBabies(request, env, token, auth);
          break;
        }
        case '/api/records': {
          const token = await getTenantToken(env);
          result = await handleRecords(request, env, token, auth);
          break;
        }
        case '/api/growth': {
          const token = await getTenantToken(env);
          result = await handleGrowth(request, env, token, auth);
          break;
        }
        case '/api/upload': {
          const token = await getTenantToken(env);
          result = await handleUpload(request, env, token);
          break;
        }
        case '/api/asset': {
          const token = await getTenantToken(env);
          binaryResponse = await handleAsset(request, env, token);
          break;
        }
        default:
          result = { error: 'Not found', path };
      }

      if (binaryResponse) return binaryResponse;

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

let tokenCache = { token: null, expires: 0 };
let logTableIdCache = null; // 缓存"登录日志"表 ID
let vaccineTableIdCache = null; // 缓存"疫苗接种"表 ID
let adminExistsCache = false; // 缓存admin账号已存在，避免每次登录都查询
let accountBabyTableIdCache = null;
let accountBabyCache = { data: new Map(), expires: 0 };

async function getTenantToken(env) {
  if (tokenCache.token && Date.now() < tokenCache.expires) {
    return tokenCache.token;
  }

  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(`环境变量缺失: APP_ID=${!!appId}, APP_SECRET=${!!appSecret}`);
  }

  const resp = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  const data = await resp.json();
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg} (app_id=${appId})`);

  tokenCache = {
    token: data.tenant_access_token,
    expires: Date.now() + (data.expire - 300) * 1000,
  };
  return tokenCache.token;
}

async function bitableRequest(env, token, method, tableId, params = {}, recordId = null) {
  let url = `${FEISHU_API}/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${tableId}/records`;
  if (recordId) {
    url += `/${recordId}`;
  }

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (method === 'GET') {
    const query = new URLSearchParams(params).toString();
    const fullUrl = query ? `${url}?${query}` : url;
    const resp = await fetch(fullUrl, options);
    return resp.json();
  } else if (method === 'DELETE') {
    const resp = await fetch(url, options);
    return resp.json();
  } else {
    options.body = JSON.stringify(params);
    const resp = await fetch(url, options);
    return resp.json();
  }
}

async function handleBabies(request, env, token, auth) {
  const tableId = env.FEISHU_TABLE_BABY;
  const appToken = env.FEISHU_BASE_TOKEN;
  const _accountId = await getAuthAccountId(auth, env);

  if (request.method === 'GET') {
    // 只返回该账号关联的宝宝
    const links = await getAccountBabyIds(_accountId, auth.accountName, env);
    const babyIds = links.map(l => l.babyId);
    if (babyIds.length === 0) {
      return { code: 0, data: { items: [], has_more: false, total: 0 } };
    }
    // 逐个获取宝宝详情
    const babies = await getBabiesByIds(babyIds, env);
    return { code: 0, data: { items: babies, has_more: false, total: babies.length } };
  }
  if (request.method === 'POST') {
    const body = await request.json();
    // 审计字段
    body.fields['创建人账号'] = auth.accountName;
    body.fields['创建时间'] = Date.now();
    body.fields['修改人账号'] = auth.accountName;
    body.fields['修改时间'] = Date.now();
    const result = await bitableRequest(env, token, 'POST', tableId, { fields: body.fields });
    // 自动关联新宝宝到创建者
    if (result.data?.record?.record_id) {
      await linkAccountToBaby(_accountId, auth.accountName, result.data.record.record_id, 'owner', env, body.fields['关系'] || '其他');
    }
    return result;
  }
  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: 'record_id is required' };
    // Check write permission for this baby
    const canWrite = await canWriteBaby(_accountId, auth.accountName, recordId, env);
    if (!canWrite) {
      return { error: '只有owner或editor才能编辑宝宝信息', code: 403 };
    }
    // 审计字段
    body.fields['修改人账号'] = auth.accountName;
    body.fields['修改时间'] = Date.now();
    return await bitableRequest(env, token, 'PUT', tableId, { fields: body.fields }, recordId);
  }
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const recordId = url.searchParams.get('record_id');
    if (!recordId) return { error: 'record_id is required' };
    // Only owner can delete baby
    const links = await getAccountBabyIds(_accountId, auth.accountName, env);
    const myLink = links.find(l => l.babyId === recordId);
    if (!myLink || myLink.role !== 'owner') {
      return { error: '只有宝宝的创建者才能删除' };
    }
    // 逻辑删除：设置状态为"删除"
    const feishuToken = await getTenantToken(env);
    const babyTableId = env.FEISHU_TABLE_BABY;
    const appToken = env.FEISHU_BASE_TOKEN;
    const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${babyTableId}/records/${recordId}`;
    const resp = await fetch(updateUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { '状态': '删除' } }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    // 同时删除该宝宝的所有关联记录
    await deleteBabyAssociations(recordId, env, auth.accountName);
    return { code: 0, data: { record: data.data?.record } };
  }
  return { error: 'Method not allowed' };
}

async function handleRecords(request, env, token, auth) {
  const tableId = env.FEISHU_TABLE_RECORD;
  const appToken = env.FEISHU_BASE_TOKEN;
  const _accountId = await getAuthAccountId(auth, env);

  if (request.method === 'GET') {
    const links = await getAccountBabyIds(_accountId, auth.accountName, env);
    const babyIds = links.map(l => l.babyId);
    const result = await bitableRequest(env, token, 'GET', tableId, { page_size: 500 });
    if (babyIds.length === 0) {
      result.data = { items: [], has_more: false, total: 0 };
    } else if (result.data?.items) {
      result.data.items = result.data.items.filter(item => {
        const linkedIds = extractLinkedIds(item.fields?.['关联宝宝']);
        return linkedIds.some(id => babyIds.includes(id));
      });
      result.data.total = result.data.items.length;
    }
    return result;
  }
  if (request.method === 'POST') {
    const body = await request.json();
    await ensureRecordFields(token, env);
    if (!body.fields['上传时间']) {
      body.fields['上传时间'] = Date.now();
    }
    // Check write permission for the associated baby
    const linkedBabyIds = extractLinkedIds(body.fields['关联宝宝']);
    if (linkedBabyIds.length > 0) {
      const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
      if (!canWrite) {
        return { error: '只有owner或editor才能添加记录', code: 403 };
      }
    }
    // 审计字段
    body.fields['创建人账号'] = auth.accountName;
    body.fields['创建时间'] = Date.now();
    body.fields['修改人账号'] = auth.accountName;
    body.fields['修改时间'] = Date.now();
    const result = await bitableRequest(env, token, 'POST', tableId, { fields: body.fields });
    return result;
  }
  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: 'record_id is required' };
    // Get existing record to check baby permission
    const existingUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const existingResp = await fetch(existingUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const existingData = await existingResp.json();
    if (existingData.code === 0 && existingData.data?.record) {
      const linkedBabyIds = extractLinkedIds(existingData.data.record.fields?.['关联宝宝']);
      if (linkedBabyIds.length > 0) {
        const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { error: '只有owner或editor才能编辑记录', code: 403 };
        }
      }
    }
    // 审计字段
    body.fields['修改人账号'] = auth.accountName;
    body.fields['修改时间'] = Date.now();
    return await bitableRequest(env, token, 'PUT', tableId, { fields: body.fields }, recordId);
  }
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const recordId = url.searchParams.get('record_id');
    if (!recordId) return { error: 'record_id is required' };
    // Get existing record to check baby permission
    const existingUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const existingResp = await fetch(existingUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const existingData = await existingResp.json();
    if (existingData.code === 0 && existingData.data?.record) {
      const linkedBabyIds = extractLinkedIds(existingData.data.record.fields?.['关联宝宝']);
      if (linkedBabyIds.length > 0) {
        const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { error: '只有owner或editor才能删除记录', code: 403 };
        }
      }
    }
    return await bitableRequest(env, token, 'DELETE', tableId, {}, recordId);
  }
  return { error: 'Method not allowed' };
}

async function ensureRecordFields(token, env) {
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${env.FEISHU_TABLE_RECORD}/fields`;
  const resp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await resp.json();
  const fields = data.data?.items || [];

  const mediaTypeField = fields.find(f => f.field_name === '媒体类型');
  if (!mediaTypeField) {
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: '媒体类型',
        type: 4,
        property: { options: [{ name: 'text' }, { name: 'voice' }, { name: 'video' }, { name: 'photo' }] }
      }),
    });
  } else if (mediaTypeField.type === 3) {
    await fetch(`${fieldsUrl}/${mediaTypeField.field_id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: '媒体类型',
        type: 4,
        property: { options: [{ name: 'text' }, { name: 'voice' }, { name: 'video' }, { name: 'photo' }] }
      }),
    });
  }

  const hasAttachment = fields.some(f => f.field_name === '附件');
  if (!hasAttachment) {
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_name: '附件', type: 17 }),
    });
  }

  const hasVoiceTranscript = fields.some(f => f.field_name === '语音转文字');
  if (!hasVoiceTranscript) {
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_name: '语音转文字', type: 1 }),
    });
  }

  const hasUploadTime = fields.some(f => f.field_name === '上传时间');
  if (!hasUploadTime) {
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_name: '上传时间', type: 5 }),
    });
  }
}

async function handleGrowth(request, env, token, auth) {
  const tableId = env.FEISHU_TABLE_GROWTH;
  const appToken = env.FEISHU_BASE_TOKEN;
  const _accountId = await getAuthAccountId(auth, env);

  if (request.method === 'GET') {
    const links = await getAccountBabyIds(_accountId, auth.accountName, env);
    const babyIds = links.map(l => l.babyId);
    const result = await bitableRequest(env, token, 'GET', tableId, { page_size: 100 });
    if (babyIds.length === 0) {
      result.data = { items: [], has_more: false, total: 0 };
    } else if (result.data?.items) {
      result.data.items = result.data.items.filter(item => {
        const linkedIds = extractLinkedIds(item.fields?.['关联宝宝']);
        return linkedIds.some(id => babyIds.includes(id));
      });
      result.data.total = result.data.items.length;
    }
    return result;
  }
  if (request.method === 'POST') {
    const body = await request.json();
    // Check write permission for the associated baby
    const linkedBabyIds = extractLinkedIds(body.fields?.['关联宝宝']);
    if (linkedBabyIds.length > 0) {
      const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
      if (!canWrite) {
        return { error: '只有owner或editor才能添加成长记录', code: 403 };
      }
    }
    // 审计字段
    body.fields['创建人账号'] = auth.accountName;
    body.fields['创建时间'] = Date.now();
    body.fields['修改人账号'] = auth.accountName;
    body.fields['修改时间'] = Date.now();
    return await bitableRequest(env, token, 'POST', tableId, { fields: body.fields });
  }
  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: 'record_id is required' };
    // Get existing record to check baby permission
    const existingUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const existingResp = await fetch(existingUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const existingData = await existingResp.json();
    if (existingData.code === 0 && existingData.data?.record) {
      const linkedBabyIds = extractLinkedIds(existingData.data.record.fields?.['关联宝宝']);
      if (linkedBabyIds.length > 0) {
        const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { error: '只有owner或editor才能编辑成长记录', code: 403 };
        }
      }
    }
    // 审计字段
    body.fields['修改人账号'] = auth.accountName;
    body.fields['修改时间'] = Date.now();
    return await bitableRequest(env, token, 'PUT', tableId, { fields: body.fields }, recordId);
  }
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const recordId = url.searchParams.get('record_id');
    if (!recordId) return { error: 'record_id is required' };
    // Get existing record to check baby permission
    const existingUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const existingResp = await fetch(existingUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const existingData = await existingResp.json();
    if (existingData.code === 0 && existingData.data?.record) {
      const linkedBabyIds = extractLinkedIds(existingData.data.record.fields?.['关联宝宝']);
      if (linkedBabyIds.length > 0) {
        const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { error: '只有owner或editor才能删除成长记录', code: 403 };
        }
      }
    }
    return await bitableRequest(env, token, 'DELETE', tableId, {}, recordId);
  }
  return { error: 'Method not allowed' };
}

// 查找或创建"登录日志"表，返回表 ID
async function ensureLogTable(token, env) {
  if (logTableIdCache) return logTableIdCache;

  const appToken = env.FEISHU_BASE_TOKEN;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;

  // 列出所有表，查找"登录日志"
  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const listData = await listResp.json();
  const tables = listData.data?.items || [];
  const existing = tables.find(t => t.name === '登录日志');
  if (existing) {
    logTableIdCache = existing.table_id;
    // 补充缺失字段（表已存在时可能缺少新字段）
    try {
      const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${logTableIdCache}/fields`;
      const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const fieldsData = await fieldsResp.json();
      const existingFieldNames = (fieldsData.data?.items || []).map(f => f.field_name);
      const logFields = [
        { field_name: '时间', type: 5 },
        { field_name: '操作', type: 1 },
        { field_name: 'IP', type: 1 },
        { field_name: '设备型号', type: 1 },
        { field_name: '系统版本', type: 1 },
        { field_name: '登录账号', type: 1 },
        { field_name: '账号ID', type: 1 },
      ];
      for (const field of logFields) {
        if (!existingFieldNames.includes(field.field_name)) {
          await fetch(fieldsUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(field),
          });
        }
      }
    } catch (e) {
      console.error('[ensureLogTable] 补充字段失败:', e.message);
    }
    return logTableIdCache;
  }

  // 创建"登录日志"表
  const createResp = await fetch(listUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: { name: '登录日志' } }),
  });
  const createData = await createResp.json();
  if (createData.code !== 0) {
    throw new Error(`创建登录日志表失败: ${createData.msg}`);
  }

  const tableId = createData.data?.table_id;
  if (!tableId) {
    throw new Error('创建登录日志表成功但未获取到 table_id');
  }

  // 创建字段：时间（日期）、操作（文本）、IP（文本）、设备型号（文本）、系统版本（文本）、登录账号（文本）、账号ID（文本）
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const logFields = [
    { field_name: '时间', type: 5 },
    { field_name: '操作', type: 1 },
    { field_name: 'IP', type: 1 },
    { field_name: '设备型号', type: 1 },
    { field_name: '系统版本', type: 1 },
    { field_name: '登录账号', type: 1 },
    { field_name: '账号ID', type: 1 },
  ];
  for (const field of logFields) {
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(field),
    });
  }

  logTableIdCache = tableId;
  return tableId;
}

// 查找或创建"疫苗接种"表，返回表 ID
async function ensureVaccineTable(token, env) {
  if (vaccineTableIdCache) return vaccineTableIdCache;

  const appToken = env.FEISHU_BASE_TOKEN;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;

  // 列出所有表，查找"疫苗接种"
  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const listData = await listResp.json();
  const tables = listData.data?.items || [];
  const existing = tables.find(t => t.name === '疫苗接种');

  if (existing) {
    // 表已存在，直接返回 ID（不再尝试补全字段，避免重复创建）
    vaccineTableIdCache = existing.table_id;
    return vaccineTableIdCache;
  }

  // 表不存在，创建表并添加字段
  const createResp = await fetch(listUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: { name: '疫苗接种' } }),
  });
  const createData = await createResp.json();
  if (createData.code !== 0) {
    throw new Error(`创建疫苗接种表失败: ${createData.msg}`);
  }

  const tableId = createData.data?.table_id;
  if (!tableId) {
    throw new Error('创建疫苗接种表成功但未获取到 table_id');
  }

  // 创建字段
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const vaccineFields = [
    { field_name: '疫苗名称', type: 1 },
    { field_name: '剂次', type: 2 },
    { field_name: '总剂次', type: 2 },
    { field_name: '费用类型', type: 3, property: { options: [{ name: '免费' }, { name: '自费' }] } },
    { field_name: '月龄', type: 1 },
    { field_name: '预计接种时间', type: 5 },
    { field_name: '接种状态', type: 3, property: { options: [{ name: '未接种' }, { name: '已接种' }] } },
    { field_name: '接种时间', type: 5 },
    { field_name: '关联宝宝', type: 18, property: { table_id: env.FEISHU_TABLE_BABY } },
  ];
  for (const field of vaccineFields) {
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(field),
    });
  }

  vaccineTableIdCache = tableId;
  return tableId;
}

// 处理疫苗接种请求
async function handleVaccines(request, env, token, auth) {
  const appToken = env.FEISHU_BASE_TOKEN;
  const tableId = await ensureVaccineTable(token, env);
  const _accountId = await getAuthAccountId(auth, env);

  if (request.method === 'GET') {
    const links = await getAccountBabyIds(_accountId, auth.accountName, env);
    const babyIds = links.map(l => l.babyId);
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    let items = data.data?.items || [];
    if (babyIds.length > 0) {
      items = items.filter(item => {
        const linkedIds = extractLinkedIds(item.fields?.['关联宝宝']);
        return linkedIds.some(id => babyIds.includes(id));
      });
    } else {
      items = [];
    }
    return { code: 0, data: { items } };
  }

  if (request.method === 'POST') {
    const body = await request.json();
    // Check write permission for the associated baby
    const linkedBabyIds = extractLinkedIds(body.fields?.['关联宝宝']);
    if (linkedBabyIds.length > 0) {
      const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
      if (!canWrite) {
        return { code: -1, msg: '只有owner或editor才能添加疫苗记录' };
      }
    }
    // 去重：同名同剂次不重复创建
    const name = body.fields?.['疫苗名称'];
    const dose = body.fields?.['剂次'];
    if (name && dose !== undefined) {
      const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(`CurrentValue.[疫苗名称]="${name}"&&CurrentValue.[剂次]=${dose}`)}&page_size=1`;
      const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const listData = await listResp.json();
      if (listData.code === 0 && listData.data?.items?.length > 0) {
        return { code: 0, data: { record: listData.data.items[0], duplicate: true } };
      }
    }
    // 审计字段
    body.fields['创建人账号'] = auth.accountName;
    body.fields['创建时间'] = Date.now();
    body.fields['修改人账号'] = auth.accountName;
    body.fields['修改时间'] = Date.now();
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: body.fields }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    return { code: 0, data: { record: data.data?.record } };
  }

  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { code: -1, msg: 'record_id is required' };
    // Get existing record to check baby permission
    const existingUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const existingResp = await fetch(existingUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const existingData = await existingResp.json();
    if (existingData.code === 0 && existingData.data?.record) {
      const linkedBabyIds = extractLinkedIds(existingData.data.record.fields?.['关联宝宝']);
      if (linkedBabyIds.length > 0) {
        const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { code: -1, msg: '只有owner或editor才能编辑疫苗记录' };
        }
      }
    }
    // 审计字段
    body.fields['修改人账号'] = auth.accountName;
    body.fields['修改时间'] = Date.now();
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: body.fields }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    return { code: 0, data: { record: data.data?.record } };
  }

  if (request.method === 'DELETE') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { code: -1, msg: 'record_id is required' };
    // Get existing record to check baby permission
    const existingUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const existingResp = await fetch(existingUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const existingData = await existingResp.json();
    if (existingData.code === 0 && existingData.data?.record) {
      const linkedBabyIds = extractLinkedIds(existingData.data.record.fields?.['关联宝宝']);
      if (linkedBabyIds.length > 0) {
        const canWrite = await canWriteBaby(_accountId, auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { code: -1, msg: '只有owner或editor才能删除疫苗记录' };
        }
      }
    }
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    return { code: 0 };
  }

  return { code: -1, msg: 'Method not allowed' };
}

// 处理登录日志请求
async function handleLog(request, env, token, ip, authRole) {
  if (request.method !== 'POST') return { error: 'Method not allowed' };

  try {
    const body = await request.json();
    const tableId = await ensureLogTable(token, env);

    const appToken = env.FEISHU_BASE_TOKEN;
    const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;

    // 从请求中获取 IP（优先用 Worker 传入的）
    const logIp = ip || body.ip || '';

    // 解析 UA 为简短设备型号
    const ua = body.device || '';
    let deviceShort = '未知';
    if (/iPhone/i.test(ua)) deviceShort = 'iPhone';
    else if (/iPad/i.test(ua)) deviceShort = 'iPad';
    else if (/Android/i.test(ua)) deviceShort = 'Android';
    else if (/Mac/i.test(ua)) deviceShort = 'Mac';
    else if (/Windows/i.test(ua)) deviceShort = 'Windows';
    else if (/Linux/i.test(ua)) deviceShort = 'Linux';

    // 解析详细系统版本
    const osVersion = parseOS(ua);

    // 登录账号：优先使用 accountName
    const loginAccount = (typeof authRole === 'object' && authRole.accountName) ? authRole.accountName : (typeof authRole === 'string' ? authRole : '未知');
    const loginAccountId = (typeof authRole === 'object' && authRole.accountId) ? authRole.accountId : '';

    const resp = await fetch(recordUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          '时间': body.timestamp || Date.now(),
          '操作': body.action || 'login',
          'IP': logIp,
          '设备型号': deviceShort,
          '系统版本': osVersion,
          '登录账号': loginAccount,
          '账号ID': loginAccountId,
        },
      }),
    });

    const result = await resp.json();
    if (result.code !== 0) {
      console.error('[handleLog] 写入失败:', result.code, result.msg);
      return { error: `写入登录日志失败: ${result.msg}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[handleLog] 异常:', e.message);
    return { error: e.message };
  }
}

// 数据迁移：创建字段 + 回填上传时间 + 创建日志表 + 修改日期格式 + 补充日志表字段
async function handleMigrate(env, token) {
  const results = {};
  const appToken = env.FEISHU_BASE_TOKEN;

  // 1. 确保"上传时间"字段存在
  try {
    await ensureRecordFields(token, env);
    results.fieldCreated = true;
  } catch (e) {
    results.fieldCreated = false;
    results.fieldError = e.message;
  }

  // 2. 回填历史记录的上传时间 = 记录时间
  try {
    const tableId = env.FEISHU_TABLE_RECORD;
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const listData = await listResp.json();

    if (listData.code === 0 && listData.data?.items) {
      let backfilled = 0;
      for (const item of listData.data.items) {
        const fields = item.fields || {};
        // 如果没有上传时间，用记录时间回填
        if (!fields['上传时间'] && fields['记录时间']) {
          const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${item.record_id}`;
          await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { '上传时间': fields['记录时间'] } }),
          });
          backfilled++;
        }
      }
      results.backfilled = backfilled;
    }
  } catch (e) {
    results.backfillError = e.message;
  }

  // 3. 确保"登录日志"表存在
  try {
    const logTableId = await ensureLogTable(token, env);
    results.logTableCreated = true;
    results.logTableId = logTableId;
  } catch (e) {
    results.logTableCreated = false;
    results.logTableError = e.message;
  }

  // 4. 修改所有日期类型字段（type=5）的 date_format 为 "yyyy-MM-dd HH:mm:ss"
  try {
    const tablesToMigrate = [
      { name: '记录表', tableId: env.FEISHU_TABLE_RECORD },
      { name: '成长表', tableId: env.FEISHU_TABLE_GROWTH },
    ];
    // 登录日志表
    if (results.logTableId) {
      tablesToMigrate.push({ name: '登录日志表', tableId: results.logTableId });
    }

    let dateFieldsUpdated = 0;
    for (const table of tablesToMigrate) {
      if (!table.tableId) continue;
      const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${table.tableId}/fields`;
      const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const fieldsData = await fieldsResp.json();
      const fields = fieldsData.data?.items || [];

      for (const field of fields) {
        if (field.type === 5) {
          const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${table.tableId}/fields/${field.field_id}`;
          await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              field_name: field.field_name,
              type: 5,
              property: { date_format: 'yyyy-MM-dd HH:mm:ss' },
            }),
          });
          dateFieldsUpdated++;
        }
      }
    }
    results.dateFieldsUpdated = dateFieldsUpdated;
  } catch (e) {
    results.dateFormatError = e.message;
  }

  // 5. 为已有的登录日志表补充新字段（系统版本、登录账号），如果字段不存在则创建
  try {
    const logTableId = results.logTableId || logTableIdCache;
    if (logTableId) {
      const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${logTableId}/fields`;
      const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const fieldsData = await fieldsResp.json();
      const existingFields = (fieldsData.data?.items || []).map(f => f.field_name);

      const newFields = [
        { field_name: '系统版本', type: 1 },
        { field_name: '登录账号', type: 1 },
        { field_name: '账号ID', type: 1 },
      ];
      let logFieldsAdded = 0;
      for (const field of newFields) {
        if (!existingFields.includes(field.field_name)) {
          await fetch(fieldsUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(field),
          });
          logFieldsAdded++;
        }
      }
      results.logFieldsAdded = logFieldsAdded;
    }
  } catch (e) {
    results.logFieldSupplementError = e.message;
  }

  // 6. 确保"疫苗接种"表存在
  try {
    const vaccineTableId = await ensureVaccineTable(token, env);
    results.vaccineTableCreated = true;
    results.vaccineTableId = vaccineTableId;
  } catch (e) {
    results.vaccineTableCreated = false;
    results.vaccineTableError = e.message;
  }

  // 7. 确保"账号表"存在并初始化默认 admin 账号
  try {
    const accountTableId = await ensureAccountTable(token, env);
    await ensureDefaultAdmin(token, env, accountTableId);

    // 补充"加密密码"字段（如果账号表已存在但没有此字段）
    const accFieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId}/fields`;
    const accFieldsResp = await fetch(accFieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const accFieldsData = await accFieldsResp.json();
    const accExistingFields = (accFieldsData.data?.items || []).map(f => f.field_name);
    if (!accExistingFields.includes('加密密码')) {
      await fetch(accFieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: '加密密码', type: 1 }),
      });
    }

    results.accountTableCreated = true;
    results.accountTableId = accountTableId;
  } catch (e) {
    results.accountTableCreated = false;
    results.accountTableError = e.message;
  }

  // 8. 确保成长表"头围"和"最后修改时间"字段存在
  try {
    const growthTableId = env.FEISHU_TABLE_GROWTH;
    if (growthTableId) {
      const growthFieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${growthTableId}/fields`;
      const growthFieldsResp = await fetch(growthFieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const growthFieldsData = await growthFieldsResp.json();
      const growthExistingFields = (growthFieldsData.data?.items || []).map(f => f.field_name);
      if (!growthExistingFields.includes('头围')) {
        await fetch(growthFieldsUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ field_name: '头围', type: 2 }), // type 2 = 数字
        });
        results.headCircumferenceFieldCreated = true;
      } else {
        results.headCircumferenceFieldCreated = false;
      }
      if (!growthExistingFields.includes('最后修改时间')) {
        await fetch(growthFieldsUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ field_name: '最后修改时间', type: 2 }), // type 2 = 数字
        });
        results.growthLastModifiedFieldCreated = true;
      } else {
        results.growthLastModifiedFieldCreated = false;
      }
    }
  } catch (e) {
    results.headCircumferenceFieldError = e.message;
  }

  // 9. 确保"账号宝宝关联"表存在
  try {
    const abTableId = await ensureAccountBabyTable(token, env);
    results.accountBabyTableCreated = true;
    results.accountBabyTableId = abTableId;

    // 补充缺失的字段（关系、邀请码）
    const abFieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/fields`;
    const abFieldsResp = await fetch(abFieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const abFieldsData = await abFieldsResp.json();
    const abExistingFields = (abFieldsData.data?.items || []).map(f => f.field_name);

    if (!abExistingFields.includes('关系')) {
      await fetch(abFieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: '关系', type: 3, property: { options: [{ name: '爸爸' }, { name: '妈妈' }, { name: '爷爷' }, { name: '奶奶' }, { name: '外公' }, { name: '外婆' }, { name: '姑姑' }, { name: '叔叔' }, { name: '舅舅' }, { name: '阿姨' }, { name: '其他' }] } }),
      });
    }
    if (!abExistingFields.includes('邀请码')) {
      await fetch(abFieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: '邀请码', type: 1 }),
      });
    }
    if (!abExistingFields.includes('关联宝宝')) {
      try {
        await fetch(abFieldsUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ field_name: '关联宝宝', type: 21, property: { table_id: env.FEISHU_TABLE_BABY, multiple: true } }),
        });
      } catch (e2) {
        // 关联字段创建可能因权限不足失败，静默忽略
      }
    }
    // 补充"审批未通过"状态到账号表状态字段
    try {
      const accountTableId2 = await ensureAccountTable(token, env);
      const accFieldsUrl2 = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId2}/fields`;
      const accFieldsResp2 = await fetch(accFieldsUrl2, { headers: { 'Authorization': `Bearer ${token}` } });
      const accFieldsData2 = await accFieldsResp2.json();
      if (accFieldsData2.code === 0 && accFieldsData2.data?.items) {
        const statusField = accFieldsData2.data.items.find(f => f.field_name === '状态');
        if (statusField && statusField.property?.options) {
          const existingOptions = statusField.property.options.map(o => o.name);
          if (!existingOptions.includes('审批未通过')) {
            statusField.property.options.push({ name: '审批未通过' });
            await fetch(`${accFieldsUrl2}/${statusField.field_id}`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ property: statusField.property }),
            });
          }
        }
      }
    } catch (e3) {}
  } catch (e) {
    results.accountBabyTableCreated = false;
    results.accountBabyTableError = e.message;
  }

  // 10. 确保账号表有"状态"字段和"创建时间"字段
  try {
    const accountTableId = await ensureAccountTable(token, env);
    const accFieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId}/fields`;
    const accFieldsResp = await fetch(accFieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const accFieldsData = await accFieldsResp.json();
    const accExistingFields = (accFieldsData.data?.items || []).map(f => f.field_name);
    if (!accExistingFields.includes('状态')) {
      await fetch(accFieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: '状态', type: 3, property: { options: [{ name: '正常' }, { name: '冻结' }, { name: '删除' }, { name: '待审批' }] } }),
      });
      results.statusFieldCreated = true;
    } else {
      results.statusFieldCreated = false;
    }
    if (!accExistingFields.includes('创建时间')) {
      await fetch(accFieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: '创建时间', type: 2 }),
      });
      results.createTimeFieldCreated = true;
    } else {
      results.createTimeFieldCreated = false;
    }
  } catch (e) {
    results.statusFieldError = e.message;
  }

  // 10.5 确保宝宝表有"状态"字段
  try {
    const babyTableId = env.FEISHU_TABLE_BABY;
    if (babyTableId) {
      const babyFieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${babyTableId}/fields`;
      const babyFieldsResp = await fetch(babyFieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const babyFieldsData = await babyFieldsResp.json();
      const babyExistingFields = (babyFieldsData.data?.items || []).map(f => f.field_name);
      if (!babyExistingFields.includes('状态')) {
        await fetch(babyFieldsUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ field_name: '状态', type: 3, property: { options: [{ name: '正常' }, { name: '删除' }] } }),
        });
        results.babyStatusFieldCreated = true;
      } else {
        results.babyStatusFieldCreated = false;
      }
    }
  } catch (e) {
    results.babyStatusFieldError = e.message;
  }

  // 11. 将所有现有账号状态设为approved，并关联到现有宝宝
  try {
    const accountTableId = await ensureAccountTable(token, env);
    const babyTableId = env.FEISHU_TABLE_BABY;

    // 获取所有账号
    const accListUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId}/records?page_size=100`;
    const accListResp = await fetch(accListUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const accListData = await accListResp.json();

    // 获取所有宝宝
    const babyListUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${babyTableId}/records?page_size=100`;
    const babyListResp = await fetch(babyListUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const babyListData = await babyListResp.json();
    const babyItems = babyListData.data?.items || [];

    if (accListData.code === 0 && accListData.data?.items) {
      for (const accItem of accListData.data.items) {
        const fields = accItem.fields || {};
        const accName = getText(fields['账号名']);
        const accStatus = getText(fields['状态']);

        // 设置状态为approved（如果还没有状态字段）
        if (!accStatus) {
          const updateFields = { '状态': '正常' };
          // Upgrade admin to superadmin
          if (getText(fields['权限']) === 'admin' && accName === 'admin') {
            updateFields['权限'] = 'superadmin';
          }
          const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId}/records/${accItem.record_id}`;
          await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: updateFields }),
          });
        }

        // 关联所有现有宝宝到该账号
        for (const baby of babyItems) {
          await linkAccountToBaby(accItem.record_id, accName, baby.record_id, getText(fields['权限']) === 'superadmin' || getText(fields['权限']) === 'admin' ? 'owner' : 'editor', env, getText(fields['权限']) === 'superadmin' || getText(fields['权限']) === 'admin' ? '爸爸' : '其他');
        }
      }
      results.existingAccountsMigrated = accListData.data.items.length;
    }
  } catch (e) {
    results.accountMigrationError = e.message;
  }

  // 12. 刷数据：把admin权限改为superadmin
  try {
    const feishuToken = await getTenantToken(env);
    const tableId = await ensureAccountTable(feishuToken, env);
    const appToken = env.FEISHU_BASE_TOKEN;
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent('CurrentValue.[权限]="admin"')}&page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const listData = await listResp.json();
    if (listData.code === 0 && listData.data?.items) {
      for (const item of listData.data.items) {
        const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${item.record_id}`;
        await fetch(updateUrl, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { '权限': 'superadmin' } }),
        });
      }
    }
  } catch (e) {}

  // 13. 检查admin账号密码为空时设置默认密码 admin123
  try {
    const feishuToken13 = await getTenantToken(env);
    const tableId13 = await ensureAccountTable(feishuToken13, env);
    const appToken13 = env.FEISHU_BASE_TOKEN;
    const filterStr13 = 'CurrentValue.[账号名]="admin"';
    const listUrl13 = `${FEISHU_API}/bitable/v1/apps/${appToken13}/tables/${tableId13}/records?filter=${encodeURIComponent(filterStr13)}&page_size=1`;
    const listResp13 = await fetch(listUrl13, { headers: { 'Authorization': `Bearer ${feishuToken13}` } });
    const listData13 = await listResp13.json();
    if (listData13.code === 0 && listData13.data?.items?.length > 0) {
      const adminRecord = listData13.data.items[0];
      const encryptedPwd = getText(adminRecord.fields?.['加密密码']);
      if (!encryptedPwd || encryptedPwd === '') {
        const defaultPwd = await encryptPassword('admin123', env);
        const updateUrl13 = `${FEISHU_API}/bitable/v1/apps/${appToken13}/tables/${tableId13}/records/${adminRecord.record_id}`;
        await fetch(updateUrl13, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${feishuToken13}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { '加密密码': defaultPwd } }),
        });
        results.adminPasswordSet = true;
      } else {
        results.adminPasswordSet = false;
      }
    }
  } catch (e) {
    results.adminPasswordError = e.message;
  }

  // 14. 为所有数据表补充审计字段（创建人账号、创建时间、修改人账号、修改时间）
  try {
    const auditFields = [
      { field_name: '创建人账号', type: 1 },
      { field_name: '创建时间', type: 2 },
      { field_name: '修改人账号', type: 1 },
      { field_name: '修改时间', type: 2 },
    ];
    const tablesToCheck = [
      { name: '成长记录', id: env.FEISHU_TABLE_GROWTH },
      { name: '时间线记录', id: env.FEISHU_TABLE_RECORD },
      { name: '疫苗接种', id: env.FEISHU_TABLE_VACCINE },
      { name: '宝宝档案', id: env.FEISHU_TABLE_BABY },
    ];
    for (const t of tablesToCheck) {
      if (!t.id) continue;
      const tFieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${t.id}/fields`;
      const tFieldsResp = await fetch(tFieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const tFieldsData = await tFieldsResp.json();
      const tExisting = (tFieldsData.data?.items || []).map(f => f.field_name);
      for (const f of auditFields) {
        if (!tExisting.includes(f.field_name)) {
          await fetch(tFieldsUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(f),
          });
        }
      }
    }
    results.auditFieldsAdded = true;
  } catch (e) {
    results.auditFieldsError = e.message;
  }

  return { ok: true, ...results };
}

// 独立迁移步骤：设置admin默认密码（避免单次Worker子请求超限）
async function migrateAdminPassword(env, token) {
  const results = { step: 'admin-password' };
  try {
    const tableId = await ensureAccountTable(token, env);
    const appToken = env.FEISHU_BASE_TOKEN;
    const filterStr = 'CurrentValue.[账号名]="admin"';
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const listData = await listResp.json();
    if (listData.code === 0 && listData.data?.items?.length > 0) {
      const adminRecord = listData.data.items[0];
      const encryptedPwd = getText(adminRecord.fields?.['加密密码']);
      if (!encryptedPwd || encryptedPwd === '') {
        const defaultPwd = await encryptPassword('admin123', env);
        const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${adminRecord.record_id}`;
        const updateResp = await fetch(updateUrl, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { '加密密码': defaultPwd } }),
        });
        const updateData = await updateResp.json();
        results.adminPasswordSet = updateData.code === 0;
        results.updateMsg = updateData.msg;
      } else {
        results.adminPasswordSet = false;
        results.reason = 'admin密码已存在，无需设置';
      }
      // 同时确保admin的权限字段为superadmin
      const currentRole = getText(adminRecord.fields?.['权限']);
      if (currentRole !== 'superadmin') {
        const updateUrl2 = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${adminRecord.record_id}`;
        await fetch(updateUrl2, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { '权限': 'superadmin' } }),
        });
        results.roleFixed = true;
      }
    } else {
      results.adminPasswordSet = false;
      results.reason = '未找到admin账号';
    }
  } catch (e) {
    results.adminPasswordError = e.message;
  }
  return { ok: true, ...results };
}

// 独立迁移步骤：为所有数据表补充审计字段
async function migrateAuditFields(env, token) {
  const results = { step: 'audit-fields' };
  try {
    const appToken = env.FEISHU_BASE_TOKEN;
    const auditFields = [
      { field_name: '创建人账号', type: 1 },
      { field_name: '创建时间', type: 2 },
      { field_name: '修改人账号', type: 1 },
      { field_name: '修改时间', type: 2 },
    ];
    const tablesToCheck = [
      { name: '成长记录', id: env.FEISHU_TABLE_GROWTH },
      { name: '时间线记录', id: env.FEISHU_TABLE_RECORD },
      { name: '疫苗接种', id: env.FEISHU_TABLE_VACCINE },
      { name: '宝宝档案', id: env.FEISHU_TABLE_BABY },
    ];
    results.tables = {};
    for (const t of tablesToCheck) {
      if (!t.id) continue;
      const tFieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${t.id}/fields`;
      const tFieldsResp = await fetch(tFieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const tFieldsData = await tFieldsResp.json();
      const tExisting = (tFieldsData.data?.items || []).map(f => f.field_name);
      const added = [];
      for (const f of auditFields) {
        if (!tExisting.includes(f.field_name)) {
          await fetch(tFieldsUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(f),
          });
          added.push(f.field_name);
        }
      }
      results.tables[t.name] = { added, existing: tExisting };
    }
    results.auditFieldsAdded = true;
  } catch (e) {
    results.auditFieldsError = e.message;
  }
  return { ok: true, ...results };
}

// 独立迁移步骤：账号表补充创建时间字段并回填
async function migrateCreateTimeField(env, token) {
  const results = { step: 'create-time' };
  try {
    const appToken = env.FEISHU_BASE_TOKEN;
    const tableId = await ensureAccountTable(token, env);
    const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
    const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const fieldsData = await fieldsResp.json();
    const existing = (fieldsData.data?.items || []).map(f => f.field_name);
    if (!existing.includes('创建时间')) {
      await fetch(fieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: '创建时间', type: 2 }),
      });
      results.createTimeFieldCreated = true;
    } else {
      results.createTimeFieldCreated = false;
      results.reason = '创建时间字段已存在';
    }
    // 回填所有空创建时间记录
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const listData = await listResp.json();
    let backfilled = 0;
    if (listData.code === 0 && listData.data?.items) {
      for (const item of listData.data.items) {
        if (!item.fields?.['创建时间']) {
          const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${item.record_id}`;
          await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { '创建时间': Date.now() } }),
          });
          backfilled++;
        }
      }
    }
    results.backfilled = backfilled;
  } catch (e) {
    results.createTimeError = e.message;
  }
  return { ok: true, ...results };
}

// 独立迁移步骤：账号宝宝关联表补充"关联宝宝"双向关联字段
async function migrateLinkBabyField(env, token) {
  const results = { step: 'link-baby' };
  try {
    const appToken = env.FEISHU_BASE_TOKEN;
    const tableId = await ensureAccountBabyTable(token, env);
    const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
    const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const fieldsData = await fieldsResp.json();
    const existing = (fieldsData.data?.items || []).map(f => f.field_name);
    if (!existing.includes('关联宝宝')) {
      // type 21 = 双向关联字段（注意：type 17 是附件，不是关联字段）
      const createResp = await fetch(fieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: '关联宝宝', type: 21, property: { table_id: env.FEISHU_TABLE_BABY, multiple: true } }),
      });
      const createData = await createResp.json();
      results.linkBabyFieldCreated = createData.code === 0;
      results.createMsg = createData.msg;
    } else {
      results.linkBabyFieldCreated = false;
      results.reason = '关联宝宝字段已存在';
    }
    results.existingFields = existing;
  } catch (e) {
    results.linkBabyError = e.message;
  }
  return { ok: true, ...results };
}

// 独立迁移步骤：回填账号宝宝关联表的"关联宝宝"双向关联字段
async function migrateBackfillLink(env, token) {
  const results = { step: 'backfill-link' };
  try {
    const appToken = env.FEISHU_BASE_TOKEN;
    const tableId = await ensureAccountBabyTable(token, env);
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const listData = await listResp.json();
    let backfilled = 0;
    let skipped = 0;
    let failed = 0;
    if (listData.code === 0 && listData.data?.items) {
      for (const item of listData.data.items) {
        const babyId = getText(item.fields?.['宝宝ID']);
        const existingLink = item.fields?.['关联宝宝'];
        // 检查是否已有有效的record_ids关联（必须是字符串数组的record_id）
        let hasValidLink = false;
        if (existingLink && Array.isArray(existingLink)) {
          for (const linkItem of existingLink) {
            // 有效格式：纯字符串record_id，或 {record_ids: [...]} 且数组非空
            if (typeof linkItem === 'string') {
              hasValidLink = true;
              break;
            }
            if (linkItem && typeof linkItem === 'object') {
              if (linkItem.record_ids && linkItem.record_ids.length > 0) {
                hasValidLink = true;
                break;
              }
              if (linkItem.record_id) {
                hasValidLink = true;
                break;
              }
              // text_arr 是无效的脏数据，不算有效关联
            }
          }
        }
        if (hasValidLink) {
          skipped++;
          continue;
        }
        if (!babyId) {
          failed++;
          continue;
        }
        // 先清空再写入（避免脏数据干扰）
        const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${item.record_id}`;
        // 步骤1：清空
        await fetch(updateUrl, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { '关联宝宝': [] } }),
        });
        // 步骤2：写入正确值
        const updateResp = await fetch(updateUrl, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { '关联宝宝': [babyId] } }),
        });
        const updateData = await updateResp.json();
        if (updateData.code === 0) {
          backfilled++;
        } else {
          failed++;
          results.lastError = updateData.msg;
        }
      }
    }
    results.backfilled = backfilled;
    results.skipped = skipped;
    results.failed = failed;
  } catch (e) {
    results.backfillError = e.message;
  }
  return { ok: true, ...results };
}

// 独立迁移步骤：账号表补充"最后登录时间"字段并从"最后修改时间"回填
async function migrateLoginTimeField(env, token) {
  const results = { step: 'login-time' };
  try {
    const appToken = env.FEISHU_BASE_TOKEN;
    const tableId = await ensureAccountTable(token, env);
    const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
    const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const fieldsData = await fieldsResp.json();
    const existing = (fieldsData.data?.items || []).map(f => f.field_name);
    if (!existing.includes('最后登录时间')) {
      await fetch(fieldsUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: '最后登录时间', type: 5 }),
      });
      results.fieldCreated = true;
    } else {
      results.fieldCreated = false;
      results.reason = '最后登录时间字段已存在';
    }
    // 回填：将"最后修改时间"值复制到"最后登录时间"
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const listData = await listResp.json();
    let backfilled = 0;
    if (listData.code === 0 && listData.data?.items) {
      for (const item of listData.data.items) {
        if (!item.fields?.['最后登录时间'] && item.fields?.['最后修改时间']) {
          const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${item.record_id}`;
          await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { '最后登录时间': item.fields['最后修改时间'] } }),
          });
          backfilled++;
        }
      }
    }
    results.backfilled = backfilled;
  } catch (e) {
    results.error = e.message;
  }
  return { ok: true, ...results };
}

// 清理关联表中的孤儿记录 + 回填账号表账号ID
async function migrateBackfillAccountId(env, token) {
  const results = { step: 'backfill-account-id' };
  try {
    const appToken = env.FEISHU_BASE_TOKEN;
    const accountTableId = await ensureAccountTable(token, env);
    const abTableId = await ensureAccountBabyTable(token, env);

    // 1. 获取所有当前账号，回填账号ID字段 + 构建ID集合
    const accListUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId}/records?page_size=500`;
    const accListResp = await fetch(accListUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const accListData = await accListResp.json();
    const accountIdSet = new Set();
    let accountBackfilled = 0;
    if (accListData.code === 0 && accListData.data?.items) {
      for (const acc of accListData.data.items) {
        accountIdSet.add(acc.record_id);
        // 回填账号ID字段
        if (!getText(acc.fields?.['账号ID'])) {
          const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId}/records/${acc.record_id}`;
          await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { '账号ID': acc.record_id } }),
          });
          accountBackfilled++;
        }
      }
    }
    results.accountCount = accountIdSet.size;
    results.accountBackfilled = accountBackfilled;

    // 2. 获取关联表所有记录，物理删除孤儿和unlinked记录
    const abListUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records?page_size=500`;
    const abListResp = await fetch(abListUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const abListData = await abListResp.json();
    let orphaned = 0;
    let skipped = 0;
    let noAccountId = 0;
    let noAccountIdFixed = 0;
    let unlinkedCleaned = 0;
    if (abListData.code === 0 && abListData.data?.items) {
      for (const item of abListData.data.items) {
        const existingId = getText(item.fields?.['账号ID']);
        const role = getText(item.fields?.['角色']);

        // unlinked记录直接物理删除
        if (role === 'unlinked') {
          const deleteUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records/${item.record_id}`;
          await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          unlinkedCleaned++;
          continue;
        }

        if (existingId) {
          // 账号ID对应的账号已删除，物理删除关联记录
          if (!accountIdSet.has(existingId)) {
            const deleteUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records/${item.record_id}`;
            await fetch(deleteUrl, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` },
            });
            orphaned++;
          } else {
            skipped++;
          }
        } else {
          // 没有账号ID但有账号名的有效记录，尝试通过账号名查找并回填accountId
          const accName = getText(item.fields?.['账号名']);
          if (accName && accName.trim()) {
            const accFilter = `CurrentValue.[账号名]="${accName}"`;
            const accListUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${accountTableId}/records?filter=${encodeURIComponent(accFilter)}&page_size=1`;
            const accResp = await fetch(accListUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            const accData = await accResp.json();
            if (accData.code === 0 && accData.data?.items?.length > 0) {
              const foundAccId = accData.data.items[0].record_id;
              const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records/${item.record_id}`;
              await fetch(updateUrl, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: { '账号ID': foundAccId } }),
              });
              noAccountIdFixed++;
            } else {
              // 账号不存在，物理删除
              const deleteUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records/${item.record_id}`;
              await fetch(deleteUrl, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              noAccountId++;
            }
          } else {
            // 既没账号ID也没账号名的无效记录，物理删除
            const deleteUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records/${item.record_id}`;
            await fetch(deleteUrl, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` },
            });
            noAccountId++;
          }
        }
      }
    }
    results.skipped = skipped;
    results.orphaned = orphaned;
    results.noAccountId = noAccountId;
    results.noAccountIdFixed = noAccountIdFixed;
    results.unlinkedCleaned = unlinkedCleaned;
  } catch (e) {
    results.error = e.message;
  }
  return { ok: true, ...results };
}

async function streamDeepSeek(apiKey, systemPrompt, messages, temperature, maxTokens) {
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!resp.ok) {
      return { error: `DeepSeek API 错误: ${resp.status}` };
    }

    // 返回流式 Response（SSE）
    return new Response(resp.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    return { error: e.message };
  }
}

async function handleAI(request, env) {
  if (request.method !== 'POST') return { error: 'Method not allowed' };

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return { error: 'DEEPSEEK_API_KEY 未配置' };

  const body = await request.json();
  const { action, data } = body;

  let systemPrompt = '';
  let userContent = '';
  let temperature = 0.3;
  let maxTokens = 200;

  switch (action) {
    case 'analyze': {
      const baby = data.baby || {};
      const growthRecords = data.growthRecords || [];
      const records = data.records || [];
      systemPrompt = `你是一位专业的儿童成长分析师。请根据以下宝宝数据，从身体发育、成长趋势、行为发展等方面做综合分析，给出简洁专业的建议。用中文回答，分点阐述，语气温暖亲切。`;
      userContent = `【宝宝档案】
姓名：${baby.宝宝姓名 || '未知'}
性别：${baby.性别 || '未知'}
出生日期：${baby.出生日期 || '未知'}
备注：${baby.备注 || '无'}

【身高体重记录】
${growthRecords.length > 0
        ? growthRecords.map(g => `${g.测量日期}：身高${g.身高 || '-'}cm，体重${g.体重 || '-'}kg${g.备注 ? '，' + g.备注 : ''}`).join('\n')
        : '暂无记录'}

【成长时间线】
${records.length > 0
        ? records.slice(0, 20).map(r => `${r.记录时间?.split('T')?.[0] || ''} [${r.分类}] ${r.记录内容}${r.是否为里程碑 ? ' ⭐里程碑' : ''}`).join('\n')
        : '暂无记录'}

请综合分析这个宝宝的成长情况，包括：
1. 身体发育评估（与同龄标准对比）
2. 成长趋势分析
3. 行为发展观察
4. 个性化建议`;
      temperature = 0.5;
      maxTokens = 800;
      break;
    }
    case 'category': {
      const categoryList = data.categoryList || '';
      systemPrompt = `你是一个宝宝成长记录分类助手。根据用户输入的记录内容，判断属于哪个分类。分类列表：${categoryList}。只返回分类名称，不要其他文字。`;
      userContent = data.content;
      temperature = 0;
      maxTokens = 20;
      break;
    }
    case 'polish': {
      systemPrompt = '你是一个宝宝成长记录助手。请帮用户润色记录内容，使其更简洁、温暖、有画面感。保持原意，不要添加虚构内容。直接返回润色后的文字，不要加引号或解释。';
      userContent = data.content;
      temperature = 0.5;
      maxTokens = 200;
      break;
    }
    case 'suggest': {
      const recentRecords = data.recentRecords || [];
      systemPrompt = '你是一个宝宝成长记录助手。根据用户最近的记录，建议3条今天可能想记录的内容。每条不超过20字，用换行分隔。只返回建议内容，不要编号或解释。';
      userContent = `最近记录：\n${recentRecords.join('\n')}`;
      temperature = 0.8;
      maxTokens = 150;
      break;
    }
    case 'chat': {
      const messages = data.messages || [];
      const baby = data.baby || {};
      const growthRecords = data.growthRecords || [];
      const records = data.records || [];
      const vaccines = data.vaccines || [];
      systemPrompt = `你是一位专业的儿童成长助手，名叫"小嘻"。你可以回答关于育儿、健康、营养、教育等方面的问题。

【宝宝档案】
姓名：${baby.宝宝姓名 || '宝宝'}
性别：${baby.性别 || '未知'}
出生日期：${baby.出生日期 || '未知'}
备注：${baby.备注 || '无'}

【身高体重记录】
${growthRecords.length > 0
        ? growthRecords.slice(0, 10).map(g => `${g.测量日期}：身高${g.身高 || '-'}cm，体重${g.体重 || '-'}kg`).join('\n')
        : '暂无记录'}

【最近成长记录】
${records.length > 0
        ? records.slice(0, 15).map(r => `${r.记录时间?.split('T')?.[0] || ''} [${r.分类}] ${r.记录内容}`).join('\n')
        : '暂无记录'}

【疫苗接种情况】
${vaccines.length > 0
        ? vaccines.map(v => `${v.疫苗名称} 第${v.剂次}/${v.总剂次}针 ${v.接种状态 === '已接种' ? '✓已接种(' + (v.接种时间?.split('T')?.[0] || '') + ')' : '未接种'}`).join('\n')
        : '暂无记录'}

请注意：
1. 请用"${baby.宝宝姓名 || '宝宝'}"来称呼宝宝，而不是"宝宝"这个泛称
2. 称呼提问者时用"家长"而不是"爸爸/妈妈"，因为你无法确定提问者的身份
3. 基于以上真实数据，结合专业知识，给出个性化、温暖的回答
4. 用中文回答`;
      const streamResult = await streamDeepSeek(apiKey, systemPrompt, messages, 0.7, 1000);
      // 如果是错误对象，返回JSON
      if (streamResult.error) return streamResult;
      // 流式Response，添加CORS头
      const corsHeaders = getCORSHeaders(request);
      return new Response(streamResult.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders,
        },
      });
    }
    default:
      return { error: 'Unknown action' };
  }

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { error: `DeepSeek API 错误: ${resp.status}`, detail: errText.slice(0, 200) };
    }

    const result = await resp.json();
    const content = result.choices?.[0]?.message?.content?.trim() || '';
    return { ok: true, content };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleUpload(request, env, token) {
  if (request.method !== 'POST') return { error: 'Method not allowed' };

  const formData = await request.formData();
  const file = formData.get('file');
  const recordId = formData.get('record_id');

  if (!file || !recordId) return { error: 'file and record_id are required' };

  await ensureRecordFields(token, env);

  const appToken = env.FEISHU_BASE_TOKEN;
  const tableId = env.FEISHU_TABLE_RECORD;
  const fileName = file.name || 'upload.jpg';
  const fileSize = file.size || 0;
  const isImage = (file.type || '').startsWith('image/');
  const parentType = isImage ? 'bitable_image' : 'bitable_file';

  const driveForm = new FormData();
  driveForm.append('file_name', fileName);
  driveForm.append('parent_type', parentType);
  driveForm.append('parent_node', appToken);
  driveForm.append('size', String(fileSize));
  driveForm.append('extra', JSON.stringify({ drive_route_token: appToken }));
  driveForm.append('file', file, fileName);

  const uploadResp = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: driveForm,
  });

  const uploadData = await uploadResp.json();
  if (uploadData.code !== 0) {
    return { error: `Drive上传失败: ${uploadData.msg || '未知'}`, code: uploadData.code };
  }

  const fileToken = uploadData.data?.file_token;
  if (!fileToken) {
    return { error: '上传成功但未获取到 file_token' };
  }

  const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
  const recordResp = await fetch(recordUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const recordData = await recordResp.json();

  const existingAttachments = recordData.data?.record?.fields?.['附件'] || [];
  const existingTokens = existingAttachments
    .filter(a => a.file_token)
    .map(a => ({ file_token: a.file_token }));

  const allAttachments = [...existingTokens, { file_token: fileToken }];

  const updateResp = await fetch(recordUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: { '附件': allAttachments } }),
  });

  const updateData = await updateResp.json();
  if (updateData.code !== 0) {
    return { ok: true, file_token: fileToken, warning: `附件已上传但写入记录失败: ${updateData.msg}` };
  }

  return { ok: true, file_token: fileToken };
}

async function handleAsset(request, env, token) {
  const url = new URL(request.url);
  const fileToken = url.searchParams.get('file_token');
  const mediaType = url.searchParams.get('type'); // voice / photo / video

  if (!fileToken) {
    return new Response(JSON.stringify({ error: 'file_token is required' }), {
      headers: { 'Content-Type': 'application/json', ...getCORSHeaders(request) },
    });
  }

  try {
    // 使用 batch_get_tmp_download_url 获取临时下载链接
    const tmpUrl = `${FEISHU_API}/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(fileToken)}`;
    const tmpResp = await fetch(tmpUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const tmpData = await tmpResp.json();

    if (tmpData.code !== 0 || !tmpData.data?.tmp_download_urls?.[0]?.tmp_download_url) {
      console.error('[handleAsset] 获取临时链接失败:', JSON.stringify(tmpData));
      return new Response(JSON.stringify({ error: '获取文件下载链接失败' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...getCORSHeaders(request) },
      });
    }

    const downloadUrl = tmpData.data.tmp_download_urls[0].tmp_download_url;

    // 语音文件需要代理下载并修正 Content-Type（飞书返回 video/webm，Safari 无法播放）
    // 照片和视频直接 302 重定向到飞书 CDN，避免大文件代理
    if (mediaType === 'voice') {
      const fileResp = await fetch(downloadUrl);
      if (!fileResp.ok) {
        return new Response(JSON.stringify({ error: '语音文件下载失败' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...getCORSHeaders(request) },
        });
      }
      const body = await fileResp.arrayBuffer();
      const feishuContentType = fileResp.headers.get('Content-Type') || 'application/octet-stream';

      // 根据文件魔数修正 Content-Type
      let contentType = feishuContentType;
      if (body.byteLength >= 8) {
        const header = new Uint8Array(body.slice(0, 8));
        const isMP4 = header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70;
        const isWebM = header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3;
        if (isMP4) contentType = 'audio/mp4';
        else if (isWebM) contentType = 'audio/webm';
        else contentType = feishuContentType.replace(/^video\//, 'audio/');
      } else {
        contentType = feishuContentType.replace(/^video\//, 'audio/');
      }

      return new Response(body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          ...getCORSHeaders(request),
        },
      });
    }

    // 照片/视频：302 重定向到飞书 CDN（带 CORS 头）
    return new Response(null, {
      status: 302,
      headers: { 'Location': downloadUrl, ...getCORSHeaders(request) },
    });
  } catch (e) {
    console.error('[handleAsset] 异常:', e.message);
    return new Response(JSON.stringify({ error: '文件下载异常' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCORSHeaders(request) },
    });
  }
}

// 删除账号时物理删除关联表中所有该账号的记录
async function deleteAccountAssociations(accountId, env) {
  if (!accountId) return;
  const feishuToken = await getTenantToken(env);
  const linkTableId = await ensureAccountBabyTable(feishuToken, env);
  const appToken = env.FEISHU_BASE_TOKEN;
  // 获取该账号的所有关联记录，物理删除
  const filterStr = `CurrentValue.[账号ID]="${accountId}"`;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${linkTableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=100`;
  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
  const listData = await listResp.json();
  if (listData.code === 0 && listData.data?.items) {
    for (const item of listData.data.items) {
      const deleteUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${linkTableId}/records/${item.record_id}`;
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${feishuToken}` },
      });
    }
  }
  accountBabyCache = { data: new Map(), expires: 0 };
}

// 删除宝宝时物理删除所有关联记录
async function deleteBabyAssociations(babyId, env, operatorAccount) {
  const feishuToken = await getTenantToken(env);
  const linkTableId = await ensureAccountBabyTable(feishuToken, env);
  const appToken = env.FEISHU_BASE_TOKEN;
  // 获取该宝宝的所有关联记录，物理删除
  const filterStr = `CurrentValue.[宝宝ID]="${babyId}"`;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${linkTableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=100`;
  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
  const listData = await listResp.json();
  if (listData.code === 0 && listData.data?.items) {
    for (const item of listData.data.items) {
      const deleteUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${linkTableId}/records/${item.record_id}`;
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${feishuToken}` },
      });
    }
  }
  accountBabyCache = { data: new Map(), expires: 0 };
}
