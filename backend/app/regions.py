"""Regiones de festivos: ES = nacional, ES-AN = Andalucía, ES-AN-SE = Sevilla capital."""

REGION_NAMES = {"ES": "España", "ES-AN": "Andalucía", "ES-AN-SE": "Sevilla"}


def regions_for(region: str) -> list[str]:
    """Una región incluye a sus «padres»: ES-AN-SE → [ES, ES-AN, ES-AN-SE]."""
    parts = region.split("-")
    return ["-".join(parts[: i + 1]) for i in range(len(parts))]
