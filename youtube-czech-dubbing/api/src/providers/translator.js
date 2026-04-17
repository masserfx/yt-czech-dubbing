/**
 * Translator selector — abstract layer nad Gemini / DeepL / OpenAI.
 *
 * Priorita (default, pokud jsou všechny API klíče k dispozici):
 *   1. Gemini 2.5 Flash — primary (nejlevnější + free tier)
 *   2. DeepL — fallback pro kvalitu (nejlepší CEE output)
 *   3. OpenAI GPT-4o-mini — secondary fallback (nejspolehlivější dostupnost)
 *
 * Strategie:
 *   - Pokud primary má API key → zkus; na error (429, 5xx, network) spadni na next
 *   - Per-job override: body.translator = 'deepl' | 'openai' (vynutí konkrétního)
 *   - Enterprise tier může preferovat DeepL (kvalita) v tenant settings
 */

import * as gemini from './gemini.js';
import * as deepl from './deepl.js';
import * as openai from './openai.js';

const PROVIDERS = {
  gemini: { mod: gemini, envKey: 'GEMINI_API_KEY' },
  deepl: { mod: deepl, envKey: 'DEEPL_API_KEY' },
  openai: { mod: openai, envKey: 'OPENAI_API_KEY' },
};

const DEFAULT_ORDER = ['gemini', 'deepl', 'openai'];

/**
 * Rozhodne, který provider použít pro daný job.
 *
 * @param {object} env           Cloudflare env s API keys
 * @param {object} opts
 * @param {string} [opts.force]  'gemini' | 'deepl' | 'openai' — vynucení
 * @param {string} [opts.tier]   'free' | 'starter' | 'business' | 'enterprise'
 * @returns {string[]}           pořadí providerů k vyzkoušení
 */
export function resolveOrder(env, { force, tier } = {}) {
  if (force && PROVIDERS[force]) {
    const available = env[PROVIDERS[force].envKey];
    if (!available) throw new Error(`Forced provider ${force} has no API key in env`);
    return [force];
  }

  // Enterprise preferuje DeepL (kvalita) před Gemini (cena), ostatní výchozí.
  const order = tier === 'enterprise'
    ? ['deepl', 'gemini', 'openai']
    : DEFAULT_ORDER;

  return order.filter((p) => env[PROVIDERS[p].envKey]);
}

/**
 * Přeloží segmenty — zkusí providery v pořadí podle `resolveOrder`, při error
 * spadne na další. Vrací `{ text, provider, attempts }`.
 *
 * @param {string[]} segments
 * @param {string}   targetLang
 * @param {object}   env        Cloudflare env
 * @param {object}   [opts]
 * @param {string}   [opts.force]
 * @param {string}   [opts.tier]
 * @param {object}   [opts.glossary]
 */
export async function translate(segments, targetLang, env, opts = {}) {
  const order = resolveOrder(env, opts);
  if (order.length === 0) {
    throw new Error('No translator API key available (GEMINI/DEEPL/OPENAI)');
  }

  const attempts = [];
  let lastErr;

  for (const name of order) {
    const { mod, envKey } = PROVIDERS[name];
    try {
      const text = await mod.translateBatch(segments, targetLang, {
        apiKey: env[envKey],
        glossary: opts.glossary || {},
      });
      attempts.push({ provider: name, ok: true });
      return { text, provider: name, attempts };
    } catch (err) {
      attempts.push({ provider: name, ok: false, error: String(err.message || err) });
      lastErr = err;
      // Non-retryable errors (unsupported language) — neprobíhej na další provider.
      if (/unsupported/i.test(String(err.message))) throw err;
    }
  }

  throw new Error(`All translator providers failed. Last: ${lastErr?.message || 'unknown'}`);
}
