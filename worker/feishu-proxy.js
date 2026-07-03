/**
 * 宝宝成长记录 - 飞书 API 代理（带密码保护）
 */
const FEISHU_API = 'https://open.feishu.cn/open-apis';

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
        const name = item.fields?.['账号名'];
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

  // 如果环境变量中有 FEISHU_TABLE_ACCOUNT，优先使用
  if (env.FEISHU_TABLE_ACCOUNT) {
    accountTableIdCache = env.FEISHU_TABLE_ACCOUNT;
    return accountTableIdCache;
  }

  const appToken = env.FEISHU_BASE_TOKEN;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;

  // 列出所有表，查找"账号表"
  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const listData = await listResp.json();
  const tables = listData.data?.items || [];
  const existing = tables.find(t => t.name === '账号表');
  if (existing) {
    accountTableIdCache = existing.table_id;
    return accountTableIdCache;
  }

  // 创建"账号表"
  const createResp = await fetch(listUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: { name: '账号表' } }),
  });
  const createData = await createResp.json();
  if (createData.code !== 0) {
    throw new Error(`创建账号表失败: ${createData.msg}`);
  }

  const tableId = createData.data?.table_id;
  if (!tableId) {
    throw new Error('创建账号表成功但未获取到 table_id');
  }

  // 创建字段：账号名（文本）、加密密码（文本）、权限（单选:view/edit/admin）、最后修改时间（日期）
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const accountFields = [
    { field_name: '账号名', type: 1 },
    { field_name: '加密密码', type: 1 },
    { field_name: '权限', type: 3, property: { options: [{ name: 'view' }, { name: 'edit' }, { name: 'admin' }, { name: 'superadmin' }] } },
    { field_name: '状态', type: 3, property: { options: [{ name: '正常' }, { name: '冻结' }, { name: '删除' }, { name: '待审批' }, { name: '审批未通过' }] } },
    { field_name: '最后修改时间', type: 5 },
  ];
  for (const field of accountFields) {
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(field),
    });
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

  // 创建默认 admin 账号（密码为空，首次登录时需设置密码）
  const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
  await fetch(recordUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        '账号名': 'admin',
        '加密密码': '',
        '权限': 'superadmin',
        '状态': '正常',
        '最后修改时间': Date.now(),
      },
    }),
  });
  adminExistsCache = true;
}

// 查找或创建"账号宝宝关联"表，返回表 ID
async function ensureAccountBabyTable(token, env) {
  if (accountBabyTableIdCache) return accountBabyTableIdCache;

  const appToken = env.FEISHU_BASE_TOKEN;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;

  const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const listData = await listResp.json();
  const tables = listData.data?.items || [];
  const existing = tables.find(t => t.name === '账号宝宝关联');
  if (existing) {
    accountBabyTableIdCache = existing.table_id;
    return accountBabyTableIdCache;
  }

  const createResp = await fetch(listUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: { name: '账号宝宝关联' } }),
  });
  const createData = await createResp.json();
  if (createData.code !== 0) {
    throw new Error(`创建账号宝宝关联表失败: ${createData.msg}`);
  }

  const tableId = createData.data?.table_id;
  if (!tableId) {
    throw new Error('创建账号宝宝关联表成功但未获取到 table_id');
  }

  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const abFields = [
    { field_name: '账号名', type: 1 },
    { field_name: '宝宝ID', type: 1 },
    { field_name: '角色', type: 3, property: { options: [{ name: 'owner' }, { name: 'editor' }, { name: 'viewer' }] } },
    { field_name: '关系', type: 3, property: { options: [{ name: '爸爸' }, { name: '妈妈' }, { name: '爷爷' }, { name: '奶奶' }, { name: '外公' }, { name: '外婆' }, { name: '姑姑' }, { name: '叔叔' }, { name: '舅舅' }, { name: '阿姨' }, { name: '其他' }] } },
    { field_name: '邀请码', type: 1 },
  ];
  for (const field of abFields) {
    await fetch(fieldsUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(field),
    });
  }

  accountBabyTableIdCache = tableId;
  return tableId;
}

