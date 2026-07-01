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

// ============ 双密码认证（无状态） ============
// 两个密码：查看密码（只读）+ 编辑密码（增删改）
// token 格式：role:hash  例如 "edit:abc123..." 或 "view:def456..."
// Worker 解析 token 前缀判断角色，校验哈希部分

// SHA-256 哈希
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 从密码哈希派生确定性 token，带角色前缀
async function deriveToken(passwordHash, role) {
  const hash = await sha256(passwordHash + ':baby-growth-auth-v2:' + role);
  return `${role}:${hash}`;
}

// 解析 token，返回 { role: 'edit'|'view', valid: boolean }
async function parseAuth(request, env) {
  const token = request.headers.get('X-Auth-Token')
    || new URL(request.url).searchParams.get('token');
  if (!token) return { role: null, valid: false };

  const colonIdx = token.indexOf(':');
  if (colonIdx === -1) return { role: null, valid: false };

  const role = token.substring(0, colonIdx);
  if (role !== 'edit' && role !== 'view') return { role: null, valid: false };

  // 校验：分别尝试编辑密码和查看密码
  const editHash = env.EDIT_PASSWORD_HASH;
  const viewHash = env.VIEW_PASSWORD_HASH;

  if (role === 'edit' && editHash) {
    const expected = await deriveToken(editHash, 'edit');
    if (token === expected) return { role: 'edit', valid: true };
  }
  if (role === 'view' && viewHash) {
    const expected = await deriveToken(viewHash, 'view');
    if (token === expected) return { role: 'view', valid: true };
  }

  return { role: null, valid: false };
}

