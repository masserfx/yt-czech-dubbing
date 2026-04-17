#!/usr/bin/env python3
"""Local Edge TTS bridge server for Chrome extension.
Listens on localhost:5111, accepts POST /synthesize with JSON body,
returns base64-encoded MP3 audio via Edge TTS."""

import asyncio
import base64
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import edge_tts

PORT = 5111

class TTSHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/synthesize':
            self.send_error(404)
            return

        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        text = body.get('text', '')
        voice = body.get('voice', 'cs-CZ-AntoninNeural')
        rate = body.get('rate', 1.0)
        pitch = body.get('pitch', 1.0)

        if not text.strip():
            self._json_response({'success': False, 'error': 'Empty text'})
            return

        rate_str = f"{int((rate - 1) * 100):+d}%"
        pitch_str = f"{int((pitch - 1) * 50):+d}Hz"

        try:
            audio_data = asyncio.run(self._synthesize(text, voice, rate_str, pitch_str))
            audio_b64 = base64.b64encode(audio_data).decode('ascii')
            self._json_response({'success': True, 'audioBase64': audio_b64})
        except Exception as e:
            self._json_response({'success': False, 'error': str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    async def _synthesize(self, text, voice, rate, pitch):
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        chunks = []
        async for chunk in communicate.stream():
            if chunk['type'] == 'audio':
                chunks.append(chunk['data'])
        return b''.join(chunks)

    def _json_response(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, format, *args):
        print(f"[EdgeTTS] {args[0]}")

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), TTSHandler)
    print(f"[EdgeTTS] Server running on http://127.0.0.1:{PORT}")
    print(f"[EdgeTTS] POST /synthesize {{text, voice, rate, pitch}}")
    server.serve_forever()
