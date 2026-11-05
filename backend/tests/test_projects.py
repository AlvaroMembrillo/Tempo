import uuid

ACME = {"name": "Web Acme", "client": "Acme S.L.", "color": "#2563eb", "hourlyRate": 40}


def test_crear_listar_editar_y_borrar(client, auth):
    r = client.post("/projects", headers=auth, json=ACME)
    assert r.status_code == 201
    project = r.json()
    assert project["hourlyRate"] == 40  # número en el JSON, no texto
    assert project["archived"] is False

    assert [p["name"] for p in client.get("/projects", headers=auth).json()] == ["Web Acme"]

    r = client.patch(
        f"/projects/{project['id']}", headers=auth, json={"archived": True, "hourlyRate": 42.5}
    )
    assert r.json()["archived"] is True
    assert r.json()["hourlyRate"] == 42.5
    assert r.json()["name"] == "Web Acme"  # lo que no se envía no cambia

    assert client.delete(f"/projects/{project['id']}", headers=auth).status_code == 204
    assert client.get(f"/projects/{project['id']}", headers=auth).status_code == 404


def test_el_cliente_puede_fijar_el_id(client, auth):
    pid = str(uuid.uuid4())
    assert client.post("/projects", headers=auth, json={**ACME, "id": pid}).json()["id"] == pid
    assert client.post("/projects", headers=auth, json={**ACME, "id": pid}).status_code == 409


def test_validaciones(client, auth):
    assert (
        client.post("/projects", headers=auth, json={**ACME, "hourlyRate": -1}).status_code == 422
    )
    assert client.post("/projects", headers=auth, json={**ACME, "color": "azul"}).status_code == 422
    assert client.post("/projects", headers=auth, json={**ACME, "name": ""}).status_code == 422
    # Más de dos decimales en una tarifa no tiene sentido
    assert (
        client.post("/projects", headers=auth, json={**ACME, "hourlyRate": 40.555}).status_code
        == 422
    )
    pid = client.post("/projects", headers=auth, json=ACME).json()["id"]
    assert client.patch(f"/projects/{pid}", headers=auth, json={"name": None}).status_code == 422


def test_cada_usuario_solo_ve_sus_proyectos(client, make_user):
    ana = make_user("ana@example.com")
    luis = make_user("luis@example.com")
    pid = client.post("/projects", headers=ana, json=ACME).json()["id"]

    assert client.get("/projects", headers=luis).json() == []
    assert client.get(f"/projects/{pid}", headers=luis).status_code == 404
    assert client.patch(f"/projects/{pid}", headers=luis, json={"name": "X"}).status_code == 404
    assert client.delete(f"/projects/{pid}", headers=luis).status_code == 404


def test_borrar_un_proyecto_no_borra_sus_eventos(client, auth):
    pid = client.post("/projects", headers=auth, json=ACME).json()["id"]
    event = client.post(
        "/events",
        headers=auth,
        json={
            "title": "Maquetación",
            "start": "2026-11-09T09:00:00+01:00",
            "end": "2026-11-09T11:00:00+01:00",
            "color": "#2563eb",
            "projectId": pid,
        },
    ).json()

    client.delete(f"/projects/{pid}", headers=auth)
    after = client.get(f"/events/{event['id']}", headers=auth).json()
    assert after["projectId"] is None
    assert after["title"] == "Maquetación"
