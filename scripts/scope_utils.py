#!/usr/bin/env python3
"""Shared helper to convert EClassification_* names to malterlib.* TextMate scopes."""
import re
from functools import lru_cache

# Misspelling corrections
_CORRECTIONS = {
    "bulit": "built",
}

_SEG_RE = re.compile(r"[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z0-9]+")

def _camel_to_kebab(segment: str) -> str:
    """Convert CamelCase (with possible acronym segments) -> kebab-case.

    Rules:
      * Consecutive capitals like URL/CRL are kept together as one word.
      * Misspellings corrected via _CORRECTIONS mapping before tokenisation.
    """
    for wrong, correct in _CORRECTIONS.items():
        segment = segment.replace(wrong.capitalize(), correct.capitalize()).replace(wrong, correct)

    tokens = _SEG_RE.findall(segment)
    kebab = "-".join(tok.lower() for tok in tokens if tok)
    kebab = kebab.replace("built-in", "builtin")
    return kebab

@lru_cache(maxsize=None)
def classification_to_scope(cls: str) -> str:
    cls = cls.replace("EClassification_", "")

    segments = cls.split("_")
    out_parts = []
    for seg in segments:
        if seg.startswith("Template"):
            out_parts.append("template")
            remainder = seg[len("Template"):]
            if remainder:
                out_parts.append(_camel_to_kebab(remainder))
        else:
            out_parts.append(_camel_to_kebab(seg))

    return "malterlib-" + "-".join(out_parts) + "" 