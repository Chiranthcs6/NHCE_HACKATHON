import os
import sys
import time
import signal
import numpy as np
from datetime import datetime
from collections import deque
from dotenv import load_dotenv
from intrusion_system import IntrusionSystem
from features import event
from gpio_handler import GPIOHandler
from audio_handler import AudioHandler
from camera_handler import CameraHandler
from recording_manager import RecordingManager
from websocket_server import WebSocketServer
from settings_manager import SettingsManager

load_dotenv("dotenv")

class MainSystem:
    def __init__(self):
        self.running = False
        self.frame_count = 0
        self.detection_interval = int(os.getenv('DETECTION_FRAME_INTERVAL', 3))
        
        print("=" * 50)
        print("Initializing Intrusion Detection System")
        print("=" * 50)
        
        self.intrusion_system = IntrusionSystem(load_existing=True)
        self.gpio = GPIOHandler()
        self.audio = AudioHandler()
        self.camera = CameraHandler()
        self.recorder = RecordingManager(self.camera, self.camera.fps)
        self.settings = SettingsManager()
        self.ws = WebSocketServer(self.on_websocket_message)
        
        self.recording_grace_timer = 0
        self.recording_active = False
        self.current_trigger = None
        self.current_video = None
        
        self.last_probability_send = 0
        self.probability_send_interval = 5.0
        
        self.pending_feedback = {}
        self.awaiting_feedback = False
        self.last_feedback_time = 0
        self.last_feedback_features = None
        
        self.learning_clip_duration = int(os.getenv('LEARNING_CLIP_DURATION', 15))
        self.learning_clip_timer = 0
        
        self.cooldown_config = {
            'learning': 15.0,
            'confidence': 30.0,
            'normal': 60.0
        }
        
        self.motion_active = False
        self.noise_active = False
        self.person_detected = False
        self.current_detected_person = None
        
        self.motion_threshold = float(os.getenv('MOTION_THRESHOLD', 0.02))
        self.noise_threshold = float(os.getenv('NOISE_THRESHOLD', 0.1))
        self.high_zcr_threshold = float(os.getenv('HIGH_ZCR_THRESHOLD', 0.1))
        
        window_size = float(os.getenv('TEMPORAL_WINDOW_SIZE', 1.0))
        self.motion_window_size = int(window_size * self.camera.fps / self.detection_interval)
        self.motion_history = deque(maxlen=self.motion_window_size)
        
        print(f"Motion threshold: {self.motion_threshold}")
        print(f"Noise threshold: {self.noise_threshold}")
        print(f"Temporal window: {window_size}s ({self.motion_window_size} samples)")
        
        self.load_system_state()
        
        print("=" * 50)
        print("System initialization complete")
        print("=" * 50)
    
    def load_system_state(self):
        state_file = 'system_state.json'
        if os.path.exists(state_file):
            import json
            with open(state_file, 'r') as f:
                state = json.load(f)
            self.training_count = state.get('training_count', 0)
            self.operation_mode = state.get('operation_mode', 'learning')
            print(f"Loaded state: mode={self.operation_mode}, count={self.training_count}")
        else:
            self.training_count = 0
            self.operation_mode = 'learning'
            print("No saved state, starting fresh: mode=learning, count=0")
    
    def save_system_state(self):
        import json
        state = {
            'training_count': self.training_count,
            'operation_mode': self.operation_mode
        }
        with open('system_state.json', 'w') as f:
            json.dump(state, f, indent=2)
        print(f"State saved: mode={self.operation_mode}, count={self.training_count}")
    
    def start(self):
        self.running = True
        self.audio.start()
        self.ws.start()
        
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        print("\n" + "=" * 50)
        print("System started, entering main loop")
        print("=" * 50 + "\n")
        
        self.main_loop()
    
    def main_loop(self):
        while self.running:
            try:
                frame = self.camera.capture_frame()
                
                if self.frame_count % 100 == 0:
                    if self.settings.check_for_updates():
                        print("[Settings] Reloaded from file")
                
                should_detect = (self.frame_count % self.detection_interval == 0)
                if should_detect:
                    self.process_frame(frame)
                
                if self.recorder.is_recording():
                    self.manage_recording()
                
                self.frame_count += 1
                time.sleep(0.001)
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"[ERROR] Main loop: {e}")
                time.sleep(1)
    
    def process_frame(self, frame):
        gpio_data = self.gpio.read_states()
        audio_data = self.audio.get_features()
        
        # GPIO transitions already tracked by gpio_handler
        for transition in gpio_data['transitions']:
            self.send_log(transition)
            print(f"[GPIO] {transition}")
        
        motion_level = self.camera.detect_motion(frame)
        person_confidence = self.camera.detect_person(frame)
        
        self.motion_history.append(motion_level)
        
        peak_motion = 0.0
        mean_motion = 0.0
        motion_variance = 0.0
        high_motion_frames = 0
        
        if len(self.motion_history) > 0:
            motion_array = np.array(self.motion_history)
            peak_motion = float(np.max(motion_array))
            mean_motion = float(np.mean(motion_array))
            motion_variance = float(np.var(motion_array))
            high_motion_frames = int(np.sum(motion_array > self.motion_threshold))
        
        # Track motion state changes
        if motion_level > self.motion_threshold and not self.motion_active:
            self.motion_active = True
            self.send_log("motion_started")
            print(f"[Motion] Started (level={motion_level:.3f})")
        elif motion_level <= self.motion_threshold and self.motion_active:
            self.motion_active = False
            self.send_log("motion_stopped")
            print(f"[Motion] Stopped (level={motion_level:.3f})")
        
        # Track unexpected noise state changes (high RMS AND high ZCR)
        is_unexpected_noise = (audio_data['noise_rms'] > self.noise_threshold and 
                               audio_data['noise_zcr'] > self.high_zcr_threshold)
        
        if is_unexpected_noise and not self.noise_active:
            self.noise_active = True
            self.send_log("unexpected_noise_detected")
            print(f"[Audio] Unexpected noise (RMS={audio_data['noise_rms']:.3f}, ZCR={audio_data['noise_zcr']:.3f})")
        elif not is_unexpected_noise and self.noise_active:
            self.noise_active = False
            self.send_log("unexpected_noise_stopped")
            print(f"[Audio] Unexpected noise stopped")
        
        # Track person detection state changes
        unknown_person = False
        detected_names = []
        
        if person_confidence > 0.5:
            unknown_person, detected_names = self.camera.detect_faces(frame)
            
            if len(detected_names) > 0:
                names_str = ", ".join(detected_names)
                
                # Only log if detection state changed
                if not self.person_detected or self.current_detected_person != names_str:
                    self.person_detected = True
                    self.current_detected_person = names_str
                    
                    if unknown_person:
                        self.send_log("unknown_person_detected")
                        print(f"[Camera] Unknown person detected (confidence={person_confidence:.2f})")
                    else:
                        self.send_log(f"known_person_detected:{names_str}")
                        print(f"[Camera] Known person(s) detected: {names_str} (confidence={person_confidence:.2f})")
        else:
            # Person left frame
            if self.person_detected:
                self.person_detected = False
                self.current_detected_person = None
                self.send_log("person_left")
                print(f"[Camera] Person left frame")
        
        event.door_open = gpio_data['door_open']
        event.window_open = gpio_data['window_open']
        event.motion_level = motion_level
        event.person_confidence = person_confidence
        event.unknown_person = unknown_person
        event.noise_rms = audio_data['noise_rms']
        event.noise_zcr = audio_data['noise_zcr']
        event.is_away = self.settings.is_away_mode()
        event.is_asleep = self.settings.is_sleep_time()
        
        event.peak_rms = audio_data['peak_rms']
        event.mean_rms = audio_data['mean_rms']
        event.peak_zcr = audio_data['peak_zcr']
        event.mean_zcr = audio_data['mean_zcr']
        event.peak_motion = peak_motion
        event.mean_motion = mean_motion
        event.motion_variance = motion_variance
        event.high_motion_frames = high_motion_frames
        
        e = event()
        result = self.intrusion_system.detect(e)
        probability = result['probability']
        
        thresholds = self.settings.get_thresholds()
        high_threshold = thresholds.get('high', 0.8)
        
        if probability >= high_threshold:
            self.gpio.activate_buzzer()
        else:
            self.gpio.deactivate_buzzer()
        
        current_time = time.time()
        if current_time - self.last_probability_send >= self.probability_send_interval:
            self.send_probability(probability)
            self.last_probability_send = current_time
        
        
        self.check_recording_triggers(unknown_person, probability)
        self.check_feedback_request(probability, unknown_person)
 
    def check_recording_triggers(self, unknown_person, probability):
        thresholds = self.settings.get_thresholds()
        medium_threshold = thresholds.get('medium', 0.5)
        
        if self.operation_mode == 'learning':
            if not self.recording_active:
                self.current_video = self.recorder.start_recording("learning_clip")
                self.recording_active = True
                self.current_trigger = "learning_clip"
                self.learning_clip_timer = self.learning_clip_duration
                print(f"[Recording] Started learning clip ({self.learning_clip_duration}s)")
        else:
            trigger_active = probability > medium_threshold
            
            if trigger_active and not self.recording_active:
                trigger_reason = "intrusion_detected"
                self.current_video = self.recorder.start_recording(trigger_reason)
                self.recording_active = True
                self.current_trigger = trigger_reason
                self.recording_grace_timer = 60
                print(f"[Recording] Started: {trigger_reason} (probability={probability:.3f})")
    
    def manage_recording(self):
        if self.operation_mode == 'learning':
            if self.learning_clip_timer > 0:
                self.learning_clip_timer -= (1.0 / self.camera.fps * self.detection_interval)
            
            if self.learning_clip_timer <= 0 and self.recording_active:
                self.recorder.stop_recording()
                self.recording_active = False
                
                if self.current_video:
                    print(f"[Recording] Learning clip saved: {os.path.basename(self.current_video)}")
                    
                    e = event()
                    result = self.intrusion_system.detect(e)
                    probability = result['probability']
                    
                    self.request_feedback_with_video(probability, False)
                
                self.current_video = None
                self.current_trigger = None
        else:
            if self.recording_grace_timer > 0:
                self.recording_grace_timer -= (1.0 / self.camera.fps * self.detection_interval)
            
            if self.recording_grace_timer <= 0 and self.recording_active:
                self.recorder.stop_recording()
                self.recording_active = False
                
                if self.current_video:
                    print(f"[Recording] Stopped and saved: {os.path.basename(self.current_video)}")
                    
                    e = event()
                    result = self.intrusion_system.detect(e)
                    probability = result['probability']
                    
                    self.request_feedback_with_video(probability, False)
                
                self.current_video = None
                self.current_trigger = None
 
    def check_feedback_request(self, probability, unknown_person):
        if self.awaiting_feedback:
            return
        
        if self.operation_mode == 'learning':
            return
        
        current_time = time.time()
        cooldown = self.cooldown_config.get(self.operation_mode, 30.0)
        
        if current_time - self.last_feedback_time < cooldown:
            return
        
        priority_score = 0
        
        if unknown_person:
            priority_score += 100
        
        if self.operation_mode == 'confidence':
            if probability > 0.3:
                priority_score += 40
        elif self.operation_mode == 'normal':
            uncertainty = abs(probability - 0.5)
            if uncertainty < 0.15:
                priority_score += 30
        
        if self.last_feedback_features is not None:
            current_features = event().preprocess()
            state_distance = np.linalg.norm(
                np.array(current_features) - np.array(self.last_feedback_features)
            )
            if state_distance > 1.5:
                priority_score += 20
        
        if priority_score >= 50:
            self.request_feedback(probability, unknown_person)
            self.last_feedback_time = current_time
            print(f"[Feedback] Priority score={priority_score}, requesting feedback")
    
    def request_feedback(self, probability, unknown_person):
        timestamp = datetime.now().isoformat()
        trigger = "unknown_person" if unknown_person else "high_probability"
        
        current_features = event().preprocess()
        
        self.pending_feedback[timestamp] = {
            'probability': probability,
            'trigger': trigger,
            'video': self.current_video,
            'features': current_features
        }
        
        self.awaiting_feedback = True
        self.last_feedback_features = current_features
        
        message = {
            'jsonType': 'feedback_request',
            'time': timestamp,
            'trigger': trigger,
            'video': self.current_video or "",
            'training_count': self.training_count,
            'operation_mode': self.operation_mode,
            'probability': round(probability, 3)
        }
        
        self.ws.send(message)
        print(f"[Feedback] Requested: {trigger} (p={probability:.2f}) - Awaiting response...")
    
    def request_feedback_with_video(self, probability, unknown_person):
        timestamp = datetime.now().isoformat()
        trigger = "video_feedback"
        
        current_features = event().preprocess()
        
        self.pending_feedback[timestamp] = {
            'probability': probability,
            'trigger': trigger,
            'video': self.current_video,
            'features': current_features
        }
        
        self.awaiting_feedback = True
        self.last_feedback_features = current_features
        
        message = {
            'jsonType': 'feedback_request',
            'time': timestamp,
            'trigger': trigger,
            'video': self.current_video or "",
            'training_count': self.training_count,
            'operation_mode': self.operation_mode,
            'probability': round(probability, 3)
        }
        
        self.ws.send(message)
        print(f"[Feedback] Video feedback requested: {os.path.basename(self.current_video or 'no_video')}")
    
    def on_websocket_message(self, data):
        if data.get('jsonType') == 'feedback_response':
            timestamp = data.get('requestId')
            label = data.get('label')
            
            if timestamp in self.pending_feedback:
                feedback_data = self.pending_feedback[timestamp]
                e = event()
                self.intrusion_system.update(e, label)
                
                self.training_count += 1
                
                learning_threshold = int(os.getenv('LEARNING_PHASE_SAMPLES', '100'))
                confidence_threshold = int(os.getenv('CONFIDENCE_PHASE_SAMPLES', '250'))
                
                if self.training_count >= learning_threshold and self.operation_mode == 'learning':
                    self.operation_mode = 'confidence'
                    print("\n" + "=" * 50)
                    print(f"SWITCHED TO CONFIDENCE BUILDING MODE ({learning_threshold} samples)")
                    print("=" * 50 + "\n")
                elif self.training_count >= confidence_threshold and self.operation_mode == 'confidence':
                    self.operation_mode = 'normal'
                    print("\n" + "=" * 50)
                    print(f"SWITCHED TO NORMAL OPERATION MODE ({confidence_threshold} samples)")
                    print("=" * 50 + "\n")
                
                self.save_system_state()
                self.intrusion_system.save()
                del self.pending_feedback[timestamp]
                
                self.awaiting_feedback = False
                
                target = learning_threshold if self.operation_mode == 'learning' else confidence_threshold
                print(f"[Feedback] Processed: label={label}, count={self.training_count}/{target}")
    
    def send_log(self, event_type):
        message = {
            'jsonType': 'log',
            'event': event_type,
            'time': datetime.now().isoformat()
        }
        self.ws.send(message)
 
    def send_probability(self, probability):
        message = {
            'jsonType': 'probability',
            'time': datetime.now().isoformat(),
            'probab': probability
        }
        self.ws.send(message)
    
    def send_video_notification(self, video_path):
        message = {
            'jsonType': 'video',
            'videoPath': os.path.basename(video_path)
        }
        self.ws.send(message)
    
    def signal_handler(self, signum, frame):
        print("\n" + "=" * 50)
        print("Shutdown signal received")
        print("=" * 50)
        self.shutdown()
    
    def shutdown(self):
        self.running = False
        
        print("Stopping recording...")
        if self.recorder.is_recording():
            self.recorder.stop_recording()
        
        print("Saving system state...")
        self.intrusion_system.save()
        self.save_system_state()
        
        print("Cleaning up resources...")
        self.audio.stop()
        self.camera.cleanup()
        self.gpio.cleanup()
        self.settings.cleanup()
        self.ws.stop()
        
        print("=" * 50)
        print("Shutdown complete")
        print("=" * 50)
        sys.exit(0)

if __name__ == "__main__":
    system = MainSystem()
    system.start()

