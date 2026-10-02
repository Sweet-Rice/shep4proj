"""Free-text career -> O*NET occupation via titles (occupation, alternate and reported titles)."""
import numpy as np
from rapidfuzz import fuzz, process


class TitleMatcher:
    def __init__(self, titles: list[tuple[str, str, str]], vecs: np.ndarray | None = None):
        self.titles, self.vecs = titles, vecs
        self.lower = [t[0].lower() for t in titles]
        self.codes = np.array([t[1] for t in titles])

    def fuzzy(self, query: str, exclude: str | None = None) -> dict[str, float]:
        hits = process.extract(query.lower(), self.lower, scorer=fuzz.WRatio, limit=60)
        best: dict[str, float] = {}
        for text, score, idx in hits:
            if exclude is not None and text == exclude.lower():
                continue
            best[self.codes[idx]] = max(best.get(self.codes[idx], 0.0), score / 100)
        return best

    def dense(self, qvec: np.ndarray, exclude: str | None = None) -> dict[str, float]:
        sims = self.vecs @ qvec
        if exclude is not None:
            sims = np.where(np.array(self.lower) == exclude.lower(), -1, sims)
        order = np.argsort(-sims)[:60]
        best: dict[str, float] = {}
        for idx in order:
            best[self.codes[idx]] = max(best.get(self.codes[idx], -1.0), float(sims[idx]))
        return best

    def match(self, query: str, mode: str, encoder, exclude: str | None = None) -> list[tuple[str, float]]:
        """Top-5 (O*NET code, confidence). mode: fuzzy | dense | hybrid. `encoder` is a sentence-transformers model."""
        f = self.fuzzy(query, exclude) if mode in ("fuzzy", "hybrid") else {}
        d = self.dense(encoder.encode(query, normalize_embeddings=True), exclude) if mode in ("dense", "hybrid") else {}
        return rank(self.hybrid(f, d) if mode == "hybrid" else (f or d))

    @staticmethod
    def hybrid(fuzzy: dict[str, float], dense: dict[str, float]) -> dict[str, float]:
        return {c: 0.5 * fuzzy.get(c, 0.0) + 0.5 * max(dense.get(c, 0.0), 0.0) for c in set(fuzzy) | set(dense)}


def rank(scores: dict[str, float], k: int = 5) -> list[tuple[str, float]]:
    return sorted(scores.items(), key=lambda kv: -kv[1])[:k]
