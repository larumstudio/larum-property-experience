/* ── Larum Property Experience™ — Property Concierge ────────────────
   A grounded concierge. Claude supplies language understanding; the
   property knowledge pack supplies every fact. The model is never the
   source of truth about a residence — if the pack does not contain an
   answer, the answer is "the advisor will confirm".

   This runs server-side because the API key must never reach the browser.
   The client degrades to the keyword engine whenever this is unavailable,
   so a missing key or a cold start never leaves the demo mute.
   ─────────────────────────────────────────────────────────────────── */

import Anthropic from '@anthropic-ai/sdk';
import { getDossier, propertyKnown, persistTurn } from './_data.mjs';
import { check as rateCheck } from './_rate.mjs';

/* Sonnet 5 by decision: the concierge answers from a dossier it already has
   in front of it, so the work is comprehension and phrasing rather than
   recall. Set CONCIERGE_MODEL in Vercel to compare another model without
   touching code. */
const MODEL = process.env.CONCIERGE_MODEL || 'claude-sonnet-5';
const MAX_QUESTION_CHARS = 600;
const MAX_HISTORY_TURNS = 8;

/* USD per million tokens, so the response can report what a turn actually
   cost. Cache writes bill at 1.25x input, cache reads at 0.1x. */
const PRICING = {
  'claude-opus-5':   { input: 5,  output: 25 },
  'claude-opus-4-8': { input: 5,  output: 25 },
  'claude-sonnet-5': { input: 3,  output: 15 },
  'claude-haiku-4-5':{ input: 1,  output: 5  }
};

function estimateCostUSD(model, usage) {
  const p = PRICING[model];
  if (!p) return null;
  const uncached = (usage.input_tokens || 0) * p.input;
  const written  = (usage.cache_creation_input_tokens || 0) * p.input * 1.25;
  const read     = (usage.cache_read_input_tokens || 0) * p.input * 0.1;
  const out      = (usage.output_tokens || 0) * p.output;
  return +(((uncached + written + read + out) / 1e6).toFixed(5));
}

/* The concierge answers in a fixed shape so the experience can turn its
   answer into scene links, space overlays and document prompts. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      description: 'The reply to the visitor, in their language. Two to four sentences.'
    },
    confidence: {
      type: 'string',
      enum: ['confirmed', 'requires-advisor', 'unknown'],
      description:
        'confirmed = every fact stated is marked confirmed in the pack. ' +
        'requires-advisor = answered from pending or unconfirmed data. ' +
        'unknown = the pack does not cover this.'
    },
    spaces: {
      type: 'array',
      items: { type: 'string' },
      description: 'Space names from the pack that the visitor should be shown. Exact names only.'
    },
    scenes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Sequence (day moment) names from the pack worth opening. Exact names only.'
    },
    documents: {
      type: 'array',
      items: { type: 'string', enum: ['calculator', 'energy', 'plans', 'brochure'] },
      description: 'Relevant private documents or tools, if any.'
    },
    interests: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['privacy', 'family', 'architecture', 'city_life', 'investment',
               'technology', 'outdoor_living', 'entertaining', 'wellness']
      },
      description: 'What this question reveals the visitor cares about. For the advisor summary.'
    },
    followUp: {
      type: 'string',
      description: 'One short question inviting the visitor deeper. Empty string if none fits.'
    }
  },
  required: ['answer', 'confidence', 'spaces', 'scenes', 'documents', 'interests', 'followUp'],
  additionalProperties: false
};

/* Split in two on purpose. Everything property-specific and stable lives in
   the cached block; the language instruction sits after it, uncached. Keeping
   the language inside the cached prefix made Spanish and English two separate
   cache entries for the same dossier — paying the write premium twice. */
function buildLanguagePrompt(lang) {
  return lang === 'es'
    ? 'Responde en español (España). Trata al visitante de tú.'
    : 'Answer in English.';
}

/* M6.8: several content.json fields were promoted from plain strings to
   {en, es} (bilingual content architecture — see app.js's t()/tkey()).
   This prompt has no visitor `lang` to key off (the model is told
   separately, via languageInstruction(), what language to ANSWER in —
   the dossier it reads to get there has never been per-language), so
   textEn() always resolves to English, tolerating the old plain-string
   shape too so content not yet migrated keeps working exactly as
   before. Recurses so nested dossier objects (dna, setting, facts) come
   out as plain strings throughout, not {en, es} objects, before they
   reach JSON.stringify. */
function textEn(v) {
  if (v == null) return v;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(textEn);
  if (typeof v === 'object' && ('en' in v || 'es' in v) && Object.keys(v).every(k => k === 'en' || k === 'es')) {
    return v.en || v.es || '';
  }
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = textEn(val);
    return out;
  }
  return v;
}

