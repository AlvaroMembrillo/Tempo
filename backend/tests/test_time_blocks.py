STUDIES = {
    "label": "Estudios",
    "start": "17:30",
    "end": "20:30",
    "days": [0, 1, 2, 3, 4],
    "color": "#0d9488",
}


def test_crear_una_franja(client, auth):
    r = client.post("/time-blocks", headers=auth, json=STUDIES)
    assert r.status_code == 201
    block = r.json()
    # Mismo formato que el frontend: «HH:MM» y lista de días
    assert block["start"] == "17:30"
    assert block["end"] == "20:30"
    assert block["days"] == [0, 1, 2, 3, 4]
    assert block["enabled"] is True
    assert block["keepOnHolidays"] is None
    assert block["exceptions"] == []


def test_franja_que_cruza_la_medianoche(client, auth):
    sleep = {"label": "Dormir", "start": "23:00", "end": "07:00", "days": [0, 1, 2, 3, 4, 5, 6]}
    r = client.post("/time-blocks", headers=auth, json={**sleep, "color": "#6366f1"})
    assert r.status_code == 201
    assert r.json()["days"] == [0, 1, 2, 3, 4, 5, 6]


def test_dias_no_validos(client, auth):
    assert (
        client.post("/time-blocks", headers=auth, json={**STUDIES, "days": [7]}).status_code == 422
    )


def test_quitar_y_recuperar_un_dia(client, auth):
    bid = client.post("/time-blocks", headers=auth, json=STUDIES).json()["id"]

    for _ in range(2):  # repetirlo no duplica
        r = client.post(f"/time-blocks/{bid}/exceptions", headers=auth, json={"date": "2026-12-08"})
    client.post(f"/time-blocks/{bid}/exceptions", headers=auth, json={"date": "2026-12-07"})
    assert r.status_code == 200
    assert client.get("/time-blocks", headers=auth).json()[0]["exceptions"] == [
        "2026-12-07",
        "2026-12-08",
    ]

    r = client.delete(f"/time-blocks/{bid}/exceptions/2026-12-08", headers=auth)
    assert r.json()["exceptions"] == ["2026-12-07"]


def test_editar_una_franja(client, auth):
    bid = client.post("/time-blocks", headers=auth, json=STUDIES).json()["id"]

    r = client.patch(
        f"/time-blocks/{bid}", headers=auth, json={"days": [5, 6], "keepOnHolidays": True}
    )
    assert r.json()["days"] == [5, 6]
    assert r.json()["keepOnHolidays"] is True

    # keepOnHolidays admite null (= decidir por el nombre); los días no
    assert (
        client.patch(f"/time-blocks/{bid}", headers=auth, json={"keepOnHolidays": None}).json()[
            "keepOnHolidays"
        ]
        is None
    )
    assert client.patch(f"/time-blocks/{bid}", headers=auth, json={"days": None}).status_code == 422


def test_borrar_una_franja_con_dias_quitados(client, auth):
    bid = client.post(
        "/time-blocks", headers=auth, json={**STUDIES, "exceptions": ["2026-12-08"]}
    ).json()["id"]
    assert client.delete(f"/time-blocks/{bid}", headers=auth).status_code == 204
    assert client.get("/time-blocks", headers=auth).json() == []
