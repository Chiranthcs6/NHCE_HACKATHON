import cv2
import numpy as np
from picamera2 import Picamera2
from tflite_runtime.interpreter import Interpreter
from simple_facerec import SimpleFacerec
import os
from dotenv import load_dotenv

load_dotenv()

class CameraHandler:
    def __init__(self):
        self.fps = int(os.getenv('CAMERA_FPS', 30))
        self.width = 640
        self.height = 480
        
        self.picam2 = Picamera2()
        config = self.picam2.create_video_configuration(
            main={"size": (self.width, self.height), "format": "RGB888"}
        )
        self.picam2.configure(config)
        self.picam2.start()
        
        self.interpreter = Interpreter(model_path="requisites/detect.tflite")
        self.interpreter.allocate_tensors()
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()
        
        self.model_height = self.input_details[0]['shape'][1]
        self.model_width = self.input_details[0]['shape'][2]
        
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(detectShadows=False)
        
        self.sfr = SimpleFacerec()
        if os.path.exists("images/"):
            self.sfr.load_encoding_images("images/")
            print("Face encodings loaded")
        else:
            print("Warning: images/ directory not found")
        
        self.PERSON_CLASS_ID = 0
        self.CONFIDENCE_THRESHOLD = 0.5
        
        print(f"Camera initialized: {self.width}x{self.height}@{self.fps}fps")
    
    def capture_frame(self):
        frame = self.picam2.capture_array()
        return frame
    
    def detect_motion(self, frame):
        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        fg_mask = self.bg_subtractor.apply(frame_bgr)
        motion_pixels = cv2.countNonZero(fg_mask)
        total_pixels = fg_mask.shape[0] * fg_mask.shape[1]
        motion_confidence = (motion_pixels / total_pixels)
        
        return motion_confidence
    
    def detect_person(self, frame):
        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        frame_resized = cv2.resize(frame_bgr, (self.model_width, self.model_height))
        input_data = np.expand_dims(frame_resized, axis=0)
        
        self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
        self.interpreter.invoke()
        
        boxes = self.interpreter.get_tensor(self.output_details[0]['index'])[0]
        classes = self.interpreter.get_tensor(self.output_details[1]['index'])[0]
        scores = self.interpreter.get_tensor(self.output_details[2]['index'])[0]
        
        person_confidence = 0.0
        for i in range(len(scores)):
            if classes[i] == self.PERSON_CLASS_ID and scores[i] > self.CONFIDENCE_THRESHOLD:
                if scores[i] > person_confidence:
                    person_confidence = scores[i]
        
        return float(person_confidence)
    
    def detect_faces(self, frame):
        if not hasattr(self.sfr, 'known_face_encodings') or len(self.sfr.known_face_encodings) == 0:
            return False, []
        
        face_locations, face_names = self.sfr.detect_known_faces(frame)
        
        if len(face_names) == 0:
            return False, []
        
        has_unknown = any(name == "Unknown" for name in face_names)
        return has_unknown, face_names
 
    def cleanup(self):
        self.picam2.stop()
        print("Camera stopped")

