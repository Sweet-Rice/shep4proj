"""Offline evaluation: weak-label held-out metrics, hand-written sanity set, free-text career matching.
Usage: uv run python scripts/fetch_data.py && uv run python scripts/run_eval.py"""
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from career_match.data import load_titles  # noqa: E402
from career_match.features import CACHE, embed  # noqa: E402
from career_match.metrics import ndcg_at_k, precision_at_k  # noqa: E402
from career_match.pipeline import load_all  # noqa: E402
from career_match.ranker import blend_scores, fit_blend  # noqa: E402
from career_match.titles import TitleMatcher  # noqa: E402

rng = np.random.default_rng(0)
D = load_all()
courses, occs, prefixes, scores, rel = (D[k] for k in ("courses", "occs", "prefixes", "scores", "rel"))
labeled, groups, feats, sanity = (D[k] for k in ("labeled", "groups", "feats", "sanity"))
print(f"courses={len(courses)} occupations={len(occs)} weakly-labelled={len(labeled)} "
      f"(SOC minor groups: {len(set(groups[labeled]))})")

methods = {"random": None, "largest-prefix prior": None, "TF-IDF": scores["tfidf"], "BM25": scores["bm25"],
           "MiniLM": scores["minilm"], "bge-small": scores["bge"]}
oof = {"blend (learned)": np.zeros_like(rel), "blend + prefix evidence": np.zeros_like(rel)}
for tr, te in GroupKFold(5).split(labeled, groups=groups[labeled]):
    for name, w in (("blend (learned)", False), ("blend + prefix evidence", True)):
        model = fit_blend(feats[w], rel, labeled[tr])
        oof[name][labeled[te]] = blend_scores(model, feats[w][labeled[te]])
methods.update(oof)
size = {p: (prefixes == p).sum() for p in set(prefixes)}


def evaluate(name: str) -> tuple[float, float, float, float]:
    p, n = [], []
    for i in labeled:
        if name == "random":
            s = rng.random(len(courses))
        elif name == "largest-prefix prior":
            s = np.array([size[x] for x in prefixes], dtype=float) + rng.random(len(courses)) * 0.1
        else:
            s = methods[name][i]
        p.append(precision_at_k(s, rel[i])); n.append(ndcg_at_k(s, rel[i]))
    boot = [np.mean(rng.choice(p, len(p))) for _ in range(500)]
    return float(np.mean(p)), float(np.mean(n)), *np.percentile(boot, [2.5, 97.5])


results = {m: evaluate(m) for m in methods}
print("\n## Weak-label held-out (grouped 5-fold by SOC minor group; prefix-level labels)\n")
print("| method | P@10 | nDCG@10 | P@10 95% CI |\n|---|---|---|---|")
for m, (p, n, lo, hi) in results.items():
    print(f"| {m} | {p:.3f} | {n:.3f} | {lo:.3f}-{hi:.3f} |")

# ---- free text -> occupation
titles = load_titles()
tvec = embed("minilm", [t[0] for t in titles], "titles")
tm = TitleMatcher(titles, tvec)
from sentence_transformers import SentenceTransformer  # noqa: E402
st = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


def match(query: str, mode: str, exclude: str | None = None) -> list[tuple[str, float]]:
    return tm.match(query, mode, st, exclude)


reported = [t for t in titles if t[2] == "reported"]
by_occ: dict[str, list] = {}
for t in reported:
    by_occ.setdefault(t[1], []).append(t[0])
held = [(rng.choice(v), c) for c, v in by_occ.items()][:400]


def typo(s: str) -> str:
    i = int(rng.integers(1, max(2, len(s) - 2)))
    return s[:i] + s[i + 1] + s[i] + s[i + 2:] if len(s) > 4 else s


