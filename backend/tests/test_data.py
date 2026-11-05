import uuid

PROJECT_ID = str(uuid.uuid4())

# Tal cual lo guarda el frontend en localStorage
LOCAL_DATA = {
    "projects": [
        {
            "id": PROJECT_ID,
            "name": "Web Acme",
            "client": "Acme S.L.",
            "color": "#2563eb",
            "hourlyRate": 40,
        }
    ],
    "events": [
        {
            "id": str(uuid.uuid4()),
            "title": "Reunión cliente",
            "start": "2026-11-09T09:00:00.000Z",
            "end": "2026-11-09T10:30:00.000Z",
            "color": "#2563eb",
            "projectId": PROJECT_ID,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "De un proyecto que ya no existe",
            "start": "2026-11-10T09:00:00.000Z",
            "end": "2026-11-10T10:00:00.000Z",
            "color": "#16a34a",
            "projectId": str(uuid.uuid4()),
        },
    ],
    "timeBlocks": [
        {
            "id": str(uuid.uuid4()),
            "label": "Estudios",
            "start": "17:30",
            "end": "20:30",
            "days": [0, 1, 2, 3, 4],
            "color": "#0d9488",
            "enabled": True,
            "keepOnHolidays": False,
            "exceptions": ["2026-12-08"],
        }
    ],
}


def test_importar_lo_que_habia_en_el_navegador(client, auth):
    r = client.post("/data/import", headers=auth, json=LOCAL_DATA)
    assert r.status_code == 200
    assert r.json() == {"projects": 1, "events": 2, "timeBlocks": 1}

    data = client.get("/data/export", headers=auth).json()
    assert data["projects"][0]["id"] == PROJECT_ID
    assert data["projects"][0]["hourlyRate"] == 40
    events = {e["title"]: e for e in data["events"]}
    assert events["Reunión cliente"]["projectId"] == PROJECT_ID
    assert events["De un proyecto que ya no existe"]["projectId"] is None
    block = data["timeBlocks"][0]
    assert (block["start"], block["end"], block["exceptions"]) == ("17:30", "20:30", ["2026-12-08"])


def test_importar_dos_veces_no_duplica(client, auth):
    client.post("/data/import", headers=auth, json=LOCAL_DATA)
    renamed = {**LOCAL_DATA, "projects": [{**LOCAL_DATA["projects"][0], "name": "Acme 2"}]}
    client.post("/data/import", headers=auth, json=renamed)

    data = client.get("/data/export", headers=auth).json()
    assert len(data["projects"]) == 1
    assert data["projects"][0]["name"] == "Acme 2"
    assert len(data["events"]) == 2
    assert len(data["timeBlocks"]) == 1


def test_no_se_pueden_pisar_datos_de_otro_usuario(client, make_user):
    ana = make_user("ana@example.com")
    luis = make_user("luis@example.com")
    client.post("/data/import", headers=ana, json=LOCAL_DATA)

    r = client.post("/data/import", headers=luis, json=LOCAL_DATA)
    assert r.status_code == 409
    assert client.get("/data/export", headers=luis).json()["projects"] == []
