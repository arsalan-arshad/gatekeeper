/** Demo judge textarea hard limit (matches API MESSAGE_MAX_CHARS). */
export const DEMO_MESSAGE_MAX_CHARS = 2000;

export function demoMessageOverLimit(length: number, max = DEMO_MESSAGE_MAX_CHARS): boolean {
  return length > max;
}

export function demoCharCounterLabel(length: number, max = DEMO_MESSAGE_MAX_CHARS): string {
  return `${length}/${max}`;
}
