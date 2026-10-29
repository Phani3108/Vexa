/**
 * Business packs: ready-made flows + sample business data + guardrails + evals
 * for one kind of business (clinic, salon, restaurant, kirana, home services,
 * coaching, real estate).
 *
 * Installing a pack merges its flows over the built-in business flows (a pack
 * flow with the same id replaces the built-in one) and, optionally, fills the
 * business profile with realistic sample data so the owner can try it at once.
 * Guardrails are read from the registry at call time, so improving a pack's
 * rules reaches every account that installed it.
 */

import { defaultWorkflows } from '../workflows/templates.js';
import clinic from './clinic.js';
import salon from './salon.js';
import restaurant from './restaurant.js';
import kirana from './kirana.js';
import homeServices from './home_services.js';
import coaching from './coaching.js';
import realEstate from './real_estate.js';

export const PACKS = Object.fromEntries([clinic, salon, restaurant, kirana, homeServices, coaching, realEstate].map(p => [p.id, p]));

export function listPacks() {
  return Object.values(PACKS).map(p => ({
    id: p.id, name: p.name, industry: p.industry, icon: p.icon, description: p.description,
    flows: p.flows.map(f => f.name), guardrails: (p.guardrails?.refuse || []).map(r => r.description)
  }));
}

export function getPack(id) {
  return PACKS[id] || null;
}

/** Refusal rules for every pack the account installed (plus any of the owner's own). */
export function guardrailsFor(user) {
  const refuse = [];
  for (const id of user?.packs || []) refuse.push(...(PACKS[id]?.guardrails?.refuse || []));
  return { refuse };
}

/**
 * Business flows with the pack's flows laid over them (same id replaces, new ids are added).
 * `pack.replaces` drops built-ins that don't fit the business (a clinic never asks "how many do you need?").
 */
export function packWorkflows(pack) {
  const base = defaultWorkflows('business').filter(f => !(pack.replaces || []).includes(f.id));
  const own = pack.flows.map(f => ({ enabled: true, builtIn: true, mode: 'business', maxTurns: 12, pack: pack.id, ...structuredClone(f) }));
  const ids = new Set(own.map(f => f.id));
  return [...own, ...base.filter(f => !ids.has(f.id))];
}

/**
 * Changes to apply to a UserConfig when a pack is installed.
 * @param {object} user current config
 * @param {boolean} sampleData also load the pack's sample business (name, catalog, records…)
 */
export function packUpdate(user, pack, { sampleData = false } = {}) {
  const current = user.businessProfile || {};
  const sample = pack.sample || {};
  const profile = { ...current, industry: pack.industry };
  if (sampleData) {
    for (const key of ['businessName', 'description', 'address', 'directions', 'currency', 'timezone', 'upiId', 'upiName', 'hours']) {
      if (sample[key] != null) profile[key] = sample[key];
    }
    for (const key of ['services', 'faqs', 'catalog', 'records', 'listings']) if (sample[key]) profile[key] = sample[key];
  } else {
    // Without sample data, keep the owner's details and only add what's missing
    for (const key of ['services', 'faqs']) if (!current[key]?.length && sample[key]) profile[key] = sample[key];
  }
  return {
    accountType: 'business',
    packs: [pack.id],   // one business type at a time: its flows replace the previous pack's
    workflows: packWorkflows(pack),
    businessProfile: profile
  };
}
