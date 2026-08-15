import { createHash, randomUUID } from "node:crypto";
import { constants, copyFile, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface StoredMediaResult {
  sha256: string;
  sizeBytes: number;
  storageKey: string;
  created: boolean;
}

export interface InspectedImage {
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
}

export interface PrivateMediaStore {
  saveOriginal(storageKey: string, bytes: Buffer): Promise<StoredMediaResult>;
  createSanitizedDisplay(
    originalStorageKey: string,
    displayStorageKey: string,
    mimeType: "image/jpeg" | "image/png",
  ): Promise<StoredMediaResult>;
  readDisplay(storageKey: string, expectedSha256: string): Promise<Buffer>;
  removeOriginal(storageKey: string, expectedSha256: string): Promise<void>;
  removeDisplay(storageKey: string, expectedSha256: string): Promise<void>;
}

export class LocalPrivateMediaStore {
  private readonly root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) throw new Error("LOCAL_MEDIA_ROOT must be an absolute private path");
    this.root = resolve(root);
  }

  async saveOriginal(storageKey: string, bytes: Buffer): Promise<StoredMediaResult> {
    const requiredSegment = storageKey.includes("/location-originals/")
      ? "location-originals"
      : "originals";
    const path = this.safePath(storageKey, requiredSegment);
    const actualSha256 = sha256(bytes);
    await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
    try {
      const existing = await readFile(path);
      if (sha256(existing) !== actualSha256) {
        throw new Error("The immutable original key already contains different bytes");
      }
      return { sha256: actualSha256, sizeBytes: existing.length, storageKey, created: false };
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
    return { sha256: actualSha256, sizeBytes: bytes.length, storageKey, created: true };
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
    let createdDisplay = false;
    try {
      const temporary = await open(temporaryPath, "wx", 0o600);
      try {
        await temporary.writeFile(sanitized);
        await temporary.sync();
      } finally {
        await temporary.close();
      }
      try {
        await copyFile(temporaryPath, displayPath, constants.COPYFILE_EXCL);
        createdDisplay = true;
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const existing = await readFile(displayPath);
        if (sha256(existing) !== sha256(sanitized)) {
          throw new Error("The display key already contains different bytes", { cause: error });
        }
      }
      const written = await stat(displayPath);
      if (written.size !== sanitized.length) throw new Error("Sanitized display size mismatch");
    } catch (error) {
      if (createdDisplay) await unlink(displayPath).catch(() => undefined);
      throw error;
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
    return {
      sha256: sha256(sanitized),
      sizeBytes: sanitized.length,
      storageKey: displayStorageKey,
      created: createdDisplay,
    };
  }

  async readDisplay(storageKey: string, expectedSha256: string): Promise<Buffer> {
    const bytes = await readFile(this.safePath(storageKey, "location-display"));
    if (sha256(bytes) !== expectedSha256) {
      throw new Error("The display file hash no longer matches the approved database record");
    }
    return bytes;
  }

  async removeDisplay(storageKey: string, expectedSha256: string): Promise<void> {
    const path = this.safePath(storageKey, "location-display");
    let existing: Buffer;
    try {
      existing = await readFile(path);
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
    if (sha256(existing) !== expectedSha256) {
      throw new Error("Refusing to remove a display file with another hash");
    }
    await unlink(path);
  }

  async removeOriginal(storageKey: string, expectedSha256: string): Promise<void> {
    const requiredSegment = storageKey.includes("/location-originals/")
      ? "location-originals"
      : "originals";
    await this.removePrivateFile(storageKey, requiredSegment, expectedSha256);
  }

  private async removePrivateFile(
    storageKey: string,
    requiredSegment: string,
    expectedSha256: string,
  ): Promise<void> {
    const path = this.safePath(storageKey, requiredSegment);
    let existing: Buffer;
    try {
      existing = await readFile(path);
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
    if (sha256(existing) !== expectedSha256) {
      throw new Error("Refusing to remove a private file with another hash");
    }
    await unlink(path);
  }

  private safePath(storageKey: string, requiredSegment: string): string {
    if (
      !/^workspaces\/[0-9a-f-]{36}\/(?:originals|location-originals|location-display)\/[A-Za-z0-9._-]+$/u.test(
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

export function inspectImage(bytes: Buffer): InspectedImage {
  if (bytes.length > 25 * 1024 * 1024) throw new Error("Image exceeds 25 MB");
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if (bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error("PNG has no IHDR");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    return checkedImage("image/png", width, height);
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) throw new Error("Invalid JPEG segment");
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xd9 || marker === 0xda) break;
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      const end = offset + 2 + length;
      if (length < 2 || end > bytes.length) throw new Error("Invalid JPEG segment length");
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        if (length < 7) throw new Error("Invalid JPEG dimensions");
        return checkedImage(
          "image/jpeg",
          bytes.readUInt16BE(offset + 7),
          bytes.readUInt16BE(offset + 5),
        );
      }
      offset = end;
    }
    throw new Error("JPEG dimensions are missing");
  }
  throw new Error("Only JPEG and PNG are supported");
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function checkedImage(
  mimeType: InspectedImage["mimeType"],
  width: number,
  height: number,
): InspectedImage {
  if (width < 1 || height < 1 || width > 12_000 || height > 12_000) {
    throw new Error("Image dimensions are outside the supported range");
  }
  return { mimeType, width, height };
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
  if (bytes.length < 20 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Invalid PNG input");
  }
  const chunks: Buffer[] = [PNG_SIGNATURE];
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

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
