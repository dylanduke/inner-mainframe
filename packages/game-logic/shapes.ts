export const TILE = 24 as const;

export type ShapeKey = "I" | "O" | "T" | "J" | "L" | "S" | "Z";
export type Cell = [number, number];

export const SHAPES: Record<ShapeKey, Cell[]> = {
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  O: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  T: [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  L: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  J: [
    [1, 0],
    [1, 1],
    [1, 2],
    [0, 2],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  Z: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
};

// export const SHAPE_COLORS: Record<ShapeKey, string> = {
//   I:"#25c2a0", O:"#f2cc60", T:"#a78bfa", J:"#60a5fa",
//   L:"#f08c36", S:"#7bd389", Z:"#ef6b6b"
// };

export function rotateCells(cells: Cell[], r: number): Cell[] {
  const n = ((r % 4) + 4) % 4;
  return cells.map(([x, y]) => {
    switch (n) {
      case 1:
        return [-y, x];
      case 2:
        return [-x, -y];
      case 3:
        return [y, -x];
      default:
        return [x, y];
    }
  });
}

export function normalize(cells: Cell[]): Cell[] {
  let minX = Infinity,
    minY = Infinity;
  for (const [x, y] of cells) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

export function shapeBounds(type: ShapeKey, rot: number) {
  const cells = normalize(rotateCells(SHAPES[type], rot));
  let maxX = 0,
    maxY = 0;
  for (const [x, y] of cells) {
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { w: (maxX + 1) * TILE, h: (maxY + 1) * TILE };
}
