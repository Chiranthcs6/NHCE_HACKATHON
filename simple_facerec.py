import face_recognition
import cv2
import os
import glob
import numpy as np

class SimpleFacerec:
    def __init__(self):
        self.known_face_encodings = []
        self.known_face_names = []
        self.frame_resizing = 0.25  # resize factor for faster processing

    def load_encoding_images(self, images_path):
        """
        Load encoding images from directory
        """
        print("Loading known faces...")

        images_path = glob.glob(os.path.join(images_path, "*.*"))
        for img_path in images_path:
            img = cv2.imread(img_path)
            if img is None:
                print(f"[Warning] Could not read image: {img_path}")
                continue

            rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

            basename = os.path.basename(img_path)
            (filename, ext) = os.path.splitext(basename)
            img_encoding = face_recognition.face_encodings(rgb_img)

            if len(img_encoding) == 0:
                print(f"[Warning] No face found in image: {filename}")
                continue

            self.known_face_encodings.append(img_encoding[0])
            self.known_face_names.append(filename)
            print(f"Loaded encoding for {filename}")

        print("Encoding images loaded.")

    def detect_known_faces(self, frame):
        """
        Detect and recognize known faces in a frame
        """
        # ✅ Fix: Handle empty frame safely
        if frame is None or frame.size == 0:
            print("[Warning] Empty frame received — skipping this frame.")
            return [], []

        # Resize frame for faster processing
        small_frame = cv2.resize(frame, (0, 0),
                                 fx=self.frame_resizing,
                                 fy=self.frame_resizing)

        # Convert from BGR to RGB
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

        # Detect face locations and encodings
        face_locations = face_recognition.face_locations(rgb_small_frame)
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        face_names = []
        for face_encoding in face_encodings:
            matches = face_recognition.compare_faces(self.known_face_encodings, face_encoding)
            name = "Unknown"

            # Compute distances to known faces
            face_distances = face_recognition.face_distance(self.known_face_encodings, face_encoding)
            best_match_index = np.argmin(face_distances)

            if len(matches) > 0 and matches[best_match_index]:
                name = self.known_face_names[best_match_index]

            face_names.append(name)

        # Scale face locations back to original frame size
        face_locations = np.array(face_locations)
        face_locations = face_locations / self.frame_resizing

        return face_locations.astype(int), face_names

