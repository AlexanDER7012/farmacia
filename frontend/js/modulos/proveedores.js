(() => {
  const CAMPOS = [
    { nombre: "nombre", etiqueta: "Nombre del proveedor", requerido: true, max: 150 },
    { nombre: "nit", etiqueta: "NIT", requerido: true, max: 20, columnas: 6, placeholder: "1234567-8" },
    { nombre: "contacto", etiqueta: "Persona de contacto", max: 100, columnas: 6 },
    { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono", columnas: 6 },
    { nombre: "correo", etiqueta: "Correo", tipo: "email", max: 100, columnas: 6, placeholder: "ventas@proveedor.com" },
    { nombre: "direccion", etiqueta: "Dirección", tipo: "area", max: 255, filas: 2 },
  ];

  function render(contenedor) {
    const puedeEditar = App.tiene(ROLES.BODEGUERO);
    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-proveedores"></div></div>`;

    const tabla = new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-proveedores"),
      url: "/api/proveedores",
      textoBuscar: "Buscar por nombre o NIT...",
      vacio: "No hay proveedores registrados",
      claseFila: (f) => (f.activo ? "" : "fila-inactiva"),
      columnas: [
        { titulo: "Proveedor", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.nombre)}</div>
            ${f.contacto ? `<div class="descripcion-fila"><i class="bi bi-person me-1"></i>${UI.escapar(f.contacto)}</div>` : ""}` },
        { titulo: "NIT", render: (f) => UI.escapar(f.nit) },
        { titulo: "Teléfono", render: (f) => UI.escapar(f.telefono || "—") },
        { titulo: "Correo", render: (f) => UI.escapar(f.correo || "—") },
        { titulo: "Estado", render: (f) => Formulario.badgeEstado(f.activo) },
      ],
      botones: puedeEditar ? Formulario.botonNuevo("Nuevo proveedor") : "",
      acciones: puedeEditar ? (f) => Formulario.botonesFila(f) : null,
      alAccionar: (accion, f) => {
        if (accion === "editar") abrir(f);
        else Formulario.cambiarEstado({
          url: `/api/proveedores/${f.id}`, nombre: f.nombre, etiqueta: "el proveedor",
          activar: accion === "reactivar", tabla,
        });
      },
    });

    contenedor.querySelector("[data-nuevo]")?.addEventListener("click", () => abrir(null));

    function abrir(proveedor) {
      Formulario.abrir({
        titulo: proveedor ? "Editar proveedor" : "Nuevo proveedor",
        icono: "bi-truck",
        campos: CAMPOS,
        valores: proveedor || {},
        ancho: "modal-lg",
        campoDuplicado: "nit",
        alGuardar: async (datos) => {
          if (proveedor) await API.put(`/api/proveedores/${proveedor.id}`, datos);
          else await API.post("/api/proveedores", datos);
          UI.aviso(`Se guardó el proveedor '${datos.nombre.trim()}'`);
          tabla.recargar();
        },
      });
    }

    App.alSalir = () => Formulario.cerrar();
  }

  App.registrar("proveedores", { render });
})();