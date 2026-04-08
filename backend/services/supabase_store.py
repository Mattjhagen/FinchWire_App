from __future__ import annotations
import json
import logging
import os
from pathlib import Path
from threading import RLock
from typing import Any, Dict, List, Optional
import requests
from .state_store import JsonStateStore, DEFAULT_STATE

logger = logging.getLogger("finchwire.supabase")

class SupabaseStateStore(JsonStateStore):
    """
    Extends JsonStateStore to sync with Supabase.
    Uses local JSON as a primary cache (as requested) and Supabase as remote persistence.
    """
    def __init__(self, path: Path, supabase_url: Optional[str] = None, supabase_key: Optional[str] = None):
        super().__init__(path)
        self._supabase_url = supabase_url or os.environ.get("SUPABASE_URL")
        self._supabase_key = supabase_key or os.environ.get("SUPABASE_KEY")
        self._sync_enabled = bool(self._supabase_url and self._supabase_key)
        
        if self._sync_enabled:
            logger.info("Supabase sync enabled.")
            # Initial pull from Supabase
            self.pull_from_remote()
        else:
            logger.warning("Supabase URL or Key missing. Sync disabled.")

    def _get_headers(self):
        return {
            "apikey": self._supabase_key,
            "Authorization": f"Bearer {self._supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }

    def pull_from_remote(self):
        """Pull all collections from Supabase and merge into local state."""
        if not self._sync_enabled:
            return

        logger.info("Pulling state from Supabase...")
        # Since Supabase stores things in tables, we'd ideally have one table per collection.
        # For simplicity in this 'state store' replacement, we might store the whole blob 
        # in a 'state' table or individual tables.
        # Let's assume a 'state' table with 'key' and 'data' columns.
        
        try:
            url = f"{self._supabase_url}/rest/v1/state?select=key,data"
            response = requests.get(url, headers=self._get_headers(), timeout=10)
            if response.status_code == 200:
                remote_data = response.json()
                with self._lock:
                    for item in remote_data:
                        key = item.get("key")
                        data = item.get("data")
                        if key in self._state:
                            # Merge or replace? Let's replace for now as truth.
                            self._state[key] = data
                    self._save_unlocked()
                logger.info("Supabase state pull completed.")
            else:
                logger.error(f"Failed to pull from Supabase: {response.status_code} {response.text}")
        except Exception as e:
            logger.error(f"Supabase pull error: {e}")

    def push_to_remote(self, key: Optional[str] = None):
        """Push a specific collection or all state to Supabase."""
        if not self._sync_enabled:
            return

        keys_to_push = [key] if key else self._state.keys()
        
        for k in keys_to_push:
            try:
                payload = {"key": k, "data": self._state[k]}
                url = f"{self._supabase_url}/rest/v1/state"
                # upsert
                response = requests.post(
                    url, 
                    headers={**self._get_headers(), "Prefer": "resolution=merge-duplicates"}, 
                    json=payload, 
                    timeout=10
                )
                if response.status_code not in [200, 201]:
                    logger.error(f"Failed to push {k} to Supabase: {response.status_code} {response.text}")
            except Exception as e:
                logger.error(f"Supabase push error for {k}: {e}")

    def save(self) -> None:
        super().save()
        # Async push would be better, but for now we'll do it synchronously
        if self._sync_enabled:
            self.push_to_remote()

    def replace_collection(self, key: str, value: Any) -> None:
        super().replace_collection(key, value)
        if self._sync_enabled:
            self.push_to_remote(key)
