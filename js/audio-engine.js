/**
 * Orbit8D Studio - Core 8D Audio Engine
 * High-performance Web Audio API DSP architecture featuring:
 * - HRTF 3D PannerNode with multi-pattern spatial orbits
 * - Dynamic Head-Shadowing BiquadFilter (Pinna acoustic occlusion)
 * - Algorithmic Convolution Reverb (Studio Room, Concert Hall, Cathedral, Cosmic)
 * - Low-end / Bass Preserver Filter
 * - Real-time AnalyserNode
 * - OfflineAudioContext batch/single 8D WAV renderer
 * - Built-in procedural Synthwave/Chillwave demo track generator
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.audioBuffer = null;
    this.sourceNode = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.pauseOffset = 0;
    this.startTime = 0;
    this.duration = 0;

    // DSP Nodes
    this.bassFilter = null;
    this.headShadowFilter = null;
    this.pannerNode = null;
    this.dryGain = null;
    this.wetGain = null;
    this.convolver = null;
    this.convolverPreFilter = null;
    this.masterGain = null;
    this.analyser = null;

    // Engine Parameters
    this.settings = {
      speed: 12,              // seconds per full orbit cycle
      direction: 1,           // 1: Clockwise, -1: Counter-Clockwise
      pattern: 'circle',      // 'circle', 'figure8', 'pendulum'
      radius: 2.5,            // orbit radius (meters)
      elevation: 0.3,         // vertical height offset (meters)
      reverbType: 'hall',     // 'room', 'hall', 'cathedral', 'space'
      reverbMix: 0.30,        // 0.0 to 1.0 wet mix
      headShadowing: true,    // enable pinna back-of-head lowpass
      bassBoost: 3.0,         // dB boost for low frequencies
      volume: 0.9,            // master volume
      isManualOrbit: false,   // true if user is dragging orb
      manualPos: { x: 0, y: 0, z: 2.5 }
    };

    // Position state
    this.currentPos = { x: 0, y: 0.3, z: 2.5, angle: 0 };
    this.animationFrame = null;
    this.onPositionUpdate = null;
    this.onPlaybackEnded = null;
    this.onTimeUpdate = null;
  }

  // Initialize Web Audio Context on user gesture
  async init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // Build the DSP graph
  setupGraph() {
    if (!this.ctx) return;

    // 1. Bass Preserver (Low-shelf filter)
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.value = 120;
    this.bassFilter.gain.value = this.settings.bassBoost;

    // 2. Dynamic Head-Shadowing Filter (Simulates ear attenuation when sound is behind)
    this.headShadowFilter = this.ctx.createBiquadFilter();
    this.headShadowFilter.type = 'lowpass';
    this.headShadowFilter.frequency.value = 20000;
    this.headShadowFilter.Q.value = 0.7;

    // 3. HRTF 3D PannerNode
    this.pannerNode = this.ctx.createPanner();
    this.pannerNode.panningModel = 'HRTF';
    this.pannerNode.distanceModel = 'inverse';
    this.pannerNode.refDistance = 1;
    this.pannerNode.maxDistance = 10000;
    this.pannerNode.rolloffFactor = 0.8;
    this.pannerNode.coneInnerAngle = 360;

    // Center listener orientation at (0, 0, 0) facing forward (0, 0, 1), up (0, 1, 0)
    if (this.ctx.listener.forwardX) {
      this.ctx.listener.forwardX.setValueAtTime(0, this.ctx.currentTime);
      this.ctx.listener.forwardY.setValueAtTime(0, this.ctx.currentTime);
      this.ctx.listener.forwardZ.setValueAtTime(1, this.ctx.currentTime);
      this.ctx.listener.upX.setValueAtTime(0, this.ctx.currentTime);
      this.ctx.listener.upY.setValueAtTime(1, this.ctx.currentTime);
      this.ctx.listener.upZ.setValueAtTime(0, this.ctx.currentTime);
    } else {
      this.ctx.listener.setOrientation(0, 0, 1, 0, 1, 0);
    }

    // 4. Reverb Network (ConvolverNode + Gain Mix)
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.generateImpulseResponse(this.ctx, this.settings.reverbType);

    this.convolverPreFilter = this.ctx.createBiquadFilter();
    this.convolverPreFilter.type = 'lowpass';
    this.convolverPreFilter.frequency.value = 5500;

    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();
    this.updateReverbMix(this.settings.reverbMix);

    // 5. AnalyserNode for Real-Time Visualizer
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;

    // 6. Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.settings.volume, this.ctx.currentTime);

    // DSP Connections:
    // Bass -> HeadShadow -> Panner
    this.bassFilter.connect(this.headShadowFilter);
    this.headShadowFilter.connect(this.pannerNode);

    // Panner -> Dry Gain -> Analyser
    this.pannerNode.connect(this.dryGain);
    this.dryGain.connect(this.analyser);

    // Panner -> ConvolverPreFilter -> Convolver -> Wet Gain -> Analyser
    this.pannerNode.connect(this.convolverPreFilter);
    this.convolverPreFilter.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.analyser);

    // Analyser -> Master Gain -> Destination
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  // Load audio file into AudioBuffer
  async loadAudioFile(file) {
    await this.init();
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.duration = this.audioBuffer.duration;
    this.pauseOffset = 0;
    return this.audioBuffer;
  }

  // Set buffer directly (e.g. from synth demo)
  setAudioBuffer(buffer) {
    this.audioBuffer = buffer;
    this.duration = buffer.duration;
    this.pauseOffset = 0;
  }

  // Playback control
  async play(startOffset = null) {
    if (!this.audioBuffer) return;
    await this.init();

    if (this.isPlaying) {
      this.stop(false);
    }

    this.setupGraph();

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.bassFilter);

    const offset = startOffset !== null ? startOffset : this.pauseOffset;
    this.startTime = this.ctx.currentTime - offset;

    this.sourceNode.onended = () => {
      if (this.isPlaying && this.getCurrentTime() >= this.duration - 0.2) {
        this.isPlaying = false;
        this.isPaused = false;
        this.pauseOffset = 0;
        cancelAnimationFrame(this.animationFrame);
        if (this.onPlaybackEnded) this.onPlaybackEnded();
      }
    };

    this.sourceNode.start(0, offset);
    this.isPlaying = true;
    this.isPaused = false;

    this.startModulationLoop();
  }

  pause() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getCurrentTime();
    this.stop(false);
    this.isPaused = true;
  }

  stop(resetOffset = true) {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }
    this.isPlaying = false;
    cancelAnimationFrame(this.animationFrame);
    if (resetOffset) {
      this.pauseOffset = 0;
      this.isPaused = false;
    }
  }

  seek(time) {
    time = Math.max(0, Math.min(time, this.duration));
    const wasPlaying = this.isPlaying;
    this.stop(false);
    this.pauseOffset = time;
    if (wasPlaying) {
      this.play(time);
    }
  }

  getCurrentTime() {
    if (!this.isPlaying) return this.pauseOffset;
    return Math.min(this.ctx.currentTime - this.startTime, this.duration);
  }

  // Spatial Orbit Modulation Loop (Smooth 60 FPS)
  startModulationLoop() {
    const loop = () => {
      if (!this.isPlaying) return;

      const currentTime = this.getCurrentTime();
      this.updateSpatialPosition(currentTime);

      if (this.onTimeUpdate) {
        this.onTimeUpdate(currentTime, this.duration);
      }

      this.animationFrame = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = requestAnimationFrame(loop);
  }

  // Compute 3D Coordinates based on orbit pattern & time
  calculateCoordinates(time, settings) {
    if (settings.isManualOrbit) {
      return {
        x: settings.manualPos.x,
        y: settings.manualPos.y,
        z: settings.manualPos.z,
        angle: Math.atan2(settings.manualPos.x, settings.manualPos.z)
      };
    }

    const { speed, direction, pattern, radius, elevation } = settings;
    // Normalized angle (0 to 2*PI per 'speed' seconds)
    const omega = (2 * Math.PI) / Math.max(0.1, speed);
    const angle = (time * omega * direction) % (2 * Math.PI);

    let x = 0;
    let z = 0;
    let y = elevation;

    switch (pattern) {
      case 'figure8': {
        // Lissajous / Lemniscate of Bernoulli
        // x = r * sin(t), z = r * sin(t) * cos(t)
        x = radius * Math.sin(angle);
        z = radius * Math.sin(angle) * Math.cos(angle) * 1.5;
        y = elevation + Math.sin(angle * 2) * 0.2;
        break;
      }
      case 'pendulum': {
        // Sweeps left to right in front / around listener
        const swing = Math.sin(angle);
        x = radius * swing * 1.3;
        z = radius * Math.cos(swing * 1.2) * 0.9;
        y = elevation;
        break;
      }
      case 'circle':
      default: {
        // True 360 circular orbit
        // In Web Audio: X is left(-)/right(+), Y is up(+)/down(-), Z is behind(-)/front(+)
        x = radius * Math.sin(angle);
        z = radius * Math.cos(angle);
        y = elevation + Math.sin(angle * 3) * 0.15; // subtle organic float
        break;
      }
    }

    return { x, y, z, angle };
  }

  // Update DSP parameters dynamically
  updateSpatialPosition(time) {
    if (!this.pannerNode || !this.ctx) return;

    const coords = this.calculateCoordinates(time, this.settings);
    this.currentPos = coords;

    const t = this.ctx.currentTime;
    const ramp = 0.05;

    // Apply HRTF position
    if (this.pannerNode.positionX) {
      this.pannerNode.positionX.setTargetAtTime(coords.x, t, ramp);
      this.pannerNode.positionY.setTargetAtTime(coords.y, t, ramp);
      this.pannerNode.positionZ.setTargetAtTime(coords.z, t, ramp);
    } else {
      this.pannerNode.setPosition(coords.x, coords.y, coords.z);
    }

    // Dynamic Pinna Head-Shadowing
    // If sound is behind listener (z < 0), lower the cutoff frequency to simulate head occlusion
    if (this.settings.headShadowing && this.headShadowFilter) {
      if (coords.z < 0) {
        // Behind listener: interpolate cutoff from 20kHz down to 3500Hz
        const rearRatio = Math.min(1, Math.abs(coords.z) / this.settings.radius);
        const targetFreq = 20000 - rearRatio * 15500; // 4500Hz to 20000Hz
        this.headShadowFilter.frequency.setTargetAtTime(targetFreq, t, 0.08);
      } else {
        // In front: transparent full spectrum
        this.headShadowFilter.frequency.setTargetAtTime(20000, t, 0.08);
      }
    }

    // Emit event for visualizer
    if (this.onPositionUpdate) {
      this.onPositionUpdate(coords);
    }
  }

  // Update Real-Time Settings
  setSpeed(speed) {
    this.settings.speed = parseFloat(speed);
  }

  setDirection(direction) {
    this.settings.direction = parseInt(direction);
  }

  setPattern(pattern) {
    this.settings.pattern = pattern;
  }

  setRadius(radius) {
    this.settings.radius = parseFloat(radius);
  }

  setElevation(elevation) {
    this.settings.elevation = parseFloat(elevation);
  }

  setBassBoost(boost) {
    this.settings.bassBoost = parseFloat(boost);
    if (this.bassFilter && this.ctx) {
      this.bassFilter.gain.setTargetAtTime(this.settings.bassBoost, this.ctx.currentTime, 0.05);
    }
  }

  setHeadShadowing(enabled) {
    this.settings.headShadowing = Boolean(enabled);
    if (!this.settings.headShadowing && this.headShadowFilter && this.ctx) {
      this.headShadowFilter.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.05);
    }
  }

  setReverbType(type) {
    this.settings.reverbType = type;
    if (this.convolver && this.ctx) {
      this.convolver.buffer = this.generateImpulseResponse(this.ctx, type);
    }
  }

  setReverbMix(mix) {
    this.settings.reverbMix = parseFloat(mix);
    this.updateReverbMix(this.settings.reverbMix);
  }

  updateReverbMix(mix) {
    if (!this.dryGain || !this.wetGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Equal-power crossfade
    const dry = Math.cos(mix * 0.5 * Math.PI);
    const wet = Math.sin(mix * 0.5 * Math.PI);
    this.dryGain.gain.setTargetAtTime(dry, t, 0.05);
    this.wetGain.gain.setTargetAtTime(wet, t, 0.05);
  }

  setVolume(vol) {
    this.settings.volume = parseFloat(vol);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.settings.volume, this.ctx.currentTime, 0.05);
    }
  }

  setManualPosition(x, z, radius = 2.5) {
    this.settings.isManualOrbit = true;
    this.settings.manualPos = { x, y: this.settings.elevation, z };
    if (this.isPlaying) {
      this.updateSpatialPosition(this.getCurrentTime());
    } else if (this.onPositionUpdate) {
      this.onPositionUpdate({ x, y: this.settings.elevation, z, angle: Math.atan2(x, z) });
    }
  }

  resumeAutoOrbit() {
    this.settings.isManualOrbit = false;
  }

  // Algorithmic Impulse Response Generator for Lush Realistic Reverb
  generateImpulseResponse(ctx, type = 'hall') {
    const sampleRate = ctx.sampleRate;
    let duration = 2.5;
    let decay = 2.2;
    let preDelay = 0.02;

    switch (type) {
      case 'room':
        duration = 1.2;
        decay = 1.5;
        preDelay = 0.01;
        break;
      case 'cathedral':
        duration = 4.5;
        decay = 3.8;
        preDelay = 0.04;
        break;
      case 'space':
        duration = 6.0;
        decay = 5.0;
        preDelay = 0.06;
        break;
      case 'hall':
      default:
        duration = 2.6;
        decay = 2.4;
        preDelay = 0.025;
        break;
    }

    const length = Math.floor(sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const preDelaySamples = Math.floor(sampleRate * preDelay);

    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }
      const n = (i - preDelaySamples) / (length - preDelaySamples);
      const envelope = Math.pow(1 - n, decay);
      // High-frequency damping over time
      const damping = Math.exp(-3 * n);
      left[i] = (Math.random() * 2 - 1) * envelope * damping;
      right[i] = (Math.random() * 2 - 1) * envelope * damping;
    }

    return impulse;
  }

  // -------------------------------------------------------------
  // Built-in Synthesizer Demo Track (Chillwave / Cyberpunk 8D Loop)
  // -------------------------------------------------------------
  async generateDemoTrack() {
    await this.init();
    const sampleRate = 44100;
    const bpm = 110;
    const beatSec = 60 / bpm;
    const bars = 8;
    const duration = bars * 4 * beatSec; // ~17.45 seconds loop
    const totalSamples = Math.floor(sampleRate * duration);

    // Render using OfflineAudioContext for pristine audio fidelity
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    // Chords: Am -> F -> C -> G
    const chordNotes = [
      [220.00, 261.63, 329.63, 392.00], // Am7: A3, C4, E4, G4
      [174.61, 220.00, 261.63, 329.63], // Fmaj7: F3, A3, C4, E4
      [261.63, 329.63, 392.00, 493.88], // Cmaj7: C4, E4, G4, B4
      [196.00, 246.94, 293.66, 392.00]  // G: G3, B3, D4, G4
    ];
    const bassNotes = [110.00, 87.31, 130.81, 98.00]; // A2, F2, C3, G2

    const chordDuration = 4 * beatSec;

    // Master bus in offline context
    const master = offlineCtx.createGain();
    master.gain.value = 0.85;
    master.connect(offlineCtx.destination);

    // 1. Lush Pad Synthesizer
    for (let bar = 0; bar < bars; bar++) {
      const chordIndex = bar % 4;
      const startTime = bar * chordDuration;
      const notes = chordNotes[chordIndex];

      notes.forEach((freq, idx) => {
        const osc = offlineCtx.createOscillator();
        const filter = offlineCtx.createBiquadFilter();
        const gain = offlineCtx.createGain();

        osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        // Slight chorus detune
        osc.detune.setValueAtTime((idx - 1.5) * 7, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, startTime);
        filter.frequency.exponentialRampToValueAtTime(1800, startTime + chordDuration * 0.5);
        filter.frequency.exponentialRampToValueAtTime(700, startTime + chordDuration);

        // ASDR envelope
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.5);
        gain.gain.setValueAtTime(0.08, startTime + chordDuration - 0.4);
        gain.gain.linearRampToValueAtTime(0.001, startTime + chordDuration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);

        osc.start(startTime);
        osc.stop(startTime + chordDuration);
      });

      // 2. Punchy Sub-Bass
      const bassFreq = bassNotes[chordIndex];
      const bassOsc = offlineCtx.createOscillator();
      const bassFilter = offlineCtx.createBiquadFilter();
      const bassGain = offlineCtx.createGain();

      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(bassFreq, startTime);

      bassFilter.type = 'lowpass';
      bassFilter.frequency.value = 250;

      bassGain.gain.setValueAtTime(0, startTime);
      bassGain.gain.linearRampToValueAtTime(0.24, startTime + 0.05);
      bassGain.gain.exponentialRampToValueAtTime(0.12, startTime + chordDuration * 0.9);
      bassGain.gain.linearRampToValueAtTime(0.001, startTime + chordDuration);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(master);

      bassOsc.start(startTime);
      bassOsc.stop(startTime + chordDuration);
    }

    // 3. Arpeggio Lead Sequence
    const arpNotes = [440, 523.25, 659.25, 783.99, 880, 783.99, 659.25, 523.25];
    const totalSixteenths = bars * 16;
    const sixteenthSec = beatSec / 4;

    for (let step = 0; step < totalSixteenths; step++) {
      if (step % 2 === 0) { // eighth notes
        const startTime = step * sixteenthSec;
        const noteFreq = arpNotes[(step / 2) % arpNotes.length];

        const arpOsc = offlineCtx.createOscillator();
        const arpGain = offlineCtx.createGain();

        arpOsc.type = 'sine';
        arpOsc.frequency.setValueAtTime(noteFreq, startTime);

        arpGain.gain.setValueAtTime(0, startTime);
        arpGain.gain.linearRampToValueAtTime(0.06, startTime + 0.02);
        arpGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.18);

        arpOsc.connect(arpGain);
        arpGain.connect(master);

        arpOsc.start(startTime);
        arpOsc.stop(startTime + 0.2);
      }
    }

    // 4. Chill Beats (Kick, Snare, Hihat)
    const totalBeats = bars * 4;
    for (let beat = 0; beat < totalBeats; beat++) {
      const startTime = beat * beatSec;

      // Kick on 1 and 3
      if (beat % 2 === 0) {
        const kickOsc = offlineCtx.createOscillator();
        const kickGain = offlineCtx.createGain();
        kickOsc.frequency.setValueAtTime(140, startTime);
        kickOsc.frequency.exponentialRampToValueAtTime(45, startTime + 0.12);
        kickGain.gain.setValueAtTime(0.35, startTime);
        kickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
        kickOsc.connect(kickGain);
        kickGain.connect(master);
        kickOsc.start(startTime);
        kickOsc.stop(startTime + 0.25);
      }

      // Snare on 2 and 4
      if (beat % 2 === 1) {
        // Noise burst
        const bufferSize = Math.floor(sampleRate * 0.15);
        const noiseBuffer = offlineCtx.createBuffer(1, bufferSize, sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = offlineCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        const snareFilter = offlineCtx.createBiquadFilter();
        snareFilter.type = 'highpass';
        snareFilter.frequency.value = 1000;
        const snareGain = offlineCtx.createGain();
        snareGain.gain.setValueAtTime(0.18, startTime);
        snareGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
        whiteNoise.connect(snareFilter);
        snareFilter.connect(snareGain);
        snareGain.connect(master);
        whiteNoise.start(startTime);
        whiteNoise.stop(startTime + 0.15);
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    this.setAudioBuffer(renderedBuffer);
    return renderedBuffer;
  }

  // -------------------------------------------------------------
  // High-Speed Offline 8D Audio Renderer & WAV Exporter
  // -------------------------------------------------------------
  async export8D(inputBuffer, customSettings = null, onProgress = null) {
    const settings = customSettings || { ...this.settings };
    const sampleRate = inputBuffer.sampleRate;
    const duration = inputBuffer.duration;
    const totalSamples = Math.floor(sampleRate * duration);

    // Create OfflineAudioContext (2-channel Stereo)
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    // Graph setup in offline context
    const source = offlineCtx.createBufferSource();
    source.buffer = inputBuffer;

    const bass = offlineCtx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 120;
    bass.gain.value = settings.bassBoost;

    const headShadow = offlineCtx.createBiquadFilter();
    headShadow.type = 'lowpass';
    headShadow.frequency.value = 20000;
    headShadow.Q.value = 0.7;

    const panner = offlineCtx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 0.8;

    if (offlineCtx.listener.forwardX) {
      offlineCtx.listener.forwardX.setValueAtTime(0, 0);
      offlineCtx.listener.forwardY.setValueAtTime(0, 0);
      offlineCtx.listener.forwardZ.setValueAtTime(1, 0);
      offlineCtx.listener.upX.setValueAtTime(0, 0);
      offlineCtx.listener.upY.setValueAtTime(1, 0);
      offlineCtx.listener.upZ.setValueAtTime(0, 0);
    } else {
      offlineCtx.listener.setOrientation(0, 0, 1, 0, 1, 0);
    }

    // Reverb
    const convolver = offlineCtx.createConvolver();
    convolver.buffer = this.generateImpulseResponse(offlineCtx, settings.reverbType);

    const convolverPreFilter = offlineCtx.createBiquadFilter();
    convolverPreFilter.type = 'lowpass';
    convolverPreFilter.frequency.value = 5500;

    const dryGain = offlineCtx.createGain();
    const wetGain = offlineCtx.createGain();

    const dryVal = Math.cos(settings.reverbMix * 0.5 * Math.PI);
    const wetVal = Math.sin(settings.reverbMix * 0.5 * Math.PI);
    dryGain.gain.setValueAtTime(dryVal, 0);
    wetGain.gain.setValueAtTime(wetVal, 0);

    const master = offlineCtx.createGain();
    master.gain.setValueAtTime(settings.volume, 0);

    // Connections
    source.connect(bass);
    bass.connect(headShadow);
    headShadow.connect(panner);

    panner.connect(dryGain);
    dryGain.connect(master);

    panner.connect(convolverPreFilter);
    convolverPreFilter.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(master);

    master.connect(offlineCtx.destination);

    // Pre-calculate trajectory automation keyframes (approx 60 points/sec for buttery smooth 3D motion)
    const timeStep = 1 / 60;
    const totalSteps = Math.ceil(duration / timeStep);

    for (let step = 0; step < totalSteps; step++) {
      const time = step * timeStep;
      const coords = this.calculateCoordinates(time, settings);

      if (panner.positionX) {
        panner.positionX.setValueAtTime(coords.x, time);
        panner.positionY.setValueAtTime(coords.y, time);
        panner.positionZ.setValueAtTime(coords.z, time);
      } else {
        panner.setPosition(coords.x, coords.y, coords.z);
      }

      if (settings.headShadowing) {
        if (coords.z < 0) {
          const rearRatio = Math.min(1, Math.abs(coords.z) / settings.radius);
          const targetFreq = 20000 - rearRatio * 15500;
          headShadow.frequency.setValueAtTime(targetFreq, time);
        } else {
          headShadow.frequency.setValueAtTime(20000, time);
        }
      }
    }

    source.start(0);

    // Progress simulation while offline context is processing
    let progressTimer = null;
    if (onProgress) {
      let currentPercent = 5;
      onProgress(currentPercent);
      progressTimer = setInterval(() => {
        if (currentPercent < 90) {
          currentPercent += Math.min(15, (90 - currentPercent) * 0.25);
          onProgress(Math.floor(currentPercent));
        }
      }, 100);
    }

    const renderedBuffer = await offlineCtx.startRendering();

    if (progressTimer) clearInterval(progressTimer);
    if (onProgress) onProgress(98);

    // Convert rendered AudioBuffer to 16-bit WAV PCM Blob
    const wavBlob = this.audioBufferToWav(renderedBuffer);
    if (onProgress) onProgress(100);

    return {
      buffer: renderedBuffer,
      blob: wavBlob,
      url: URL.createObjectURL(wavBlob)
    };
  }

  // Convert Web AudioBuffer to standard 16-bit PCM WAV Blob
  audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // Helper functions
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF identifier
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true); // file length - 8
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk size (16 for PCM)
    view.setUint16(20, format, true); // audio format (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels & write 16-bit signed integer samples
    const channels = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(buffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        // Clamp and convert float [-1.0, 1.0] to int16 [-32768, 32767]
        let sample = Math.max(-1, Math.min(1, channels[c][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
}

// Export for ES modules and global window
if (typeof window !== 'undefined') {
  window.AudioEngine = AudioEngine;
}
