import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, head, put } from "@vercel/blob";
import { env } from "../env";
import { AppError } from "../errors";

/**
 * Document storage abstraction.
 *
 * The prototype writes to the local filesystem. The interface is deliberately
 * S3-shaped (put/get/delete by key) so swapping in S3, R2 or Vercel Blob is a
 * new implementation of this interface — see docs/DEPLOYMENT.md for why this
 * matters on ephemeral-filesystem hosts.
 */
export interface StorageAdapter {
  readonly id: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

class LocalStorage implements StorageAdapter {
  readonly id = "local-fs";

  private resolve(key: string): string {
    // Defence in depth: a traversal in the key must never escape the root.
    const root = path.resolve(env().STORAGE_DIR);
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep) && target !== root) {
      throw new AppError("BAD_REQUEST", "Invalid storage key.");
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      const isVercel = Boolean(process.env.VERCEL);
      const hint = isVercel
        ? " (Running on Vercel with local-fs storage: BLOB_READ_WRITE_TOKEN environment variable is missing in Vercel settings)."
        : ".";
      throw new AppError("NOT_FOUND", `[local-fs] Stored object ${key} is missing${hint}`);
    }
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => {});
  }

  async exists(key: string): Promise<boolean> {
    try {
      await readFile(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

class VercelBlobStorage implements StorageAdapter {
  readonly id = "vercel-blob";

  async put(key: string, data: Buffer): Promise<void> {
    await put(key, data, {
      access: "public",
      addRandomSuffix: false,
    });
  }

  async get(key: string): Promise<Buffer> {
    try {
      const res = await get(key, { access: "public" });
      if (!res || res.statusCode !== 200 || !res.stream) {
        throw new AppError("NOT_FOUND", `[vercel-blob] Stored object ${key} is missing.`);
      }
      const chunks: Uint8Array[] = [];
      const reader = res.stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "NOT_FOUND",
        `[vercel-blob] Stored object ${key} is missing: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await del(key);
    } catch {
      // Ignore deletion errors if blob doesn't exist
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const info = await head(key);
      return Boolean(info);
    } catch {
      return false;
    }
  }
}

function selectDefaultAdapter(): StorageAdapter {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.STORAGE_PROVIDER === "vercel-blob") {
    return new VercelBlobStorage();
  }
  return new LocalStorage();
}

let customAdapter: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  return customAdapter ?? selectDefaultAdapter();
}

export function setStorageAdapter(next: StorageAdapter): void {
  customAdapter = next;
}

/**
 * Storage key for an uploaded material. Namespaced by user so a listing of the
 * bucket cannot mix tenants, and suffixed with a content hash so re-uploading
 * the same file is idempotent.
 */
export function materialKey(userId: string, projectId: string, filename: string, data: Buffer) {
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  // Defence in depth. `resolve()` already refuses to escape the storage root,
  // but the key itself is also normalised here so it stays safe under a
  // backend (S3, R2) that has no filesystem semantics to protect it: strip
  // every path separator, then collapse dot-runs so no ".." survives at all.
  const safeName = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+/, "")
    .slice(-80) || "upload.pdf";
  return {
    key: `materials/${userId}/${projectId}/${hash}-${safeName}`,
    checksum: hash,
  };
}
