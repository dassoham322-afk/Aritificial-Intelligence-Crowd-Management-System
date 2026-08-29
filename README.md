# ✈️ AI-Based Crowd Management System

<p align="center">
  <b>Possible Technologies • Work Flow • System Interaction</b>
</p>

---

## 🛠️ Possible Technologies

| 🔧 **Purpose**                | 💻 **Technology**                                                              |
| :---------------------------- | :----------------------------------------------------------------------------- |
| 🐍 **Programming**            | **Python**                                                                     |
| 🎥 **Video Capture**          | **OpenCV** — Frame Acquisition & Processing                                    |
| 🤖 **AI Detection**           | **Lite SSD (Single Shot Detector) with MobileNet Backbone** — Person Detection |
| 🖥️ **Display / Dashboard**   | **HTML, CSS, React.js** — Interactive Dashboard & Visualization                |
| 🔔 **Alerts / Notifications** | **Python Logic** — On-screen Alerts, Optional Sound/Notification               |

---

## 🔄 Work Flow

```text
                    ┌──────────────────────────────┐
                    │ 🎥 WEBCAM / IP CAM /        │
                    │        MULTI-IP CAM          │
                    └──────────────┬───────────────┘
                                   │
                                   │
                                   ▼
              ┌────────────────────────────────────────┐
              │ 📹 LIVE VIDEO CAPTURE / VIDEO CAPTURE  │
              │            FROM STORED FILE             │
              └───────────────────┬────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────────┐
              │ 🤖 LITE SSD (SINGLE SHOT DETECTOR)     │
              │          WITH MOBILENET BACKBONE       │
              └───────────────────┬────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────────┐
              │ 👥 COUNT NO. OF PEOPLE AT EACH COUNTER │
              └───────────────────┬────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────────┐
              │ 📊 COMPARE CROWD COUNT BETWEEN         │
              │            COUNTERS                     │
              └───────────────────┬────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────────┐
              │ 🚨 IDENTIFY OVERCROWDED COUNTERS       │
              └───────────────────┬────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────────┐
              │ 🔄 SUGGEST PASSENGER REDIRECTION       │
              └───────────────────┬────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────────┐
              │ 🖥️ DISPLAY RESULT ON DASHBOARD         │
              └────────────────────────────────────────┘
```

---

## 👥 System Interaction

```text
┌──────────────────────┐
│ 👤 ADMINISTRATION    │
├──────────────────────┤
│ • Login Credentials  │
│ • Counter            │
│   Configuration      │
│ • Crowd Monitoring   │
│   Report             │
└──────────┬───────────┘
           │
           │
           ▼
╔══════════════════════════════════════╗
║     🤖 AI BASED CROWD MANAGEMENT     ║
║                SYSTEM                ║
╚══════════════════════════════════════╝
           ▲              ▲
           │              │
           │              │
┌──────────┴────────┐   ┌─┴────────────────────┐
│ 🛡️ SECURITY       │   │ 👨‍💼 COUNTER OPERATOR │
│    OFFICER        │   │                      │
├───────────────────┤   ├──────────────────────┤
│ • Monitor Crowd   │   │ • Counter Status     │
│   Activity        │   │   Update             │
│ • Overcrowding    │   │ • Live Crowd Count   │
│   Alert           │   │ • Passenger          │
│ • Live Counter    │   │   Redirection        │
│   Status          │   │   Suggestion         │
└───────────────────┘   └──────────────────────┘
           │
           │
           ▼
┌─────────────────────────────┐
│ 🔔 NOTIFICATION SYSTEM      │
├─────────────────────────────┤
│ • Queue Alert Notification  │
│ • Passenger Redirection     │
│   Message                   │
└─────────────────────────────┘
```

### 🔹 Administration

* **Login Credentials**
* **Crowd Monitoring Report**
* **Counter Configuration**

### 🔹 Security Officer

* **Monitor Crowd Activity**
* **Overcrowding Alert**
* **Live Counter Status**

### 🔹 Counter Operator

* **Counter Status Update**
* **Live Crowd Count**
* **Passenger Redirection Suggestion**

### 🔹 Notification System

* **Queue Alert Notification**
* **Passenger Redirection Message**
