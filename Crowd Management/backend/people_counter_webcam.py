import os
import sys

# Ensure project root is in sys.path so local modules (tracker, utils) are discoverable
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tracker.centroidtracker import CentroidTracker
from tracker.trackableobject import TrackableObject
from itertools import zip_longest
from utils.mailer import Mailer
from imutils.video import FPS
from utils import thread
import numpy as np
import threading
import argparse
import datetime
import schedule
import logging
import imutils
import time
import dlib
import json
import csv   
import cv2

# execution start time
start_time = time.time()
# setup logger
logging.basicConfig(level = logging.INFO, format = "[INFO] %(message)s")
logger = logging.getLogger(__name__)

# resolve config and default model paths relative to project root
CONFIG_PATH = os.path.join(PROJECT_ROOT, "utils", "config.json")
DEFAULT_PROTOTXT = os.path.join(PROJECT_ROOT, "model", "MobileNetSSD_deploy.prototxt")
DEFAULT_MODEL = os.path.join(PROJECT_ROOT, "model", "MobileNetSSD_deploy.caffemodel")

# initiate features config.
with open(CONFIG_PATH, "r") as file:
    config = json.load(file)

def apply_nms(boxes, nms_threshold=0.3):
	"""
	Apply Non-Maximum Suppression to remove overlapping bounding boxes.
	
	Args:
		boxes: List of bounding boxes as (startX, startY, endX, endY)
		nms_threshold: IoU threshold for NMS (lower = more aggressive suppression)
	
	Returns:
		List of bounding boxes after NMS
	"""
	if len(boxes) == 0:
		return []
	
	if len(boxes) == 1:
		return boxes
	
	# Convert to numpy array
	boxes_array = np.array(boxes, dtype="float")
	
	# Calculate coordinates
	x1 = boxes_array[:, 0]
	y1 = boxes_array[:, 1]
	x2 = boxes_array[:, 2]
	y2 = boxes_array[:, 3]
	
	# Calculate area of each box
	area = (x2 - x1 + 1) * (y2 - y1 + 1)
	
	# Sort by area (keep larger boxes)
	idxs = np.argsort(area)[::-1]
	
	keep = []
	
	while len(idxs) > 0:
		# Take the first box (largest remaining)
		current = idxs[0]
		keep.append(current)
		
		if len(idxs) == 1:
			break
		
		# Get remaining boxes
		remaining = idxs[1:]
		
		# Calculate intersection coordinates
		ix1 = np.maximum(x1[current], x1[remaining])
		iy1 = np.maximum(y1[current], y1[remaining])
		ix2 = np.minimum(x2[current], x2[remaining])
		iy2 = np.minimum(y2[current], y2[remaining])
		
		# Calculate intersection area
		iw = np.maximum(0, ix2 - ix1 + 1)
		ih = np.maximum(0, iy2 - iy1 + 1)
		inter_area = iw * ih
		
		# Calculate union area
		union_area = area[current] + area[remaining] - inter_area
		
		# Calculate IoU
		iou = inter_area / union_area
		
		# Keep only boxes with IoU below threshold
		idxs = remaining[np.where(iou <= nms_threshold)[0]]
	
	return boxes_array[keep].astype("int").tolist()

def parse_arguments():
	# function to parse the arguments
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--prototxt", required=False, default=DEFAULT_PROTOTXT,
        help="path to Caffe 'deploy' prototxt file")
    ap.add_argument("-m", "--model", required=False, default=DEFAULT_MODEL,
        help="path to Caffe pre-trained model")
    ap.add_argument("-i", "--input", type=str, default=None,
        help="path to optional input video file")
    ap.add_argument("-o", "--output", type=str, default=None,
        help="path to optional output video file")
    # confidence default 0.4
    ap.add_argument("-c", "--confidence", type=float, default=0.4,
        help="minimum probability to filter weak detections")
    ap.add_argument("-s", "--skip-frames", type=int, default=30,
        help="# of skip frames between detections")
    args = vars(ap.parse_args())
    return args

def send_mail():
	# function to send the email alerts
	Mailer().send(config["Email_Receive"])

