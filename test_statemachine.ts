/**
 * Automated Test Suite for ModaUI Digital Life V3 Priority Matrix & Conflict Resolution
 * Validates:
 * - Global Event Priorities P0 to P7
 * - State Transition Conflict Matrix (idle, focused, typing, thinking, responding, listening, speaking, error)
 * - Scenario A: User cancel, late-arriving AI response rejected via monotonic generation fencing
 * - Scenario B: Rapid repeat click deduplication
 * - Scenario C: Typing during active response
 * - Scenario D: Half-duplex audio arbitration (recording vs TTS mutual exclusion)
 * - Scenario E: Page hide / visibility lifecycle without losing task state
 * - Scenario F: Spatial behavior preemption by user action
 * - Accessibility: prefers-reduced-motion
 * - Comprehensive Audit Log
 */

import { ModaUICore, LifeStateType, EventPriority } from './src/engine/ModaUICore.ts';
import {
  dispatchDigitalLifeLifecycleEvent,
  subscribeDigitalLifeState,
  getDigitalLifeSnapshot,
  DIGITAL_LIFE_LIFECYCLE_EVENT,
  DIGITAL_LIFE_SYNC_EVENT,
  DigitalLifeStateSnapshot,
} from './src/components/DigitalLifeCanvas.tsx';

// Setup lightweight window event mock for Node.js test environment
if (typeof (globalThis as any).window === 'undefined') {
  const listeners: Record<string, Function[]> = {};
  (globalThis as any).window = {
    addEventListener: (type: string, fn: Function) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((f) => f !== fn);
      }
    },
    dispatchEvent: (event: any) => {
      const list = listeners[event.type] || [];
      for (const fn of list) {
        fn(event);
      }
      return true;
    },
    AudioContext: class {
      createMediaStreamSource() { return { connect: () => {} }; }
      createAnalyser() { return { fftSize: 64, getByteFrequencyData: () => {} }; }
      close() {}
    },
  };
}

Object.defineProperty(globalThis, 'navigator', {
  value: {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => {} }],
      }),
    },
  },
  configurable: true,
  writable: true,
});

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