print("\n## Free text -> occupation (leave-one-title-out, 400 held-out reported titles; SOC-level hit)\n")
print("| matcher | clean top-1 | clean top-5 | typo top-1 | typo top-5 |\n|---|---|---|---|---|")
for mode in ("fuzzy", "dense", "hybrid"):
    row = []
    for fn in (lambda s: s, typo):
        hits1 = hits5 = 0
        for q, code in held:
            res = match(fn(q), mode, exclude=q)
            socs = [c[:7] for c, _ in res]
            hits1 += socs[:1] == [code[:7]]; hits5 += code[:7] in socs
        row += [hits1 / len(held), hits5 / len(held)]
    print(f"| {mode} | " + " | ".join(f"{x:.3f}" for x in row) + " |")

code_idx = {o["onet"]: i for i, o in enumerate(occs)}
print("\n## Hand-written free-text queries (hybrid)\n")
ft_hit = 0
for q in sanity["free_text"]:
    res = match(q["query"], "hybrid")
    ok = (not q["expect_soc"] and res[0][1] < 0.6) or any(c[:7] in q["expect_soc"] for c, _ in res[:3])
    ft_hit += ok
    print(f'- {"ok " if ok else "MISS"} "{q["query"]}" -> ' + "; ".join(f"{occs[code_idx[c]]['title']} ({s:.2f})" for c, s in res[:3]))
print(f"\nfree-text sanity: {ft_hit}/{len(sanity['free_text'])} (hit = expected SOC in top-3, or low confidence <0.60 for nonsense)")

# ---- sanity set on courses, end to end through the matcher (top-3 occupations)
print("\n## Sanity set (query -> top-3 matched occupations -> course ranking; prefix P@10 / expected-course recall@20)\n")
print("| method | prefix P@10 | course recall@20 |\n|---|---|---|")
sane = [q for q in sanity["careers"] if q["covered"]]
matched = {}
for q in sane:
    res = match(q["query"], "hybrid")[:3]
    matched[q["query"]] = ([code_idx[c] for c, _ in res], np.array([s for _, s in res]))
sanity_scores: dict[str, list[np.ndarray]] = {m: [] for m in methods if m not in ("random", "largest-prefix prior")}
for q in sane:
    idx, w = matched[q["query"]]
    w = w / w.sum()
    train = np.array([i for i in labeled if groups[i] not in set(groups[idx])])
    for m in sanity_scores:
        if m.startswith("blend"):
            wp = m.endswith("evidence")
            model = fit_blend(feats[wp], rel, train)
            rows = blend_scores(model, feats[wp][idx])
        else:
            rows = methods[m][idx]
            rows = (rows - rows.mean(1, keepdims=True)) / (rows.std(1, keepdims=True) + 1e-9)
        sanity_scores[m].append((w[:, None] * rows).sum(0))
for m, per in sanity_scores.items():
    pp, rr = [], []
    for q, s in zip(sane, per):
        top = np.argsort(-s)[:10]
        pp.append(np.mean([prefixes[i] in q["expect_prefixes"] for i in top]))
        if q["expect_courses"]:
            top20 = {courses[i]["code"] for i in np.argsort(-s)[:20]}
            rr.append(np.mean([c in top20 for c in q["expect_courses"]]))
    print(f"| {m} | {np.mean(pp):.3f} | {np.mean(rr):.3f} |")

# ---- coverage / abstention: does the catalog serve this occupation at all?
cover = np.sort(scores["minilm"], axis=1)[:, -10:].mean(axis=1)
unlab = np.setdiff1d(np.arange(len(occs)), labeled)
auc = roc_auc_score(np.r_[np.ones(len(labeled)), np.zeros(len(unlab))], np.r_[cover[labeled], cover[unlab]])
print(f"\ncoverage score (mean top-10 MiniLM sim): AUC labelled-vs-unlabelled = {auc:.3f}; "
      f"median labelled {np.median(cover[labeled]):.3f}, unlabelled {np.median(cover[unlab]):.3f}")
for q in sanity["careers"]:
    top = match(q["query"], "hybrid")[0][0]
    print(f'  {q["query"]:28s} coverage={cover[code_idx[top]]:.3f} covered={q["covered"]}')
CACHE.mkdir(exist_ok=True)
(CACHE / "results.json").write_text(json.dumps({k: list(v) for k, v in results.items()}, indent=1))