def log_data(move_in, in_time, move_out, out_time):
	# function to log the entry and exit counting data
	data = [move_in, in_time, move_out, out_time]
	# transpose the data to align the columns properly
	export_data = zip_longest(*data, fillvalue = '')

	log_dir = os.path.join(PROJECT_ROOT, "utils", "data", "logs")
	os.makedirs(log_dir, exist_ok=True)
	log_file = os.path.join(log_dir, "counting_data.csv")

	with open(log_file, 'w', newline = '') as myfile:
		wr = csv.writer(myfile, quoting = csv.QUOTE_ALL)
		if myfile.tell() == 0: # check if header rows are already existing
			wr.writerow(("Move In", "In Time", "Move Out", "Out Time"))
			wr.writerows(export_data)

def people_counter():
	# main function for people_counter.py
	args = parse_arguments()
	# initialize the list of class labels MobileNet SSD was trained to detect
	CLASSES = ["background", "aeroplane", "bicycle", "bird", "boat",
		"bottle", "bus", "car", "cat", "chair", "cow", "diningtable",
		"dog", "horse", "motorbike", "person", "pottedplant", "sheep",
		"sofa", "train", "tvmonitor"]

	# load our serialized model from disk
	net = cv2.dnn.readNetFromCaffe(args["prototxt"], args["model"])

	# Camera input setup: Video file, Threaded stream, IP Camera URL, or Laptop Webcam (index 0)
	if args.get("input", None):
		logger.info(f"Starting video file: {args['input']}...")
		vs = cv2.VideoCapture(args["input"])
		if not vs.isOpened():
			logger.error(f"Could not open video file: {args['input']}.")
			return
	elif config.get("Thread", False):
		camera_src = config["url"] if (config.get("url") and len(config["url"].strip()) > 0) else 0
		logger.info(f"Starting threaded video capture with source: {camera_src}...")
		vs = thread.ThreadingClass(camera_src)
		if not vs.isOpened():
			logger.error("Could not open video source with threading.")
			return
	elif config.get("url") and len(config["url"].strip()) > 0:
		# Future airport IP-camera / RTSP support
		logger.info(f"Connecting to IP camera stream: {config['url']}...")
		vs = cv2.VideoCapture(config["url"])
		if not vs.isOpened():
			logger.error(f"Could not connect to IP camera at {config['url']}.")
			return
	else:
		# Default testing source: Laptop webcam (index 0)
		logger.info("Opening laptop webcam (camera index 0)...")
		vs = cv2.VideoCapture(0)
		if not vs.isOpened():
			logger.error("Could not open the laptop webcam.")
			return

	# initialize the video writer (we'll instantiate later if need be)
	writer = None

	# initialize the frame dimensions (we'll set them as soon as we read
	# the first frame from the video)
	W = None
	H = None

	# instantiate our centroid tracker, then initialize a list to store
	# each of our dlib correlation trackers, followed by a dictionary to
	# map each unique object ID to a TrackableObject
	# Increased maxDisappeared to 60 to maintain object IDs longer
	# Increased maxDistance to 75 for better matching of slow-moving objects
	ct = CentroidTracker(maxDisappeared=60, maxDistance=75)
	trackers = []
	trackableObjects = {}

	# initialize the total number of frames processed thus far, along
	# with the total number of objects that have entered/exited
	totalFrames = 0
	totalDown = 0  # Entry count
	totalUp = 0    # Exit count
	# initialize counters and lists to store the counting data
	people_inside = 0
	move_in = []
	in_time = []
	move_out = []
	out_time = []

	# start the frames per second throughput estimator
	fps = FPS().start()

	# loop over frames from the video stream
	while True:
		# grab the next frame using cv2.VideoCapture read() format
		ret, frame = vs.read()

		# if we did not grab a frame then we have reached the end or camera error
		if not ret or frame is None:
			if args.get("input", None):
				logger.info("Finished processing video file.")
			else:
				logger.error("Could not read a frame from the laptop webcam.")
			break

		# resize the frame to have a maximum width of 500 pixels (the
		# less data we have, the faster we can process it), then convert
		# the frame from BGR to RGB for dlib
		frame = imutils.resize(frame, width = 500)
		rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

		# if the frame dimensions are empty, set them
		if W is None or H is None:
			(H, W) = frame.shape[:2]

		# if we are supposed to be writing a video to disk, initialize
		# the writer
		if args["output"] is not None and writer is None:
			fourcc = cv2.VideoWriter_fourcc(*"mp4v")
			writer = cv2.VideoWriter(args["output"], fourcc, 30,
				(W, H), True)

		# initialize the current status along with our list of bounding
		# box rectangles returned by either (1) our object detector or
		# (2) the correlation trackers
		status = "Waiting"
		rects = []

		# check to see if we should run a more computationally expensive
		# object detection method to aid our tracker
		if totalFrames % args["skip_frames"] == 0:
			# set the status and initialize our new set of object trackers
			status = "Detecting"
			trackers = []

			# convert the frame to a blob and pass the blob through the
			# network and obtain the detections
			blob = cv2.dnn.blobFromImage(frame, 0.007843, (W, H), 127.5)
			net.setInput(blob)
			detections = net.forward()

			# Collect all person detections first
			person_rects = []
			
			# loop over the detections
			for i in np.arange(0, detections.shape[2]):
				# extract the confidence (i.e., probability) associated
				# with the prediction
				confidence = detections[0, 0, i, 2]

				# filter out weak detections by requiring a minimum
				# confidence
				if confidence > args["confidence"]:
					# extract the index of the class label from the
					# detections list. CLASSES lists all 20 labels the
					# pretrained model outputs (needed to decode its
					# results), but only "person" is kept below -- every
					# other class is discarded, so this never becomes a
					# general object detector.
					idx = int(detections[0, 0, i, 1])

					# if the class label is not a person, ignore it
					if CLASSES[idx] != "person":
						continue

					# compute the (x, y)-coordinates of the bounding box
					# for the object
					box = detections[0, 0, i, 3:7] * np.array([W, H, W, H])
					(startX, startY, endX, endY) = box.astype("int")
					
			# 2. Also detect faces/heads for close-up webcam users
			gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
			face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
			faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(35, 35))
			for (fx, fy, fw, fh) in faces:
				startX = max(0, fx - int(fw * 0.2))
				startY = max(0, fy - int(fh * 0.2))
				endX = min(W, fx + fw + int(fw * 0.2))
				endY = min(H, fy + fh + int(fh * 0.8))
				person_rects.append((startX, startY, endX, endY))

			# Apply Non-Maximum Suppression to remove overlapping detections
			rects = apply_nms(person_rects, nms_threshold=0.35)
			
			# Create trackers for the NMS-filtered detections
			for (startX, startY, endX, endY) in rects:
				# construct a dlib rectangle object from the bounding
				# box coordinates and then start the dlib correlation
				# tracker
				tracker = dlib.correlation_tracker()
				rect = dlib.rectangle(startX, startY, endX, endY)
				tracker.start_track(rgb, rect)

				# add the tracker to our list of trackers so we can
				# utilize it during skip frames
				trackers.append(tracker)

		# otherwise, we should utilize our object *trackers* rather than
		# object *detectors* to obtain a higher frame processing throughput
		else:
			# loop over the trackers
			for tracker in trackers:
				# set the status of our system to be 'tracking' rather
				# than 'waiting' or 'detecting'
				status = "Tracking"

				# update the tracker and grab the updated position
				tracker.update(rgb)
				pos = tracker.get_position()

				# unpack the position object
				startX = int(pos.left())
				startY = int(pos.top())
				endX = int(pos.right())
				endY = int(pos.bottom())

				# add the bounding box coordinates to the rectangles list
				rects.append((startX, startY, endX, endY))

		# draw a horizontal line in the center of the frame -- once an
		# object crosses this line we will determine whether they were
		# moving 'up' or 'down'
		cv2.line(frame, (0, H // 2), (W, H // 2), (0, 0, 0), 3)
		cv2.putText(frame, "-Prediction border - Entrance-", (10, H - 200),
			cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

		# use the centroid tracker to associate the (1) old object
		# centroids with (2) the newly computed object centroids
		objects = ct.update(rects)

		# loop over the tracked objects
		for (objectID, centroid) in objects.items():
			# check to see if a trackable object exists for the current
			# object ID
			to = trackableObjects.get(objectID, None)

			# if there is no existing trackable object, create one
			if to is None:
				to = TrackableObject(objectID, centroid)
				to.crossed_enter = False
				to.crossed_exit = False
				to.inside = centroid[1] > H // 2

			# otherwise, there is a trackable object so we can utilize it
			# to determine direction
			else:
				to.consecutive_missed_frames = 0
				prev_y = to.centroids[-1][1] if len(to.centroids) > 0 else centroid[1]
				to.centroids.append(centroid)

				buffer_zone = 25
				midline = H // 2

				# ENTRY DETECTION: Clean downward crossing from above to below
				if prev_y < midline - buffer_zone and centroid[1] > midline + buffer_zone and not getattr(to, 'crossed_enter', False):
					totalDown += 1
					to.crossed_enter = True
					to.inside = True
					people_inside = max(len(objects), totalDown - totalUp)
					date_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
					move_in.append(totalDown)
					in_time.append(date_time)
					logger.info(f"Person {objectID} entered. People Entered: {totalDown}, People Inside: {people_inside}")
					
					# if the people limit exceeds over threshold, send an email alert
					if people_inside >= config["Threshold"]:
						cv2.putText(frame, "-ALERT: People limit exceeded-", (10, frame.shape[0] - 80),
							cv2.FONT_HERSHEY_COMPLEX, 0.5, (0, 0, 255), 2)
						if config["ALERT"]:
							logger.info("Sending email alert..")
							email_thread = threading.Thread(target = send_mail)
							email_thread.daemon = True
							email_thread.start()
							logger.info("Alert sent!")

				# EXIT DETECTION: Clean upward crossing from below to above
				elif prev_y > midline + buffer_zone and centroid[1] < midline - buffer_zone and not getattr(to, 'crossed_exit', False):
					totalUp += 1
					to.crossed_exit = True
					to.inside = False
					people_inside = max(len(objects), totalDown - totalUp)
					date_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
					move_out.append(totalUp)
					out_time.append(date_time)
					logger.info(f"Person {objectID} exited. People Exited: {totalUp}, People Inside: {people_inside}")

			# store the trackable object in our dictionary
			trackableObjects[objectID] = to

			# draw both the ID of the object and the centroid of the
			# object on the output frame
			text = "ID {}".format(objectID)
			cv2.putText(frame, text, (centroid[0] - 10, centroid[1] - 10),
				cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
			cv2.circle(frame, (centroid[0], centroid[1]), 4, (255, 255, 255), -1)

		# Cleanup: Remove objects that have been missing too long
		objectIDs_to_remove = []
		for objectID in list(trackableObjects.keys()):
			if objectID not in objects:
				# This object is no longer being tracked
				to = trackableObjects[objectID]
				
				# Mark for removal if they've been gone long enough
				to.consecutive_missed_frames += 1
				if to.consecutive_missed_frames > 10:  # Remove after 10 frames of absence
					# If they disappear while still marked as inside, decrement the counter
					if to.inside:
						people_inside -= 1
						logger.info(f"Person {objectID} disappeared while inside. People Inside: {people_inside}")
					objectIDs_to_remove.append(objectID)
		
		# Remove objects that have been missing too long
		for objectID in objectIDs_to_remove:
			del trackableObjects[objectID]

		# construct a tuple of information we will be displaying on the frame
		info_status = [
			("Status", status),
			("People Entered", totalDown),
			("People Exited", totalUp),
		]

		info_total = [
			("People Inside", people_inside),
		]

		# display the output
		for (i, (k, v)) in enumerate(info_status):
			text = "{}: {}".format(k, v)
			cv2.putText(frame, text, (10, H - ((i * 20) + 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

		for (i, (k, v)) in enumerate(info_total):
			text = "{}: {}".format(k, v)
			cv2.putText(frame, text, (265, H - ((i * 20) + 60)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

		# initiate a simple log to save the counting data
		if config["Log"]:
			log_data(move_in, in_time, move_out, out_time)

		# check to see if we should write the frame to disk
		if writer is not None:
			writer.write(frame)

		# show the output frame
		cv2.imshow("Real-Time Monitoring/Analysis Window", frame)
		key = cv2.waitKey(1) & 0xFF
		# if the `q` key was pressed, break from the loop
		if key == ord("q"):
			break
		# increment the total number of frames processed thus far and
		# then update the FPS counter
		totalFrames += 1
		fps.update()

		# initiate the timer
		if config["Timer"]:
			# automatic timer to stop the live stream (set to 8 hours/28800s)
			end_time = time.time()
			num_seconds = (end_time - start_time)
			if num_seconds > 28800:
				break

	# stop the timer and display FPS information
	fps.stop()
	logger.info("Elapsed time: {:.2f}".format(fps.elapsed()))
	logger.info("Approx. FPS: {:.2f}".format(fps.fps()))

	# release the camera device/resource cleanly
	if vs is not None:
		vs.release()

	# release the video writer if instantiated
	if writer is not None:
		writer.release()

	# close any open windows
	cv2.destroyAllWindows()

# initiate the scheduler
if __name__ == "__main__":
    people_counter()