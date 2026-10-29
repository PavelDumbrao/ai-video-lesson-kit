#!/usr/bin/env python3
"""Воркер scene-check внутри HF Job (образ remotion-speed-worker: node 22, /rt/node_modules, Chromium прогрет):
код проекта из датасета → сборка Remotion → медиа урока из датасета в бандл → рендер отрезка 0,5× без звука → стиллы →
архив результата обратно в датасет. Запускается обёрткой из scene_check_hf.py; токен — переменная HF_TOKEN (secret job)."""
import argparse, os, random, shutil, subprocess, sys, tarfile, time

from huggingface_hub import HfApi, hf_hub_download

ap = argparse.ArgumentParser()
ap.add_argument("--repo", required=True); ap.add_argument("--base", required=True); ap.add_argument("--lesson", type=int, required=True)
ap.add_argument("--frames", default="0-0"); ap.add_argument("--stills", default="")
a = ap.parse_args(); t0 = time.time()
token = os.environ.get("HF_TOKEN"); api = HfApi(token=token)
P = "/p"; os.makedirs(P, exist_ok=True)


def log(m):
    print(f"[{time.time() - t0:6.1f}s] {m}", flush=True)


code = hf_hub_download(a.repo, f"{a.base}/code.tar.gz", repo_type="dataset", token=token)
with tarfile.open(code) as t:
    t.extractall(P)
if not os.path.exists(f"{P}/node_modules"):
    os.symlink("/rt/node_modules", f"{P}/node_modules")
log(f"код распакован ({sum(len(f) for _, _, f in os.walk(P))} файлов)")
REM = "/rt/node_modules/.bin/remotion"


def run(*c, cwd=P):
    q = subprocess.run([REM, *c, "--log=error"], cwd=cwd, capture_output=True, text=True)
    if q.returncode:
        print(f"remotion {c[0]} failed:\n" + (q.stdout + q.stderr)[-4000:], flush=True); sys.exit(2)


run("bundle", "src/index.ts", "--out-dir=/tmp/b"); log("бандл собран")
prefix = f"scenecheck/lesson{a.lesson}/media/"
files = [f for f in api.list_repo_files(a.repo, repo_type="dataset") if f.startswith(prefix)]
for f in files:  # сервер Remotion не отдаёт файлы вне бандла — медиа урока копируются внутрь
    p = hf_hub_download(a.repo, f, repo_type="dataset", token=token)
    dst = f"/tmp/b/public/lesson{a.lesson}/{f[len(prefix):]}"; os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copyfile(p, dst)
log(f"медиа урока: {len(files)} файлов")
os.makedirs("/tmp/out", exist_ok=True)
A, B = [int(x) for x in a.frames.split("-")]
if B > A:
    run("render", "/tmp/b", f"Lesson{a.lesson}", "/tmp/out/range.mp4", f"--frames={A}-{B}", "--scale=0.5", "--muted", "--concurrency=8",
        "--chromium-options=--no-sandbox --disable-dev-shm-usage")
    log(f"отрезок {A}-{B} отрендерен")
for f in [x for x in a.stills.split(",") if x.strip()]:
    run("still", "/tmp/b", f"Lesson{a.lesson}", f"/tmp/out/still_{f}.png", f"--frame={f}")
log("стиллы готовы")
subprocess.run(["tar", "-czf", "/tmp/out.tar.gz", "-C", "/tmp/out", "."], check=True)
for i in range(8):
    try:
        api.upload_file(path_or_fileobj="/tmp/out.tar.gz", path_in_repo=f"{a.base}/out.tar.gz", repo_id=a.repo, repo_type="dataset",
                        commit_message=f"{a.base}: out"); break
    except Exception as e:  # 409 при одновременных коммитах
        if i == 7:
            raise
        time.sleep(2 + random.random() * 4 + i * 3)
log(f"результат выгружен ({os.path.getsize('/tmp/out.tar.gz') / 1e6:.1f} МБ)")
