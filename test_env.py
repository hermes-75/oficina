#!/usr/bin/env python3
import os
print(f"HERMES_HOME env: {repr(os.environ.get('HERMES_HOME'))}")
print(f"HOME: {repr(os.environ.get('HOME'))}")

from pathlib import Path
PROJECT_ROOT = Path("/home/koday75/.hermes/hermes-agent/")
print(f"PROJECT_ROOT: {PROJECT_ROOT}")
print(f"Project .env exists: {(PROJECT_ROOT / '.env').exists()}")

home_path = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
print(f"home_path: {home_path}")
print(f"user_env: {home_path / '.env'}")
print(f"user_env exists: {(home_path / '.env').exists()}")
