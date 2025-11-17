import subprocess
import time
import threading
import os
from datetime import datetime

class RecordingManager:
    def __init__(self, camera, fps=30):
        self.camera = camera
        self.fps = fps
        self.width = 640
        self.height = 480
        self.recording = False
        self.ffmpeg_proc = None
        self.record_thread = None
        self.stderr_thread = None
        self.stop_event = threading.Event()
        os.makedirs("videos", exist_ok=True)

    def _read_stderr(self):
        if self.ffmpeg_proc and self.ffmpeg_proc.stderr:
            for line in iter(self.ffmpeg_proc.stderr.readline, b''):
                if line:
                    print(f"[FFMPEG] {line.decode('utf-8', errors='ignore').strip()}")

    def start_recording(self, trigger):
        if self.recording:
            return None
        
        timestamp = datetime.now().strftime("%H%M%S_%d%m%y")
        filename = f"{timestamp}_{trigger}.mp4"
        output_path = os.path.join("videos", filename)
        
        cmd = [
            "ffmpeg", "-y",
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "-s", f"{self.width}x{self.height}",
            "-r", str(self.fps),
            "-i", "pipe:0",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-crf", "28",
            "-movflags", "+faststart",
            "-pix_fmt", "yuv420p",
            output_path
        ]

        try:
            self.ffmpeg_proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdout=subprocess.PIPE,
                bufsize=10**8
            )
            
            self.stderr_thread = threading.Thread(
                target=self._read_stderr,
                daemon=True
            )
            self.stderr_thread.start()
            
            self.recording = True
            self.stop_event.clear()
            self.record_thread = threading.Thread(
                target=self._recording_loop,
                args=(filename,),
                daemon=True
            )
            self.record_thread.start()
            print(f"Recording started: {filename}")
            return filename
        except Exception as e:
            print(f"Failed to start recording: {e}")
            return None

    def _recording_loop(self, filename):
        frame_interval = 1.0 / self.fps
        error_count = 0
        max_errors = 10
        
        while self.recording and not self.stop_event.is_set():
            try:
                start = time.time()
                frame = self.camera.capture_frame()
                
                if self.ffmpeg_proc and self.ffmpeg_proc.poll() is None:
                    self.ffmpeg_proc.stdin.write(frame.tobytes())
                    error_count = 0
                else:
                    print(f"FFmpeg process terminated unexpectedly")
                    break
                
                elapsed = time.time() - start
                sleep_time = max(0, frame_interval - elapsed)
                time.sleep(sleep_time)
            except (BrokenPipeError, IOError) as e:
                error_count += 1
                print(f"Pipe error: {e}")
                if error_count >= max_errors:
                    print(f"Too many errors, stopping recording")
                    break
            except Exception as e:
                print(f"Recording loop error: {e}")
                break

    def stop_recording(self):
        if not self.recording:
            return
        
        print("Stopping recording gracefully")
        self.recording = False
        self.stop_event.set()
        
        if self.record_thread and self.record_thread.is_alive():
            self.record_thread.join(timeout=2)
        
        if self.ffmpeg_proc and self.ffmpeg_proc.poll() is None:
            try:
                self.ffmpeg_proc.stdin.close()
                print("Waiting for ffmpeg to finalize")
                try:
                    stdout, stderr = self.ffmpeg_proc.communicate(timeout=10)
                    if stdout:
                        print(f"[FFMPEG stdout] {stdout.decode('utf-8', errors='ignore')}")
                    if stderr:
                        print(f"[FFMPEG stderr] {stderr.decode('utf-8', errors='ignore')}")
                except subprocess.TimeoutExpired:
                    print("FFmpeg timeout, forcing termination")
                    self.ffmpeg_proc.kill()
                    self.ffmpeg_proc.wait()
            except Exception as e:
                print(f"Error during ffmpeg shutdown: {e}")
                try:
                    self.ffmpeg_proc.kill()
                    self.ffmpeg_proc.wait()
                except:
                    pass
        
        self.ffmpeg_proc = None
        print("Recording stopped and saved")

    def is_recording(self):
        return self.recording

