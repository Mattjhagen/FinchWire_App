from __future__ import annotations

import json
from pathlib import Path
from threading import RLock
from typing import Any, Dict


DEFAULT_STATE: Dict[str, Any] = {
    "downloads": [],
    "status_checks": [],
    "users": {},
    "settings": {
        "ai_provider": "none",
        "tts_provider": "none",
        "has_ai_api_key": False,
        "has_tts_api_key": False,
    },
    "interest_profiles": {},
    "user_story_interactions": [],
    "stories": [],
    "story_mentions": [],
    "creator_watches": {},
    "creator_events": [],
    "push_subscriptions": [],
    "notification_preferences": {},
    "notifications": [],
    "notification_deliveries": [],
    "notification_dedupe": [],
}


class JsonStateStore:
    def __init__(self, path: Path):
        self._path = path
        self._lock = RLock()
        self._state: Dict[str, Any] = {}
        self._load()

    @property
    def state(self) -> Dict[str, Any]:
        with self._lock:
            return self._state

    def _load(self) -> None:
        with self._lock:
            if not self._path.exists():
                self._state = json.loads(json.dumps(DEFAULT_STATE))
                self._save_unlocked()
                return

            try:
                loaded = json.loads(self._path.read_text(encoding="utf-8"))
            except Exception:
                loaded = {}

            merged = json.loads(json.dumps(DEFAULT_STATE))
            if isinstance(loaded, dict):
                merged.update(loaded)
            self._state = merged
            self._save_unlocked()

    def _save_unlocked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._state, indent=2, sort_keys=True), encoding="utf-8")

    def save(self) -> None:
        with self._lock:
            self._save_unlocked()

    def get_collection(self, key: str):
        with self._lock:
            return self._state.setdefault(key, json.loads(json.dumps(DEFAULT_STATE.get(key, []))))

    def replace_collection(self, key: str, value: Any) -> None:
        with self._lock:
            self._state[key] = value
            self._save_unlocked()

