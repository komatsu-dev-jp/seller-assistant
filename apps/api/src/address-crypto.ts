import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export interface EncryptedAddress {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: string;
}

export interface AddressCipher {
  encrypt(workspaceId: string, orderId: string, address: string): EncryptedAddress;
  decrypt(workspaceId: string, orderId: string, value: EncryptedAddress): string;
  fingerprint(workspaceId: string, orderId: string, address: string): string;
}

export class AesGcmAddressCipher implements AddressCipher {
  private readonly key: Buffer;

  constructor(encodedKey: string) {
    const key = /^[a-f0-9]{64}$/iu.test(encodedKey)
      ? Buffer.from(encodedKey, "hex")
      : Buffer.from(encodedKey, "base64");
    if (key.length !== 32) throw new Error("ADDRESS_ENCRYPTION_KEY must decode to 32 bytes");
    this.key = key;
  }

  encrypt(workspaceId: string, orderId: string, address: string): EncryptedAddress {
    const plaintext = Buffer.from(address.trim(), "utf8");
    if (plaintext.length < 1 || plaintext.length > 2048) {
      throw new Error("Shipping address must be 1 to 2048 UTF-8 bytes");
    }
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(addressContext(workspaceId, orderId));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    plaintext.fill(0);
    return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion: "local-aes-gcm-v1" };
  }

  decrypt(workspaceId: string, orderId: string, value: EncryptedAddress): string {
    if (value.keyVersion !== "local-aes-gcm-v1") throw new Error("Address key version is unknown");
    const decipher = createDecipheriv("aes-256-gcm", this.key, value.nonce);
    decipher.setAAD(addressContext(workspaceId, orderId));
    decipher.setAuthTag(value.authTag);
    return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString("utf8");
  }

  fingerprint(workspaceId: string, orderId: string, address: string): string {
    return createHmac("sha256", this.key)
      .update(addressContext(workspaceId, orderId))
      .update("\0")
      .update(address.trim(), "utf8")
      .digest("hex");
  }
}

function addressContext(workspaceId: string, orderId: string): Buffer {
  return Buffer.from(`resale-address:${workspaceId}:${orderId}`, "utf8");
}
