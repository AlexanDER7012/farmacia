(() => {
  const CAMPOS = [
    { nombre: "nombre", etiqueta: "Nombre", requerido: true, max: 150 },
    { nombre: "nit", etiqueta: "NIT", max: 20, columnas: 6, placeholder: "CF",
      ayuda: "Déjalo vacío para Consumidor Final (CF)" },
    { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono", columnas: 6 },
    { nombre: "correo", etiqueta: "Correo", tipo: "email", max: 100, placeholder: "nombre@gmail.com" },
    { nombre: "direccion", etiqueta: "Dirección", tipo: "area", max: 255, filas: 2 },
  ];

  function render(contenedor) {
    const puedeEditar = App.tiene(ROLES.VENDEDOR);
    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-clientes"></div></div>`;

    const tabla = new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-clientes"),
      url: "/api/consultas/clientes",
      textoBuscar: "Buscar por nombre o NIT...",
      vacio: "No hay clientes registrados",
      claseFila: (f) => (f.activo ? "" : "fila-inactiva"),
      columnas: [
        { titulo: "Cliente", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.nombre)}</div>
            ${f.correo ? `<div class="descripcion-fila">${UI.escapar(f.correo)}</div>` : ""}` },
        { titulo: "NIT", render: (f) => f.nit === "CF"
            ? `<span class="badge estado-badge inactivo">CF</span>` : UI.escapar(f.nit) },
        { titulo: "Teléfono", render: (f) => UI.escapar(f.telefono || "—") },
        { titulo: "Dirección", render: (f) => `<span class="descripcion-fila d-inline-block">${UI.escapar(f.direccion || "—")}</span>` },
        { titulo: "Estado", render: (f) => Formulario.badgeEstado(f.activo) },
      ],
      botones: puedeEditar ? Formulario.botonNuevo("Nuevo cliente") : "",
      acciones: puedeEditar ? (f) => Formulario.botonesFila(f) : null,
      alAccionar: (accion, f) => {
        if (accion === "editar") abrir(f);
        else Formulario.cambiarEstado({
          url: `/api/clientes/${f.id}`, nombre: f.nombre, etiqueta: "el cliente",
          activar: accion === "reactivar", tabla,
        });
      },
    });

    contenedor.querySelector("[data-nuevo]")?.addEventListener("click", () => abrir(null));

    function abrir(cliente) {
      Formulario.abrir({
        titulo: cliente ? "Editar cliente" : "Nuevo cliente",
        icono: "bi-person",
        campos: CAMPOS,
        valores: cliente || {},
        ancho: "modal-lg",
        campoDuplicado: "nit",
        alGuardar: async (datos) => {
          if (cliente) await API.put(`/api/clientes/${cliente.id}`, datos);
          else await API.post("/api/clientes", datos);
          UI.aviso(`Se guardó el cliente '${datos.nombre.trim()}'`);
          tabla.recargar();
        },
      });
    }

    App.alSalir = () => Formulario.cerrar();
  }

  App.registrar("clientes", { render });
})();