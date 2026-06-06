const registeredBrands = new Set<string>();
const warnedBrands = new Set<string>();

export function registerBrand(brand: string, allowDuplicateBrand: boolean | undefined): void {
  if (
    typeof process === "undefined" ||
    process.env.NODE_ENV === "production" ||
    allowDuplicateBrand
  ) {
    return;
  }

  if (registeredBrands.has(brand)) {
    if (!warnedBrands.has(brand)) {
      console.warn(
        `[@smonn/ids] brand "${brand}" was registered more than once — this usually indicates a bundling or import bug, or that more than one codec variant is using the same brand. Pass { allowDuplicateBrand: true } to silence.`,
      );
      warnedBrands.add(brand);
    }
  } else {
    registeredBrands.add(brand);
  }
}
