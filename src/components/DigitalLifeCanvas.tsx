/**
 * ModaUI Digital Life V3 - Global Shared WebGL Canvas & Central State Coordinator
 *
 * Implements the central StateCoordinator class with an authoritative internal state machine
 * (idle, focused, typing, thinking, responding, listening, speaking, error) that governs all
 * 3D particle transitions.
 *
 * Ensures all transitions are atomic, strictly sequenced by Priority Matrix (P0 - P7),
 * protected by monotonic generation fencing, and seamlessly integrated with the
 * global CustomEvent dispatching system.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ModaCoreEngine, SpatialBehaviorType, ViewportAnchorRect } from '../engine/modaCoreEngine.ts';
import { ModaUICore, LifeStateType, EventPriority, StateTransitionRecord } from '../engine/ModaUICore.ts';

export const DIGITAL_LIFE_LIFECYCLE_EVENT = 'modagpt:digital-life-lifecycle';
export const DIGITAL_LIFE_SYNC_EVENT = 'modagpt:digital-life-sync';

export type DigitalLifeEventType =
  | 'AI_REQUEST_DISPATCH'   // Genuine task submitted -> enters thinking (P5)
  | 'AI_STREAM_CHUNK'       // Genuine stream chunk received -> enters responding (P4)
  | 'AI_TASK_COMPLETED'     // Genuine task finished -> enters idle (P2)
  | 'AI_TASK_FAILED'        // Genuine task failed -> enters error (P2)
  | 'AI_TASK_CANCELLED'     // User explicitly cancelled -> enters idle (P1)
  | 'INPUT_FOCUS'           // Textarea focused -> enters focused (P5)
  | 'INPUT_BLUR'            // Textarea blurred -> enters idle (P5)
  | 'INPUT_TYPING'          // Text changed -> enters typing (P5)
  | 'INPUT_CLEARED'         // Text emptied -> enters focused (P5)
  | 'AUDIO_RECORD_START'    // Genuine microphone recording started -> listening (P3)
  | 'AUDIO_RECORD_STOP'     // Microphone recording stopped -> focused / thinking / idle (P1/P3)
  | 'AUDIO_TTS_START'       // Genuine TTS audio playback started -> speaking (P3)
  | 'AUDIO_TTS_STOP'        // TTS audio playback ended -> idle (P1)
  | 'ANCHOR_UPDATE'         // Viewport anchor position update (P7)
  | 'SPATIAL_COMMAND'       // Spatial behavior (APPROACH, RETREAT, ORBIT, DISSOLVE, REFORM) (P6)
  | 'STATE_RESET';          // Force reset to idle for testing or session switch (P0)

export interface DigitalLifeEventDetail {
  type: DigitalLifeEventType;
  requestId?: string;
  generation?: number;
  payload?: any;
  timestamp?: number;
}

export interface DigitalLifeStateSnapshot {
  state: LifeStateType;
  previousState: LifeStateType;
  generation: number;
  requestId: string | null;
  activeSpatialAction: SpatialBehaviorType | null;
  isListening: boolean;
  isSpeaking: boolean;
  isGenerating: boolean;
  timestamp: number;
  elasticScale?: number;
  aggregation?: number;
  dispersion?: number;
  elasticTension?: number;
}

/**
 * Non-linear Organic Tissue Elastic Tension Model
 * Computes physically grounded spring-damper curves (second-order ODE):
 * a(t) = -omega^2 * (x - x_target) - 2 * zeta * omega * v(t)
 * where omega is natural frequency (tissue elasticity / stiffness),
 * and zeta is damping ratio (underdamped organic springback vs overdamped viscous drag).
 */
export interface OrganicTensionCurve {
  targetScale: number;
  targetDepth: number;
  targetActivity: number;
  targetAggregation: number; // 0 = relaxed, 1 = dense centripetal collapse
  targetDispersion: number;  // 0 = relaxed, 1 = expansive harmonic bloom
  stiffness: number;         // omega (rad/s)
  dampingRatio: number;      // zeta (0.55 - 0.88 for living tissue)
}

