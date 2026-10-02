"""Shared setup for the eval and artifact scripts: load data, build score matrices and weak labels."""
import json

import numpy as np

from .data import (DATA, ROOT, load_catalog, load_crosswalk, load_occupations, occupation_text,
                   soc_to_prefixes)
from .features import bm25_scores, embed, occupation_embeddings, tfidf_scores
from .ranker import build_features


def load_all() -> dict:
    mapping = {k: v for k, v in json.loads((ROOT / "mappings/prefix_cip.json").read_text()).items()
               if not k.startswith("_")}
    courses, occs = load_catalog(DATA / "catalog.json"), load_occupations()
    prefixes = np.array([c["prefix"] for c in courses])
    soc_prefixes = soc_to_prefixes(load_crosswalk(DATA / "cipsoc.xlsx"), mapping)
    otexts, ctexts = [occupation_text(o) for o in occs], [c["text"] for c in courses]
    scores = {"tfidf": tfidf_scores(otexts, ctexts), "bm25": bm25_scores(otexts, ctexts)}
    for key in ("minilm", "bge"):
        scores[key] = occupation_embeddings(key, occs) @ embed(key, ctexts, "courses").T
    rel = np.array([[p in soc_prefixes.get(o["soc"], ()) for p in prefixes] for o in occs], dtype=float)
    return {"courses": courses, "occs": occs, "prefixes": prefixes, "scores": scores, "rel": rel,
            "otexts": otexts, "ctexts": ctexts, "labeled": np.where(rel.sum(axis=1) > 0)[0],
            "groups": np.array([o["soc"][:5] for o in occs]),
            "feats": {w: build_features(scores, courses, w) for w in (False, True)},
            "sanity": json.loads((ROOT / "sanity/sanity_set.json").read_text())}
