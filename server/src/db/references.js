import { randomInt } from "node:crypto";

export const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REFERENCE_PATTERN = /^RF-AG-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

export function generateReference() {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `RF-AG-${suffix}`;
}

export function generateUniqueReference(
  db,
  { maxAttempts = 5, generate = generateReference } = {}
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  const exists = db.prepare("SELECT 1 FROM complaints WHERE reference = ?");
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const reference = generate();
    if (!exists.get(reference)) return reference;
  }

  throw new Error(`Unable to generate a unique complaint reference after ${maxAttempts} attempts`);
}