export interface OrganicTensionState {
  scale: number;
  scaleVel: number;
  depth: number;
  depthVel: number;
  activity: number;
  activityVel: number;
  aggregation: number;
  aggregationVel: number;
  dispersion: number;
  dispersionVel: number;
  stateAge: number; // seconds elapsed in current state
}

/**
 * Event Priority Mapping Table (P0 to P7)
 */
export const EVENT_PRIORITY_MAP: Record<DigitalLifeEventType, EventPriority> = {
  STATE_RESET: EventPriority.P0_LIFECYCLE,
  AI_TASK_CANCELLED: EventPriority.P1_USER_CANCEL,
  AUDIO_RECORD_STOP: EventPriority.P1_USER_CANCEL,
  AUDIO_TTS_STOP: EventPriority.P1_USER_CANCEL,
  AI_TASK_COMPLETED: EventPriority.P2_TASK_TERMINAL,
  AI_TASK_FAILED: EventPriority.P2_TASK_TERMINAL,
  AUDIO_RECORD_START: EventPriority.P3_AUDIO_REAL,
  AUDIO_TTS_START: EventPriority.P3_AUDIO_REAL,
  AI_STREAM_CHUNK: EventPriority.P4_AI_RESPONSE,
  AI_REQUEST_DISPATCH: EventPriority.P5_USER_ACTION,
  INPUT_TYPING: EventPriority.P5_USER_ACTION,
  INPUT_CLEARED: EventPriority.P5_USER_ACTION,
  INPUT_FOCUS: EventPriority.P5_USER_ACTION,
  INPUT_BLUR: EventPriority.P5_USER_ACTION,
  SPATIAL_COMMAND: EventPriority.P6_SPATIAL_CMD,
  ANCHOR_UPDATE: EventPriority.P7_AUTONOMOUS,
};

/**
 * Central State Coordinator Class
 * Authoritative controller governing all 3D particle transitions and state synchronization.
 * Guarantees atomic operations, generation fencing, audio mutual exclusion, and priority queueing.
 */
export class StateCoordinator {
  private static instance: StateCoordinator | null = null;
  private core: ModaUICore;
  private engine: ModaCoreEngine | null = null;
  private isProcessing = false;
  private pendingQueue: DigitalLifeEventDetail[] = [];

  // Organic Tissue Elastic Tension Physics State
  private tensionCurve: OrganicTensionCurve = {
    targetScale: 1.0,
    targetDepth: 0.0,
    targetActivity: 0.22,
    targetAggregation: 0.0,
    targetDispersion: 0.0,
    stiffness: 4.5,
    dampingRatio: 0.85,
  };

  private tensionState: OrganicTensionState = {
    scale: 1.0,
    scaleVel: 0.0,
    depth: 0.0,
    depthVel: 0.0,
    activity: 0.22,
    activityVel: 0.0,
    aggregation: 0.0,
    aggregationVel: 0.0,
    dispersion: 0.0,
    dispersionVel: 0.0,
    stateAge: 0.0,
  };

  private tensionLoopId: number | null = null;
  private lastTensionTick = typeof performance !== 'undefined' ? performance.now() : Date.now();

  private constructor() {
    this.core = ModaUICore.getInstance();
    this.setupCoreListener();
  }

  public static getInstance(): StateCoordinator {
    if (!StateCoordinator.instance) {
      StateCoordinator.instance = new StateCoordinator();
    }
    return StateCoordinator.instance;
  }

  public attachEngine(engine: ModaCoreEngine) {
    this.engine = engine;
    this.core.registerEngine(engine);
    this.applyParticleParameters(this.core.getState());
    this.startTensionLoop();
  }

  public detachEngine() {
    this.stopTensionLoop();
    this.engine = null;
    this.core.unregisterEngine();
  }

  public getEngine(): ModaCoreEngine | null {
    return this.engine;
  }

