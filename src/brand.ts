const brandPattern = /^[a-z]{3}$/;

/** Validates a three-character lowercase brand. Throws on invalid input. */
export function validateBrand(brand: string): void {
  if (!brandPattern.test(brand)) {
    throw new Error("invalid brand, expected three lowercase a-z characters");
  }
}
