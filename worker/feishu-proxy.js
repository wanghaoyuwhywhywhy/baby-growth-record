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
        case '/api/health':
          result = { ok: true, message: 'Worker is running' };
          break;
        default:
          result = { error: 'Not found', path };
      }

      if (binaryResponse) return binaryResponse;

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

// AI 代理：调用 DeepSeek API
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
      // AI 综合分析：宝宝档案 + 身高体重 + 成长时间线
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

// 确保记录表有"附件"字段（type=17），返回字段信息
async function ensureAttachmentField(token, env) {
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${env.FEISHU_TABLE_RECORD}/fields`;
  const resp = await fetch(fieldsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await resp.json();
  const fields = data.data?.items || [];
  const existing = fields.find(f => f.field_name === '附件');
  if (existing) return existing;
  // 创建附件字段
  const createResp = await fetch(fieldsUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_name: '附件', type: 17 }),
  });
  const createData = await createResp.json();
  return createData.data?.field || {};
}

// 上传媒体文件到飞书多维表格附件字段
// 正确流程：1. Drive API 上传文件获取 file_token  2. 更新记录的附件字段
async function handleUpload(request, env, token) {
  if (request.method !== 'POST') return { error: 'Method not allowed' };

  const formData = await request.formData();
  const file = formData.get('file');
  const recordId = formData.get('record_id');

  if (!file || !recordId) return { error: 'file and record_id are required', debug_file_type: typeof file, debug_record_id: recordId };

  // 确保附件字段存在
  await ensureAttachmentField(token, env);

  const appToken = env.FEISHU_BASE_TOKEN;
  const tableId = env.FEISHU_TABLE_RECORD;
  const fileName = file.name || 'upload.jpg';
  const fileSize = file.size || 0;
  const isImage = (file.type || '').startsWith('image/');
  const parentType = isImage ? 'bitable_image' : 'bitable_file';

  // Step 1: 通过 Drive 上传素材 API 上传文件
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
    return {
      error: `Drive上传失败: ${uploadData.msg || '未知'}`,
      code: uploadData.code,
      debug: { fileName, fileSize, parentType, recordId },
      feishu_response: JSON.stringify(uploadData).slice(0, 500)
    };
  }

  const fileToken = uploadData.data?.file_token;
  if (!fileToken) {
    return { error: '上传成功但未获取到 file_token', detail: JSON.stringify(uploadData).slice(0, 500) };
  }

  // Step 2: 读取当前记录，获取现有附件
  const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
  const recordResp = await fetch(recordUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  const recordData = await recordResp.json();

  const existingAttachments = recordData.data?.record?.fields?.['附件'] || [];
  const existingTokens = existingAttachments
    .filter(a => a.file_token)
    .map(a => ({ file_token: a.file_token }));

  // 添加新的 file_token
  const allAttachments = [...existingTokens, { file_token: fileToken }];

  // Step 3: 更新记录的附件字段
  const updateResp = await fetch(recordUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        '附件': allAttachments,
      },
    }),
  });

  const updateData = await updateResp.json();
  if (updateData.code !== 0) {
    // 文件已上传成功，仍然返回 file_token，但记录更新失败
    return {
      ok: true,
      file_token: fileToken,
      warning: `附件已上传但写入记录失败: ${updateData.msg}`,
    };
  }

  return { ok: true, file_token: fileToken };
}

// 代理下载飞书附件
async function handleAsset(request, env, token) {
  const url = new URL(request.url);
  const fileToken = url.searchParams.get('file_token');
  const recordId = url.searchParams.get('record_id');

  if (!fileToken) {
    return new Response(JSON.stringify({ error: 'file_token is required' }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const appToken = env.FEISHU_BASE_TOKEN;
  const tableId = env.FEISHU_TABLE_RECORD;

  // 通过 Drive 下载素材 API 下载文件
  let downloadUrl = `${FEISHU_API}/drive/v1/medias/${fileToken}/download`;

  // 如果有 record_id，添加 extra 参数（用于高级权限 bitable）
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
            attachments: {
              [attachmentField.field_id]: {
                [recordId]: [fileToken]
              }
            }
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
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const contentType = fileResp.headers.get('Content-Type') || 'application/octet-stream';
  const body = await fileResp.arrayBuffer();

  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      ...CORS_HEADERS,
    },
  });
}