  public getState(): LifeStateType {
    return this.core.getState();
  }

  public getPreviousState(): LifeStateType {
    return this.core.getPreviousState();
  }

  public getGeneration(): number {
    return this.core.getCurrentGeneration();
  }

  public getActiveRequestId(): string | null {
    return this.core.getCurrentRequestId();
  }

  public getActiveSpatialAction(): SpatialBehaviorType | null {
    return this.core.getActiveSpatialAction();
  }

  public getOrganicTensionState(): OrganicTensionState {
    return { ...this.tensionState };
  }

  public getSnapshot(): DigitalLifeStateSnapshot {
    const state = this.core.getState();
    return {
      state,
      previousState: this.core.getPreviousState(),
      generation: this.core.getCurrentGeneration(),
      requestId: this.core.getCurrentRequestId(),
      activeSpatialAction: this.core.getActiveSpatialAction(),
      isListening: state === 'listening',
      isSpeaking: state === 'speaking',
      isGenerating: state === 'thinking' || state === 'responding',
      timestamp: Date.now(),
      elasticScale: this.tensionState.scale,
      aggregation: this.tensionState.aggregation,
      dispersion: this.tensionState.dispersion,
      elasticTension: Math.abs(this.tensionState.scaleVel) + this.tensionState.aggregation,
    };
  }

