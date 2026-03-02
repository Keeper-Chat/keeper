import { readPrivateKey } from "../crypto/pgp.js";
import { ProfileRecord } from "../types.js";

export async function validateProfileUnlock(profile: ProfileRecord, passphrase?: string): Promise<void> {
  await readPrivateKey(profile.privateKeyArmored, passphrase);
}
