import type { Ms } from "@sentinel/contracts";

export const nowMs = (): Ms => performance.timeOrigin + performance.now();
