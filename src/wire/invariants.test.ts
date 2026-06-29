import { describe, expect, it } from "vitest";
import { alphabet } from "./base32.js";
import { base32CharClass, base32FinalCharClass, schemaExampleId } from "./invariants.js";

describe("invariants", () => {
  it("base32CharClass matches every alphabet char and no char outside alphabet", () => {
    const re = new RegExp(`^${base32CharClass}$`);
    for (const char of alphabet) {
      expect(re.test(char), `expected '${char}' to match base32CharClass`).toBe(true);
    }
    for (let code = 32; code < 127; code++) {
      const char = String.fromCharCode(code);
      if (!alphabet.includes(char)) {
        expect(re.test(char), `expected '${char}' not to match base32CharClass`).toBe(false);
      }
    }
  });

  it("base32FinalCharClass matches exactly the alphabet chars at indices divisible by 4", () => {
    const re = new RegExp(`^${base32FinalCharClass}$`);
    const expected = alphabet.split("").filter((_, i) => i % 4 === 0);
    const notExpected = alphabet.split("").filter((_, i) => i % 4 !== 0);
    for (const char of expected) {
      expect(re.test(char), `expected '${char}' to match base32FinalCharClass`).toBe(true);
    }
    for (const char of notExpected) {
      expect(re.test(char), `expected '${char}' not to match base32FinalCharClass`).toBe(false);
    }
  });

  it("schemaExampleId returns prefix followed by 26 zeros", () => {
    expect(schemaExampleId("usr_")).toBe("usr_" + "0".repeat(26));
  });
});
