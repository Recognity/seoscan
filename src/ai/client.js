/**
 * src/ai/client.js — BYOK AI client for seoscan
 *
 * Reads OPENAI_API_KEY or ANTHROPIC_API_KEY from environment (or ~/.seoscan/config.yml).
 * Supports both providers. Defaults to gpt-4o-mini (cheapest that works well).
 * Falls back gracefully when no key is configured.
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ── Simple YAML config parser ─────────────────────────────────────────────────

function parseSimpleYaml(text) {
  const result = {};
  let currentSection = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, ''); // strip comments
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = line.search(/\S/);
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (indent === 0) {
      if (!value) {
        result[key] = {};
        currentSection = key;
      } else {
        result[key] = value;
        currentSection = null;
      }
    } else if (currentSection) {
      result[currentSection][key] = value;
    }
  }

  return result;
}

function loadConfig() {
  const configPath = join(homedir(), '.seoscan', 'config.yml');
  if (!existsSync(configPath)) return {};
  try {
    return parseSimpleYaml(readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

// ── Pricing table ($ per 1M tokens) ──────────────────────────────────────────

const PRICING = {
  'gpt-4o-mini':              { input: 0.15,  output: 0.60 },
  'gpt-4o':                   { input: 2.50,  output: 10.00 },
  'claude-3-haiku-20240307':  { input: 0.25,  output: 1.25 },
  'claude-3-5-haiku-latest':{ input: 0.80,  output: 4.00 },
  'claude-3-5-sonnet-latest':{ input: 3.00, output: 15.00 },
};

function calcCost(inputTokens, outputTokens, model) {
  const p = PRICING[model];
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

function formatCost(cost) {
  if (cost === null || cost === undefined) return '?';
  if (cost < 0.0001) return '<$0.0001';
  return `$${cost.toFixed(4)}`;
}

// ── Config resolution ─────────────────────────────────────────────────────────

/**
 * Returns { provider, key, model } or null if no key is configured.
 */
export function getAIConfig() {
  const config = loadConfig();
  const cfg = config.ai || {};

  // Anthropic wins if ANTHROPIC_API_KEY is set in env
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY ||
    (cfg.provider === 'anthropic' ? cfg.api_key : null);

  if (anthropicKey) {
    return {
      provider: 'anthropic',
      key: anthropicKey,
      model: cfg.model || 'claude-3-haiku-20240307',
    };
  }

  const openaiKey =
    process.env.OPENAI_API_KEY ||
    ((!cfg.provider || cfg.provider === 'openai') ? cfg.api_key : null);

  if (openaiKey) {
    return {
      provider: 'openai',
      key: openaiKey,
      model: cfg.model || 'gpt-4o-mini',
    };
  }

  return null;
}

// ── In-memory result cache ────────────────────────────────────────────────────

const _cache = new Map();

function cacheKey(model, system, user) {
  return `${model}::${system}::${user}`;
}

// ── Accumulated cost tracking ─────────────────────────────────────────────────

let _totalCost = 0;

export function getTotalCost() { return _totalCost; }
export function formatTotalCost() { return formatCost(_totalCost); }
export function resetCost() { _totalCost = 0; }

// ── Main completion function ──────────────────────────────────────────────────

/**
 * Call the configured AI provider to generate a completion.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<{text: string, cost: number|null, costStr: string, model: string, provider: string}|null>}
 */
export async function generateCompletion(systemPrompt, userPrompt) {
  const config = getAIConfig();
  if (!config) return null;

  const key = cacheKey(config.model, systemPrompt, userPrompt);
  if (_cache.has(key)) return _cache.get(key);

  let raw;
  if (config.provider === 'openai') {
    raw = await callOpenAI(config, systemPrompt, userPrompt);
  } else {
    raw = await callAnthropic(config, systemPrompt, userPrompt);
  }

  const cost = calcCost(raw.inputTokens, raw.outputTokens, config.model);
  if (cost !== null) _totalCost += cost;

  const result = {
    text: raw.text,
    cost,
    costStr: formatCost(cost),
    model: config.model,
    provider: config.provider,
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
  };

  _cache.set(key, result);
  return result;
}

// ── OpenAI REST call ──────────────────────────────────────────────────────────

async function callOpenAI(config, systemPrompt, userPrompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    text: data.choices[0].message.content.trim(),
    inputTokens:  data.usage?.prompt_tokens     ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ── Anthropic REST call ───────────────────────────────────────────────────────

async function callAnthropic(config, systemPrompt, userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    text: data.content[0].text.trim(),
    inputTokens:  data.usage?.input_tokens  ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
