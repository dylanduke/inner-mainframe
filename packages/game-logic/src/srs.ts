// Very small kick set; expand to full SRS later.
export function tryRotateWithKicks(
    test: (rot: number, dx: number, dy: number) => boolean,
    rotFrom: number,
    dir: 1 | -1
  ): { ok: boolean; rot: number; dx: number; dy: number } {
    const rot = (((rotFrom + dir) % 4) + 4) % 4;
    const kicks: Array<[number, number]> = [
      [0, 0],
      [1, 0], [-1, 0],
      [0, -1], [0, 1],
    ];
    for (const [dx, dy] of kicks) {
      if (test(rot, dx, dy)) return { ok: true, rot, dx, dy };
    }
    return { ok: false, rot: rotFrom, dx: 0, dy: 0 };
  }
  