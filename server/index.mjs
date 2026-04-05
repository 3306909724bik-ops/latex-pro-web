import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const DEMO_ACCESS_CODE = process.env.DEMO_ACCESS_CODE || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 30);

const rateLimitBuckets = new Map();

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Demo-Access-Code');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  bucket.count += 1;
  return false;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function validateAccessCode(candidate) {
  return Boolean(DEMO_ACCESS_CODE) && typeof candidate === 'string' && candidate.trim() === DEMO_ACCESS_CODE;
}

async function proxyOpenAIChat(body) {
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      ...body,
      model: typeof body.model === 'string' && body.model.trim() ? body.model : OPENAI_MODEL,
    }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw {
      status: response.status,
      payload,
    };
  }

  return payload;
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      accessCodeConfigured: Boolean(DEMO_ACCESS_CODE),
      openaiConfigured: Boolean(OPENAI_API_KEY),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/unlock') {
    try {
      const body = await readJsonBody(req);
      const ok = validateAccessCode(body.code);
      sendJson(res, ok ? 200 : 401, {
        ok,
        message: ok ? 'Access granted.' : 'Invalid access code.',
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        message: error instanceof Error ? error.message : 'Invalid request.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/openai/chat-completions') {
    if (!OPENAI_API_KEY) {
      sendJson(res, 500, {
        ok: false,
        message: 'OPENAI_API_KEY is not configured on the server.',
      });
      return;
    }

    const accessCode = req.headers['x-demo-access-code'];
    if (!validateAccessCode(Array.isArray(accessCode) ? accessCode[0] : accessCode)) {
      sendJson(res, 401, {
        ok: false,
        message: 'Access denied. A valid demo access code is required.',
      });
      return;
    }

    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp)) {
      sendJson(res, 429, {
        ok: false,
        message: 'Rate limit exceeded. Please try again later.',
      });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const payload = await proxyOpenAIChat(body);
      sendJson(res, 200, payload);
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
      const payload = typeof error === 'object' && error && 'payload' in error ? error.payload : null;
      sendJson(res, status, {
        ok: false,
        message: 'OpenAI proxy request failed.',
        detail: payload,
      });
    }
    return;
  }

  sendJson(res, 404, {
    ok: false,
    message: 'Not found.',
  });
});

server.listen(PORT, () => {
  console.log(`latex-pro-web minimal backend listening on http://localhost:${PORT}`);
});
