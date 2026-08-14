import { createHash, randomUUID } from "node:crypto";
import { constants, copyFile, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface StoredMediaResult {
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}

export class LocalPrivateMediaStore {
  private readonly root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) throw new Error("LOCAL_MEDIA_ROOT must be an absolute private path");
    this.root = resolve(root);
  }

  async saveOriginal(
    storageKey: string,
    bytes: Buffer,
    expectedSha256: string,
  ): Promise<StoredMediaResult> {
    const path = this.safePath(storageKey, "location-originals");
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== expectedSha256) throw new Error("Original SHA-256 does not match");
    await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
    try {
      const existing = await readFile(path);
      if (sha256(existing) !== expectedSha256) {
        throw new Error("The immutable original key already contains different bytes");
      }
      return { sha256: actualSha256, sizeBytes: existing.length, storageKey };
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    const file = await open(path, "wx", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    return { sha256: actualSha256, sizeBytes: bytes.length, storageKey };
  }

  async createSanitizedDisplay(
    originalStorageKey: string,
    displayStorageKey: string,
    mimeType: "image/jpeg" | "image/png",
  ): Promise<StoredMediaResult> {
    const originalPath = this.safePath(originalStorageKey, "location-originals");
    const displayPath = this.safePath(displayStorageKey, "location-display");
    const original = await readFile(originalPath);
    const sanitized = stripLocationMetadata(original, mimeType);
    await mkdir(resolve(displayPath, ".."), { recursive: true, mode: 0o700 });
    const temporaryPath = `${displayPath}.${randomUUID()}.tmp`;
    try {
      const temporary = await open(temporaryPath, "wx", 0o600);
      try {
        await temporary.writeFile(sanitized);
        await temporary.sync();
      } finally {
        await temporary.close();
      }
      await copyFile(temporaryPath, displayPath, constants.COPYFILE_EXCL);
      const written = await stat(displayPath);
      if (written.size !== sanitized.length) throw new Error("Sanitized display size mismatch");
    } catch (error) {
      await unlink(displayPath).catch(() => undefined);
      throw error;
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
    return {
      sha256: sha256(sanitized),
      sizeBytes: sanitized.length,
      storageKey: displayStorageKey,
    };
  }

  private safePath(storageKey: string, requiredSegment: string): string {
    if (
      !/^workspaces\/[0-9a-f-]{36}\/location-(?:originals|display)\/[A-Za-z0-9._-]+$/u.test(
        storageKey,
      ) ||
      storageKey.includes("..") ||
      !storageKey.includes(`/${requiredSegment}/`)
    ) {
      throw new Error("Media storage key is invalid");
    }
    const path = resolve(this.root, ...storageKey.split("/"));
    const fromRoot = relative(this.root, path);
    if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === ".." || isAbsolute(fromRoot)) {
      throw new Error("Media storage key escapes the private root");
    }
    return path;
  }
}

export function stripLocationMetadata(bytes: Buffer, mimeType: "image/jpeg" | "image/png"): Buffer {
  return mimeType === "image/jpeg" ? stripJpegMetadata(bytes) : stripPngMetadata(bytes);
}

function stripJpegMetadata(bytes: Buffer): Buffer {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Invalid JPEG input");
  }
  const chunks: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;
  let foundScan = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff || offset + 1 >= bytes.length)
      throw new Error("Invalid JPEG segment");
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda) {
      chunks.push(bytes.subarray(offset));
      foundScan = true;
      break;
    }
    if (marker === 0xd9) {
      chunks.push(bytes.subarray(offset, offset + 2));
      foundScan = true;
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) throw new Error("Truncated JPEG segment");
    const length = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) throw new Error("Invalid JPEG segment length");
    if (![0xe1, 0xed, 0xfe].includes(marker)) chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  if (!foundScan) throw new Error("JPEG has no scan or end marker");
  return Buffer.concat(chunks);
}

function stripPngMetadata(bytes: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 20 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error("Invalid PNG input");
  }
  const chunks: Buffer[] = [signature];
  const metadataTypes = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
  let offset = 8;
  let foundImage = false;
  let foundEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("Invalid PNG chunk length");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") foundImage = true;
    if (type === "IEND") foundEnd = true;
    if (!metadataTypes.has(type)) chunks.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  if (!foundImage || !foundEnd || offset !== bytes.length) {
    throw new Error("PNG is incomplete or has trailing bytes");
  }
  return Buffer.concat(chunks);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
