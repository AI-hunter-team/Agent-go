import type { AvatarRole } from "./avatarModel";

export interface SavedAvatar { name: string; blob: Blob; rotation: number }
const DATABASE = "agent-go-appearance";

/** 通过完整 IndexedDB 事务读取、覆盖或删除唯一的本机角色文件。 */
export function avatarStorage(role: AvatarRole, operation: "read" | "write" | "clear", value?: SavedAvatar): Promise<SavedAvatar | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("avatar");
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("角色存储被其他页面占用，请关闭旧页面后重试。"));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("avatar", operation === "read" ? "readonly" : "readwrite");
      const store = transaction.objectStore("avatar");
      const key = role === "player" ? "current" : "current-guard";
      const result = operation === "read" ? store.get(key) : operation === "clear" ? store.delete(key) : store.put(value, key);
      transaction.oncomplete = () => { database.close(); resolve(operation === "read" ? result.result as SavedAvatar | undefined : undefined); };
      transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("角色存储失败")); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  });
}
