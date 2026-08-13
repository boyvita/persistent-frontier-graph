export function isRevealed(reveal: number): boolean {
  return Number.isFinite(reveal) && reveal > 0;
}