// 处理认证请求
async function handleAuth(request, env) {
  if (request.method !== 'POST') return { error: 'Method not allowed' };

  const body = await request.json();
  const password = body.password;
  if (!password) return { error: '请输入密码' };

  const passwordHash = await sha256(password);
  const editHash = env.EDIT_PASSWORD_HASH;
  const viewHash = env.VIEW_PASSWORD_HASH;

  // 优先匹配编辑密码
  if (editHash && passwordHash === editHash) {
    const token = await deriveToken(passwordHash, 'edit');
    return { ok: true, token, role: 'edit' };
  }

  // 再匹配查看密码
  if (viewHash && passwordHash === viewHash) {
    const token = await deriveToken(passwordHash, 'view');
    return { ok: true, token, role: 'view' };
  }

  // 兼容：如果只有旧的单密码 ACCESS_PASSWORD_HASH
  const legacyHash = env.ACCESS_PASSWORD_HASH;
  if (legacyHash && passwordHash === legacyHash) {
    const token = await deriveToken(passwordHash, 'edit');
    return { ok: true, token, role: 'edit' };
  }

  return { error: '密码错误' };
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

      // 健康检查（不需要 token）
      if (path === '/api/health') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // 所有其他接口需要认证
      const auth = await parseAuth(request, env);
      const hasAnyPassword = env.EDIT_PASSWORD_HASH || env.VIEW_PASSWORD_HASH || env.ACCESS_PASSWORD_HASH;
      if (hasAnyPassword && !auth.valid) {
        return new Response(JSON.stringify({ error: '未认证，请先登录', code: 401 }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // /api/log 仅需认证，不需要编辑权限（view 也可以记录登录）
      if (path === '/api/log') {
        const token = await getTenantToken(env);
        // 从请求中获取真实 IP
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
        const result = await handleLog(request, env, token, ip);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // /api/migrate 仅需认证（迁移：创建字段 + 回填数据 + 创建日志表）
      if (path === '/api/migrate') {
        const token = await getTenantToken(env);
        const result = await handleMigrate(env, token);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // 写操作需要编辑权限
      const isWriteOp = request.method !== 'GET';
      if (hasAnyPassword && isWriteOp && auth.role !== 'edit') {
        return new Response(JSON.stringify({ error: '只有编辑权限才能执行此操作', code: 403 }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      let result;
      let binaryResponse = null;
      switch (path) {
        case '/api/babies': {
          const token = await getTenantToken(env);
          result = await handleBabies(request, env, token);
          break;
        }
        case '/api/records': {
          const token = await getTenantToken(env);
          result = await handleRecords(request, env, token);
          break;
        }
        case '/api/growth': {
          const token = await getTenantToken(env);
          result = await handleGrowth(request, env, token);
          break;
        }
        case '/api/ai':
          result = await handleAI(request, env);
          break;
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

async function handleBabies(request, env, token) {
  const tableId = env.FEISHU_TABLE_BABY;
  if (request.method === 'GET') {
    return await bitableRequest(env, token, 'GET', tableId, { page_size: 100 });
  }
  if (request.method === 'POST') {
    const body = await request.json();
    return await bitableRequest(env, token, 'POST', tableId, { fields: body.fields });
  }
  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: 'record_id is required' };
    return await bitableRequest(env, token, 'PUT', tableId, { fields: body.fields }, recordId);
  }
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const recordId = url.searchParams.get('record_id');
    if (!recordId) return { error: 'record_id is required' };
    return await bitableRequest(env, token, 'DELETE', tableId, {}, recordId);
  }
  return { error: 'Method not allowed' };
}

async function handleRecords(request, env, token) {
  const tableId = env.FEISHU_TABLE_RECORD;
  if (request.method === 'GET') {
    return await bitableRequest(env, token, 'GET', tableId, { page_size: 100 });
  }
  if (request.method === 'POST') {
    const body = await request.json();
    await ensureRecordFields(token, env);
    // 如果前端没传"上传时间"，自动填充为当前时间戳
    if (!body.fields['上传时间']) {
      body.fields['上传时间'] = Date.now();
    }
    const result = await bitableRequest(env, token, 'POST', tableId, { fields: body.fields });
    return result;
  }
  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: 'record_id is required' };
    return await bitableRequest(env, token, 'PUT', tableId, { fields: body.fields }, recordId);
  }
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const recordId = url.searchParams.get('record_id');
    if (!recordId) return { error: 'record_id is required' };
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

async function handleGrowth(request, env, token) {
  const tableId = env.FEISHU_TABLE_GROWTH;
  if (request.method === 'GET') {
    return await bitableRequest(env, token, 'GET', tableId, { page_size: 100 });
  }
  if (request.method === 'POST') {
    const body = await request.json();
    return await bitableRequest(env, token, 'POST', tableId, { fields: body.fields });
  }
  if (request.method === 'PUT') {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: 'record_id is required' };
    return await bitableRequest(env, token, 'PUT', tableId, { fields: body.fields }, recordId);
  }
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const recordId = url.searchParams.get('record_id');
    if (!recordId) return { error: 'record_id is required' };
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

  // 创建字段：时间（日期）、操作（文本）、IP（文本）、设备型号（文本）
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const logFields = [
    { field_name: '时间', type: 5 },
    { field_name: '操作', type: 1 },
    { field_name: 'IP', type: 1 },
    { field_name: '设备型号', type: 1 },
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

// 处理登录日志请求
async function handleLog(request, env, token, ip) {
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

    const resp = await fetch(recordUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          '时间': body.timestamp || Date.now(),
          '操作': body.action || 'login',
          'IP': logIp,
          '设备型号': deviceShort,
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

// 数据迁移：创建字段 + 回填上传时间 + 创建日志表
async function handleMigrate(env, token) {
  const results = {};

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
    const appToken = env.FEISHU_BASE_TOKEN;
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

  return { ok: true, ...results };
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
  const recordId = url.searchParams.get('record_id');

  if (!fileToken) {
    return new Response(JSON.stringify({ error: 'file_token is required' }), {
      headers: { 'Content-Type': 'application/json', ...getCORSHeaders(request) },
    });
  }

  const appToken = env.FEISHU_BASE_TOKEN;
  const tableId = env.FEISHU_TABLE_RECORD;

  let downloadUrl = `${FEISHU_API}/drive/v1/medias/${fileToken}/download`;

  if (recordId) {
    try {
      const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
      const fieldsResp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const fieldsData = await fieldsResp.json();
      const attachmentField = (fieldsData.data?.items || []).find(f => f.field_name === '附件');
      if (attachmentField) {
        const extra = JSON.stringify({
          bitablePerm: {
            tableId: tableId,
            attachments: { [attachmentField.field_id]: { [recordId]: [fileToken] } }
          }
        });
        downloadUrl += `?extra=${encodeURIComponent(extra)}`;
      }
    } catch (e) {
      // extra 参数获取失败，继续无 extra 下载
    }
  }

  const fileResp = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!fileResp.ok) {
    return new Response(JSON.stringify({ error: '文件下载失败', status: fileResp.status }), {
      headers: { 'Content-Type': 'application/json', ...getCORSHeaders(request) },
    });
  }

  const feishuContentType = fileResp.headers.get('Content-Type') || 'application/octet-stream';
  const body = await fileResp.arrayBuffer();

  // 根据 URL 参数 type 和文件魔数修正 Content-Type
  const mediaType = url.searchParams.get('type'); // voice / photo / video
  let contentType = feishuContentType;
  if (body.byteLength >= 12) {
    const header = new Uint8Array(body.slice(0, 12));
    const isMP4 = header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70;
    const isWebM = header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3;

    if (isMP4) {
      // 有 type 参数时精确判断：voice→audio/mp4, video→video/mp4, photo→image/xxx
      if (mediaType === 'voice') {
        contentType = 'audio/mp4';
      } else if (mediaType === 'video') {
        contentType = 'video/mp4';
      } else if (mediaType === 'photo') {
        contentType = feishuContentType.startsWith('video/') ? 'image/jpeg' : feishuContentType;
      } else {
        // 无 type 参数，回退：飞书 video/mp4 保持，video/webm 改为 audio
        if (feishuContentType === 'video/webm') {
          contentType = 'audio/mp4';
        }
        // 其他保持飞书原始 Content-Type
      }
    } else if (isWebM) {
      contentType = mediaType === 'voice' ? 'audio/webm' : feishuContentType;
    }
  }

  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      ...getCORSHeaders(request),
    },
  });
}
