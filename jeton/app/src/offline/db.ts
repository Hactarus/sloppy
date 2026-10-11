/** Thin promise wrapper over IndexedDB. Stores: ops (queue), spend (offline tokens per tag), kv. */
export const DB_NAME = 'jeton'
const VERSION = 1

export function openDb(name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      const ops = db.createObjectStore('ops', { keyPath: 'seq', autoIncrement: true })
      ops.createIndex('client_tx_id', 'client_tx_id', { unique: true })
      ops.createIndex('status', 'status')
      db.createObjectStore('spend', { keyPath: 'tag_code' })
      db.createObjectStore('kv', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function tx<T>(db: IDBDatabase, stores: string | string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode)
    let result: T
    const r = fn(t)
    if (r) {
      r.onsuccess = () => (result = r.result)
      r.onerror = (ev) => { ev.preventDefault(); reject(r.error ?? new Error('IndexedDB request failed')) }
    }
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'))
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'))
  })
}
