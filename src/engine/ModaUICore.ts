/**
 * ModaUI Digital Life V3 - Unified State Coordinator & Priority Matrix
 * Implements strict global priority rules (P0 - P7), conflict resolution matrix,
 * monotonic generation fencing, half-duplex audio arbitration, spatial action preemption,
 * and duplicate submission deduplication.
 */

import { ModaCoreEngine, ViewportAnchorRect, SpatialBehaviorType } from './modaCoreEngine.ts';

export type LifeStateType =
  | 'idle'
  | 'focused'
  | 'typing'
  | 'thinking'
  | 'responding'
  | 'listening'
  | 'speaking'
  | 'error';

export enum EventPriority {
  P0_LIFECYCLE = 0,     // Component destroy, WebGL context lost, unload
  P1_USER_CANCEL = 1,   // Explicit cancel (stop gen, stop mic, stop TTS)
  P2_TASK_TERMINAL = 2, // Task success, fail, timeout
  P3_AUDIO_REAL = 3,    // Real voice record start/stop, TTS start/stop
  P4_AI_RESPONSE = 4,   // First chunk, ongoing stream, stream complete
  P5_USER_ACTION = 5,   // Submit, input, focus, blur, clear
  P6_SPATIAL_CMD = 6,   // Approach, retreat, orbit, dissolve, reform
  P7_AUTONOMOUS = 7,    // Idle breathing, micro-rotation, drift
}

export interface StateTransitionRecord {
  from: LifeStateType;
  to: LifeStateType;
  event: string;
  priority: EventPriority;
  timestamp: number;
  requestId?: string;
  generation?: number;
  successful: boolean;
  reason?: string;
}

export interface DigitalLifeListener {
  onStateChange?: (state: LifeStateType, previousState: LifeStateType) => void;
  onTransitionRejected?: (from: LifeStateType, attemptedTo: LifeStateType, reason: string) => void;
  onSpatialInterrupted?: (action: SpatialBehaviorType, trigger: string) => void;
}

export class ModaUICore {
  private static instance: ModaUICore | null = null;
  private engine: ModaCoreEngine | null = null;
  private currentState: LifeStateType = 'idle';
  private previousState: LifeStateType = 'idle';
  private listeners: Set<DigitalLifeListener> = new Set();

  // Request & Task Fencing (Monotonic generation counter + unique request ID)
  private currentRequestId: string | null = null;
  private currentGeneration = 0;
  private activeTaskStatus: 'idle' | 'running' | 'cancelled' | 'failed' | 'completed' = 'idle';
  private isCurrentTaskCancelled = false;

  // Active Spatial Behavior Tracking (For smooth preemption upon higher-priority events)
  private activeSpatialAction: SpatialBehaviorType | null = null;

  // State Transition Audit History (for verification & test suites)
  private transitionHistory: StateTransitionRecord[] = [];
  private maxHistoryLength = 60;

  // AudioContext & Half-Duplex Voice Engine
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private audioAnimFrame: number | null = null;
  private voiceSessionId: string | null = null;
  private isTtsPlaying = false;

  // Typing debounce timer
  private typingTimer: any = null;

  // Accessibility: prefers-reduced-motion
  private reducedMotion = false;

  private constructor() {
    this.checkReducedMotionPreference();
    this.setupLifecycleListeners();
  }

  public static getInstance(): ModaUICore {
    if (!ModaUICore.instance) {
      ModaUICore.instance = new ModaUICore();
    }
    return ModaUICore.instance;
  }

