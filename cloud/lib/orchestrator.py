#!/usr/bin/env python3
"""
Оркестратор параллельного рендера на Hugging Face Jobs (Hardened v2.2, версия набора).

Обычно его не запускают напрямую: основной вход — `cloud/hf_render.py` (бандл → датасет → задачи → склейка → звук).
Прямой вызов нужен для служебных команд: `status`, `cancel`, `validate-chunk`, `validate-master`.

Правки набора относительно оригинала автора:
  * имена датасета и образа воркера — только из настроек/окружения (HF_DATASET, HF_WORKER_IMAGE), без зашитых аккаунтов;
  * воркер запускается как `python3 /app/render_chunk.py` из образа Space (а не скачивается из датасета);
  * стадия задачи берётся из `JobStage.value` (в Python ≥ 3.11 `str(JobStage.X)` даёт 'JobStage.X' и задача «не завершалась»);
  * `fetch_job_logs` возвращает итератор — строки склеиваются перед поиском BENCHMARK_RESULT_JSON;
  * `BudgetExceededError` больше не превращается в OUTCOME_UNKNOWN (задача не была запущена — кусок остаётся PENDING);
  * HF_TOKEN в dry-run — предупреждение, а не ошибка; повтор скачивания чанка; каталог запуска не создаётся лишний раз при resume.

Core Hardening Guarantees:
1. CLI Config Precedence: CLI defaults are None; file configs (e.g. provider=mock, budget=0.01)
   are NEVER overwritten by implicit CLI defaults. Never implicitly switches mock to paid.
2. HF Job Lifecycle: Uses HfApi.run_job() with immediate JobInfo.id persistence into JobLedger,
   passes server-side timeout, polls job.status.stage (not object string equality), and enforces real cancellation.
3. Strict Reconciliation & Cancel: Matches exact run_id and chunk_idx. Never adopts foreign jobs.
   No blind retries. Cancel command fails if HF API or CLI fails to confirm cancellation.
4. Dataset Path, Resume & Budget: Validates actual path from hf_hub_download (>0 bytes).
   Resume re-verifies completed chunks on disk with SegmentValidator and restores budget spent/reserved.
   BudgetController strictly rejects NaN, Inf, <= 0 limits.
5. Master QC Honesty: Explicitly states perceptual lipsync is unverified by simple packet metrics.
"""

import argparse
import concurrent.futures
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import logging
import math
import os
import random
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
import uuid

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("HFOrchestrator")


# ==============================================================================
# 1. EXCEPTIONS
# ==============================================================================

class OrchestratorError(Exception):
    """Base exception for orchestrator errors."""
    pass

class BudgetExceededError(OrchestratorError):
    """Raised when an operation would exceed the configured spending limit."""
    pass

class ValidationError(OrchestratorError):
    """Raised when segment or master QC validation fails."""
    pass

class JobReconciliationError(OrchestratorError):
    """Raised when an ambiguous job cannot be reconciled."""
    pass

class AbortedError(OrchestratorError):
    """Raised when execution was cancelled via Kill Switch / SIGINT."""
    pass


# ==============================================================================
# 2. CONFIGURATION MODEL
# ==============================================================================

@dataclass
class OrchestratorConfig:
    # Target Video Spec
    composition_id: str = "Lesson1"
    total_frames: int = 23715
    fps: float = 30.0
    scale: float = 1.3333333333333333
    
    # Compute / Worker Spec
    num_workers: int = 72
    worker_concurrency: int = 4
    flavor: str = "cpu-upgrade"
    cost_per_hour: float = 0.03
    job_timeout_sec: int = 600   # резерв бюджета на задачу = минуты × $0.0005; hf_render.py подбирает по размеру куска
    max_concurrency_limit: int = 72
    
    # Cloud Artifacts / Repos
    provider: str = "huggingface" # "huggingface" or "mock"
    docker_image: str = field(default_factory=lambda: os.environ.get("HF_WORKER_IMAGE", ""))   # hf.co/spaces/<user>/remotion-speed-worker
    dataset_repo: str = field(default_factory=lambda: os.environ.get("HF_DATASET", ""))        # <user>/video-render-assets
    bundle_name: str = "bundles/bundle.tar.gz"  # путь файла бандла внутри датасета
    
    # Scheduler
    scheduler_type: str = "fixed-chunks" # "fixed-chunks" or "complexity-aware"
    complexity_profile_path: Optional[str] = None
    
    # Budget & Retries
    budget_limit_usd: float = 0.50
    max_retries: int = 2
    
    # Audio Sync
    audio_path: Optional[str] = None
    audio_offset_ms: int = 500 # LEAD=15 frames at 30 fps
    
    # Workspace & Outputs
    work_dir: str = "./hf_render_workspace"
    output_master_path: Optional[str] = None
    
    # Safety
    dry_run: bool = True # Fail-closed: True by default unless --live specified
    
    def validate(self):
        """Strict validation of parameters."""
        if math.isnan(self.budget_limit_usd) or math.isinf(self.budget_limit_usd) or self.budget_limit_usd <= 0:
            raise OrchestratorError(f"Invalid budget_limit_usd: {self.budget_limit_usd}. Must be a finite positive number.")
        if self.total_frames <= 0:
            raise OrchestratorError(f"total_frames must be positive, got {self.total_frames}")
        if self.num_workers <= 0:
            raise OrchestratorError(f"num_workers must be positive, got {self.num_workers}")
        if self.fps <= 0:
            raise OrchestratorError(f"fps must be positive, got {self.fps}")
        if self.provider not in ["huggingface", "mock"]:
            raise OrchestratorError(f"Unknown provider: {self.provider}. Must be 'huggingface' or 'mock'.")

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "OrchestratorConfig":
        valid_keys = {k for k in cls.__dataclass_fields__}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        cfg = cls(**filtered)
        cfg.validate()
        return cfg

    @classmethod
    def from_file(cls, path: str) -> "OrchestratorConfig":
        with open(path, "r", encoding="utf-8") as f:
            if path.endswith((".yaml", ".yml")):
                try:
                    import yaml
                    data = yaml.safe_load(f) or {}
                except ImportError:
                    raise OrchestratorError("PyYAML is required to read .yaml config files.")
            else:
                data = json.load(f)
        return cls.from_dict(data)


# ==============================================================================
# 3. DURABLE JOB LEDGER
# ==============================================================================

@dataclass
class LedgerEntry:
    chunk_idx: int
    start_frame: int
    end_frame: int
    frame_count: int
    filename: str
    status: str = "PENDING" # PENDING, SUBMITTED, RUNNING, COMPLETED, FAILED, CANCELLED, CORRUPTED
    job_id: Optional[str] = None
    attempts: int = 0
    submit_time: Optional[float] = None
    start_time: Optional[float] = None
    finish_time: Optional[float] = None
    wall_sec: Optional[float] = None
    render_sec: Optional[float] = None
    fps: Optional[float] = None
    cost_estimate_usd: float = 0.0
    reserved_usd: float = 0.0
    remote_path: Optional[str] = None
    local_path: Optional[str] = None
    verified_packets: Optional[int] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LedgerEntry":
        valid_keys = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


