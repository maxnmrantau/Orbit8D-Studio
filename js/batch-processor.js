/**
 * Orbit8D Studio - Batch Processor & Queue Manager
 * Handles multi-file ingestion, sequential/parallel 8D rendering via OfflineAudioContext,
 * per-file progress tracking, individual downloads, and 1-click ZIP archiving.
 */

class BatchProcessor {
  constructor(audioEngine) {
    this.engine = audioEngine;
    this.queue = [];
    this.isProcessing = false;
    this.cancelRequested = false;

    // UI Callbacks
    this.onQueueUpdated = null;
    this.onItemProgress = null;
    this.onBatchCompleted = null;
  }

  // Format file size
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // Format duration in mm:ss
  formatTime(seconds) {
    if (isNaN(seconds) || seconds <= 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Add multiple files to queue
  async addFiles(fileList) {
    const newItems = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i)) {
        continue;
      }

      const item = {
        id: 'track_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        file: file,
        name: file.name,
        cleanName: file.name.replace(/\.[^/.]+$/, ''),
        size: this.formatSize(file.size),
        duration: null,
        status: 'pending', // 'pending' | 'processing' | 'done' | 'error'
        progress: 0,
        resultBlob: null,
        resultUrl: null,
        errorMsg: null
      };

      this.queue.push(item);
      newItems.push(item);
    }

    if (this.onQueueUpdated) this.onQueueUpdated(this.queue);

    // Asynchronously probe duration in background
    for (const item of newItems) {
      this.probeAudioDuration(item);
    }

    return newItems;
  }

  // Probe audio duration by decoding metadata
  async probeAudioDuration(item) {
    try {
      const arrayBuffer = await item.file.slice(0, 1024 * 512).arrayBuffer(); // first 512kb
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioCtx();
      try {
        const fullBuffer = await item.file.arrayBuffer();
        const decoded = await tempCtx.decodeAudioData(fullBuffer);
        item.duration = decoded.duration;
        item.decodedBuffer = decoded; // cache to save time during render
      } catch (e) {
        item.duration = 0;
      } finally {
        await tempCtx.close();
      }
    } catch (err) {
      item.duration = 0;
    }
    if (this.onQueueUpdated) this.onQueueUpdated(this.queue);
  }

  // Remove single item from queue
  removeItem(id) {
    const idx = this.queue.findIndex(item => item.id === id);
    if (idx !== -1) {
      if (this.queue[idx].resultUrl) {
        URL.revokeObjectURL(this.queue[idx].resultUrl);
      }
      this.queue.splice(idx, 1);
      if (this.onQueueUpdated) this.onQueueUpdated(this.queue);
    }
  }

  // Clear entire queue
  clearQueue() {
    if (this.isProcessing) {
      this.cancelRequested = true;
    }
    this.queue.forEach(item => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    });
    this.queue = [];
    if (this.onQueueUpdated) this.onQueueUpdated(this.queue);
  }

  // Start processing all pending items in queue
  async startBatch(customSettings = null) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.cancelRequested = false;

    const pendingItems = this.queue.filter(item => item.status === 'pending' || item.status === 'error');

    for (let i = 0; i < pendingItems.length; i++) {
      if (this.cancelRequested) break;

      const item = pendingItems[i];
      item.status = 'processing';
      item.progress = 5;
      if (this.onItemProgress) this.onItemProgress(item);
      if (this.onQueueUpdated) this.onQueueUpdated(this.queue);

      try {
        let bufferToProcess = item.decodedBuffer;
        if (!bufferToProcess) {
          const arrayBuffer = await item.file.arrayBuffer();
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          const tempCtx = new AudioCtx();
          bufferToProcess = await tempCtx.decodeAudioData(arrayBuffer);
          await tempCtx.close();
        }

        const settings = customSettings || this.engine.settings;
        const result = await this.engine.export8D(bufferToProcess, settings, (percent) => {
          item.progress = percent;
          if (this.onItemProgress) this.onItemProgress(item);
        });

        item.resultBlob = result.blob;
        item.resultUrl = result.url;
        item.status = 'done';
        item.progress = 100;
      } catch (err) {
        console.error('Failed to convert track:', item.name, err);
        item.status = 'error';
        item.errorMsg = err.message || 'Render Error';
      }

      if (this.onItemProgress) this.onItemProgress(item);
      if (this.onQueueUpdated) this.onQueueUpdated(this.queue);
    }

    this.isProcessing = false;
    this.cancelRequested = false;
    if (this.onBatchCompleted) this.onBatchCompleted(this.queue);
  }

  // Download individual rendered item
  downloadItem(id) {
    const item = this.queue.find(it => it.id === id);
    if (!item || !item.resultBlob) return;

    const link = document.createElement('a');
    link.href = item.resultUrl;
    link.download = `${item.cleanName}_8D.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Download all completed items in a single ZIP file
  async downloadAllAsZip(zipFilename = 'Orbit8D_Batch_Export.zip', onZipProgress = null) {
    const completedItems = this.queue.filter(it => it.status === 'done' && it.resultBlob);
    if (completedItems.length === 0) return;

    // Check if JSZip is loaded in window
    if (typeof window.JSZip !== 'undefined') {
      const zip = new window.JSZip();
      const folder = zip.folder('8D_Audio_Tracks');

      completedItems.forEach(item => {
        folder.file(`${item.cleanName}_8D.wav`, item.resultBlob);
      });

      if (onZipProgress) onZipProgress(20);

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 4 }
      }, (metadata) => {
        if (onZipProgress) {
          onZipProgress(Math.floor(metadata.percent));
        }
      });

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } else {
      // Fallback: trigger sequential individual downloads
      for (let i = 0; i < completedItems.length; i++) {
        setTimeout(() => {
          this.downloadItem(completedItems[i].id);
        }, i * 400);
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.BatchProcessor = BatchProcessor;
}
