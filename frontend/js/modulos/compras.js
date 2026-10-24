(() => {
  const moneda = () => App.config.moneda || "Q";
  const ivaPorcentaje = () => Number(App.config.iva_porcentaje ?? 12);

  const badgeEstado = (estado) => ({
    Pendiente: `<span class="badge text-bg-warning">Pendiente</span>`,
    Recibida: `<span class="badge estado-badge activo">Recibida</span>`,
    Cancelada: `<span class="badge text-bg-danger">Cancelada</span>`,
  }[estado] || `<span class="badge text-bg-secondary">${UI.escapar(estado)}</span>`);

  const badgePago = (estado) => estado === "Pagada"
    ? `<span class="badge estado-badge activo">Pagada</span>`
    : `<span class="badge text-bg-warning">Por pagar</span>`;

  const nombreCompra = (c) => (c.numero_factura ? `la factura ${c.numero_factura}` : `la compra a ${c.proveedor.nombre}`);

  /** Separa el IVA de un total que ya lo incluye */
  function calcularTotales(total) {
    const iva = total - total / (1 + ivaPorcentaje() / 100);
    return { total, iva, subtotal: total - iva };
  }

  async function render(contenedor) {
    const puedeEditar = App.tiene(ROLES.BODEGUERO);
    const [proveedores, ubicaciones] = await Promise.all([
      API.get("/api/proveedores/opciones"),
      API.get("/api/ubicaciones/opciones"),
    ]);

    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-compras"></div></div>`;

    // ===================== Listado =====================
    const tabla = new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-compras"),
      url: "/api/compras",
      filtroActivo: false,
      textoBuscar: "Buscar por factura o proveedor...",
      vacio: "Todavía no hay compras registradas",
      botones: `
        <select class="form-select filtro" data-filtro="estado" title="Estado">
          <option value="">Todos los estados</option>
          <option value="Pendiente">Pendientes</option>
          <option value="Recibida">Recibidas</option>
          <option value="Cancelada">Canceladas</option>
        </select>
        <select class="form-select filtro" data-filtro="pago" title="Pago">
          <option value="">Pagadas y por pagar</option>
          <option value="Pendiente">Por pagar</option>
          <option value="Pagada">Pagadas</option>
        </select>
        ${TablaPaginada.filtrosFecha()}
        ${puedeEditar ? Formulario.botonNuevo("Nueva compra") : ""}`,
      parametros: (t) => ({
        estado: t.filtro("estado"), estado_pago: t.filtro("pago"),
        desde: t.filtro("desde"), hasta: t.filtro("hasta"),
      }),
      claseFila: (f) => (f.estado === "Cancelada" ? "fila-inactiva" : ""),
      columnas: [
        { titulo: "Fecha", clase: "text-nowrap", render: (f) => UI.fechaHora(f.fecha) },
        { titulo: "Factura", render: (f) => f.numero_factura
            ? `<span class="fw-semibold">${UI.escapar(f.numero_factura)}</span>`
            : `<span class="text-secondary">Sin factura</span>` },
        { titulo: "Proveedor", render: (f) => UI.escapar(f.proveedor.nombre) },
        { titulo: "Destino", render: (f) => UI.escapar(f.ubicacion.nombre) },
        { titulo: "Total", clase: "text-end", render: (f) => `<span class="fw-bold">${UI.moneda(f.total, moneda())}</span>` },
        { titulo: "Estado", render: (f) => badgeEstado(f.estado) },
        { titulo: "Pago", render: (f) => (f.estado === "Cancelada" ? "—" : badgePago(f.estado_pago)) },
      ],
      acciones: (f) => `
        <button class="btn-accion" data-accion="ver" title="Ver detalle"><i class="bi bi-eye"></i></button>
        ${puedeEditar && f.estado === "Pendiente"
          ? `<button class="btn-accion" data-accion="recibir" title="Recibir mercadería"><i class="bi bi-box-arrow-in-down"></i></button>` : ""}
        ${puedeEditar && f.estado !== "Cancelada" && f.estado_pago === "Pendiente"
          ? `<button class="btn-accion" data-accion="pagar" title="Marcar como pagada"><i class="bi bi-cash"></i></button>` : ""}
        ${puedeEditar && f.estado !== "Cancelada"
          ? `<button class="btn-accion peligro" data-accion="cancelar" title="Cancelar compra"><i class="bi bi-x-octagon"></i></button>` : ""}`,
      alAccionar: (accion, f) => {
        if (accion === "ver") ver(f.id);
        if (accion === "recibir") recibir(f);
        if (accion === "pagar") pagar(f);
        if (accion === "cancelar") cancelar(f);
      },
    });

    contenedor.querySelector("[data-nuevo]")?.addEventListener("click", nueva);

    // ===================== Nueva compra =====================
    function nueva() {
      const lineas = [];
      let productoElegido = null;
      let lotesDelProducto = [];

      const campoProducto = {
        nombre: "id_producto", etiqueta: "Producto", tipo: "buscar", requerido: true, columnas: 4,
        url: "/api/consultas/productos", parametros: { activo: true },
        placeholder: "Nombre o código del producto...",
        texto: (p) => `${p.codigo} - ${p.nombre}`,
        mostrar: (p) => `
          <div class="fw-semibold">${UI.escapar(p.nombre)}</div>
          <div class="small text-secondary">${UI.escapar(p.codigo)} · costo ${UI.moneda(p.precio_compra, moneda())} · stock ${UI.numero(p.stock_total)}</div>`,
        alElegir: async (producto, form) => {
          productoElegido = producto;
          form.elements.costo_unitario.value = Number(producto.precio_compra).toFixed(2);
          try {
            const r = await API.get("/api/inventario/lotes", { id_producto: producto.id, por_pagina: 50 });
            lotesDelProducto = r.items;
          } catch {
            lotesDelProducto = [];
          }
          form.querySelector("#dl-numero_lote").innerHTML = lotesDelProducto.map((l) => `
            <option value="${UI.escapar(l.numero_lote)}">Vence ${UI.fecha(l.fecha_vencimiento)} · stock ${UI.numero(l.stock)}</option>`).join("");
          form.elements.numero_lote.focus();
        },
      };

      const camposLinea = [
        campoProducto,
        { nombre: "numero_lote", etiqueta: "Lote", requerido: true, max: 50, columnas: 2, lista: true, placeholder: "Ej: L2026-01" },
        { nombre: "fecha_vencimiento", etiqueta: "Vence", tipo: "fecha", requerido: true, columnas: 2 },
        { nombre: "cantidad", etiqueta: "Cantidad", tipo: "numero", requerido: true, min: 0.01, columnas: 1 },
        { nombre: "costo_unitario", etiqueta: "Costo unitario", tipo: "numero", requerido: true, min: 0, prefijo: moneda(), columnas: 2 },
      ];

      const opciones = (lista, elegido) => lista.map((r) => `
        <option value="${r.id}" ${r.id === elegido ? "selected" : ""}>${UI.escapar(r.nombre)}</option>`).join("");

      const modal = Formulario._modal();
      modal.querySelector(".modal-dialog").className = "modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl";
      modal.querySelector(".modal-content").innerHTML = `
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi bi-bag-plus me-2"></i>Nueva compra</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <form id="cabecera-compra" class="row g-3" novalidate>
            <div class="col-12"><div class="alert alert-danger rounded-4 error-general d-none mb-0" role="alert"></div></div>
            <div class="col-md-4">
              <label class="form-label" for="c-proveedor">Proveedor <span class="text-danger">*</span></label>
              <select class="form-select" id="c-proveedor" name="id_proveedor" data-tipo="numero">
                <option value="">Selecciona el proveedor...</option>
                ${opciones(proveedores)}
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label" for="c-ubicacion">Entra a <span class="text-danger">*</span></label>
              <select class="form-select" id="c-ubicacion" name="id_ubicacion" data-tipo="numero">
                <option value="">Selecciona...</option>
                ${opciones(ubicaciones, App.config.ubicacion_defecto?.id)}
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label" for="c-factura">No. de factura</label>
              <input class="form-control" id="c-factura" name="numero_factura" maxlength="50" placeholder="Ej: A-1520">
            </div>
            <div class="col-md-3">
              <label class="form-label" for="c-observaciones">Observaciones</label>
              <input class="form-control" id="c-observaciones" name="observaciones" placeholder="Opcional">
            </div>
          </form>

          <div class="seccion-formulario mt-4"><i class="bi bi-plus-circle me-2"></i>Agregar producto</div>
          <form id="linea-compra" class="row g-2 align-items-end" novalidate>
            ${camposLinea.map((c) => Formulario._campoHtml(c, "")).join("")}
            <div class="col-md-1 d-grid">
              <button type="submit" class="btn btn-acento" title="Agregar a la lista"><i class="bi bi-plus-lg"></i></button>
            </div>
          </form>

          <div class="table-responsive mt-3">
            <table class="table align-middle">
              <thead>
                <tr>
                  <th>Producto</th><th>Lote</th><th>Vence</th>
                  <th class="text-end">Cantidad</th><th class="text-end">Costo</th><th class="text-end">Subtotal</th><th></th>
                </tr>
              </thead>
              <tbody id="lineas-compra"></tbody>
            </table>
          </div>
          <div class="totales" id="totales-compra"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-vidrio" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-primary" id="guardar-compra"><i class="bi bi-check2 me-1"></i>Guardar compra</button>
        </div>`;

      const cabecera = modal.querySelector("#cabecera-compra");
      const formLinea = modal.querySelector("#linea-compra");
      const cuerpoLineas = modal.querySelector("#lineas-compra");
      const cajaTotales = modal.querySelector("#totales-compra");
      const botonGuardar = modal.querySelector("#guardar-compra");
      const instancia = bootstrap.Modal.getOrCreateInstance(modal);

      Formulario._prepararBuscadores(formLinea, camposLinea);

      // Si eligen un lote que ya existe, se llena su fecha de vencimiento
      formLinea.elements.numero_lote.addEventListener("change", () => {
        const lote = lotesDelProducto.find(
          (l) => l.numero_lote.toUpperCase() === formLinea.elements.numero_lote.value.trim().toUpperCase());
        if (lote) formLinea.elements.fecha_vencimiento.value = lote.fecha_vencimiento;
      });

      function pintarLineas() {
        if (!lineas.length) {
          cuerpoLineas.innerHTML = `<tr><td colspan="7"><div class="vacio py-3"><i class="bi bi-cart"></i>Agrega los productos de la factura</div></td></tr>`;
        } else {
          cuerpoLineas.innerHTML = lineas.map((l, i) => `
            <tr>
              <td><div class="fw-semibold">${UI.escapar(l.producto)}</div><div class="descripcion-fila">${UI.escapar(l.codigo)}</div></td>
              <td>${UI.escapar(l.numero_lote)}</td>
              <td class="text-nowrap">${UI.fecha(l.fecha_vencimiento)}</td>
              <td class="text-end">${UI.numero(l.cantidad)}</td>
              <td class="text-end">${UI.moneda(l.costo_unitario, moneda())}</td>
              <td class="text-end fw-semibold">${UI.moneda(l.cantidad * l.costo_unitario, moneda())}</td>
              <td class="text-end">
                <button type="button" class="btn-accion peligro" data-quitar="${i}" title="Quitar"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`).join("");
        }
        const total = lineas.reduce((suma, l) => suma + Math.round(l.cantidad * l.costo_unitario * 100) / 100, 0);
        const t = calcularTotales(total);
        cajaTotales.innerHTML = `
          <div class="fila"><span>Subtotal (sin IVA)</span><span>${UI.moneda(t.subtotal, moneda())}</span></div>
          <div class="fila"><span>IVA ${ivaPorcentaje()}% incluido</span><span>${UI.moneda(t.iva, moneda())}</span></div>
          <div class="fila total"><span>Total</span><span>${UI.moneda(t.total, moneda())}</span></div>`;
      }

      cuerpoLineas.addEventListener("click", (e) => {
        const boton = e.target.closest("[data-quitar]");
        if (!boton) return;
        lineas.splice(Number(boton.dataset.quitar), 1);
        pintarLineas();
      });

      // Agregar una línea (con el botón + o con Enter)
      formLinea.addEventListener("submit", (e) => {
        e.preventDefault();
        UI.limpiarErrores(formLinea);
        const d = UI.leerFormulario(formLinea);
        const errores = {};

        if (!d.id_producto) errores.id_producto = "Busca y elige el producto";
        if (!d.numero_lote || !d.numero_lote.trim()) errores.numero_lote = "Escribe el lote";
        if (!d.fecha_vencimiento) errores.fecha_vencimiento = "Indica el vencimiento";
        else if (d.fecha_vencimiento <= UI.hoyISO()) errores.fecha_vencimiento = "Debe ser posterior a hoy";
        if (!(d.cantidad > 0)) errores.cantidad = "Mayor a 0";
        if (d.costo_unitario === null || d.costo_unitario < 0) errores.costo_unitario = "No puede ser negativo";

        const lote = (d.numero_lote || "").trim().replace(/\s+/g, " ").toUpperCase();
        if (!errores.numero_lote && lineas.some((l) => l.id_producto === d.id_producto && l.numero_lote === lote)) {
          errores.numero_lote = "Ese lote ya está en la lista";
        }
        const existente = lotesDelProducto.find((l) => l.numero_lote.toUpperCase() === lote);
        if (!errores.fecha_vencimiento && existente && existente.fecha_vencimiento !== d.fecha_vencimiento) {
          errores.fecha_vencimiento = `Ese lote ya existe y vence el ${UI.fecha(existente.fecha_vencimiento)}`;
        }

        if (Object.keys(errores).length) {
          UI.mostrarErrores(formLinea, { campos: errores });
          return;
        }

        lineas.push({
          id_producto: d.id_producto,
          producto: productoElegido.nombre,
          codigo: productoElegido.codigo,
          numero_lote: lote,
          fecha_vencimiento: d.fecha_vencimiento,
          cantidad: d.cantidad,
          costo_unitario: d.costo_unitario,
        });

        formLinea.reset();
        formLinea.querySelector("#dl-numero_lote").innerHTML = "";
        productoElegido = null;
        lotesDelProducto = [];
        pintarLineas();
        formLinea.querySelector('[data-buscar] input[type="text"]').focus();
      });

      // Guardar la compra
      botonGuardar.addEventListener("click", async () => {
        UI.limpiarErrores(cabecera);
        const datos = UI.leerFormulario(cabecera);
        const errores = {};
        if (!datos.id_proveedor) errores.id_proveedor = "Elige el proveedor";
        if (!datos.id_ubicacion) errores.id_ubicacion = "Elige a dónde entra la mercadería";
        if (Object.keys(errores).length) {
          UI.mostrarErrores(cabecera, { campos: errores });
          return;
        }
        if (!lineas.length) {
          UI.alerta({ tipo: "advertencia", titulo: "Faltan productos", mensaje: "Agrega al menos un producto a la compra." });
          return;
        }

        UI.cargando(botonGuardar, true);
        try {
          const compra = await API.post("/api/compras", {
            ...datos,
            detalles: lineas.map(({ producto, codigo, ...detalle }) => detalle),
          });
          instancia.hide();
          UI.aviso(`Se registró ${nombreCompra(compra)} por ${UI.moneda(compra.total, moneda())}`);
          tabla.recargar();

          setTimeout(async () => {
            const ahora = await UI.confirmar({
              titulo: "¿Ya llegó la mercadería?",
              mensaje: `Si la recibes ahora, los productos se suman al inventario de ${compra.ubicacion.nombre}.\nSi todavía no llega, puedes recibirla después desde la lista.`,
              textoAceptar: "Recibir ahora",
              textoCancelar: "Después",
            });
            if (ahora) recibir(compra, false);
          }, 400);
        } catch (error) {
          UI.mostrarErrores(cabecera, error);
        } finally {
          UI.cargando(botonGuardar, false);
        }
      });

      pintarLineas();
      modal.addEventListener("shown.bs.modal", () => cabecera.elements.id_proveedor.focus(), { once: true });
      instancia.show();
    }

    // ===================== Detalle =====================
    async function ver(idCompra) {
      let compra;
      try {
        compra = await API.get(`/api/compras/${idCompra}`);
      } catch (error) {
        UI.error(error);
        return;
      }

      const botones = [];
      if (puedeEditar) {
        if (compra.estado === "Pendiente") {
          botones.push({ accion: "recibir", texto: "Recibir", icono: "bi-box-arrow-in-down", clase: "btn-primary" });
        }
        if (compra.estado !== "Cancelada" && compra.estado_pago === "Pendiente") {
          botones.push({ accion: "pagar", texto: "Marcar pagada", icono: "bi-cash" });
        }
        if (compra.estado !== "Cancelada") {
          botones.push({ accion: "cancelar", texto: "Cancelar compra", icono: "bi-x-octagon", clase: "btn-peligro" });
        }
      }
      botones.push({ accion: "imprimir", texto: "Imprimir", icono: "bi-printer" });

      Formulario.mostrar({
        titulo: compra.numero_factura ? `Compra · Factura ${compra.numero_factura}` : `Compra a ${compra.proveedor.nombre}`,
        icono: "bi-bag-check",
        ancho: "modal-xl",
        cuerpo: detalleHtml(compra),
        botones,
        alAccionar: (accion) => {
          if (accion === "recibir") recibir(compra, true, true);
          if (accion === "pagar") pagar(compra, true);
          if (accion === "cancelar") cancelar(compra);
          if (accion === "imprimir") imprimir(compra);
        },
      });
    }

    function detalleHtml(c) {
      const dato = (etiqueta, valor) => `<div><div class="etq">${etiqueta}</div><div class="val">${valor}</div></div>`;
      return `
        <div class="info-detalle">
          ${dato("Fecha", UI.fechaHora(c.fecha))}
          ${dato("Proveedor", UI.escapar(c.proveedor.nombre))}
          ${dato("Factura", UI.escapar(c.numero_factura || "Sin factura"))}
          ${dato("Entra a", UI.escapar(c.ubicacion.nombre))}
          ${dato("Registró", UI.escapar(c.usuario.nombre_usuario))}
          ${dato("Estado", badgeEstado(c.estado))}
          ${dato("Pago", c.estado === "Cancelada" ? "—" : badgePago(c.estado_pago))}
          ${dato("Recibida", c.fecha_recepcion ? UI.fechaHora(c.fecha_recepcion) : "—")}
        </div>
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>Producto</th><th>Lote</th><th>Vence</th>
                <th class="text-end">Cantidad</th><th class="text-end">Costo</th><th class="text-end">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${c.detalles.map((d) => `
                <tr>
                  <td class="fw-semibold">${UI.escapar(d.producto.nombre)}</td>
                  <td>${UI.escapar(d.numero_lote)}</td>
                  <td class="text-nowrap">${UI.fecha(d.fecha_vencimiento)}</td>
                  <td class="text-end">${UI.numero(d.cantidad)}</td>
                  <td class="text-end">${UI.moneda(d.costo_unitario, moneda())}</td>
                  <td class="text-end">${UI.moneda(d.subtotal, moneda())}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="totales mt-3">
          <div class="fila"><span>Subtotal (sin IVA)</span><span>${UI.moneda(c.subtotal, moneda())}</span></div>
          <div class="fila"><span>IVA incluido</span><span>${UI.moneda(c.iva, moneda())}</span></div>
          <div class="fila total"><span>Total</span><span>${UI.moneda(c.total, moneda())}</span></div>
        </div>
        ${c.observaciones
          ? `<div class="small mt-3"><strong>Observaciones:</strong><br>${UI.escapar(c.observaciones).replace(/\n/g, "<br>")}</div>`
          : ""}`;
    }

    // ===================== Acciones =====================
    async function recibir(compra, preguntar = true, desdeDetalle = false) {
      if (preguntar) {
        const ok = await UI.confirmar({
          titulo: "¿Recibir la mercadería?",
          mensaje: `Los productos de ${nombreCompra(compra)} se sumarán al inventario de ${compra.ubicacion.nombre} y se crearán sus lotes.`,
          textoAceptar: "Recibir",
        });
        if (!ok) return;
      }
      try {
        await API.patch(`/api/compras/${compra.id}/recibir`);
        UI.aviso(`Se recibió ${nombreCompra(compra)}: el stock ya está en ${compra.ubicacion.nombre}`);
        tabla.recargar();
        if (desdeDetalle) ver(compra.id);
      } catch (error) {
        UI.error(error, "No se pudo recibir la compra");
      }
    }

    async function pagar(compra, desdeDetalle = false) {
      const ok = await UI.confirmar({
        titulo: "¿Marcar como pagada?",
        mensaje: `${nombreCompra(compra).replace(/^la/, "La")} por ${UI.moneda(compra.total, moneda())} quedará como pagada al proveedor.`,
        textoAceptar: "Marcar pagada",
      });
      if (!ok) return;
      try {
        const respuesta = await API.patch(`/api/compras/${compra.id}/pagar`);
        UI.aviso(respuesta.mensaje);
        tabla.recargar();
        if (desdeDetalle) ver(compra.id);
      } catch (error) {
        UI.error(error, "No se pudo marcar como pagada");
      }
    }

    function cancelar(compra) {
      const mensaje = compra.estado === "Recibida"
        ? "Se descontará del inventario lo que entró con esta compra. Si ya se vendió parte, no se podrá cancelar."
        : "La compra todavía no se ha recibido, así que no afecta el inventario.";
      Formulario.pedirMotivo({
        titulo: `Cancelar ${nombreCompra(compra)}`,
        mensaje,
        textoGuardar: "Cancelar compra",
        alGuardar: async (datos) => {
          const respuesta = await API.patch(`/api/compras/${compra.id}/cancelar`, datos);
          UI.aviso(respuesta.mensaje);
          tabla.recargar();
          if (respuesta.aviso) {
            setTimeout(() => UI.alerta({ tipo: "info", titulo: "Ten en cuenta", mensaje: respuesta.aviso }), 400);
          }
        },
      });
    }

    function imprimir(c) {
      const filas = c.detalles.map((d) => `
        <tr>
          <td>${UI.escapar(d.producto.nombre)}</td>
          <td>${UI.escapar(d.numero_lote)}</td>
          <td>${UI.fecha(d.fecha_vencimiento)}</td>
          <td class="der">${UI.numero(d.cantidad)}</td>
          <td class="der">${UI.moneda(d.costo_unitario, moneda())}</td>
          <td class="der">${UI.moneda(d.subtotal, moneda())}</td>
        </tr>`).join("");

      Formulario.imprimir(`<!doctype html><html lang="es"><head><meta charset="utf-8">
        <title>Compra ${UI.escapar(c.numero_factura || "")}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 30px; color: #111; }
          h1 { font-size: 18px; margin: 0; }
          h2 { font-size: 14px; margin: 4px 0 16px; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
          th { background: #eee; }
          .der { text-align: right; }
          .datos td { border: none; padding: 2px 10px 2px 0; }
          .firmas { display: flex; justify-content: space-between; margin-top: 60px; }
          .firma { width: 40%; border-top: 1px solid #333; text-align: center; padding-top: 4px; }
        </style></head><body>
        <h1>${UI.escapar(App.config.nombre_negocio)}</h1>
        <h2>COMPRA A PROVEEDOR ${c.numero_factura ? `— Factura ${UI.escapar(c.numero_factura)}` : ""}</h2>
        <table class="datos">
          <tr><td><strong>Proveedor:</strong></td><td>${UI.escapar(c.proveedor.nombre)}</td></tr>
          <tr><td><strong>Fecha:</strong></td><td>${UI.fechaHora(c.fecha)}</td></tr>
          <tr><td><strong>Entra a:</strong></td><td>${UI.escapar(c.ubicacion.nombre)}</td></tr>
          <tr><td><strong>Estado:</strong></td><td>${UI.escapar(c.estado)} · ${c.estado === "Cancelada" ? "" : UI.escapar(c.estado_pago === "Pagada" ? "Pagada" : "Por pagar")}</td></tr>
        </table>
        <table>
          <thead><tr><th>Producto</th><th>Lote</th><th>Vence</th><th class="der">Cantidad</th><th class="der">Costo</th><th class="der">Subtotal</th></tr></thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr><th colspan="5" class="der">Subtotal (sin IVA)</th><th class="der">${UI.moneda(c.subtotal, moneda())}</th></tr>
            <tr><th colspan="5" class="der">IVA incluido</th><th class="der">${UI.moneda(c.iva, moneda())}</th></tr>
            <tr><th colspan="5" class="der">Total</th><th class="der">${UI.moneda(c.total, moneda())}</th></tr>
          </tfoot>
        </table>
        <div class="firmas"><div class="firma">Entregó (proveedor)</div><div class="firma">Recibió</div></div>
        </body></html>`);
    }

    App.alSalir = () => Formulario.cerrar();
  }

  App.registrar("compras", { render });
})();