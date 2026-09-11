/**
 * Orbit8D Studio - Main Application Controller
 * Connects AudioEngine, RadarVisualizer, and BatchProcessor with DOM elements,
 * presets, playback controls, and export workflows.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Instantiate Core Subsystems
  const engine = new AudioEngine();
  const canvas = document.getElementById('radarCanvas');
  const visualizer = new RadarVisualizer(canvas, engine);
  const batchProcessor = new BatchProcessor(engine);

  // 2. Preset Definitions
  const PRESETS = {
    classic: {
      speed: 12,
      pattern: 'circle',
      direction: 1,
      radius: 2.5,
      elevation: 0.3,
      reverbType: 'hall',
      reverbMix: 0.30,
      bassBoost: 3.0,
      headShadowing: true
    },
    fast: {
      speed: 6,
      pattern: 'circle',
      direction: 1,
      radius: 2.2,
      elevation: 0.2,
      reverbType: 'room',
      reverbMix: 0.20,
      bassBoost: 4.0,
      headShadowing: true
    },
    cinematic: {
      speed: 16,
      pattern: 'figure8',
      direction: 1,
      radius: 3.2,
      elevation: 0.5,
      reverbType: 'cathedral',
      reverbMix: 0.45,
      bassBoost: 2.0,
      headShadowing: true
    },
    pendulum: {
      speed: 8,
      pattern: 'pendulum',
      direction: 1,
      radius: 2.8,
      elevation: 0.1,
      reverbType: 'hall',
      reverbMix: 0.28,
      bassBoost: 3.0,
      headShadowing: true
    },
    asmr: {
      speed: 14,
      pattern: 'circle',
      direction: 1,
      radius: 1.2,
      elevation: 0.1,
      reverbType: 'room',
      reverbMix: 0.15,
      bassBoost: 1.5,
      headShadowing: true
    }
  };

  // 3. Cache DOM Elements
  // Navigation Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Sliders & Controls
  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');
  const radiusSlider = document.getElementById('radiusSlider');
  const radiusVal = document.getElementById('radiusVal');
  const elevationSlider = document.getElementById('elevationSlider');
  const elevationVal = document.getElementById('elevationVal');
  const reverbMixSlider = document.getElementById('reverbMixSlider');
  const reverbMixVal = document.getElementById('reverbMixVal');
  const bassBoostSlider = document.getElementById('bassBoostSlider');
  const bassBoostVal = document.getElementById('bassBoostVal');
  const reverbTypeSelect = document.getElementById('reverbTypeSelect');
  const headShadowToggle = document.getElementById('headShadowToggle');
  const patternButtons = document.querySelectorAll('[data-pattern]');
  const directionButtons = document.querySelectorAll('[data-direction]');
  const presetChips = document.querySelectorAll('.preset-chip');

  // Player Deck
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const seekBar = document.getElementById('seekBar');
  const currentTimeEl = document.getElementById('currentTime');
  const totalDurationEl = document.getElementById('totalDuration');
  const volumeSlider = document.getElementById('volumeSlider');
  const fileInput = document.getElementById('fileInput');
  const btnUpload = document.getElementById('btnUpload');
  const btnDemoTrack = document.getElementById('btnDemoTrack');
  const btnExportSingle = document.getElementById('btnExportSingle');
  const trackTitle = document.getElementById('trackTitle');
  const trackStatus = document.getElementById('trackStatus');

  // Batch Elements
  const batchDropzone = document.getElementById('batchDropzone');
  const batchFileInput = document.getElementById('batchFileInput');
  const batchTableBody = document.getElementById('batchTableBody');
  const batchEmptyState = document.getElementById('batchEmptyState');
  const btnStartBatch = document.getElementById('btnStartBatch');
  const btnDownloadAllZip = document.getElementById('btnDownloadAllZip');
  const btnClearBatch = document.getElementById('btnClearBatch');
  const queueCount = document.getElementById('queueCount');
  const completedCount = document.getElementById('completedCount');

  // Export Modal
  const exportModal = document.getElementById('exportModal');
  const exportProgressBar = document.getElementById('exportProgressBar');
  const exportPercent = document.getElementById('exportPercent');
  const exportStatusText = document.getElementById('exportStatusText');

  // Guide Modal Elements
  const btnOpenGuide = document.getElementById('btnOpenGuide');
  const guideModal = document.getElementById('guideModal');
  const btnCloseGuide = document.getElementById('btnCloseGuide');
  const btnGotItGuide = document.getElementById('btnGotItGuide');

  // 4. Tab Navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');

      // Re-initialize canvas scale if opening Studio
      if (targetId === 'tabStudio') {
        setTimeout(() => visualizer.initCanvasSize(), 50);
      }
    });
  });

  // 5. Apply Preset Function
  function applyPreset(presetKey) {
    const p = PRESETS[presetKey];
    if (!p) return;

    engine.setSpeed(p.speed);
    speedSlider.value = p.speed;
    speedVal.textContent = `${p.speed}s`;

    engine.setRadius(p.radius);
    radiusSlider.value = p.radius;
    radiusVal.textContent = `${p.radius.toFixed(1)}m`;

    engine.setElevation(p.elevation);
    elevationSlider.value = p.elevation;
    elevationVal.textContent = `${p.elevation > 0 ? '+' : ''}${p.elevation.toFixed(1)}m`;

    engine.setPattern(p.pattern);
    patternButtons.forEach(b => {
      b.classList.toggle('active', b.dataset.pattern === p.pattern);
    });

    engine.setDirection(p.direction);
    directionButtons.forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.direction) === p.direction);
    });

    engine.setReverbType(p.reverbType);
    reverbTypeSelect.value = p.reverbType;

    engine.setReverbMix(p.reverbMix);
    reverbMixSlider.value = p.reverbMix;
    reverbMixVal.textContent = `${Math.round(p.reverbMix * 100)}%`;

    engine.setBassBoost(p.bassBoost);
    bassBoostSlider.value = p.bassBoost;
    bassBoostVal.textContent = `+${p.bassBoost.toFixed(1)}dB`;

    engine.setHeadShadowing(p.headShadowing);
    headShadowToggle.checked = p.headShadowing;

    presetChips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.preset === presetKey);
    });
  }

  // Preset Chips Event
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      applyPreset(chip.dataset.preset);
    });
  });

  // 6. Bind Sliders & Real-Time Controls
  speedSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    speedVal.textContent = `${val}s`;
    engine.setSpeed(val);
  });

  radiusSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    radiusVal.textContent = `${val.toFixed(1)}m`;
    engine.setRadius(val);
  });

  elevationSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    elevationVal.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}m`;
    engine.setElevation(val);
  });

  reverbMixSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    reverbMixVal.textContent = `${Math.round(val * 100)}%`;
    engine.setReverbMix(val);
  });

  bassBoostSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    bassBoostVal.textContent = `+${val.toFixed(1)}dB`;
    engine.setBassBoost(val);
  });

  reverbTypeSelect.addEventListener('change', (e) => {
    engine.setReverbType(e.target.value);
  });

  headShadowToggle.addEventListener('change', (e) => {
    engine.setHeadShadowing(e.target.checked);
  });

  patternButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      patternButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      engine.setPattern(btn.dataset.pattern);
    });
  });

  directionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      directionButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      engine.setDirection(parseInt(btn.dataset.direction));
    });
  });

  volumeSlider.addEventListener('input', (e) => {
    engine.setVolume(parseFloat(e.target.value));
  });

  // 7. Playback & Track Management
  function updatePlayPauseUI(isPlaying) {
    if (isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      trackStatus.textContent = 'Memutar Audio 8D Spasial...';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      trackStatus.textContent = engine.isPaused ? 'Dijeda' : 'Siap';
    }
  }

  playPauseBtn.addEventListener('click', async () => {
    if (!engine.audioBuffer) {
      // If no audio loaded yet, generate demo track
      await loadSynthDemoTrack();
    }

    if (engine.isPlaying) {
      engine.pause();
      updatePlayPauseUI(false);
    } else {
      await engine.play();
      updatePlayPauseUI(true);
    }
  });

  seekBar.addEventListener('input', (e) => {
    const pct = parseFloat(e.target.value);
    const seekTime = (pct / 100) * engine.duration;
    engine.seek(seekTime);
  });

  engine.onTimeUpdate = (current, total) => {
    if (total > 0) {
      seekBar.value = (current / total) * 100;
      currentTimeEl.textContent = formatTime(current);
      totalDurationEl.textContent = formatTime(total);
    }
  };

  engine.onPlaybackEnded = () => {
    updatePlayPauseUI(false);
    seekBar.value = 0;
    currentTimeEl.textContent = '0:00';
  };

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Load Single File
  btnUpload.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    trackTitle.textContent = file.name;
    trackStatus.textContent = 'Memuat dan mendecode audio...';

    try {
      await engine.loadAudioFile(file);
      totalDurationEl.textContent = formatTime(engine.duration);
      trackStatus.textContent = 'Siap Diputar';
      engine.play(0);
      updatePlayPauseUI(true);
    } catch (err) {
      console.error(err);
      trackStatus.textContent = 'Gagal memuat file audio';
    }
  });

  // Synthesizer Demo Track
  async function loadSynthDemoTrack() {
    trackTitle.textContent = 'Cyberpunk 8D Chillwave (Procedural Demo)';
    trackStatus.textContent = 'Menghasilkan instrumen sintetis...';
    try {
      await engine.generateDemoTrack();
      totalDurationEl.textContent = formatTime(engine.duration);
      trackStatus.textContent = 'Siap Diputar';
    } catch (err) {
      console.error(err);
      trackStatus.textContent = 'Gagal menghasilkan demo';
    }
  }

  btnDemoTrack.addEventListener('click', async () => {
    await loadSynthDemoTrack();
    engine.play(0);
    updatePlayPauseUI(true);
  });

  // 8. Single Track 8D Export
  btnExportSingle.addEventListener('click', async () => {
    if (!engine.audioBuffer) {
      alert('Silakan muat file audio terlebih dahulu atau gunakan lagu demo!');
      return;
    }

    exportModal.classList.add('active');
    exportPercent.textContent = '0%';
    exportProgressBar.style.width = '0%';
    exportStatusText.textContent = 'Menyiapkan DSP 8D & HRTF Filter...';

    try {
      const result = await engine.export8D(engine.audioBuffer, engine.settings, (progress) => {
        exportPercent.textContent = `${progress}%`;
        exportProgressBar.style.width = `${progress}%`;
        if (progress > 50 && progress < 90) {
          exportStatusText.textContent = 'Merender spasialisasi 3D dan akustik gema...';
        } else if (progress >= 90) {
          exportStatusText.textContent = 'Mengonversi ke 16-Bit PCM WAV...';
        }
      });

      exportStatusText.textContent = 'Selesai! Mengunduh file 8D...';

      // Download
      const link = document.createElement('a');
      link.href = result.url;
      const originalName = trackTitle.textContent.replace(/\.[^/.]+$/, '').replace(/ /g, '_');
      link.download = `${originalName}_8D.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        exportModal.classList.remove('active');
      }, 1200);
    } catch (err) {
      console.error(err);
      exportStatusText.textContent = 'Error: ' + err.message;
      setTimeout(() => exportModal.classList.remove('active'), 2500);
    }
  });

  // 9. Batch Processor UI & Events
  batchDropzone.addEventListener('click', () => batchFileInput.click());

  batchDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    batchDropzone.classList.add('drag-over');
  });

  batchDropzone.addEventListener('dragleave', () => {
    batchDropzone.classList.remove('drag-over');
  });

  batchDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    batchDropzone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      batchProcessor.addFiles(e.dataTransfer.files);
    }
  });

  batchFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      batchProcessor.addFiles(e.target.files);
      batchFileInput.value = '';
    }
  });

  // Render Queue Table
  batchProcessor.onQueueUpdated = (queue) => {
    queueCount.textContent = queue.length;
    const completed = queue.filter(it => it.status === 'done').length;
    completedCount.textContent = completed;

    btnDownloadAllZip.disabled = completed === 0;
    btnStartBatch.disabled = queue.length === 0 || batchProcessor.isProcessing;

    if (queue.length === 0) {
      batchEmptyState.style.display = 'table-row';
      batchTableBody.querySelectorAll('tr:not(#batchEmptyState)').forEach(tr => tr.remove());
      return;
    }

    batchEmptyState.style.display = 'none';

    // Update or insert rows
    queue.forEach((item, idx) => {
      let row = document.getElementById(item.id);
      if (!row) {
        row = document.createElement('tr');
        row.id = item.id;
        row.innerHTML = `
          <td>${idx + 1}</td>
          <td class="queue-track-name">${item.name}</td>
          <td>${item.size}</td>
          <td class="item-dur">${batchProcessor.formatTime(item.duration)}</td>
          <td class="item-status"></td>
          <td class="item-progress">
            <div class="item-progress-bar">
              <div class="item-progress-fill" style="width: 0%"></div>
            </div>
          </td>
          <td class="item-actions"></td>
        `;
        batchTableBody.appendChild(row);
      }

      // Update row state
      const statusCell = row.querySelector('.item-status');
      const progressFill = row.querySelector('.item-progress-fill');
      const durCell = row.querySelector('.item-dur');
      const actionsCell = row.querySelector('.item-actions');

      durCell.textContent = batchProcessor.formatTime(item.duration);
      progressFill.style.width = `${item.progress}%`;

      let badgeHtml = '';
      if (item.status === 'pending') badgeHtml = '<span class="status-badge status-pending">Menunggu</span>';
      else if (item.status === 'processing') badgeHtml = `<span class="status-badge status-processing">Memproses ${item.progress}%</span>`;
      else if (item.status === 'done') badgeHtml = '<span class="status-badge status-done">Selesai ✅</span>';
      else if (item.status === 'error') badgeHtml = `<span class="status-badge status-error">Error</span>`;
      statusCell.innerHTML = badgeHtml;

      // Action buttons
      if (item.status === 'done') {
        actionsCell.innerHTML = `
          <button class="btn btn-secondary btn-sm" onclick="window.appDownloadSingle('${item.id}')" title="Unduh WAV">
            ⬇️ Unduh
          </button>
        `;
      } else if (item.status === 'pending') {
        actionsCell.innerHTML = `
          <button class="btn btn-secondary btn-sm" onclick="window.appRemoveItem('${item.id}')" title="Hapus">
            ✕
          </button>
        `;
      } else {
        actionsCell.innerHTML = '';
      }
    });

    // Remove obsolete rows
    const currentIds = new Set(queue.map(it => it.id));
    batchTableBody.querySelectorAll('tr:not(#batchEmptyState)').forEach(tr => {
      if (!currentIds.has(tr.id)) tr.remove();
    });
  };

  // Expose download and remove to window for inline onclicks
  window.appDownloadSingle = (id) => batchProcessor.downloadItem(id);
  window.appRemoveItem = (id) => batchProcessor.removeItem(id);

  // Start Batch
  btnStartBatch.addEventListener('click', () => {
    btnStartBatch.disabled = true;
    btnStartBatch.textContent = '⏳ Sedang Memproses...';
    batchProcessor.startBatch(engine.settings);
  });

  batchProcessor.onBatchCompleted = () => {
    btnStartBatch.disabled = false;
    btnStartBatch.textContent = '⚡ Mulai Konversi Semua';
  };

  // Download All as ZIP
  btnDownloadAllZip.addEventListener('click', async () => {
    btnDownloadAllZip.disabled = true;
    btnDownloadAllZip.textContent = '📦 Mengemas ZIP...';
    await batchProcessor.downloadAllAsZip('Orbit8D_Batch_Converted.zip');
    btnDownloadAllZip.disabled = false;
    btnDownloadAllZip.textContent = '📦 Download Semua (ZIP)';
  });

  // Clear Batch
  btnClearBatch.addEventListener('click', () => {
    if (confirm('Kosongkan semua antrean batch?')) {
      batchProcessor.clearQueue();
    }
  });

  // 10. Guide Modal Controller
  function openGuide() {
    if (guideModal) guideModal.classList.add('active');
  }

  function closeGuide() {
    if (guideModal) guideModal.classList.remove('active');
  }

  if (btnOpenGuide) btnOpenGuide.addEventListener('click', openGuide);
  if (btnCloseGuide) btnCloseGuide.addEventListener('click', closeGuide);
  if (btnGotItGuide) btnGotItGuide.addEventListener('click', closeGuide);

  if (guideModal) {
    guideModal.addEventListener('click', (e) => {
      if (e.target === guideModal) closeGuide();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeGuide();
      if (exportModal) exportModal.classList.remove('active');
    }
  });

  // Initialize Default Preset
  applyPreset('classic');
});
