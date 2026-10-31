export interface MessageBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

/** Place the most important messages first, using the nearest free screen space. */
export function layoutHeadMessages(messages: readonly MessageBox[], bounds: { width: number; height: number }, obstacles: readonly Pick<MessageBox, "x" | "y" | "width" | "height">[] = []): MessageBox[] {
  const margin = 8, gap = 10;
  const placed: MessageBox[] = [];
  for (const message of [...messages].sort((a, b) => b.priority - a.priority)) {
    const maxX = bounds.width - margin - message.width;
    const maxY = bounds.height - margin - message.height;
    if (maxX < margin || maxY < margin) continue;
    const clampX = (x: number) => Math.max(margin, Math.min(maxX, x));
    const clampY = (y: number) => Math.max(margin, Math.min(maxY, y));
    const x = clampX(message.x), y = clampY(message.y);
    const xs = [x, margin, maxX];
    const ys = [y, margin, maxY];
    for (const box of [...obstacles, ...placed]) {
      xs.push(clampX(box.x - message.width - gap), clampX(box.x + box.width + gap));
      ys.push(clampY(box.y - message.height - gap), clampY(box.y + box.height + gap));
    }
    let best: MessageBox | undefined, distance = Infinity;
    for (const candidateX of xs) for (const candidateY of ys) {
      const overlaps = [...obstacles, ...placed].some(box => candidateX < box.x + box.width + gap && candidateX + message.width + gap > box.x
        && candidateY < box.y + box.height + gap && candidateY + message.height + gap > box.y);
      const score = (candidateX - x) ** 2 + (candidateY - y) ** 2;
      if (!overlaps && score < distance) {
        best = { ...message, x: candidateX, y: candidateY };
        distance = score;
      }
    }
    // In an overcrowded viewport, old messages remain available in the run log.
    if (best) placed.push(best);
  }
  return placed;
}