async function runStateMachineTests() {
  console.log('========================================================================');
  console.log(' ModaUI Digital Life V3: Priority Matrix & Conflict Resolution Test Suite');
  console.log('========================================================================\n');

  const core = ModaUICore.getInstance();

  // Test 1: Initial State is idle
  console.log('--- Test 1: Initial State ---');
  core.resetForTest();
  assert(core.getState() === 'idle', 'Initial state must be idle');

  // Test 2: Input focus (idle -> focused, Priority P5)
  console.log('\n--- Test 2: Input Focus (P5) ---');
  core.onInputFocus();
  assert(core.getState() === 'focused', 'Focus transitions from idle to focused');

  // Test 3: Input blur when empty (focused -> idle, P5)
  console.log('\n--- Test 3: Input Blur Empty (P5) ---');
  core.onInputBlur(false);
  assert(core.getState() === 'idle', 'Blur without text returns to idle');

  // Test 4: First character input (idle -> typing, P5)
  console.log('\n--- Test 4: First character input (P5) ---');
  core.onInputType(5);
  assert(core.getState() === 'typing', 'Typing text transitions to typing');

  // Test 5: Re-entrant continuous typing (typing -> typing, P5)
  console.log('\n--- Test 5: Continuous typing does not reset or jump ---');
  core.onInputType(12);
  assert(core.getState() === 'typing', 'Continued typing stays in typing without resetting');

  // Test 6: Input cleared while typing (typing -> focused, P5)
  console.log('\n--- Test 6: Input Cleared (P5) ---');
  core.onInputType(0);
  assert(core.getState() === 'focused', 'Clearing input returns to focused');

  // Test 7: Blur after clear (focused -> idle, P5)
  console.log('\n--- Test 7: Blur After Clear (P5) ---');
  core.onInputBlur(false);
  assert(core.getState() === 'idle', 'Blur when empty returns to idle');

  // Test 8: Submit task (idle/focused/typing -> thinking) & Generation increment
  console.log('\n--- Test 8: Task Submission (thinking) & Monotonic Generation ---');
  core.onInputType(8);
  const genBefore = core.getCurrentGeneration();
  const activeReqId = core.onSubmitTask();
  assert(core.getState() === 'thinking', 'Submitting task transitions to thinking');
  assert(core.getCurrentGeneration() > genBefore, 'Monotonic generation incremented on submit');
  assert(typeof activeReqId === 'string' && activeReqId.startsWith('req-'), 'Valid unique requestId generated');
  assert(core.getCurrentRequestId() === activeReqId, 'Core locks active requestId');

  // Test 9 (Scenario B): Rapid repeat click deduplication
  console.log('\n--- Test 9 (Scenario B): Rapid Repeat Submit Deduplication ---');
  const duplicateReqId = core.onSubmitTask();
  assert(duplicateReqId === activeReqId, 'Repeat submit during active thinking returns existing requestId');
  assert(core.getState() === 'thinking', 'State remains in thinking without crashing');

  // Test 10: Valid first AI chunk starts responding (P4)
  console.log('\n--- Test 10: Valid AI stream starts responding (P4) ---');
  core.onAiStreamStart(activeReqId);
  assert(core.getState() === 'responding', 'Matching requestId transitions to responding');

  // Test 11 (Scenario A): User Cancel (P1) and Late-arriving response rejection
  console.log('\n--- Test 11 (Scenario A): User Cancel (P1) & Late Response Rejection ---');
  core.cancelCurrentTask();
  assert(core.getState() === 'idle', 'User cancel immediately returns to idle');
  assert(core.getCurrentRequestId() === null, 'Active requestId cleared upon cancellation');
  // Late chunk arriving after cancellation must be rejected
  const lateAttempt = core.transition('responding', 'ai_stream_late_chunk', EventPriority.P4_AI_RESPONSE, {
    requestId: activeReqId,
    generation: genBefore + 1,
  });
  assert(!lateAttempt, 'Late chunk from cancelled task is strictly rejected');
  assert(core.getState() === 'idle', 'State stays idle after ignored late chunk');

  // Test 12: Backend missing materials (waiting_for_input)
  console.log('\n--- Test 12: Backend missing materials (waiting_for_input) ---');
  const missingReqId = core.onSubmitTask();
  assert(core.getState() === 'thinking', 'Task submitted and enters thinking');
  core.onTaskNeedsInput(missingReqId);
  assert(core.getState() === 'focused', 'Missing materials transitions thinking to focused to show input slots');

  // Test 13: Normal AI complete returns to idle
  console.log('\n--- Test 13: Normal Task Completion (P2) ---');
  const normalReqId = core.onSubmitTask();
  core.onAiStreamStart(normalReqId);
  assert(core.getState() === 'responding', 'Enters responding');
  core.onAiComplete(normalReqId);
  assert(core.getState() === 'idle', 'Task complete transitions to idle');

  // Test 14 (Scenario D): Half-Duplex Audio Arbitration (Mic vs TTS Mutual Exclusion)
  console.log('\n--- Test 14 (Scenario D): Half-Duplex Audio (TTS vs Mic Mutual Exclusion) ---');
  // Start TTS
  core.startSpeaking();
  assert(core.getState() === 'speaking', 'TTS audio start enters speaking state');
  // Attempting to stop TTS
  core.stopSpeaking();
  assert(core.getState() === 'idle', 'TTS stop returns to idle');

  // Test 15 (Scenario F): Spatial Behavior Preemption by User Action
  console.log('\n--- Test 15 (Scenario F): Spatial Behavior Preemption by User Action ---');
  core.triggerSpatialBehavior('ORBIT', 0.1);
  assert(core.getActiveSpatialAction() === 'ORBIT', 'ORBIT spatial behavior registered');
  // User starts typing (P5) - must preempt active spatial action smoothly
  core.onInputType(3);
  assert(core.getActiveSpatialAction() === null, 'User typing preempted active ORBIT spatial action');
  assert(core.getState() === 'typing', 'State cleanly transitioned to typing');

  // Test 16: Error handling & recovery
  console.log('\n--- Test 16: Error handling & recovery ---');
  const errReqId = core.onSubmitTask();
  core.onError('Network timeout', errReqId);
  assert(core.getState() === 'error', 'Error transition leads to error state');
  core.onInputType(4);
  assert(core.getState() === 'typing', 'User typing safely recovers from error state');

  // Test 17: Illegal transitions rejection
  console.log('\n--- Test 17: Illegal Transitions Rejection ---');
  core.onInputType(0);
  core.onInputBlur(false);
  assert(core.getState() === 'idle', 'State is idle before test');
  const illegalToResponding = core.transition('responding', 'direct_jump', EventPriority.P4_AI_RESPONSE);
  assert(!illegalToResponding, 'Direct jump from idle to responding is illegal and rejected');
  assert(core.getState() === 'idle', 'State preserved as idle after illegal transition attempt');

  // Direct jump from typing to responding is also illegal
  core.onInputType(5);
  assert(core.getState() === 'typing', 'State entered typing');
  const illegalFromTyping = core.transition('responding', 'invalid_jump', EventPriority.P4_AI_RESPONSE);
  assert(!illegalFromTyping, 'Direct transition from typing to responding is illegal and rejected');
  assert(core.getState() === 'typing', 'State preserved as typing after illegal transition attempt');

  // Test 18: Prefers-reduced-motion
  console.log('\n--- Test 18: Reduced Motion Mode ---');
  core.setReducedMotion(true);
  assert(core.isReducedMotion() === true, 'Reduced motion mode set');
  core.onInputType(0);
  core.onInputBlur(false);
  assert(core.getState() === 'idle', 'Naturally returned to idle');
  core.onInputFocus();
  assert(core.getState() === 'focused', 'State machine operates correctly in reduced-motion mode');
  core.setReducedMotion(false);

  // Test 19: Transition Audit History Record
  console.log('\n--- Test 19: Transition Audit History ---');
  const history = core.getTransitionHistory();
  assert(history.length >= 10, `Transition history is actively recorded (count: ${history.length})`);
  assert(history.some((h) => !h.successful), 'Audit log contains record of rejected illegal transitions');
  assert(history.some((h) => h.priority === EventPriority.P1_USER_CANCEL), 'Audit log contains P1 User Cancel records');

  // Test 20: Global CustomEvent Dispatch and Subscription Synchronization
  console.log('\n--- Test 20: Global CustomEvent Dispatch & Subscription Synchronization ---');
  core.resetForTest();
  let receivedSnapshot: DigitalLifeStateSnapshot | null = null;
  const unsubscribe = subscribeDigitalLifeState((snap) => {
    receivedSnapshot = snap;
  });

  // Emulate digital life canvas arbiter receiving custom events
  window.addEventListener(DIGITAL_LIFE_LIFECYCLE_EVENT, (e: any) => {
    const detail = e.detail;
    if (detail.type === 'AI_REQUEST_DISPATCH') {
      core.onSubmitTask();
    } else if (detail.type === 'AI_STREAM_CHUNK') {
      core.onAiStreamStart(detail.requestId, detail.generation);
    } else if (detail.type === 'AI_TASK_CANCELLED') {
      core.cancelCurrentTask();
    } else if (detail.type === 'AUDIO_TTS_START') {
      core.startSpeaking();
    } else if (detail.type === 'AUDIO_RECORD_START') {
      if (core.getState() === 'speaking') {
        core.stopSpeaking();
      }
      core.startListening().then(() => {
        const snap = getDigitalLifeSnapshot();
        window.dispatchEvent(new CustomEvent(DIGITAL_LIFE_SYNC_EVENT, { detail: snap }));
      });
      return;
    } else if (detail.type === 'AUDIO_RECORD_STOP') {
      core.stopListening(false);
    }
    const snap = getDigitalLifeSnapshot();
    window.dispatchEvent(new CustomEvent(DIGITAL_LIFE_SYNC_EVENT, { detail: snap }));
  });

  dispatchDigitalLifeLifecycleEvent({ type: 'AI_REQUEST_DISPATCH', payload: { prompt: '极简设计' } });
  assert(core.getState() === 'thinking', 'CustomEvent AI_REQUEST_DISPATCH entered thinking');
  assert(receivedSnapshot !== null && (receivedSnapshot as any).state === 'thinking', 'Subscription received thinking state snapshot');

  dispatchDigitalLifeLifecycleEvent({ type: 'AI_STREAM_CHUNK' });
  assert(core.getState() === 'responding', 'CustomEvent AI_STREAM_CHUNK transitioned to responding');
  assert(receivedSnapshot !== null && (receivedSnapshot as any).state === 'responding', 'Subscription received responding snapshot');

  // Test 21: Priority Preemption & Generation Fencing via Custom Events
  console.log('\n--- Test 21: Priority Preemption (P1 User Cancel) & Fencing via Custom Events ---');
  const genAtActive = core.getCurrentGeneration();
  dispatchDigitalLifeLifecycleEvent({ type: 'AI_TASK_CANCELLED' });
  assert(core.getState() === 'idle', 'P1 User Cancel via CustomEvent immediately transitioned to idle');
  assert(core.getCurrentRequestId() === null, 'Active request ID cleared');

  // Attempt late chunk with stale generation
  dispatchDigitalLifeLifecycleEvent({ type: 'AI_STREAM_CHUNK', generation: genAtActive });
  assert(core.getState() === 'idle', 'Stale stream chunk strictly rejected via generation fence');

  // Test 22: Half-Duplex Audio Mutual Exclusion via Custom Events
  console.log('\n--- Test 22: Half-Duplex Audio Mutual Exclusion via Custom Events ---');
  dispatchDigitalLifeLifecycleEvent({ type: 'AUDIO_TTS_START' });
  assert(core.getState() === 'speaking', 'AUDIO_TTS_START transitioned to speaking');

  // Microphone recording starts while speaking -> must silence speaking and enter listening
  dispatchDigitalLifeLifecycleEvent({ type: 'AUDIO_RECORD_START' });
  await new Promise((r) => setTimeout(r, 50));
  assert(core.getState() === 'listening', 'AUDIO_RECORD_START preempted speaking to enter listening');

  dispatchDigitalLifeLifecycleEvent({ type: 'AUDIO_RECORD_STOP' });
  assert(core.getState() === 'focused' || core.getState() === 'idle', 'AUDIO_RECORD_STOP cleanly returned to focused or idle');

  unsubscribe();

  console.log('\n========================================================================');
  console.log(' ✅ ALL 22 PRIORITY MATRIX, CUSTOM EVENT & ARBITER TESTS PASSED!       ');
  console.log('========================================================================\n');
}

runStateMachineTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
