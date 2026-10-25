/**
 * Punto de venta.
 * - Sin turno abierto: pide abrirlo.
 * - Busca productos (o escanea) y los agrega con el lote que vence primero (FEFO).
 * - No ofrece lotes vencidos ni deja pasar del stock de la ubicación.
 * - Cliente opcional (Consumidor Final por defecto), forma de pago, descuento y vuelto.
 * El carrito se conserva al cambiar de módulo (se pierde solo al recargar la página).
 */
(() => {
  const carrito = [];
  let cliente = null;      // null = Consumidor Final
  let idTipoPago = null;

  const moneda = () => App.config.moneda || "Q";
  const redondear = (n) => Math.round(n * 100) / 100;

  function diasHasta(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    const hoy = new Date();
    return Math.round((new Date(a, m - 1, d) - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000);
  }

  async function render(contenedor) {
    const resumen = await API.get("/api/caja/turnos/actual");
    if (!resumen) {
      pantallaSinTurno(contenedor);
      return;
    }
    const tiposPago = await API.get("/api/tipos-pago/opciones");
    if (!idTipoPago || !tiposPago.some((t) => t.id === idTipoPago)) {
      idTipoPago = (tiposPago.find((t) => t.nombre.toLowerCase() === "efectivo") || tiposPago[0])?.id ?? null;
    }
    pantallaVenta(contenedor, resumen, tiposPago);
  }

  // ===================== Sin turno =====================
  function pantallaSinTurno(contenedor) {
    contenedor.innerHTML = `
      <div class="card p-4 p-md-5 mx-auto text-center" style="max-width: 520px">
        <div class="icono-dialogo info"><i class="bi bi-cash-stack"></i></div>
        <h3 class="titulo-dialogo">Abre tu turno de caja</h3>
        <p class="text-secondary">Para vender necesitas un turno abierto. Indica con cuánto efectivo empiezas.</p>
        <form id="form-abrir-turno" class="text-start" novalidate>
          <div class="alert alert-danger rounded-4 error-general d-none" role="alert"></div>
          <div class="mb-3">
            <label class="form-label" for="t-fondo">Fondo inicial <span class="text-danger">*</span></label>
            <div class="input-group has-validation">
              <span class="input-group-text">${UI.escapar(moneda())}</span>
              <input type="number" class="form-control" id="t-fondo" name="fondo_inicial" min="0" step="0.01" value="0">
            </div>
          </div>
          <div class="mb-4">
            <label class="form-label" for="t-obs">Observaciones</label>
            <input class="form-control" id="t-obs" name="observaciones" placeholder="Opcional">
          </div>
          <button type="submit" class="btn btn-primary w-100 btn-cobrar"><i class="bi bi-unlock me-2"></i>Abrir turno</button>
        </form>
      </div>`;

    const form = contenedor.querySelector("#form-abrir-turno");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      UI.limpiarErrores(form);
      const datos = UI.leerFormulario(form);
      if (datos.fondo_inicial === null || datos.fondo_inicial < 0) {
        UI.mostrarErrores(form, { campos: { fondo_inicial: "Indica el fondo inicial (puede ser 0)" } });
        return;
      }
      const boton = form.querySelector('button[type="submit"]');
      UI.cargando(boton, true, "Abriendo...");
      try {
        await API.post("/api/caja/turnos/abrir", datos);
        UI.aviso("Turno de caja abierto");
        render(contenedor);
      } catch (error) {
        UI.mostrarErrores(form, error);
        UI.cargando(boton, false);
      }
    });
    form.elements.fondo_inicial.focus();
    form.elements.fondo_inicial.select();
  }

  // ===================== Pantalla de venta =====================
  function pantallaVenta(contenedor, resumen, tiposPago) {
    const turno = resumen.turno;
    const campoCliente = {
      nombre: "id_cliente", etiqueta: "Cliente", tipo: "buscar",
      url: "/api/consultas/clientes", parametros: { activo: true },
      placeholder: "Buscar cliente por nombre o NIT...",
      texto: (c) => c.nombre,
      mostrar: (c) => `<div class="fw-semibold">${UI.escapar(c.nombre)}</div><div class="small text-secondary">NIT ${UI.escapar(c.nit)}</div>`,
      alElegir: (c) => elegirCliente(c),
    };

    contenedor.innerHTML = `
      <div class="row g-3">
        <div class="col-lg-8">
          <div class="card p-3 p-md-4 mb-3">
            <div class="campo-pill buscador-pos">
              <i class="bi bi-upc-scan icono-izq"></i>
              <input type="search" class="form-control" id="pos-buscar" autocomplete="off"
                     placeholder="Busca por nombre o código, o escanea el código de barras (F2)">
            </div>
            <div id="pos-resultados" class="resultados-pos d-none"></div>
          </div>

          <div class="card p-3 p-md-4">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="tarjeta-titulo"><i class="bi bi-cart3 me-2"></i>Carrito</h3>
              <button class="btn btn-vidrio btn-sm" id="pos-vaciar"><i class="bi bi-trash me-1"></i>Vaciar</button>
            </div>
            <div class="table-responsive">
              <table class="table align-middle">
                <thead>
                  <tr>
                    <th>Producto</th><th>Lote</th><th class="text-end">Cantidad</th>
                    <th class="text-end">Precio</th><th class="text-end">Subtotal</th><th></th>
                  </tr>
                </thead>
                <tbody id="pos-carrito"></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="col-lg-4">
          <div class="card p-3 p-md-4 panel-cobro">
            <div class="turno-mini">
              <div class="d-flex justify-content-between">
                <span><i class="bi bi-circle-fill text-success me-1" style="font-size:.6rem"></i>Turno abierto · ${UI.escapar(turno.ubicacion.nombre)}</span>
                <a href="#/caja" class="small">Ver caja</a>
              </div>
              <div class="text-secondary">Desde ${UI.fechaHora(turno.fecha_apertura).slice(11)} · efectivo en caja ${UI.moneda(resumen.efectivo_esperado, moneda())}</div>
            </div>

            <form id="pos-cliente" novalidate>
              <div class="d-flex justify-content-between align-items-end">
                <label class="form-label mb-1" for="f-id_cliente">Cliente</label>
                <button type="button" class="btn btn-link btn-sm p-0 mb-1" id="pos-nuevo-cliente"><i class="bi bi-person-plus me-1"></i>Nuevo</button>
              </div>
              ${Formulario._campoHtml({ ...campoCliente, etiqueta: "" }, cliente?.id).replace(/<label[^>]*><\/label>/, "")}
              <div id="pos-chip-cliente"></div>
              <div class="mt-2">
                <label class="form-label mb-1" for="pos-nit">NIT para la factura</label>
                <input class="form-control" id="pos-nit" maxlength="20" value="${UI.escapar(cliente?.nit || "CF")}">
              </div>
            </form>

            <div class="mt-3">
              <label class="form-label mb-1">Forma de pago</label>
              <div class="metodos-pago" id="pos-pagos">
                ${tiposPago.map((t) => `
                  <button type="button" data-pago="${t.id}" class="${t.id === idTipoPago ? "activo" : ""}">${UI.escapar(t.nombre)}</button>`).join("")}
              </div>
            </div>

            <div class="row g-2 mt-2">
              <div class="col-6">
                <label class="form-label mb-1" for="pos-descuento">Descuento</label>
                <div class="input-group has-validation">
                  <span class="input-group-text">${UI.escapar(moneda())}</span>
                  <input type="number" class="form-control" id="pos-descuento" min="0" step="0.01" value="0">
                </div>
              </div>
              <div class="col-6" id="pos-caja-recibido">
                <label class="form-label mb-1" for="pos-recibido">Recibido</label>
                <div class="input-group">
                  <span class="input-group-text">${UI.escapar(moneda())}</span>
                  <input type="number" class="form-control" id="pos-recibido" min="0" step="0.01" placeholder="Exacto">
                </div>
              </div>
            </div>

            <div class="mt-2">
              <input class="form-control form-control-sm" id="pos-observaciones" placeholder="Observaciones (opcional)">
            </div>

            <div class="totales w-100 mw-100 mt-3" id="pos-totales"></div>

            <button class="btn btn-primary w-100 btn-cobrar mt-3" id="pos-cobrar"></button>
          </div>
        </div>
      </div>`;

    const buscar = contenedor.querySelector("#pos-buscar");
    const resultadosCaja = contenedor.querySelector("#pos-resultados");
    const cuerpoCarrito = contenedor.querySelector("#pos-carrito");
    const formCliente = contenedor.querySelector("#pos-cliente");
    const inputNit = contenedor.querySelector("#pos-nit");
    const inputDescuento = contenedor.querySelector("#pos-descuento");
    const inputRecibido = contenedor.querySelector("#pos-recibido");
    const cajaRecibido = contenedor.querySelector("#pos-caja-recibido");
    const cajaTotales = contenedor.querySelector("#pos-totales");
    const botonCobrar = contenedor.querySelector("#pos-cobrar");

    Formulario._prepararBuscadores(formCliente, [campoCliente]);
    if (cliente) formCliente.querySelector('[data-buscar] input[type="text"]').value = cliente.nombre;

    // ===================== Búsqueda de productos =====================
    let espera;
    let numeroBusqueda = 0;
    let resultados = [];

    const ocultarResultados = () => resultadosCaja.classList.add("d-none");

    async function buscarProductos(texto) {
      const esta = ++numeroBusqueda;
      try {
        const r = await API.get("/api/consultas/productos", { buscar: texto, activo: true, por_pagina: 8 });
        if (esta !== numeroBusqueda) return resultados;
        resultados = r.items;
        resultadosCaja.innerHTML = resultados.length
          ? resultados.map((p, i) => `
              <button type="button" class="resultado-pos" data-i="${i}">
                <span class="icono-producto"><i class="bi bi-capsule"></i></span>
                <span>
                  <span class="fw-semibold d-block">${UI.escapar(p.nombre)}
                    ${p.requiere_receta ? `<span class="badge text-bg-warning ms-1">Receta</span>` : ""}
                  </span>
                  <span class="small text-secondary">${UI.escapar(p.codigo)}${p.presentacion ? ` · ${UI.escapar(p.presentacion)}` : ""} · stock total ${UI.numero(p.stock_total)}</span>
                </span>
                <span class="precio">${UI.moneda(p.precio_venta, moneda())}</span>
              </button>`).join("")
          : `<div class="vacio py-3"><i class="bi bi-search"></i>No se encontró "${UI.escapar(texto)}"</div>`;
        resultadosCaja.classList.remove("d-none");
      } catch (error) {
        UI.error(error);
      }
      return resultados;
    }

    buscar.addEventListener("input", () => {
      clearTimeout(espera);
      const texto = buscar.value.trim();
      if (!texto) { ocultarResultados(); return; }
      espera = setTimeout(() => buscarProductos(texto), 250);
    });

    // Enter: si el texto es un código exacto (escáner) o hay un solo resultado, se agrega directo
    buscar.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") { ocultarResultados(); return; }
      if (e.key !== "Enter") return;
      e.preventDefault();
      const texto = buscar.value.trim();
      if (!texto) return;
      clearTimeout(espera);
      const lista = await buscarProductos(texto);
      const exacto = lista.find((p) => p.codigo.toUpperCase() === texto.toUpperCase());
      if (exacto) agregar(exacto);
      else if (lista.length === 1) agregar(lista[0]);
    });

    resultadosCaja.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-i]");
      if (boton) agregar(resultados[Number(boton.dataset.i)]);
    });

    // ===================== Agregar al carrito =====================
    async function agregar(producto) {
      ocultarResultados();
      buscar.value = "";

      if (producto.requiere_receta) {
        const presento = await UI.confirmar({
          titulo: "Requiere receta médica",
          mensaje: `'${producto.nombre}' solo se vende con receta.\n¿El cliente presentó la receta?`,
          textoAceptar: "Sí, la presentó",
          textoCancelar: "No",
        });
        if (!presento) { buscar.focus(); return; }
      }

      let lotes;
      try {
        lotes = await API.get("/api/ventas/lotes-disponibles", { id_producto: producto.id });
      } catch (error) {
        UI.error(error);
        return;
      }
      if (!lotes.length) {
        UI.alerta({
          tipo: "advertencia",
          titulo: "Sin existencias",
          mensaje: `No hay '${producto.nombre}' disponible en ${turno.ubicacion.nombre} (o todos sus lotes están vencidos).`,
        });
        return;
      }

      // Se usa el primer lote (el que vence antes) que todavía tenga espacio
      for (const lote of lotes) {
        const disponible = Number(lote.cantidad);
        const linea = carrito.find((l) => l.id_producto === producto.id && l.id_lote === lote.id);
        if (linea && linea.cantidad >= disponible) continue;

        if (linea) {
          linea.cantidad = redondear(Math.min(linea.cantidad + 1, disponible));
          linea.lotes = lotes;
        } else {
          carrito.push({
            id_producto: producto.id,
            nombre: producto.nombre,
            codigo: producto.codigo,
            precio: Number(producto.precio_venta),
            id_lote: lote.id,
            cantidad: Math.min(1, disponible),
            lotes,
          });
        }
        pintarCarrito();
        buscar.focus();
        return;
      }

      UI.alerta({
        tipo: "advertencia",
        titulo: "Stock agotado",
        mensaje: `Ya agregaste todo el stock disponible de '${producto.nombre}' en ${turno.ubicacion.nombre}.`,
      });
    }

    // ===================== Carrito =====================
    function pintarCarrito() {
      if (!carrito.length) {
        cuerpoCarrito.innerHTML = `<tr><td colspan="6"><div class="vacio py-4"><i class="bi bi-cart"></i>El carrito está vacío. Busca un producto para empezar.</div></td></tr>`;
        actualizarTotales();
        return;
      }

      cuerpoCarrito.innerHTML = carrito.map((l, i) => {
        const loteActual = l.lotes.find((x) => x.id === l.id_lote);
        // No se ofrecen los lotes que ya usa otra línea del mismo producto
        const usados = carrito.filter((o, j) => j !== i && o.id_producto === l.id_producto).map((o) => o.id_lote);
        const opciones = l.lotes.filter((x) => x.id === l.id_lote || !usados.includes(x.id)).map((x) => {
          const dias = diasHasta(x.fecha_vencimiento);
          return `<option value="${x.id}" ${x.id === l.id_lote ? "selected" : ""}>
            ${UI.escapar(x.numero_lote)} · vence ${UI.fecha(x.fecha_vencimiento)}${dias <= 30 ? " ⚠" : ""} · disp. ${UI.numero(x.cantidad)}
          </option>`;
        }).join("");

        return `
          <tr data-i="${i}">
            <td><div class="fw-semibold">${UI.escapar(l.nombre)}</div><div class="descripcion-fila">${UI.escapar(l.codigo)}</div></td>
            <td><select class="form-select form-select-sm lote-select" data-lote>${opciones}</select></td>
            <td class="text-end">
              <input type="number" class="form-control form-control-sm cantidad-carrito" data-cantidad
                     min="0.01" step="1" max="${loteActual ? Number(loteActual.cantidad) : ""}" value="${l.cantidad}">
            </td>
            <td class="text-end text-nowrap">${UI.moneda(l.precio, moneda())}</td>
            <td class="text-end text-nowrap fw-semibold" data-subtotal>${UI.moneda(redondear(l.cantidad * l.precio), moneda())}</td>
            <td class="text-end"><button class="btn-accion peligro" data-quitar title="Quitar"><i class="bi bi-x-lg"></i></button></td>
          </tr>`;
      }).join("");
      actualizarTotales();
    }

    cuerpoCarrito.addEventListener("click", (e) => {
      const fila = e.target.closest("tr[data-i]");
      if (fila && e.target.closest("[data-quitar]")) {
        carrito.splice(Number(fila.dataset.i), 1);
        pintarCarrito();
      }
    });

    // Mientras escribe la cantidad: solo se actualizan los totales (para no perder el cursor)
    cuerpoCarrito.addEventListener("input", (e) => {
      if (!e.target.matches("[data-cantidad]")) return;
      const fila = e.target.closest("tr[data-i]");
      const linea = carrito[Number(fila.dataset.i)];
      const valor = Number(e.target.value);
      if (valor > 0) {
        linea.cantidad = valor;
        fila.querySelector("[data-subtotal]").textContent = UI.moneda(redondear(valor * linea.precio), moneda());
        actualizarTotales();
      }
    });

    // Al terminar de escribir o cambiar el lote: se revisa contra el stock
    cuerpoCarrito.addEventListener("change", (e) => {
      const fila = e.target.closest("tr[data-i]");
      if (!fila) return;
      const linea = carrito[Number(fila.dataset.i)];

      if (e.target.matches("[data-lote]")) linea.id_lote = Number(e.target.value);

      const lote = linea.lotes.find((x) => x.id === linea.id_lote);
      const disponible = lote ? Number(lote.cantidad) : 0;
      const cantidad = Number(fila.querySelector("[data-cantidad]").value);

      if (!(cantidad > 0)) {
        linea.cantidad = 1 <= disponible ? 1 : disponible;
      } else if (cantidad > disponible) {
        linea.cantidad = disponible;
        UI.aviso(`Solo hay ${UI.numero(disponible)} de ese lote`, "warning");
      } else {
        linea.cantidad = cantidad;
      }
      pintarCarrito();
    });

    contenedor.querySelector("#pos-vaciar").addEventListener("click", async () => {
      if (!carrito.length) return;
      const ok = await UI.confirmar({
        titulo: "¿Vaciar el carrito?",
        mensaje: "Se quitarán todos los productos de esta venta.",
        textoAceptar: "Vaciar",
        peligro: true,
      });
      if (ok) {
        carrito.length = 0;
        pintarCarrito();
        buscar.focus();
      }
    });

    // ===================== Cliente =====================
    function elegirCliente(c) {
      cliente = c;
      inputNit.value = c?.nit || "CF";
      pintarCliente();
    }

    function pintarCliente() {
      contenedor.querySelector("#pos-chip-cliente").innerHTML = cliente
        ? `<div class="chip-cliente">
             <i class="bi bi-person-check text-success"></i>
             <span class="me-auto"><strong>${UI.escapar(cliente.nombre)}</strong><br><span class="small text-secondary">NIT ${UI.escapar(cliente.nit)}</span></span>
             <button type="button" class="btn-close" data-quitar-cliente title="Usar Consumidor Final"></button>
           </div>`
        : `<div class="chip-cliente"><i class="bi bi-person"></i><span>Consumidor Final</span></div>`;
    }

    contenedor.querySelector("#pos-chip-cliente").addEventListener("click", (e) => {
      if (!e.target.closest("[data-quitar-cliente]")) return;
      formCliente.querySelector('[data-buscar] input[type="text"]').value = "";
      formCliente.querySelector('[data-buscar] input[type="hidden"]').value = "";
      elegirCliente(null);
    });

    contenedor.querySelector("#pos-nuevo-cliente").addEventListener("click", () => {
      Formulario.abrir({
        titulo: "Nuevo cliente",
        icono: "bi-person-plus",
        campoDuplicado: "nit",
        campos: [
          { nombre: "nombre", etiqueta: "Nombre", requerido: true, max: 150 },
          { nombre: "nit", etiqueta: "NIT", max: 20, columnas: 6, placeholder: "CF" },
          { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono", columnas: 6 },
        ],
        alGuardar: async (datos) => {
          const nuevo = await API.post("/api/clientes", datos);
          formCliente.querySelector('[data-buscar] input[type="text"]').value = nuevo.nombre;
          formCliente.querySelector('[data-buscar] input[type="hidden"]').value = nuevo.id;
          elegirCliente(nuevo);
          UI.aviso(`Se registró al cliente '${nuevo.nombre}'`);
        },
      });
    });

    // ===================== Pago y totales =====================
    const esEfectivo = () =>
      (tiposPago.find((t) => t.id === idTipoPago)?.nombre || "").toLowerCase() === "efectivo";

    contenedor.querySelector("#pos-pagos").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-pago]");
      if (!boton) return;
      idTipoPago = Number(boton.dataset.pago);
      contenedor.querySelectorAll("#pos-pagos [data-pago]").forEach((b) =>
        b.classList.toggle("activo", b === boton));
      actualizarTotales();
    });

    inputDescuento.addEventListener("input", actualizarTotales);
    inputRecibido.addEventListener("input", actualizarTotales);

    function calcular() {
      const subtotal = redondear(carrito.reduce((suma, l) => suma + redondear(l.cantidad * l.precio), 0));
      const descuento = Number(inputDescuento.value || 0);
      const total = redondear(subtotal - descuento);
      const recibido = inputRecibido.value === "" ? null : Number(inputRecibido.value);
      return { subtotal, descuento, total, recibido };
    }

    function actualizarTotales() {
      const { subtotal, descuento, total, recibido } = calcular();
      const descuentoMal = descuento < 0 || descuento > subtotal;
      inputDescuento.classList.toggle("is-invalid", descuentoMal && carrito.length > 0);

      cajaRecibido.classList.toggle("d-none", !esEfectivo());
      const vuelto = esEfectivo() && recibido !== null ? redondear(recibido - total) : null;

      cajaTotales.innerHTML = `
        <div class="fila"><span>Subtotal</span><span>${UI.moneda(subtotal, moneda())}</span></div>
        <div class="fila"><span>Descuento</span><span>− ${UI.moneda(descuento, moneda())}</span></div>
        <div class="fila total"><span>Total</span><span>${UI.moneda(total, moneda())}</span></div>
        ${vuelto !== null ? `
          <div class="fila mt-1"><span>Vuelto</span>
            <span class="${vuelto < 0 ? "text-danger fw-bold" : "vuelto"}">${vuelto < 0 ? "Falta " + UI.moneda(-vuelto, moneda()) : UI.moneda(vuelto, moneda())}</span>
          </div>` : ""}`;

      botonCobrar.disabled = !carrito.length || descuentoMal;
      botonCobrar.innerHTML = `<i class="bi bi-check2-circle me-2"></i>Cobrar ${UI.moneda(Math.max(total, 0), moneda())}`;
    }

    // ===================== Cobrar =====================
    botonCobrar.addEventListener("click", async () => {
      if (!carrito.length) return;
      const { subtotal, descuento, total, recibido } = calcular();

      if (descuento < 0 || descuento > subtotal) {
        UI.alerta({ tipo: "advertencia", titulo: "Revisa el descuento", mensaje: "El descuento no puede ser negativo ni mayor que el subtotal." });
        return;
      }
      if (!idTipoPago) {
        UI.alerta({ tipo: "advertencia", titulo: "Falta la forma de pago", mensaje: "Elige cómo paga el cliente." });
        return;
      }
      if (esEfectivo() && recibido !== null && recibido < total) {
        UI.alerta({
          tipo: "advertencia",
          titulo: "Monto insuficiente",
          mensaje: `El cliente entregó ${UI.moneda(recibido, moneda())} y el total es ${UI.moneda(total, moneda())}.`,
        });
        return;
      }

      UI.cargando(botonCobrar, true, "Cobrando...");
      try {
        const venta = await API.post("/api/ventas", {
          id_cliente: cliente?.id ?? null,
          nit: inputNit.value.trim() || null,
          id_tipo_pago: idTipoPago,
          descuento,
          observaciones: contenedor.querySelector("#pos-observaciones").value.trim() || null,
          detalles: carrito.map((l) => ({ id_producto: l.id_producto, id_lote: l.id_lote, cantidad: l.cantidad })),
        });

        const vuelto = esEfectivo() && recibido !== null ? redondear(recibido - Number(venta.total)) : null;
        carrito.length = 0;
        cliente = null;

        const imprimirAhora = await UI._dialogo({
          tipo: "exito",
          titulo: `Venta No. ${venta.id} registrada`,
          mensaje: `Total: ${UI.moneda(venta.total, moneda())}${vuelto !== null ? `\nVuelto: ${UI.moneda(vuelto, moneda())}` : ""}`,
          textoAceptar: "Imprimir comprobante",
          textoCancelar: "Listo",
        });
        if (imprimirAhora) imprimirComprobante(venta);
        render(contenedor);
      } catch (error) {
        UI.cargando(botonCobrar, false);
        UI.error(error, "No se pudo registrar la venta");
      }
    });

    function imprimirComprobante(v) {
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

    // ===================== Atajo F2 y salida =====================
    const atajo = (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        buscar.focus();
      }
    };
    document.addEventListener("keydown", atajo);
    buscar.addEventListener("blur", () => setTimeout(ocultarResultados, 200));

    App.alSalir = () => {
      document.removeEventListener("keydown", atajo);
      Formulario.cerrar();
    };

    pintarCliente();
    pintarCarrito();
    buscar.focus();
  }

  App.registrar("punto-venta", { render });
})();