import { hasher } from "../parser/parser.svelte";
import { forageStorage } from "../globalApi.svelte";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type BulkReadableStorage = {
    getItems?: (keys: string[]) => Promise<{key: string, value: Uint8Array}[]>
    getItem: (key: string) => Promise<Uint8Array | null>
}

let initPromise: Promise<void> | null = null;

async function ensureStorageReady() {
    if (!initPromise) {
        initPromise = forageStorage.Init();
    }
    await initPromise;
}

function encodeKeyComponent(value: string) {
    return Buffer.from(value, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function decodeKeyComponent(value: string) {
    const padded = value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf-8");
}

export async function readPersistentJson<T>(storageKey: string): Promise<T | null> {
    await ensureStorageReady();
    const data = await forageStorage.getItem(storageKey);
    if (!data) {
        return null;
    }
    return JSON.parse(decoder.decode(data)) as T;
}

export async function readPersistentJsons<T>(storageKeys: string[]): Promise<Map<string, T | null>> {
    await ensureStorageReady();
    const uniqueKeys = [...new Set(storageKeys)];
    const result = new Map<string, T | null>();

    if (uniqueKeys.length === 0) {
        return result;
    }

    const storage: BulkReadableStorage = forageStorage;

    if (storage.getItems) {
        try {
            const rows = await storage.getItems(uniqueKeys);
            for (const key of uniqueKeys) {
                result.set(key, null);
            }
            for (const row of rows) {
                result.set(row.key, JSON.parse(decoder.decode(row.value)) as T);
            }
            return result;
        } catch (error) {
            console.warn('Bulk persistent JSON read failed, falling back to parallel reads:', error);
        }
    }

    await Promise.all(uniqueKeys.map(async (key) => {
        try {
            const data = await storage.getItem(key);
            result.set(key, data ? JSON.parse(decoder.decode(data)) as T : null);
        } catch {
            result.set(key, null);
        }
    }));

    return result;
}

export async function writePersistentJson<T>(storageKey: string, value: T): Promise<void> {
    await ensureStorageReady();
    await forageStorage.setItem(storageKey, encoder.encode(JSON.stringify(value)));
}

export async function removePersistentKey(storageKey: string): Promise<void> {
    await ensureStorageReady();
    await forageStorage.removeItem(storageKey);
}

export async function listPersistentKeys(prefix = ""): Promise<string[]> {
    await ensureStorageReady();
    return await forageStorage.keys(prefix);
}

export async function clearPersistentPrefix(prefix: string): Promise<void> {
    const keys = await listPersistentKeys(prefix);
    await Promise.all(keys.map((key) => removePersistentKey(key)));
}

export async function makeHashedStorageKey(prefix: string, rawKey: string): Promise<string> {
    const hash = await hasher(encoder.encode(rawKey));
    return `${prefix}${hash}.json`;
}

export function makeEncodedStorageKey(prefix: string, rawKey: string): string {
    return `${prefix}${encodeKeyComponent(rawKey)}.json`;
}

export function decodeStorageKeyComponent(encodedKey: string): string {
    return decodeKeyComponent(encodedKey);
}
