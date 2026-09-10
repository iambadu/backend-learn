// Thin OpenRouter client. Streams tokens to a callback so the terminal
// shows output as it's generated, like a normal chat interface.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct';

export async function chat(messages, { model, onToken } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set.\n' +
      '  1. Copy tutor/.env.example to tutor/.env\n' +
      '  2. Paste your key from https://openrouter.ai/keys into it\n' +
      '  3. Re-run the tutor.',
    );
  }
  const resolvedModel = model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // OpenRouter-recommended headers for attribution on their dashboard —
      // harmless if inaccurate, not required for the API to work.
      'HTTP-Referer': 'https://localhost',
      'X-Title': 'Backend University Tutor',
    },
    body: JSON.stringify({ model: resolvedModel, messages, stream: true }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(
      `OpenRouter API error ${res.status} for model "${resolvedModel}".\n` +
      `${bodyText}\n` +
      `If this is a "model not found" error, check current model slugs at ` +
      `https://openrouter.ai/models and set OPENROUTER_MODEL in tutor/.env.`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep the last, possibly-incomplete line for next chunk

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const token = json.choices?.[0]?.delta?.content;
        if (token) {
          full += token;
          onToken?.(token);
        }
      } catch {
        // A partial SSE chunk split mid-JSON — ignore and wait for more data.
      }
    }
  }

  return full;
}