  /**
   * Broadcasts the current atomic state snapshot to all subscribers and the window
   */
  public broadcastSync() {
    const snapshot = this.getSnapshot();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<DigitalLifeStateSnapshot>(DIGITAL_LIFE_SYNC_EVENT, { detail: snapshot })
      );
    }
  }

  private setupCoreListener() {
    this.core.addListener({
      onStateChange: (newState) => {
        this.applyParticleParameters(newState);
        this.broadcastSync();
      },
      onSpatialInterrupted: (action, trigger) => {
        console.debug(`[StateCoordinator] Spatial action '${action}' preempted by '${trigger}'`);
      },
    });
  }

  /**
   * Continuous Non-linear Organic Tissue Tension Physics Integrator
   * Computes physically grounded spring-damper curves for living cellular elasticity
   */
  public stepOrganicTension(dt: number) {
    this.tensionState.stateAge += dt;
    const curve = this.tensionCurve;
    const s = this.tensionState;

    const integrateSpring = (
      curr: number,
      vel: number,
      target: number,
      omega: number,
      zeta: number
    ): [number, number] => {
      const displacement = curr - target;
      const springForce = -(omega * omega) * displacement;
      const dampingForce = -2.0 * zeta * omega * vel;
      const accel = springForce + dampingForce;
      const nextVel = vel + accel * dt;
      const nextVal = curr + nextVel * dt;
      return [nextVal, nextVel];
    };

    // Calculate dynamic state-dependent harmonic micro-pulses
    const state = this.core.getState();
    let dynamicScaleTarget = curve.targetScale;
    let dynamicActivityTarget = curve.targetActivity;

    if (state === 'thinking') {
      // In thinking: centripetal inward pull with high-frequency cognitive flutter
      const cognitiveFlutter = Math.sin(s.stateAge * 9.5) * 0.025 * s.aggregation;
      dynamicScaleTarget += cognitiveFlutter;
      dynamicActivityTarget += Math.sin(s.stateAge * 7.0) * 0.12 * s.aggregation;
    } else if (state === 'responding') {
      // In responding: harmonic outward dispersion bloom with undulating breathing waves
      const breathingWave = Math.sin(s.stateAge * 3.2) * 0.038 * s.dispersion;
      dynamicScaleTarget += breathingWave;
    }

    [s.scale, s.scaleVel] = integrateSpring(
      s.scale,
      s.scaleVel,
      dynamicScaleTarget,
      curve.stiffness,
      curve.dampingRatio
    );

    [s.depth, s.depthVel] = integrateSpring(
      s.depth,
      s.depthVel,
      curve.targetDepth,
      curve.stiffness * 0.8,
      curve.dampingRatio
    );

    [s.activity, s.activityVel] = integrateSpring(
      s.activity,
      s.activityVel,
      dynamicActivityTarget,
      curve.stiffness,
      curve.dampingRatio
    );

    [s.aggregation, s.aggregationVel] = integrateSpring(
      s.aggregation,
      s.aggregationVel,
      curve.targetAggregation,
      state === 'thinking' ? 9.5 : 4.0,
      0.68
    );

    [s.dispersion, s.dispersionVel] = integrateSpring(
      s.dispersion,
      s.dispersionVel,
      curve.targetDispersion,
      state === 'responding' ? 6.5 : 3.5,
      0.62
    );

    // Apply physically computed organic tissue parameters to the engine
    if (this.engine) {
      this.engine.scale = s.scale;
      this.engine.targetScale = s.scale;
      this.engine.modelZ = s.depth;
      this.engine.targetModelZ = s.depth;
      this.engine.setActivity(s.activity);
      this.engine.dissolveProgress = s.dispersion * 0.45;
    }
  }

  private startTensionLoop() {
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
    if (this.tensionLoopId !== null) return;

    this.lastTensionTick = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - this.lastTensionTick) / 1000, 0.05);
      this.lastTensionTick = now;
      this.stepOrganicTension(dt);
      this.tensionLoopId = requestAnimationFrame(tick);
    };
    this.tensionLoopId = requestAnimationFrame(tick);
  }

  private stopTensionLoop() {
    if (this.tensionLoopId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.tensionLoopId);
      this.tensionLoopId = null;
    }
  }

  /**
   * Applies non-linear acceleration and damping curves corresponding to life states
   * Replaces static hard scale assignments with organic tissue spring parameters
   */
  public applyParticleParameters(state: LifeStateType) {
    this.tensionState.stateAge = 0;

    switch (state) {
      case 'idle':
        this.engine?.reform();
        this.tensionCurve = {
          targetScale: 1.0,
          targetDepth: 0.0,
          targetActivity: 0.22,
          targetAggregation: 0.0,
          targetDispersion: 0.0,
          stiffness: 4.5,
          dampingRatio: 0.85,
        };
        break;

      case 'focused':
        this.engine?.reform();
        this.tensionCurve = {
          targetScale: 0.96,
          targetDepth: 0.2,
          targetActivity: 0.42,
          targetAggregation: 0.2,
          targetDispersion: 0.0,
          stiffness: 7.0,
          dampingRatio: 0.78,
        };
        break;

      case 'typing':
        this.engine?.reform();
        this.tensionCurve = {
          targetScale: 0.48,
          targetDepth: -0.15,
          targetActivity: 0.35,
          targetAggregation: 0.45,
          targetDispersion: 0.0,
          stiffness: 11.5,
          dampingRatio: 0.88,
        };
        break;

      case 'thinking':
        // Thinking state: centripetal inward squeeze followed by resilient organic bounce-back
        this.engine?.reform();
        this.tensionCurve = {
          targetScale: 0.88,
          targetDepth: 0.45,
          targetActivity: 1.35,
          targetAggregation: 0.94,
          targetDispersion: 0.0,
          stiffness: 9.5,
          dampingRatio: 0.62,
        };
        // Initial inward acceleration impulse on entry into thinking
        this.tensionState.scaleVel -= 0.65;
        break;

      case 'responding':
        // Responding state: harmonic outward dispersion blossoming with organic elastic expansion
        this.engine?.reform();
        this.tensionCurve = {
          targetScale: 1.08,
          targetDepth: 0.15,
          targetActivity: 0.78,
          targetAggregation: 0.0,
          targetDispersion: 0.85,
          stiffness: 6.2,
          dampingRatio: 0.58,
        };
        // Outward blossom impulse on entry into responding
        this.tensionState.scaleVel += 0.55;
        break;

      case 'listening':
        this.tensionCurve = {
          targetScale: 1.1,
          targetDepth: 0.25,
          targetActivity: 0.95,
          targetAggregation: 0.1,
          targetDispersion: 0.35,
          stiffness: 6.8,
          dampingRatio: 0.7,
        };
        break;

      case 'speaking':
        this.tensionCurve = {
          targetScale: 1.05,
          targetDepth: 0.2,
          targetActivity: 1.0,
          targetAggregation: 0.15,
          targetDispersion: 0.25,
          stiffness: 7.5,
          dampingRatio: 0.72,
        };
        break;

      case 'error':
        this.tensionCurve = {
          targetScale: 0.82,
          targetDepth: -0.4,
          targetActivity: 0.1,
          targetAggregation: 0.0,
          targetDispersion: 0.0,
          stiffness: 3.5,
          dampingRatio: 0.95,
        };
        break;
    }

    // Step once deterministically for testing or headless execution
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
      this.stepOrganicTension(0.016);
    }
  }

  /**
   * Dispatches and coordinates lifecycle events atomically with Priority-Matrix queueing
   */
  public processEvent(detail: DigitalLifeEventDetail) {
    const priority = EVENT_PRIORITY_MAP[detail.type] ?? EventPriority.P5_USER_ACTION;

    // Rule P1 / P0: User cancel or reset immediately clears pending queue and executes
    if (priority <= EventPriority.P1_USER_CANCEL) {
      this.pendingQueue = [];
      this.executeAtomicEvent(detail);
      return;
    }

    // Insert in priority order
    let insertIdx = this.pendingQueue.length;
    for (let i = 0; i < this.pendingQueue.length; i++) {
      const p = EVENT_PRIORITY_MAP[this.pendingQueue[i].type] ?? EventPriority.P5_USER_ACTION;
      if (priority < p) {
        insertIdx = i;
        break;
      }
    }
    this.pendingQueue.splice(insertIdx, 0, detail);

    if (!this.isProcessing) {
      this.drainQueue();
    }
  }

  private drainQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.pendingQueue.length > 0) {
      const event = this.pendingQueue.shift()!;
      this.executeAtomicEvent(event);
    }

    this.isProcessing = false;
  }

  private executeAtomicEvent(detail: DigitalLifeEventDetail) {
    switch (detail.type) {
      case 'STATE_RESET':
        this.core.resetForTest();
        this.applyParticleParameters('idle');
        this.broadcastSync();
        break;

      case 'AI_REQUEST_DISPATCH':
        this.core.onSubmitTask();
        break;

      case 'AI_STREAM_CHUNK':
        this.core.onAiStreamStart(detail.requestId, detail.generation);
        break;

      case 'AI_TASK_COMPLETED':
        this.core.onAiComplete(detail.requestId, detail.generation);
        break;

      case 'AI_TASK_FAILED':
        this.core.onError(detail.payload?.error, detail.requestId, detail.generation);
        break;

      case 'AI_TASK_CANCELLED':
        this.core.cancelCurrentTask();
        break;

      case 'INPUT_FOCUS':
        this.core.onInputFocus();
        break;

      case 'INPUT_BLUR':
        this.core.onInputBlur(Boolean(detail.payload?.hasText));
        break;

      case 'INPUT_TYPING':
        this.core.onInputType(Number(detail.payload?.textLength || 1));
        break;

      case 'INPUT_CLEARED':
        this.core.onInputType(0);
        break;

      case 'AUDIO_RECORD_START':
        if (this.core.getState() === 'speaking') {
          this.core.stopSpeaking();
        }
        this.core.startListening();
        break;

      case 'AUDIO_RECORD_STOP':
        this.core.stopListening(Boolean(detail.payload?.hasRecognizedText));
        break;

      case 'AUDIO_TTS_START':
        if (this.core.getState() === 'listening') {
          this.core.stopListening(false);
        }
        this.core.startSpeaking();
        break;

      case 'AUDIO_TTS_STOP':
        this.core.stopSpeaking();
        break;

      case 'SPATIAL_COMMAND':
        if (detail.payload?.behavior) {
          this.core.triggerSpatialBehavior(detail.payload.behavior, detail.payload.value);
        }
        break;

      case 'ANCHOR_UPDATE':
        if (this.engine && detail.payload?.rect) {
          this.engine.setAnchorTarget(detail.payload.rect, detail.payload.immediate);
        }
        break;
    }
  }

  public updateAnchor(targetElement: HTMLElement | null, immediate = false) {
    this.core.updateAnchor(targetElement, immediate);
  }

  public onPointerMove(normalizedX: number, normalizedY: number) {
    this.core.onPointerMove(normalizedX, normalizedY);
  }

  public orbit(deltaYaw: number, deltaPitch = 0) {
    this.engine?.orbit(deltaYaw, deltaPitch);
  }

  public zoom(delta: number) {
    if (delta > 0) {
      this.engine?.approach(delta);
    } else {
      this.engine?.retreat(delta);
    }
  }

  public pulseRipple() {
    this.engine?.pulseRipple();
  }
}

