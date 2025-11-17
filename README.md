# NH-SJC25HACK-IOT-020_GROVE_STREET_ENGINEERS
 Silver Spectrum TechFest 2025  A National Level 48-Hour Hackathon - 28, 29, and 30 October 2025

````markdown
# AI Intrusion Detection System

Adaptive home security system that learns your environment using neural networks.  
Runs on Raspberry Pi with camera, microphone, and door/window sensors.

---

## Prerequisites

- Basic knowledge of Raspberry Pi and GPIO setup  
- Python 3.11+ installed  
- Virtual environment (`venv`) installed  
- Internet connection for model training and updates  

---

## Requirements

### Hardware
- Raspberry Pi 4 (or 3B+)
- Pi Camera or USB webcam
- USB microphone
- Door/window contact sensors
- Buzzer (optional)

### Software
- Raspberry Pi OS
- Python 3.11+

---

## Installation

```bash
# Clone and setup
cd ~/MASTER_NHCE
python3 -m venv MASTER_NHCE
source MASTER_NHCE/bin/activate

# Install dependencies
pip install -r requirements.txt
sudo apt-get install python3-pyaudio portaudio19-dev

# Find audio device
arecord -l
# Update AUDIO_DEVICE in dotenv file
````

---

## Wiring

```text
GPIO 5  → Door sensor
GPIO 6  → Window sensor
GPIO 16 → Buzzer
```

---

## Configuration

Edit `.env` file:

```bash
AUDIO_DEVICE=plughw:3,0
GPIO_DOOR_PIN=5
GPIO_WINDOW_PIN=6
GPIO_BUZZER_PIN=16
LEARNING_RATE=0.01
```

---

## Usage

```bash
python3 main_system.py
```

### Modes

* **Learning Mode (0–100 clips):** Records 15-second clips, sends for feedback
* **Confidence Mode (100–250 clips):** Refines detection
* **Production Mode (250+ clips):** Auto-detects intrusions, activates buzzer

---

## Feedback

Send via WebSocket:

```json
{"jsonType": "feedback_response", "requestId": "timestamp", "label": 0}
```

Label definitions:

* `0` = normal
* `1` = intrusion

---

## Face Recognition

Add known faces to the `images/` folder:

```bash
mkdir images
# Add images/John.jpg, images/Jane.png, etc.
```

---

## Troubleshooting

* **Camera error:** Enable legacy camera in `raspi-config`
* **Audio error:** Check `arecord -l` and update `.env`
* **High probability stuck:** Delete `models/` and `system_state.json`, then restart

---

## Features

* Multi-sensor fusion (camera, audio, GPIO)
* Temporal pattern recognition (1-second windows)
* Face recognition for known persons
* Real-time alerts via WebSocket
* Buzzer activation on high threat
* 19-feature neural network