function buildDossierPrompt(slug, dossier) {
  const content = dossier.content;
  const knowledge = dossier.knowledge;

  const spaceNames = Object.keys(knowledge.property?.spaces || {});
  const sceneNames = (content.sequences || []).map(s => s[0]);

  return `You are the private digital advisor for ${content.label} — ${textEn(content.title).replace('\n', ' ')}, represented by ${content.brand}.

You are speaking with a prospective buyer who is exploring this residence before visiting it. They are considering a purchase in the millions. Your job is to help them perceive and understand the property, and to make them want to see it.

# The one rule that matters

The property dossier below is your only source of truth about this residence and its surroundings. You have no other knowledge of this property.

- If the dossier answers the question, answer it.
- If the dossier marks a fact as "pending" or "requires-advisor", you may state it, but say plainly that the advisor confirms it.
- If the dossier does not cover it, say so and offer what you can show instead. Never estimate, never infer a number, never fill a gap with what is typical for properties like this. A confident wrong answer about a €4M residence destroys the sale.

Never invent: measurements, prices, distances, dates, materials, orientations, community fees, taxes, legal or planning status.

# How you speak

You are not a chatbot and not a salesperson. You are the calm, well-briefed advisor of a discreet firm. Write the way a good estate agent speaks in a quiet room: unhurried, specific, never gushing.

- Two to four sentences. The visitor is reading, not being pitched.
- Concrete over adjectival. "The terrace faces south-west" beats "stunning outdoor space".
- No exclamation marks, no emoji, no "Absolutely!", no "Great question".
- Answer what was asked first, then add at most one thing worth knowing.

# Linking

You can open parts of the experience for the visitor. Use the exact names below or leave the array empty — a name that is not on these lists will not work.

Spaces: ${spaceNames.join(' · ')}
Day moments: ${sceneNames.join(' · ')}

Include a space when the visitor would understand the answer better by seeing that part of the residence. Include the calculator only when they ask about cost, taxes or what acquisition involves. Do not link for the sake of linking.

# The property dossier

${JSON.stringify({ property: knowledge.property, surroundings: knowledge.surroundings, dna: textEn(content.dna), setting: textEn(content.setting), sequences: textEn(content.sequences), facts: textEn(content.facts) }, null, 1)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    /* Not configured — the client falls back to the keyword engine. */
    return res.status(503).json({ error: 'concierge_unconfigured' });
  }

  const { property, lang = 'en', question, history = [], sessionId } = req.body || {};

  /* Rate limit before any work. Cheap check, saves an Anthropic call
     and a database roundtrip on abuse. Rejected requests never touch
     the model and never leave a row behind. */
  const gate = rateCheck(req, sessionId);
  if (!gate.ok) {
    if (gate.retryAfter) res.setHeader('Retry-After', String(gate.retryAfter));
    return res.status(429).json({ error: 'rate_limited', scope: gate.scope });
  }

  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'empty_question' });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return res.status(400).json({ error: 'question_too_long' });
  }
  if (!property || !(await propertyKnown(property))) {
    return res.status(400).json({ error: 'unknown_property' });
  }

  /* The dossier is fetched once per turn: from the database with a warm
     in-memory cache, falling back to the bundled pack if the database
     is unreachable. The concierge never goes mute for a data problem. */
  const dossier = await getDossier(property);
  if (!dossier) {
    return res.status(200).json({ error: 'no_dossier', fallback: true });
  }

  const language = lang === 'es' ? 'es' : 'en';

  /* Prior turns give the concierge continuity ("and the other bedroom?").
     Trimmed so a long session cannot grow the request without bound. */
  const priorTurns = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY_TURNS)
    .filter(t => t && typeof t.content === 'string' && t.content.trim())
    .map(t => ({
      role: t.role === 'assistant' ? 'assistant' : 'user',
      content: t.content.slice(0, MAX_QUESTION_CHARS)
    }));

  try {
    const client = new Anthropic();

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      /* The dossier is identical on every question for a given property, so
         caching it turns the dominant cost into a cache read. */
      system: [
        {
          /* Stable per property. Cached, and now shared across languages. */
          type: 'text',
          text: buildDossierPrompt(property, dossier),
          cache_control: { type: 'ephemeral' }
        },
        {
          /* Varies per request, so it must sit after the breakpoint. */
          type: 'text',
          text: buildLanguagePrompt(language)
        }
      ],
      /* Low effort: the reasoning here is "find it in the dossier and say it
         well", and a visitor mid-conversation will not wait. */
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA }
      },
      messages: [...priorTurns, { role: 'user', content: question }]
    });

    if (message.stop_reason === 'refusal') {
      return res.status(200).json({ error: 'declined', fallback: true });
    }

    const text = message.content.find(b => b.type === 'text')?.text;
    if (!text) return res.status(200).json({ error: 'empty_response', fallback: true });

    const parsed = JSON.parse(text);

    const usage = {
      model: MODEL,
      uncachedInput: message.usage.input_tokens || 0,
      cacheWritten: message.usage.cache_creation_input_tokens || 0,
      cacheRead: message.usage.cache_read_input_tokens || 0,
      output: message.usage.output_tokens || 0,
      /* The cache-write tokens were missing here before, which made a turn
         that cost four cents look like it cost a fraction of one. */
      costUSD: estimateCostUSD(MODEL, message.usage)
    };

    /* Persist AFTER responding to the visitor would leak the process on
       serverless runtimes. Awaiting is safe because persistTurn swallows
       every error internally and stays well under the 30 s budget. */
    await persistTurn({
      sessionId, slug: property, lang: language,
      question,
      answer: {
        text: parsed.answer,
        confidence: parsed.confidence,
        interests: parsed.interests || [],
        source: 'llm',
        usage
      }
    });

    return res.status(200).json({
      answer: parsed.answer,
      confidence: parsed.confidence,
      spaces: parsed.spaces || [],
      scenes: parsed.scenes || [],
      documents: parsed.documents || [],
      interests: parsed.interests || [],
      followUp: parsed.followUp || '',
      usage
    });
  } catch (e) {
    console.error('concierge error:', e?.status, e?.message);
    /* Any failure hands the turn back to the keyword engine rather than
       showing the visitor an error. */
    return res.status(200).json({ error: 'upstream_failed', fallback: true });
  }
}
