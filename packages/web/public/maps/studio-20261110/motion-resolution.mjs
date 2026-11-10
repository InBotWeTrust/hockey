const LOGICAL_WIDTH = 3000;
const LOGICAL_HEIGHT = 1000;
const MAX_PIXELS = 24_000_000;
const positive = value => Number.isFinite(value) && value > 0 ? value : 0;

export function motionSurfaceSize(cssWidth, cssHeight, deviceScale = 1) {
  const density = positive(deviceScale) || 1;
  const scale = Math.max(1, positive(cssWidth) * density / LOGICAL_WIDTH, positive(cssHeight) * density / LOGICAL_HEIGHT);
  const height = Math.min(Math.ceil(LOGICAL_HEIGHT * scale), Math.floor(Math.sqrt(MAX_PIXELS / 3)));
  return { width: height * 3, height };
}

export function resizeMotionSurface(canvas, context, cssWidth, cssHeight, deviceScale) {
  const {width,height} = motionSurfaceSize(cssWidth, cssHeight, deviceScale);
  // Assigning either dimension clears canvas state; avoid doing so every frame.
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(width / LOGICAL_WIDTH, 0, 0, height / LOGICAL_HEIGHT, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
}
