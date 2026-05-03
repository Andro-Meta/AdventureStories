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

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
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

def find_free_port(start_port=8000, max_attempts=10):
    """Find a free port starting from start_port"""
    for port in range(start_port, start_port + max_attempts):
        try:
            with socketserver.TCPServer(("", port), None) as test_server:
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
        print(f"  └─ For mobile testing add ?backend={lan_url.replace(str(PORT), '8090')} to point AI calls at the same machine.")
    print(f"Press Ctrl+C to stop the server")
    print("-" * 50)
    
    # ThreadingMixIn lets Python handle each browser connection in its own
    # thread, so concurrent ES-module fetches don't queue behind each other.
    # daemon_threads=True means worker threads exit when the main thread exits.
    class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        allow_reuse_address = True
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