// 获取账号关联的宝宝ID列表（带缓存，5分钟TTL）
async function getAccountBabyIds(accountName, env) {
  const now = Date.now();
  if (accountBabyCache.expires > now && accountBabyCache.data.has(accountName)) {
    return accountBabyCache.data.get(accountName);
  }

  try {
    const feishuToken = await getTenantToken(env);
    const tableId = await ensureAccountBabyTable(feishuToken, env);
    const appToken = env.FEISHU_BASE_TOKEN;
    const filterStr = `CurrentValue.[账号名]="${accountName}"`;
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=100`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const listData = await listResp.json();

    const links = [];
    if (listData.code === 0 && listData.data?.items) {
      for (const item of listData.data.items) {
        const babyId = item.fields?.['宝宝ID'];
        if (babyId) {
          links.push({
            babyId,
            role: item.fields?.['角色'] || 'viewer',
            relation: item.fields?.['关系'] || '其他',
            record_id: item.record_id,
          });
        }
      }
    }

    accountBabyCache.data.set(accountName, links);
    accountBabyCache.expires = now + 5 * 60 * 1000;
    return links;
  } catch (e) {
    console.error('[getAccountBabyIds] Error:', e.message);
    return [];
  }
}

// 检查账号对某宝宝是否有写权限
async function canWriteBaby(accountName, babyId, env) {
  const links = await getAccountBabyIds(accountName, env);
  const link = links.find(l => l.babyId === babyId);
  return link && (link.role === 'owner' || link.role === 'editor');
}

// 将账号关联到宝宝
async function linkAccountToBaby(accountName, babyId, role, env, relation) {
  const feishuToken = await getTenantToken(env);
  const tableId = await ensureAccountBabyTable(feishuToken, env);
  const appToken = env.FEISHU_BASE_TOKEN;
  const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;

  // 检查是否已存在关联
  const filterStr = `CurrentValue.[账号名]="${accountName}"&&CurrentValue.[宝宝ID]="${babyId}"`;
  const checkUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
  const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
  const checkData = await checkResp.json();
  if (checkData.code === 0 && checkData.data?.items?.length > 0) {
    // 已存在，更新关系和角色
    const existingRecordId = checkData.data.items[0].record_id;
    const updateFields = {};
    if (relation) updateFields['关系'] = relation;
    if (role) updateFields['角色'] = role;
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

  const fields = {
    '账号名': accountName,
    '宝宝ID': babyId,
    '角色': role || 'owner',
  };
  if (relation) fields['关系'] = relation;

  await fetch(recordUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });

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
async function redeemInviteCode(accountName, code, env) {
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
  if (fields['账号名'] && fields['账号名'].trim()) {
    return { ok: false, error: '邀请码已被使用' };
  }

  // 检查是否已关联该宝宝
  const checkFilter = `CurrentValue.[账号名]="${accountName}"&&CurrentValue.[宝宝ID]="${fields['宝宝ID']}"`;
  const checkUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(checkFilter)}&page_size=1`;
  const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
  const checkData = await checkResp.json();
  if (checkData.code === 0 && checkData.data?.items?.length > 0) {
    return { ok: false, error: '您已关联该宝宝' };
  }

  // 填入账号名
  const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${record.record_id}`;
  await fetch(updateUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { '账号名': accountName } }),
  });

  accountBabyCache = { data: new Map(), expires: 0 };
  return { ok: true, babyId: fields['宝宝ID'], relation: fields['关系'] || '其他' };
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
      results.push({
        record_id: item.record_id,
        accountName: fields['账号名'] || '',
        babyId: fields['宝宝ID'],
        role: fields['角色'] || 'viewer',
        relation: fields['关系'] || '其他',
        inviteCode: fields['邀请码'] || '',
        isPending: !fields['账号名'] || !fields['账号名'].trim(),
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
async function getAccountInfo(accountName, env) {
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
    return {
      record_id: listData.data.items[0].record_id,
      accountName: fields['账号名'],
      role: fields['权限'] || 'view',
      status: fields['状态'] || '正常',
    };
  } catch (e) {
    console.error('[getAccountInfo] Error:', e.message);
    return null;
  }
}

// 根据宝宝ID列表获取宝宝详细信息
async function getBabiesByIds(babyIds, env) {
  if (!babyIds || babyIds.length === 0) return [];
  try {
    const feishuToken = await getTenantToken(env);
    const tableId = env.FEISHU_TABLE_BABY;
    const appToken = env.FEISHU_BASE_TOKEN;
    const babies = [];
    for (const babyId of babyIds) {
      const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${babyId}`;
      const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
      const data = await resp.json();
      if (data.code === 0 && data.data?.record) {
        babies.push(data.data.record);
      }
    }
    return babies;
  } catch (e) {
    console.error('[getBabiesByIds] Error:', e.message);
    return [];
  }
}

