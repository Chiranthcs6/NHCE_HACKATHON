import os
import time
import pickle
import shutil
import numpy as np 

class ReplayBuffer:
    def __init__(self):
        self.memory = [] 
        self.max_size = 500
    
    def add(self, features, label):
        self.memory.append((features, label))
        if len(self.memory) > self.max_size:
            self.memory.pop(0)
    
    def get_random_batch(self, size=16):
        import random 
        if len(self.memory) < size:
            batch = self.memory
        else:
            batch = random.sample(self.memory, size)
        
        X = np.array([item[0] for item in batch])
        y = np.array([item[1] for item in batch])
        
        return X, y

def save_buffer(buffer, filename='replay_buffers/buffer.pkl'):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    if os.path.isfile(filename):
        ts = time.strftime("%Y%m%d_%H%M%S")
        backup = os.path.join(os.path.dirname(filename), f"replay_buffer_{ts}.pkl")
        shutil.move(filename, backup)
    with open(filename, 'wb') as f:
        pickle.dump(buffer.memory, f)
    print(f"Buffer saved to {filename}")

def load_buffer(filename='replay_buffers/buffer.pkl'):
    buffer = ReplayBuffer()
    with open(filename, 'rb') as f:
        buffer.memory = pickle.load(f)
    print(f"Buffer loaded from {filename}")
    return buffer


