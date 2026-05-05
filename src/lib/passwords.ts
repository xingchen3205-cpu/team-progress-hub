import { randomInt } from "node:crypto";

const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const lowercase = "abcdefghijkmnopqrstuvwxyz";
const digits = "23456789";
const symbols = "@#$%";
const allChars = `${uppercase}${lowercase}${digits}${symbols}`;

const pick = (source: string) => source[randomInt(source.length)];

const shuffle = (chars: string[]) => {
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
};

export function generateTemporaryPassword(length = 10) {
  const normalizedLength = Math.max(8, length);
  const chars = [pick(uppercase), pick(lowercase), pick(digits), pick(symbols)];

  while (chars.length < normalizedLength) {
    chars.push(pick(allChars));
  }

  return shuffle(chars);
}
