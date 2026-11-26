"""
ABB Cobot TCP Socket Server for PatchCore Live Inspection
Communicates with the ABB Cobot RAPID script over TCP socket (Port 12343).
When cobot signals 'at_pos' for a slot, triggers camera capture, runs real-time
PatchCore anomaly detection, records PASS/DEFECT verdicts and defect heatmaps,
and sends 'captured' handshake back to the robot.
"""

import socket
import threading
import time


class RobotInspectionServer:
    def __init__(self, host="0.0.0.0", port=12343, on_slot_inspect_callback=None):
        self.host = host
        self.port = port
        self.on_slot_inspect_callback = on_slot_inspect_callback

        self.server_socket = None
        self.client_socket = None
        self.client_address = None
        self.is_running = False
        self.is_connected = False

        self.listen_thread = None
        self.client_thread = None

        # Inspection Job State
        self.active_job = {
            "status": "idle",       # idle, queued, running, completed, cancelled
            "target": "all",        # "all" or 1..8
            "continuous": False,    # If True, repeats cycle indefinitely over and over
            "cycle_count": 0,       # Number of completed / active cycles
            "total_cycles_completed": 0,
            "current_slot": 0,
            "total_slots": 8,
            "results": [],          # List of inspection result dicts for each slot
            "start_time": None,
            "elapsed_sec": 0,
            "passed_count": 0,
            "defect_count": 0,
            "total_passed_overall": 0,
            "total_defects_overall": 0,
            "summary_verdict": "PENDING"
        }
        self.job_lock = threading.Lock()

        # Simulation Mode
        self.is_simulating = False
        self.sim_thread = None

        # Real-time Terminal Activity Log
        self.logs = []
        self.max_logs = 100

        self.start_server()

    def _log(self, text):
        timestamp = time.strftime("%H:%M:%S")
        line = f"[{timestamp}] {text}"
        print(f"[COBOT_INSPECTION] {line}")
        self.logs.append(line)
        if len(self.logs) > self.max_logs:
            self.logs.pop(0)

    def start_server(self):
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(2)
            self.is_running = True

            self.listen_thread = threading.Thread(target=self._listen_loop, daemon=True)
            self.listen_thread.start()
            self._log(f"Socket server listening on {self.host}:{self.port}")
        except Exception as e:
            self._log(f"Failed to start socket server: {e}")

    def _listen_loop(self):
        while self.is_running:
            try:
                self._log("Waiting for ABB Cobot socket connection...")
                client_sock, client_addr = self.server_socket.accept()
                self.client_socket = client_sock
                self.client_address = client_addr
                self.is_connected = True
                self._log(f"ABB Cobot CONNECTED from {client_addr[0]}:{client_addr[1]}")

                self._handle_client(client_sock)

            except Exception as e:
                if self.is_running:
                    self._log(f"Socket accept error: {e}")
                time.sleep(1)

    def _handle_client(self, client_sock):
        buffer = ""
        while self.is_running and self.is_connected:
            try:
                data = client_sock.recv(1024)
                if not data:
                    self._log("ABB Cobot disconnected.")
                    break

                raw_text = data.decode("utf-8", errors="ignore")
                buffer += raw_text

                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip('\0 \r\n\t')
                    if line:
                        self._process_cobot_message(line)

                # Also handle un-delimited messages (RAPID raw strings like "ready\0" or "at_pos\0")
                cleaned_buf = buffer.strip('\0 \r\n\t').lower()
                if "ready" in cleaned_buf:
                    self._process_cobot_message("ready")
                    buffer = ""
                elif "at_pos" in cleaned_buf:
                    self._process_cobot_message("at_pos")
                    buffer = ""

            except (socket.timeout, ConnectionResetError):
                self._log("Cobot connection reset.")
                break
            except Exception as e:
                self._log(f"Client read exception: {e}")
                break

        self.is_connected = False
        self.client_socket = None
        try:
            client_sock.close()
        except Exception:
            pass

    def _send_to_cobot(self, text):
        """Sends raw ASCII string to RAPID without null terminator."""
        if not self.client_socket or not self.is_connected:
            return False
        try:
            raw_bytes = str(text).encode("utf-8")
            self.client_socket.sendall(raw_bytes)
            self._log(f"SENT -> Cobot: '{text}'")
            return True
        except Exception as e:
            self._log(f"Socket send error: {e}")
            return False

    def _process_cobot_message(self, message):
        msg = message.strip('\0 \r\n\t').lower()
        self._log(f"RECV <- Cobot: '{msg}'")

        if "ready" in msg:
            with self.job_lock:
                if self.active_job["status"] == "queued":
                    self.active_job["status"] = "running"
                    self.active_job["start_time"] = time.time()
                    target = str(self.active_job["target"])
                    # Send command ("9" for full cycle, or "1"-"8" for single slot)
                    cmd = "9" if target == "all" else target
                    self._log(f"Starting inspection job -> Sending command '{cmd}' to Cobot (Target: {target})")
                    self._send_to_cobot(cmd)
                elif self.active_job["status"] == "running":
                    target = self.active_job["target"]
                    total_needed = 8 if target == "all" else 1
                    slots_done = len(self.active_job["results"])
                    if slots_done >= total_needed:
                        is_continuous = self.active_job.get("continuous", False)
                        if is_continuous and self.active_job["status"] != "cancelled":
                            # Continuous mode: advance cycle and dispatch next round
                            self.active_job["total_cycles_completed"] += 1
                            self.active_job["cycle_count"] += 1
                            self.active_job["current_slot"] = 0
                            self.active_job["results"] = []
                            cmd = "9" if target == "all" else str(target)
                            self._log(f"Continuous cycle completed! Starting Cycle {self.active_job['cycle_count']}... Re-dispatching '{cmd}' to Cobot")
                            self._send_to_cobot(cmd)
                        else:
                            self._finish_inspection_job()
                            self._send_to_cobot("wait")
                    else:
                        cmd = "9" if target == "all" else str(target)
                        self._log(f"Cobot queried 'ready' while job running ({slots_done}/{total_needed}). Re-dispatching '{cmd}'")
                        self._send_to_cobot(cmd)
                else:
                    self._send_to_cobot("wait")

        elif "at_pos" in msg:
            with self.job_lock:
                if self.active_job["status"] == "running":
                    target = self.active_job["target"]
                    if target == "all":
                        self.active_job["current_slot"] += 1
                        slot_num = self.active_job["current_slot"]
                    else:
                        slot_num = int(target)
                        self.active_job["current_slot"] = slot_num

                    self._log(f"Cobot at Slot {slot_num}. Snapping image & running PatchCore...")

                    # Trigger Camera capture + Real-time PatchCore anomaly detection
                    inspect_result = None
                    if self.on_slot_inspect_callback:
                        inspect_result = self.on_slot_inspect_callback(slot_num, self.active_job)

                    if inspect_result and inspect_result.get("success"):
                        self.active_job["results"].append(inspect_result)
                        verdict = inspect_result.get("verdict", "UNKNOWN")
                        score = inspect_result.get("score", 0.0)
                        if verdict == "PASS":
                            self.active_job["passed_count"] += 1
                            self.active_job["total_passed_overall"] = self.active_job.get("total_passed_overall", 0) + 1
                        else:
                            self.active_job["defect_count"] += 1
                            self.active_job["total_defects_overall"] = self.active_job.get("total_defects_overall", 0) + 1
                        self._log(f"Slot {slot_num} Result: [{verdict}] (Score: {score})")
                    else:
                        err = inspect_result.get("error") if inspect_result else "No result"
                        self._log(f"[WARN] Slot {slot_num} inspect failed: {err}")

                    # Handshake: notify cobot to advance to next position
                    self._send_to_cobot("captured")

                    total_needed = 8 if target == "all" else 1
                    slots_done = len(self.active_job["results"])

                    if slots_done >= total_needed or (target == "all" and slot_num >= 8):
                        is_continuous = self.active_job.get("continuous", False)
                        if is_continuous and self.active_job["status"] != "cancelled":
                            self._log(f"Slot {slot_num} completed for Cycle {self.active_job.get('cycle_count', 1)}. Waiting for Cobot Home & 'ready' for next cycle...")
                        else:
                            self._finish_inspection_job()
                else:
                    self._send_to_cobot("captured")

    def _finish_inspection_job(self):
        """Marks the inspection job as completed and computes summary verdict."""
        self.active_job["status"] = "completed"
        self.active_job["elapsed_sec"] = round(time.time() - (self.active_job["start_time"] or time.time()), 1)
        passed = self.active_job["passed_count"]
        defects = self.active_job["defect_count"]
        self.active_job["summary_verdict"] = "ALL_PASS" if defects == 0 else f"{defects}_DEFECTS"
        self._log(f"Inspection Completed in {self.active_job['elapsed_sec']}s: {passed} PASSED, {defects} DEFECTIVE.")

    # ---------------------------------------------------------------------
    # Job Control API
    # ---------------------------------------------------------------------
    def queue_inspection_job(self, target="all", continuous=False):
        """Queues an inspection job for the connected ABB Cobot."""
        with self.job_lock:
            if self.active_job["status"] in ["running", "queued"]:
                return {"success": False, "error": "An inspection job is already in progress"}

            total = 8 if target == "all" else 1
            self.active_job = {
                "status": "queued",
                "target": target,
                "continuous": bool(continuous),
                "cycle_count": 1,
                "total_cycles_completed": 0,
                "current_slot": 0,
                "total_slots": total,
                "results": [],
                "start_time": None,
                "elapsed_sec": 0,
                "passed_count": 0,
                "defect_count": 0,
                "total_passed_overall": 0,
                "total_defects_overall": 0,
                "summary_verdict": "PENDING"
            }

            mode_str = "CONTINUOUS CYCLE" if continuous else "SINGLE RUN"
            self._log(f"Queued Inspection Job for target: '{target}' ({total} slots, Mode: {mode_str}).")
            return {"success": True, "message": f"Job queued in {mode_str} mode. Waiting for Cobot handshake..."}

    def cancel_job(self):
        with self.job_lock:
            self.active_job["status"] = "cancelled"
            self.active_job["continuous"] = False
            self.is_simulating = False
            self._log("Inspection job stopped / cancelled by user.")
            if self.is_connected:
                self._send_to_cobot("wait")
            return {"success": True, "message": "Job cancelled"}

    # ---------------------------------------------------------------------
    # Simulator Run (Dry Run)
    # ---------------------------------------------------------------------
    def start_simulation_run(self, target="all", continuous=False):
        """Runs a simulated inspection cycle across slots 1 to 8 without robot."""
        with self.job_lock:
            if self.active_job["status"] in ["running", "queued"] or self.is_simulating:
                return {"success": False, "error": "An inspection job is already running"}

            total = 8 if target == "all" else 1
            self.active_job = {
                "status": "running",
                "target": target,
                "continuous": bool(continuous),
                "cycle_count": 1,
                "total_cycles_completed": 0,
                "current_slot": 0,
                "total_slots": total,
                "results": [],
                "start_time": time.time(),
                "elapsed_sec": 0,
                "passed_count": 0,
                "defect_count": 0,
                "total_passed_overall": 0,
                "total_defects_overall": 0,
                "summary_verdict": "PENDING"
            }
            self.is_simulating = True

        mode_str = "CONTINUOUS CYCLE" if continuous else "SINGLE RUN"
        self._log(f"[SIMULATOR] Starting simulated inspection run for target: {target} ({mode_str})")
        self.sim_thread = threading.Thread(target=self._sim_worker, args=(target, total, continuous), daemon=True)
        self.sim_thread.start()
        return {"success": True, "message": f"Simulator inspection run started ({mode_str})"}

    def _sim_worker(self, target, total_slots, continuous=False):
        while self.is_simulating:
            slots_to_run = list(range(1, 9)) if target == "all" else [int(target)]

            for slot in slots_to_run:
                if not self.is_simulating:
                    break

                cycle_num = self.active_job.get("cycle_count", 1)
                self._log(f"[SIMULATOR] Cobot moving to Slot {slot} (Cycle {cycle_num})...")
                time.sleep(1.0)  # Simulates cobot move time

                with self.job_lock:
                    self.active_job["current_slot"] = slot

                self._log(f"[SIMULATOR] At Slot {slot}. Capturing frame & running PatchCore...")

                # Run inspection
                if self.on_slot_inspect_callback:
                    res = self.on_slot_inspect_callback(slot, self.active_job)
                    with self.job_lock:
                        if res and res.get("success"):
                            self.active_job["results"].append(res)
                            verdict = res.get("verdict", "UNKNOWN")
                            score = res.get("score", 0.0)
                            if verdict == "PASS":
                                self.active_job["passed_count"] += 1
                                self.active_job["total_passed_overall"] = self.active_job.get("total_passed_overall", 0) + 1
                            else:
                                self.active_job["defect_count"] += 1
                                self.active_job["total_defects_overall"] = self.active_job.get("total_defects_overall", 0) + 1
                            self._log(f"[SIMULATOR] Slot {slot} Verdict: [{verdict}] (Score: {score})")

                time.sleep(0.4)

            if not continuous or not self.is_simulating:
                break

            with self.job_lock:
                self.active_job["total_cycles_completed"] = self.active_job.get("total_cycles_completed", 0) + 1
                self.active_job["cycle_count"] = self.active_job.get("cycle_count", 1) + 1
                self.active_job["current_slot"] = 0
                self.active_job["results"] = []

            cycle_done = self.active_job["total_cycles_completed"]
            next_cycle = self.active_job["cycle_count"]
            self._log(f"[SIMULATOR] Cycle {cycle_done} completed! Starting Cycle {next_cycle} in 2s...")
            time.sleep(2.0)

        with self.job_lock:
            self.is_simulating = False
            self._finish_inspection_job()

    def get_status(self):
        return {
            "cobot_connected": self.is_connected,
            "cobot_address": f"{self.client_address[0]}:{self.client_address[1]}" if self.client_address else None,
            "is_simulating": self.is_simulating,
            "active_job": self.active_job.copy(),
            "recent_logs": self.logs[-25:]
        }

    def stop_server(self):
        self.is_running = False
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
