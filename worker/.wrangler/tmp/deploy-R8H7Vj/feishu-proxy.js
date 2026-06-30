var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// feishu-proxy.js
var FEISHU_API = "https://open.feishu.cn/open-apis";
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
var feishu_proxy_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api/debug") {
        return new Response(JSON.stringify({
          app_id_set: !!env.FEISHU_APP_ID,
          app_id_prefix: env.FEISHU_APP_ID ? env.FEISHU_APP_ID.slice(0, 8) + "..." : "NOT SET",
          app_secret_set: !!env.FEISHU_APP_SECRET,
          base_token_set: !!env.FEISHU_BASE_TOKEN,
          base_token_value: env.FEISHU_BASE_TOKEN || "NOT SET",
          table_baby: env.FEISHU_TABLE_BABY || "NOT SET",
          table_record: env.FEISHU_TABLE_RECORD || "NOT SET",
          table_growth: env.FEISHU_TABLE_GROWTH || "NOT SET"
        }, null, 2), {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
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
        case "/api/ai":
          result = await handleAI(request, env);
          break;
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
        case "/api/health":
          result = { ok: true, message: "Worker is running" };
          break;
        default:
          result = { error: "Not found", path };
      }
      if (binaryResponse) return binaryResponse;
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
  }
};
var tokenCache = { token: null, expires: 0 };
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
        // 多选
        property: {
          options: [
            { name: "text" },
            { name: "voice" },
            { name: "video" },
            { name: "photo" }
          ]
        }
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
        property: {
          options: [
            { name: "text" },
            { name: "voice" },
            { name: "video" },
            { name: "photo" }
          ]
        }
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
  if (!file || !recordId) return { error: "file and record_id are required", debug_file_type: typeof file, debug_record_id: recordId };
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
    return {
      error: `Drive\u4E0A\u4F20\u5931\u8D25: ${uploadData.msg || "\u672A\u77E5"}`,
      code: uploadData.code,
      debug: { fileName, fileSize, parentType, recordId },
      feishu_response: JSON.stringify(uploadData).slice(0, 500)
    };
  }
  const fileToken = uploadData.data?.file_token;
  if (!fileToken) {
    return { error: "\u4E0A\u4F20\u6210\u529F\u4F46\u672A\u83B7\u53D6\u5230 file_token", detail: JSON.stringify(uploadData).slice(0, 500) };
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
    body: JSON.stringify({
      fields: {
        "\u9644\u4EF6": allAttachments
      }
    })
  });
  const updateData = await updateResp.json();
  if (updateData.code !== 0) {
    return {
      ok: true,
      file_token: fileToken,
      warning: `\u9644\u4EF6\u5DF2\u4E0A\u4F20\u4F46\u5199\u5165\u8BB0\u5F55\u5931\u8D25: ${updateData.msg}`
    };
  }
  return { ok: true, file_token: fileToken };
}
__name(handleUpload, "handleUpload");
async function handleAsset(request, env, token) {
  const url = new URL(request.url);
  const fileToken = url.searchParams.get("file_token");
  const recordId = url.searchParams.get("record_id");
  if (!fileToken) {
    return new Response(JSON.stringify({ error: "file_token is required" }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
  }
  const appToken = env.FEISHU_BASE_TOKEN;
  const tableId = env.FEISHU_TABLE_RECORD;
  let downloadUrl = `${FEISHU_API}/drive/v1/medias/${fileToken}/download`;
  if (recordId) {
    try {
      const fieldsUrl = `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
      const fieldsResp = await fetch(fieldsUrl, { headers: { "Authorization": `Bearer ${token}` } });
      const fieldsData = await fieldsResp.json();
      const attachmentField = (fieldsData.data?.items || []).find((f) => f.field_name === "\u9644\u4EF6");
      if (attachmentField) {
        const extra = JSON.stringify({
          bitablePerm: {
            tableId,
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
    }
  }
  const fileResp = await fetch(downloadUrl, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!fileResp.ok) {
    return new Response(JSON.stringify({ error: "\u6587\u4EF6\u4E0B\u8F7D\u5931\u8D25", status: fileResp.status }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
  }
  const contentType = fileResp.headers.get("Content-Type") || "application/octet-stream";
  const body = await fileResp.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      ...CORS_HEADERS
    }
  });
}
__name(handleAsset, "handleAsset");
export {
  feishu_proxy_default as default
};
//# sourceMappingURL=feishu-proxy.js.map
