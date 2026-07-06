// @ts-nocheck - enum is included to exercise the collectSourceExports regex; this file is a static-analysis fixture
export function alpha(): void {}
export const beta = 1;
export class Gamma {}
export type Delta = string;
export const Epsilon = { A: 0, B: 1 } as const;
export interface Zeta {
  value: number;
}
export { beta as betaAlias };
export async function eta(): Promise<void> {}
export function* mu(): Generator<number> {
  yield 0;
}
export let kappa = 0;
export var lambda = 0; // eslint-disable-line no-var
export enum Theta {
  First = 0,
}
export abstract class Iota {}
