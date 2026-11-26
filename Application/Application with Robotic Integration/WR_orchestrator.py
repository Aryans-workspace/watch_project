import socket
import time

# Host IP and Port configuration
HOST = "10.105.1.15"  # Should match WR_SERVER_IP in RAPID
PORT = 12344          # Should match WR_SERVER_PORT in RAPID

def wait_for_ready(conn):
    """Wait until the robot sends the 'ready' signal."""
    while True:
        data = conn.recv(1024)
        if not data:
            raise ConnectionError("Robot disconnected")
        
        msg = data.decode('utf-8').strip()
        if msg == "ready":
            print("Robot is ready!")
            return
        else:
            print(f"Received unexpected message while waiting for ready: {msg}")

def main():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    
    print(f"Starting Water Resistance Orchestrator on {HOST}:{PORT}...")
    server_socket.bind((HOST, PORT))
    server_socket.listen(1)
    
    conn, addr = server_socket.accept()
    print(f"Robot connected from {addr}")
    
    try:
        # STEP 1: Wait for robot to be ready, then trigger WATCH_PICK
        print("\n--- Waiting for robot to be ready for Step 1 ---")
        wait_for_ready(conn)
        print("Sending command: WATCH_PICK")
        conn.sendall("WATCH_PICK".encode('utf-8'))
        
        # STEP 2: Wait for robot to finish watchpicking and be ready again, then trigger PRESS_BTN
        print("\n--- Waiting for robot to finish and be ready for Step 2 ---")
        wait_for_ready(conn)
        print("Sending command: PRESS_BTN")
        conn.sendall("PRESS_BTN".encode('utf-8'))
        
        # FINAL STEP: Wait for robot to finish pressing button and be ready again
        print("\n--- Waiting for robot to finish process ---")
        wait_for_ready(conn)
        
        print("\nProcess complete! Sending 'wait' command to keep robot idle.")
        # Alternatively, we could close the connection or loop back.
        conn.sendall("wait".encode('utf-8'))
        
    except ConnectionError as e:
        print(f"Connection error: {e}")
    except KeyboardInterrupt:
        print("\nInterrupted by user. Shutting down...")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        print("Closing connections.")
        if conn:
            conn.close()
        server_socket.close()

if __name__ == "__main__":
    main()
