class TrackableObject:
    def __init__(self, objectID, centroid):
        self.objectID = objectID
        self.centroids = [centroid]
        
        # Track whether person is currently inside the monitored area
        # Used to ensure entry and exit are counted only once each
        self.inside = False
        
        # Track frames since last position update (to detect if tracking is lost)
        self.consecutive_missed_frames = 0
