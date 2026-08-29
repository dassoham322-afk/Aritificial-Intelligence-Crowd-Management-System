import os
import sys
import cv2
import time
import json
import logging
import threading
import numpy as np
import imutils


# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tracker.centroidtracker import CentroidTracker
from tracker.trackableobject import TrackableObject
from utils.mailer import Mailer
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="[INFO] %(message)s")
logger = logging.getLogger(__name__)

# Paths
CONFIG_PATH = os.path.join(PROJECT_ROOT, "utils", "config.json")
DEFAULT_PROTOTXT = os.path.join(PROJECT_ROOT, "model", "MobileNetSSD_deploy.prototxt")
DEFAULT_MODEL = os.path.join(PROJECT_ROOT, "model", "MobileNetSSD_deploy.caffemodel")

with open(CONFIG_PATH, "r") as file:
    config = json.load(file)

app = Flask(__name__)
CORS(app)

# Global State for Stream & Stats
class VideoCamera:
    def __init__(self, camera_source=0):
        self.camera_source = camera_source
        self.vs = None
        self.net = cv2.dnn.readNetFromCaffe(DEFAULT_PROTOTXT, DEFAULT_MODEL)
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        self.CLASSES = ["background", "aeroplane", "bicycle", "bird", "boat",
            "bottle", "bus", "car", "cat", "chair", "cow", "diningtable",
            "dog", "horse", "motorbike", "person", "pottedplant", "sheep",
            "sofa", "train", "tvmonitor"]
        self.ct = CentroidTracker(maxDisappeared=60, maxDistance=75)
        self.trackers = []
        self.trackableObjects = {}
        
        self.totalFrames = 0
        self.totalDown = 0
        self.totalUp = 0
        self.people_inside = 0
        self.current_detected = 0
        self.status = "Waiting"
        self.fps_val = 0.0
        self.is_running = False
        self.lock = threading.Lock()
        self.current_frame = None

    def start(self):
        with self.lock:
            if self.is_running:
                return True
            
            # Check IP camera config or default to 0
            if config.get("url") and len(config["url"].strip()) > 0:
                src = config["url"]
                logger.info(f"Server opening IP camera: {src}")
            else:
                src = self.camera_source
                logger.info(f"Server opening laptop webcam: {src}")

            self.vs = cv2.VideoCapture(src)
            if not self.vs.isOpened():
                logger.error("Could not open camera source.")
                self.is_running = False
                return False

            self.is_running = True
            self.thread = threading.Thread(target=self._process_loop, daemon=True)
            self.thread.start()
            return True

    def stop(self):
        with self.lock:
            self.is_running = False
            if self.vs is not None and self.vs.isOpened():
                self.vs.release()
            self.vs = None
            self.current_frame = None
            logger.info("Camera released cleanly by server.")

    def reset_stats(self):
        with self.lock:
            self.totalFrames = 0
            self.totalDown = 0
            self.totalUp = 0
            self.people_inside = 0
            self.current_detected = 0
            self.trackers = []
            self.trackableObjects = {}
            self.ct = CentroidTracker(maxDisappeared=60, maxDistance=75)
            logger.info("Stats reset.")

    def _apply_nms(self, boxes, nms_threshold=0.4):
        if len(boxes) == 0:
            return []
        if len(boxes) == 1:
            return boxes
        boxes_array = np.array(boxes, dtype="float")
        x1 = boxes_array[:, 0]
        y1 = boxes_array[:, 1]
        x2 = boxes_array[:, 2]
        y2 = boxes_array[:, 3]
        area = (x2 - x1 + 1) * (y2 - y1 + 1)
        idxs = np.argsort(area)[::-1]
        keep = []
        while len(idxs) > 0:
            current = idxs[0]
            keep.append(current)
            if len(idxs) == 1:
                break
            remaining = idxs[1:]
            ix1 = np.maximum(x1[current], x1[remaining])
            iy1 = np.maximum(y1[current], y1[remaining])
            ix2 = np.minimum(x2[current], x2[remaining])
            iy2 = np.minimum(y2[current], y2[remaining])
            iw = np.maximum(0, ix2 - ix1 + 1)
            ih = np.maximum(0, iy2 - iy1 + 1)
            inter_area = iw * ih
            union_area = area[current] + area[remaining] - inter_area
            iou = inter_area / union_area
            idxs = remaining[np.where(iou <= nms_threshold)[0]]
        return boxes_array[keep].astype("int").tolist()

    def _process_loop(self):
        W, H = None, None
        skip_frames = 15
        prev_time = time.time()

        while self.is_running:
            if self.vs is None or not self.vs.isOpened():
                break

            ret, frame = self.vs.read()
            if not ret or frame is None:
                time.sleep(0.01)
                continue

            frame = imutils.resize(frame, width=500)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            if W is None or H is None:
                (H, W) = frame.shape[:2]

            status = "Waiting"
            rects = []

            # Detection frame
            if self.totalFrames % skip_frames == 0:
                status = "Detecting"
                self.trackers = []
                person_rects = []

                # 1. MobileNet SSD Detection (Full body / distance)
                blob = cv2.dnn.blobFromImage(frame, 0.007843, (W, H), 127.5)
                self.net.setInput(blob)
                detections = self.net.forward()

                for i in np.arange(0, detections.shape[2]):
                    confidence = detections[0, 0, i, 2]
                    if confidence > 0.35:
                        idx = int(detections[0, 0, i, 1])
                        if self.CLASSES[idx] != "person":
                            continue
                        box = detections[0, 0, i, 3:7] * np.array([W, H, W, H])
                        person_rects.append(box.astype("int"))

                # 2. Haar Cascade Face/Head Detection (Close-up laptop webcam)
                faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(35, 35))
                for (fx, fy, fw, fh) in faces:
                    # Expand face box slightly downward to cover head & shoulders for stable tracking
                    startX = max(0, fx - int(fw * 0.2))
                    startY = max(0, fy - int(fh * 0.2))
                    endX = min(W, fx + fw + int(fw * 0.2))
                    endY = min(H, fy + fh + int(fh * 0.8))
                    person_rects.append([startX, startY, endX, endY])

                # Apply NMS across both detectors
                rects = self._apply_nms(person_rects, nms_threshold=0.35)
                for (startX, startY, endX, endY) in rects:
                    tracker = cv2.TrackerCSRT_create()
                    tracker.init(rgb, (startX, startY, endX - startX, endY - startY))
                    self.trackers.append(tracker)
            else:
                for tracker in self.trackers:
                    status = "Tracking"
                    success, box = tracker.update(rgb)
                    if success:
                        startX, startY, w, h = [int(v) for v in box]
                        endX, endY = startX + w, startY + h
                    rects.append((startX, startY, endX, endY))

            # Midline
            cv2.line(frame, (0, H // 2), (W, H // 2), (0, 220, 255), 2)
            cv2.putText(frame, "-Prediction border - Entrance-", (10, H - 180),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 220, 255), 1)

            objects = self.ct.update(rects)
            self.current_detected = len(objects)

            buffer = 20
            midline = H // 2

            for (objectID, centroid) in objects.items():
                to = self.trackableObjects.get(objectID, None)
                if to is None:
                    to = TrackableObject(objectID, centroid)
                    to.inside = centroid[1] > midline
                    to.crossed_enter = False
                    to.crossed_exit = False
                else:
                    to.consecutive_missed_frames = 0
                    prev_y = to.centroids[-1][1] if len(to.centroids) > 0 else centroid[1]
                    to.centroids.append(centroid)

                    # True Inbound Crossing (ENTER): started above line and crossed below buffer
                    if prev_y < midline - buffer and centroid[1] > midline + buffer and not getattr(to, 'crossed_enter', False):
                        self.totalDown += 1
                        to.crossed_enter = True
                        to.inside = True
                        logger.info(f"Person {objectID} confirmed ENTER. Total Entered: {self.totalDown}")

                    # True Outbound Crossing (EXIT): started below line and crossed above buffer
                    elif prev_y > midline + buffer and centroid[1] < midline - buffer and not getattr(to, 'crossed_exit', False):
                        self.totalUp += 1
                        to.crossed_exit = True
                        to.inside = False
                        logger.info(f"Person {objectID} confirmed EXIT. Total Exited: {self.totalUp}")

                self.trackableObjects[objectID] = to

                # Render ID on frame with styling
                text = f"ID {objectID}"
                cv2.putText(frame, text, (centroid[0] - 15, centroid[1] - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
                cv2.circle(frame, (centroid[0], centroid[1]), 4, (0, 255, 0), -1)

            # Reconcile People Inside strictly as non-negative balance
            self.people_inside = max(self.current_detected, self.totalDown - self.totalUp)

            # Draw bounding boxes
            for (startX, startY, endX, endY) in rects:
                cv2.rectangle(frame, (startX, startY), (endX, endY), (0, 255, 0), 2)

            # Cleanup
            objectIDs_to_remove = []
            for objectID in list(self.trackableObjects.keys()):
                if objectID not in objects:
                    to = self.trackableObjects[objectID]
                    to.consecutive_missed_frames += 1
                    if to.consecutive_missed_frames > 15:
                        if to.inside:
                            self.people_inside = max(0, self.people_inside - 1)
                        objectIDs_to_remove.append(objectID)
            for objectID in objectIDs_to_remove:
                del self.trackableObjects[objectID]

            # HUD Display on frame
            self.status = status
            now = time.time()
            self.fps_val = 1.0 / (now - prev_time) if (now - prev_time) > 0 else 30.0
            prev_time = now

            info_status = [
                ("Status", status),
                ("People Entered", self.totalDown),
                ("People Exited", self.totalUp),
            ]
            for (i, (k, v)) in enumerate(info_status):
                cv2.putText(frame, f"{k}: {v}", (10, H - ((i * 18) + 15)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)

            cv2.putText(frame, f"People Inside: {self.people_inside}", (270, H - 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

            # Encode as JPEG
            ret_encode, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ret_encode:
                self.current_frame = buffer.tobytes()

            self.totalFrames += 1
            time.sleep(0.015)

    def get_frame(self):
        return self.current_frame

    def get_stats(self):
        return {
            "is_running": self.is_running,
            "status": self.status,
            "people_detected": self.current_detected,
            "people_enter": self.totalDown,
            "people_exit": self.totalUp,
            "people_inside": max(0, self.people_inside),
            "fps": round(self.fps_val, 1),
            "camera_source": self.camera_source
        }

camera = VideoCamera(camera_source=0)

def generate_frames():
    while True:
        frame = camera.get_frame()
        if frame is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        else:
            time.sleep(0.05)

@app.route('/video_feed')
def video_feed():
    if not camera.is_running:
        camera.start()
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/stats')
def api_stats():
    return jsonify(camera.get_stats())

@app.route('/api/camera/start', methods=['POST'])
def api_start():
    success = camera.start()
    return jsonify({"success": success, "stats": camera.get_stats()})

@app.route('/api/camera/stop', methods=['POST'])
def api_stop():
    camera.stop()
    return jsonify({"success": True, "stats": camera.get_stats()})

@app.route('/api/camera/reset', methods=['POST'])
def api_reset():
    camera.reset_stats()
    return jsonify({"success": True, "stats": camera.get_stats()})

if __name__ == '__main__':
    port = 5000
    logger.info(f"Starting Video Streaming Server on http://localhost:{port}")
    camera.start()
    app.run(host='0.0.0.0', port=port, threaded=True, debug=False)
