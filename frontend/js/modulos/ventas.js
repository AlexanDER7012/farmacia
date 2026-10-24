(() => {
  const moneda = () => App.config.moneda || "Q";

  const badgeEstado = (estado) => estado === "Completada"
    ? `<span class="badge estado-badge activo">Completada</span>`
    : `<span class="badge text-bg-danger">Anulada</span>`;

  function render(contenedor) {
    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-ventas"></div></div>`;

    const tabla = new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-ventas"),
      url: "/api/ventas",
      filtroActivo: false,
      textoBuscar: "Buscar por cliente o NIT...",
      vacio: "Todavía no hay ventas",
      botones: `
        <select class="form-select filtro" data-filtro="estado" title="Estado">
          <option value="">Todas</option>
          <option value="Completada">Completadas</option>
          <option value="Anulada">Anuladas</option>
        </select>
        ${TablaPaginada.filtrosFecha()}`,
      parametros: (t) => ({ estado: t.filtro("estado"), desde: t.filtro("desde"), hasta: t.filtro("hasta") }),
      claseFila: (f) => (f.estado === "Anulada" ? "fila-inactiva" : ""),
      columnas: [
        { titulo: "No.", render: (f) => `<span class="fw-bold">${f.id}</span>` },
        { titulo: "Fecha", clase: "text-nowrap", render: (f) => UI.fechaHora(f.fecha) },
        { titulo: "Cliente", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.cliente.nombre)}</div>
            <div class="descripcion-fila">NIT ${UI.escapar(f.nit)}</div>` },
        { titulo: "Pago", render: (f) => UI.escapar(f.tipo_pago.nombre) },
        { titulo: "Vendedor", render: (f) => UI.escapar(f.usuario.nombre_usuario) },
        { titulo: "Total", clase: "text-end", render: (f) => `<span class="fw-bold">${UI.moneda(f.total, moneda())}</span>` },
        { titulo: "Estado", render: (f) => badgeEstado(f.estado) },
      ],
      acciones: (f) => `
        <button class="btn-accion" data-accion="ver" title="Ver detalle"><i class="bi bi-eye"></i></button>
        ${f.estado === "Completada"
          ? `<button class="btn-accion peligro" data-accion="anular" title="Anular venta"><i class="bi bi-x-octagon"></i></button>`
          : ""}`,
      alAccionar: (accion, f) => {
        if (accion === "ver") ver(f.id);
        if (accion === "anular") anular(f.id);
      },
    });

    // ===================== Detalle =====================
    async function ver(idVenta) {
      let venta;
      try {
        venta = await API.get(`/api/ventas/${idVenta}`);
      } catch (error) {
        UI.error(error);
        return;
      }
      const botones = [{ accion: "imprimir", texto: "Imprimir", icono: "bi-printer" }];
      if (venta.estado === "Completada") {
        botones.unshift({ accion: "anular", texto: "Anular venta", icono: "bi-x-octagon", clase: "btn-peligro" });
      }
      Formulario.mostrar({
        titulo: `Venta No. ${venta.id}`,
        icono: "bi-receipt",
        cuerpo: detalleHtml(venta),
        botones,
        alAccionar: (accion) => {
          if (accion === "imprimir") imprimir(venta);
          if (accion === "anular") anular(venta.id);
        },
      });
    }

    function detalleHtml(v) {
      const dato = (etiqueta, valor) => `<div><div class="etq">${etiqueta}</div><div class="val">${valor}</div></div>`;
      return `
        <div class="info-detalle">
          ${dato("Fecha", UI.fechaHora(v.fecha))}
          ${dato("Cliente", UI.escapar(v.cliente.nombre))}
          ${dato("NIT", UI.escapar(v.nit))}
          ${dato("Forma de pago", UI.escapar(v.tipo_pago.nombre))}
          ${dato("Vendedor", UI.escapar(v.usuario.nombre_usuario))}
          ${dato("Ubicación", UI.escapar(v.ubicacion.nombre))}
          ${dato("Estado", badgeEstado(v.estado))}
        </div>
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr><th>Producto</th><th>Lote</th><th class="text-end">Cant.</th><th class="text-end">Precio</th><th class="text-end">Subtotal</th></tr>
            </thead>
            <tbody>
              ${v.detalles.map((d) => `
                <tr>
                  <td class="fw-semibold">${UI.escapar(d.producto.nombre)}</td>
                  <td>${UI.escapar(d.lote.numero_lote)}</td>
                  <td class="text-end">${UI.numero(d.cantidad)}</td>
                  <td class="text-end">${UI.moneda(d.precio_unitario, moneda())}</td>
                  <td class="text-end">${UI.moneda(d.subtotal, moneda())}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="totales mt-3">
          <div class="fila"><span>Subtotal</span><span>${UI.moneda(v.subtotal, moneda())}</span></div>
          <div class="fila"><span>Descuento</span><span>− ${UI.moneda(v.descuento, moneda())}</span></div>
          <div class="fila total"><span>Total</span><span>${UI.moneda(v.total, moneda())}</span></div>
        </div>
        ${v.observaciones ? `<p class="small mt-3 mb-0"><strong>Observaciones:</strong> ${UI.escapar(v.observaciones)}</p>` : ""}
        ${v.estado === "Anulada"
          ? `<div class="alert alert-danger rounded-4 mt-3 mb-0"><strong>Anulada:</strong> ${UI.escapar(v.motivo_anulacion || "")}</div>`
          : ""}`;
    }

    // ===================== Anular =====================
    function anular(idVenta) {
      Formulario.pedirMotivo({
        titulo: `Anular venta No. ${idVenta}`,
        mensaje: "Los productos regresan al inventario. La venta no se borra: queda como anulada.",
        textoGuardar: "Anular venta",
        alGuardar: async (datos) => {
          await API.patch(`/api/ventas/${idVenta}/anular`, datos);
          UI.aviso(`Se anuló la venta No. ${idVenta} y el stock regresó al inventario`);
          tabla.recargar();
        },
      });
    }

    // ===================== Imprimir comprobante =====================
    function imprimir(v) {
      const filas = v.detalles.map((d) => `
        <tr>
          <td>${UI.escapar(d.producto.nombre)}<br><small>Lote ${UI.escapar(d.lote.numero_lote)}</small></td>
          <td class="der">${UI.numero(d.cantidad)}</td>
          <td class="der">${UI.moneda(d.subtotal, moneda())}</td>
        </tr>`).join("");

      Formulario.imprimir(`<!doctype html><html lang="es"><head><meta charset="utf-8">
        <title>Venta No. ${v.id}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; max-width: 320px; }
          h1 { font-size: 16px; margin: 0 0 4px; text-align: center; }
          .centro { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          td, th { padding: 4px 0; border-bottom: 1px dashed #999; vertical-align: top; }
          .der { text-align: right; }
          .total { font-size: 14px; font-weight: bold; }
        </style></head><body>
        <h1>${UI.escapar(App.config.nombre_negocio)}</h1>
        <div class="centro">${UI.escapar(App.config.direccion || "")}</div>
        <div class="centro">${App.config.nit ? `NIT ${UI.escapar(App.config.nit)}` : ""}</div>
        <hr>
        <div><strong>Venta No. ${v.id}</strong> · ${UI.fechaHora(v.fecha)}</div>
        <div>Cliente: ${UI.escapar(v.cliente.nombre)} · NIT ${UI.escapar(v.nit)}</div>
        <div>Pago: ${UI.escapar(v.tipo_pago.nombre)}</div>
        ${v.estado === "Anulada" ? `<div class="total centro">*** VENTA ANULADA ***</div>` : ""}
        <table>
          <thead><tr><th>Producto</th><th class="der">Cant.</th><th class="der">Subtotal</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="der">Subtotal: ${UI.moneda(v.subtotal, moneda())}</div>
        <div class="der">Descuento: ${UI.moneda(v.descuento, moneda())}</div>
        <div class="der total">Total: ${UI.moneda(v.total, moneda())}</div>
        <p class="centro">¡Gracias por su compra!</p>
        </body></html>`);
    }

    App.alSalir = () => Formulario.cerrar();
  }

  App.registrar("ventas", { render });
})();