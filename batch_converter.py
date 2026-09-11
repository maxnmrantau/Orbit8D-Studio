#!/usr/bin/env python3
"""
Orbit8D Studio - Python CLI Batch Converter
Converts entire folders of audio files into 8D Spatial Audio.
Uses standard numpy & wave for high performance DSP processing.

Usage:
    python batch_converter.py --input ./input_songs --output ./output_8d --speed 12 --reverb 0.3
"""

import os
import sys
import math
import wave
import argparse
import numpy as np

def create_reverb_ir(sample_rate, duration=2.2, decay=2.5, pre_delay=0.02):
    """Generates synthetic stereo impulse response for acoustic room reverb."""
    total_samples = int(sample_rate * duration)
    pre_samples = int(sample_rate * pre_delay)
    
    t = np.linspace(0, 1, total_samples - pre_samples)
    envelope = np.power(1.0 - t, decay) * np.exp(-3.0 * t)
    
    noise_l = (np.random.rand(len(t)) * 2 - 1) * envelope
    noise_r = (np.random.rand(len(t)) * 2 - 1) * envelope
    
    ir_l = np.zeros(total_samples, dtype=np.float32)
    ir_r = np.zeros(total_samples, dtype=np.float32)
    
    ir_l[pre_samples:] = noise_l
    ir_r[pre_samples:] = noise_r
    
    # Normalize
    norm_l = np.max(np.abs(ir_l))
    norm_r = np.max(np.abs(ir_r))
    if norm_l > 0: ir_l /= norm_l
    if norm_r > 0: ir_r /= norm_r
    
    return ir_l, ir_r

