/** Discriminated failure value passed to `onError` and emitted to the framework's error handler. */
export type IdParamFailure =
  | { readonly reason: "brand_mismatch"; readonly status: number }
  | { readonly reason: "malformed"; readonly status: number };