/**
 * Global Atomic Event Dispatcher
 * Dispatches lifecycle events on window to trigger atomic state transitions via StateCoordinator.
 */
export function dispatchDigitalLifeLifecycleEvent(detail: DigitalLifeEventDetail): void {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent<DigitalLifeEventDetail>(DIGITAL_LIFE_LIFECYCLE_EVENT, {
    detail: {
      ...detail,
      timestamp: detail.timestamp || Date.now(),
    },
  });
  window.dispatchEvent(event);
}

/**
 * Subscribes to global atomic state synchronization updates
 */
export function subscribeDigitalLifeState(callback: (snapshot: DigitalLifeStateSnapshot) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const customEvt = e as CustomEvent<DigitalLifeStateSnapshot>;
    if (customEvt.detail) {
      callback(customEvt.detail);
    }
  };
  window.addEventListener(DIGITAL_LIFE_SYNC_EVENT, handler as EventListener);
  return () => window.removeEventListener(DIGITAL_LIFE_SYNC_EVENT, handler as EventListener);
}

export function getDigitalLifeSnapshot(): DigitalLifeStateSnapshot {
  return StateCoordinator.getInstance().getSnapshot();
}

export interface DigitalLifeCanvasProps {
  conversationId?: string;
  isGenerating?: boolean;
  onStateChange?: (state: LifeStateType, previousState: LifeStateType) => void;
  showStateBadge?: boolean;
  renderBackgroundCanvas?: boolean;
}

