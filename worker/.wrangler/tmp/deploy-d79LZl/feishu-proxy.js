var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// feishu-proxy.js
var FEISHU_API = "https://open.feishu.cn/open-apis";
var ALLOWED_ORIGINS = [
  "https://tongxi.xyz",
  "https://baby-growth-record.pages.dev",
  "http://localhost:5173"
  // 本地开发
];
function getCORSHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token"
  };
}
__name(getCORSHeaders, "getCORSHeaders");
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function parseOS(ua) {
  let m = ua.match(/iPhone OS (\d+[._]\d+)/);
  if (m) return "iOS " + m[1].replace("_", ".");
  m = ua.match(/iPad.*OS (\d+[._]\d+)/);
  if (m) return "iPadOS " + m[1].replace("_", ".");
  m = ua.match(/Android (\d+(\.\d+)?)/);
  if (m) return "Android " + m[1];
  m = ua.match(/Mac OS X (\d+[._]\d+)/);
  if (m) return "macOS " + m[1].replace("_", ".");
  m = ua.match(/Windows NT (\d+\.\d+)/);
  if (m) {
    const winMap = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" };
    return "Windows " + (winMap[m[1]] || m[1]);
  }
  return "\u672A\u77E5";
}
__name(parseOS, "parseOS");
async function deriveToken(passwordHash, role) {
  const hash = await sha256(passwordHash + ":baby-growth-auth-v2:" + role);
  return `${role}:${hash}`;
}
__name(deriveToken, "deriveToken");
async function parseAuth(request, env) {
  const token = request.headers.get("X-Auth-Token") || new URL(request.url).searchParams.get("token");
  if (!token) return { role: null, valid: false };
  const colonIdx = token.indexOf(":");
  if (colonIdx === -1) return { role: null, valid: false };
  const role = token.substring(0, colonIdx);
  if (role !== "edit" && role !== "view") return { role: null, valid: false };
  const editHash = env.EDIT_PASSWORD_HASH;
  const viewHash = env.VIEW_PASSWORD_HASH;
  if (role === "edit" && editHash) {
    const expected = await deriveToken(editHash, "edit");
    if (token === expected) return { role: "edit", valid: true };
  }
  if (role === "view" && viewHash) {
    const expected = await deriveToken(viewHash, "view");
    if (token === expected) return { role: "view", valid: true };
  }
  return { role: null, valid: false };
}
__name(parseAuth, "parseAuth");
async function handleAuth(request, env) {
  if (request.method !== "POST") return { error: "Method not allowed" };
  const body = await request.json();
  const password = body.password;
  if (!password) return { error: "\u8BF7\u8F93\u5165\u5BC6\u7801" };
  const passwordHash = await sha256(password);
  const editHash = env.EDIT_PASSWORD_HASH;
  const viewHash = env.VIEW_PASSWORD_HASH;
  if (editHash && passwordHash === editHash) {
    const token = await deriveToken(passwordHash, "edit");
    return { ok: true, token, role: "edit" };
  }
  if (viewHash && passwordHash === viewHash) {
    const token = await deriveToken(passwordHash, "view");
    return { ok: true, token, role: "view" };
  }
  const legacyHash = env.ACCESS_PASSWORD_HASH;
  if (legacyHash && passwordHash === legacyHash) {
    const token = await deriveToken(passwordHash, "edit");
    return { ok: true, token, role: "edit" };
  }
  return { error: "\u5BC6\u7801\u9519\u8BEF" };
}
__name(handleAuth, "handleAuth");
var feishu_proxy_default = {
  async fetch(request, env) {
    const corsHeaders = getCORSHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api/auth") {
        const result2 = await handleAuth(request, env);
        return new Response(JSON.stringify(result2), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      if (path === "/api/health") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      const auth = await parseAuth(request, env);
      const hasAnyPassword = env.EDIT_PASSWORD_HASH || env.VIEW_PASSWORD_HASH || env.ACCESS_PASSWORD_HASH;
      if (hasAnyPassword && !auth.valid) {
        return new Response(JSON.stringify({ error: "\u672A\u8BA4\u8BC1\uFF0C\u8BF7\u5148\u767B\u5F55", code: 401 }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      if (path === "/api/vaccines") {
        const token = await getTenantToken(env);
        const result2 = await handleVaccines(request, env, token);
        return new Response(JSON.stringify(result2), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      if (path === "/api/log") {
        const token = await getTenantToken(env);
        const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
        const result2 = await handleLog(request, env, token, ip, auth.role);
        return new Response(JSON.stringify(result2), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      if (path === "/api/migrate") {
        const token = await getTenantToken(env);
        const result2 = await handleMigrate(env, token);
        return new Response(JSON.stringify(result2), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      if (path === "/api/ai") {
        const aiResult = await handleAI(request, env);
        if (aiResult instanceof Response) return aiResult;
        return new Response(JSON.stringify(aiResult), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      const isWriteOp = request.method !== "GET";
      if (hasAnyPassword && isWriteOp && auth.role !== "edit") {
        return new Response(JSON.stringify({ error: "\u53EA\u6709\u7F16\u8F91\u6743\u9650\u624D\u80FD\u6267\u884C\u6B64\u64CD\u4F5C", code: 403 }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      let result;
      let binaryResponse = null;
      switch (path) {
        case "/api/babies": {
          const token = await getTenantToken(env);
          result = await handleBabies(request, env, token);
          break;
        }
        case "/api/records": {
          const token = await getTenantToken(env);
          result = await handleRecords(request, env, token);
          break;
        }
        case "/api/growth": {
          const token = await getTenantToken(env);
          result = await handleGrowth(request, env, token);
          break;
        }
        case "/api/upload": {
          const token = await getTenantToken(env);
          result = await handleUpload(request, env, token);
          break;
        }
        case "/api/asset": {
          const token = await getTenantToken(env);
          binaryResponse = await handleAsset(request, env, token);
          break;
        }
        default:
          result = { error: "Not found", path };
      }
      if (binaryResponse) return binaryResponse;
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
  }
};
var tokenCache = { token: null, expires: 0 };
var logTableIdCache = null;
var vaccineTableIdCache = null;
async function getTenantToken(env) {
  if (tokenCache.token && Date.now() < tokenCache.expires) {
    return tokenCache.token;
  }
  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(`\u73AF\u5883\u53D8\u91CF\u7F3A\u5931: APP_ID=${!!appId}, APP_SECRET=${!!appSecret}`);
  }
  const resp = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`\u83B7\u53D6 token \u5931\u8D25: ${data.msg} (app_id=${appId})`);
  tokenCache = {
    token: data.tenant_access_token,
    expires: Date.now() + (data.expire - 300) * 1e3
  };
  return tokenCache.token;
}
__name(getTenantToken, "getTenantToken");
async function bitableRequest(env, token, method, tableId, params = {}, recordId = null) {
  let url = `${FEISHU_API}/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${tableId}/records`;
  if (recordId) {
    url += `/${recordId}`;
  }
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  };
  if (method === "GET") {
    const query = new URLSearchParams(params).toString();
    const fullUrl = query ? `${url}?${query}` : url;
    const resp = await fetch(fullUrl, options);
    return resp.json();
  } else if (method === "DELETE") {
    const resp = await fetch(url, options);
    return resp.json();
  } else {
    options.body = JSON.stringify(params);
    const resp = await fetch(url, options);
    return resp.json();
  }
}
__name(bitableRequest, "bitableRequest");
async function handleBabies(request, env, token) {
  const tableId = env.FEISHU_TABLE_BABY;
  if (request.method === "GET") {
    return await bitableRequest(env, token, "GET", tableId, { page_size: 100 });
  }
  if (request.method === "POST") {
    const body = await request.json();
    return await bitableRequest(env, token, "POST", tableId, { fields: body.fields });
  }
  if (request.method === "PUT") {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: "record_id is required" };
    return await bitableRequest(env, token, "PUT", tableId, { fields: body.fields }, recordId);
  }
  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const recordId = url.searchParams.get("record_id");
    if (!recordId) return { error: "record_id is required" };
    return await bitableRequest(env, token, "DELETE", tableId, {}, recordId);
  }
  return { error: "Method not allowed" };
}
__name(handleBabies, "handleBabies");
async function handleRecords(request, env, token) {
  const tableId = env.FEISHU_TABLE_RECORD;
  if (request.method === "GET") {
    return await bitableRequest(env, token, "GET", tableId, { page_size: 100 });
  }
  if (request.method === "POST") {
    const body = await request.json();
    await ensureRecordFields(token, env);
    if (!body.fields["\u4E0A\u4F20\u65F6\u95F4"]) {
      body.fields["\u4E0A\u4F20\u65F6\u95F4"] = Date.now();
    }
    const result = await bitableRequest(env, token, "POST", tableId, { fields: body.fields });
    return result;
  }
  if (request.method === "PUT") {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: "record_id is required" };
    return await bitableRequest(env, token, "PUT", tableId, { fields: body.fields }, recordId);
  }
  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const recordId = url.searchParams.get("record_id");
    if (!recordId) return { error: "record_id is required" };
    return await bitableRequest(env, token, "DELETE", tableId, {}, recordId);
  }
  return { error: "Method not allowed" };
}
__name(handleRecords, "handleRecords");
async function ensureRecordFields(token, env) {
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${env.FEISHU_TABLE_RECORD}/fields`;
  const resp = await fetch(fieldsUrl, { headers: { "Authorization": `Bearer ${token}` } });
  const data = await resp.json();
  const fields = data.data?.items || [];
  const mediaTypeField = fields.find((f) => f.field_name === "\u5A92\u4F53\u7C7B\u578B");
  if (!mediaTypeField) {
    await fetch(fieldsUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        field_name: "\u5A92\u4F53\u7C7B\u578B",
        type: 4,
        property: { options: [{ name: "text" }, { name: "voice" }, { name: "video" }, { name: "photo" }] }
      })
    });
  } else if (mediaTypeField.type === 3) {
    await fetch(`${fieldsUrl}/${mediaTypeField.field_id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
    await fetch(fieldsUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        field_name: "\u5A92\u4F53\u7C7B\u578B",
        type: 4,
        property: { options: [{ name: "text" }, { name: "voice" }, { name: "video" }, { name: "photo" }] }
      })
    });
  }
  const hasAttachment = fields.some((f) => f.field_name === "\u9644\u4EF6");
  if (!hasAttachment) {
    await fetch(fieldsUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ field_name: "\u9644\u4EF6", type: 17 })
    });
  }
  const hasVoiceTranscript = fields.some((f) => f.field_name === "\u8BED\u97F3\u8F6C\u6587\u5B57");
  if (!hasVoiceTranscript) {
    await fetch(fieldsUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ field_name: "\u8BED\u97F3\u8F6C\u6587\u5B57", type: 1 })
    });
  }
  const hasUploadTime = fields.some((f) => f.field_name === "\u4E0A\u4F20\u65F6\u95F4");
  if (!hasUploadTime) {
    await fetch(fieldsUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ field_name: "\u4E0A\u4F20\u65F6\u95F4", type: 5 })
    });
  }
}
__name(ensureRecordFields, "ensureRecordFields");
async function handleGrowth(request, env, token) {
  const tableId = env.FEISHU_TABLE_GROWTH;
  if (request.method === "GET") {
    return await bitableRequest(env, token, "GET", tableId, { page_size: 100 });
  }
  if (request.method === "POST") {
    const body = await request.json();
    return await bitableRequest(env, token, "POST", tableId, { fields: body.fields });
  }
  if (request.method === "PUT") {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { error: "record_id is required" };
    return await bitableRequest(env, token, "PUT", tableId, { fields: body.fields }, recordId);
  }
  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const recordId = url.searchParams.get("record_id");
    if (!recordId) return { error: "record_id is required" };
    return await bitableRequest(env, token, "DELETE", tableId, {}, recordId);
  }
  return { error: "Method not allowed" };
}
__name(handleGrowth, "handleGrowth");
async function ensureLogTable(token, env) {
  if (logTableIdCache) return logTableIdCache;
  const appToken = env.FEISHU_BASE_TOKEN;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;
  const listResp = await fetch(listUrl, { headers: { "Authorization": `Bearer ${token}` } });
  const listData = await listResp.json();
  const tables = listData.data?.items || [];
  const existing = tables.find((t) => t.name === "\u767B\u5F55\u65E5\u5FD7");
  if (existing) {
    logTableIdCache = existing.table_id;
    return logTableIdCache;
  }
  const createResp = await fetch(listUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ table: { name: "\u767B\u5F55\u65E5\u5FD7" } })
  });
  const createData = await createResp.json();
  if (createData.code !== 0) {
    throw new Error(`\u521B\u5EFA\u767B\u5F55\u65E5\u5FD7\u8868\u5931\u8D25: ${createData.msg}`);
  }
  const tableId = createData.data?.table_id;
  if (!tableId) {
    throw new Error("\u521B\u5EFA\u767B\u5F55\u65E5\u5FD7\u8868\u6210\u529F\u4F46\u672A\u83B7\u53D6\u5230 table_id");
  }
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const logFields = [
    { field_name: "\u65F6\u95F4", type: 5 },
    { field_name: "\u64CD\u4F5C", type: 1 },
    { field_name: "IP", type: 1 },
    { field_name: "\u8BBE\u5907\u578B\u53F7", type: 1 },
    { field_name: "\u7CFB\u7EDF\u7248\u672C", type: 1 },
    { field_name: "\u767B\u5F55\u8D26\u53F7", type: 1 }
  ];
  for (const field of logFields) {
    await fetch(fieldsUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(field)
    });
  }
  logTableIdCache = tableId;
  return tableId;
}
__name(ensureLogTable, "ensureLogTable");
async function ensureVaccineTable(token, env) {
  if (vaccineTableIdCache) return vaccineTableIdCache;
  const appToken = env.FEISHU_BASE_TOKEN;
  const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables`;
  const listResp = await fetch(listUrl, { headers: { "Authorization": `Bearer ${token}` } });
  const listData = await listResp.json();
  const tables = listData.data?.items || [];
  const existing = tables.find((t) => t.name === "\u75AB\u82D7\u63A5\u79CD");
  if (existing) {
    vaccineTableIdCache = existing.table_id;
    return vaccineTableIdCache;
  }
  const createResp = await fetch(listUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ table: { name: "\u75AB\u82D7\u63A5\u79CD" } })
  });
  const createData = await createResp.json();
  if (createData.code !== 0) {
    throw new Error(`\u521B\u5EFA\u75AB\u82D7\u63A5\u79CD\u8868\u5931\u8D25: ${createData.msg}`);
  }
  const tableId = createData.data?.table_id;
  if (!tableId) {
    throw new Error("\u521B\u5EFA\u75AB\u82D7\u63A5\u79CD\u8868\u6210\u529F\u4F46\u672A\u83B7\u53D6\u5230 table_id");
  }
  const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const vaccineFields = [
    { field_name: "\u75AB\u82D7\u540D\u79F0", type: 1 },
    { field_name: "\u5242\u6B21", type: 2 },
    { field_name: "\u603B\u5242\u6B21", type: 2 },
    { field_name: "\u8D39\u7528\u7C7B\u578B", type: 3, property: { options: [{ name: "\u514D\u8D39" }, { name: "\u81EA\u8D39" }] } },
    { field_name: "\u6708\u9F84", type: 1 },
    { field_name: "\u9884\u8BA1\u63A5\u79CD\u65F6\u95F4", type: 5 },
    { field_name: "\u63A5\u79CD\u72B6\u6001", type: 3, property: { options: [{ name: "\u672A\u63A5\u79CD" }, { name: "\u5DF2\u63A5\u79CD" }] } },
    { field_name: "\u63A5\u79CD\u65F6\u95F4", type: 5 },
    { field_name: "\u5173\u8054\u5B9D\u5B9D", type: 18, property: { table_id: env.FEISHU_TABLE_BABY } }
  ];
  for (const field of vaccineFields) {
    await fetch(fieldsUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(field)
    });
  }
  vaccineTableIdCache = tableId;
  return tableId;
}
__name(ensureVaccineTable, "ensureVaccineTable");
async function handleVaccines(request, env, token) {
  const appToken = env.FEISHU_BASE_TOKEN;
  const tableId = await ensureVaccineTable(token, env);
  if (request.method === "GET") {
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500`;
    const resp = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    return { code: 0, data: { items: data.data?.items || [] } };
  }
  if (request.method === "POST") {
    const body = await request.json();
    const name = body.fields?.["\u75AB\u82D7\u540D\u79F0"];
    const dose = body.fields?.["\u5242\u6B21"];
    if (name && dose !== void 0) {
      const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?filter=${encodeURIComponent(`CurrentValue.[\u75AB\u82D7\u540D\u79F0]="${name}"&&CurrentValue.[\u5242\u6B21]=${dose}`)}&page_size=1`;
      const listResp = await fetch(listUrl, { headers: { "Authorization": `Bearer ${token}` } });
      const listData = await listResp.json();
      if (listData.code === 0 && listData.data?.items?.length > 0) {
        return { code: 0, data: { record: listData.data.items[0], duplicate: true } };
      }
    }
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: body.fields })
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    return { code: 0, data: { record: data.data?.record } };
  }
  if (request.method === "PUT") {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { code: -1, msg: "record_id is required" };
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: body.fields })
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    return { code: 0, data: { record: data.data?.record } };
  }
  if (request.method === "DELETE") {
    const body = await request.json();
    const recordId = body.record_id;
    if (!recordId) return { code: -1, msg: "record_id is required" };
    const url = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
    const resp = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();
    if (data.code !== 0) return { code: -1, msg: data.msg };
    return { code: 0 };
  }
  return { code: -1, msg: "Method not allowed" };
}
__name(handleVaccines, "handleVaccines");
async function handleLog(request, env, token, ip, authRole) {
  if (request.method !== "POST") return { error: "Method not allowed" };
  try {
    const body = await request.json();
    const tableId = await ensureLogTable(token, env);
    const appToken = env.FEISHU_BASE_TOKEN;
    const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
    const logIp = ip || body.ip || "";
    const ua = body.device || "";
    let deviceShort = "\u672A\u77E5";
    if (/iPhone/i.test(ua)) deviceShort = "iPhone";
    else if (/iPad/i.test(ua)) deviceShort = "iPad";
    else if (/Android/i.test(ua)) deviceShort = "Android";
    else if (/Mac/i.test(ua)) deviceShort = "Mac";
    else if (/Windows/i.test(ua)) deviceShort = "Windows";
    else if (/Linux/i.test(ua)) deviceShort = "Linux";
    const osVersion = parseOS(ua);
    const loginAccount = authRole || "\u672A\u77E5";
    const resp = await fetch(recordUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          "\u65F6\u95F4": body.timestamp || Date.now(),
          "\u64CD\u4F5C": body.action || "login",
          "IP": logIp,
          "\u8BBE\u5907\u578B\u53F7": deviceShort,
          "\u7CFB\u7EDF\u7248\u672C": osVersion,
          "\u767B\u5F55\u8D26\u53F7": loginAccount
        }
      })
    });
    const result = await resp.json();
    if (result.code !== 0) {
      console.error("[handleLog] \u5199\u5165\u5931\u8D25:", result.code, result.msg);
      return { error: `\u5199\u5165\u767B\u5F55\u65E5\u5FD7\u5931\u8D25: ${result.msg}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[handleLog] \u5F02\u5E38:", e.message);
    return { error: e.message };
  }
}
__name(handleLog, "handleLog");
async function handleMigrate(env, token) {
  const results = {};
  const appToken = env.FEISHU_BASE_TOKEN;
  try {
    await ensureRecordFields(token, env);
    results.fieldCreated = true;
  } catch (e) {
    results.fieldCreated = false;
    results.fieldError = e.message;
  }
  try {
    const tableId = env.FEISHU_TABLE_RECORD;
    const listUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`;
    const listResp = await fetch(listUrl, { headers: { "Authorization": `Bearer ${token}` } });
    const listData = await listResp.json();
    if (listData.code === 0 && listData.data?.items) {
      let backfilled = 0;
      for (const item of listData.data.items) {
        const fields = item.fields || {};
        if (!fields["\u4E0A\u4F20\u65F6\u95F4"] && fields["\u8BB0\u5F55\u65F6\u95F4"]) {
          const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${item.record_id}`;
          await fetch(updateUrl, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ fields: { "\u4E0A\u4F20\u65F6\u95F4": fields["\u8BB0\u5F55\u65F6\u95F4"] } })
          });
          backfilled++;
        }
      }
      results.backfilled = backfilled;
    }
  } catch (e) {
    results.backfillError = e.message;
  }
  try {
    const logTableId = await ensureLogTable(token, env);
    results.logTableCreated = true;
    results.logTableId = logTableId;
  } catch (e) {
    results.logTableCreated = false;
    results.logTableError = e.message;
  }
  try {
    const tablesToMigrate = [
      { name: "\u8BB0\u5F55\u8868", tableId: env.FEISHU_TABLE_RECORD },
      { name: "\u6210\u957F\u8868", tableId: env.FEISHU_TABLE_GROWTH }
    ];
    if (results.logTableId) {
      tablesToMigrate.push({ name: "\u767B\u5F55\u65E5\u5FD7\u8868", tableId: results.logTableId });
    }
    let dateFieldsUpdated = 0;
    for (const table of tablesToMigrate) {
      if (!table.tableId) continue;
      const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${table.tableId}/fields`;
      const fieldsResp = await fetch(fieldsUrl, { headers: { "Authorization": `Bearer ${token}` } });
      const fieldsData = await fieldsResp.json();
      const fields = fieldsData.data?.items || [];
      for (const field of fields) {
        if (field.type === 5) {
          const updateUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${table.tableId}/fields/${field.field_id}`;
          await fetch(updateUrl, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              field_name: field.field_name,
              type: 5,
              property: { date_format: "yyyy-MM-dd HH:mm:ss" }
            })
          });
          dateFieldsUpdated++;
        }
      }
    }
    results.dateFieldsUpdated = dateFieldsUpdated;
  } catch (e) {
    results.dateFormatError = e.message;
  }
  try {
    const logTableId = results.logTableId || logTableIdCache;
    if (logTableId) {
      const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${logTableId}/fields`;
      const fieldsResp = await fetch(fieldsUrl, { headers: { "Authorization": `Bearer ${token}` } });
      const fieldsData = await fieldsResp.json();
      const existingFields = (fieldsData.data?.items || []).map((f) => f.field_name);
      const newFields = [
        { field_name: "\u7CFB\u7EDF\u7248\u672C", type: 1 },
        { field_name: "\u767B\u5F55\u8D26\u53F7", type: 1 }
      ];
      let logFieldsAdded = 0;
      for (const field of newFields) {
        if (!existingFields.includes(field.field_name)) {
          await fetch(fieldsUrl, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(field)
          });
          logFieldsAdded++;
        }
      }
      results.logFieldsAdded = logFieldsAdded;
    }
  } catch (e) {
    results.logFieldSupplementError = e.message;
  }
  try {
    const vaccineTableId = await ensureVaccineTable(token, env);
    results.vaccineTableCreated = true;
    results.vaccineTableId = vaccineTableId;
  } catch (e) {
    results.vaccineTableCreated = false;
    results.vaccineTableError = e.message;
  }
  return { ok: true, ...results };
}
__name(handleMigrate, "handleMigrate");
async function streamDeepSeek(apiKey, systemPrompt, messages, temperature, maxTokens) {
  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        temperature,
        max_tokens: maxTokens,
        stream: true
      })
    });
    if (!resp.ok) {
      return { error: `DeepSeek API \u9519\u8BEF: ${resp.status}` };
    }
    return new Response(resp.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (e) {
    return { error: e.message };
  }
}
__name(streamDeepSeek, "streamDeepSeek");
async function handleAI(request, env) {
  if (request.method !== "POST") return { error: "Method not allowed" };
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return { error: "DEEPSEEK_API_KEY \u672A\u914D\u7F6E" };
  const body = await request.json();
  const { action, data } = body;
  let systemPrompt = "";
  let userContent = "";
  let temperature = 0.3;
  let maxTokens = 200;
  switch (action) {
    case "analyze": {
      const baby = data.baby || {};
      const growthRecords = data.growthRecords || [];
      const records = data.records || [];
      systemPrompt = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u513F\u7AE5\u6210\u957F\u5206\u6790\u5E08\u3002\u8BF7\u6839\u636E\u4EE5\u4E0B\u5B9D\u5B9D\u6570\u636E\uFF0C\u4ECE\u8EAB\u4F53\u53D1\u80B2\u3001\u6210\u957F\u8D8B\u52BF\u3001\u884C\u4E3A\u53D1\u5C55\u7B49\u65B9\u9762\u505A\u7EFC\u5408\u5206\u6790\uFF0C\u7ED9\u51FA\u7B80\u6D01\u4E13\u4E1A\u7684\u5EFA\u8BAE\u3002\u7528\u4E2D\u6587\u56DE\u7B54\uFF0C\u5206\u70B9\u9610\u8FF0\uFF0C\u8BED\u6C14\u6E29\u6696\u4EB2\u5207\u3002`;
      userContent = `\u3010\u5B9D\u5B9D\u6863\u6848\u3011
\u59D3\u540D\uFF1A${baby.\u5B9D\u5B9D\u59D3\u540D || "\u672A\u77E5"}
\u6027\u522B\uFF1A${baby.\u6027\u522B || "\u672A\u77E5"}
\u51FA\u751F\u65E5\u671F\uFF1A${baby.\u51FA\u751F\u65E5\u671F || "\u672A\u77E5"}
\u5907\u6CE8\uFF1A${baby.\u5907\u6CE8 || "\u65E0"}

\u3010\u8EAB\u9AD8\u4F53\u91CD\u8BB0\u5F55\u3011
${growthRecords.length > 0 ? growthRecords.map((g) => `${g.\u6D4B\u91CF\u65E5\u671F}\uFF1A\u8EAB\u9AD8${g.\u8EAB\u9AD8 || "-"}cm\uFF0C\u4F53\u91CD${g.\u4F53\u91CD || "-"}kg${g.\u5907\u6CE8 ? "\uFF0C" + g.\u5907\u6CE8 : ""}`).join("\n") : "\u6682\u65E0\u8BB0\u5F55"}

\u3010\u6210\u957F\u65F6\u95F4\u7EBF\u3011
${records.length > 0 ? records.slice(0, 20).map((r) => `${r.\u8BB0\u5F55\u65F6\u95F4?.split("T")?.[0] || ""} [${r.\u5206\u7C7B}] ${r.\u8BB0\u5F55\u5185\u5BB9}${r.\u662F\u5426\u4E3A\u91CC\u7A0B\u7891 ? " \u2B50\u91CC\u7A0B\u7891" : ""}`).join("\n") : "\u6682\u65E0\u8BB0\u5F55"}

\u8BF7\u7EFC\u5408\u5206\u6790\u8FD9\u4E2A\u5B9D\u5B9D\u7684\u6210\u957F\u60C5\u51B5\uFF0C\u5305\u62EC\uFF1A
1. \u8EAB\u4F53\u53D1\u80B2\u8BC4\u4F30\uFF08\u4E0E\u540C\u9F84\u6807\u51C6\u5BF9\u6BD4\uFF09
2. \u6210\u957F\u8D8B\u52BF\u5206\u6790
3. \u884C\u4E3A\u53D1\u5C55\u89C2\u5BDF
4. \u4E2A\u6027\u5316\u5EFA\u8BAE`;
      temperature = 0.5;
      maxTokens = 800;
      break;
    }
    case "category": {
      const categoryList = data.categoryList || "";
      systemPrompt = `\u4F60\u662F\u4E00\u4E2A\u5B9D\u5B9D\u6210\u957F\u8BB0\u5F55\u5206\u7C7B\u52A9\u624B\u3002\u6839\u636E\u7528\u6237\u8F93\u5165\u7684\u8BB0\u5F55\u5185\u5BB9\uFF0C\u5224\u65AD\u5C5E\u4E8E\u54EA\u4E2A\u5206\u7C7B\u3002\u5206\u7C7B\u5217\u8868\uFF1A${categoryList}\u3002\u53EA\u8FD4\u56DE\u5206\u7C7B\u540D\u79F0\uFF0C\u4E0D\u8981\u5176\u4ED6\u6587\u5B57\u3002`;
      userContent = data.content;
      temperature = 0;
      maxTokens = 20;
      break;
    }
    case "polish": {
      systemPrompt = "\u4F60\u662F\u4E00\u4E2A\u5B9D\u5B9D\u6210\u957F\u8BB0\u5F55\u52A9\u624B\u3002\u8BF7\u5E2E\u7528\u6237\u6DA6\u8272\u8BB0\u5F55\u5185\u5BB9\uFF0C\u4F7F\u5176\u66F4\u7B80\u6D01\u3001\u6E29\u6696\u3001\u6709\u753B\u9762\u611F\u3002\u4FDD\u6301\u539F\u610F\uFF0C\u4E0D\u8981\u6DFB\u52A0\u865A\u6784\u5185\u5BB9\u3002\u76F4\u63A5\u8FD4\u56DE\u6DA6\u8272\u540E\u7684\u6587\u5B57\uFF0C\u4E0D\u8981\u52A0\u5F15\u53F7\u6216\u89E3\u91CA\u3002";
      userContent = data.content;
      temperature = 0.5;
      maxTokens = 200;
      break;
    }
    case "suggest": {
      const recentRecords = data.recentRecords || [];
      systemPrompt = "\u4F60\u662F\u4E00\u4E2A\u5B9D\u5B9D\u6210\u957F\u8BB0\u5F55\u52A9\u624B\u3002\u6839\u636E\u7528\u6237\u6700\u8FD1\u7684\u8BB0\u5F55\uFF0C\u5EFA\u8BAE3\u6761\u4ECA\u5929\u53EF\u80FD\u60F3\u8BB0\u5F55\u7684\u5185\u5BB9\u3002\u6BCF\u6761\u4E0D\u8D85\u8FC720\u5B57\uFF0C\u7528\u6362\u884C\u5206\u9694\u3002\u53EA\u8FD4\u56DE\u5EFA\u8BAE\u5185\u5BB9\uFF0C\u4E0D\u8981\u7F16\u53F7\u6216\u89E3\u91CA\u3002";
      userContent = `\u6700\u8FD1\u8BB0\u5F55\uFF1A
${recentRecords.join("\n")}`;
      temperature = 0.8;
      maxTokens = 150;
      break;
    }
    case "chat": {
      const messages = data.messages || [];
      const baby = data.baby || {};
      const growthRecords = data.growthRecords || [];
      const records = data.records || [];
      const vaccines = data.vaccines || [];
      systemPrompt = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u513F\u7AE5\u6210\u957F\u987E\u95EE\uFF0C\u540D\u53EB"\u5C0F\u563B"\u3002\u4F60\u53EF\u4EE5\u56DE\u7B54\u5173\u4E8E\u80B2\u513F\u3001\u5065\u5EB7\u3001\u8425\u517B\u3001\u6559\u80B2\u7B49\u65B9\u9762\u7684\u95EE\u9898\u3002

\u3010\u5B9D\u5B9D\u6863\u6848\u3011
\u59D3\u540D\uFF1A${baby.\u5B9D\u5B9D\u59D3\u540D || "\u5B9D\u5B9D"}
\u6027\u522B\uFF1A${baby.\u6027\u522B || "\u672A\u77E5"}
\u51FA\u751F\u65E5\u671F\uFF1A${baby.\u51FA\u751F\u65E5\u671F || "\u672A\u77E5"}
\u5907\u6CE8\uFF1A${baby.\u5907\u6CE8 || "\u65E0"}

\u3010\u8EAB\u9AD8\u4F53\u91CD\u8BB0\u5F55\u3011
${growthRecords.length > 0 ? growthRecords.slice(0, 10).map((g) => `${g.\u6D4B\u91CF\u65E5\u671F}\uFF1A\u8EAB\u9AD8${g.\u8EAB\u9AD8 || "-"}cm\uFF0C\u4F53\u91CD${g.\u4F53\u91CD || "-"}kg`).join("\n") : "\u6682\u65E0\u8BB0\u5F55"}

\u3010\u6700\u8FD1\u6210\u957F\u8BB0\u5F55\u3011
${records.length > 0 ? records.slice(0, 15).map((r) => `${r.\u8BB0\u5F55\u65F6\u95F4?.split("T")?.[0] || ""} [${r.\u5206\u7C7B}] ${r.\u8BB0\u5F55\u5185\u5BB9}`).join("\n") : "\u6682\u65E0\u8BB0\u5F55"}

\u3010\u75AB\u82D7\u63A5\u79CD\u60C5\u51B5\u3011
${vaccines.length > 0 ? vaccines.map((v) => `${v.\u75AB\u82D7\u540D\u79F0} \u7B2C${v.\u5242\u6B21}/${v.\u603B\u5242\u6B21}\u9488 ${v.\u63A5\u79CD\u72B6\u6001 === "\u5DF2\u63A5\u79CD" ? "\u2713\u5DF2\u63A5\u79CD(" + (v.\u63A5\u79CD\u65F6\u95F4?.split("T")?.[0] || "") + ")" : "\u672A\u63A5\u79CD"}`).join("\n") : "\u6682\u65E0\u8BB0\u5F55"}

\u8BF7\u6CE8\u610F\uFF1A
1. \u8BF7\u7528"${baby.\u5B9D\u5B9D\u59D3\u540D || "\u5B9D\u5B9D"}"\u6765\u79F0\u547C\u5B9D\u5B9D\uFF0C\u800C\u4E0D\u662F"\u5B9D\u5B9D"\u8FD9\u4E2A\u6CDB\u79F0
2. \u79F0\u547C\u63D0\u95EE\u8005\u65F6\u7528"\u5BB6\u957F"\u800C\u4E0D\u662F"\u7238\u7238/\u5988\u5988"\uFF0C\u56E0\u4E3A\u4F60\u65E0\u6CD5\u786E\u5B9A\u63D0\u95EE\u8005\u7684\u8EAB\u4EFD
3. \u57FA\u4E8E\u4EE5\u4E0A\u771F\u5B9E\u6570\u636E\uFF0C\u7ED3\u5408\u4E13\u4E1A\u77E5\u8BC6\uFF0C\u7ED9\u51FA\u4E2A\u6027\u5316\u3001\u6E29\u6696\u7684\u56DE\u7B54
4. \u7528\u4E2D\u6587\u56DE\u7B54`;
      const streamResult = await streamDeepSeek(apiKey, systemPrompt, messages, 0.7, 1e3);
      if (streamResult.error) return streamResult;
      const corsHeaders = getCORSHeaders(request);
      return new Response(streamResult.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...corsHeaders
        }
      });
    }
    default:
      return { error: "Unknown action" };
  }
  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { error: `DeepSeek API \u9519\u8BEF: ${resp.status}`, detail: errText.slice(0, 200) };
    }
    const result = await resp.json();
    const content = result.choices?.[0]?.message?.content?.trim() || "";
    return { ok: true, content };
  } catch (e) {
    return { error: e.message };
  }
}
__name(handleAI, "handleAI");
async function handleUpload(request, env, token) {
  if (request.method !== "POST") return { error: "Method not allowed" };
  const formData = await request.formData();
  const file = formData.get("file");
  const recordId = formData.get("record_id");
  if (!file || !recordId) return { error: "file and record_id are required" };
  await ensureRecordFields(token, env);
  const appToken = env.FEISHU_BASE_TOKEN;
  const tableId = env.FEISHU_TABLE_RECORD;
  const fileName = file.name || "upload.jpg";
  const fileSize = file.size || 0;
  const isImage = (file.type || "").startsWith("image/");
  const parentType = isImage ? "bitable_image" : "bitable_file";
  const driveForm = new FormData();
  driveForm.append("file_name", fileName);
  driveForm.append("parent_type", parentType);
  driveForm.append("parent_node", appToken);
  driveForm.append("size", String(fileSize));
  driveForm.append("extra", JSON.stringify({ drive_route_token: appToken }));
  driveForm.append("file", file, fileName);
  const uploadResp = await fetch("https://open.feishu.cn/open-apis/drive/v1/medias/upload_all", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: driveForm
  });
  const uploadData = await uploadResp.json();
  if (uploadData.code !== 0) {
    return { error: `Drive\u4E0A\u4F20\u5931\u8D25: ${uploadData.msg || "\u672A\u77E5"}`, code: uploadData.code };
  }
  const fileToken = uploadData.data?.file_token;
  if (!fileToken) {
    return { error: "\u4E0A\u4F20\u6210\u529F\u4F46\u672A\u83B7\u53D6\u5230 file_token" };
  }
  const recordUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
  const recordResp = await fetch(recordUrl, { headers: { "Authorization": `Bearer ${token}` } });
  const recordData = await recordResp.json();
  const existingAttachments = recordData.data?.record?.fields?.["\u9644\u4EF6"] || [];
  const existingTokens = existingAttachments.filter((a) => a.file_token).map((a) => ({ file_token: a.file_token }));
  const allAttachments = [...existingTokens, { file_token: fileToken }];
  const updateResp = await fetch(recordUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: { "\u9644\u4EF6": allAttachments } })
  });
  const updateData = await updateResp.json();
  if (updateData.code !== 0) {
    return { ok: true, file_token: fileToken, warning: `\u9644\u4EF6\u5DF2\u4E0A\u4F20\u4F46\u5199\u5165\u8BB0\u5F55\u5931\u8D25: ${updateData.msg}` };
  }
  return { ok: true, file_token: fileToken };
}
__name(handleUpload, "handleUpload");
async function handleAsset(request, env, token) {
  const url = new URL(request.url);
  const fileToken = url.searchParams.get("file_token");
  const mediaType = url.searchParams.get("type");
  if (!fileToken) {
    return new Response(JSON.stringify({ error: "file_token is required" }), {
      headers: { "Content-Type": "application/json", ...getCORSHeaders(request) }
    });
  }
  try {
    const tmpUrl = `${FEISHU_API}/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(fileToken)}`;
    const tmpResp = await fetch(tmpUrl, { headers: { "Authorization": `Bearer ${token}` } });
    const tmpData = await tmpResp.json();
    if (tmpData.code !== 0 || !tmpData.data?.tmp_download_urls?.[0]?.tmp_download_url) {
      console.error("[handleAsset] \u83B7\u53D6\u4E34\u65F6\u94FE\u63A5\u5931\u8D25:", JSON.stringify(tmpData));
      return new Response(JSON.stringify({ error: "\u83B7\u53D6\u6587\u4EF6\u4E0B\u8F7D\u94FE\u63A5\u5931\u8D25" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...getCORSHeaders(request) }
      });
    }
    const downloadUrl = tmpData.data.tmp_download_urls[0].tmp_download_url;
    if (mediaType === "voice") {
      const fileResp = await fetch(downloadUrl);
      if (!fileResp.ok) {
        return new Response(JSON.stringify({ error: "\u8BED\u97F3\u6587\u4EF6\u4E0B\u8F7D\u5931\u8D25" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...getCORSHeaders(request) }
        });
      }
      const body = await fileResp.arrayBuffer();
      const feishuContentType = fileResp.headers.get("Content-Type") || "application/octet-stream";
      let contentType = feishuContentType;
      if (body.byteLength >= 8) {
        const header = new Uint8Array(body.slice(0, 8));
        const isMP4 = header[4] === 102 && header[5] === 116 && header[6] === 121 && header[7] === 112;
        const isWebM = header[0] === 26 && header[1] === 69 && header[2] === 223 && header[3] === 163;
        if (isMP4) contentType = "audio/mp4";
        else if (isWebM) contentType = "audio/webm";
        else contentType = feishuContentType.replace(/^video\//, "audio/");
      } else {
        contentType = feishuContentType.replace(/^video\//, "audio/");
      }
      return new Response(body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
          ...getCORSHeaders(request)
        }
      });
    }
    return new Response(null, {
      status: 302,
      headers: { "Location": downloadUrl, ...getCORSHeaders(request) }
    });
  } catch (e) {
    console.error("[handleAsset] \u5F02\u5E38:", e.message);
    return new Response(JSON.stringify({ error: "\u6587\u4EF6\u4E0B\u8F7D\u5F02\u5E38" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...getCORSHeaders(request) }
    });
  }
}
__name(handleAsset, "handleAsset");
export {
  feishu_proxy_default as default
};
//# sourceMappingURL=feishu-proxy.js.map
