/**
 * Password generation for rotations.
 *
 * Optimised for being read aloud and typed on a phone keyboard by a guest, so
 * the alphabet drops the characters people confuse: 0/O, 1/l/I, 5/S, 2/Z.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '346789';

export function generatePassword(groups = 3): string {
  const pick = (set: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((v) => set[v % set.length])
      .join('');
  return Array.from({ length: groups }, () => pick(ALPHABET, 4)).join('-') + pick(DIGITS, 2);
}
