// gallery.js — photos live in this browser's IndexedDB on the tablet. Nothing is uploaded.
const DB = 'tori-glam', STORE = 'photos';
let dbp = null;

function db() {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

export async function add(blob) {
  navigator.storage?.persist?.().catch(() => {});   // ask the browser not to evict her pictures
  return run('readwrite', (s) => s.add({ blob, t: Date.now() }));
}
export async function all() {
  const rows = await run('readonly', (s) => s.getAll());
  return (rows || []).sort((a, b) => b.t - a.t);
}
export async function latest() {
  const rows = await all();
  return rows[0] || null;
}
export async function remove(id) {
  return run('readwrite', (s) => s.delete(id));
}
