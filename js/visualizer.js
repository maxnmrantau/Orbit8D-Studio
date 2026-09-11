/**
 * Orbit8D Studio - 3D Spatial Radar Visualizer
 * Renders an interactive top-down spatial acoustic radar with:
 * - Listener avatar with glowing headphones
 * - Dynamic orbital trajectories (Circle, Figure-8, Pendulum)
 * - Orbiting audio source with glowing comet trail & soundwave ripple pulses
 * - Real-time circular frequency spectrum analyzer
 * - Interactive mouse/touch dragging to place sound in 3D space manually
 */

class RadarVisualizer {
  constructor(canvas, audioEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = audioEngine;

    // Visual configuration
    this.trail = [];
    this.maxTrailLength = 35;
    this.ripples = [];
    this.lastRippleTime = 0;
    this.isDragging = false;
    this.scaleFactor = 1; // pixels per meter
    this.centerX = 0;
    this.centerY = 0;

    // Audio spectrum buffer
    this.freqData = new Uint8Array(64);

    // Bindings
    this.initCanvasSize();
    this.initEventListeners();

    // Hook into audio engine updates
    this.engine.onPositionUpdate = (coords) => {
      this.addTrailPoint(coords);
    };

    this.render = this.render.bind(this);
    requestAnimationFrame(this.render);
  }

  initCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 420;
    const height = rect.height || 420;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);

    this.width = width;
    this.height = height;
    this.centerX = width / 2;
    this.centerY = height / 2;
    // Fit roughly 4.0 meters radius in canvas
    this.scaleFactor = (Math.min(width, height) / 2 - 35) / 3.8;
  }

  addTrailPoint(coords) {
    this.trail.push({
      x: coords.x,
      z: coords.z,
      alpha: 1.0,
      time: performance.now()
    });

    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }
  }

  initEventListeners() {
    window.addEventListener('resize', () => this.initCanvasSize());

    const getCanvasPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      // Convert to meter coordinates:
      // X: right(+), left(-)
      // Z: front(+), back(-) -> in canvas Y goes down, so Front (Z>0) is up (Y < centerY)
      const x = (mouseX - this.centerX) / this.scaleFactor;
      const z = -(mouseY - this.centerY) / this.scaleFactor;
      return { mouseX, mouseY, x, z };
    };

    const onStart = (e) => {
      const pos = getCanvasPos(e);
      const orbCoords = this.engine.currentPos;
      const orbCanvasX = this.centerX + orbCoords.x * this.scaleFactor;
      const orbCanvasY = this.centerY - orbCoords.z * this.scaleFactor;

      const distToOrb = Math.hypot(pos.mouseX - orbCanvasX, pos.mouseY - orbCanvasY);

      // If clicked near the orb or anywhere on radar with drag intention
      if (distToOrb < 40 || e.shiftKey) {
        this.isDragging = true;
        this.canvas.style.cursor = 'grabbing';
        this.engine.setManualPosition(pos.x, pos.z);
        if (e.cancelable) e.preventDefault();
      }
    };

    const onMove = (e) => {
      if (!this.isDragging) return;
      const pos = getCanvasPos(e);
      this.engine.setManualPosition(pos.x, pos.z);
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
      }
    };

    this.canvas.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    this.canvas.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    // Double click to resume auto orbit
    this.canvas.addEventListener('dblclick', () => {
      this.engine.resumeAutoOrbit();
    });
  }

  // Main Render Loop
  render(timestamp) {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Query frequency data from analyser
    let avgAudioEnergy = 0;
    if (this.engine.analyser && this.engine.isPlaying) {
      this.engine.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      for (let i = 0; i < 32; i++) sum += this.freqData[i];
      avgAudioEnergy = sum / 32 / 255; // 0.0 to 1.0
    }

    // Spawn soundwave ripples from sound source
    if (this.engine.isPlaying && avgAudioEnergy > 0.25 && timestamp - this.lastRippleTime > 280) {
      const orbCoords = this.engine.currentPos;
      this.ripples.push({
        x: this.centerX + orbCoords.x * this.scaleFactor,
        y: this.centerY - orbCoords.z * this.scaleFactor,
        radius: 8,
        maxRadius: 40 + avgAudioEnergy * 50,
        alpha: 0.8
      });
      this.lastRippleTime = timestamp;
    }

    this.drawRadarGrid();
    this.drawSpectrumRings(avgAudioEnergy);
    this.drawOrbitalPath();
    this.drawRipples();
    this.drawTrail();
    this.drawListener(avgAudioEnergy);
    this.drawSoundOrb(avgAudioEnergy);

    requestAnimationFrame(this.render);
  }

  // Draw Grid Lines and Range Circles
  drawRadarGrid() {
    const ctx = this.ctx;
    const { centerX, centerY, scaleFactor } = this;

    // Outer subtle background gradient
    const bgGrad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, scaleFactor * 3.5);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.7)');
    bgGrad.addColorStop(0.7, 'rgba(10, 15, 29, 0.85)');
    bgGrad.addColorStop(1, 'rgba(5, 8, 16, 0.95)');

    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, scaleFactor * 3.6, 0, Math.PI * 2);
    ctx.fill();

    // Range rings: 1m, 2m, 3m
    const distances = [1.0, 2.0, 3.0];
    distances.forEach((dist, idx) => {
      const r = dist * scaleFactor;
      ctx.strokeStyle = idx === 1 ? 'rgba(0, 242, 254, 0.25)' : 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.setLineDash(idx === 1 ? [4, 4] : []);
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Distance tag
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${dist.toFixed(1)}m`, centerX - r + 24, centerY - 4);
    });

    // Crosshairs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Vertical line (Front - Back)
    ctx.moveTo(centerX, centerY - scaleFactor * 3.5);
    ctx.lineTo(centerX, centerY + scaleFactor * 3.5);
    // Horizontal line (Left - Right)
    ctx.moveTo(centerX - scaleFactor * 3.5, centerY);
    ctx.lineTo(centerX + scaleFactor * 3.5, centerY);
    ctx.stroke();

    // Compass Labels
    ctx.font = 'bold 10px "Inter", monospace';
    ctx.textAlign = 'center';

    // FRONT (Z+) -> Top of canvas
    ctx.fillStyle = '#00f2fe';
    ctx.fillText('FRONT ▲', centerX, centerY - scaleFactor * 3.4);

    // BACK (Z-) -> Bottom of canvas
    ctx.fillStyle = '#9b51e0';
    ctx.fillText('▼ BACK', centerX, centerY + scaleFactor * 3.4 + 10);

    // LEFT (X-)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.textAlign = 'left';
    ctx.fillText('◄ L', centerX - scaleFactor * 3.5 + 4, centerY - 6);

    // RIGHT (X+)
    ctx.textAlign = 'right';
    ctx.fillText('R ►', centerX + scaleFactor * 3.5 - 4, centerY - 6);
  }

  // Circular audio spectrum analyzer around perimeter
  drawSpectrumRings(energy) {
    if (!this.engine.isPlaying || energy < 0.02) return;
    const ctx = this.ctx;
    const numBars = 48;
    const baseRadius = this.scaleFactor * 3.4;

    for (let i = 0; i < numBars; i++) {
      const angle = (i / numBars) * Math.PI * 2 - Math.PI / 2;
      const freqVal = (this.freqData[i % 32] || 0) / 255;
      const barHeight = freqVal * 28 * (0.8 + energy * 0.4);

      const x1 = this.centerX + Math.cos(angle) * baseRadius;
      const y1 = this.centerY + Math.sin(angle) * baseRadius;
      const x2 = this.centerX + Math.cos(angle) * (baseRadius + barHeight);
      const y2 = this.centerY + Math.sin(angle) * (baseRadius + barHeight);

      // Color from cyan to violet
      const hue = 185 + (i / numBars) * 110;
      ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${0.3 + freqVal * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // Draw Trajectory preview line based on pattern
  drawOrbitalPath() {
    const ctx = this.ctx;
    const { pattern, radius } = this.engine.settings;
    const { centerX, centerY, scaleFactor } = this;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);

    ctx.beginPath();
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (2 * Math.PI);
      let x = 0;
      let z = 0;

      switch (pattern) {
        case 'figure8':
          x = radius * Math.sin(t);
          z = radius * Math.sin(t) * Math.cos(t) * 1.5;
          break;
        case 'pendulum':
          const swing = Math.sin(t);
          x = radius * swing * 1.3;
          z = radius * Math.cos(swing * 1.2) * 0.9;
          break;
        case 'circle':
        default:
          x = radius * Math.sin(t);
          z = radius * Math.cos(t);
          break;
      }

      const canvasX = centerX + x * scaleFactor;
      const canvasY = centerY - z * scaleFactor;

      if (i === 0) ctx.moveTo(canvasX, canvasY);
      else ctx.lineTo(canvasX, canvasY);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw Audio ripples
  drawRipples() {
    const ctx = this.ctx;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rip = this.ripples[i];
      rip.radius += 1.8;
      rip.alpha -= 0.022;

      if (rip.alpha <= 0 || rip.radius > rip.maxRadius) {
        this.ripples.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.strokeStyle = `rgba(0, 242, 254, ${rip.alpha * 0.8})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw Comet trail behind the sound orb
  drawTrail() {
    if (this.trail.length < 2) return;
    const ctx = this.ctx;

    for (let i = 0; i < this.trail.length; i++) {
      const pt = this.trail[i];
      const progress = i / this.trail.length; // 0.0 (oldest) to 1.0 (newest)
      const canvasX = this.centerX + pt.x * this.scaleFactor;
      const canvasY = this.centerY - pt.z * this.scaleFactor;

      const radius = 2 + progress * 4.5;
      const alpha = progress * 0.6;

      ctx.fillStyle = `rgba(0, 242, 254, ${alpha})`;
      ctx.beginPath();
      ctx.arc(canvasX, canvasY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw central Listener avatar with glowing headphones
  drawListener(energy) {
    const ctx = this.ctx;
    const { centerX, centerY } = this;
    const headRadius = 18;

    // Glowing aura behind head
    const auraGrad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, headRadius * 2.2);
    auraGrad.addColorStop(0, `rgba(155, 81, 224, ${0.25 + energy * 0.4})`);
    auraGrad.addColorStop(1, 'rgba(155, 81, 224, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, headRadius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Head circle (top-down view)
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#9b51e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Nose / Face direction pointing FORWARD (Upward)
    ctx.fillStyle = '#9b51e0';
    ctx.beginPath();
    ctx.moveTo(centerX - 4, centerY - headRadius + 2);
    ctx.lineTo(centerX, centerY - headRadius - 6);
    ctx.lineTo(centerX + 4, centerY - headRadius + 2);
    ctx.closePath();
    ctx.fill();

    // Over-ear Headphones headband (arching over the head)
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, headRadius + 3, Math.PI * 0.95, Math.PI * 2.05);
    ctx.stroke();

    // Left Ear Cup
    const earY = centerY;
    ctx.fillStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 8;
    this.drawRoundedRect(ctx, centerX - headRadius - 7, earY - 8, 6, 16, 3);

    // Right Ear Cup
    this.drawRoundedRect(ctx, centerX + headRadius + 1, earY - 8, 6, 16, 3);
    ctx.shadowBlur = 0;

    // Center icon/text
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 9px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YOU', centerX, centerY + 1);
  }

  // Draw Orbiting Audio Source Orb
  drawSoundOrb(energy) {
    const ctx = this.ctx;
    const coords = this.engine.currentPos;
    const canvasX = this.centerX + coords.x * this.scaleFactor;
    const canvasY = this.centerY - coords.z * this.scaleFactor;

    const baseRadius = 12 + energy * 8;

    // Outer neon glow
    const glowGrad = ctx.createRadialGradient(canvasX, canvasY, 2, canvasX, canvasY, baseRadius * 3);
    glowGrad.addColorStop(0, 'rgba(0, 242, 254, 0.9)');
    glowGrad.addColorStop(0.35, 'rgba(155, 81, 224, 0.55)');
    glowGrad.addColorStop(1, 'rgba(0, 242, 254, 0)');

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, baseRadius * 3, 0, Math.PI * 2);
    ctx.fill();

    // Sound orb core
    ctx.save();
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 16 + energy * 14;

    const coreGrad = ctx.createLinearGradient(canvasX - baseRadius, canvasY - baseRadius, canvasX + baseRadius, canvasY + baseRadius);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.5, '#00f2fe');
    coreGrad.addColorStop(1, '#9b51e0');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, baseRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Speaker / soundwave icon inside orb
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('8D', canvasX, canvasY);

    // Interactive Drag Hint badge if manual
    if (this.engine.settings.isManualOrbit) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9px "Inter", monospace';
      ctx.fillText('MANUAL (DBL-CLICK TO AUTO)', canvasX, canvasY - baseRadius - 12);
    }
  }

  // Utility helper for rounded rectangle
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }
}

if (typeof window !== 'undefined') {
  window.RadarVisualizer = RadarVisualizer;
}