// 处理认证请求（账号登录 + 旧密码登录兼容）
async function handleAuth(request, env) {
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
        },
      }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { error: `注册失败: ${data.msg}` };
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
      return { ok: false, error: '账号已不存在' };
    }
    if (accountInfo.status !== '正常') {
      return { ok: false, error: '账号状态异常', code: accountInfo.status === '待审批' ? 'pending' : accountInfo.status === '冻结' ? 'frozen' : accountInfo.status === '审批未通过' ? 'rejected' : 'deleted' };
    }
    // 获取关联的宝宝列表
    const links = await getAccountBabyIds(auth.accountName, env);
    const babyIds = links.map(l => l.babyId);
    const babies = await getBabiesByIds(babyIds, env);
    // Attach relation info to each baby
    const babiesWithRelation = babies.map(baby => {
      const link = links.find(l => l.babyId === baby.record_id);
      return { ...baby, relation: link?.relation || '其他', linkRole: link?.role || 'viewer' };
    });
    return { ok: true, role: auth.role, accountName: auth.accountName, status: accountInfo.status, babies: babiesWithRelation };
  }

  const account = body.account;
  const password = body.password;

  // 账号登录
  if (account) {
    const feishuToken = await getTenantToken(env);
    const tableId = await ensureAccountTable(feishuToken, env);
    await ensureDefaultAdmin(feishuToken, env, tableId);

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
    const storedEncryptedPassword = fields['加密密码'] || fields['密码哈希'] || '';
    const role = fields['权限'] || 'view';
    const accountName = fields['账号名'] || account;
    const status = fields['状态'] || '正常'; // 旧账号没有状态字段，默认正常
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
      const token = await deriveToken(await sha256(password), role, accountName);
      const links = await getAccountBabyIds(accountName, env);
      const babyIds = links.map(l => l.babyId);
      const babies = await getBabiesByIds(babyIds, env);
      const babiesWithRelation = babies.map(baby => {
        const link = links.find(l => l.babyId === baby.record_id);
        return { ...baby, relation: link?.relation || '其他', linkRole: link?.role || 'viewer' };
      });
      return { ok: true, token, role, accountName, status: '正常', babies: babiesWithRelation };
    }

    if (!storedEncryptedPassword) {
      return { error: '账号未设置密码，请联系管理员' };
    }

    if (!password) return { error: '请输入密码' };

    // 密码校验
    let passwordMatch = false;
    const aesKey = env.AES_ENCRYPT_KEY;
    if (aesKey) {
      try {
        const decryptedPassword = await aesDecrypt(storedEncryptedPassword, aesKey);
        if (decryptedPassword === password) passwordMatch = true;
      } catch (e) {}
    }
    if (!passwordMatch) {
      const inputHash = await sha256(password);
      if (inputHash === storedEncryptedPassword) passwordMatch = true;
    }
    if (!passwordMatch) return { error: '密码错误' };

    const token = await deriveToken(await sha256(password), role, accountName);
    const links = await getAccountBabyIds(accountName, env);
    const babyIds = links.map(l => l.babyId);
    const babies = await getBabiesByIds(babyIds, env);
    const babiesWithRelation = babies.map(baby => {
      const link = links.find(l => l.babyId === baby.record_id);
      return { ...baby, relation: link?.relation || '其他', linkRole: link?.role || 'viewer' };
    });
    return { ok: true, token, role, accountName, status, babies: babiesWithRelation };
  }

  return { error: '请输入账号名' };
}

