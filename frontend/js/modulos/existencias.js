(() => {
  function diasHasta(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return Math.round((new Date(a, m - 1, d) - inicioHoy) / 86400000);
  }

  function badgeVencimiento(iso) {
    const dias = diasHasta(iso);
    if (dias <= 0) return `<span class="badge text-bg-danger ms-1">Vencido</span>`;
    if (dias <= 30) return `<span class="badge text-bg-warning ms-1">${dias} días</span>`;
    if (dias <= 90) return `<span class="badge text-bg-info ms-1">${dias} días</span>`;
    return "";
  }

  async function render(contenedor) {
    const ubicaciones = await API.get("/api/ubicaciones/opciones");

    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-existencias"></div></div>`;
    const caja = contenedor.querySelector("#tabla-existencias");

    const filtro = `
      <select class="form-select filtro" data-filtro="ubicacion" title="Ubicación">
        <option value="">Todas las ubicaciones</option>
        ${ubicaciones.map((u) => `<option value="${u.id}">${UI.escapar(u.nombre)}</option>`).join("")}
      </select>`;

    const tabla = new TablaPaginada({
      contenedor: caja,
      url: "/api/consultas/existencias",
      filtroActivo: false,
      porPagina: 50,
      textoBuscar: "Buscar por producto, código o lote...",
      vacio: "No hay existencias. Recibe una compra para que aparezcan aquí.",
      botones: filtro,
      parametros: () => ({ id_ubicacion: caja.querySelector('[data-filtro="ubicacion"]').value }),
      columnas: [
        { titulo: "Producto", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.producto)}</div>
            <div class="descripcion-fila">${UI.escapar(f.codigo)}</div>` },
        { titulo: "Lote", render: (f) => UI.escapar(f.numero_lote) },
        { titulo: "Vencimiento", clase: "text-nowrap", render: (f) => `${UI.fecha(f.fecha_vencimiento)}${badgeVencimiento(f.fecha_vencimiento)}` },
        { titulo: "Ubicación", render: (f) => UI.escapar(f.ubicacion) },
        { titulo: "Cantidad", clase: "text-end", render: (f) => `<span class="fw-bold">${UI.numero(f.cantidad)}</span>` },
      ],
    });

    caja.querySelector('[data-filtro="ubicacion"]').addEventListener("change", () => {
      tabla.pagina = 1;
      tabla.cargar();
    });
  }

  App.registrar("existencias", { render });
})();