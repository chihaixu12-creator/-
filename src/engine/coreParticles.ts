/**
 * ModaUI Digital Life V3 - 3D Particle Data & Head Geometry Generator
 * Generates true 3D coordinates, velocities, layers, and dissolve/reform targets
 * for haute-couture digital human life.
 */

export interface ParticleSystemData {
  count: number;
  targetPositions: Float32Array;
  dissolvePositions: Float32Array;
  velocities: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
  layers: Float32Array;
}

/**
 * Procedurally generates a refined haute-couture 3D digital life human head.
 * Incorporates cranial dome, jaw contour, cheekbones, brow ridge, and neural core.
 */
export function generateHeadParticleSystem(totalParticles = 1600): ParticleSystemData {
  const count = totalParticles;
  const targetPositions = new Float32Array(count * 3);
  const dissolvePositions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const layers = new Float32Array(count);

  let p = 0;

  // 1. Neural Core (Inner swirling consciousness sphere, ~25% of particles)
  const coreCount = Math.floor(count * 0.25);
  for (let i = 0; i < coreCount && p < count; i++, p++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = Math.cbrt(Math.random()) * 0.42; // inner core radius

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta) + 0.12; // centered in upper cranium
    const z = r * Math.cos(phi);

    targetPositions[p * 3] = x;
    targetPositions[p * 3 + 1] = y;
    targetPositions[p * 3 + 2] = z;

    sizes[p] = 2.4 + Math.random() * 1.6;
    alphas[p] = 0.88 + Math.random() * 0.12;
    layers[p] = 0.0; // Core

    // Velocity for natural micro-circulation
    velocities[p * 3] = -z * 0.5;
    velocities[p * 3 + 1] = (Math.random() - 0.5) * 0.2;
    velocities[p * 3 + 2] = x * 0.5;
  }

  // 2. Cranial Dome & Head Silhouette (~50% of particles)
  const headCount = Math.floor(count * 0.5);
  for (let i = 0; i < headCount && p < count; i++, p++) {
    const lat = (Math.random() - 0.5) * Math.PI * 0.88; // latitude
    const lon = Math.random() * Math.PI * 2.0;         // longitude

    // Head proportions: elegant slender high-fashion silhouette
    const rx = 0.72;
    const ry = 1.02;
    const rz = 0.85;

    let x = rx * Math.cos(lat) * Math.cos(lon);
    let y = ry * Math.sin(lat);
    let z = rz * Math.cos(lat) * Math.sin(lon);

    // Jaw taper: if y < 0, pull inwards toward defined chin
    if (y < 0) {
      const taper = 1.0 - Math.pow(Math.abs(y) / ry, 1.3) * 0.48;
      x *= taper;
      z *= taper;
      z += Math.abs(y) * 0.14;
    }

    // Forehead subtle prominence (y > 0.2 and z > 0)
    if (y > 0.18 && z > 0) {
      z += 0.06 * Math.sin((y - 0.18) * 3.2);
    }

    // Subtle surface jitter for organic point cloud feel
    const jitter = 0.035 * (Math.random() - 0.5);
    x += jitter;
    y += jitter;
    z += jitter;

    targetPositions[p * 3] = x;
    targetPositions[p * 3 + 1] = y;
    targetPositions[p * 3 + 2] = z;

    sizes[p] = 1.8 + Math.random() * 1.3;
    alphas[p] = 0.78 + Math.random() * 0.22;
    layers[p] = 1.0; // Contour

    velocities[p * 3] = (Math.random() - 0.5) * 0.1;
    velocities[p * 3 + 1] = (Math.random() - 0.5) * 0.1;
    velocities[p * 3 + 2] = (Math.random() - 0.5) * 0.1;
  }

  // 3. Facial Feature Accent Lines (Brow ridge, eye orbits, nose bridge, lips ~15%)
  const featureCount = Math.floor(count * 0.15);
  for (let i = 0; i < featureCount && p < count; i++, p++) {
    const subType = Math.random();
    let x = 0;
    let y = 0;
    let z = 0;

    if (subType < 0.28) {
      // Brow ridge
      const t = (Math.random() - 0.5) * 0.82;
      x = t * 0.72;
      y = 0.24 - Math.pow(t, 2.0) * 0.09;
      z = 0.76 + Math.random() * 0.04;
    } else if (subType < 0.56) {
      // Nose bridge and sculpted tip
      const t = Math.random();
      x = (Math.random() - 0.5) * 0.07 * (1.0 + t);
      y = 0.22 - t * 0.42;
      z = 0.78 + t * 0.18 + (Math.random() - 0.5) * 0.025;
    } else if (subType < 0.82) {
      // Eye orbits
      const side = Math.random() > 0.5 ? 1 : -1;
      const angle = Math.random() * Math.PI * 2.0;
      const r = 0.11 + Math.random() * 0.04;
      x = side * 0.28 + Math.cos(angle) * r;
      y = 0.14 + Math.sin(angle) * r * 0.65;
      z = 0.72 + (Math.random() - 0.5) * 0.02;
    } else {
      // Lip contour
      const t = (Math.random() - 0.5) * 0.42;
      x = t;
      y = -0.34 - Math.pow(t, 2.0) * 0.1;
      z = 0.74 + Math.random() * 0.03;
    }

    targetPositions[p * 3] = x;
    targetPositions[p * 3 + 1] = y;
    targetPositions[p * 3 + 2] = z;

    sizes[p] = 2.0 + Math.random() * 1.2;
    alphas[p] = 0.92;
    layers[p] = 1.0; // Contour

    velocities[p * 3] = (Math.random() - 0.5) * 0.05;
    velocities[p * 3 + 1] = (Math.random() - 0.5) * 0.05;
    velocities[p * 3 + 2] = (Math.random() - 0.5) * 0.05;
  }

  // 4. Orbital Halo & Atmospheric Dust Particles (Remaining particles ~10%)
  while (p < count) {
    const angle = Math.random() * Math.PI * 2.0;
    const dist = 1.05 + Math.random() * 0.95;
    const yOff = (Math.random() - 0.5) * 1.7;

    targetPositions[p * 3] = Math.cos(angle) * dist;
    targetPositions[p * 3 + 1] = yOff;
    targetPositions[p * 3 + 2] = Math.sin(angle) * dist;

    sizes[p] = 1.3 + Math.random() * 1.5;
    alphas[p] = 0.40 + Math.random() * 0.4;
    layers[p] = 2.0; // Aura/Orbit

    velocities[p * 3] = -Math.sin(angle) * 0.3;
    velocities[p * 3 + 1] = (Math.random() - 0.5) * 0.1;
    velocities[p * 3 + 2] = Math.cos(angle) * 0.3;

    p++;
  }

  // Generate Dissolve Positions (Spherical turbulent nebula cloud)
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    // Expand to 2.5x - 4.5x radius cloud
    const r = 2.2 + Math.pow(Math.random(), 1.5) * 3.8;

    dissolvePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dissolvePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    dissolvePositions[i * 3 + 2] = r * Math.cos(phi);
  }

  return {
    count,
    targetPositions,
    dissolvePositions,
    velocities,
    sizes,
    alphas,
    layers,
  };
}
