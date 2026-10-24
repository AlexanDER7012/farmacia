(() => {
  const ACCIONES = {
    LOGIN: ["Inicio de sesión", "info"],
    LOGIN_FALLIDO: ["Intento fallido", "danger"],
    LOGOUT: ["Cierre de sesión", "secondary"],
    CREAR: ["Crear", "success"],
    EDITAR: ["Editar", "primary"],
    DESACTIVAR: ["Desactivar", "warning"],
    REACTIVAR: ["Reactivar", "success"],
    ANULAR: ["Anular", "danger"],
    RECIBIR: ["Recibir", "info"],
    ABRIR: ["Abrir caja", "info"],
    CERRAR: ["Cerrar caja", "secondary"],
  };

  function render(contenedor) {
    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-bitacora"></div></div>`;

    new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-bitacora"),
      url: "/api/bitacora",
      filtroActivo: false,
      porPagina: 50,
      textoBuscar: "Buscar en el detalle o por usuario...",
      vacio: "No hay actividad registrada",
      botones: `
        <select class="form-select filtro" data-filtro="accion" title="Acción">
          <option value="">Todas las acciones</option>
          ${Object.entries(ACCIONES).map(([clave, [texto]]) => `<option value="${clave}">${texto}</option>`).join("")}
        </select>
        ${TablaPaginada.filtrosFecha()}`,
      parametros: (t) => ({ accion: t.filtro("accion"), desde: t.filtro("desde"), hasta: t.filtro("hasta") }),
      columnas: [
        { titulo: "Fecha", clase: "text-nowrap", render: (f) => UI.fechaHora(f.fecha) },
        { titulo: "Usuario", render: (f) => f.usuario
            ? `<span class="fw-semibold">${UI.escapar(f.usuario)}</span>`
            : `<span class="text-secondary">Desconocido</span>` },
        { titulo: "Acción", render: (f) => {
            const [texto, color] = ACCIONES[f.accion] || [f.accion, "secondary"];
            return `<span class="badge text-bg-${color}">${UI.escapar(texto)}</span>`;
          } },
        { titulo: "Módulo", render: (f) => UI.escapar(f.modulo) },
        { titulo: "Detalle", clase: "celda-detalle", render: (f) => UI.escapar(f.detalle || "—") },
        { titulo: "IP", render: (f) => `<span class="small text-secondary">${UI.escapar(f.ip || "—")}</span>` },
      ],
    });
  }

  App.registrar("bitacora", { render });
})();