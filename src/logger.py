import logging
import sys
import os
from logging.handlers import TimedRotatingFileHandler

class LoggerSetup:
    """
    Utility class to configure the application logger for RODSIC_GUI.
    """
    
    @staticmethod
    def get_logger(name: str):
        """
        Creates and configures a logger instance.
        Logs are saved to logs/RODSIC_GUI.log.
        Daily rotation moves old logs to logs/old/RODSIC_GUI.log.YYYYMMDD.
        """
        logger = logging.getLogger(name)
        
        # Set the log level based on environment
        log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()
        level = getattr(logging, log_level_str, logging.INFO)
        logger.setLevel(level)
        
        if not logger.handlers:
            # 1. Define Paths: ../logs relative to src/
            base_dir = os.path.dirname(os.path.abspath(__file__)) # src/
            logs_dir = os.path.join(base_dir, "../logs")
            old_logs_dir = os.path.join(logs_dir, "old") # Per user request "old" (IB_Core used "oldlogs", user said "old")
            
            os.makedirs(logs_dir, exist_ok=True)
            # We don't strictly need to create 'old' here as rotator does, or better create it now.
            os.makedirs(old_logs_dir, exist_ok=True)
            
            log_file = os.path.join(logs_dir, "RODSIC_GUI.log")
            
            # 2. Config Handler
            # when='midnight': rotate at midnight
            handler = TimedRotatingFileHandler(log_file, when="midnight", interval=1)
            handler.suffix = "%Y%m%d" 
            handler.setLevel(level)
            
            # 3. Custom Namer: logs/old/RODSIC_GUI_YYYYMMDD.log
            def custom_namer(default_name):
                # source: .../logs/RODSIC_GUI.log.20230101
                path, filename = os.path.split(default_name)
                # filename like RODSIC_GUI.log.20230101
                
                parts = filename.split('.')
                if len(parts) >= 3:
                     # RODSIC_GUI, log, YYYYMMDD
                     date_part = parts[-1]
                     new_filename = f"RODSIC_GUI_{date_part}.log"
                     return os.path.join(path, "old", new_filename)
                return default_name

            # 4. Custom Rotator
            def custom_rotator(source, dest):
                if os.path.exists(source):
                    os.rename(source, dest)

            handler.namer = custom_namer
            handler.rotator = custom_rotator

            # 5. Formatter
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s:%(lineno)d - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            
            logger.addHandler(handler)
            
            # Console Handler (Optional, user didn't explicitly ask but usually good for docker debugging)
            # console_handler = logging.StreamHandler(sys.stdout)
            # console_handler.setFormatter(formatter)
            # logger.addHandler(console_handler)
            
            logger.propagate = False 
            
        return logger
