import pyaudio
import numpy as np
import threading
import os
from collections import deque
from dotenv import load_dotenv

load_dotenv()

class AudioHandler:
    def __init__(self):
        self.device = os.getenv('AUDIO_DEVICE', 'plughw:3,0')
        self.chunk_size = int(os.getenv('AUDIO_CHUNK_SIZE', 1024))
        self.rate = int(os.getenv('AUDIO_RATE', 44100))
        self.window_size = float(os.getenv('TEMPORAL_WINDOW_SIZE', 1.0))
        
        self.rms = 0.0
        self.zcr = 0.0
        
        self.max_window_samples = int(self.window_size * self.rate / self.chunk_size)
        self.rms_history = deque(maxlen=self.max_window_samples)
        self.zcr_history = deque(maxlen=self.max_window_samples)
        
        self.peak_rms = 0.0
        self.mean_rms = 0.0
        self.peak_zcr = 0.0
        self.mean_zcr = 0.0
        
        self.running = False
        self.thread = None
        self.audio = pyaudio.PyAudio()
        self.stream = None
        self._validate_device()
    
    def _validate_device(self):
        device_index = None
        for i in range(self.audio.get_device_count()):
            dev_info = self.audio.get_device_info_by_index(i)
            if self.device in str(dev_info.get('name', '')):
                device_index = i
                break
        
        if device_index is None:
            print(f"Audio device {self.device} not found, using default")
            device_index = self.audio.get_default_input_device_info()['index']
        
        self.device_index = device_index
        print(f"Audio device validated: index={device_index}")
    
    def start(self):
        self.stream = self.audio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=self.rate,
            input=True,
            input_device_index=self.device_index,
            frames_per_buffer=self.chunk_size
        )
        
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
        print("Audio capture started")
    
    def _capture_loop(self):
        while self.running:
            try:
                data = self.stream.read(self.chunk_size, exception_on_overflow=False)
                samples = np.frombuffer(data, dtype=np.int16).astype(np.float32)
                
                self.rms = np.sqrt(np.mean(samples**2)) / 32768.0
                zero_crossings = np.sum(np.abs(np.diff(np.sign(samples)))) / 2
                self.zcr = zero_crossings / len(samples)
                
                self.rms_history.append(self.rms)
                self.zcr_history.append(self.zcr)
                
                if len(self.rms_history) > 0:
                    self.peak_rms = float(max(self.rms_history))
                    self.mean_rms = float(np.mean(self.rms_history))
                    self.peak_zcr = float(max(self.zcr_history))
                    self.mean_zcr = float(np.mean(self.zcr_history))
                
            except Exception as e:
                print(f"Audio capture error: {e}")
    
    def get_features(self):
        return {
            'noise_rms': float(self.rms),
            'noise_zcr': float(self.zcr),
            'peak_rms': float(self.peak_rms),
            'mean_rms': float(self.mean_rms),
            'peak_zcr': float(self.peak_zcr),
            'mean_zcr': float(self.mean_zcr)
        }
    
    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        self.audio.terminate()
        print("Audio capture stopped")