/**
 * Custom Hook for accessing and dispatching Digital Life Coordinator events
 * universally shared across Home stage, Chat avatar, and Canvas views.
 */
export function useDigitalLifeCoordinator() {
  const coordinator = StateCoordinator.getInstance();
  const [snapshot, setSnapshot] = useState<DigitalLifeStateSnapshot>(() => coordinator.getSnapshot());

  useEffect(() => {
    return subscribeDigitalLifeState((newSnapshot) => {
      setSnapshot(newSnapshot);
    });
  }, []);

  const dispatchAiRequest = useCallback((prompt?: string) => {
    const reqId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    dispatchDigitalLifeLifecycleEvent({
      type: 'AI_REQUEST_DISPATCH',
      requestId: reqId,
      payload: { prompt },
    });
    return reqId;
  }, []);

  const dispatchAiStreamChunk = useCallback((requestId?: string, generation?: number) => {
    dispatchDigitalLifeLifecycleEvent({
      type: 'AI_STREAM_CHUNK',
      requestId,
      generation,
    });
  }, []);

  const dispatchAiComplete = useCallback((requestId?: string, generation?: number) => {
    dispatchDigitalLifeLifecycleEvent({
      type: 'AI_TASK_COMPLETED',
      requestId,
      generation,
    });
  }, []);

  const dispatchAiFailed = useCallback((errorMsg?: string, requestId?: string, generation?: number) => {
    dispatchDigitalLifeLifecycleEvent({
      type: 'AI_TASK_FAILED',
      requestId,
      generation,
      payload: { error: errorMsg },
    });
  }, []);

  const dispatchAiCancel = useCallback(() => {
    dispatchDigitalLifeLifecycleEvent({
      type: 'AI_TASK_CANCELLED',
    });
  }, []);

  const dispatchInputFocus = useCallback(() => {
    dispatchDigitalLifeLifecycleEvent({ type: 'INPUT_FOCUS' });
  }, []);

  const dispatchInputBlur = useCallback((hasText: boolean) => {
    dispatchDigitalLifeLifecycleEvent({ type: 'INPUT_BLUR', payload: { hasText } });
  }, []);

  const dispatchInputTyping = useCallback((textLength: number) => {
    dispatchDigitalLifeLifecycleEvent({
      type: textLength === 0 ? 'INPUT_CLEARED' : 'INPUT_TYPING',
      payload: { textLength },
    });
  }, []);

  const dispatchSpatialCommand = useCallback((behavior: SpatialBehaviorType, value?: number) => {
    dispatchDigitalLifeLifecycleEvent({
      type: 'SPATIAL_COMMAND',
      payload: { behavior, value },
    });
  }, []);

  const dispatchAnchorUpdate = useCallback((element: HTMLElement | null, immediate = false) => {
    coordinator.updateAnchor(element, immediate);
  }, [coordinator]);

  const startListening = useCallback(async () => {
    dispatchDigitalLifeLifecycleEvent({ type: 'AUDIO_RECORD_START' });
    const core = ModaUICore.getInstance();
    return core.startListening();
  }, []);

  const stopListening = useCallback((hasRecognizedText?: boolean) => {
    const core = ModaUICore.getInstance();
    core.stopListening(hasRecognizedText);
    dispatchDigitalLifeLifecycleEvent({
      type: 'AUDIO_RECORD_STOP',
      payload: { hasRecognizedText },
    });
  }, []);

  const startSpeaking = useCallback(() => {
    dispatchDigitalLifeLifecycleEvent({ type: 'AUDIO_TTS_START' });
  }, []);

  const stopSpeaking = useCallback(() => {
    dispatchDigitalLifeLifecycleEvent({ type: 'AUDIO_TTS_STOP' });
  }, []);

  return {
    state: snapshot.state,
    previousState: snapshot.previousState,
    generation: snapshot.generation,
    activeReqId: snapshot.requestId,
    activeSpatialAction: snapshot.activeSpatialAction,
    isListening: snapshot.isListening,
    isSpeaking: snapshot.isSpeaking,
    isGenerating: snapshot.isGenerating,
    elasticScale: snapshot.elasticScale ?? 1.0,
    aggregation: snapshot.aggregation ?? 0.0,
    dispersion: snapshot.dispersion ?? 0.0,
    elasticTension: snapshot.elasticTension ?? 0.0,
    getOrganicTensionState: () => coordinator.getOrganicTensionState(),
    dispatchAiRequest,
    dispatchAiStreamChunk,
    dispatchAiComplete,
    dispatchAiFailed,
    dispatchAiCancel,
    dispatchInputFocus,
    dispatchInputBlur,
    dispatchInputTyping,
    dispatchSpatialCommand,
    dispatchAnchorUpdate,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking,
    orbit: (deltaYaw: number, deltaPitch?: number) => coordinator.orbit(deltaYaw, deltaPitch),
    zoom: (delta: number) => coordinator.zoom(delta),
    pulseRipple: () => coordinator.pulseRipple(),
    updateAnchor: (el: HTMLElement | null, immediate?: boolean) => coordinator.updateAnchor(el, immediate),
    getTransitionHistory: () => ModaUICore.getInstance().getTransitionHistory(),
  };
}

