import time

class ConsoleLogger:
    @staticmethod
    def section(title):
        print(f"\n{'='*60}\n🚀 {title}\n{'='*60}")

    @staticmethod
    def step(emoji, action, detail=None):
        timestamp = time.strftime("%H:%M:%S")
        if detail:
             print(f"[{timestamp}] {emoji}  {action}\n    ↳ {detail}")
        else:
             print(f"[{timestamp}] {emoji}  {action}")

    @staticmethod
    def success(message):
        print(f"✅  {message}")

    @staticmethod
    def warning(message):
        print(f"⚠️  {message}")
    
    @staticmethod
    def error(message):
        print(f"❌  {message}")
