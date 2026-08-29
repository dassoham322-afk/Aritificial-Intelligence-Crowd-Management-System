import cv2
import threading

class ThreadingClass:
	"""
	Threaded video capture class for high throughput streaming.
	Compatible with both local webcams (source 0) and RTSP / IP camera streams.
	"""
	def __init__(self, src=0):
		self.capture = cv2.VideoCapture(src)
		self.status, self.frame = self.capture.read()
		self.is_running = True
		self.thread = threading.Thread(target=self.update, args=())
		self.thread.daemon = True
		self.thread.start()

	def update(self):
		while self.is_running:
			if self.capture.isOpened():
				(self.status, self.frame) = self.capture.read()

	def read(self):
		return self.status, self.frame

	def isOpened(self):
		return self.capture.isOpened()

	def release(self):
		self.is_running = False
		if self.capture.isOpened():
			self.capture.release()
