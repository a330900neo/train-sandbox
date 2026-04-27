export class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() { const m = this.mag(); return m === 0 ? new Vector2() : new Vector2(this.x / m, this.y / m); }
    scale(n) { return new Vector2(this.x * n, this.y * n); }
    distanceTo(v) { return this.sub(v).mag(); }
}

export function calculateSpeedLimit(radius) {
    if (radius > 25000 || radius === Infinity) return 160;
    // Formula approximation for train curve speed: V = sqrt(R * a) where a is allowed lateral acceleration
    // Simplified scaling for gameplay:
    const speed = Math.sqrt(radius) * 3; 
    return Math.min(160, Math.max(20, Math.round(speed)));
}
