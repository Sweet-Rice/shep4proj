"""Build the shippable occupation -> top-N courses artifact (+ title index) and print example outputs and sizes.
The artifact is derived only from public data (O*NET, NCES crosswalk, the public catalog): no user data."""
import gzip
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from career_match.data import load_titles  # noqa: E402
from career_match.features import CACHE, embed  # noqa: E402
from career_match.pipeline import load_all  # noqa: E402
from career_match.ranker import blend_scores, fit_blend  # noqa: E402
from career_match.titles import TitleMatcher  # noqa: E402

TOP_N, MIN_COVER = 20, 0.50
D = load_all()
courses, occs, rel, labeled = D["courses"], D["occs"], D["rel"], D["labeled"]
model = fit_blend(D["feats"][False], rel, labeled)
final = blend_scores(model, D["feats"][False])
cover = np.sort(D["scores"]["minilm"], axis=1)[:, -10:].mean(axis=1)
is_labeled = np.isin(np.arange(len(occs)), labeled)
# covered: crosswalk routes the occupation to a catalog prefix; weak: only embedding evidence; none: abstain
status = np.where(is_labeled, "covered", np.where(cover >= MIN_COVER, "weak", "none"))
print("blend weights", dict(zip(["tfidf", "bm25", "minilm", "bge", "level"], model.coef_[0].round(2))))

# max_df drops generic words from the reasons
vec = TfidfVectorizer(stop_words="english", min_df=2, max_df=0.2).fit(D["ctexts"] + D["otexts"])
terms = np.array(vec.get_feature_names_out())
ct, ot = vec.transform(D["ctexts"]), vec.transform(D["otexts"])


def reason(o: int, c: int) -> list[str]:
    """Top shared salient terms between the occupation text and the course text."""
    shared = ot[o].multiply(ct[c]).toarray().ravel()
    return [str(t) for t in terms[np.argsort(-shared)[:3]] if shared[terms == t][0] > 0]


rows = []
for i, o in enumerate(occs):
    top = np.argsort(-final[i])[:TOP_N] if status[i] != "none" else []
    rows.append({"o": o["onet"], "t": o["title"], "s": str(status[i]), "r": [[int(c), reason(i, int(c))] for c in top]})
code_idx = {o["onet"]: i for i, o in enumerate(occs)}
titles = [t for t in load_titles() if t[2] != "alt"]  # occupation + reported titles (~9k)
artifact = {"source": "O*NET 31.0 (CC BY 4.0), NCES CIP2020-SOC2018 crosswalk, LSU catalog 2026-2027",
            "courses": [c["code"] for c in courses], "occupations": rows,
            "titles": [[t, code_idx[c]] for t, c, _ in titles]}
raw = json.dumps(artifact, separators=(",", ":")).encode()
CACHE.mkdir(exist_ok=True)
(CACHE / "career-courses.json").write_bytes(raw)
print(f"artifact: {len(raw) / 1e3:.0f} kB raw, {len(gzip.compress(raw)) / 1e3:.0f} kB gzip; "
      f"occupations covered={sum(status == 'covered')} weak={sum(status == 'weak')} none={sum(status == 'none')}")
n_all = len(load_titles())
print(f"title embeddings (384-d int8): occupation+reported {len(titles) * 384 / 1e6:.1f} MB, all titles {n_all * 384 / 1e6:.1f} MB")

print("\nabstention on the sanity set (covered/weak/none):")
tm = TitleMatcher(load_titles(), embed("minilm", [t[0] for t in load_titles()], "titles"))
from sentence_transformers import SentenceTransformer  # noqa: E402
st = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
for q in D["sanity"]["careers"]:
    got = [str(status[code_idx[c]]) for c, _ in tm.match(q["query"], "hybrid", st)[:3]]
    print(f'  {q["query"]:28s} top-3 statuses {got} (expected covered={q["covered"]})')

print("\nexamples (top-3 matched occupations, confidence-weighted, learned blend):")
for q in ["game developer", "cybersecurity analyst", "data scientist at a bank", "petroleum geologist", "pediatric nurse"]:
    res = tm.match(q, "hybrid", st)[:3]
    print(f'\n"{q}" -> ' + "; ".join(f"{occs[code_idx[c]]['title']} [{status[code_idx[c]]}] {s:.2f}" for c, s in res))
    live = [(code_idx[c], s) for c, s in res if status[code_idx[c]] != "none"]
    if not live:
        print("  not covered by the current catalog")
        continue
    w = np.array([s for _, s in live]); w = w / w.sum()
    z = sum(wi * final[i] for (i, _), wi in zip(live, w))
    for c in np.argsort(-z)[:8]:
        i0 = live[0][0]
        print(f'  {courses[c]["code"]:10s} {courses[c]["title"][:48]:48s} because: {", ".join(reason(i0, int(c)))}')
