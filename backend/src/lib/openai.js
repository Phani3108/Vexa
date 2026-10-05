/**
 * OpenAI client helpers — supports both Azure OpenAI and api.openai.com.
 *
 *   Azure:  OPENAI_ENDPOINT=https://<resource>.openai.azure.com  (+ deployment names)
 *   OpenAI: leave OPENAI_ENDPOINT empty; OPENAI_DEPLOYMENT_NAME / OPENAI_CHAT_DEPLOYMENT
 *           are then treated as model names.
 */

import axios from 'axios';

const AZURE_API_VERSION = process.env.OPENAI_API_VERSION || '2024-10-01-preview';

export function isAzure(config = process.env) {
  return !!config.OPENAI_ENDPOINT;
}

export function isChatConfigured(config = process.env) {
  return !!config.OPENAI_API_KEY;
}

export function realtimeConnection(config) {
  const model = config.OPENAI_DEPLOYMENT_NAME || 'gpt-realtime-mini';
  if (isAzure(config)) {
    return {
      url: `${config.OPENAI_ENDPOINT.replace(/^https:\/\//, 'wss://').replace(/\/+$/, '')}/openai/realtime?api-version=${AZURE_API_VERSION}&deployment=${model}`,
      headers: { 'api-key': config.OPENAI_API_KEY, 'OpenAI-Beta': 'realtime=v1' }
    };
  }
  return {
    url: `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
    headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}`, 'OpenAI-Beta': 'realtime=v1' }
  };
}

/**
 * Chat completion. Returns the assistant message content string.
 */
export async function chatCompletion(config, { messages, temperature = 0.4, maxTokens = 600, json = false, timeout = 30000 }) {
  const model = config.OPENAI_CHAT_DEPLOYMENT || 'gpt-4.1-mini';
  const body = {
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: 'json_object' } } : {})
  };

  let url;
  let headers;
  if (isAzure(config)) {
    url = `${config.OPENAI_ENDPOINT.replace(/\/+$/, '')}/openai/deployments/${model}/chat/completions?api-version=${AZURE_API_VERSION}`;
    headers = { 'Content-Type': 'application/json', 'api-key': config.OPENAI_API_KEY };
  } else {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENAI_API_KEY}` };
    body.model = model;
  }

  const response = await axios.post(url, body, { headers, timeout });
  return response.data.choices[0].message.content;
}
