"use client";

import React, {
  useMemo,
  useRef,
  useEffect,
} from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import "./NeuralLifeform.css";

const CELL_COUNT = 450;
const PARTICLE_COUNT = 900;

// Base activity energy targets for distinct states
const ACTIVITY_TARGETS = {
  idle: { energy: 0.28, aggregation: 0.0, dispersion: 0.0, pulseSpeed: 1.2 },
  listening: { energy: 0.65, aggregation: 0.15, dispersion: 0.05, pulseSpeed: 2.0 },
  thinking: { energy: 1.0, aggregation: 0.85, dispersion: 0.0, pulseSpeed: 4.5 },
  responding: { energy: 0.82, aggregation: 0.0, dispersion: 0.75, pulseSpeed: 2.8 },
};

function random01(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Non-linear easing utilities
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuint(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function smoothHermite(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function createCells() {
  const cells = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < CELL_COUNT; i++) {
    const y = 1 - (i / (CELL_COUNT - 1)) * 2;
    const ring = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    const jitter = 0.88 + random01(i + 5) * 0.22;

    const x = Math.cos(theta) * ring * jitter;
    const yPos = y * jitter;
    const z = Math.sin(theta) * ring * jitter;
    const radius = Math.sqrt(x * x + yPos * yPos + z * z);

    cells.push({
      x,
      y: yPos,
      z,
      baseRadius: radius,
      theta: Math.atan2(z, x),
      phi: Math.acos(yPos / (radius || 1)),
      size: 0.032 + random01(i + 20) * 0.048,
      phase: random01(i + 50) * Math.PI * 2,
      orbitSpeed: (0.4 + random01(i + 80) * 0.6) * (random01(i + 90) > 0.5 ? 1 : -1),
      isCore: radius < 0.72,
    });
  }

  return cells;
}

function createEdges(cells) {
  const edges = [];
  const seen = new Set();

  for (let i = 0; i < cells.length; i++) {
    const nearest = [];
    const a = cells[i];

    for (let j = 0; j < cells.length; j++) {
      if (i === j) continue;
      const b = cells[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;

      nearest.push({
        index: j,
        distance: dx * dx + dy * dy + dz * dz,
      });
    }

    nearest.sort((a, b) => a.distance - b.distance);

    for (const neighbor of nearest.slice(0, 3)) {
      const aIdx = Math.min(i, neighbor.index);
      const bIdx = Math.max(i, neighbor.index);
      const key = `${aIdx}-${bIdx}`;

      if (!seen.has(key)) {
        seen.add(key);
        edges.push([aIdx, bIdx]);
      }
    }
  }

  return edges;
}

function NeuralBody({ activity, onActivity }) {
  const cellsRef = useRef();
  const linesRef = useRef();
  const particlesRef = useRef();
  const hitAreaRef = useRef();

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Dynamic state machine & non-linear transition interpolation registers
  const impulse = useRef(0);
  const pointer = useRef(new THREE.Vector3(0, 0, 0));
  const pointerActive = useRef(false);

  // Non-linear physical state variables
  const currentEnergy = useRef(0.28);
  const currentAggregation = useRef(0.0);
  const currentDispersion = useRef(0.0);
  const currentPulseSpeed = useRef(1.2);
  const transitionTime = useRef(0);
  const lastState = useRef(activity);

  // Rotation with inertia
  const targetRotation = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });

  const cells = useMemo(() => createCells(), []);
  const edges = useMemo(() => createEdges(cells), [cells]);

  const positions = useMemo(() => new Float32Array(CELL_COUNT * 3), []);

  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3)
    );
    return geometry;
  }, [edges]);

  const particleData = useMemo(() => {
    const base = new Float32Array(PARTICLE_COUNT * 3);
    const angles = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const yOffsets = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = random01(i + 1000) * 2 - 1;
      const angle = random01(i + 2000) * Math.PI * 2;
      const radius = Math.cbrt(random01(i + 3000)) * 0.88;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));

      base[i * 3] = Math.cos(angle) * ring * radius;
      base[i * 3 + 1] = y * radius;
      base[i * 3 + 2] = Math.sin(angle) * ring * radius;

      angles[i] = angle;
      radii[i] = radius;
      yOffsets[i] = y * radius;
      speeds[i] = 0.5 + random01(i + 3500) * 1.5;
      phases[i] = random01(i + 4000) * Math.PI * 2;
    }

    return { base, angles, radii, yOffsets, speeds, phases };
  }, []);

  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3)
    );
    return geometry;
  }, []);

  // On state switch: trigger non-linear impulse and reset transition timer
  useEffect(() => {
    if (activity !== lastState.current) {
      // Trigger non-linear state surge
      impulse.current = 1.0;
      transitionTime.current = 0.0;
      lastState.current = activity;
    }
  }, [activity]);

  useEffect(() => {
    return () => {
      lineGeometry.dispose();
      particleGeometry.dispose();
    };
  }, [lineGeometry, particleGeometry]);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    transitionTime.current += dt;

    // Get target settings from current AI state
    const targets = ACTIVITY_TARGETS[activity] ?? ACTIVITY_TARGETS.idle;

    // Non-linear smooth damping for state parameters (asymmetric ease: faster acceleration, smoother settling)
    const dampAccel = activity === "thinking" ? 4.5 : activity === "responding" ? 3.8 : 2.0;

    currentEnergy.current = THREE.MathUtils.damp(
      currentEnergy.current,
      targets.energy,
      dampAccel,
      dt
    );

    currentAggregation.current = THREE.MathUtils.damp(
      currentAggregation.current,
      targets.aggregation,
      activity === "thinking" ? 5.2 : 2.5,
      dt
    );

    currentDispersion.current = THREE.MathUtils.damp(
      currentDispersion.current,
      targets.dispersion,
      activity === "responding" ? 4.8 : 2.8,
      dt
    );

    currentPulseSpeed.current = THREE.MathUtils.damp(
      currentPulseSpeed.current,
      targets.pulseSpeed,
      3.0,
      dt
    );

    // Exponential decay of instantaneous click / interaction impulse
    impulse.current = THREE.MathUtils.damp(impulse.current, 0, 3.2, dt);

    const energy = currentEnergy.current;
    const agg = currentAggregation.current;
    const disp = currentDispersion.current;
    const burst = impulse.current;
    const pulseSpeed = currentPulseSpeed.current;

    // Non-linear breathing & harmonic expansion
    const baseBreath =
      1 +
      Math.sin(time * pulseSpeed) * 0.038 * (1 + energy * 0.5) +
      Math.sin(time * (pulseSpeed * 0.38)) * 0.02;

    // Thinking state: Centripetal core pull with high-frequency cognitive flutter
    const thinkingVortex =
      activity === "thinking"
        ? Math.sin(time * 8.5) * 0.025 * agg
        : 0;

    // Responding state: Harmonically undulating outward bloom waves
    const respondingBloom =
      activity === "responding"
        ? Math.sin(time * 3.5) * 0.045 * disp
        : 0;

    // Smooth mouse parallax & drag rotation
    currentRotation.current.x += (targetRotation.current.x - currentRotation.current.x) * 0.08;
    currentRotation.current.y += (targetRotation.current.y - currentRotation.current.y) * 0.08;

    if (cellsRef.current) {
      cellsRef.current.rotation.y = currentRotation.current.y + time * 0.06 * (1 + energy * 0.8);
      cellsRef.current.rotation.x = currentRotation.current.x + Math.sin(time * 0.3) * 0.045;
      cellsRef.current.rotation.z = Math.cos(time * 0.25) * 0.03;

      // Collective non-linear scale modulation:
      // In thinking: core tightens (aggregation), in responding: blooms outward
      const collectiveScale =
        baseBreath * (1.0 - agg * 0.12 + disp * 0.09) + burst * 0.06;

      cellsRef.current.scale.set(collectiveScale, collectiveScale, collectiveScale);
    }

    // -------------------------------------------------------------
    // Cell Simulation: Non-linear Organic Aggregation & Dispersion
    // -------------------------------------------------------------
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const offset = i * 3;

      // 1. Non-linear radial condensation (Thinking centripetal pull)
      // Inner cells collapse tighter, outer cells pull inwards along a cubic gradient
      const normRadius = cell.baseRadius; // ~0.0 to 1.1
      const radialPull =
        agg * Math.pow(Math.max(0, 1.25 - normRadius), 1.6) * 0.32;

      // 2. Non-linear radial dispersion (Responding outward bloom wave)
      const radialPush =
        disp *
        (0.24 + Math.sin(time * 4.0 - normRadius * 4.2 + cell.phase) * 0.14) *
        smoothHermite(normRadius);

      // 3. Collective breathing wave + shockwave burst
      const cellWave =
        Math.sin(time * pulseSpeed + cell.phase) * 0.024 * (1 + energy * 0.6) +
        thinkingVortex;

      const radialFactor = Math.max(
        0.35,
        1.0 - radialPull + radialPush + cellWave + burst * 0.08
      );

      // Tangential orbital drift (Vortex rotation speed increases during thinking)
      const vortexAngle =
        time * 0.15 * cell.orbitSpeed * (1.0 + agg * 2.2 + disp * 0.8);
      const cosV = Math.cos(vortexAngle);
      const sinV = Math.sin(vortexAngle);

      let x = (cell.x * cosV - cell.z * sinV) * radialFactor;
      let y = cell.y * radialFactor;
      let z = (cell.x * sinV + cell.z * cosV) * radialFactor;

      // Pointer reactive micro-distortion
      if (pointerActive.current) {
        const dx = x - pointer.current.x;
        const dy = y - pointer.current.y;
        const dz = z - pointer.current.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 0.64) {
          const force = (1.0 - distSq / 0.64) * 0.12;
          x += dx * force;
          y += dy * force;
          z += dz * force;
        }
      }

      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;

      dummy.position.set(x, y, z);

      // Non-linear cellular size pulsing:
      // Inner core cells flare brightly and expand in thinking; outer cells shimmer in responding
      const coreExcitation = cell.isCore ? 1.0 + agg * 0.45 : 1.0;
      const pulseSize =
        cell.size *
        coreExcitation *
        (1.0 +
          Math.sin(time * pulseSpeed * 1.5 + cell.phase) * (0.12 + energy * 0.15) +
          burst * 0.25);

      dummy.scale.setScalar(Math.max(0.015, pulseSize));
      dummy.rotation.set(
        cell.phase + time * 0.05,
        cell.phase * 0.8 + time * 0.03,
        time * 0.04
      );

      dummy.updateMatrix();

      if (cellsRef.current) {
        cellsRef.current.setMatrixAt(i, dummy.matrix);
      }
    }

    if (cellsRef.current) {
      cellsRef.current.instanceMatrix.needsUpdate = true;
    }

    // -------------------------------------------------------------
    // Synaptic Neural Connections & Traveling Impulses
    // -------------------------------------------------------------
    const lineAttribute = lineGeometry.getAttribute("position");
    const colorAttribute = lineGeometry.getAttribute("color");
    const linePositions = lineAttribute.array;
    const lineColors = colorAttribute.array;

    // Color definitions for synaptic lines
    const isThinking = activity === "thinking";
    const isResponding = activity === "responding";

    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      const aOffset = a * 3;
      const bOffset = b * 3;
      const lineOffset = i * 6;

      const ax = positions[aOffset];
      const ay = positions[aOffset + 1];
      const az = positions[aOffset + 2];

      const bx = positions[bOffset];
      const by = positions[bOffset + 1];
      const bz = positions[bOffset + 2];

      linePositions[lineOffset] = ax;
      linePositions[lineOffset + 1] = ay;
      linePositions[lineOffset + 2] = az;

      linePositions[lineOffset + 3] = bx;
      linePositions[lineOffset + 4] = by;
      linePositions[lineOffset + 5] = bz;

      // Synaptic pulse intensity moving along edges
      const edgeDist = Math.hypot(ax - bx, ay - by, az - bz);
      const edgePhase = (ax + ay + az) * 2.0;
      const pulse = Math.sin(time * (pulseSpeed * 2.2) - edgePhase);

      // Line color tinting based on state
      let r = 0.65;
      let g = 0.72;
      let bCol = 0.82;

      if (isThinking) {
        // Vibrant electric cyan thinking surge
        r = 0.05 + Math.max(0, pulse) * 0.25;
        g = 0.75 + Math.max(0, pulse) * 0.25;
        bCol = 0.95;
      } else if (isResponding) {
        // Radiant emerald/mint responding harmony
        r = 0.12;
        g = 0.85 + Math.max(0, pulse) * 0.15;
        bCol = 0.65 + Math.max(0, pulse) * 0.35;
      }

      const alphaIntensity = THREE.MathUtils.clamp(
        (1.0 - edgeDist / 1.5) * (0.4 + energy * 0.6 + burst * 0.4),
        0.1,
        1.0
      );

      lineColors[lineOffset] = r * alphaIntensity;
      lineColors[lineOffset + 1] = g * alphaIntensity;
      lineColors[lineOffset + 2] = bCol * alphaIntensity;

      lineColors[lineOffset + 3] = r * alphaIntensity;
      lineColors[lineOffset + 4] = g * alphaIntensity;
      lineColors[lineOffset + 5] = bCol * alphaIntensity;
    }

    lineAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    lineGeometry.computeBoundingSphere();

    // -------------------------------------------------------------
    // Internal Particles: Swirling Gravitational Field Dynamics
    // -------------------------------------------------------------
    const particleAttribute = particleGeometry.getAttribute("position");
    const particleColorAttribute = particleGeometry.getAttribute("color");
    const particlePositions = particleAttribute.array;
    const particleColors = particleColorAttribute.array;
    const { angles, radii, yOffsets, speeds, phases } = particleData;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const offset = i * 3;
      const phase = phases[i];
      const baseRadius = radii[i];
      const baseSpeed = speeds[i];

      // Non-linear particle orbital dynamics:
      // In thinking: particles accelerate tangentially and collapse inwards into a swirling vortex
      // In responding: particles spiral outward in fluid radial streams
      const vortexSpeed = baseSpeed * (1.0 + agg * 2.6 + disp * 1.2);
      const curAngle = angles[i] + time * 0.45 * vortexSpeed;

      // Dynamic radius with inward collapse or outward stream
      const partRadialFactor = Math.max(
        0.18,
        1.0 - agg * 0.42 * (1.1 - baseRadius) + disp * 0.35 * Math.sin(time * 3.0 + phase)
      );

      const r = baseRadius * partRadialFactor;
      const yWobble = Math.sin(time * pulseSpeed * 0.8 + phase) * 0.04 * (1 + energy * 0.5);

      particlePositions[offset] = Math.cos(curAngle) * r;
      particlePositions[offset + 1] = yOffsets[i] * partRadialFactor + yWobble;
      particlePositions[offset + 2] = Math.sin(curAngle) * r;

      // Particle colors: cyan in thinking, mint in responding, pearl slate in idle
      if (isThinking) {
        particleColors[offset] = 0.05;
        particleColors[offset + 1] = 0.82;
        particleColors[offset + 2] = 1.0;
      } else if (isResponding) {
        particleColors[offset] = 0.2;
        particleColors[offset + 1] = 0.92;
        particleColors[offset + 2] = 0.72;
      } else {
        particleColors[offset] = 0.78;
        particleColors[offset + 1] = 0.84;
        particleColors[offset + 2] = 0.95;
      }
    }

    particleAttribute.needsUpdate = true;
    particleColorAttribute.needsUpdate = true;

    // Pulse the network opacity with non-linear activity
    if (linesRef.current) {
      linesRef.current.material.opacity =
        0.22 + energy * 0.38 + agg * 0.25 + burst * 0.28;
    }

    if (particlesRef.current) {
      particlesRef.current.material.opacity =
        0.32 + energy * 0.42 + burst * 0.25;
    }
  });

  // Direct Gestures: Pointer Drag, Hover, Click
  const handlePointerDown = (event) => {
    event.stopPropagation();
    isDragging.current = true;
    prevMouse.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event) => {
    pointer.current.copy(event.point);
    pointerActive.current = true;

    if (isDragging.current) {
      const dx = event.clientX - prevMouse.current.x;
      const dy = event.clientY - prevMouse.current.y;
      prevMouse.current = { x: event.clientX, y: event.clientY };

      targetRotation.current.y += dx * 0.008;
      targetRotation.current.x += dy * 0.006;
    }
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleClick = (event) => {
    event.stopPropagation();
    impulse.current = 1.2; // Trigger non-linear shockwave
    onActivity?.("interaction");
  };

  return (
    <group
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      {/* 1. Fine neural synaptic connections with per-vertex colors */}
      <lineSegments ref={linesRef} geometry={lineGeometry}>
        <lineBasicMaterial
          vertexColors={true}
          transparent
          opacity={0.35}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {/* 2. Individual translucent cellular spheres */}
      <instancedMesh
        ref={cellsRef}
        args={[undefined, undefined, CELL_COUNT]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 14, 12]} />
        <meshPhysicalMaterial
          color="#94a3b8"
          roughness={0.2}
          metalness={0.15}
          transmission={0.35}
          thickness={0.6}
          transparent
          opacity={0.82}
          depthWrite={false}
          clearcoat={0.8}
          clearcoatRoughness={0.15}
          reflectivity={0.7}
        />
      </instancedMesh>

      {/* 3. Internal drifting & swirling neural particles */}
      <points ref={particlesRef} geometry={particleGeometry}>
        <pointsMaterial
          size={0.016}
          vertexColors={true}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {/* 4. Soft internal consciousness glow */}
      <pointLight
        color={activity === "thinking" ? "#00D2FF" : activity === "responding" ? "#10B981" : "#A5B4FC"}
        intensity={activity === "thinking" ? 4.2 : activity === "responding" ? 3.0 : 1.4}
        distance={3.4}
      />

      {/* 5. Invisible interaction sphere */}
      <mesh
        ref={hitAreaRef}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onPointerOver={() => {
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          pointerActive.current = false;
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[1.4, 24, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function NeuralLifeform({
  activity = "idle",
  onActivity,
  className = "",
}) {
  return (
    <div
      className={`neural-lifeform ${className}`}
      aria-label="Animated neural AI lifeform"
    >
      <Canvas
        camera={{
          position: [0, 0, 3.6],
          fov: 38,
        }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ambientLight intensity={1.8} />

        <directionalLight
          position={[3, 4, 5]}
          intensity={2.2}
          color="#ffffff"
        />

        <pointLight
          position={[-2, -1, 2]}
          intensity={3.8}
          color="#b9ceff"
        />

        <pointLight
          position={[1, 2, -2]}
          intensity={2.6}
          color="#e3eaff"
        />

        <NeuralBody activity={activity} onActivity={onActivity} />
      </Canvas>
    </div>
  );
}
