/**
 * ModaUI Digital Life V3 - 3D Core WebGL Engine
 * Manages GPU buffers, true 3D transformation matrices, spatial behaviors,
 * and continuous screen-space anchor tracking between Home and Chat.
 */

import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from './coreShaders.ts';
import { generateHeadParticleSystem, ParticleSystemData } from './coreParticles.ts';

export type SpatialBehaviorType =
  | 'APPROACH'
  | 'RETREAT'
  | 'ORBIT'
  | 'DISSOLVE'
  | 'REFORM'
  | 'INTERACT';

export interface ViewportAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ModaCoreEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private particles: ParticleSystemData;

  // GPU Buffers
  private targetBuffer: WebGLBuffer | null = null;
  private dissolveBuffer: WebGLBuffer | null = null;
  private velocityBuffer: WebGLBuffer | null = null;
  private sizeBuffer: WebGLBuffer | null = null;
  private alphaBuffer: WebGLBuffer | null = null;
  private layerBuffer: WebGLBuffer | null = null;

  // Uniform locations
  private uProjectionLoc: WebGLUniformLocation | null = null;
  private uViewLoc: WebGLUniformLocation | null = null;
  private uModelLoc: WebGLUniformLocation | null = null;
  private uTimeLoc: WebGLUniformLocation | null = null;
  private uPixelRatioLoc: WebGLUniformLocation | null = null;
  private uDissolveProgressLoc: WebGLUniformLocation | null = null;
  private uActivityLevelLoc: WebGLUniformLocation | null = null;
  private uPulseLoc: WebGLUniformLocation | null = null;

  // Animation Loop & Time
  private animationFrameId: number | null = null;
  private startTime = performance.now();
  private lastTime = performance.now();
  private isRunning = false;
  private isVisible = true;

  // True 3D Spatial Transform Variables
  public rotationX = 0;
  public rotationY = 0;
  public targetRotationX = 0;
  public targetRotationY = 0;
  public modelZ = 0;
  public targetModelZ = 0;
  public scale = 1.0;
  public targetScale = 1.0;

  // Dissolve & Activity state
  public dissolveProgress = 0.0;
  public targetDissolveProgress = 0.0;
  public activityLevel = 0.2; // 0 = quiet, 1 = intense
  public targetActivityLevel = 0.2;
  public audioAmplitude = 0.0; // Audio/mic reactive

  // Viewport Anchor Interpolation (Smooth transition between Home and Chat avatar)
  public currentRect: ViewportAnchorRect = { x: 0, y: 0, width: 240, height: 240 };
  public targetRect: ViewportAnchorRect = { x: 0, y: 0, width: 240, height: 240 };
  private rectLerpFactor = 0.085;

  // Fallback 2D context if WebGL fails
  private ctx2d: CanvasRenderingContext2D | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.particles = generateHeadParticleSystem(1600);

    const gl =
      canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
      }) ||
      canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
      });

    if (gl) {
      this.gl = gl;
      this.initWebGL();
    }

    if (!this.program) {
      console.warn('[ModaCoreEngine] WebGL pipeline unavailable, falling back to 2D renderer');
      this.ctx2d = canvas.getContext('2d');
    }

    this.setupPageVisibility();
  }

  private initWebGL() {
    const gl = this.gl;
    if (!gl) return;

    // Enable standard alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Compile shaders & link program
    const vertShader = this.createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = this.createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[ModaCoreEngine] Program linking failed:', gl.getProgramInfoLog(program));
      return;
    }
    this.program = program;

    // Uniforms
    this.uProjectionLoc = gl.getUniformLocation(program, 'u_projection');
    this.uViewLoc = gl.getUniformLocation(program, 'u_view');
    this.uModelLoc = gl.getUniformLocation(program, 'u_model');
    this.uTimeLoc = gl.getUniformLocation(program, 'u_time');
    this.uPixelRatioLoc = gl.getUniformLocation(program, 'u_pixelRatio');
    this.uDissolveProgressLoc = gl.getUniformLocation(program, 'u_dissolveProgress');
    this.uActivityLevelLoc = gl.getUniformLocation(program, 'u_activityLevel');
    this.uPulseLoc = gl.getUniformLocation(program, 'u_pulse');

    // Create GPU VBOs
    this.targetBuffer = this.createBuffer(gl, this.particles.targetPositions);
    this.dissolveBuffer = this.createBuffer(gl, this.particles.dissolvePositions);
    this.velocityBuffer = this.createBuffer(gl, this.particles.velocities);
    this.sizeBuffer = this.createBuffer(gl, this.particles.sizes);
    this.alphaBuffer = this.createBuffer(gl, this.particles.alphas);
    this.layerBuffer = this.createBuffer(gl, this.particles.layers);
  }

  private createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[ModaCoreEngine] Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createBuffer(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer | null {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  }

  private setupPageVisibility() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isVisible = document.visibilityState === 'visible';
      });
    }
  }

  // -------------------------------------------------------------
  // Public Spatial Behaviors & Interactive Controls
  // -------------------------------------------------------------

  public approach(depth = 0.6) {
    this.targetModelZ = Math.min(1.4, this.targetModelZ + depth);
  }

  public retreat(depth = -0.6) {
    this.targetModelZ = Math.max(-1.5, this.targetModelZ + depth);
  }

  public orbit(deltaYaw = 0.05, deltaPitch = 0.0) {
    this.targetRotationY += deltaYaw;
    this.targetRotationX = Math.max(-0.6, Math.min(0.6, this.targetRotationX + deltaPitch));
  }

  public dissolve(intensity = 0.8) {
    this.targetDissolveProgress = intensity;
    this.targetActivityLevel = 0.85;
  }

  public reform() {
    this.targetDissolveProgress = 0.0;
    this.targetActivityLevel = 0.25;
  }

  public pulseRipple() {
    this.dissolve(0.6);
    setTimeout(() => {
      this.reform();
    }, 700);
  }

  public interact(normalizedX: number, normalizedY: number) {
    // Parallax tracking: face naturally follows cursor (-0.45 to +0.45 rad)
    this.targetRotationY = normalizedX * 0.45;
    this.targetRotationX = -normalizedY * 0.32;
  }

  public setActivity(level: number) {
    this.targetActivityLevel = Math.max(0.1, Math.min(1.5, level));
  }

  public setAudioAmplitude(amplitude: number) {
    this.audioAmplitude = amplitude;
  }

  public setAnchorTarget(rect: ViewportAnchorRect, immediate = false) {
    this.targetRect = { ...rect };
    if (immediate || (this.currentRect.x === 0 && this.currentRect.y === 0) || (this.currentRect.width <= 10 && this.currentRect.height <= 10)) {
      this.currentRect = { ...rect };
    }
  }

  // -------------------------------------------------------------
  // Animation & Render Cycle
  // -------------------------------------------------------------

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = performance.now();
    this.lastTime = performance.now();
    this.loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public destroy() {
    this.stop();
    const gl = this.gl;
    if (gl) {
      if (this.targetBuffer) gl.deleteBuffer(this.targetBuffer);
      if (this.dissolveBuffer) gl.deleteBuffer(this.dissolveBuffer);
      if (this.velocityBuffer) gl.deleteBuffer(this.velocityBuffer);
      if (this.sizeBuffer) gl.deleteBuffer(this.sizeBuffer);
      if (this.alphaBuffer) gl.deleteBuffer(this.alphaBuffer);
      if (this.layerBuffer) gl.deleteBuffer(this.layerBuffer);
      if (this.program) gl.deleteProgram(this.program);
    }
  }

  public handleContextLost(e: Event) {
    e.preventDefault();
    this.stop();
  }

  public handleContextRestored() {
    this.initWebGL();
    this.start();
  }

  private loop = () => {
    if (!this.isRunning) return;

    if (this.isVisible) {
      this.updatePhysics();
      this.render();
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private updatePhysics() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // Smooth Rect Interpolation across viewport (Gliding animation between home & chat)
    const lerpSpeed = this.rectLerpFactor;
    this.currentRect.x += (this.targetRect.x - this.currentRect.x) * lerpSpeed;
    this.currentRect.y += (this.targetRect.y - this.currentRect.y) * lerpSpeed;
    this.currentRect.width += (this.targetRect.width - this.currentRect.width) * lerpSpeed;
    this.currentRect.height += (this.targetRect.height - this.currentRect.height) * lerpSpeed;

    // Smooth 3D transforms
    this.rotationX += (this.targetRotationX - this.rotationX) * 0.1;
    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;
    this.modelZ += (this.targetModelZ - this.modelZ) * 0.08;
    this.scale += (this.targetScale - this.scale) * 0.1;

    // Smooth dissolve & activity
    this.dissolveProgress += (this.targetDissolveProgress - this.dissolveProgress) * 0.06;
    this.activityLevel += (this.targetActivityLevel - this.activityLevel) * 0.08;

    // Natural idle organic breathing & slow drifting
    const timeSec = (now - this.startTime) / 1000;
    const idleYawDrift = Math.sin(timeSec * 0.5) * 0.15;
    const idlePitchDrift = Math.cos(timeSec * 0.4) * 0.06;

    this.rotationY += idleYawDrift * 0.008;
    this.rotationX += idlePitchDrift * 0.008;
  }

  private render() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = this.canvas;

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    if (this.gl && this.program) {
      this.renderWebGL(dpr, width, height);
    } else if (this.ctx2d) {
      this.render2DFallback(dpr, width, height);
    }
  }

  private renderWebGL(dpr: number, canvasWidth: number, canvasHeight: number) {
    const gl = this.gl!;
    const program = this.program!;

    gl.useProgram(program);

    // Full screen canvas rendering without harsh scissor clipping
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, Math.round(canvasWidth * dpr), Math.round(canvasHeight * dpr));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const now = (performance.now() - this.startTime) / 1000;

    // Set Uniforms
    gl.uniform1f(this.uTimeLoc, now);
    gl.uniform1f(this.uPixelRatioLoc, dpr);
    gl.uniform1f(this.uDissolveProgressLoc, this.dissolveProgress);
    gl.uniform1f(this.uActivityLevelLoc, this.activityLevel + this.audioAmplitude * 0.8);
    gl.uniform1f(this.uPulseLoc, Math.sin(now * 3.0));

    // Perspective Projection Matrix
    const aspect = canvasWidth / Math.max(canvasHeight, 1);
    const fovY = 45 * (Math.PI / 180);
    const camDist = 3.2;
    const projMat = this.createPerspectiveMatrix(fovY, aspect, 0.1, 100.0);
    const viewMat = this.createLookAtMatrix([0, 0, camDist], [0, 0, 0], [0, 1, 0]);

    // Calculate world translation to precisely center over anchor element
    const visibleHalfHeight = Math.tan(fovY / 2) * camDist;
    const visibleHalfWidth = visibleHalfHeight * aspect;

    let cx = this.currentRect.x + this.currentRect.width / 2;
    let cy = this.currentRect.y + this.currentRect.height / 2;

    if (this.currentRect.width <= 10 || this.currentRect.height <= 10) {
      cx = canvasWidth * 0.5;
      cy = canvasHeight * 0.32;
    }

    const ndcX = (cx / canvasWidth) * 2.0 - 1.0;
    const ndcY = 1.0 - (cy / canvasHeight) * 2.0;

    const worldX = ndcX * visibleHalfWidth;
    const worldY = ndcY * visibleHalfHeight;

    // Calculate scale relative to anchor size
    const anchorSize = Math.max(160, Math.min(320, this.currentRect.width || 240));
    const sizeScale = (anchorSize / 240) * 0.95;

    // Model matrix: translation, rotation, scale
    const modelMat = this.createModelMatrix(
      worldX,
      worldY,
      this.modelZ,
      this.rotationX,
      this.rotationY,
      0,
      this.scale * sizeScale * (1.0 + this.audioAmplitude * 0.12)
    );

    gl.uniformMatrix4fv(this.uProjectionLoc, false, projMat);
    gl.uniformMatrix4fv(this.uViewLoc, false, viewMat);
    gl.uniformMatrix4fv(this.uModelLoc, false, modelMat);

    // Bind Attributes
    this.bindAttribute(gl, program, 'a_targetPosition', this.targetBuffer, 3);
    this.bindAttribute(gl, program, 'a_dissolvePosition', this.dissolveBuffer, 3);
    this.bindAttribute(gl, program, 'a_velocity', this.velocityBuffer, 3);
    this.bindAttribute(gl, program, 'a_size', this.sizeBuffer, 1);
    this.bindAttribute(gl, program, 'a_alpha', this.alphaBuffer, 1);
    this.bindAttribute(gl, program, 'a_layer', this.layerBuffer, 1);

    // Draw 3D particle array
    gl.drawArrays(gl.POINTS, 0, this.particles.count);
  }

  private bindAttribute(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    name: string,
    buffer: WebGLBuffer | null,
    size: number
  ) {
    if (!buffer) return;
    const loc = gl.getAttribLocation(program, name);
    if (loc === -1) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  // -------------------------------------------------------------
  // Mathematical 3D Transformation Matrices
  // -------------------------------------------------------------

  private createPerspectiveMatrix(fovy: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }

  private createLookAtMatrix(eye: number[], center: number[], up: number[]): Float32Array {
    const out = new Float32Array(16);
    let z0 = eye[0] - center[0];
    let z1 = eye[1] - center[1];
    let z2 = eye[2] - center[2];
    let len = 1 / Math.hypot(z0, z1, z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    let x0 = up[1] * z2 - up[2] * z1;
    let x1 = up[2] * z0 - up[0] * z2;
    let x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2);
    if (len) {
      len = 1 / len;
      x0 *= len;
      x1 *= len;
      x2 *= len;
    }

    let y0 = z1 * x2 - z2 * x1;
    let y1 = z2 * x0 - z0 * x2;
    let y2 = z0 * x1 - z1 * x0;

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    out[15] = 1;
    return out;
  }

  private createModelMatrix(
    tx: number,
    ty: number,
    tz: number,
    rx: number,
    ry: number,
    rz: number,
    s: number
  ): Float32Array {
    const out = new Float32Array(16);
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const cosZ = Math.cos(rz);
    const sinZ = Math.sin(rz);

    out[0] = (cosY * cosZ) * s;
    out[1] = (cosX * sinZ + sinX * sinY * cosZ) * s;
    out[2] = (sinX * sinZ - cosX * sinY * cosZ) * s;
    out[3] = 0;

    out[4] = (-cosY * sinZ) * s;
    out[5] = (cosX * cosZ - sinX * sinY * sinZ) * s;
    out[6] = (sinX * cosZ + cosX * sinY * sinZ) * s;
    out[7] = 0;

    out[8] = sinY * s;
    out[9] = -sinX * cosY * s;
    out[10] = cosX * cosY * s;
    out[11] = 0;

    out[12] = tx;
    out[13] = ty;
    out[14] = tz;
    out[15] = 1;
    return out;
  }

  // -------------------------------------------------------------
  // 2D Projected Canvas Fallback (Infallible safety net)
  // -------------------------------------------------------------
  private render2DFallback(dpr: number, w: number, h: number) {
    const ctx = this.ctx2d!;
    ctx.clearRect(0, 0, w * dpr, h * dpr);

    let cx = this.currentRect.x + this.currentRect.width / 2;
    let cy = this.currentRect.y + this.currentRect.height / 2;

    if (this.currentRect.width <= 10 || this.currentRect.height <= 10) {
      cx = w * 0.5;
      cy = h * 0.32;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(cx, cy);

    const fov = 160 * this.scale;
    const cosY = Math.cos(this.rotationY);
    const sinY = Math.sin(this.rotationY);
    const cosX = Math.cos(this.rotationX);
    const sinX = Math.sin(this.rotationX);

    for (let i = 0; i < this.particles.count; i++) {
      const tx = this.particles.targetPositions[i * 3];
      const ty = this.particles.targetPositions[i * 3 + 1];
      const tz = this.particles.targetPositions[i * 3 + 2];

      // Rotate Y
      const x1 = tx * cosY + tz * sinY;
      const z1 = -tx * sinY + tz * cosY;

      // Rotate X
      const y2 = ty * cosX - z1 * sinX;
      const z2 = ty * sinX + z1 * cosX + 3.2 - this.modelZ;
      if (z2 <= 0.1) continue;

      const px = (x1 / z2) * fov;
      const py = (-y2 / z2) * fov;
      const sz = Math.max(1, (this.particles.sizes[i] * 18) / z2);
      const alpha = Math.max(0.1, Math.min(1.0, this.particles.alphas[i] * (1.2 - z2 / 4.5)));

      const isCore = this.particles.layers[i] < 0.5;
      const isThinking = isCore && this.activityLevel > 0.3;

      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fillStyle = isThinking
        ? `rgba(0, 210, 255, ${alpha * 0.9})`
        : `rgba(18, 24, 38, ${alpha * 0.85})`;
      ctx.fill();
    }

    ctx.restore();
  }
}
