#!/usr/bin/env python3
"""
Simple HTTP server for Adventure Stories Web App
Serves the application with proper CORS headers for ES6 modules
"""

import http.server
import socketserver
import os
import sys
import webbrowser
import time
from pathlib import Path

# Only the game itself is served. The project folder also holds .env (the
# OpenRouter key), .git, tools and test dumps; SimpleHTTPRequestHandler would
# hand any of them to every device on the Wi-Fi.
BLOCKED_TOP_LEVEL = {'tools', 'test-results', 'tests', 'mobile', 'node_modules', 'models',
                     'llama-cpp', 'venv_local_ai', '__pycache__', '.github'}
ALLOWED_SUFFIXES = ('.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.woff', '.woff2', '.mp3', '.ogg', '.wav')

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def _is_allowed(self):
        from urllib.parse import urlsplit, unquote
        path = unquote(urlsplit(self.path).path)
        parts = [p for p in path.split('/') if p]
        if any(p.startswith('.') for p in parts):
            return False
        if parts and parts[0] in BLOCKED_TOP_LEVEL:
            return False
        return not parts or path.endswith('/') or path.lower().endswith(ALLOWED_SUFFIXES)

    def send_head(self):
        if not self._is_allowed():
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        # Disable browser caching so JS / CSS edits show up on next reload
        # without needing a hard cache flush. The chat API server is
        # separate; this only affects the static dev server.
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

def port_in_use(port):
    """True if anything already answers on localhost:port.

    A bind test is not enough on Windows: another app on 127.0.0.1:8000
    (Unreal Editor, here) still lets us bind 0.0.0.0:8000, and the browser's
    localhost:8000 then reaches that other app instead of the game.
    """
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0

# Fixed port so the browser keeps the same origin, and with it the saved key
# and save games (localStorage is per origin). 8000 collides with common tools.
DEFAULT_PORT = 8321

def find_free_port(start_port=DEFAULT_PORT, max_attempts=10):
    """Find a free port starting from start_port"""
    for port in range(start_port, start_port + max_attempts):
        if port_in_use(port):
            continue
        try:
            with socketserver.TCPServer(("", port), None):
                return port
        except OSError:
            continue
    return None

def main():
    # Change to the directory containing this script
    os.chdir(Path(__file__).parent)
    
    print(f"Adventure Stories Web App Server")
    print("=" * 50)
    
    # Find an available port
    PORT = find_free_port()
    if PORT is None:
        print("ERROR: Could not find an available port!")
        print("Please close other applications and try again.")
        input("Press Enter to exit...")
        return
    
    url = f"http://localhost:{PORT}"

    # Phase 4.0b: surface the LAN IP so a phone on the same Wi-Fi can connect
    # for mobile testing. The server is already bound to all interfaces ("",PORT).
    lan_url = None
    try:
        import socket
        # Trick: open a UDP socket to 8.8.8.8 (no packet sent) to ask the OS
        # which interface address it would use. Doesn't actually connect.
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
        finally:
            s.close()
        if lan_ip and lan_ip != "127.0.0.1":
            lan_url = f"http://{lan_ip}:{PORT}"
    except Exception:
        pass

    print(f"Starting server on port {PORT}...")
    print(f"Game URL (this machine):  {url}")
    if lan_url:
        print(f"Game URL (phone on Wi-Fi): {lan_url}")
    print(f"Press Ctrl+C to stop the server")
    print("-" * 50)
    
    # ThreadingMixIn lets Python handle each browser connection in its own
    # thread, so concurrent ES-module fetches don't queue behind each other.
    # daemon_threads=True means worker threads exit when the main thread exits.
    class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        allow_reuse_address = False  # on Windows SO_REUSEADDR lets two servers share a port
        daemon_threads = True

    try:
        with ThreadedTCPServer(("", PORT), CORSRequestHandler) as httpd:
            print(f"Server started successfully!")
            print(f"Opening browser automatically...")
            
            # Open browser automatically after a short delay
            def open_browser():
                time.sleep(1)  # Give server time to start
                try:
                    webbrowser.open(url)
                    print(f"Browser opened to {url}")
                except Exception as e:
                    print(f"Could not open browser automatically: {e}")
                    print(f"Please manually open: {url}")
            
            # Start browser opening in background
            import threading
            browser_thread = threading.Thread(target=open_browser)
            browser_thread.daemon = True
            if not os.environ.get('ADV_NO_BROWSER'):  # tests set this
                browser_thread.start()
            
            # Start serving
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except Exception as e:
        print(f"Error starting server: {e}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    main()
