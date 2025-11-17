import datetime as dt
import math
import numpy as np

class event:
    door_open = False
    window_open = False
    motion_level = 0.00
    person_confidence = 0.00
    unknown_person = False
    noise_rms = 0.00
    noise_zcr = 0.00
    is_away = False
    is_asleep = False
    
    peak_rms = 0.00
    mean_rms = 0.00
    peak_zcr = 0.00
    mean_zcr = 0.00
    peak_motion = 0.00
    mean_motion = 0.00
    motion_variance = 0.00
    high_motion_frames = 0
    
    def preprocess(self):
        time = dt.datetime.now()
        day_frac = (time.hour * 3600 + time.minute * 60 + time.second)/86400
        time_sine = math.sin(2 * math.pi * day_frac)
        time_cosine = math.cos(2 * math.pi * day_frac)
        
        features = np.array([
            time_sine,
            time_cosine,
            event.door_open,
            event.window_open,
            event.motion_level,
            event.person_confidence,
            event.unknown_person,
            event.noise_rms,
            event.noise_zcr,
            event.is_away,
            event.is_asleep,
            event.peak_rms,
            event.mean_rms,
            event.peak_zcr,
            event.mean_zcr,
            event.peak_motion,
            event.mean_motion,
            event.motion_variance,
            event.high_motion_frames
        ], dtype=np.float32)
        
        return features

