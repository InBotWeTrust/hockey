/** A cancelled drag never contributes a tap. One hold produces one incident. */
export class CharacterGesture {
  private pointer: { id: number; x: number; y: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private taps: number[] = [];
  constructor(private readonly fire: () => void) {}
  down(id: number, x: number, y: number) {
    if (this.pointer) { this.cancel(); return; }
    this.pointer = { id, x, y };
    this.timer = setTimeout(() => { this.cancel(); this.fire(); }, 2000);
  }
  move(id: number, x: number, y: number) {
    if (this.pointer?.id === id && Math.hypot(x-this.pointer.x,y-this.pointer.y)>12) this.cancel();
  }
  up(id: number) {
    if (this.pointer?.id !== id) return;
    clearTimeout(this.timer); this.pointer = null;
    const now = Date.now();
    this.taps = this.taps.filter(at=>now-at<=3000);
    this.taps.push(now);
    if (this.taps.length===3) { this.cancel(); this.fire(); }
  }
  cancel() { clearTimeout(this.timer); this.pointer=null; this.taps=[]; }
}
