def test_registro_e_inicio_de_sesion(client, auth):
    r = client.get("/auth/me", headers=auth)
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == "ana@example.com"
    # Valores por defecto pensados para Sevilla
    assert me["timezone"] == "Europe/Madrid"
    assert me["holidayRegion"] == "ES-AN-SE"


def test_email_repetido_aunque_cambien_las_mayusculas(client, make_user):
    make_user("ana@example.com")
    r = client.post(
        "/auth/register", json={"email": "ANA@example.com", "password": "otra-contraseña"}
    )
    assert r.status_code == 409


def test_contraseña_demasiado_corta(client):
    r = client.post("/auth/register", json={"email": "x@example.com", "password": "corta"})
    assert r.status_code == 422


def test_contraseña_incorrecta_y_usuario_inexistente(client, make_user):
    make_user()
    for username, password in [("ana@example.com", "mala"), ("nadie@example.com", "da-igual")]:
        r = client.post("/auth/token", data={"username": username, "password": password})
        assert r.status_code == 401
        assert r.json()["detail"] == "Email o contraseña incorrectos"


def test_rutas_protegidas_sin_token_o_con_token_falso(client):
    assert client.get("/projects").status_code == 401
    r = client.get("/projects", headers={"Authorization": "Bearer no-es-un-token"})
    assert r.status_code == 401


def test_actualizar_perfil(client, auth):
    r = client.patch("/auth/me", headers=auth, json={"name": "Ana", "timezone": "Atlantic/Canary"})
    assert r.status_code == 200
    assert r.json()["name"] == "Ana"
    assert r.json()["timezone"] == "Atlantic/Canary"

    assert (
        client.patch("/auth/me", headers=auth, json={"timezone": "Marte/Olympus"}).status_code
        == 422
    )
    assert client.patch("/auth/me", headers=auth, json={"timezone": None}).status_code == 422
