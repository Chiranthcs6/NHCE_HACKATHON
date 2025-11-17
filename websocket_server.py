import asyncio
import websockets
import json
import os
from dotenv import load_dotenv

load_dotenv()

class WebSocketServer:
    def __init__(self, on_message_callback):
        self.host = os.getenv('WEBSOCKET_HOST', '0.0.0.0')
        self.port = int(os.getenv('WEBSOCKET_PORT', 8765))
        self.on_message_callback = on_message_callback
        self.clients = set()
        self.server = None
        self.running = False
        self.loop = None

    def start(self):
        self.running = True
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        async def run_server():
            self.server = await websockets.serve(
                self._handle_client,
                self.host,
                self.port
            )
            print(f"WebSocket server listening on {self.host}:{self.port}")
            await asyncio.Future()
        
        import threading
        self.thread = threading.Thread(target=lambda: self.loop.run_until_complete(run_server()), daemon=True)
        self.thread.start()

    async def _handle_client(self, websocket, path):
        self.clients.add(websocket)
        print(f"Client connected: {websocket.remote_address}")
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    if self.on_message_callback:
                        self.on_message_callback(data)
                except Exception as e:
                    print(f"Message parse error: {e}")
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.remove(websocket)
            print(f"Client disconnected: {websocket.remote_address}")

    def send(self, data):
        if not self.clients:
            return
        
        message = json.dumps(data)
        
        async def broadcast():
            disconnected = set()
            for client in self.clients:
                try:
                    await client.send(message)
                except Exception:
                    disconnected.add(client)
            
            for client in disconnected:
                self.clients.discard(client)
        
        if self.loop and self.running:
            asyncio.run_coroutine_threadsafe(broadcast(), self.loop)

    def stop(self):
        self.running = False
        
        async def shutdown():
            if self.server:
                self.server.close()
                await self.server.wait_closed()
            
            for client in list(self.clients):
                await client.close()
            
            self.clients.clear()
        
        if self.loop:
            asyncio.run_coroutine_threadsafe(shutdown(), self.loop)
        
        if hasattr(self, 'thread'):
            self.thread.join(timeout=2)
        
        print("WebSocket server stopped")

