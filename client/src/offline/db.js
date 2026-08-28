import { openDB } from 'idb';

const DB_NAME = 'cram-offline';
const DB_VERSION = 1;

// Two stores cover both offline concerns in one place: `responses` holds the last-successful GET
// payload per API path (read cache), `mutationQueue` holds writes made while offline, replayed in
// insertion order once back online (see mutationQueue.js).
function upgrade(db) {
  if (!db.objectStoreNames.contains('responses')) {
    db.createObjectStore('responses');
  }
  if (!db.objectStoreNames.contains('mutationQueue')) {
    db.createObjectStore('mutationQueue', { keyPath: 'id', autoIncrement: true });
  }
}

let dbPromise = null;
function getDb() {
  if (!dbPromise) dbPromise = openDB(DB_NAME, DB_VERSION, { upgrade });
  return dbPromise;
}

export async function cacheResponse(path, data) {
  const db = await getDb();
  await db.put('responses', { data, cachedAt: Date.now() }, path);
}

export async function getCachedResponse(path) {
  const db = await getDb();
  return db.get('responses', path);
}

export async function enqueueMutation(entry) {
  const db = await getDb();
  return db.add('mutationQueue', { ...entry, queuedAt: Date.now() });
}

export async function getQueuedMutations() {
  const db = await getDb();
  return db.getAll('mutationQueue');
}

export async function removeQueuedMutation(id) {
  const db = await getDb();
  await db.delete('mutationQueue', id);
}
