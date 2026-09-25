import { MAX_FILE, scaledDimensions, type prepareImage } from "./image.ts";

export type RetryImage = Awaited<ReturnType<typeof prepareImage>>;
export type RetryImageRecord = {
  account: string;
  taskId: string;
  image: RetryImage;
  expiresAt: number;
};
const DATABASE = "pixondeck-retry-images";
const STORE = "images";
export const RETRY_IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function identity(account: string, taskId?: string) {
  if (
    !account ||
    account.length > 256 ||
    (taskId !== undefined && (!taskId || taskId.length > 256))
  ) {
    throw new Error("INVALID_RETRY_IMAGE_IDENTITY");
  }
}

// Store the upload and optional original together with the same expiry.
// Only image.blob is uploaded; originalBlob stays in IndexedDB.
export function makeRetryImageRecord(
  account: string,
  taskId: string,
  image: RetryImage,
  expiresAt: string | number,
  now = Date.now(),
): RetryImageRecord {
  identity(account, taskId);
  const expiry =
    typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt;
  if (!Number.isFinite(expiry) || expiry <= now)
    throw new Error("RETRY_IMAGE_EXPIRED");
  const size = scaledDimensions(image.originalWidth, image.originalHeight);
  if (
    !(image.blob instanceof Blob) ||
    !["image/jpeg", "image/png"].includes(image.blob.type) ||
    image.blob.size === 0 ||
    image.blob.size > 2 * 1024 * 1024 ||
    image.width !== size.width ||
    image.height !== size.height ||
    typeof image.artificialBackground !== "boolean" ||
    typeof image.animated !== "boolean"
  ) {
    throw new Error("INVALID_PREPARED_RETRY_IMAGE");
  }
  if (image.originalBlob !== undefined && (
    !(image.originalBlob instanceof Blob) ||
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(image.originalBlob.type) ||
    image.originalBlob.size === 0 || image.originalBlob.size > MAX_FILE
  )) throw new Error("INVALID_ORIGINAL_IMAGE");
  return {
    account,
    taskId,
    image,
    expiresAt: Math.min(expiry, now + RETRY_IMAGE_RETENTION_MS),
  };
}

export function shouldPruneRetryImage(
  record: RetryImageRecord,
  now: number,
  account?: string,
  keepTaskIds?: ReadonlySet<string>,
): boolean {
  return (
    !Number.isFinite(record.expiresAt) ||
    record.expiresAt <= now ||
    (account === record.account &&
      keepTaskIds !== undefined &&
      !keepTaskIds.has(record.taskId))
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let abandoned = false;
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, {
        keyPath: ["account", "taskId"],
      });
    request.onerror = () =>
      reject(request.error ?? new Error("RETRY_IMAGE_STORAGE_UNAVAILABLE"));
    request.onblocked = () => {
      abandoned = true;
      reject(new Error("RETRY_IMAGE_STORAGE_BLOCKED"));
    };
    request.onsuccess = () => {
      if (abandoned) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  initial: T,
  work: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result = initial;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () =>
        reject(tx.error ?? new Error("RETRY_IMAGE_STORAGE_FAILED"));
      tx.onabort = () =>
        reject(tx.error ?? new Error("RETRY_IMAGE_STORAGE_ABORTED"));
      try {
        work(tx.objectStore(STORE), (value) => {
          result = value;
        });
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}

export async function putRetryImage(
  account: string,
  id: string,
  image: RetryImage,
  expiresAt: string | number,
): Promise<void> {
  const record = makeRetryImageRecord(account, id, image, expiresAt);
  await transaction("readwrite", undefined, (store) => {
    const existing = store.get([account, id]);
    existing.onsuccess = () => {
      const previous = existing.result as RetryImageRecord | undefined;
      if (!record.image.originalBlob && previous && !shouldPruneRetryImage(previous, Date.now())) {
        record.image = { ...record.image, originalBlob: previous.image.originalBlob };
      }
      store.put(record);
    };
  });
}

export async function getRetryImage(
  account: string,
  id: string,
): Promise<RetryImage | null> {
  identity(account, id);
  return transaction<RetryImage | null>("readwrite", null, (store, result) => {
    const request = store.get([account, id]);
    request.onsuccess = () => {
      const record = request.result as RetryImageRecord | undefined;
      if (!record) return;
      if (shouldPruneRetryImage(record, Date.now())) {
        store.delete([account, id]);
        return;
      }
      result(record.image);
    };
  });
}

export async function pruneRetryImages(
  account?: string,
  keepTaskIds?: readonly string[],
): Promise<void> {
  if (account !== undefined) identity(account);
  const keep = keepTaskIds === undefined ? undefined : new Set(keepTaskIds);
  const now = Date.now();
  await transaction("readwrite", undefined, (store) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (
        shouldPruneRetryImage(
          cursor.value as RetryImageRecord,
          now,
          account,
          keep,
        )
      )
        cursor.delete();
      cursor.continue();
    };
  });
}
