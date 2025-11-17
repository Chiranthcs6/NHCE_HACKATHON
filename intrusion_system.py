import tensorflow as tf
import os
from model import create_model, predict, train
from replay import ReplayBuffer, save_buffer, load_buffer

class IntrusionSystem:
    def __init__(self, load_existing=False):
        model_path = 'models/model.keras'
        buffer_path = 'replay_buffers/buffer.pkl'
        
        if load_existing and os.path.exists(model_path) and os.path.exists(buffer_path):
            self.model = tf.keras.models.load_model(model_path)
            self.buffer = load_buffer(buffer_path)
            print("Loaded existing system")
        else:
            self.model = create_model()
            self.buffer = ReplayBuffer()
            print("Created new system")
    
    def detect(self, event_instance):
        features = event_instance.preprocess()
        result = predict(self.model, features)
        return result
    
    def update(self, event_instance, user_label):
        features = event_instance.preprocess()
        train(self.model, self.buffer, features, user_label)
    
    def save(self):
        os.makedirs('models', exist_ok=True)
        self.model.save('models/model.keras')
        save_buffer(self.buffer, 'replay_buffers/buffer.pkl')
        print("System saved")

