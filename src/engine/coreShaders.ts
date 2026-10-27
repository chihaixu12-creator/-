/**
 * ModaUI Digital Life V3 - High-Precision WebGL Shaders
 * Compatible with WebGL 1.0, WebGL 2.0, mobile GPU drivers, and desktop browsers.
 * Pure white background, high-contrast charcoal/black monochrome with depth attenuation
 * and reactive intelligent thinking glow.
 */

export const VERTEX_SHADER_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

attribute vec3 a_targetPosition;
attribute vec3 a_dissolvePosition;
attribute vec3 a_velocity;
attribute float a_size;
attribute float a_alpha;
attribute float a_layer; // 0 = core, 1 = contour, 2 = aura/orbit

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_model;

uniform float u_time;
uniform float u_pixelRatio;
uniform float u_dissolveProgress; // 0 = head form, 1 = dissolved cloud
uniform float u_activityLevel;    // 0 = calm, 1 = intense thinking/responding
uniform float u_pulse;

varying float v_alpha;
varying float v_layer;
varying float v_depth;

void main() {
  // Interpolate between reformed head position and dissolved cloud position
  vec3 basePos = mix(a_targetPosition, a_dissolvePosition, u_dissolveProgress);
  
  // Add dynamic organic breathing and micro-currents based on layer
  float wave = sin(u_time * 2.2 + basePos.y * 3.5 + basePos.x * 2.5) * 0.025 * (1.0 + u_activityLevel * 1.5);
  vec3 dynamicPos = basePos + a_velocity * wave;

  if (a_layer > 1.5) {
    // Orbital atmospheric dust particles rotate gently
    float angle = u_time * 0.45 + basePos.z * 2.0;
    float cosA = cos(angle);
    float sinA = sin(angle);
    dynamicPos.x = basePos.x * cosA - basePos.z * sinA;
    dynamicPos.z = basePos.x * sinA + basePos.z * cosA;
  }

  // Model-View-Projection pipeline
  vec4 worldPos = u_model * vec4(dynamicPos, 1.0);
  vec4 viewPos = u_view * worldPos;
  gl_Position = u_projection * viewPos;

  // Real 3D perspective point sizing with distance attenuation
  float distanceToCam = length(viewPos.xyz);
  float sizeMultiplier = (a_layer < 0.5) ? 1.35 : (a_layer < 1.5 ? 1.1 : 0.85);
  
  // Size attenuates smoothly with distance
  float calculatedSize = (a_size * sizeMultiplier * 260.0 / max(distanceToCam, 0.4)) * u_pixelRatio;
  gl_PointSize = clamp(calculatedSize, 2.5 * u_pixelRatio, 18.0 * u_pixelRatio);

  // Depth-based subtle fading for rich spatial depth
  v_depth = clamp((-viewPos.z - 0.5) / 4.0, 0.0, 1.0);
  v_alpha = a_alpha * mix(1.0, 0.45, v_depth);
  v_layer = a_layer;
}
`;

export const FRAGMENT_SHADER_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying float v_alpha;
varying float v_layer;
varying float v_depth;

uniform float u_activityLevel;

void main() {
  // Convert square point to smooth circular antialiased particle
  vec2 coord = gl_PointCoord - vec2(0.5, 0.5);
  float dist = length(coord);
  if (dist > 0.5) {
    discard;
  }

  // Soft radial feathering
  float edge = smoothstep(0.5, 0.35, dist);

  // Luxury Haute-Couture palette on pure white:
  // Core points: deep velvet obsidian #0D1117
  // Contour points: graphite black #1A202C
  // Halo/orbit points: refined smoke grey #4A5568
  vec3 particleColor = vec3(0.05, 0.07, 0.09);
  
  if (v_layer > 1.5) {
    particleColor = vec3(0.28, 0.32, 0.40); // smoke graphite
  } else if (v_layer > 0.5) {
    particleColor = vec3(0.10, 0.12, 0.15); // contour black
  }

  // Intelligent thinking pulse in neural core (#00D2FF Moda thinking cyan)
  if (v_layer < 0.5 && u_activityLevel > 0.25) {
    vec3 cyanGlow = vec3(0.0, 0.82, 1.0);
    float glowFactor = clamp((u_activityLevel - 0.25) * 0.7, 0.0, 0.9);
    particleColor = mix(particleColor, cyanGlow, glowFactor);
  }

  // Center subtle intensity highlight
  float coreSpot = clamp((0.25 - dist) / 0.25, 0.0, 1.0) * 0.15;
  particleColor += vec3(coreSpot, coreSpot, coreSpot);

  float finalAlpha = edge * v_alpha;
  gl_FragColor = vec4(particleColor, finalAlpha);
}
`;
