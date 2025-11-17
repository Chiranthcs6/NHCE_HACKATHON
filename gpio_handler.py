import RPi.GPIO as GPIO
import os
from dotenv import load_dotenv

load_dotenv()

class GPIOHandler:
    def __init__(self):
        self.door_pin = int(os.getenv('GPIO_DOOR_PIN', 5))
        self.window_pin = int(os.getenv('GPIO_WINDOW_PIN', 6))
        self.buzzer_pin = int(os.getenv('GPIO_BUZZER_PIN', 16))
        
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.door_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(self.window_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(self.buzzer_pin, GPIO.OUT)
        GPIO.output(self.buzzer_pin, GPIO.LOW)
        
        self.last_door_state = GPIO.input(self.door_pin)
        self.last_window_state = GPIO.input(self.window_pin)
        self.buzzer_active = False
        
        print(f"GPIO initialized: door={self.door_pin}, window={self.window_pin}, buzzer={self.buzzer_pin}")
    
    def read_states(self):
        door_open = GPIO.input(self.door_pin) == GPIO.HIGH
        window_open = GPIO.input(self.window_pin) == GPIO.HIGH
        
        transitions = []
        
        if door_open != self.last_door_state:
            transitions.append(f"door_{'opened' if door_open else 'closed'}")
            self.last_door_state = door_open
        
        if window_open != self.last_window_state:
            transitions.append(f"window_{'opened' if window_open else 'closed'}")
            self.last_window_state = window_open
        
        return {
            'door_open': door_open,
            'window_open': window_open,
            'transitions': transitions
        }
    
    def activate_buzzer(self):
        if not self.buzzer_active:
            GPIO.output(self.buzzer_pin, GPIO.HIGH)
            self.buzzer_active = True
            print("[Buzzer] ACTIVATED")
    
    def deactivate_buzzer(self):
        if self.buzzer_active:
            GPIO.output(self.buzzer_pin, GPIO.LOW)
            self.buzzer_active = False
            print("[Buzzer] Deactivated")
    
    def cleanup(self):
        self.deactivate_buzzer()
        GPIO.cleanup()
        print("GPIO cleaned up")

