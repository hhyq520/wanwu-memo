import { app, nativeImage, type BrowserWindow, type NativeImage } from "electron";

let dot: NativeImage | null = null;

function overlayIcon(): NativeImage {
  if (dot) return dot;
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const radius = 7;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      if (dx * dx + dy * dy > radius * radius) continue;
      const index = (y * size + x) * 4;
      buffer[index] = 44;
      buffer[index + 1] = 44;
      buffer[index + 2] = 155;
      buffer[index + 3] = 255;
    }
  }
  dot = nativeImage.createFromBitmap(buffer, { width: size, height: size, scaleFactor: 1 });
  return dot;
}

export function setReminderBadge(count: number, win: BrowserWindow | null): void {
  const total = Math.max(0, Math.floor(count));
  if (process.platform === "darwin") app.dock?.setBadge(total > 0 ? String(total) : "");
  try {
    app.setBadgeCount(total);
  } catch {
    // Some platforms reject the badge API.
  }
  if (process.platform === "win32" && win && !win.isDestroyed()) {
    win.setOverlayIcon(total > 0 ? overlayIcon() : null, total > 0 ? `${total} 条提醒` : "");
  }
}
