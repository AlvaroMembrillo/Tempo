from datetime import datetime


def event(start: str, end: str, **extra) -> dict:
    return {"title": "Reunión", "start": start, "end": end, "color": "#16a34a", **extra}


def test_crear_y_leer_un_evento(client, auth):
    r = client.post(
        "/events",
        headers=auth,
        json=event("2026-11-09T10:00:00+01:00", "2026-11-09T11:30:00+01:00"),
    )
    assert r.status_code == 201
    e = r.json()
    # Se guarda el instante exacto, con zona horaria
    assert datetime.fromisoformat(e["start"]) == datetime.fromisoformat("2026-11-09T09:00:00Z")
    assert e["projectId"] is None
    assert client.get(f"/events/{e['id']}", headers=auth).json()["title"] == "Reunión"


def test_fechas_sin_zona_horaria_o_al_reves(client, auth):
    # Sin zona horaria no se sabe qué hora es: se rechaza
    naive = event("2026-11-09T10:00:00", "2026-11-09T11:00:00")
    assert client.post("/events", headers=auth, json=naive).status_code == 422
    backwards = event("2026-11-09T11:00:00Z", "2026-11-09T10:00:00Z")
    assert client.post("/events", headers=auth, json=backwards).status_code == 422


def test_filtrar_por_periodo_incluye_los_que_se_solapan(client, auth):
    for start, end in [
        ("2026-11-08T23:00:00Z", "2026-11-09T01:00:00Z"),  # empieza antes, acaba dentro
        ("2026-11-10T10:00:00Z", "2026-11-10T11:00:00Z"),  # dentro
        ("2026-11-20T10:00:00Z", "2026-11-20T11:00:00Z"),  # fuera
    ]:
        client.post("/events", headers=auth, json=event(start, end))

    r = client.get(
        "/events",
        headers=auth,
        params={"from": "2026-11-09T00:00:00Z", "to": "2026-11-16T00:00:00Z"},
    )
    assert [e["start"][:10] for e in r.json()] == ["2026-11-08", "2026-11-10"]


def test_mover_un_evento(client, auth):
    e = client.post(
        "/events", headers=auth, json=event("2026-11-09T10:00:00Z", "2026-11-09T11:00:00Z")
    ).json()

    r = client.patch(
        f"/events/{e['id']}",
        headers=auth,
        json={"start": "2026-11-10T15:00:00Z", "end": "2026-11-10T16:30:00Z"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Reunión"

    # Mover solo el fin antes del inicio no se permite
    r = client.patch(f"/events/{e['id']}", headers=auth, json={"end": "2026-11-10T14:00:00Z"})
    assert r.status_code == 422


def test_no_se_puede_usar_el_proyecto_de_otro(client, make_user):
    ana = make_user("ana@example.com")
    luis = make_user("luis@example.com")
    pid = client.post(
        "/projects", headers=luis, json={"name": "De Luis", "color": "#000000"}
    ).json()["id"]

    body = event("2026-11-09T10:00:00Z", "2026-11-09T11:00:00Z", projectId=pid)
    assert client.post("/events", headers=ana, json=body).status_code == 422


def test_borrar_un_evento(client, auth):
    e = client.post(
        "/events", headers=auth, json=event("2026-11-09T10:00:00Z", "2026-11-09T11:00:00Z")
    ).json()
    assert client.delete(f"/events/{e['id']}", headers=auth).status_code == 204
    assert client.get("/events", headers=auth).json() == []
