// 모니터 화면 사진 로컬 보관 — IndexedDB에 Blob으로 넣고 배치 재로드 때 되살린다. 서버로는 안 나간다.

/** 사진은 브라우저 밖으로 안 나간다 — 백엔드에 `placed_item` 컬럼도 업로드 엔드포인트도
 *  없다(ERD 동결). 쿠키는 4KB 한도에 매 요청 서버로 실려 가므로 이미지에 부적합하고,
 *  localStorage는 base64 팽창 + 5MB 한도라 사진 몇 장에 찬다. Blob을 그대로 담을 수 있는
 *  IndexedDB가 남는 선택지다. 스토어 하나·키 하나뿐이라 래퍼 라이브러리는 안 쓴다. */
const DB_NAME = 'dero-sim';
const DB_VERSION = 1;
const STORE = 'screenPhotos';

/** 저장 키 — 배치 id + 배치 아이템 id. 같은 제품 모니터를 두 대 놓아도 인스턴스별로
 *  다른 사진을 갖는다(듀얼 모니터). 재로드 때 이 두 값이 서버에서 그대로 다시 온다. */
export function screenPhotoKey(placementId: number, backendItemId: number): string {
  return `${placementId}:${backendItemId}`;
}

function openDb(): Promise<IDBDatabase | null> {
  // SSR에는 indexedDB가 없다 — 프리렌더에서 그냥 비활성이면 된다.
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    // 사생활 보호 모드·용량 거부 등으로 안 열릴 수 있다 — 사진은 장식이라 조용히 포기한다.
    req.onerror = () => resolve(null);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putScreenPhoto(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const req = tx(db, 'readwrite').put(blob, key);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
  db.close();
}

export async function getScreenPhoto(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  const blob = await new Promise<Blob | null>((resolve) => {
    const req = tx(db, 'readonly').get(key);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
  db.close();
  return blob;
}

export async function deleteScreenPhoto(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const req = tx(db, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
  db.close();
}

/** 이 배치에 속한 키 중 `keepKeys`에 없는 것을 지운다 — 삭제된 아이템의 사진 회수.
 *  다른 배치의 키는 접두사가 달라 안 건드린다. */
export async function pruneScreenPhotos(placementId: number, keepKeys: string[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const keep = new Set(keepKeys);
  const prefix = `${placementId}:`;
  await new Promise<void>((resolve) => {
    const store = tx(db, 'readwrite');
    const req = store.getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result) {
        const key = String(k);
        if (key.startsWith(prefix) && !keep.has(key)) store.delete(key);
      }
      resolve();
    };
    req.onerror = () => resolve();
  });
  db.close();
}

/** 원본 사진을 화면 텍스처로 쓸 만한 크기까지 줄인다 — 4000px 원본을 그대로 담으면
 *  IndexedDB 용량과 `createImageBitmap` 비용만 커지고 화면에 보이는 것은 같다.
 *  WebP를 못 굽는 브라우저는 toBlob이 PNG로 떨어지고, 그것도 실패하면 원본을 그대로 쓴다. */
export async function downscaleImage(file: File, maxPx = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.85),
  );
  return blob ?? file;
}
