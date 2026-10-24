class ErrorApi extends Error {
  constructor(mensaje, estado, cuerpo = null) {
    super(mensaje);
    this.estado = estado;
    this.cuerpo = cuerpo;
    this.campos = ErrorApi.erroresPorCampo(cuerpo);
  }

  /** Errores de validación (422) agrupados por campo: { telefono: "El teléfono debe..." } */
  static erroresPorCampo(cuerpo) {
    const campos = {};
    if (cuerpo && Array.isArray(cuerpo.detail)) {
      for (const error of cuerpo.detail) {
        const campo = Array.isArray(error.loc) ? error.loc[error.loc.length - 1] : null;
        if (campo && campo !== "body" && !campos[campo]) campos[campo] = error.msg;
      }
    }
    return campos;
  }
}

function mensajeDeError(cuerpo, estado) {
  if (cuerpo && typeof cuerpo.detail === "string") return cuerpo.detail;
  if (cuerpo && Array.isArray(cuerpo.detail)) {
    return cuerpo.detail.map((e) => e.msg).join(". ");
  }
  if (estado === 403) return "No tienes permiso para realizar esta acción";
  if (estado === 404) return "No se encontró lo que buscabas";
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}

const API = {
  async peticion(metodo, ruta, datos) {
    const opciones = { method: metodo, credentials: "same-origin", headers: {} };
    if (datos !== undefined) {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(datos);
    }

    let respuesta;
    try {
      respuesta = await fetch(ruta, opciones);
    } catch {
      throw new ErrorApi("No se pudo conectar con el servidor. Revisa que esté encendido.", 0);
    }

    let cuerpo = null;
    if (respuesta.status !== 204) {
      try { cuerpo = await respuesta.json(); } catch { cuerpo = null; }
    }

    if (!respuesta.ok) {
      const esLogin = ruta.startsWith("/api/auth/login");
      if (respuesta.status === 401 && !esLogin && !location.pathname.endsWith("login.html")) {
        location.href = "/login.html?expirada=1";
      }
      throw new ErrorApi(mensajeDeError(cuerpo, respuesta.status), respuesta.status, cuerpo);
    }
    return cuerpo;
  },

  /** GET con parámetros: API.get("/api/productos", { buscar: "para", pagina: 2 }) */
  get(ruta, parametros = {}) {
    const query = new URLSearchParams();
    for (const [clave, valor] of Object.entries(parametros)) {
      if (valor !== null && valor !== undefined && valor !== "") query.append(clave, valor);
    }
    const texto = query.toString();
    return this.peticion("GET", texto ? `${ruta}?${texto}` : ruta);
  },
  post(ruta, datos = {}) { return this.peticion("POST", ruta, datos); },
  put(ruta, datos = {}) { return this.peticion("PUT", ruta, datos); },
  patch(ruta, datos = {}) { return this.peticion("PATCH", ruta, datos); },
};