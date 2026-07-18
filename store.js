'use strict';

// ══════════════════════════════════════════════════════
//  store.js
//  In-memory key-value store for session tokens.
//  Used by the NMB Connect backend to manage
//  admin approval sessions and polling results.
// ══════════════════════════════════════════════════════

const store    = new Map(); // token → { result, expiresAt }
const sessions = new Map(); // token → { phone, name, reference, sig, expiresAt }

const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Save a session for a token
 */
export function setSession(token, data, ttlMs = DEFAULT_TTL) {
  if (!token || !data?.phone || !data?.sig) {
    console.error('❌ setSession: Missing required fields');
    return false;
  }

  sessions.set(token, {
    phone: data.phone,
    name: data.name || null,
    reference: data.reference || null,
    sig: data.sig,
    expiresAt: Date.now() + ttlMs,
  });

  return true;
}

/**
 * Retrieve a session by token (without deleting it)
 */
export function getSession(token) {
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

/**
 * Delete a session by token
 */
export function deleteSession(token) {
  return sessions.delete(token);
}

/**
 * Save a result for a token
 */
export function setResult(token, result, ttlMs = DEFAULT_TTL) {
  if (!token || !result) {
    console.error('❌ setResult: Missing required fields');
    return false;
  }

  store.set(token, {
    result,
    expiresAt: Date.now() + ttlMs,
  });

  return true;
}

/**
 * Get and immediately delete a result for a token
 */
export function popResult(token) {
  if (!token) return null;

  const entry = store.get(token);
  if (!entry) return null;

  store.delete(token);

  if (Date.now() > entry.expiresAt) return null;

  return entry.result;
}

/**
 * Check if a result exists
 */
export function hasResult(token) {
  if (!token) return false;
  const entry = store.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(token);
    return false;
  }
  return true;
}

/**
 * Clear expired entries
 */
export function clearExpired() {
  const now = Date.now();
  let sessionsCleared = 0;
  let resultsCleared = 0;

  for (const [token, entry] of sessions) {
    if (now > entry.expiresAt) {
      sessions.delete(token);
      sessionsCleared++;
    }
  }

  for (const [token, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(token);
      resultsCleared++;
    }
  }

  return { sessionsCleared, resultsCleared };
}

// ── Auto Cleanup ──
setInterval(() => {
  const cleared = clearExpired();
  if (cleared.sessionsCleared > 0 || cleared.resultsCleared > 0) {
    console.log(`🧹 Cleaned: ${cleared.sessionsCleared} sessions, ${cleared.resultsCleared} results`);
  }
}, CLEANUP_INTERVAL);

export default {
  setSession,
  getSession,
  deleteSession,
  setResult,
  popResult,
  hasResult,
  clearExpired,
};