/**
 * DigitalLifeCanvas Component
 * Mounts the authoritative 3D WebGL particle canvas and coordinates all lifecycle events
 */
export const DigitalLifeCanvas: React.FC<DigitalLifeCanvasProps> = ({
  conversationId,
  isGenerating,
  onStateChange,
  showStateBadge = false,
  renderBackgroundCanvas = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lifeState, setLifeState] = useState<LifeStateType>('idle');
  const [generation, setGeneration] = useState(0);

  // Sync external isGenerating state safely without duplicate triggers
  useEffect(() => {
    const coordinator = StateCoordinator.getInstance();
    const cur = coordinator.getState();
    if (isGenerating && cur !== 'thinking' && cur !== 'responding') {
      dispatchDigitalLifeLifecycleEvent({ type: 'AI_REQUEST_DISPATCH' });
    } else if (!isGenerating && (cur === 'thinking' || cur === 'responding')) {
      dispatchDigitalLifeLifecycleEvent({ type: 'AI_TASK_COMPLETED' });
    }
  }, [isGenerating]);

  // Sync conversation ID changes
  useEffect(() => {
    const coordinator = StateCoordinator.getInstance();
    const cur = coordinator.getState();
    if (cur !== 'idle' && !isGenerating) {
      dispatchDigitalLifeLifecycleEvent({ type: 'AI_TASK_CANCELLED' });
    }
  }, [conversationId, isGenerating]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const coordinator = StateCoordinator.getInstance();
    const engine = new ModaCoreEngine(canvas);
    coordinator.attachEngine(engine);
    engine.start();

    // 1. Subscribe to state machine transitions
    const unsubscribeSync = subscribeDigitalLifeState((snap) => {
      setLifeState(snap.state);
      setGeneration(snap.generation);
      onStateChange?.(snap.state, snap.previousState);
    });

    // 2. Lifecycle Event Listener
    const handleLifecycleEvent = (e: Event) => {
      const customEvt = e as CustomEvent<DigitalLifeEventDetail>;
      if (!customEvt.detail) return;
      coordinator.processEvent(customEvt.detail);
    };

    window.addEventListener(DIGITAL_LIFE_LIFECYCLE_EVENT, handleLifecycleEvent as EventListener);

    // Initial broadcast
    coordinator.broadcastSync();

    // 3. P0: WebGL Context Lost & Restored Handlers
    const handleContextLost = (e: Event) => {
      engine.handleContextLost(e);
    };

    const handleContextRestored = () => {
      engine.handleContextRestored();
      coordinator.applyParticleParameters(coordinator.getState());
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    // 4. Global pointer tracking for 3D parallax head rotation (looking at cursor)
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;

      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const normX = (clientX / window.innerWidth) * 2 - 1; // -1 to +1
      const normY = (clientY / window.innerHeight) * 2 - 1; // -1 to +1
      coordinator.onPointerMove(normX, normY);
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener(DIGITAL_LIFE_LIFECYCLE_EVENT, handleLifecycleEvent as EventListener);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      unsubscribeSync();
      coordinator.detachEngine();
      engine.destroy();
    };
  }, [onStateChange]);

  return (
    <>
      {/* 3D Digital Life Shared WebGL Canvas (conditional) */}
      {renderBackgroundCanvas && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 w-full h-full pointer-events-none z-30 select-none"
          style={{
            background: 'transparent',
          }}
        />
      )}

      {/* Optional Discreet State & Generation Badge */}
      {showStateBadge && (
        <div className="fixed top-2 right-3 z-40 pointer-events-none select-none flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/80 backdrop-blur-xs border border-gray-200 text-[10px] text-gray-500 font-mono shadow-2xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              lifeState === 'thinking'
                ? 'bg-[#07C2E3] animate-ping'
                : lifeState === 'responding'
                ? 'bg-emerald-500 animate-pulse'
                : lifeState === 'listening'
                ? 'bg-red-500 animate-pulse'
                : lifeState === 'typing'
                ? 'bg-amber-500'
                : 'bg-gray-400'
            }`}
          />
          <span className="capitalize">{lifeState}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400">g{generation}</span>
        </div>
      )}
    </>
  );
};
