import os
import tensorflow as tf
import numpy as np
import features

def create_model(learning_rate=None):
    if learning_rate is None:
        learning_rate = float(os.getenv('LEARNING_RATE', '0.01'))
    
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(19,)),
        tf.keras.layers.Dense(1, activation='sigmoid')
    ])

    model.compile(
        optimizer=tf.keras.optimizers.SGD(learning_rate=learning_rate),
        loss='binary_crossentropy',
        metrics=['accuracy']
    )

    model.summary()
    return model


def compute_class_weights(buffer):
    if len(buffer.memory) < 2:
        return {0: 1.0, 1: 10.0}
    
    labels = [label for _, label in buffer.memory]
    n_intrusions = sum(labels)
    n_normal = len(labels) - n_intrusions
    
    if n_intrusions == 0:
        return {0: 1.0, 1: 10.0}
    if n_normal == 0:
        return {0: 10.0, 1: 1.0}
    
    weight = n_normal / n_intrusions
    return {0: 1.0, 1: weight}


def train(model, buffer, features, label):
    buffer.add(features, label)
    
    if len(buffer.memory) < 5:
        print(f"Need more data: {len(buffer.memory)}/5")
        return
    
    X_batch, y_batch = buffer.get_random_batch(16)
    X_batch[0] = features
    y_batch[0] = label
    
    class_weights = compute_class_weights(buffer)
    
    history = model.fit(
        X_batch, y_batch,
        epochs=1,
        verbose=0,
        class_weight=class_weights
    )
    
    loss = history.history['loss'][0]
    acc = history.history['accuracy'][0]
    
    n_intrusions = int(sum(y_batch))
    n_normal = len(y_batch) - n_intrusions
    print(f"Train: loss={loss:.4f}, acc={acc:.4f} | batch: {n_normal} normal, {n_intrusions} intrusion")


def predict(model, features, threshold=0.3):
    features = np.array([features])
    prob = model.predict(features, verbose=0)[0][0]
    
    return {
        'probability': float(prob),
        'is_intrusion': prob >= threshold
    }

