(() => {
  const PESTANAS = [
    {
      id: "ubicaciones", titulo: "Ubicaciones", icono: "bi-geo-alt", url: "/api/ubicaciones",
      singular: "la ubicación",
      campos: [
        { nombre: "nombre", etiqueta: "Nombre", requerido: true, max: 100, columnas: 6 },
        { nombre: "tipo", etiqueta: "Tipo", tipo: "select", requerido: true, columnas: 6, sinVacio: true,
          opciones: [{ valor: "Sucursal", texto: "Sucursal" }, { valor: "Bodega", texto: "Bodega" }] },
        { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono", columnas: 6 },
        { nombre: "direccion", etiqueta: "Dirección", max: 255, columnas: 6 },
        { nombre: "descripcion", etiqueta: "Descripción", tipo: "area", filas: 2 },
      ],
      columnas: [
        { titulo: "Nombre", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.nombre)}</div>
            ${f.descripcion ? `<div class="descripcion-fila">${UI.escapar(f.descripcion)}</div>` : ""}` },
        { titulo: "Tipo", render: (f) => `<span class="badge ${f.tipo === "Bodega" ? "text-bg-secondary" : "text-bg-info"}">${UI.escapar(f.tipo)}</span>` },
        { titulo: "Dirección", render: (f) => UI.escapar(f.direccion || "—") },
        { titulo: "Teléfono", render: (f) => UI.escapar(f.telefono || "—") },
        { titulo: "Estado", render: (f) => Formulario.badgeEstado(f.activo) },
      ],
    },
    {
      id: "puestos", titulo: "Puestos", icono: "bi-briefcase", url: "/api/puestos",
      singular: "el puesto",
      campos: [
        { nombre: "nombre", etiqueta: "Nombre", requerido: true, max: 100 },
        { nombre: "descripcion", etiqueta: "Descripción", tipo: "area", filas: 3 },
      ],
      columnas: [
        { titulo: "Nombre", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.nombre)}</div>
            ${f.descripcion ? `<div class="descripcion-fila">${UI.escapar(f.descripcion)}</div>` : ""}` },
        { titulo: "Estado", render: (f) => Formulario.badgeEstado(f.activo) },
      ],
    },
  ];

  let tabla = null;

  function render(contenedor) {
    contenedor.innerHTML = `
      <nav class="pestanas" id="pestanas-ubicaciones">
        ${PESTANAS.map((p) => `<button type="button" data-tab="${p.id}"><i class="bi ${p.icono}"></i>${p.titulo}</button>`).join("")}
      </nav>
      <div class="card p-3 p-md-4"><div id="tabla-ubicaciones"></div></div>`;

    contenedor.querySelector("#pestanas-ubicaciones").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-tab]");
      if (boton) mostrar(PESTANAS.find((p) => p.id === boton.dataset.tab));
    });

    const enUrl = new URLSearchParams(location.hash.split("?")[1] || "").get("tab");
    mostrar(PESTANAS.find((p) => p.id === enUrl) || PESTANAS[0]);

    App.alSalir = () => Formulario.cerrar();
  }

  function mostrar(pestana) {
    history.replaceState(null, "", `#/ubicaciones?tab=${pestana.id}`);
    document.querySelectorAll("#pestanas-ubicaciones [data-tab]").forEach((b) =>
      b.classList.toggle("activa", b.dataset.tab === pestana.id));

    const caja = document.getElementById("tabla-ubicaciones");
    tabla = new TablaPaginada({
      contenedor: caja,
      url: pestana.url,
      textoBuscar: `Buscar ${pestana.titulo.toLowerCase()}...`,
      vacio: `No hay ${pestana.titulo.toLowerCase()} registrados`,
      claseFila: (f) => (f.activo ? "" : "fila-inactiva"),
      columnas: pestana.columnas,
      botones: Formulario.botonNuevo("Nuevo"),
      acciones: (f) => Formulario.botonesFila(f),
      alAccionar: (accion, f) => {
        if (accion === "editar") abrir(pestana, f);
        else Formulario.cambiarEstado({
          url: `${pestana.url}/${f.id}`, nombre: f.nombre, etiqueta: pestana.singular,
          activar: accion === "reactivar", tabla,
        });
      },
    });
    caja.querySelector("[data-nuevo]").addEventListener("click", () => abrir(pestana, null));
  }

  function abrir(pestana, registro) {
    Formulario.abrir({
      titulo: `${registro ? "Editar" : "Nuevo"}: ${pestana.singular.split(" ")[1]}`,
      icono: pestana.icono,
      campos: pestana.campos,
      valores: registro || { tipo: "Sucursal" },
      ancho: pestana.id === "ubicaciones" ? "modal-lg" : "",
      campoDuplicado: "nombre",
      alGuardar: async (datos) => {
        if (registro) await API.put(`${pestana.url}/${registro.id}`, datos);
        else await API.post(pestana.url, datos);
        UI.aviso(`Se guardó ${pestana.singular} '${datos.nombre.trim()}'`);
        tabla.recargar();
      },
    });
  }

  App.registrar("ubicaciones", { render });
})();