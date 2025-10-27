import type { ShapeKey } from "./shapes";
import { RNG } from "./rng";

const ALL: ShapeKey[] = ["I","O","T","J","L","S","Z"];

export function generateBag(rng: RNG): ShapeKey[] {
  const bag = [...ALL];
  // Fisher–Yates
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
