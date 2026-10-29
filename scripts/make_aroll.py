#!/usr/bin/env python3
"""plan.json + ролики лица (+ выбранные дубли) → <project>/public/lessonN/aroll.json — слой лица для композиции.

  python3 scripts/make_aroll.py --project remotion --lesson N --lab work/face [F02=F02_b F05=- …] [--cut-only] [--cutouts]

--lab — папка лица: <lab>/plan.json (make_face_chunks.py), <lab>/<id>.txt, ролики <lab>/videos/<дубль>.mp4
(по умолчанию дубль места F02 — файл F02.mp4; `F02=F02_b` — взять F02_b.mp4, `F03=-` — место без лица).
Ролики копируются в public/lessonN/aroll/<id>.mp4. Для переходов (full→corner, corner→full) нужны вырезы
public/lessonN/trans/<id>_{cutout.webm,face.json,body.json}: --cutouts делает их (scripts/vision/cutout.sh +
measure_body.py) до сборки; без них нужен --cut-only.
Режимы плана:
  full         — вставка во весь экран на жёсткой склейке (масштаб 1.0 / 1.15 по очереди);
  full→corner  — весь экран → угол на switch_t → уход в конце окна (keys full / corner / hidden);
  corner→full  — появляется в углу → весь экран на switch_t → до конца окна;
  --cut-only   — все места вставками (если вырезов/перехода ещё нет).
Сторона угла — plan.side (left|right) → trans.side (right — по умолчанию, в json не пишется).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import KIT_ROOT, VISION_DIR, die, load_json, save_json  # noqa: E402


def vision_python():
    """Python для measure_body.py: $VISION_PY → scripts/vision/venv → текущий интерпретатор."""
    if os.environ.get("VISION_PY"):
        return os.environ["VISION_PY"]
    venv = os.path.join(VISION_DIR, "venv", "bin", "python")
    return venv if os.path.exists(venv) else sys.executable


def make_cutout(video, prefix, log):
    """cutout.sh + measure_body.py для одного места; пишет <prefix>_{matte.mkv,face.json,cutout.webm,body.json}."""
    with open(log, "w", encoding="utf-8") as lf:
        r = subprocess.run(["bash", os.path.join(VISION_DIR, "cutout.sh"), video, prefix], stdout=lf, stderr=subprocess.STDOUT,
                           stdin=subprocess.DEVNULL)
        if r.returncode:
            die(f"вырез не удался ({video}), см. {log}")
        r = subprocess.run([vision_python(), os.path.join(VISION_DIR, "measure_body.py"), f"{prefix}_matte.mkv"],
                           capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if r.returncode:
        die(f"measure_body.py не удался: {r.stderr.strip()[-300:]}")
    with open(f"{prefix}_body.json", "w", encoding="utf-8") as f:
        f.write(r.stdout)
    return r.stdout.strip()


def main():
    ap = argparse.ArgumentParser(description="plan.json + ролики лица → public/lessonN/aroll.json",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=(__doc__ or "").split("Режимы плана:")[-1])
    ap.add_argument("picks", nargs="*", help="выбор дублей: F02=F02_b (взять F02_b.mp4 для места F02), F03=- (без лица)")
    ap.add_argument("--project", default=os.path.join(KIT_ROOT, "remotion"), help="проект Remotion (по умолчанию <KIT_ROOT>/remotion)")
    ap.add_argument("--lesson", type=int, required=True, help="номер урока N (public/lessonN)")
    ap.add_argument("--lab", required=True, help="папка лица: plan.json, <id>.txt, videos/")
    ap.add_argument("--plan", help="plan.json (по умолчанию <lab>/plan.json)")
    ap.add_argument("--videos", help="папка роликов (по умолчанию <lab>/videos)")
    ap.add_argument("--cut-only", action="store_true", help="все места вставками, без переходов в угол")
    ap.add_argument("--cutouts", action="store_true", help="сделать вырезы для переходов (cutout.sh + measure_body.py) до сборки")
    a = ap.parse_args()

    L = a.lab
    videos = a.videos or os.path.join(L, "videos")
    P = os.path.join(a.project, "public", f"lesson{a.lesson}")
    rel = f"lesson{a.lesson}"
    pick = {}
    for x in a.picks:
        if "=" not in x:
            die(f"выбор дубля «{x}» — нужен формат F02=F02_b или F03=-")
        k, v = x.split("=", 1)
        pick[k] = v
    plan = load_json(a.plan or os.path.join(L, "plan.json"))
    unknown = set(pick) - {x["id"] for x in plan}
    if unknown:
        die(f"в plan.json нет мест: {sorted(unknown)}")
    os.makedirs(os.path.join(P, "aroll"), exist_ok=True)
    os.makedirs(os.path.join(P, "trans"), exist_ok=True)

    def video_of(case):
        v = os.path.join(videos, f"{case}.mp4")
        if not os.path.exists(v):
            die(f"нет ролика {v}")
        return v

    if a.cutouts:
        for x in plan:
            if "corner" in x["mode"] and pick.get(x["id"]) != "-":
                sid = x["id"]
                case = pick.get(sid, sid)
                body = make_cutout(video_of(case), os.path.join(P, "trans", sid), os.path.join(L, f"cut_{sid}.log"))
                print(sid, "вырез готов | body:", body[:120])

    segs, cut_k = [], 0
    for x in plan:
        sid = x["id"]
        case = pick.get(sid, sid)
        s, e = x["display"]
        if case == "-":
            continue  # место без лица
        shutil.copyfile(video_of(case), os.path.join(P, "aroll", f"{sid}.mp4"))
        txt = os.path.join(L, f"{sid}.txt")
        text = open(txt, encoding="utf-8").read()[:200] if os.path.exists(txt) else ""
        seg = {"id": sid, "s": s, "e": e, "clipStart": x["clipStart"], "scale": 1.0, "src": f"{rel}/aroll/{sid}.mp4",
               "text": text, "mode": x["mode"], "take": case}
        if x["mode"] == "full" or a.cut_only:
            seg["mode"] = "cut"
            seg["scale"] = 1.0 if cut_k % 2 == 0 else 1.15
            cut_k += 1
        else:
            sw = x.get("switch_t")
            if x["mode"] in ("full→corner", "corner→full") and sw is None:
                die(f"{sid}: режим {x['mode']} без switch_t — пересоберите plan.json (resolve_face_plan.py)")
            if x["mode"] == "full→corner":
                keys = [{"t": s, "layout": "full", "dur": 0.3}, {"t": sw, "layout": "corner", "dur": 0.3},
                        {"t": round(e - 0.05, 2), "layout": "hidden", "dur": 0.3}]
            elif x["mode"] == "corner→full":
                keys = [{"t": s, "layout": "corner", "dur": 0.3}, {"t": sw, "layout": "full", "dur": 0.38}]
            elif x["mode"] == "corner":
                keys = [{"t": s, "layout": "corner", "dur": 0.3}, {"t": round(e - 0.05, 2), "layout": "hidden", "dur": 0.3}]
            else:
                die(f"{sid}: режим {x['mode']} не поддержан")
            body_json = os.path.join(P, "trans", f"{sid}_body.json")
            if not os.path.exists(body_json):
                die(f"{sid}: нет выреза {body_json} — запустите с --cutouts (или --cut-only, если переход в угол не нужен)")
            geo = load_json(body_json)
            seg["trans"] = {"studio": seg["src"], "cutout": f"{rel}/trans/{sid}_cutout.webm", "face": f"{rel}/trans/{sid}_face.json",
                            "clip0": round(x["gen"][0] - x["pad"], 3), "keys": keys, "body": geo["body"], "cornerK": geo["cornerK"],
                            "alphaFix": False, **({"side": x["side"]} if x.get("side", "right") != "right" else {})}
        segs.append(seg)
    out = os.path.join(P, "aroll.json")
    save_json(out, {"fps_source": 24, "segments": segs})
    for x in segs:
        print(x["id"], x["take"], x["mode"], x["s"], x["e"], "clipStart", x["clipStart"], "scale", x["scale"],
              "keys", [(k["t"], k["layout"]) for k in x.get("trans", {}).get("keys", [])], x.get("trans", {}).get("side", ""))
    print(f"{len(segs)} вставок → {out}")


if __name__ == "__main__":
    main()
