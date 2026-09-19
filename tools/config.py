import json
import sys
from pathlib import Path
from app.config import SiteConfig

if __name__ == '__main__':
    config = SiteConfig.model_validate_json(Path(sys.argv[1]).read_text())
    print(json.dumps(config.model_dump()))
