function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('placeform-media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('media');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveMedia(key: string, blob: Blob) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    try {
      tx.objectStore('media').put(blob, key);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Browser storage write was interrupted.'));
    };
  });
}
export async function loadMedia(key: string) {
  const db = await openDB();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction('media');
    const r = tx.objectStore('media').get(key);
    r.onsuccess = () => {
      db.close();
      resolve(r.result);
    };
    r.onerror = () => {
      db.close();
      reject(r.error);
    };
  });
}