def process_8d_audio(input_wav_path, output_wav_path, speed=12.0, reverb_mix=0.30, pattern='circle'):
    """
    Applies 8D spatial binaural panning, ITD time-delay, and room reverb to a WAV file.
    """
    print(f"[*] Processing: {os.path.basename(input_wav_path)} -> 8D Audio...")

    with wave.open(input_wav_path, 'rb') as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)

    # Convert to float numpy array
    if sampwidth == 2:
        audio = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 1:
        audio = (np.frombuffer(raw_bytes, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        audio = np.frombuffer(raw_bytes, dtype=np.int32).astype(np.float32) / 2147483648.0

    if n_channels == 1:
        left = audio
        right = audio
    else:
        left = audio[0::2]
        right = audio[1::2]

    num_samples = len(left)
    total_time = num_samples / framerate
    time_array = np.linspace(0, total_time, num_samples, endpoint=False)

    # 1. Circular Orbit Trajectory Modulation
    omega = (2.0 * math.pi) / max(0.5, speed)
    angle = (time_array * omega) % (2.0 * math.pi)

    # Equal power panning law:
    # pan from -1.0 (Left) to +1.0 (Right) via sin(angle)
    pan = np.sin(angle)
    pan_angle = (pan + 1.0) * (math.pi / 4.0) # 0 to pi/2
    gain_l = np.cos(pan_angle)
    gain_r = np.sin(pan_angle)

    # 2. Interaural Time Difference (ITD): ~0.65ms max delay between ears
    max_delay_samples = int(framerate * 0.00065)
    delay_l = np.clip((pan * max_delay_samples).astype(int), 0, max_delay_samples)
    delay_r = np.clip((-pan * max_delay_samples).astype(int), 0, max_delay_samples)

    panned_l = left * gain_l
    panned_r = right * gain_r

    # Shift channels based on delay
    shifted_l = np.zeros_like(panned_l)
    shifted_r = np.zeros_like(panned_r)
    
    # Block-wise shift approximation
    block_size = 2048
    for i in range(0, num_samples, block_size):
        end = min(i + block_size, num_samples)
        d_l = int(delay_l[i])
        d_r = int(delay_r[i])
        
        src_start_l = max(0, i - d_l)
        src_start_r = max(0, i - d_r)
        
        shifted_l[i:end] = panned_l[src_start_l:src_start_l + (end - i)]
        shifted_r[i:end] = panned_r[src_start_r:src_start_r + (end - i)]

    # 3. Head-Shadowing Occlusion (behind listener when cos(angle) < 0)
    # Simple dynamic high-frequency smoothing
    rear_ratio = np.clip(-np.cos(angle), 0, 1)
    # Low-pass blend when sound is behind
    smooth_l = np.copy(shifted_l)
    smooth_r = np.copy(shifted_r)
    alpha = 0.4
    for idx in range(1, num_samples):
        if rear_ratio[idx] > 0.1:
            w = rear_ratio[idx] * alpha
            smooth_l[idx] = (1.0 - w) * shifted_l[idx] + w * smooth_l[idx - 1]
            smooth_r[idx] = (1.0 - w) * shifted_r[idx] + w * smooth_r[idx - 1]

    # 4. Room Reverb
    if reverb_mix > 0:
        ir_l, ir_r = create_reverb_ir(framerate, duration=1.8, decay=2.0)
        mono_input = (smooth_l + smooth_r) * 0.5
        
        # Fast FFT convolution
        rev_l = np.convolve(mono_input, ir_l, mode='full')[:num_samples]
        rev_r = np.convolve(mono_input, ir_r, mode='full')[:num_samples]
        
        dry_weight = math.cos(reverb_mix * 0.5 * math.pi)
        wet_weight = math.sin(reverb_mix * 0.5 * math.pi)
        
        out_l = dry_weight * smooth_l + wet_weight * rev_l
        out_r = dry_weight * smooth_r + wet_weight * rev_r
    else:
        out_l = smooth_l
        out_r = smooth_r

    # Peak normalization to prevent clipping
    max_peak = max(np.max(np.abs(out_l)), np.max(np.abs(out_r)), 0.001)
    if max_peak > 0.95:
        out_l = (out_l / max_peak) * 0.95
        out_r = (out_r / max_peak) * 0.95

    # Interleave to 16-bit stereo PCM
    out_l_int16 = (out_l * 32767).astype(np.int16)
    out_r_int16 = (out_r * 32767).astype(np.int16)
    interleaved = np.empty((num_samples * 2,), dtype=np.int16)
    interleaved[0::2] = out_l_int16
    interleaved[1::2] = out_r_int16

    os.makedirs(os.path.dirname(os.path.abspath(output_wav_path)), exist_ok=True)
    with wave.open(output_wav_path, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(framerate)
        wf.writeframes(interleaved.tobytes())

    print(f"[OK] Saved: {output_wav_path}")

def batch_convert_directory(input_dir, output_dir, speed=12.0, reverb=0.30):
    if not os.path.exists(input_dir):
        print(f"[!] Directory not found: {input_dir}")
        return

    files = [f for f in os.listdir(input_dir) if f.lower().endswith('.wav')]
    if not files:
        print(f"[!] No .wav files found in {input_dir}. (Tip: You can convert mp3 to wav using ffmpeg or use the Web UI)")
        return

    print(f"[+] Found {len(files)} files to convert in {input_dir}")
    for idx, fname in enumerate(files, 1):
        in_path = os.path.join(input_dir, fname)
        out_name = os.path.splitext(fname)[0] + "_8D.wav"
        out_path = os.path.join(output_dir, out_name)
        print(f"\n[{idx}/{len(files)}] Processing {fname}...")
        try:
            process_8d_audio(in_path, out_path, speed=speed, reverb_mix=reverb)
        except Exception as e:
            print(f"[X] Error converting {fname}: {e}")

    print("\n[+] Batch Conversion Completed!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orbit8D Studio - CLI Batch 8D Audio Converter")
    parser.add_argument("--input", "-i", type=str, default="./songs", help="Input directory containing audio WAV files")
    parser.add_argument("--output", "-o", type=str, default="./output_8d", help="Output directory for converted 8D files")
    parser.add_argument("--speed", "-s", type=float, default=12.0, help="Seconds per full 360-degree rotation cycle (default: 12.0)")
    parser.add_argument("--reverb", "-r", type=float, default=0.30, help="Reverb wet mix ratio 0.0 - 0.6 (default: 0.30)")

    args = parser.parse_args()
    batch_convert_directory(args.input, args.output, speed=args.speed, reverb=args.reverb)
