import * as openpgp from "openpgp";
import { ComposeResult } from "../types.js";

export interface GeneratedProfileKeys {
  publicKeyArmored: string;
  privateKeyArmored: string;
  fingerprint: string;
  keyId: string;
  privateKeyEncrypted: boolean;
}

export async function generateProfileKeys(passphrase?: string): Promise<GeneratedProfileKeys> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "thekeeper" }],
    passphrase
  });
  const parsedPublicKey = await openpgp.readKey({ armoredKey: publicKey });
  const fingerprint = parsedPublicKey.getFingerprint();
  const encryptionSubkey = await parsedPublicKey.getEncryptionKey();
  const keyId = encryptionSubkey ? encryptionSubkey.getKeyID().toHex() : parsedPublicKey.getKeyID().toHex();

  return {
    publicKeyArmored: publicKey,
    privateKeyArmored: privateKey,
    fingerprint,
    keyId,
    privateKeyEncrypted: Boolean(passphrase)
  };
}

export async function readPublicKey(armoredKey: string): Promise<openpgp.Key> {
  return openpgp.readKey({ armoredKey });
}

export async function readPrivateKey(armoredKey: string, passphrase?: string): Promise<openpgp.PrivateKey> {
  const key = await openpgp.readPrivateKey({ armoredKey });
  if (key.isDecrypted()) {
    return key;
  }
  if (!passphrase) {
    throw new Error("Private key requires a passphrase");
  }
  return openpgp.decryptKey({ privateKey: key, passphrase });
}

export async function fingerprintForPublicKey(armoredKey: string): Promise<string> {
  const key = await readPublicKey(armoredKey);
  return key.getFingerprint();
}

export async function composeEncryptedMessage(
  plaintext: string,
  senderPrivateKey: openpgp.PrivateKey,
  recipientPublicKeyArmored: string
): Promise<ComposeResult> {
  const recipientKey = await readPublicKey(recipientPublicKeyArmored);
  const senderPublic = senderPrivateKey.toPublic();

  const message = await openpgp.createMessage({ text: plaintext });
  const ciphertextArmored = await openpgp.encrypt({
    message,
    encryptionKeys: [recipientKey, senderPublic],
    signingKeys: senderPrivateKey,
    format: "armored"
  });

  return {
    ciphertextArmored,
    signatureFingerprint: senderPublic.getFingerprint()
  };
}

export async function decryptMessage(
  ciphertextArmored: string,
  recipientPrivateKey: openpgp.PrivateKey,
  senderPublicKeyArmored: string
): Promise<{ plaintext: string; verified: boolean; verificationError?: string }> {
  const senderPublicKey = await readPublicKey(senderPublicKeyArmored);
  const message = await openpgp.readMessage({ armoredMessage: ciphertextArmored });
  const decrypted = await openpgp.decrypt({
    message,
    verificationKeys: senderPublicKey,
    decryptionKeys: recipientPrivateKey,
    format: "utf8"
  });

  try {
    const [signature] = decrypted.signatures;
    if (signature) {
      await signature.verified;
    }
    return { plaintext: decrypted.data, verified: true };
  } catch (error) {
    return {
      plaintext: decrypted.data,
      verified: false,
      verificationError: error instanceof Error ? error.message : "Signature verification failed"
    };
  }
}
