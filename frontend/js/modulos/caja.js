(() => {
  let tabla = null;

  const moneda = () => App.config.moneda || "Q";
  const dato = (etiqueta, valor, destacado = false) => `
    <div class="dato ${destacado ? "destacado" : ""}">
      <div class="etq">${UI.escapar(etiqueta)}</div>
      <div class="val">${UI.escapar(valor)}</div>
    </div>`;

  function render(contenedor) {
    contenedor.innerHTML = `
      <div class="card p-3 p-md-4 mb-3" id="tarjeta-turno"></div>
      <nav class="pestanas" id="pestanas-caja">
        <button type="button" data-tab="turnos"><i class="bi bi-clock-history"></i>Turnos</button>
        <button type="button" data-tab="gastos"><i class="bi bi-receipt-cutoff"></i>Gastos</button>
      </nav>
      <div class="card p-3 p-md-4"><div id="tabla-caja"></div></div>`;

    contenedor.querySelector("#pestanas-caja").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-tab]");
      if (boton) mostrar(boton.dataset.tab);
    });

    cargarTurno();
    const enUrl = new URLSearchParams(location.hash.split("?")[1] || "").get("tab");
    mostrar(enUrl === "gastos" ? "gastos" : "turnos");

    App.alSalir = () => Formulario.cerrar();
  }

  // ===================== Turno actual =====================
  async function cargarTurno() {
    const tarjeta = document.getElementById("tarjeta-turno");
    if (!tarjeta) return;
    let resumen;
    try {
      resumen = await API.get("/api/caja/turnos/actual");
    } catch (error) {
      tarjeta.innerHTML = `<div class="vacio"><i class="bi bi-exclamation-triangle"></i>${UI.escapar(error.message)}</div>`;
      return;
    }

    if (!resumen) {
      tarjeta.innerHTML = `
        <div class="d-flex flex-wrap align-items-center gap-3">
          <div class="icono-dialogo info m-0" style="width:56px;height:56px;font-size:1.5rem"><i class="bi bi-cash-stack"></i></div>
          <div class="me-auto">
            <h3 class="tarjeta-titulo">No tienes un turno de caja abierto</h3>
            <div class="small text-secondary">Abre tu turno para poder vender y registrar gastos de caja.</div>
          </div>
          <button class="btn btn-primary" data-abrir><i class="bi bi-unlock me-1"></i>Abrir turno</button>
        </div>`;
      tarjeta.querySelector("[data-abrir]").addEventListener("click", abrirTurno);
      return;
    }

    const t = resumen.turno;
    tarjeta.innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div class="me-auto">
          <h3 class="tarjeta-titulo">Turno abierto en ${UI.escapar(t.ubicacion.nombre)}</h3>
          <div class="small text-secondary">Desde ${UI.fechaHora(t.fecha_apertura)} · ${resumen.cantidad_ventas} ventas</div>
        </div>
        <button class="btn btn-vidrio" data-refrescar title="Actualizar"><i class="bi bi-arrow-clockwise"></i></button>
        <button class="btn btn-peligro" data-cerrar><i class="bi bi-lock me-1"></i>Cerrar turno</button>
      </div>
      <div class="resumen-turno">
        ${dato("Fondo inicial", UI.moneda(t.fondo_inicial, moneda()))}
        ${dato("Ventas en efectivo", UI.moneda(resumen.ventas_efectivo, moneda()))}
        ${dato("Ventas con otros pagos", UI.moneda(resumen.ventas_otros_pagos, moneda()))}
        ${dato("Gastos de caja", UI.moneda(resumen.gastos_de_caja, moneda()))}
        ${dato("Efectivo esperado", UI.moneda(resumen.efectivo_esperado, moneda()), true)}
      </div>`;
    tarjeta.querySelector("[data-refrescar]").addEventListener("click", cargarTurno);
    tarjeta.querySelector("[data-cerrar]").addEventListener("click", () => cerrarTurno(resumen));
  }

  function abrirTurno() {
    Formulario.abrir({
      titulo: "Abrir turno de caja",
      icono: "bi-unlock",
      textoGuardar: "Abrir turno",
      valores: { fondo_inicial: 0 },
      campos: [
        { nombre: "fondo_inicial", etiqueta: "Fondo inicial", tipo: "numero", requerido: true, min: 0, prefijo: moneda(),
          ayuda: "Efectivo con el que empieza la caja (para dar vuelto)" },
        { nombre: "observaciones", etiqueta: "Observaciones", tipo: "area", filas: 2 },
      ],
      alGuardar: async (datos) => {
        await API.post("/api/caja/turnos/abrir", datos);
        UI.aviso("Turno de caja abierto");
        cargarTurno();
        if (tabla) tabla.recargar();
      },
    });
  }

  function cerrarTurno(resumen) {
    Formulario.abrir({
      titulo: "Cerrar turno de caja",
      icono: "bi-lock",
      textoGuardar: "Cerrar turno",
      peligro: true,
      campos: [
        { nombre: "total_contado", etiqueta: "Efectivo contado", tipo: "numero", requerido: true, min: 0, prefijo: moneda(),
          ayuda: `Cuenta el efectivo de la caja. El sistema espera ${UI.moneda(resumen.efectivo_esperado, moneda())}.` },
        { nombre: "observaciones", etiqueta: "Observaciones", tipo: "area", filas: 2 },
      ],
      alGuardar: async (datos) => {
        const turno = await API.post("/api/caja/turnos/cerrar", datos);
        const diferencia = Number(turno.diferencia);
        cargarTurno();
        if (tabla) tabla.recargar();
        setTimeout(() => {
          if (diferencia === 0) {
            UI.alerta({ tipo: "exito", titulo: "Cuadre exacto", mensaje: "El efectivo contado coincide con lo esperado." });
          } else if (diferencia < 0) {
            UI.alerta({ tipo: "advertencia", titulo: "Faltante en caja",
              mensaje: `Faltan ${UI.moneda(Math.abs(diferencia), moneda())} respecto a lo esperado.` });
          } else {
            UI.alerta({ tipo: "info", titulo: "Sobrante en caja",
              mensaje: `Sobran ${UI.moneda(diferencia, moneda())} respecto a lo esperado.` });
          }
        }, 400);
      },
    });
  }

  // ===================== Pestañas =====================
  function mostrar(pestana) {
    history.replaceState(null, "", `#/caja?tab=${pestana}`);
    document.querySelectorAll("#pestanas-caja [data-tab]").forEach((b) =>
      b.classList.toggle("activa", b.dataset.tab === pestana));
    if (pestana === "gastos") tablaGastos();
    else tablaTurnos();
  }

  function tablaTurnos() {
    tabla = new TablaPaginada({
      contenedor: document.getElementById("tabla-caja"),
      url: "/api/caja/turnos",
      buscador: false,
      filtroActivo: false,
      vacio: "Todavía no hay turnos de caja",
      botones: TablaPaginada.filtrosFecha(),
      parametros: (t) => ({ desde: t.filtro("desde"), hasta: t.filtro("hasta") }),
      columnas: [
        { titulo: "Apertura", clase: "text-nowrap", render: (f) => UI.fechaHora(f.fecha_apertura) },
        { titulo: "Cierre", clase: "text-nowrap", render: (f) => f.fecha_cierre ? UI.fechaHora(f.fecha_cierre) : "—" },
        { titulo: "Usuario", render: (f) => UI.escapar(f.usuario.nombre_usuario) },
        { titulo: "Ubicación", render: (f) => UI.escapar(f.ubicacion.nombre) },
        { titulo: "Fondo", clase: "text-end", render: (f) => UI.moneda(f.fondo_inicial, moneda()) },
        { titulo: "Esperado", clase: "text-end", render: (f) => f.total_esperado != null ? UI.moneda(f.total_esperado, moneda()) : "—" },
        { titulo: "Contado", clase: "text-end", render: (f) => f.total_contado != null ? UI.moneda(f.total_contado, moneda()) : "—" },
        { titulo: "Diferencia", clase: "text-end", render: (f) => {
            if (f.diferencia == null) return "—";
            const d = Number(f.diferencia);
            const color = d === 0 ? "text-success" : d < 0 ? "text-danger" : "text-info";
            return `<span class="fw-bold ${color}">${d > 0 ? "+" : ""}${UI.moneda(d, moneda())}</span>`;
          } },
        { titulo: "Estado", render: (f) => f.estado === "Abierto"
            ? `<span class="badge text-bg-info">Abierto</span>`
            : `<span class="badge estado-badge inactivo">Cerrado</span>` },
      ],
    });
  }

  function tablaGastos() {
    tabla = new TablaPaginada({
      contenedor: document.getElementById("tabla-caja"),
      url: "/api/caja/gastos",
      filtroActivo: false,
      textoBuscar: "Buscar por concepto...",
      vacio: "Todavía no hay gastos registrados",
      botones: `${TablaPaginada.filtrosFecha()}${Formulario.botonNuevo("Nuevo gasto")}`,
      parametros: (t) => ({ desde: t.filtro("desde"), hasta: t.filtro("hasta") }),
      claseFila: (f) => (f.anulado ? "fila-inactiva" : ""),
      columnas: [
        { titulo: "Fecha", clase: "text-nowrap", render: (f) => UI.fechaHora(f.fecha) },
        { titulo: "Concepto", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.concepto)}</div>
            ${f.observaciones ? `<div class="descripcion-fila">${UI.escapar(f.observaciones)}</div>` : ""}` },
        { titulo: "Monto", clase: "text-end", render: (f) => `<span class="fw-bold">${UI.moneda(f.monto, moneda())}</span>` },
        { titulo: "Pagado con", render: (f) => f.de_caja
            ? `<span class="badge text-bg-info">Efectivo de caja</span>`
            : `<span class="badge estado-badge inactivo">Fuera de caja</span>` },
        { titulo: "Usuario", render: (f) => UI.escapar(f.usuario.nombre_usuario) },
        { titulo: "Estado", render: (f) => f.anulado
            ? `<span class="badge text-bg-danger">Anulado</span>`
            : `<span class="badge estado-badge activo">Vigente</span>` },
      ],
      acciones: (f) => f.anulado ? "" : `
        <button class="btn-accion peligro" data-accion="anular" title="Anular"><i class="bi bi-x-octagon"></i></button>`,
      alAccionar: (accion, f) => {
        if (accion === "anular") anularGasto(f);
      },
    });
    document.querySelector("#tabla-caja [data-nuevo]").addEventListener("click", nuevoGasto);
  }

  function nuevoGasto() {
    Formulario.abrir({
      titulo: "Nuevo gasto",
      icono: "bi-receipt-cutoff",
      valores: { de_caja: true },
      campos: [
        { nombre: "concepto", etiqueta: "Concepto", requerido: true, max: 150, placeholder: "Ej: Pago de luz, papelería" },
        { nombre: "monto", etiqueta: "Monto", tipo: "numero", requerido: true, min: 0.01, prefijo: moneda() },
        { nombre: "de_caja", etiqueta: "Se pagó con el efectivo de mi turno de caja", tipo: "checkbox",
          ayuda: "Si está activo, se descuenta del efectivo esperado al cerrar el turno." },
        { nombre: "observaciones", etiqueta: "Observaciones", tipo: "area", filas: 2 },
      ],
      alGuardar: async (datos) => {
        await API.post("/api/caja/gastos", datos);
        UI.aviso(`Se registró el gasto '${datos.concepto.trim()}'`);
        tabla.recargar();
        cargarTurno();
      },
    });
  }

  function anularGasto(gasto) {
    Formulario.pedirMotivo({
      titulo: `Anular gasto: ${gasto.concepto}`,
      mensaje: "El gasto no se borra: queda como anulado para que haya constancia.",
      alGuardar: async (datos) => {
        const respuesta = await API.patch(`/api/caja/gastos/${gasto.id}/anular`, datos);
        UI.aviso(respuesta.mensaje);
        tabla.recargar();
        cargarTurno();
      },
    });
  }

  App.registrar("caja", { render });
})();