"""GLiNER2.5 span service for Yard #3.

POST /extract {text} -> {entities: [{kind, text, start, end, confidence, source}], ms}
Dev only. Hosting is the owner's call.
"""
import os
import re
import time
from pathlib import Path

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from gliner2 import AutoExtractor

HERE = Path(__file__).parent
MODEL_DIR = os.environ.get("GLINER_MODEL_DIR", str(HERE / "models" / "gliner2.5-base-v1"))
THRESHOLD = float(os.environ.get("GLINER_THRESHOLD", "0.7"))
MAX_CHARS = 1500
torch.set_num_threads(int(os.environ.get("GLINER_THREADS", "4")))

# label -> (kind used by the engine, description the model sees)
LABELS = {
    "job title": ("job", "The person's role or occupation, e.g. staff engineer, indie hacker, nurse"),
    "employer or organisation": ("employer", "A company, startup or organisation the person works or worked for"),
    "AI lab": ("ai_lab", "An AI research lab such as OpenAI, Anthropic, DeepMind, Google Brain"),
    "charity or cause": ("charity", "A charity, nonprofit or cause the person gives to"),
    "donation amount": ("donation", "Money or share of income given away, e.g. 10%, $20"),
    "food eaten": ("food", "Food or diet the person eats, e.g. steak, vegan, chicken sandwich"),
    "pet": ("pet", "Animals the person keeps as pets, e.g. two cats, 3 dogs"),
    "animal": ("animal", "Other animals mentioned, e.g. shrimp, insects, bees"),
    "hobby": ("hobby", "Leisure activities, sports or pastimes"),
    "city or country": ("city", "A city, region or country"),
}

MONEY_RE = re.compile(r"(?:[$£€¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?(?:\s?(?:MRR|ARR)\b)?|\b\d+(?:\.\d+)?\s?%)")
GIVE_RE = re.compile(r"\b(give|gives|gave|giving|donat\w*|pledg\w*|tith\w*|contribut\w*)\b", re.I)


def near_give(text: str, start: int, end: int, window: int = 30) -> bool:
    lo = max(0, start - window)
    return bool(GIVE_RE.search(text[lo:end + 8]))


print(f"loading {MODEL_DIR}", flush=True)
t0 = time.perf_counter()
model = AutoExtractor.from_pretrained(MODEL_DIR, map_location="cpu")
schema = model.create_schema().entities({k: v[1] for k, v in LABELS.items()})
model.extract("Warm-up: I had a chicken sandwich in Tokyo.", schema)
print(f"model ready in {time.perf_counter() - t0:.1f}s", flush=True)

app = FastAPI()


class Req(BaseModel):
    text: str


def locate(text: str, needle: str, used: set) -> tuple[int, int] | None:
    """Fallback offset lookup when the model gives text without spans."""
    i = text.find(needle)
    while i != -1 and (i, i + len(needle)) in used:
        i = text.find(needle, i + 1)
    return (i, i + len(needle)) if i != -1 else None


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_DIR}


@app.post("/extract")
def extract(req: Req):
    text = req.text[:MAX_CHARS]
    t = time.perf_counter()
    raw = model.extract(text, schema, threshold=THRESHOLD, include_confidence=True, include_spans=True)
    ents = []
    used: set = set()
    for label, items in (raw.get("entities") or {}).items():
        kind = LABELS.get(label, ("other", ""))[0]
        for it in items or []:
            s, e = it.get("start"), it.get("end")
            if s is None or e is None or text[s:e] != it.get("text"):
                loc = locate(text, it.get("text", ""), used)
                if not loc:
                    continue
                s, e = loc
            used.add((s, e))
            ents.append({"kind": kind, "text": text[s:e], "start": s, "end": e,
                         "confidence": round(float(it.get("confidence", 0)), 3), "source": "gliner"})
    # Money regex: an amount is a donation only near give/donate; otherwise it is just money.
    ents = [x for x in ents if x["kind"] != "donation" or near_give(text, x["start"], x["end"])]
    for m in MONEY_RE.finditer(text):
        s, e = m.start(), m.end()
        kind = "donation" if near_give(text, s, e) else "money"
        if any(x["start"] < e and s < x["end"] and x["kind"] in ("donation", "money") for x in ents):
            continue
        ents.append({"kind": kind, "text": text[s:e], "start": s, "end": e, "confidence": 1.0, "source": "regex"})
    ents.sort(key=lambda x: (x["start"], -x["end"]))
    return {"entities": ents, "ms": round((time.perf_counter() - t) * 1000, 1)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8765")))
