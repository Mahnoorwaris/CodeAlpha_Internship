class Whiteboard {
  constructor({ canvas, socket, roomId }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = socket;
    this.roomId = roomId;
    this.drawing = false;
    this.color = '#212121';
    this.size = 3;
    this.lastPoint = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => this.onUp());
    canvas.addEventListener('pointerleave', () => this.onUp());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * ratio);
    this.canvas.height = Math.floor(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  getPos(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onDown(e) {
    e.preventDefault();
    this.drawing = true;
    const pos = this.getPos(e);
    this.lastPoint = pos;
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
    this.ctx.lineTo(pos.x + 0.01, pos.y + 0.01);
    this.ctx.stroke();
    this.emit({ x: pos.x, y: pos.y, color: this.color, size: this.size, start: true });
  }

  onMove(e) {
    if (!this.drawing) return;
    e.preventDefault();
    const pos = this.getPos(e);
    if (!this.lastPoint) {
      this.lastPoint = pos;
      return;
    }
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.size;
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
    this.emit({ x: pos.x, y: pos.y, color: this.color, size: this.size, start: false });
    this.lastPoint = pos;
  }

  onUp() {
    this.drawing = false;
    this.lastPoint = null;
  }

  emit(segment) {
    if (this.socket && this.roomId) {
      this.socket.emit('whiteboard-draw', { roomId: this.roomId, ...segment });
    }
  }

  applyRemote(segment) {
    if (!segment) return;
    this.ctx.strokeStyle = segment.color || this.color;
    this.ctx.lineWidth = segment.size || this.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    if (segment.start || this.remoteLast == null) {
      this.ctx.moveTo(segment.x, segment.y);
    } else {
      this.ctx.moveTo(this.remoteLast.x, this.remoteLast.y);
      this.ctx.lineTo(segment.x, segment.y);
    }
    this.ctx.stroke();
    this.remoteLast = { x: segment.x, y: segment.y };
    if (segment.start) this.remoteLast = { x: segment.x, y: segment.y };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.socket && this.roomId) {
      this.socket.emit('whiteboard-clear', { roomId: this.roomId });
    }
  }
}

if (typeof window !== 'undefined') {
  window.Whiteboard = Whiteboard;
}