import os
import smtplib
import json

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(CONFIG_PATH, "r") as file:
    config = json.load(file)


class Mailer:
    def __init__(self):
        self.email = config["Email_Send"]
        self.password = config["Email_Password"]
        self.port = 465
        self.server = smtplib.SMTP_SSL("smtp.gmail.com", self.port)

    def send(self, mail):
        self.server = smtplib.SMTP_SSL("smtp.gmail.com", self.port)
        self.server.login(self.email, self.password)

        SUBJECT = "ALERT!"
        TEXT = "People limit exceeded in your building!"
        message = "Subject: {}\n\n{}".format(SUBJECT, TEXT)

        self.server.sendmail(self.email, mail, message)
        self.server.quit()
