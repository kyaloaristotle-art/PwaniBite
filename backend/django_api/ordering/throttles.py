from rest_framework.throttling import AnonRateThrottle


class AuthAttemptThrottle(AnonRateThrottle):
    scope = "auth"

    def parse_rate(self, rate):
        count, period = rate.split("/", 1)
        if period.endswith("m") and period[:-1].isdigit():
            return int(count), int(period[:-1]) * 60
        return super().parse_rate(rate)
