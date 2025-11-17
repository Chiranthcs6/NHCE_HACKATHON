import redis
import json
import os
from datetime import datetime, time as dt_time
from dotenv import load_dotenv

load_dotenv("dotenv")

class SettingsManager:
    def __init__(self):
        redis_host = os.getenv('REDIS_HOST', 'localhost')
        redis_port = int(os.getenv('REDIS_PORT', 6379))
        
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, 
                                       db=0, decode_responses=True)
        self.settings_file = 'user_data.json'
        self.settings = None
        
        self.load_settings()
        print("Settings loaded from user_data.json")
    
    def load_settings(self):
        try:
            with open(self.settings_file, 'r') as f:
                self.settings = json.load(f)
            
            self.redis_client.set('is_data_updated', 'false')
        except FileNotFoundError:
            print(f"Warning: {self.settings_file} not found, using defaults")
            self.settings = self._get_default_settings()
    
    def _get_default_settings(self):
        return {
            "vacationMode": False,
            "sleepSchedule": {
                "weekdays": {"start": "22:00", "end": "06:00"},
                "weekends": {"start": "23:00", "end": "08:00"}
            },
            "thresholdLevels": {
                "low": 0.3,
                "medium": 0.5,
                "high": 0.7
            }
        }
    
    def check_for_updates(self):
        try:
            updated = self.redis_client.get('is_data_updated')
            if updated == 'true':
                self.load_settings()
                return True
        except Exception as e:
            print(f"Redis check error: {e}")
        return False
    
    def get_thresholds(self):
        return self.settings.get('thresholdLevels', {
            'low': 0.3,
            'medium': 0.5,
            'high': 0.7
        })
    
    def is_away_mode(self):
        return self.settings.get('vacationMode', False)
    
    def is_sleep_time(self):
        now = datetime.now()
        schedule = self.settings.get('sleepSchedule', {})
        
        is_weekend = now.weekday() >= 5
        period = 'weekends' if is_weekend else 'weekdays'
        
        times = schedule.get(period, {})
        start_str = times.get('start', '22:00')
        end_str = times.get('end', '06:00')
        
        try:
            start = datetime.strptime(start_str, '%H:%M').time()
            end = datetime.strptime(end_str, '%H:%M').time()
            current = now.time()
            
            if start < end:
                return start <= current <= end
            else:
                return current >= start or current <= end
        except:
            return False
    
    def cleanup(self):
        self.redis_client.close()
        print("Redis connection closed")

