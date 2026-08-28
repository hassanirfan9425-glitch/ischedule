import { enqueueMutation, getQueuedMutations, removeQueuedMutation } from './db.js';
import { subscribeOnline, isOnline } from './connectivity.js';

// Every mutating route verified safe to queue while offline (see the offline-support plan): each
// is either a plain UPDATE, an inherently replay-safe DELETE, an upsert (ON CONFLICT DO UPDATE), a
// route with its own duplicate guard, or (addGradeManual) backed by the client_mutation_id
// idempotency column added server-side alongside this queue. Routes that need live server-side
// validation (auth, AI uploads, bulk term operations) are deliberately left out — see api.js.
const ALLOWLIST = [
  { method: 'POST', re: /^\/subjects\/mine$/ },
  { method: 'PATCH', re: /^\/subjects\/mine\/[^/]+$/ },
  { method: 'POST', re: /^\/manual-exams$/, creates: true },
  { method: 'DELETE', re: /^\/manual-exams\/([^/]+)$/, deletesCreate: '/manual-exams' },
  { method: 'POST', re: /^\/manual-exams\/finish$/ },
  { method: 'POST', re: /^\/materials\/[^/]+\/manual$/ },
  { method: 'POST', re: /^\/academics\/manual$/, creates: true },
  { method: 'DELETE', re: /^\/academics\/([^/]+)$/, deletesCreate: '/academics/manual' },
  { method: 'PUT', re: /^\/goals$/ },
  { method: 'DELETE', re: /^\/goals\/([^/]+)$/, deletesCreate: null },
  { method: 'POST', re: /^\/reflections$/ },
  { method: 'PATCH', re: /^\/reflections\/[^/]+\/dismiss-nudge$/ },
];

function matchRule(method, path) {
  return ALLOWLIST.find((rule) => rule.method === method && rule.re.test(path));
}

export function isQueueable(method, path) {
  return !!matchRule(method, path);
}

function tempId() {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Deleting a record whose creation is itself still sitting unqueued (a temp id, never seen by the
// server) should just cancel the pending create — there's nothing server-side to delete yet, and
// queuing the delete would mean either replaying it against an id the server never issued, or
// building a full temp-id-remapping system to fix it up post-replay. Net zero is simpler and
// correct for this single-user, low-frequency queue.
async function cancelPendingCreateIfMatched(rule, path) {
  if (!rule.deletesCreate) return false;
  const match = path.match(rule.re);
  const targetId = match?.[1];
  if (!targetId || !targetId.startsWith('offline-')) return false;
  const queued = await getQueuedMutations();
  const createEntry = queued.find((m) => m.path === rule.deletesCreate && m.resultTempId === targetId);
  if (!createEntry) return false;
  await removeQueuedMutation(createEntry.id);
  return true;
}

// Called from api.js's request() when a mutating call the allowlist covers fails with a genuine
// network error. Returns the same shape a caller would get back from a real request — enough for
// every current call site (they destructure at most `{ id }` or just await it) — or null if this
// path/method isn't queueable, so the caller can fall through to its normal error handling.
export async function enqueue(method, path, bodyText) {
  const rule = matchRule(method, path);
  if (!rule) return null;

  if (rule.deletesCreate !== undefined) {
    const cancelled = await cancelPendingCreateIfMatched(rule, path);
    if (cancelled) return { ok: true };
  }

  let body = bodyText ? JSON.parse(bodyText) : null;
  const resultTempId = rule.creates ? tempId() : null;
  // clientMutationId only has real teeth on /academics/manual (the one route with server-side
  // idempotency support — see server/src/db.js and routes/academics.js), but it's harmless to send
  // on every "creates" route: each handler destructures only the fields it knows about, so an
  // extra field on e.g. POST /manual-exams is silently ignored.
  if (resultTempId) body = { ...body, clientMutationId: resultTempId };
  await enqueueMutation({ method, path, body, resultTempId });

  return { ok: true, ...(body || {}), ...(resultTempId ? { id: resultTempId } : {}), pending: true, _offlineQueued: true };
}

// Replays the whole queue in FIFO order against the real API. Runs exactly once per 'online'
// transition (wired below) rather than being callable from arbitrary UI code, so there's never a
// risk of two replays racing each other. A genuine (non-network) failure — a real validation error
// from the server — stops the run and leaves the remainder queued for the next reconnect, rather
// than silently dropping data; a network failure (still actually offline, or a flaky reconnect)
// does the same, since there's nothing more useful to do until the next 'online' event anyway.
async function replay() {
  const queued = await getQueuedMutations();
  queued.sort((a, b) => a.id - b.id);
  for (const mutation of queued) {
    let res;
    try {
      res = await fetch(`/api${mutation.path}`, {
        method: mutation.method,
        credentials: 'include',
        headers: mutation.body ? { 'Content-Type': 'application/json' } : undefined,
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
      });
    } catch {
      return; // still offline (or the reconnect was too brief) — try again on the next 'online' event
    }
    // A conflict (already applied — e.g. this exact clientMutationId landed before a dropped
    // response) counts as success, and so does a 404 on a replayed DELETE (the row is already
    // gone, which is exactly what the delete wanted) — both mean the intended write already
    // happened, not that this replay attempt failed.
    const alreadyApplied = res.status === 409 || (mutation.method === 'DELETE' && res.status === 404);
    if (!res.ok && !alreadyApplied) return;
    await removeQueuedMutation(mutation.id);
  }
}

let replaying = false;
subscribeOnline((online) => {
  if (!online || replaying) return;
  replaying = true;
  replay().finally(() => {
    replaying = false;
  });
});

// Covers the case where the app loads already online with mutations left over from a previous
// session that ended before they could sync (e.g. the tab was closed while still offline).
if (isOnline()) replay();