  private checkReducedMotionPreference() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = mediaQuery.matches;
      mediaQuery.addEventListener?.('change', (e) => {
        this.reducedMotion = e.matches;
      });
    }
  }

  private setupLifecycleListeners() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          // P0: Pause or reduce rendering, keep background task state intact
          this.engine?.stop();
        } else {
          // Resume and re-synchronize
          this.engine?.start();
          this.applyStateToEngine(this.currentState);
        }
      });
    }
  }

  public setReducedMotion(enabled: boolean) {
    this.reducedMotion = enabled;
  }

  public isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  public registerEngine(engine: ModaCoreEngine) {
    this.engine = engine;
    this.applyStateToEngine(this.currentState);
  }

  public unregisterEngine() {
    this.stopAudioAnalysis();
    this.engine = null;
  }

  public getEngine(): ModaCoreEngine | null {
    return this.engine;
  }

  public getState(): LifeStateType {
    return this.currentState;
  }

  public getPreviousState(): LifeStateType {
    return this.previousState;
  }

  public getCurrentRequestId(): string | null {
    return this.currentRequestId;
  }

  public getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  public getActiveSpatialAction(): SpatialBehaviorType | null {
    return this.activeSpatialAction;
  }

  public getTransitionHistory(): StateTransitionRecord[] {
    return [...this.transitionHistory];
  }

  public addListener(listener: DigitalLifeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(from: LifeStateType, to: LifeStateType) {
    for (const l of this.listeners) {
      l.onStateChange?.(to, from);
    }
  }

  // -------------------------------------------------------------
  // Conflict Matrix & Legal Transition Table
  // -------------------------------------------------------------

  public isValidTransition(from: LifeStateType, to: LifeStateType, event: string): boolean {
    // Re-entrant typing is valid for continuous keystrokes
    if (from === 'typing' && to === 'typing') {
      return true;
    }

    switch (from) {
      case 'idle':
        return ['focused', 'typing', 'thinking', 'listening', 'speaking', 'error'].includes(to);

      case 'focused':
        return ['idle', 'typing', 'thinking', 'listening', 'speaking', 'error'].includes(to);

      case 'typing':
        return ['focused', 'idle', 'thinking', 'listening', 'speaking', 'error'].includes(to);

      case 'thinking':
        // 'focused' is legal when backend reports missing materials (waiting_for_input)
        return ['responding', 'focused', 'idle', 'error'].includes(to);

      case 'responding':
        return ['idle', 'speaking', 'error'].includes(to);

      case 'listening':
        return ['thinking', 'focused', 'idle', 'error'].includes(to);

      case 'speaking':
        return ['idle', 'listening', 'error'].includes(to);

      case 'error':
        // Retrying leads to thinking; new typing leads to typing; reset leads to idle
        return ['thinking', 'typing', 'idle', 'listening', 'speaking'].includes(to);

      default:
        return false;
    }
  }

  /**
   * Executes a state transition with Event Conflict Priority & Request Fencing
   */
  public transition(
    to: LifeStateType,
    event: string,
    priority: EventPriority,
    payload?: { requestId?: string; generation?: number; reason?: string }
  ): boolean {
    const from = this.currentState;

    // Rule 1: Request & Generation fencing (Priority P2 / P4)
    // Discard any late-arriving async responses if requestId or generation does not match active request
    if (priority === EventPriority.P4_AI_RESPONSE || priority === EventPriority.P2_TASK_TERMINAL) {
      if (payload?.generation !== undefined && payload.generation < this.currentGeneration) {
        this.recordAndReject(
          from,
          to,
          event,
          priority,
          payload,
          `Rejected: Outdated generation ${payload.generation} < active ${this.currentGeneration}`
        );
        return false;
      }
      if (this.isCurrentTaskCancelled) {
        this.recordAndReject(
          from,
          to,
          event,
          priority,
          payload,
          `Rejected: Task is marked cancelled; late response is discarded`
        );
        return false;
      }
      if (payload?.requestId && this.currentRequestId && payload.requestId !== this.currentRequestId) {
        this.recordAndReject(
          from,
          to,
          event,
          priority,
          payload,
          `Rejected: requestId '${payload.requestId}' does not match active '${this.currentRequestId}'`
        );
        return false;
      }
    }

    // Rule 2: Higher priority preemption over spatial actions
    // If a spatial behavior (like ORBIT or DISSOLVE) is active, user actions or state shifts interrupt it smoothly
    if (this.activeSpatialAction && priority <= EventPriority.P5_USER_ACTION) {
      const interrupted = this.activeSpatialAction;
      this.activeSpatialAction = null;
      this.engine?.reform(); // Gracefully converge back to standard head model
      for (const l of this.listeners) {
        l.onSpatialInterrupted?.(interrupted, event);
      }
    }

    // Rule 3: Legality validation according to Conflict Matrix
    if (!this.isValidTransition(from, to, event)) {
      this.recordAndReject(
        from,
        to,
        event,
        priority,
        payload,
        `Illegal transition from '${from}' to '${to}' triggered by '${event}'`
      );
      return false;
    }

    // Apply Transition
    this.previousState = from;
    this.currentState = to;

    const record: StateTransitionRecord = {
      from,
      to,
      event,
      priority,
      timestamp: Date.now(),
      requestId: payload?.requestId || this.currentRequestId || undefined,
      generation: payload?.generation ?? this.currentGeneration,
      successful: true,
      reason: payload?.reason,
    };
    this.recordTransition(record);

    this.applyStateToEngine(to);
    this.notify(from, to);
    return true;
  }

  private recordAndReject(
    from: LifeStateType,
    to: LifeStateType,
    event: string,
    priority: EventPriority,
    payload: any,
    reason: string
  ) {
    const record: StateTransitionRecord = {
      from,
      to,
      event,
      priority,
      timestamp: Date.now(),
      requestId: payload?.requestId || this.currentRequestId || undefined,
      generation: payload?.generation ?? this.currentGeneration,
      successful: false,
      reason,
    };
    this.recordTransition(record);
    for (const l of this.listeners) {
      l.onTransitionRejected?.(from, to, reason);
    }
  }

  private recordTransition(record: StateTransitionRecord) {
    this.transitionHistory.push(record);
    if (this.transitionHistory.length > this.maxHistoryLength) {
      this.transitionHistory.shift();
    }
  }

  // -------------------------------------------------------------
  // Physical Engine Parameters for each Life State
  // -------------------------------------------------------------

  private applyStateToEngine(state: LifeStateType) {
    if (!this.engine) return;

    const reduced = this.reducedMotion;

    switch (state) {
      case 'idle':
        this.engine.reform();
        this.engine.setActivity(reduced ? 0.05 : 0.2);
        this.engine.targetScale = 1.0;
        this.engine.targetModelZ = 0;
        break;

      case 'focused':
        this.engine.reform();
        this.engine.setActivity(reduced ? 0.1 : 0.35);
        this.engine.targetScale = 0.95;
        this.engine.approach(reduced ? 0.05 : 0.2);
        break;

      case 'typing':
        // Smoothly scale down to ~0.45 and converge inward
        this.engine.reform();
        this.engine.setActivity(reduced ? 0.15 : 0.4);
        this.engine.targetScale = 0.45;
        this.engine.retreat(reduced ? -0.05 : -0.2);
        break;

      case 'thinking':
        // Accelerate internal currents and approach slightly
        this.engine.reform();
        this.engine.setActivity(reduced ? 0.4 : 1.2);
        this.engine.approach(reduced ? 0.1 : 0.5);
        break;

      case 'responding':
        // Gentle rhythmic pulsing
        this.engine.reform();
        this.engine.setActivity(reduced ? 0.25 : 0.7);
        this.engine.targetScale = 1.0;
        break;

      case 'listening':
        this.engine.setActivity(0.9);
        this.engine.targetScale = 1.1;
        break;

      case 'speaking':
        this.engine.setActivity(1.0);
        this.engine.targetScale = 1.05;
        break;

      case 'error':
        this.engine.setActivity(0.1);
        this.engine.targetScale = 0.85;
        this.engine.retreat(-0.4);
        break;
    }
  }

  // -------------------------------------------------------------
  // User Actions (P5)
  // -------------------------------------------------------------

  public onInputFocus() {
    if (this.currentState === 'idle') {
      this.transition('focused', 'input_focus', EventPriority.P5_USER_ACTION);
    }
  }

  public onInputBlur(hasText: boolean) {
    if (this.currentState === 'focused' || this.currentState === 'typing') {
      if (!hasText) {
        this.transition('idle', 'input_blur_empty', EventPriority.P5_USER_ACTION);
      }
    }
  }

  public onInputType(textLength: number) {
    if (textLength === 0) {
      if (this.currentState === 'typing') {
        this.transition('focused', 'input_cleared', EventPriority.P5_USER_ACTION);
      }
      return;
    }

    if (this.currentState !== 'typing') {
      this.transition('typing', 'input_first_char', EventPriority.P5_USER_ACTION);
    } else {
      // Keystroke debounce: stay in typing, reset auto-settle timer
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => {
        if (this.currentState === 'typing') {
          this.transition('focused', 'typing_paused', EventPriority.P5_USER_ACTION);
        }
      }, 2200);
    }
  }

  /**
   * Called when user submits a creation task (P5).
   * Implements deduplication (Scenario B): blocks rapid duplicate submissions.
   */
  public onSubmitTask(): string {
    // Scenario B: If already in thinking or responding, return existing requestId without stomping
    if (this.activeTaskStatus === 'running' && (this.currentState === 'thinking' || this.currentState === 'responding')) {
      console.warn('[ModaUICore] Deduplicating rapid repeat submission. Returning current requestId:', this.currentRequestId);
      return this.currentRequestId!;
    }

    this.currentGeneration++;
    const reqId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.currentRequestId = reqId;
    this.activeTaskStatus = 'running';
    this.isCurrentTaskCancelled = false;

    this.transition('thinking', 'user_submit', EventPriority.P5_USER_ACTION, {
      requestId: reqId,
      generation: this.currentGeneration,
    });
    return reqId;
  }

  // -------------------------------------------------------------
  // Task Output & Terminal Lifecycle (P4 & P2)
  // -------------------------------------------------------------

  public onTaskNeedsInput(requestId?: string, generation?: number) {
    const gen = generation ?? this.currentGeneration;
    this.activeTaskStatus = 'idle';
    this.transition('focused', 'backend_needs_input', EventPriority.P2_TASK_TERMINAL, {
      requestId,
      generation: gen,
    });
  }

  public onAiStreamStart(requestId?: string, generation?: number) {
    const gen = generation ?? this.currentGeneration;
    this.transition('responding', 'ai_stream_first_chunk', EventPriority.P4_AI_RESPONSE, {
      requestId,
      generation: gen,
    });
  }

  public onAiComplete(requestId?: string, generation?: number) {
    const gen = generation ?? this.currentGeneration;
    this.activeTaskStatus = 'completed';
    this.transition('idle', 'ai_complete', EventPriority.P2_TASK_TERMINAL, {
      requestId,
      generation: gen,
    });
    this.currentRequestId = null;
  }

  public onError(errorMsg?: string, requestId?: string, generation?: number) {
    const gen = generation ?? this.currentGeneration;
    this.activeTaskStatus = 'failed';
    this.transition('error', 'task_error', EventPriority.P2_TASK_TERMINAL, {
      requestId,
      generation: gen,
      reason: errorMsg,
    });
  }

  // -------------------------------------------------------------
  // User Explicit Cancel (P1 - Priority 1) - Scenario A
  // -------------------------------------------------------------

  public cancelCurrentTask() {
    this.isCurrentTaskCancelled = true;
    this.currentGeneration++; // Invalidate any in-flight async callbacks
    this.activeTaskStatus = 'cancelled';
    const oldReq = this.currentRequestId;
    this.currentRequestId = null;

    if (this.currentState === 'thinking' || this.currentState === 'responding') {
      this.transition('idle', 'user_cancelled', EventPriority.P1_USER_CANCEL, {
        requestId: oldReq || undefined,
        generation: this.currentGeneration,
      });
    }
  }

  // -------------------------------------------------------------
  // Audio Arbitration (P3 Half-Duplex Strategy) - Scenario D
  // -------------------------------------------------------------

  public async startListening(): Promise<boolean> {
    // Half-duplex rule: Stop TTS playback first before recording
    if (this.isTtsPlaying || this.currentState === 'speaking') {
      this.stopSpeaking();
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone not supported on this browser');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      this.voiceSessionId = `voice-${Date.now()}`;
      const ok = this.transition('listening', 'mic_record_start', EventPriority.P3_AUDIO_REAL);
      if (!ok) {
        this.stopAudioAnalysis();
        return false;
      }

      this.runAudioAnalysis();
      return true;
    } catch (err) {
      console.warn('[ModaUICore] Microphone access denied or unavailable:', err);
      return false;
    }
  }

  public stopListening(hasRecognizedText = false) {
    this.stopAudioAnalysis();
    this.voiceSessionId = null;

    if (this.currentState === 'listening') {
      if (hasRecognizedText) {
        this.transition('thinking', 'voice_recognized_submit', EventPriority.P3_AUDIO_REAL);
      } else {
        this.transition('focused', 'voice_record_stop', EventPriority.P1_USER_CANCEL);
      }
    }
  }

  public startSpeaking(): boolean {
    // Half-duplex rule: Stop mic recording before starting audio playback
    if (this.currentState === 'listening') {
      this.stopListening(false);
    }

    this.isTtsPlaying = true;
    return this.transition('speaking', 'tts_audio_start', EventPriority.P3_AUDIO_REAL);
  }

  public stopSpeaking() {
    this.isTtsPlaying = false;
    if (this.currentState === 'speaking') {
      this.transition('idle', 'tts_audio_stop', EventPriority.P1_USER_CANCEL);
    }
  }

  private runAudioAnalysis = () => {
    if (!this.analyser || this.currentState !== 'listening') return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const avg = sum / bufferLength / 255;

    this.engine?.setAudioAmplitude(avg * 1.5);
    if (typeof requestAnimationFrame !== 'undefined') {
      this.audioAnimFrame = requestAnimationFrame(this.runAudioAnalysis);
    }
  };

  private stopAudioAnalysis() {
    if (this.audioAnimFrame && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.audioAnimFrame);
      this.audioAnimFrame = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.engine?.setAudioAmplitude(0);
  }

  // -------------------------------------------------------------
  // Spatial Behaviors (P6) with Preemption
  // -------------------------------------------------------------

  public triggerSpatialBehavior(behavior: SpatialBehaviorType, value?: number) {
    this.activeSpatialAction = behavior;
    if (!this.engine) return;

    switch (behavior) {
      case 'APPROACH':
        this.engine.approach(value ?? 0.8);
        break;
      case 'RETREAT':
        this.engine.retreat(value ?? -1.0);
        break;
      case 'ORBIT':
        this.engine.orbit(value ?? 0.03);
        break;
      case 'DISSOLVE':
        this.engine.dissolve(value ?? 1.0);
        break;
      case 'REFORM':
        this.engine.reform();
        this.activeSpatialAction = null;
        break;
      case 'INTERACT':
        break;
    }
  }

  public onPointerMove(normalizedX: number, normalizedY: number) {
    this.engine?.interact(normalizedX, normalizedY);
  }

  // -------------------------------------------------------------
  // Viewport Anchor Tracker (Single Shared Canvas)
  // -------------------------------------------------------------

  public updateAnchor(targetElement: HTMLElement | null, immediate = false) {
    if (!this.engine) return;

    if (!targetElement) {
      this.engine.setAnchorTarget({ x: 0, y: 0, width: 0, height: 0 }, immediate);
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    this.engine.setAnchorTarget(
      {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
      immediate
    );
  }

  public resetForTest() {
    this.stopAudioAnalysis();
    this.stopSpeaking();
    this.currentState = 'idle';
    this.previousState = 'idle';
    this.currentRequestId = null;
    this.currentGeneration = 0;
    this.activeTaskStatus = 'idle';
    this.isCurrentTaskCancelled = false;
    this.activeSpatialAction = null;
    this.transitionHistory = [];
  }
}