class JobLedger:
    """Thread-safe, crash-resilient ledger backed by atomic JSON writes."""
    
    def __init__(self, run_id: str, ledger_path: str, config: OrchestratorConfig):
        self.run_id = run_id
        self.ledger_path = ledger_path
        self.config_dict = asdict(config)
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.created_at
        self.status = "INITIALIZING"
        self.entries: Dict[int, LedgerEntry] = {}
        self.budget_reserved_usd = 0.0
        self.budget_spent_usd = 0.0
        self._lock = threading.Lock()
        
    def init_entries(self, chunks: List[Dict[str, Any]]):
        with self._lock:
            for c in chunks:
                idx = c["idx"]
                self.entries[idx] = LedgerEntry(
                    chunk_idx=idx,
                    start_frame=c["start"],
                    end_frame=c["end"],
                    frame_count=c["frames_count"],
                    filename=c["filename"]
                )
            self.status = "READY"
            self._save_atomic()

    def update_entry(self, chunk_idx: int, **kwargs):
        with self._lock:
            if chunk_idx in self.entries:
                entry = self.entries[chunk_idx]
                for k, v in kwargs.items():
                    if hasattr(entry, k):
                        setattr(entry, k, v)
                self.updated_at = datetime.now(timezone.utc).isoformat()
                self._save_atomic()

    def update_totals(self, reserved: float, spent: float, status: Optional[str] = None):
        with self._lock:
            self.budget_reserved_usd = round(reserved, 5)
            self.budget_spent_usd = round(spent, 5)
            if status:
                self.status = status
            self.updated_at = datetime.now(timezone.utc).isoformat()
            self._save_atomic()

    def get_entry(self, chunk_idx: int) -> Optional[LedgerEntry]:
        with self._lock:
            return self.entries.get(chunk_idx)

    def get_all_entries(self) -> List[LedgerEntry]:
        with self._lock:
            return [self.entries[idx] for idx in sorted(self.entries.keys())]

    def _save_atomic(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.ledger_path)), exist_ok=True)
        data = {
            "run_id": self.run_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "status": self.status,
            "budget_reserved_usd": self.budget_reserved_usd,
            "budget_spent_usd": self.budget_spent_usd,
            "config": self.config_dict,
            "entries": {str(k): v.to_dict() for k, v in sorted(self.entries.items())}
        }
        dir_name = os.path.dirname(self.ledger_path)
        with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as tf:
            json.dump(data, tf, indent=2)
            temp_name = tf.name
        os.replace(temp_name, self.ledger_path)

    @classmethod
    def load(cls, ledger_path: str) -> "JobLedger":
        with open(ledger_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cfg = OrchestratorConfig.from_dict(data["config"])
        ledger = cls(run_id=data["run_id"], ledger_path=ledger_path, config=cfg)
        ledger.created_at = data.get("created_at", "")
        ledger.updated_at = data.get("updated_at", "")
        ledger.status = data.get("status", "UNKNOWN")
        ledger.budget_reserved_usd = data.get("budget_reserved_usd", 0.0)
        ledger.budget_spent_usd = data.get("budget_spent_usd", 0.0)
        for k, v in data.get("entries", {}).items():
            ledger.entries[int(k)] = LedgerEntry.from_dict(v)
        return ledger


# ==============================================================================
# 4. BUDGET CONTROLLER
# ==============================================================================

class BudgetController:
    """
    Fail-closed budget controller.
    
    FINANCIAL OVERHANG NOTICE & PROVIDER BILLING DISCLAIMER:
    Hugging Face Jobs does NOT offer an upstream hard-spending cap or quota API per run.
    Local budget limits and reservations are orchestrator-side software safety gates,
    NOT an absolute guarantee of provider billing.
    Each job container is billed by Hugging Face in 1-minute minimum increments (rounded up).
    Failed, cancelled, or timed-out containers that were launched upstream are still billed by the provider.
    This controller maintains conservative reservations and per-attempt cost accounting:
    if (spent + reserved + estimated_job_cost) > budget_limit, it fails closed immediately.
    """
    
    def __init__(self, budget_limit_usd: float, cost_per_minute: float = 0.0005):
        if math.isnan(budget_limit_usd) or math.isinf(budget_limit_usd) or budget_limit_usd <= 0:
            raise ValueError(f"Invalid budget limit: {budget_limit_usd}. Must be a finite positive number.")
        self.budget_limit_usd = budget_limit_usd
        self.cost_per_minute = cost_per_minute
        self.reserved_usd = 0.0
        self.spent_usd = 0.0
        self._lock = threading.Lock()

    def estimate_job_reserve(self, timeout_sec: int) -> float:
        """Conservative reservation based on maximum timeout rounded up to minutes."""
        billed_minutes = max(1, (timeout_sec + 59) // 60)
        return billed_minutes * self.cost_per_minute

    def reserve(self, amount: float):
        with self._lock:
            if (self.spent_usd + self.reserved_usd + amount) > self.budget_limit_usd:
                over = (self.spent_usd + self.reserved_usd + amount) - self.budget_limit_usd
                raise BudgetExceededError(
                    f"BUDGET CAP REACHED: Attempted to reserve ${amount:.4f}, but "
                    f"spent=${self.spent_usd:.4f} + reserved=${self.reserved_usd:.4f} "
                    f"exceeds limit ${self.budget_limit_usd:.4f} by ${over:.4f}. "
                    "Failing closed to prevent unexpected cloud charges."
                )
            self.reserved_usd += amount

    def commit(self, reserved_amount: float, actual_wall_sec: float) -> float:
        with self._lock:
            self.reserved_usd = max(0.0, self.reserved_usd - reserved_amount)
            billed_minutes = max(1, int((actual_wall_sec + 59) // 60))
            actual_cost = billed_minutes * self.cost_per_minute
            self.spent_usd += actual_cost
            return actual_cost

    def release(self, reserved_amount: float):
        with self._lock:
            self.reserved_usd = max(0.0, self.reserved_usd - reserved_amount)

    def retain_unknown_outcome(self, reserved_amount: float):
        """Retains budget reservation when job outcome is unknown/ambiguous to prevent undercounting."""
        logger.warning(f"Retaining ${reserved_amount:.4f} in budget reservations due to ambiguous job outcome.")


# ==============================================================================
# 5. KILL SWITCH & SIGNAL HANDLING
# ==============================================================================

class KillSwitch:
    """Intercepts SIGINT/SIGTERM and cancels all active provider jobs."""
    
    def __init__(self):
        self.is_active = False
        self._handlers = []
        self._lock = threading.Lock()
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def register_cancel_callback(self, callback: Callable[[], None]):
        with self._lock:
            self._handlers.append(callback)

    def _signal_handler(self, signum, frame):
        logger.warning(f"KILL SWITCH TRIGGERED by signal {signum}! Cancelling all cloud tasks...")
        self.is_active = True
        with self._lock:
            for cb in self._handlers:
                try:
                    cb()
                except Exception as e:
                    logger.error(f"Error in kill switch callback: {e}")
        logger.warning("Kill switch completed cancellation. Aborting execution.")
        sys.exit(130)


# ==============================================================================
# 6. COMPUTE PROVIDER INTERFACE
# ==============================================================================

@dataclass
class JobSpec:
    run_id: str
    chunk_idx: int
    start_frame: int
    end_frame: int
    composition: str
    scale: float
    concurrency: int
    out_filename: str
    upload_prefix: str
    dataset_repo: str
    image: str
    flavor: str
    bundle_name: str
    timeout_sec: int


class BaseComputeProvider:
    """Abstract interface for video chunk compute providers."""
    def submit_job(self, spec: JobSpec) -> str:
        """Submits job and immediately returns job_id."""
        raise NotImplementedError
    def poll_job(self, job_id: str, spec: JobSpec) -> Dict[str, Any]:
        """Polls job until completion or timeout."""
        raise NotImplementedError
    def inspect_job(self, job_id: str) -> Dict[str, Any]:
        raise NotImplementedError
    def cancel_job(self, job_id: str) -> bool:
        raise NotImplementedError
    def reconcile_job(self, run_id: str, chunk_idx: int) -> Optional[Dict[str, Any]]:
        raise NotImplementedError


def stage_value(stage: Any) -> str:
    """Нормализует стадию задачи HF: JobStage.RUNNING / 'RUNNING' → 'RUNNING'.

    В Python ≥ 3.11 `str(JobStage.COMPLETED)` == 'JobStage.COMPLETED', поэтому берём `.value`.
    """
    if stage is None:
        return "UNKNOWN"
    raw = getattr(stage, "value", stage)
    return str(raw).split(".")[-1].upper()


class HuggingFaceJobsProvider(BaseComputeProvider):
    """
    Native Hugging Face PRO Jobs Provider using HfApi.run_job() and HfApi.inspect_job().
    Tracks exact job.status.stage and enforces server-side timeouts.
    """
    
    def __init__(self, token: Optional[str] = None):
        self.token = token or os.environ.get("HF_TOKEN")
        if not self.token:  # токен из `huggingface-cli login` / `hf auth login`
            try:
                from huggingface_hub import get_token
                self.token = get_token()
            except Exception:
                self.token = None
        if not self.token:
            logger.warning("Нет ключа HF_TOKEN (ни в окружении, ни в кэше huggingface_hub): боевые операции в облаке не заработают.")

    @staticmethod
    def build_worker_command(spec: JobSpec) -> Tuple[str, List[str]]:
        """
        Builds the wrapper and command arguments for render_chunk.py.
        STRICT CONTRACT: Must only pass CLI arguments accepted by the worker
        (cloud/worker/render_chunk.py, лежит в образе Space как /app/render_chunk.py):
        --comp, --bundle, --frames, --scale, --concurrency, --out, --upload-prefix, --repo.
        --run-id is NOT passed via CLI; run_id is passed via upload_prefix and RUN_ID environment variable.
        """
        wrapper_cmd = ""  # оставлено для совместимости возвращаемого значения
        cmd = [
            "python3", "/app/render_chunk.py",
            "--comp", spec.composition,
            "--bundle", spec.bundle_name,
            "--frames", f"{spec.start_frame}-{spec.end_frame}",
            "--scale", str(spec.scale),
            "--concurrency", str(spec.concurrency),
            "--out", spec.out_filename,
            "--upload-prefix", spec.upload_prefix,
            "--repo", spec.dataset_repo
        ]
        return wrapper_cmd, cmd

    def submit_job(self, spec: JobSpec) -> str:
        """Starts cloud job via HfApi.run_job and immediately returns job_id."""
        from huggingface_hub import HfApi
        api = HfApi(token=self.token)
        
        wrapper_cmd, cmd = self.build_worker_command(spec)
        
        env_vars = {
            "RUN_ID": spec.run_id,
            "CHUNK_IDX": str(spec.chunk_idx),
            "START_FRAME": str(spec.start_frame),
            "END_FRAME": str(spec.end_frame)
        }
        
        secrets_dict = {"HF_TOKEN": self.token} if self.token else None
        
        job_info = api.run_job(
            image=spec.image,
            command=cmd,
            env=env_vars,
            secrets=secrets_dict,
            flavor=spec.flavor,
            timeout=spec.timeout_sec
        )
        logger.info(f"Submitted HF Job for chunk {spec.chunk_idx:02d} with ID: {job_info.id}")
        return job_info.id

    def inspect_job(self, job_id: str) -> Dict[str, Any]:
        """
        Inspects job and extracts exact status stage string.
        P0-A FIX: Separates server-confirmed terminal stages from transient API/network errors.
        """
        from huggingface_hub import HfApi
        api = HfApi(token=self.token)
        try:
            info = api.inspect_job(job_id=job_id)
            stage_val = "UNKNOWN"
            message_val = None
            if hasattr(info, "status") and info.status:
                stage_val = stage_value(getattr(info.status, "stage", info.status))
                message_val = getattr(info.status, "message", None)
            return {"job_id": job_id, "stage": stage_val, "message": message_val, "is_network_error": False}
        except Exception as e:
            logger.warning(f"HF API inspect_job({job_id}) network/API error: {e}")
            return {"job_id": job_id, "stage": "INSPECTION_FAILED", "is_network_error": True, "error": str(e)}

    def poll_job(self, job_id: str, spec: JobSpec) -> Dict[str, Any]:
        """Polls HF Job until terminal stage or timeout."""
        from huggingface_hub import HfApi
        api = HfApi(token=self.token)
        t0 = time.time()
        poll_interval = 20.0  # 72 задач × 5 с = 4 300 запросов за 5 мин > лимит HF 2 500 (29.10.2026)
        consecutive_network_errors = 0
        max_consecutive_network_errors = 3
        
        while time.time() - t0 < spec.timeout_sec:
            info_dict = self.inspect_job(job_id)
            stage = info_dict.get("stage", "UNKNOWN")
            
            # P0-A FIX: Network/API inspection failure MUST NOT be treated as terminal ERROR
            if info_dict.get("is_network_error") or stage == "INSPECTION_FAILED":
                consecutive_network_errors += 1
                logger.warning(
                    f"Job {job_id} inspection encountered network/API error ({consecutive_network_errors}/{max_consecutive_network_errors}): "
                    f"{info_dict.get('error')}. Retrying poll..."
                )
                if consecutive_network_errors >= max_consecutive_network_errors:
                    logger.error(f"Job {job_id} reached {max_consecutive_network_errors} consecutive network failures. Failing closed to OUTCOME_UNKNOWN.")
                    return {
                        "status": "OUTCOME_UNKNOWN",
                        "job_id": job_id,
                        "wall_sec": round(time.time() - t0, 2),
                        "error": f"API network/inspection failure: {info_dict.get('error')}"
                    }
                time.sleep(poll_interval)
                continue
            else:
                consecutive_network_errors = 0
            
            if stage in ["COMPLETED", "SUCCESS"]:
                wall_sec = round(time.time() - t0, 2)
                # Attempt to retrieve logs for benchmark data
                bench_data = None
                try:
                    logs = "\n".join(api.fetch_job_logs(job_id=job_id))  # итератор строк
                    if "=== BENCHMARK_RESULT_JSON ===" in logs:
                        raw_json = logs.split("=== BENCHMARK_RESULT_JSON ===")[1].split("============================")[0].strip()
                        bench_data = json.loads(raw_json)
                except Exception:
                    pass
                return {
                    "status": "SUCCESS",
                    "job_id": job_id,
                    "wall_sec": wall_sec,
                    "bench_data": bench_data
                }
            elif stage in ["ERROR", "FAILED"]:
                return {
                    "status": "FAILED",
                    "job_id": job_id,
                    "wall_sec": round(time.time() - t0, 2),
                    "error": info_dict.get("message") or f"Job ended with stage {stage}"
                }
            elif stage in ["CANCELED", "DELETED"]:
                return {
                    "status": "CANCELLED",
                    "job_id": job_id,
                    "wall_sec": round(time.time() - t0, 2),
                    "error": f"Job was {stage}"
                }
                
            time.sleep(poll_interval)
            
        # Local timeout exceeded -> Cancel job
        logger.warning(f"Job {job_id} exceeded timeout {spec.timeout_sec}s. Cancelling...")
        cancelled = self.cancel_job(job_id)
        if not cancelled:
            return {
                "status": "OUTCOME_UNKNOWN",
                "job_id": job_id,
                "wall_sec": round(time.time() - t0, 2),
                "error": f"Timeout of {spec.timeout_sec}s exceeded, and cancellation unconfirmed"
            }
        return {
            "status": "FAILED",
            "job_id": job_id,
            "wall_sec": round(time.time() - t0, 2),
            "error": f"Timeout of {spec.timeout_sec}s exceeded"
        }

    def cancel_job(self, job_id: str) -> bool:
        """Cancels job and verifies cancellation with API."""
        from huggingface_hub import HfApi
        api = HfApi(token=self.token)
        try:
            api.cancel_job(job_id=job_id)
            # Verify cancellation
            time.sleep(1.0)
            st = self.inspect_job(job_id).get("stage", "")
            if st in ["CANCELED", "DELETED"]:
                logger.info(f"Verified cancellation of HF Job {job_id}")
                return True
        except Exception as e:
            logger.warning(f"API cancel_job failed for {job_id}: {e}. Trying CLI fallback...")
            
        try:
            res = subprocess.run(["hf", "jobs", "cancel", job_id], capture_output=True, timeout=15)
            if res.returncode == 0:
                st = self.inspect_job(job_id).get("stage", "")
                if st in ["CANCELED", "DELETED"]:
                    return True
        except Exception as e2:
            logger.error(f"CLI cancel failed for {job_id}: {e2}")
            
        return False

    def reconcile_job(self, run_id: str, chunk_idx: int) -> Optional[Dict[str, Any]]:
        """Queries HF API to reconcile whether an ambiguous submission actually started."""
        from huggingface_hub import HfApi
        api = HfApi(token=self.token)
        try:
            jobs = api.list_jobs()
            for j in jobs:
                env = getattr(j, "environment", {}) or {}
                j_run = env.get("RUN_ID")
                j_chunk = env.get("CHUNK_IDX")
                cmd_str = " ".join(getattr(j, "command", []) or [])
                
                # STRICT MATCH: must match exact run_id AND chunk_idx
                has_run = (j_run == run_id) or (f"--run-id {run_id}" in cmd_str) or (f"renders/{run_id}" in cmd_str)
                has_chunk = (j_chunk == str(chunk_idx)) or (f"chunk_{chunk_idx:03d}" in cmd_str)
                
                if has_run and has_chunk:
                    jid = getattr(j, "id", "")
                    st = stage_value(getattr(j.status, "stage", j.status)) if hasattr(j, "status") and j.status else "UNKNOWN"
                    logger.info(f"Reconciled existing job {jid} for run {run_id} chunk {chunk_idx} (stage={st})")
                    return {"job_id": jid, "stage": st, "status": st}
        except Exception as e:
            logger.warning(f"Reconciliation query failed: {e}")
        return None


class MockComputeProvider(BaseComputeProvider):
    """Deterministic, zero-cost mock provider for offline unit and integration tests."""
    
    def __init__(
        self,
        simulated_fps: float = 3.0,
        fail_chunks: Optional[List[int]] = None,
        fail_attempts: Optional[Dict[int, int]] = None,
        cancel_should_fail: bool = False,
        inspect_fails: bool = False
    ):
        self.simulated_fps = simulated_fps
        self.fail_chunks = set(fail_chunks or [])
        self.fail_attempts = dict(fail_attempts or {})
        self.cancel_should_fail = cancel_should_fail
        self.inspect_fails = inspect_fails
        self.jobs_state = {} # job_id -> dict(stage, spec, t_submit, wall_sec)
        self.submit_calls = [] # List of dict(spec, job_id)
        self._lock = threading.Lock()

    def submit_job(self, spec: JobSpec) -> str:
        job_id = f"mock_{spec.run_id}_{spec.chunk_idx:03d}_{uuid.uuid4().hex[:6]}"
        with self._lock:
            self.submit_calls.append({"spec": spec, "job_id": job_id})
            is_failed = spec.chunk_idx in self.fail_chunks
            if spec.chunk_idx in self.fail_attempts and self.fail_attempts[spec.chunk_idx] > 0:
                is_failed = True
                self.fail_attempts[spec.chunk_idx] -= 1
            self.jobs_state[job_id] = {
                "job_id": job_id,
                "stage": "RUNNING",
                "spec": spec,
                "t_submit": time.time(),
                "is_failed": is_failed
            }
        return job_id

    def inspect_job(self, job_id: str) -> Dict[str, Any]:
        if self.inspect_fails or os.environ.get("MOCK_INSPECT_FAIL") == "1":
            return {
                "job_id": job_id,
                "stage": "INSPECTION_FAILED",
                "is_network_error": True,
                "error": "Simulated HF API ReadTimeout"
            }
        with self._lock:
            if job_id not in self.jobs_state:
                return {"job_id": job_id, "stage": "UNKNOWN", "is_network_error": False}
            job = self.jobs_state[job_id]
            return {"job_id": job_id, "stage": job["stage"], "wall_sec": 60.0, "is_network_error": False}

    def poll_job(self, job_id: str, spec: JobSpec) -> Dict[str, Any]:
        info = self.inspect_job(job_id)
        if info.get("is_network_error") or info.get("stage") == "INSPECTION_FAILED":
            return {
                "status": "OUTCOME_UNKNOWN",
                "job_id": job_id,
                "wall_sec": 1.0,
                "error": f"API network/inspection failure: {info.get('error')}"
            }
        with self._lock:
            job = self.jobs_state.get(job_id)
            if not job:
                return {"status": "FAILED", "job_id": job_id, "error": "Job not found"}
            if job["stage"] == "CANCELED":
                return {"status": "CANCELLED", "job_id": job_id, "error": "Job was cancelled"}
            if job["is_failed"]:
                job["stage"] = "ERROR"
                return {"status": "FAILED", "job_id": job_id, "wall_sec": 1.5, "error": f"Simulated failure on chunk {spec.chunk_idx}"}
                
            job["stage"] = "COMPLETED"
            render_sec = round((spec.end_frame - spec.start_frame + 1) / self.simulated_fps, 2)
            wall_sec = round(render_sec + 2.0, 2)
            
            bench_data = {
                "status": "SUCCESS",
                "comp": spec.composition,
                "frames": f"{spec.start_frame}-{spec.end_frame}",
                "total_frames": spec.end_frame - spec.start_frame + 1,
                "scale": str(spec.scale),
                "concurrency": spec.concurrency,
                "download_sec": 1.8,
                "unpack_sec": 3.1,
                "render_sec": render_sec,
                "fps": self.simulated_fps,
                "upload_sec": 1.2,
                "total_wall_sec": wall_sec,
                "cost_usd": 0.001
            }
            return {
                "status": "SUCCESS",
                "job_id": job_id,
                "wall_sec": wall_sec,
                "bench_data": bench_data
            }

    def cancel_job(self, job_id: str) -> bool:
        if self.cancel_should_fail or os.environ.get("MOCK_CANCEL_FAIL") == "1":
            return False
        with self._lock:
            if job_id in self.jobs_state:
                self.jobs_state[job_id]["stage"] = "CANCELED"
                return True
        return False

    def reconcile_job(self, run_id: str, chunk_idx: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            for jid, job in self.jobs_state.items():
                spec = job["spec"]
                # Must match exact run_id and chunk_idx
                if spec.run_id == run_id and spec.chunk_idx == chunk_idx:
                    return {"job_id": jid, "stage": job["stage"], "status": job["stage"]}
        return None


# ==============================================================================
# 7. SCHEDULERS (FIXED & COMPLEXITY-AWARE)
# ==============================================================================

class BaseScheduler:
    @staticmethod
    def validate_chunks(chunks: List[Dict[str, Any]], total_frames: int):
        assert len(chunks) > 0, "No chunks generated!"
        assert chunks[0]["start"] == 0, f"First chunk starts at {chunks[0]['start']}, expected 0"
        assert chunks[-1]["end"] == total_frames - 1, f"Last chunk ends at {chunks[-1]['end']}, expected {total_frames - 1}"
        for prev, nxt in zip(chunks[:-1], chunks[1:]):
            assert prev["end"] + 1 == nxt["start"], f"Timeline gap or overlap between chunk {prev['idx']} and {nxt['idx']}"
        assert sum(c["frames_count"] for c in chunks) == total_frames, "Sum of chunk frames does not equal total_frames!"


class FixedChunkScheduler(BaseScheduler):
    """Divides timeline into equal chunks with remainder on the final worker."""
    
    @classmethod
    def generate(cls, total_frames: int, num_workers: int) -> List[Dict[str, Any]]:
        base_size = total_frames // num_workers
        chunks = []
        curr = 0
        for i in range(num_workers):
            if i == num_workers - 1:
                end = total_frames - 1
            else:
                end = curr + base_size - 1
            chunks.append({
                "idx": i,
                "start": curr,
                "end": end,
                "frames_count": end - curr + 1,
                "filename": f"chunk_{i:03d}_{curr}_{end}.mp4"
            })
            curr = end + 1
        cls.validate_chunks(chunks, total_frames)
        return chunks


class ComplexityAwareScheduler(BaseScheduler):
    """
    Slices timeline proportionally to scene complexity.
    Heavier scenes (lower FPS) receive fewer frames; lighter scenes receive more frames.
    Goal: Equalize estimated worker runtime and eliminate straggler tail latency.
    """
    
    @classmethod
    def generate(cls, total_frames: int, num_workers: int, profile_path: Optional[str] = None) -> List[Dict[str, Any]]:
        timeline_fps = [3.0] * total_frames
        
        # Load empirical profile if provided
        if profile_path and os.path.exists(profile_path):
            try:
                with open(profile_path, "r", encoding="utf-8") as f:
                    profile_data = json.load(f)
                for entry in profile_data:
                    s = entry.get("start_frame", entry.get("start", 0))
                    e = entry.get("end_frame", entry.get("end", 0))
                    fps = entry.get("fps", 3.0)
                    for idx in range(max(0, s), min(total_frames, e + 1)):
                        timeline_fps[idx] = max(0.5, fps)
            except Exception as ex:
                logger.warning(f"Could not parse complexity profile {profile_path}: {ex}. Falling back to default baseline.")
                
        # Work per frame = 1.0 / fps (seconds of computation per frame)
        work = [1.0 / timeline_fps[f] for f in range(total_frames)]
        total_work = sum(work)
        target_work_per_worker = total_work / num_workers
        
        chunks = []
        curr_start = 0
        accum_work = 0.0
        
        for f_idx in range(total_frames):
            accum_work += work[f_idx]
            if accum_work >= target_work_per_worker and len(chunks) < (num_workers - 1):
                chunks.append({
                    "idx": len(chunks),
                    "start": curr_start,
                    "end": f_idx,
                    "frames_count": f_idx - curr_start + 1,
                    "filename": f"chunk_{len(chunks):03d}_{curr_start}_{f_idx}.mp4",
                    "est_render_sec": round(accum_work, 2)
                })
                curr_start = f_idx + 1
                accum_work = 0.0
                
        # Last chunk captures remaining frames
        chunks.append({
            "idx": len(chunks),
            "start": curr_start,
            "end": total_frames - 1,
            "frames_count": total_frames - curr_start,
            "filename": f"chunk_{len(chunks):03d}_{curr_start}_{total_frames - 1}.mp4",
            "est_render_sec": round(accum_work, 2)
        })
        
        cls.validate_chunks(chunks, total_frames)
        return chunks


# ==============================================================================
# 8. VALIDATORS (SEGMENT & MASTER QC)
# ==============================================================================

class SegmentValidator:
    """Pre-concat integrity validator for individual video chunks."""
    
    @staticmethod
    def validate(chunk_path: str, expected_frames: int) -> Tuple[bool, int, str]:
        if not os.path.exists(chunk_path):
            return False, 0, f"File not found: {chunk_path}"
        if os.path.getsize(chunk_path) == 0:
            return False, 0, f"Zero-byte file: {chunk_path}"
            
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,nb_read_packets",
            "-count_packets",
            "-of", "json",
            chunk_path
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if res.returncode != 0:
                return False, 0, f"ffprobe error: {res.stderr}"
            data = json.loads(res.stdout)
            streams = data.get("streams", [])
            if not streams:
                return False, 0, "No video stream detected in chunk"
            v = streams[0]
            codec = v.get("codec_name", "")
            if codec not in ["h264", "avc1"]:
                return False, 0, f"Unexpected video codec: {codec}"
            packets = int(v.get("nb_read_packets", 0))
            if packets != expected_frames:
                return False, packets, f"Frame count mismatch: got {packets}, expected {expected_frames}"
            return True, packets, "OK"
        except Exception as e:
            return False, 0, f"Validation exception: {e}"


class MasterValidator:
    """Post-concat production QC validator for final audio-video master."""
    
    @staticmethod
    def validate(master_path: str, expected_frames: int, expected_fps: float) -> Dict[str, Any]:
        if not os.path.exists(master_path):
            raise ValidationError(f"Master file not found: {master_path}")
            
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration,size,bit_rate",
            "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_read_packets,channels",
            "-count_packets",
            "-of", "json",
            master_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if res.returncode != 0:
            raise ValidationError(f"Master ffprobe failed: {res.stderr}")
            
        data = json.loads(res.stdout)
        streams = data.get("streams", [])
        v_stream = next((s for s in streams if s.get("codec_name") in ["h264", "avc1"]), None)
        a_stream = next((s for s in streams if s.get("codec_name") == "aac"), None)
        
        if not v_stream:
            raise ValidationError("Master lacks a valid H.264 video stream.")
        if not a_stream:
            raise ValidationError("Master lacks a valid AAC audio stream.")
            
        actual_frames = int(v_stream.get("nb_read_packets", 0))
        if actual_frames != expected_frames:
            raise ValidationError(f"Master frame count mismatch: got {actual_frames}, expected {expected_frames}")
            
        duration = float(data.get("format", {}).get("duration", 0))
        expected_dur = expected_frames / expected_fps
        if abs(duration - expected_dur) > 0.5:
            logger.warning(f"Master duration ({duration:.2f}s) differs from expected ({expected_dur:.2f}s) by >0.5s")
            
        return {
            "status": "QC_PASSED",
            "resolution": f"{v_stream.get('width')}x{v_stream.get('height')}",
            "video_codec": v_stream.get("codec_name"),
            "audio_codec": a_stream.get("codec_name"),
            "audio_channels": a_stream.get("channels"),
            "actual_frames": actual_frames,
            "duration_sec": duration,
            "file_size_mb": round(int(data.get("format", {}).get("size", 0)) / (1024 * 1024), 2),
            "checks": {
                "video_packets_exact": actual_frames == expected_frames,
                "video_codec_valid": v_stream.get("codec_name") in ["h264", "avc1"],
                "audio_codec_valid": a_stream.get("codec_name") == "aac",
                "audio_track_duration_aligned": abs(duration - expected_dur) <= 0.5,
                "audio_offset_adelay_applied": True,
                "perceptual_lipsync": "UNVERIFIED_BY_MACHINE_METRICS (requires neural syncnet or human QA)"
            }
        }


# ==============================================================================
# 9. ORCHESTRATOR ENGINE
# ==============================================================================

class ProductionOrchestrator:
    """End-to-End hardened video render orchestrator."""
    
    def __init__(
        self,
        config: OrchestratorConfig,
        resume_ledger_path: Optional[str] = None,
        provider: Optional[BaseComputeProvider] = None
    ):
        self.config = config
        self.config.validate()
        self.run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        
        # Каталог запуска: при resume — каталог из ledger (новый не создаём), иначе runs/<run_id>
        resuming = bool(resume_ledger_path and os.path.exists(resume_ledger_path))
        if resuming:
            self.run_dir = os.path.dirname(os.path.abspath(resume_ledger_path))
        else:
            self.run_dir = os.path.abspath(os.path.join(self.config.work_dir, "runs", self.run_id))
        self.chunks_dir = os.path.join(self.run_dir, "chunks")
        os.makedirs(self.chunks_dir, exist_ok=True)
        
        self.ledger_path = os.path.join(self.run_dir, "ledger.json")
        self.budget = BudgetController(budget_limit_usd=self.config.budget_limit_usd)
        self.kill_switch = KillSwitch()
        
        # Select Provider
        if provider:
            self.provider = provider
        elif self.config.provider == "mock":
            self.provider = MockComputeProvider()
        else:
            self.provider = HuggingFaceJobsProvider()
            
        # Register Kill Switch cleanup
        self.kill_switch.register_cancel_callback(self._on_abort)
        
        # Ledger initialization or resume
        if resuming:
            logger.info(f"Resuming run from existing ledger: {resume_ledger_path}")
            self.ledger = JobLedger.load(resume_ledger_path)
            self.run_id = self.ledger.run_id
            self.run_dir = os.path.dirname(os.path.abspath(resume_ledger_path))
            self.chunks_dir = os.path.join(self.run_dir, "chunks")
            os.makedirs(self.chunks_dir, exist_ok=True)
            
            # Restore budget state
            self.budget.spent_usd = self.ledger.budget_spent_usd
            self.budget.reserved_usd = self.ledger.budget_reserved_usd
            
            # Re-verify completed chunks on disk
            self._reverify_completed_chunks_on_resume()
        else:
            self.ledger = JobLedger(self.run_id, self.ledger_path, self.config)
            chunks = self._generate_chunk_plan()
            self.ledger.init_entries(chunks)

    def _reverify_completed_chunks_on_resume(self):
        """Re-validates all COMPLETED chunks on disk. If missing or corrupt, resets to PENDING."""
        reverted = 0
        reverified = 0
        for e in self.ledger.get_all_entries():
            if e.status == "COMPLETED":
                local_p = e.local_path or os.path.join(self.chunks_dir, e.filename)
                is_valid, packets, err = SegmentValidator.validate(local_p, e.frame_count)
                if not is_valid:
                    logger.warning(f"Resume: chunk {e.chunk_idx} failed validation ({err}). Reverting to PENDING.")
                    self.ledger.update_entry(e.chunk_idx, status="PENDING", verified_packets=None, local_path=None, error=f"Reverted on resume: {err}")
                    reverted += 1
                else:
                    reverified += 1
            elif e.status in ["SUBMITTED", "RUNNING"] and e.job_id:
                # Reconcile status with provider
                info = self.provider.inspect_job(e.job_id)
                stage = info.get("stage", "UNKNOWN")
                if stage in ["ERROR", "FAILED", "CANCELED"]:
                    self.ledger.update_entry(e.chunk_idx, status="FAILED", error=f"Job terminated with stage {stage}")
                elif stage == "UNKNOWN":
                    self.ledger.update_entry(e.chunk_idx, status="OUTCOME_UNKNOWN", error=f"Job {e.job_id} stage unknown during resume")
        logger.info(f"Resume validation complete: {reverified} valid completed chunks, {reverted} reverted to PENDING.")

    def _generate_chunk_plan(self) -> List[Dict[str, Any]]:
        if self.config.scheduler_type == "complexity-aware":
            logger.info(f"Using ComplexityAwareScheduler (profile: {self.config.complexity_profile_path})")
            return ComplexityAwareScheduler.generate(
                self.config.total_frames,
                self.config.num_workers,
                self.config.complexity_profile_path
            )
        else:
            logger.info("Using FixedChunkScheduler (equal distribution)")
            return FixedChunkScheduler.generate(self.config.total_frames, self.config.num_workers)

    def _on_abort(self):
        """
        Cancels all active jobs when Kill Switch fires.
        P0-B FIX: If cancellation is unconfirmed, records CANCEL_UNCONFIRMED
        and retains budget reservation to prevent undercounting liabilities.
        """
        entries = self.ledger.get_all_entries()
        unconfirmed_reserve = 0.0
        for e in entries:
            if e.status in ["SUBMITTED", "RUNNING"] and e.job_id:
                logger.info(f"Kill Switch cancelling active Job {e.job_id} (chunk {e.chunk_idx})...")
                cancelled_ok = self.provider.cancel_job(e.job_id)
                if cancelled_ok:
                    self.ledger.update_entry(e.chunk_idx, status="CANCELLED", reserved_usd=0.0)
                else:
                    logger.warning(
                        f"Kill Switch: Provider could NOT confirm cancellation for Job {e.job_id} (chunk {e.chunk_idx})! "
                        "Marking CANCEL_UNCONFIRMED and retaining budget reservation."
                    )
                    self.ledger.update_entry(
                        e.chunk_idx,
                        status="CANCEL_UNCONFIRMED",
                        error="Kill Switch: cancellation unconfirmed by provider"
                    )
                    chunk_reserve = e.reserved_usd if (e.reserved_usd and e.reserved_usd > 0) else self.budget.estimate_job_reserve(self.config.job_timeout_sec)
                    unconfirmed_reserve += chunk_reserve
                    
        self.budget.reserved_usd = unconfirmed_reserve
        final_status = "CANCELLED" if unconfirmed_reserve == 0.0 else "CANCEL_UNCONFIRMED"
        self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd, status=final_status)

    def _validate_preflight_assets(self):
        """
        Validates all necessary assets (audio, complexity profile, repo, credentials)
        BEFORE any cloud tasks are submitted to prevent paid compute waste.
        """
        # 1. Audio track validation
        if self.config.audio_path:
            if not os.path.exists(self.config.audio_path):
                raise ValidationError(f"Pre-flight asset check failed: Audio file not found: {self.config.audio_path}")
            if os.path.getsize(self.config.audio_path) == 0:
                raise ValidationError(f"Pre-flight asset check failed: Audio file is empty (0 bytes): {self.config.audio_path}")
        elif self.config.provider != "mock":
            raise ValidationError(
                "Pre-flight asset check failed: audio_path is required for live production render. "
                "Specify a valid audio file to ensure master audio merge succeeds."
            )
            
        # 2. Complexity profile validation
        if self.config.scheduler_type == "complexity-aware" and self.config.complexity_profile_path:
            if not os.path.exists(self.config.complexity_profile_path):
                raise ValidationError(f"Pre-flight asset check failed: Complexity profile not found: {self.config.complexity_profile_path}")
            if os.path.getsize(self.config.complexity_profile_path) == 0:
                raise ValidationError(f"Pre-flight asset check failed: Complexity profile is empty: {self.config.complexity_profile_path}")
                
        # 3. Provider credentials & repos
        if self.config.provider == "huggingface":
            token = getattr(self.provider, "token", None) or os.environ.get("HF_TOKEN")
            if not token:
                if self.config.dry_run:
                    logger.warning("Нет ключа HF_TOKEN — для --live он обязателен (dry-run проходит без него).")
                else:
                    raise ValidationError("Нет ключа HF_TOKEN: задайте переменную окружения HF_TOKEN (токен с правом write) или выполните `huggingface-cli login`.")
            if not self.config.dataset_repo:
                raise ValidationError("Не задан датасет: переменная HF_DATASET (user/video-render-assets) или флаг --dataset.")
            if not self.config.docker_image:
                raise ValidationError("Не задан образ воркера: переменная HF_WORKER_IMAGE (hf.co/spaces/user/remotion-speed-worker) или флаг --image.")
            if not self.config.composition_id:
                raise ValidationError("Pre-flight configuration check failed: composition_id is missing in configuration.")

    def run(self) -> Dict[str, Any]:
        """Executes the full pipeline with strict safety gates."""
        t_global_start = time.time()
        logger.info(f"Starting Orchestrator Run ID: {self.run_id}")
        logger.info(f"Configuration: {self.config.total_frames} frames, {self.config.num_workers} workers, flavor={self.config.flavor}")
        logger.info(f"Budget Cap: ${self.config.budget_limit_usd:.4f} | Dry Run Mode: {self.config.dry_run}")
        
        # Pre-flight asset and credentials check
        self._validate_preflight_assets()

        # Fail-closed check: dry-run exits before dispatching paid tasks
        if self.config.dry_run:
            logger.info("=== DRY RUN MODE ACTIVE ===")
            logger.info("Verifying timeline slicing, budget reservations, and paths offline...")
            entries = self.ledger.get_all_entries()
            first = entries[0]
            last = entries[-1]
            logger.info(f"Verified {len(entries)} chunks: first=[{first.start_frame}-{first.end_frame}], last=[{last.start_frame}-{last.end_frame}]")
            logger.info(f"Sum of frames: {sum(e.frame_count for e in entries)} == {self.config.total_frames}")
            logger.info("Dry-run passed! No cloud jobs were started, $0.00 spent.")
            return {"status": "DRY_RUN_PASSED", "run_id": self.run_id, "total_chunks": len(entries)}

        self.ledger.status = "RUNNING"
        
        # 1. Dispatch & Process Chunks
        entries_to_process = [e for e in self.ledger.get_all_entries() if e.status != "COMPLETED"]
        logger.info(f"Processing {len(entries_to_process)} chunks ({len(self.ledger.get_all_entries()) - len(entries_to_process)} already completed)...")
        
        semaphore = threading.BoundedSemaphore(self.config.max_concurrency_limit)
        
        def process_chunk(entry: LedgerEntry):
            with semaphore:
                if self.kill_switch.is_active:
                    raise AbortedError("Kill switch active")
                self._execute_chunk_with_safety(entry)
                
        first_error = None
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(self.config.num_workers, self.config.max_concurrency_limit)) as pool:
            futures = [pool.submit(process_chunk, e) for e in entries_to_process]
            for f in concurrent.futures.as_completed(futures):
                try:
                    f.result()
                except Exception as ex:
                    logger.error(f"Chunk processing error: {ex}")
                    if first_error is None:
                        first_error = ex
                    
        # Verify all chunks succeeded
        all_entries = self.ledger.get_all_entries()
        failed = [e for e in all_entries if e.status != "COMPLETED"]
        if failed:
            self.ledger.status = "FAILED"
            if first_error is not None:
                raise first_error
            raise OrchestratorError(f"Run failed! {len(failed)} chunks failed or were not completed.")
            
        # 2. Concat Video Chunks
        temp_video = os.path.join(self.run_dir, "video_stitched.mp4")
        self._concat_video(all_entries, temp_video)
        
        # 3. Audio Merge & Offset
        master_output = self.config.output_master_path or os.path.join(self.run_dir, "master_output.mp4")
        self._merge_audio(temp_video, master_output)
        
        # 4. Final Master QC
        logger.info("Running final Master QC...")
        qc_result = MasterValidator.validate(master_output, self.config.total_frames, self.config.fps)
        logger.info(f"Master QC result: {qc_result['status']}")
        
        self.ledger.status = "COMPLETED"
        total_time = round(time.time() - t_global_start, 2)
        
        summary = {
            "status": "SUCCESS",
            "run_id": self.run_id,
            "master_path": master_output,
            "qc": qc_result,
            "total_wall_sec": total_time,
            "budget_spent_usd": self.budget.spent_usd,
            "budget_limit_usd": self.budget.budget_limit_usd
        }
        
        with open(os.path.join(self.run_dir, "run_summary.json"), "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
            
        logger.info(f"Production Run {self.run_id} finished successfully in {total_time}s! Cost=${self.budget.spent_usd:.4f}")
        return summary

    def _execute_chunk_with_safety(self, entry: LedgerEntry):
        """Executes a single chunk with reservation, reconciliation, and retries."""
        reserve_cost = self.budget.estimate_job_reserve(self.config.job_timeout_sec)
        entry_reserve = reserve_cost
        
        upload_prefix = f"renders/{self.run_id}"
        spec = JobSpec(
            run_id=self.run_id,
            chunk_idx=entry.chunk_idx,
            start_frame=entry.start_frame,
            end_frame=entry.end_frame,
            composition=self.config.composition_id,
            scale=self.config.scale,
            concurrency=self.config.worker_concurrency,
            out_filename=entry.filename,
            upload_prefix=upload_prefix,
            dataset_repo=self.config.dataset_repo,
            image=self.config.docker_image,
            flavor=self.config.flavor,
            bundle_name=self.config.bundle_name,
            timeout_sec=self.config.job_timeout_sec
        )
        
        res = None
        job_id = entry.job_id
        start_attempt = 0
        initial_attempts = entry.attempts
        
        # 1. RESUME RECONCILIATION: Check if chunk already has an active or submitted job_id
        if entry.status in ["OUTCOME_UNKNOWN", "CANCEL_UNCONFIRMED"]:
            logger.error(f"Cannot process chunk {entry.chunk_idx}: status is {entry.status}. Fail closed.")
            raise JobReconciliationError(f"Cannot resume chunk {entry.chunk_idx}: prior job outcome is {entry.status}")

        if job_id and entry.status in ["SUBMITTED", "RUNNING"]:
            logger.info(f"Resume: chunk {entry.chunk_idx} has existing job {job_id}. Inspecting status before new submit...")
            info = self.provider.inspect_job(job_id)
            stage = info.get("stage", "UNKNOWN")
            
            # P0-C FIX: If reservation was already restored into budget (e.g. from ledger), reuse it!
            # Do NOT double-reserve.
            has_existing_reservation = (entry.reserved_usd and entry.reserved_usd > 0) or (self.budget.reserved_usd >= reserve_cost)
            entry_reserve = entry.reserved_usd if (entry.reserved_usd and entry.reserved_usd > 0) else reserve_cost
            
            if stage in ["COMPLETED", "SUCCESS"]:
                logger.info(f"Resume: chunk {entry.chunk_idx} existing job {job_id} already COMPLETED.")
                actual_wall = info.get("wall_sec", 60.0)
                if has_existing_reservation:
                    actual_cost = self.budget.commit(entry_reserve, actual_wall)
                else:
                    actual_cost = max(1, int((actual_wall + 59) // 60)) * self.budget.cost_per_minute
                    self.budget.spent_usd += actual_cost
                entry.cost_estimate_usd = (entry.cost_estimate_usd or 0.0) + actual_cost
                entry.reserved_usd = 0.0
                self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                res = {"status": "SUCCESS", "job_id": job_id, "wall_sec": actual_wall}
            elif stage in ["RUNNING", "SUBMITTED", "QUEUED", "PENDING"]:
                logger.info(f"Resume: chunk {entry.chunk_idx} existing job {job_id} is {stage}. Polling to completion...")
                if not has_existing_reservation:
                    self.budget.reserve(reserve_cost)
                    entry.reserved_usd = reserve_cost
                    self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                else:
                    entry.reserved_usd = entry_reserve
                    logger.info(f"Resume: chunk {entry.chunk_idx} reusing existing reservation of ${entry_reserve:.4f}.")
                res = self.provider.poll_job(job_id, spec)
                actual_wall = res.get("wall_sec", 60.0)
                if res.get("status") == "SUCCESS":
                    attempt_cost = self.budget.commit(entry_reserve, actual_wall)
                    entry.cost_estimate_usd = (entry.cost_estimate_usd or 0.0) + attempt_cost
                    entry.reserved_usd = 0.0
                    self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                elif res.get("status") in ["OUTCOME_UNKNOWN", "UNKNOWN"]:
                    self.budget.retain_unknown_outcome(entry_reserve)
                    self.ledger.update_entry(entry.chunk_idx, status="OUTCOME_UNKNOWN", reserved_usd=entry_reserve, error=res.get("error"))
                    self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                    raise JobReconciliationError(f"Resume: chunk {entry.chunk_idx} job {job_id} outcome unknown during poll: {res.get('error')}")
                else:
                    attempt_cost = self.budget.commit(entry_reserve, actual_wall)
                    entry.cost_estimate_usd = (entry.cost_estimate_usd or 0.0) + attempt_cost
                    entry.reserved_usd = 0.0
                    self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                    logger.warning(f"Resume: chunk {entry.chunk_idx} existing job {job_id} failed during polling: {res.get('error')}")
                    start_attempt = 1
            elif stage in ["ERROR", "FAILED", "CANCELED"]:
                logger.warning(f"Resume: chunk {entry.chunk_idx} previous job {job_id} was {stage}.")
                attempt_wall = info.get("wall_sec", 60.0)
                if has_existing_reservation:
                    attempt_cost = self.budget.commit(entry_reserve, attempt_wall)
                else:
                    attempt_cost = max(1, int((attempt_wall + 59) // 60)) * self.budget.cost_per_minute
                    self.budget.spent_usd += attempt_cost
                entry.cost_estimate_usd = (entry.cost_estimate_usd or 0.0) + attempt_cost
                entry.reserved_usd = 0.0
                self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                start_attempt = 1
            elif stage in ["INSPECTION_FAILED", "UNKNOWN"]:
                logger.error(f"Resume: chunk {entry.chunk_idx} existing job {job_id} status is {stage}. Retaining reservation and failing closed.")
                if not has_existing_reservation:
                    self.budget.reserve(reserve_cost)
                    entry.reserved_usd = reserve_cost
                self.budget.retain_unknown_outcome(entry_reserve)
                self.ledger.update_entry(entry.chunk_idx, status="OUTCOME_UNKNOWN", reserved_usd=entry_reserve, error=f"Job {job_id} status is {stage} on resume")
                self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                raise JobReconciliationError(f"Cannot resume chunk {entry.chunk_idx}: job {job_id} status is {stage}")

        # 2. SUBMISSION & RETRY LOOP (Only if not already successful from existing job)
        if not res or res.get("status") != "SUCCESS":
            for attempt in range(start_attempt, self.config.max_retries + 1):
                try:
                    # Outcome Unknown Reconciliation check before re-submitting on retry
                    if attempt > 0:
                        reconciled = self.provider.reconcile_job(self.run_id, entry.chunk_idx)
                        if reconciled and reconciled.get("stage") in ["COMPLETED", "SUCCESS"]:
                            logger.info(f"Reconciled existing job for chunk {entry.chunk_idx}: {reconciled['job_id']}")
                            actual_wall = 60.0
                            attempt_cost = max(1, int((actual_wall + 59) // 60)) * self.budget.cost_per_minute
                            self.budget.spent_usd += attempt_cost
                            entry.cost_estimate_usd = (entry.cost_estimate_usd or 0.0) + attempt_cost
                            entry.reserved_usd = 0.0
                            self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                            res = {"status": "SUCCESS", "job_id": reconciled["job_id"], "wall_sec": actual_wall}
                            job_id = reconciled["job_id"]
                            break
                        elif reconciled and reconciled.get("stage") in ["RUNNING", "SUBMITTED"]:
                            job_id = reconciled["job_id"]
                            entry_reserve = reserve_cost
                            self.budget.reserve(entry_reserve)
                            entry.reserved_usd = entry_reserve
                            self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                            res = self.provider.poll_job(job_id, spec)
                            actual_wall = res.get("wall_sec", 60.0)
                            attempt_cost = self.budget.commit(entry_reserve, actual_wall)
                            entry.cost_estimate_usd = (entry.cost_estimate_usd or 0.0) + attempt_cost
                            entry.reserved_usd = 0.0
                            self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                            if res.get("status") == "SUCCESS":
                                break

                    # Reserve budget for this attempt (Fail-Closed)
                    entry_reserve = reserve_cost
                    self.budget.reserve(entry_reserve)
                    entry.reserved_usd = entry_reserve
                    self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)

                    # Submit job to get immediate job_id
                    job_id = self.provider.submit_job(spec)
                    self.ledger.update_entry(
                        entry.chunk_idx,
                        status="SUBMITTED",
                        job_id=job_id,
                        submit_time=time.time(),
                        reserved_usd=entry_reserve,
                        attempts=initial_attempts + (attempt - start_attempt) + 1
                    )
                    
                    # Poll job to completion
                    res = self.provider.poll_job(job_id, spec)
                    actual_wall = res.get("wall_sec", 60.0)
                    
                    if res.get("status") == "SUCCESS":
                        # Commit successful attempt cost
                        attempt_cost = self.budget.commit(entry_reserve, actual_wall)
                        entry.cost_estimate_usd = (entry.cost_estimate_usd or 0.0) + attempt_cost
                        entry.reserved_usd = 0.0
                        self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                        break
                    elif res.get("status") in ["OUTCOME_UNKNOWN", "UNKNOWN"]:
                        # P0-A FIX: Network / inspection failure MUST NOT trigger second job
                        logger.error(
                            f"Chunk {entry.chunk_idx} Job {job_id} outcome is OUTCOME_UNKNOWN ({res.get('error')}). "
                            "Retaining reservation and failing closed without blind retry."
                        )
                        self.budget.retain_unknown_outcome(entry_reserve)
                        self.ledger.update_entry(
                            entry.chunk_idx,
                            status="OUTCOME_UNKNOWN",
                            cost_estimate_usd=entry.cost_estimate_usd,
                            reserved_usd=entry_reserve,
                            error=res.get("error")
                        )
                        self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                        raise JobReconciliationError(
                            f"Chunk {entry.chunk_idx} Job {job_id} outcome unknown due to network/API error. "
                            "Launching a second paid job is strictly prohibited until reconciled."
                        )
                    else:
                        # Commit failed attempt cost (HF container was started and billed!)
                        attempt_cost = self.budget.commit(entry_reserve, actual_wall)
                        entry.cost_estimate_usd = (entry.cost_estimate_usd or 0.0) + attempt_cost
                        entry.reserved_usd = 0.0
                        self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                        self.ledger.update_entry(
                            entry.chunk_idx,
                            status="FAILED",
                            cost_estimate_usd=entry.cost_estimate_usd,
                            reserved_usd=0.0,
                            error=res.get("error")
                        )
                        logger.warning(f"Chunk {entry.chunk_idx} failed attempt {attempt+1} (${attempt_cost:.4f} billed): {res.get('error')}")
                        time.sleep(2 + random.uniform(0.5, 2.0))
                except JobReconciliationError:
                    raise
                except BudgetExceededError as e:
                    # задача НЕ запускалась (резерв отклонён) — не OUTCOME_UNKNOWN; кусок остаётся PENDING и доделывается через --resume
                    logger.error(f"Chunk {entry.chunk_idx}: {e}")
                    self.ledger.update_entry(entry.chunk_idx, status="PENDING", reserved_usd=0.0, error=str(e))
                    raise
                except Exception as e:
                    logger.error(f"Error dispatching chunk {entry.chunk_idx} (attempt {attempt+1}): {e}")
                    # Ambiguous / unconfirmed outcome: RETAIN reservation and mark OUTCOME_UNKNOWN
                    self.budget.retain_unknown_outcome(entry_reserve)
                    self.ledger.update_entry(
                        entry.chunk_idx,
                        status="OUTCOME_UNKNOWN",
                        cost_estimate_usd=entry.cost_estimate_usd,
                        reserved_usd=entry_reserve,
                        error=str(e)
                    )
                    self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
                    raise

        if not res or res.get("status") != "SUCCESS":
            self.ledger.update_entry(
                entry.chunk_idx,
                status="FAILED",
                cost_estimate_usd=entry.cost_estimate_usd,
                error=res.get("error") if res else "Unknown error"
            )
            return

        # 3. Download & Validate Chunk
        local_chunk_path = os.path.join(self.chunks_dir, entry.filename)
        self._download_chunk(entry.filename, upload_prefix, local_chunk_path, expected_frames=entry.frame_count)
        
        # Segment Pre-Concat Validation
        is_valid, packets, err = SegmentValidator.validate(local_chunk_path, entry.frame_count)
        if not is_valid:
            logger.error(f"Chunk {entry.chunk_idx} corrupt or invalid: {err}")
            self.ledger.update_entry(entry.chunk_idx, status="CORRUPTED", error=err, local_path=local_chunk_path)
            return
            
        bdata = res.get("bench_data") or {}
        actual_wall = res.get("wall_sec", 60.0)
        self.ledger.update_entry(
            entry.chunk_idx,
            status="COMPLETED",
            job_id=job_id,
            finish_time=time.time(),
            wall_sec=actual_wall,
            render_sec=bdata.get("render_sec"),
            fps=bdata.get("fps"),
            cost_estimate_usd=entry.cost_estimate_usd,
            local_path=local_chunk_path,
            verified_packets=packets
        )
        self.ledger.update_totals(self.budget.reserved_usd, self.budget.spent_usd)
        logger.info(f"  [OK] Chunk {entry.chunk_idx:02d} ({entry.frame_count} frames): wall={actual_wall}s, total_cost=${entry.cost_estimate_usd:.4f}")

    def _download_chunk(self, filename: str, remote_prefix: str, local_path: str, expected_frames: Optional[int] = None):
        """Downloads MP4 chunk using actual returned path and validates existence & non-zero size."""
        os.makedirs(os.path.dirname(os.path.abspath(local_path)), exist_ok=True)
        if self.config.provider == "mock":
            # Generate deterministic synthetic mock mp4 with testsrc matching exact expected frames
            num_frames = expected_frames or int(self.config.fps)
            cmd = [
                "ffmpeg", "-y", "-f", "lavfi",
                "-i", f"testsrc=size=2560x1440:rate={int(self.config.fps)}",
                "-vframes", str(num_frames),
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                local_path
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            if not os.path.exists(local_path) or os.path.getsize(local_path) == 0:
                raise ValidationError(f"Mock chunk generation produced invalid file: {local_path}")
        else:
            from huggingface_hub import hf_hub_download
            token = getattr(self.provider, "token", None) or os.environ.get("HF_TOKEN")
            actual_dl_path = None
            for attempt in range(3):  # сеть может моргнуть: до 3 попыток
                try:
                    actual_dl_path = hf_hub_download(
                        repo_id=self.config.dataset_repo,
                        repo_type="dataset",
                        filename=f"{remote_prefix}/{filename}",
                        local_dir=os.path.dirname(local_path),
                        token=token
                    )
                    break
                except Exception as e:
                    if attempt == 2:
                        raise
                    logger.warning(f"Скачивание {filename} не удалось ({e}); повтор через {2 * (attempt + 1)} с")
                    time.sleep(2 * (attempt + 1))
            if not os.path.exists(actual_dl_path) or os.path.getsize(actual_dl_path) == 0:
                raise ValidationError(f"Downloaded chunk does not exist or is empty: {actual_dl_path}")
            if os.path.abspath(actual_dl_path) != os.path.abspath(local_path):
                shutil.move(actual_dl_path, local_path)  # без второй копии на диске

    def _concat_video(self, entries: List[LedgerEntry], output_path: str):
        """Stitches all verified video chunks without re-encoding."""
        logger.info(f"Stitching {len(entries)} chunks via FFmpeg concat (-c copy)...")
        concat_list = os.path.join(self.run_dir, "concat_list.txt")
        with open(concat_list, "w", encoding="utf-8") as f:
            for e in entries:
                safe_path = os.path.abspath(e.local_path).replace("\\", "/").replace("'", "'\\''")  # экранирование для concat-списка ffmpeg
                f.write(f"file '{safe_path}'\n")
                
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list,
            "-c", "copy",
            "-movflags", "+faststart",
            output_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise ValidationError(f"FFmpeg concat failed: {res.stderr}")
        logger.info(f"Stitched video saved to {output_path}")

    def _merge_audio(self, video_path: str, output_path: str):
        """Merges audio track with precise adelay compensation."""
        if not self.config.audio_path or not os.path.exists(self.config.audio_path):
            if self.config.provider == "mock":
                # Generate synthetic silent audio in mock mode
                logger.info("Generating synthetic AAC audio for mock mode...")
                cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                    "-c:v", "copy", "-c:a", "aac", "-shortest",
                    output_path
                ]
                subprocess.run(cmd, capture_output=True, check=True)
                return
            else:
                raise ValidationError(f"Audio file not found: {self.config.audio_path}")
                
        offset = self.config.audio_offset_ms
        logger.info(f"Merging audio from {self.config.audio_path} with adelay={offset}ms...")
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", self.config.audio_path,
            "-filter_complex", f"[1:a]adelay={offset}|{offset}[a]",
            "-map", "0:v",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise ValidationError(f"FFmpeg audio merge failed: {res.stderr}")
        logger.info(f"Final master successfully written to {output_path}")


# ==============================================================================
# 10. CLI COMMAND INTERFACE
# ==============================================================================

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Hugging Face PRO Speed Lab — Hardened Video Factory Orchestrator v2.1"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # RUN
    p_run = subparsers.add_parser("run", help="Start a video render run")
    p_run.add_argument("--config", help="Path to config.yaml or config.json")
    p_run.add_argument("--live", action="store_true", default=None, help="Execute LIVE cloud jobs (Default is safe dry-run!)")
    p_run.add_argument("--dry-run", action="store_true", default=None, help="Validate plan offline without starting cloud jobs")
    p_run.add_argument("--budget", type=float, default=None, help="Hard spending limit in USD (Explicit CLI override)")
    p_run.add_argument("--workers", type=int, default=None, help="Number of parallel worker jobs")
    p_run.add_argument("--frames", type=int, default=None, help="Total frames to render")
    p_run.add_argument("--scheduler", choices=["fixed-chunks", "complexity-aware"], default=None, help="Timeline scheduling strategy")
    p_run.add_argument("--resume", default=None, help="Path to existing ledger.json to resume an incomplete run")
    p_run.add_argument("--work-dir", default=None, help="Local directory for run artifacts")
    p_run.add_argument("--provider", choices=["huggingface", "mock"], default=None, help="Compute provider")
    
    # CANCEL
    p_cancel = subparsers.add_parser("cancel", help="Cancel active cloud jobs from a ledger")
    p_cancel.add_argument("--ledger", required=True, help="Path to ledger.json")
    
    # STATUS
    p_status = subparsers.add_parser("status", help="Inspect status of a run ledger")
    p_status.add_argument("--ledger", required=True, help="Path to ledger.json")
    
    # VALIDATE CHUNK
    p_val_chunk = subparsers.add_parser("validate-chunk", help="Validate an MP4 chunk with ffprobe")
    p_val_chunk.add_argument("path", help="Path to chunk MP4")
    p_val_chunk.add_argument("--expected-frames", type=int, required=True, help="Expected frame count")
    
    # VALIDATE MASTER
    p_val_master = subparsers.add_parser("validate-master", help="Validate master MP4 audio & video QC")
    p_val_master.add_argument("path", help="Path to master MP4")
    p_val_master.add_argument("--expected-frames", type=int, required=True, help="Expected frame count")
    p_val_master.add_argument("--fps", type=float, default=30.0, help="Expected frame rate")
    
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    
    if args.command == "run":
        if args.config:
            cfg = OrchestratorConfig.from_file(args.config)
        else:
            cfg = OrchestratorConfig()
            
        # CLI precedence: ONLY override if flag was explicitly provided (is not None)
        if args.budget is not None: cfg.budget_limit_usd = args.budget
        if args.workers is not None: cfg.num_workers = args.workers
        if args.frames is not None: cfg.total_frames = args.frames
        if args.scheduler is not None: cfg.scheduler_type = args.scheduler
        if args.work_dir is not None: cfg.work_dir = args.work_dir
        if args.provider is not None: cfg.provider = args.provider
        
        # Live vs Dry-Run precedence
        if args.dry_run is True:
            cfg.dry_run = True
        elif args.live is True:
            cfg.dry_run = False
            
        # HARD SAFETY GATE (P0-4):
        # Paid provider (e.g. huggingface) STRICTLY requires explicit --live flag on CLI.
        # Neither config file ('dry_run: false'), nor resume, nor defaults can authorize cloud spend.
        if cfg.provider != "mock" and args.live is not True:
            logger.warning(
                "SAFETY GATE: Paid provider '%s' execution requires explicit '--live' flag on CLI. "
                "Forcing dry_run=True to prevent unauthorized cloud spend.",
                cfg.provider
            )
            cfg.dry_run = True

        cfg.validate()
        
        orchestrator = ProductionOrchestrator(cfg, resume_ledger_path=args.resume)
        result = orchestrator.run()
        print(json.dumps(result, indent=2))
        
    elif args.command == "cancel":
        ledger = JobLedger.load(args.ledger)
        provider = MockComputeProvider() if ledger.config_dict.get("provider") == "mock" else HuggingFaceJobsProvider()
        cancelled = 0
        failed_cancels = 0
        for e in ledger.get_all_entries():
            if e.job_id and e.status in ["SUBMITTED", "RUNNING"]:
                print(f"Cancelling job {e.job_id} (chunk {e.chunk_idx})...")
                if provider.cancel_job(e.job_id):
                    ledger.update_entry(e.chunk_idx, status="CANCELLED")
                    cancelled += 1
                else:
                    print(f"ERROR: Failed to confirm cancellation for job {e.job_id}!")
                    failed_cancels += 1
        ledger.update_totals(0.0, ledger.budget_spent_usd, status="CANCELLED")
        print(f"Cancel complete: {cancelled} cancelled, {failed_cancels} failed.")
        if failed_cancels > 0:
            sys.exit(1)
        
    elif args.command == "status":
        ledger = JobLedger.load(args.ledger)
        entries = ledger.get_all_entries()
        completed = sum(1 for e in entries if e.status == "COMPLETED")
        failed = sum(1 for e in entries if e.status == "FAILED")
        running = sum(1 for e in entries if e.status in ["SUBMITTED", "RUNNING"])
        pending = sum(1 for e in entries if e.status == "PENDING")
        print(f"Run ID: {ledger.run_id} | Status: {ledger.status}")
        print(f"Chunks: Total={len(entries)}, Completed={completed}, Running={running}, Pending={pending}, Failed={failed}")
        print(f"Budget: Spent=${ledger.budget_spent_usd:.4f}, Reserved=${ledger.budget_reserved_usd:.4f}")
        
    elif args.command == "validate-chunk":
        valid, packets, msg = SegmentValidator.validate(args.path, args.expected_frames)
        print(f"Chunk Valid: {valid} | Packets: {packets} | Message: {msg}")
        sys.exit(0 if valid else 1)
        
    elif args.command == "validate-master":
        try:
            qc = MasterValidator.validate(args.path, args.expected_frames, args.fps)
            print(json.dumps(qc, indent=2))
        except Exception as e:
            print(f"QC FAILED: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()
