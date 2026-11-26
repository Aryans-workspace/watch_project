"""
ABB Cobot TCP Socket Server
Implements the exact RAPID communication protocol for CameraCaptureOrchestrator:
  - Listens on 0.0.0.0:12343
  - Handshake: Cobot sends 'ready', server replies 'wait' or job command ('1'-'8' or '9')
  - Capture trigger: Cobot sends 'at_pos' when at slot position
  - Server captures frame and replies with confirmation ('captured')
  - Supports All Slots (1-8) or Individual Slot positioning
  - Includes a built-in cobot simulator for dry runs
"""

import socket
import threading
import time
import traceback


class RobotServer:
    def __init__(self, host="0.0.0.0", port=12343, on_slot_trigger_callback=None):
        self.host = host
        self.port = port
        self.on_slot_trigger = on_slot_trigger_callback  # func(slot_num, job_info) -> result_dict

        self.server_socket = None
        self.client_socket = None
        self.client_address = None
        self.is_connected = False
        self.running = False
        self.listen_thread = None

        # Active Job State
        self.job_lock = threading.Lock()
        self.active_job = None
        # Example active_job:
        # {
        #   "target": "all" or 1..8,
        #   "category": "train_good",
        #   "watch_id": "Watch_01",
        #   "status": "queued" | "running" | "completed" | "cancelled",
        #   "current_slot": 0,
        #   "total_slots": 8,
        #   "results": []
        # }

        self.recent_logs = []
        self.simulation_thread = None
        self.is_simulating = False

        self.start_server()

    def log(self, message):
        timestamp = time.strftime("%H:%M:%S")
        entry = f"[{timestamp}] {message}"
        print(f"[COBOT_SERVER] {entry}")
        self.recent_logs.append(entry)
        if len(self.recent_logs) > 50:
            self.recent_logs.pop(0)

    def start_server(self):
        """Starts the TCP socket listener thread."""
        self.running = True
        self.listen_thread = threading.Thread(target=self._server_loop, daemon=True)
        self.listen_thread.start()

    def stop_server(self):
        """Stops the socket server."""
        self.running = False
        if self.client_socket:
            try:
                self.client_socket.close()
            except Exception:
                pass
        if self.server_socket:
            try:
                self.server_socket.close()
            except Exception:
                pass

    def _server_loop(self):
        while self.running:
            try:
                self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                self.server_socket.bind((self.host, self.port))
                self.server_socket.listen(1)
                self.log(f"Socket server listening on {self.host}:{self.port}")

                while self.running:
                    self.log("Waiting for ABB Cobot connection...")
                    client_sock, client_addr = self.server_socket.accept()
                    self.client_socket = client_sock
                    self.client_address = client_addr
                    self.is_connected = True
                    self.log(f"Cobot connected from {client_addr[0]}:{client_addr[1]}")

                    try:
                        self._handle_client(client_sock)
                    except Exception as e:
                        self.log(f"Connection error with cobot: {e}")
                    finally:
                        try:
                            client_sock.close()
                        except Exception:
                            pass
                        self.is_connected = False
                        self.client_socket = None
                        self.client_address = None
                        self.log("Cobot disconnected.")

            except Exception as e:
                self.log(f"Server socket error: {e}. Retrying in 3s...")
                time.sleep(3.0)

    def _send_to_cobot(self, client_sock, text):
        """
        Sends a clean string command to the ABB Cobot.
        RAPID string comparisons ('IF cam_rxStr = "9"') are strict Pascal-style
        equality checks: sending null bytes or spaces corrupts the string length.
        """
        try:
            payload = str(text).encode('utf-8')
            client_sock.sendall(payload)
            self.log(f"Sent to cobot: '{text}'")
        except Exception as e:
            self.log(f"Error sending '{text}' to cobot: {e}")

    def _handle_client(self, client_sock):
        """
        Manages the communication cycle with the ABB Cobot.
        Handles 'ready', sends task commands ('wait', '1'-'8', '9'),
        and processes 'at_pos' triggers.
        """
        client_sock.settimeout(300.0)  # 5 min timeout for robot operations

        while self.running:
            # Receive message from cobot
            raw_data = client_sock.recv(1024)
            if not raw_data:
                break

            msg = raw_data.decode('utf-8', errors='ignore').strip('\0 \r\n\t')
            if not msg:
                continue

            self.log(f"Received from cobot: '{msg}'")

            # 1. Cobot sends "ready" (inquiring for next task)
            if "ready" in msg.lower():
                with self.job_lock:
                    if self.active_job and self.active_job["status"] == "queued":
                        # We have a task to dispatch!
                        self.active_job["status"] = "running"
                        target = self.active_job["target"]
                        
                        if target == "all":
                            cmd = "9"
                            self.active_job["current_slot"] = 0
                            self.active_job["total_slots"] = 8
                        else:
                            slot_val = int(target)
                            cmd = str(slot_val)
                            self.active_job["current_slot"] = 0
                            self.active_job["target_slot"] = slot_val
                            self.active_job["total_slots"] = 1

                        self.log(f"Dispatching task '{cmd}' to cobot (Target: {target})")
                        self._send_to_cobot(client_sock, cmd)

                    elif self.active_job and self.active_job["status"] == "running":
                        slots_done = len(self.active_job.get("results", []))
                        target = self.active_job["target"]
                        total_needed = 8 if target == "all" else 1

                        if slots_done >= total_needed:
                            # All slots for this cycle completed!
                            is_continuous = self.active_job.get("continuous", False)
                            end_time = self.active_job.get("end_time")
                            now = time.time()

                            if is_continuous and end_time and now < end_time and self.active_job["status"] != "cancelled":
                                # Continuous run continues into next cycle!
                                self.active_job["cycle_count"] = self.active_job.get("cycle_count", 1) + 1
                                self.active_job["current_slot"] = 0
                                self.active_job["results"] = []
                                time_left_sec = int(end_time - now)
                                m, s = divmod(time_left_sec, 60)
                                h, m = divmod(m, 60)
                                time_left_str = f"{h:02d}h {m:02d}m {s:02d}s"
                                self.log(f"Continuous cycle completed! Starting Cycle {self.active_job['cycle_count']} (Time remaining: {time_left_str}). Dispatching '9'...")
                                self._send_to_cobot(client_sock, "9")
                            else:
                                if is_continuous:
                                    self.log(f"Continuous acquisition reached target end time! Completed {self.active_job.get('cycle_count', 1)} cycles.")
                                else:
                                    self.log(f"Job '{self.active_job['watch_id']}' finished successfully ({slots_done}/{total_needed} slots).")
                                self.active_job["status"] = "completed"
                                self._send_to_cobot(client_sock, "wait")
                        else:
                            # Cobot queried 'ready' while job running and slots remaining.
                            # Re-dispatch task command so cobot executes it.
                            cmd = "9" if target == "all" else str(int(target))
                            self.log(f"Cobot queried 'ready' while job in progress ({slots_done}/{total_needed}). Re-dispatching task '{cmd}'")
                            self._send_to_cobot(client_sock, cmd)

                    else:
                        # Idle, tell robot to wait
                        self._send_to_cobot(client_sock, "wait")

            # 2. Cobot sends "at_pos" (reached slot position, waiting for capture)
            elif "at_pos" in msg.lower():
                slot_to_capture = 1
                with self.job_lock:
                    if self.active_job:
                        if self.active_job["target"] == "all":
                            self.active_job["current_slot"] += 1
                            slot_to_capture = self.active_job["current_slot"]
                        else:
                            slot_to_capture = int(self.active_job.get("target_slot", self.active_job["target"]))
                            self.active_job["current_slot"] = slot_to_capture

                self.log(f"Cobot at position for Slot {slot_to_capture}. Capturing...")

                # Trigger image capture and dataset save
                capture_res = None
                if self.on_slot_trigger:
                    try:
                        capture_res = self.on_slot_trigger(slot_to_capture, self.active_job)
                    except Exception as e:
                        self.log(f"Capture callback error on slot {slot_to_capture}: {e}")

                with self.job_lock:
                    if self.active_job and capture_res:
                        self.active_job["results"].append(capture_res)

                # Send confirmation string back to robot to satisfy WaitForCaptureConfirmation
                self.log(f"Slot {slot_to_capture} captured. Sending confirmation 'captured' to cobot.")
                self._send_to_cobot(client_sock, "captured")

            else:
                self.log(f"Unrecognized message from cobot: '{msg}'")
                self._send_to_cobot(client_sock, "wait")

    # =========================================================================
    # Job Management API
    # =========================================================================

    def queue_job(self, target="all", category="train_good", watch_id="Watch_01", continuous=False, end_time=None):
        """Queues an acquisition run for the cobot."""
        with self.job_lock:
            if self.active_job and self.active_job["status"] in ("queued", "running"):
                return {"success": False, "error": "A job is already in progress"}

            self.active_job = {
                "target": target,
                "category": category,
                "watch_id": watch_id or "Watch",
                "continuous": bool(continuous),
                "end_time": float(end_time) if end_time else None,
                "cycle_count": 1,
                "status": "queued",
                "current_slot": 0,
                "total_slots": 8 if target == "all" else 1,
                "start_time": time.time(),
                "results": []
            }
            if continuous and end_time:
                end_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(end_time))
                self.log(f"Queued CONTINUOUS job: Category={category}, Until={end_str}")
            else:
                self.log(f"Queued SINGLE job: Target={target}, Category={category}")
            return {"success": True, "job": self.active_job}

    def cancel_job(self):
        """Cancels any active or queued job."""
        with self.job_lock:
            if self.active_job:
                self.active_job["status"] = "cancelled"
                self.log("Job was cancelled by user.")
                return {"success": True, "job": self.active_job}
            return {"success": False, "error": "No active job"}

    def get_status(self):
        """Returns comprehensive status dictionary for web API."""
        with self.job_lock:
            job_copy = dict(self.active_job) if self.active_job else None
            if job_copy and job_copy.get("continuous") and job_copy.get("end_time"):
                remaining = max(0, int(job_copy["end_time"] - time.time()))
                job_copy["time_remaining_sec"] = remaining

        return {
            "server_running": self.running,
            "port": self.port,
            "cobot_connected": self.is_connected,
            "cobot_address": f"{self.client_address[0]}:{self.client_address[1]}" if self.client_address else None,
            "is_simulating": self.is_simulating,
            "active_job": job_copy,
            "recent_logs": list(self.recent_logs[-15:])
        }

    # =========================================================================
    # Built-in Cobot Simulator (for offline dry-runs)
    # =========================================================================

    def start_simulation_run(self, target="all", category="train_good", watch_id="Watch_01", continuous=False, end_time=None):
        """Runs a simulated cobot sequence without requiring the physical robot."""
        if self.is_simulating or (self.active_job and self.active_job["status"] in ("queued", "running")):
            return {"success": False, "error": "Job or simulation already running"}

        self.queue_job(target=target, category=category, watch_id=watch_id, continuous=continuous, end_time=end_time)
        self.is_simulating = True
        self.simulation_thread = threading.Thread(
            target=self._simulate_worker,
            args=(target, continuous, end_time),
            daemon=True
        )
        self.simulation_thread.start()
        return {"success": True, "message": "Cobot simulation started"}

    def _simulate_worker(self, target, continuous=False, end_time=None):
        self.log("[SIMULATOR] Starting simulated cobot execution sequence...")
        time.sleep(1.0)

        with self.job_lock:
            if self.active_job:
                self.active_job["status"] = "running"

        slots_to_run = list(range(1, 9)) if target == "all" else [int(target)]

        while self.running:
            with self.job_lock:
                if not self.active_job or self.active_job["status"] != "running":
                    break

            for s in slots_to_run:
                with self.job_lock:
                    if not self.active_job or self.active_job["status"] != "running":
                        self.log("[SIMULATOR] Sequence cancelled.")
                        break
                    self.active_job["current_slot"] = s

                self.log(f"[SIMULATOR] Moving cobot arm to CMM{s}...")
                time.sleep(1.5)  # Simulated movement

                self.log(f"[SIMULATOR] Reached Slot {s} ('at_pos'). Triggering camera capture...")
                capture_res = None
                if self.on_slot_trigger:
                    try:
                        capture_res = self.on_slot_trigger(s, self.active_job)
                    except Exception as e:
                        self.log(f"[SIMULATOR] Capture error: {e}")

                with self.job_lock:
                    if self.active_job and capture_res:
                        self.active_job["results"].append(capture_res)

                self.log(f"[SIMULATOR] Received confirmation 'captured' for Slot {s}.")
                time.sleep(0.3)

            # Cycle finished
            with self.job_lock:
                if not self.active_job or self.active_job["status"] != "running":
                    break

                now = time.time()
                if continuous and end_time and now < end_time:
                    self.active_job["cycle_count"] = self.active_job.get("cycle_count", 1) + 1
                    self.active_job["current_slot"] = 0
                    time_left_sec = int(end_time - now)
                    self.log(f"[SIMULATOR] Cycle finished. Starting Cycle {self.active_job['cycle_count']} (Time left: {time_left_sec}s)...")
                    time.sleep(1.0)
                else:
                    self.active_job["status"] = "completed"
                    self.log("[SIMULATOR] Sequence complete. Returning to Camerahomepos.")
                    break

        self.is_simulating = False
