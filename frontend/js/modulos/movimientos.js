(() => {
  const ORIGENES = {
    Manual: "text-bg-secondary",
    Ajuste: "text-bg-warning",
    Compra: "text-bg-info",
    Venta: "text-bg-primary",
  };

  async function render(contenedor) {
    const puedeMover = App.tiene(ROLES.BODEGUERO);
    const ubicaciones = await API.get("/api/ubicaciones/opciones");

    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-movimientos"></div></div>`;

    const tabla = new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-movimientos"),
      url: "/api/inventario/movimientos",
      filtroActivo: false,
      porPagina: 50,
      textoBuscar: "Buscar por producto, código o lote...",
      vacio: "Todavía no hay movimientos de inventario",
      botones: `
        <select class="form-select filtro" data-filtro="ubicacion" title="Ubicación">
          <option value="">Todas las ubicaciones</option>
          ${ubicaciones.map((u) => `<option value="${u.id}">${UI.escapar(u.nombre)}</option>`).join("")}
        </select>
        ${TablaPaginada.filtrosFecha()}
        ${puedeMover ? Formulario.botonNuevo("Nuevo movimiento") : ""}`,
      parametros: (t) => ({ id_ubicacion: t.filtro("ubicacion"), desde: t.filtro("desde"), hasta: t.filtro("hasta") }),
      columnas: [
        { titulo: "Fecha", clase: "text-nowrap", render: (f) => UI.fechaHora(f.fecha) },
        { titulo: "Producto", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.producto)}</div>
            <div class="descripcion-fila">${UI.escapar(f.codigo)} · Lote ${UI.escapar(f.numero_lote)}</div>` },
        { titulo: "Ubicación", render: (f) => UI.escapar(f.ubicacion) },
        { titulo: "Movimiento", clase: "text-end text-nowrap", render: (f) => f.tipo === "Entrada"
            ? `<span class="fw-bold text-success">+${UI.numero(f.cantidad)}</span>`
            : `<span class="fw-bold text-danger">−${UI.numero(f.cantidad)}</span>` },
        { titulo: "Origen", render: (f) => `<span class="badge ${ORIGENES[f.origen] || "text-bg-secondary"}">${UI.escapar(f.origen)}</span>` },
        { titulo: "Detalle", clase: "celda-detalle", render: (f) => `
            ${f.referencia ? `<div class="fw-semibold">${UI.escapar(f.referencia)}</div>` : ""}
            ${f.observaciones ? `<div class="small text-secondary">${UI.escapar(f.observaciones)}</div>` : ""}
            ${!f.referencia && !f.observaciones ? "—" : ""}` },
        { titulo: "Usuario", render: (f) => UI.escapar(f.usuario) },
      ],
    });

    contenedor.querySelector("[data-nuevo]")?.addEventListener("click", nuevo);

    function nuevo() {
      let lotesDelProducto = [];

      Formulario.abrir({
        titulo: "Nuevo movimiento manual",
        icono: "bi-arrow-left-right",
        ancho: "modal-lg",
        textoGuardar: "Registrar",
        valores: { tipo: "Entrada", id_ubicacion: App.config.ubicacion_defecto?.id },
        campos: [
          { nombre: "tipo", etiqueta: "Tipo", tipo: "select", requerido: true, sinVacio: true, columnas: 6,
            opciones: [{ valor: "Entrada", texto: "Entrada (suma al stock)" }, { valor: "Salida", texto: "Salida (resta del stock)" }] },
          { nombre: "id_ubicacion", etiqueta: "Ubicación", tipo: "select", requerido: true, numerico: true, columnas: 6,
            opciones: ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre })) },
          { nombre: "id_producto", etiqueta: "Producto", tipo: "buscar", requerido: true,
            url: "/api/consultas/productos", parametros: { activo: true },
            placeholder: "Escribe el nombre o código del producto...",
            texto: (p) => `${p.codigo} - ${p.nombre}`,
            mostrar: (p) => `
              <div class="fw-semibold">${UI.escapar(p.nombre)}</div>
              <div class="small text-secondary">${UI.escapar(p.codigo)} · stock total ${UI.numero(p.stock_total)}</div>`,
            alElegir: async (producto, form) => {
              try {
                const r = await API.get("/api/inventario/lotes", { id_producto: producto.id, por_pagina: 50 });
                lotesDelProducto = r.items;
                form.querySelector("#dl-numero_lote").innerHTML = lotesDelProducto.map((l) => `
                  <option value="${UI.escapar(l.numero_lote)}">Vence ${UI.fecha(l.fecha_vencimiento)} · stock ${UI.numero(l.stock)}</option>`).join("");
              } catch { lotesDelProducto = []; }
            } },
          { nombre: "numero_lote", etiqueta: "Número de lote", requerido: true, max: 50, columnas: 6, lista: true,
            ayuda: "Elige uno de la lista o escribe uno nuevo (solo en entradas)" },
          { nombre: "fecha_vencimiento", etiqueta: "Fecha de vencimiento", tipo: "fecha", columnas: 6,
            ayuda: "Solo si es un lote nuevo" },
          { nombre: "cantidad", etiqueta: "Cantidad", tipo: "numero", requerido: true, min: 0.01, columnas: 6 },
          { nombre: "referencia", etiqueta: "Referencia", max: 100, columnas: 6, placeholder: "Ej: Donación, muestra médica" },
          { nombre: "observaciones", etiqueta: "Motivo", tipo: "area", requerido: true, filas: 2,
            placeholder: "¿Por qué se hace este movimiento?" },
        ],
        alAbrir: (form) => {
          // La fecha de vencimiento solo aplica a las entradas
          const columnaFecha = form.elements.fecha_vencimiento.closest('[class*="col-"]');
          const actualizar = () => columnaFecha.classList.toggle("d-none", form.elements.tipo.value === "Salida");
          form.elements.tipo.addEventListener("change", actualizar);
          actualizar();

          // Si eligen un lote que ya existe, se llena su fecha de vencimiento
          form.elements.numero_lote.addEventListener("change", () => {
            const lote = lotesDelProducto.find(
              (l) => l.numero_lote.toUpperCase() === form.elements.numero_lote.value.trim().toUpperCase());
            if (lote) form.elements.fecha_vencimiento.value = lote.fecha_vencimiento;
          });
        },
        alGuardar: async (datos) => {
          if (datos.tipo === "Salida") datos.fecha_vencimiento = null;
          const respuesta = await API.post("/api/inventario/movimientos", datos);
          UI.aviso(respuesta.mensaje);
          tabla.recargar();
        },
      });
    }

    App.alSalir = () => Formulario.cerrar();
  }

  App.registrar("movimientos", { render });
})();