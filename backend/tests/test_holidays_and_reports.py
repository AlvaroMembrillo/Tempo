import pytest


def test_festivos_de_sevilla_por_defecto(client, auth):
    holidays = client.get("/holidays", headers=auth).json()
    assert len(holidays) == 28  # 2026 y 2027 (cargados por la migración)
    corpus = next(h for h in holidays if h["date"] == "2026-06-04")
    assert corpus == {
        "date": "2026-06-04",
        "name": "Corpus Christi",
        "region": "ES-AN-SE",
        "scope": "Sevilla",
        "note": None,
    }


def test_festivos_por_region_y_fechas(client, auth):
    national = client.get("/holidays", headers=auth, params={"region": "ES"}).json()
    assert {h["region"] for h in national} == {"ES"}

    december = client.get(
        "/holidays", headers=auth, params={"from": "2026-12-01", "to": "2026-12-31"}
    ).json()
    assert [(h["date"], h["name"]) for h in december] == [
        ("2026-12-07", "Día de la Constitución"),
        ("2026-12-08", "Inmaculada Concepción"),
        ("2026-12-25", "Natividad del Señor"),
    ]


@pytest.fixture
def week(client, auth):
    """Una semana con horas en dos proyectos (uno con tarifa) y un evento suelto."""

    def project(name, rate=None):
        body = {"name": name, "color": "#2563eb", "hourlyRate": rate}
        return client.post("/projects", headers=auth, json=body).json()["id"]

    acme = project("Web Acme", 40)
    blog = project("Rediseño blog")

    def add(start, end, project_id=None):
        body = {"start": start, "end": end, "color": "#000000", "projectId": project_id}
        assert client.post("/events", headers=auth, json=body).status_code == 201

    add("2026-11-09T09:00:00Z", "2026-11-09T11:30:00Z", acme)  # 2,5 h
    add("2026-11-08T23:00:00Z", "2026-11-09T00:20:00Z", acme)  # solo cuentan 20 min
    add("2026-11-10T09:00:00Z", "2026-11-10T12:00:00Z", blog)  # 3 h sin tarifa
    add("2026-11-11T10:00:00Z", "2026-11-11T11:00:00Z")  # sin proyecto
    add("2026-11-20T10:00:00Z", "2026-11-20T12:00:00Z", acme)  # fuera del periodo
    return {"acme": acme, "blog": blog}


def test_informe_por_proyecto(client, auth, week):
    r = client.get(
        "/reports/projects",
        headers=auth,
        params={"from": "2026-11-09T00:00:00Z", "to": "2026-11-16T00:00:00Z"},
    )
    assert r.status_code == 200
    report = r.json()
    totals = [(t["projectName"], t["minutes"], t["amount"]) for t in report["totals"]]
    assert totals == [
        ("Rediseño blog", 180, None),
        ("Web Acme", 170, 113.33),  # 2 h 50 min a 40 €/h
        (None, 60, None),  # sin proyecto, al final
    ]
    assert report["totalMinutes"] == 350  # solo lo que tiene proyecto
    assert report["totalAmount"] == 113.33


def test_informe_con_periodo_al_reves(client, auth):
    r = client.get(
        "/reports/projects",
        headers=auth,
        params={"from": "2026-11-16T00:00:00Z", "to": "2026-11-09T00:00:00Z"},
    )
    assert r.status_code == 422
