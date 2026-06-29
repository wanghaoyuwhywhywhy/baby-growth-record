/**
 * 宝宝成长记录 - 飞书 API 代理
 */
const FEISHU_API = 'https://open.feishu.cn/open-apis';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 调试接口：检查环境变量是否正确读取
      if (path === '/api/debug') {
        return new Response(JSON.stringify({
          app_id_set: !!env.FEISHU_APP_ID,
          app_id_prefix: env.FEISHU_APP_ID ? env.FEISHU_APP_ID.slice(0, 8) + '...' : 'NOT SET',
          app_secret_set: !!env.FEISHU_APP_SECRET,
          base_token_set: !!env.FEISHU_BASE_TOKEN,
          base_token_value: env.FEISHU_BASE_TOKEN || 'NOT SET',
          table_baby: env.FEISHU_TABLE_BABY || 'NOT SET',
          table_record: env.FEISHU_TABLE_RECORD || 'NOT SET',
          table_growth: env.FEISHU_TABLE_GROWTH || 'NOT SET',
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      const token = await getTenantToken(env);

      let result;
      switch (path) {
        case '/api/babies':
          result = await handleBabies(request, env, token);
          break;
        case '/api/records':
          result = await handleRecords(request, env, token);
          break;
        case '/api/growth':
          result = await handleGrowth(request, env, token);
          break;
        case '/api/health':
          result = { ok: true, message: 'Worker is running' };
          break;
        default:
          result = { error: 'Not found', path };
      }

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  },
};

let tokenCache = { token: null, expires: 0 };

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