// 处理账号管理请求（仅 superadmin 可操作）
async function handleAccounts(request, env, token, auth) {
  if (auth.role !== 'superadmin') {
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
      const hasPassword = !!(fields['加密密码'] || fields['密码哈希']);
      return {
        record_id: item.record_id,
        账号名: fields['账号名'] || '',
        权限: fields['权限'] || '',
        状态: fields['状态'] || '正常',
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
    const role = body.role || 'view';

    if (!accountName) return { code: -1, msg: '账号名不能为空' };
    if (!password) return { code: -1, msg: '密码不能为空' };
    if (!['view', 'edit', 'admin', 'superadmin'].includes(role)) return { code: -1, msg: '权限值无效' };

    const filterStr = `CurrentValue.[账号名]="${accountName}"`;
    const checkUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=1`;
    const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
    const checkData = await checkResp.json();
    if (checkData.code === 0 && checkData.data?.items?.length > 0) {
      return { code: -1, msg: '账号名已存在' };
    }

    const encryptedPassword = await encryptPassword(password, env);
    const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
    const resp = await fetch(recordUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${feishuToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          '账号名': accountName,
          '加密密码': encryptedPassword,
          '状态': '正常',
          '最后修改时间': Date.now(),
        },
      }),
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
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
      return { code: 0, data: { record: data.data?.record } };
    }

    // 普通编辑
    const updateFields = {};
    if (body.accountName !== undefined) {
      const filterStr = `CurrentValue.[账号名]="${body.accountName}"`;
      const checkUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(filterStr)}&page_size=10`;
      const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${feishuToken}` } });
      const checkData = await checkResp.json();
      if (checkData.code === 0 && checkData.data?.items?.length > 0) {
        const otherRecord = checkData.data.items.find(i => i.record_id !== recordId);
        if (otherRecord) return { code: -1, msg: '账号名已存在' };
      }
      updateFields['账号名'] = body.accountName;
    }
    if (body.password !== undefined) {
      if (!body.password) return { code: -1, msg: '密码不能为空' };
      updateFields['加密密码'] = await encryptPassword(body.password, env);
    }
    if (body.role !== undefined) {
      if (!['view', 'edit', 'admin', 'superadmin'].includes(body.role)) return { code: -1, msg: '权限值无效' };
      updateFields['权限'] = body.role;
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
    return { code: 0, data: { record: data.data?.record } };
  }

  if (request.method === 'DELETE') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { code: -1, msg: 'record_id is required' };

    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${feishuToken}` },
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    return { code: 0 };
  }

  return { code: -1, msg: 'Method not allowed' };
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCORSHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 认证接口（不需要 token）
      if (path === '/api/auth') {
        const result = await handleAuth(request, env);
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
        const result = await handleMigrate(env, token);
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
            const links = await getAccountBabyIds(auth.accountName, env);
            const myLink = links.find(l => l.babyId === babyId);
            if (!myLink || myLink.role !== 'owner') {
              return new Response(JSON.stringify({ error: '只有宝宝的创建者才能邀请' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            const code = await createInviteCode(babyId, role || 'editor', relation || '其他', env);
            return new Response(JSON.stringify({ ok: true, code }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (body.action === 'redeem') {
            // 使用邀请码
            const { code } = body;
            if (!code) return new Response(JSON.stringify({ error: '请输入邀请码' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const result = await redeemInviteCode(auth.accountName, code, env);
            return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (body.action === 'list') {
            // 获取宝宝的联系人和待领取邀请码
            const { babyId } = body;
            if (!babyId) return new Response(JSON.stringify({ error: 'babyId is required' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const contacts = await getBabyInviteCodes(babyId, env);
            return new Response(JSON.stringify({ ok: true, contacts }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (body.action === 'remove') {
            // 移除联系人或取消邀请
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
              const babyId = recData.data.record.fields?.['宝宝ID'];
              const links = await getAccountBabyIds(auth.accountName, env);
              const myLink = links.find(l => l.babyId === babyId);
              if (!myLink || myLink.role !== 'owner') {
                return new Response(JSON.stringify({ error: '只有宝宝的创建者才能移除联系人' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
              }
            }
            const deleteUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${abTableId}/records/${record_id}`;
            await fetch(deleteUrl, { method: 'DELETE', headers: { 'Authorization': `Bearer ${feishuToken}` } });
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
          await linkAccountToBaby(auth.accountName, babyId, 'owner', env, body.relation);
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
        const result = await handleLog(request, env, token, ip, auth);
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

  if (request.method === 'GET') {
    // 只返回该账号关联的宝宝
    const links = await getAccountBabyIds(auth.accountName, env);
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
    const result = await bitableRequest(env, token, 'POST', tableId, { fields: body.fields });
    // 自动关联新宝宝到创建者
    if (result.data?.record?.record_id) {
      await linkAccountToBaby(auth.accountName, result.data.record.record_id, 'owner', env, body.fields['关系'] || '其他');
    }
    return result;
  }
  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: 'record_id is required' };
    // Check write permission for this baby
    const canWrite = await canWriteBaby(auth.accountName, recordId, env);
    if (!canWrite) {
      return { error: '只有owner或editor才能编辑宝宝信息', code: 403 };
    }
    return await bitableRequest(env, token, 'PUT', tableId, { fields: body.fields }, recordId);
  }
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const recordId = url.searchParams.get('record_id');
    if (!recordId) return { error: 'record_id is required' };
    // Only owner can delete baby
    const links = await getAccountBabyIds(auth.accountName, env);
    const myLink = links.find(l => l.babyId === recordId);
    if (!myLink || myLink.role !== 'owner') {
      return { error: '只有宝宝的创建者才能删除' };
    }
    return await bitableRequest(env, token, 'DELETE', tableId, {}, recordId);
  }
  return { error: 'Method not allowed' };
}

async function handleRecords(request, env, token, auth) {
  const tableId = env.FEISHU_TABLE_RECORD;
  const appToken = env.FEISHU_BASE_TOKEN;

  if (request.method === 'GET') {
    const links = await getAccountBabyIds(auth.accountName, env);
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
      const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
      if (!canWrite) {
        return { error: '只有owner或editor才能添加记录', code: 403 };
      }
    }
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
        const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { error: '只有owner或editor才能编辑记录', code: 403 };
        }
      }
    }
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
        const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
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

  if (request.method === 'GET') {
    const links = await getAccountBabyIds(auth.accountName, env);
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
      const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
      if (!canWrite) {
        return { error: '只有owner或editor才能添加成长记录', code: 403 };
      }
    }
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
        const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { error: '只有owner或editor才能编辑成长记录', code: 403 };
        }
      }
    }
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
        const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
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

  // 创建字段：时间（日期）、操作（文本）、IP（文本）、设备型号（文本）、系统版本（文本）、登录账号（文本）
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const logFields = [
    { field_name: '时间', type: 5 },
    { field_name: '操作', type: 1 },
    { field_name: 'IP', type: 1 },
    { field_name: '设备型号', type: 1 },
    { field_name: '系统版本', type: 1 },
    { field_name: '登录账号', type: 1 },
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

  if (request.method === 'GET') {
    const links = await getAccountBabyIds(auth.accountName, env);
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
      const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
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
        const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
        if (!canWrite) {
          return { code: -1, msg: '只有owner或editor才能编辑疫苗记录' };
        }
      }
    }
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
        const canWrite = await canWriteBaby(auth.accountName, linkedBabyIds[0], env);
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
  } catch (e) {
    results.accountBabyTableCreated = false;
    results.accountBabyTableError = e.message;
  }

  // 10. 确保账号表有"状态"字段
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
  } catch (e) {
    results.statusFieldError = e.message;
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
        const accName = fields['账号名'];
        const accStatus = fields['状态'];

        // 设置状态为approved（如果还没有状态字段）
        if (!accStatus) {
          const updateFields = { '状态': '正常' };
          // Upgrade admin to superadmin
          if (fields['权限'] === 'admin' && accName === 'admin') {
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
          await linkAccountToBaby(accName, baby.record_id, fields['权限'] === 'superadmin' || fields['权限'] === 'admin' ? 'owner' : 'editor', env, fields['权限'] === 'superadmin' || fields['权限'] === 'admin' ? '爸爸' : '其他');
        }
      }
      results.existingAccountsMigrated = accListData.data.items.length;
    }
  } catch (e) {
    results.accountMigrationError = e.message;
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
