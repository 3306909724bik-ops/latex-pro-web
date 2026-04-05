export interface BrowserOpenAIConfig {
  proxyUrl: string;
  unlockUrl: string;
  model: string;
  accessCode: string;
}

export type OpenAIUserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const DEMO_ACCESS_CODE_STORAGE_KEY = 'latex-pro-web-demo-access-code';

function readEnv(key: string): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[key];
}

export function getStoredDemoAccessCode(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(DEMO_ACCESS_CODE_STORAGE_KEY)?.trim() || '';
}

export function clearStoredDemoAccessCode(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(DEMO_ACCESS_CODE_STORAGE_KEY);
}

export async function verifyAndStoreDemoAccessCode(code: string): Promise<void> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error('Access code is required.');
  }

  const unlockUrl = readEnv('VITE_UNLOCK_ENDPOINT') || '/api/auth/unlock';
  const response = await fetch(unlockUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: trimmed }),
  });

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || 'Access code verification failed.');
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_ACCESS_CODE_STORAGE_KEY, trimmed);
  }
}

export function getBrowserOpenAIConfig(): BrowserOpenAIConfig | null {
  const accessCode = getStoredDemoAccessCode();
  if (!accessCode) {
    return null;
  }

  return {
    proxyUrl: readEnv('VITE_OPENAI_PROXY_URL') || '/api/openai/chat-completions',
    unlockUrl: readEnv('VITE_UNLOCK_ENDPOINT') || '/api/auth/unlock',
    model: readEnv('VITE_OPENAI_MODEL') || 'gpt-5.1',
    accessCode,
  };
}

function normalizeChatContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part) {
          return typeof part.text === 'string' ? part.text : '';
        }

        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

async function requestChatCompletion(
  system: string,
  user: string | OpenAIUserContentPart[],
  wantJson: boolean,
): Promise<string> {
  const config = getBrowserOpenAIConfig();
  if (!config) {
    throw new Error('OpenAI config not found. Set VITE_OPENAI_API_KEY in your Vite env.');
  }

  const response = await fetch(config.proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-Access-Code': config.accessCode,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: wantJson ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const content = normalizeChatContent(payload.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error('OpenAI returned empty content.');
  }

  return content;
}

export async function requestOpenAIText(system: string, user: string): Promise<string> {
  return requestChatCompletion(system, user, false);
}

export async function requestOpenAIJson<T>(system: string, user: string): Promise<T> {
  const content = await requestChatCompletion(system, user, true);
  return JSON.parse(content) as T;
}

export async function requestOpenAIJsonWithUserContent<T>(system: string, user: OpenAIUserContentPart[]): Promise<T> {
  const content = await requestChatCompletion(system, user, true);
  return JSON.parse(content) as T;
}
