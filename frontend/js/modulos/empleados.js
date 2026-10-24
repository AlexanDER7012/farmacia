(() => {
  const formatoDpi = (d) => (d && d.length === 13 ? `${d.slice(0, 4)} ${d.slice(4, 9)} ${d.slice(9)}` : d || "");

  async function render(contenedor) {
    const [puestos, ubicaciones] = await Promise.all([
      API.get("/api/puestos/opciones"),
      API.get("/api/ubicaciones/opciones"),
    ]);
    const aOpciones = (lista) => lista.map((r) => ({ valor: r.id, texto: r.nombre }));

    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-empleados"></div></div>`;

    const tabla = new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-empleados"),
      url: "/api/empleados",
      textoBuscar: "Buscar por nombre o DPI...",
      vacio: "No hay empleados registrados",
      claseFila: (f) => (f.activo ? "" : "fila-inactiva"),
      columnas: [
        { titulo: "Empleado", render: (f) => `
            <div class="fw-semibold">${UI.escapar(`${f.nombres} ${f.apellidos}`)}</div>
            ${f.correo ? `<div class="descripcion-fila">${UI.escapar(f.correo)}</div>` : ""}` },
        { titulo: "DPI", clase: "text-nowrap", render: (f) => UI.escapar(formatoDpi(f.dpi)) },
        { titulo: "Puesto", render: (f) => UI.escapar(f.puesto.nombre) },
        { titulo: "Ubicación", render: (f) => UI.escapar(f.ubicacion.nombre) },
        { titulo: "Teléfono", render: (f) => UI.escapar(f.telefono || "—") },
        { titulo: "Estado", render: (f) => Formulario.badgeEstado(f.activo) },
      ],
      botones: Formulario.botonNuevo("Nuevo empleado"),
      acciones: (f) => Formulario.botonesFila(f),
      alAccionar: (accion, f) => {
        if (accion === "editar") abrir(f);
        else Formulario.cambiarEstado({
          url: `/api/empleados/${f.id}`, nombre: `${f.nombres} ${f.apellidos}`, etiqueta: "al empleado",
          activar: accion === "reactivar", tabla,
          mensajeDesactivar: `'${f.nombres} ${f.apellidos}' quedará inactivo y, si tiene usuario, ya no podrá iniciar sesión.`,
        });
      },
    });

    contenedor.querySelector("[data-nuevo]").addEventListener("click", () => abrir(null));

    function abrir(empleado) {
      const campos = [
        { nombre: "nombres", etiqueta: "Nombres", requerido: true, max: 100, columnas: 6 },
        { nombre: "apellidos", etiqueta: "Apellidos", requerido: true, max: 100, columnas: 6 },
        { nombre: "dpi", etiqueta: "DPI", requerido: true, max: 15, columnas: 6,
          placeholder: "1234567890101", ayuda: "13 dígitos (con o sin espacios)" },
        { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono", columnas: 6 },
        { nombre: "correo", etiqueta: "Correo", tipo: "email", max: 100, columnas: 6 },
        { nombre: "fecha_contratacion", etiqueta: "Fecha de contratación", tipo: "fecha", columnas: 6 },
        { nombre: "id_puesto", etiqueta: "Puesto", tipo: "select", requerido: true, numerico: true, columnas: 6,
          opciones: aOpciones(puestos), actual: empleado ? { valor: empleado.puesto.id, texto: empleado.puesto.nombre } : null },
        { nombre: "id_ubicacion", etiqueta: "Ubicación donde trabaja", tipo: "select", requerido: true, numerico: true, columnas: 6,
          opciones: aOpciones(ubicaciones), actual: empleado ? { valor: empleado.ubicacion.id, texto: empleado.ubicacion.nombre } : null },
        { nombre: "salario", etiqueta: "Salario", tipo: "numero", min: 0, prefijo: "Q", columnas: 6 },
        { nombre: "direccion", etiqueta: "Dirección", tipo: "area", max: 255, filas: 2 },
      ];

      const valores = empleado
        ? { ...empleado, id_puesto: empleado.puesto.id, id_ubicacion: empleado.ubicacion.id }
        : { salario: 0, id_ubicacion: ubicaciones[0]?.id };

      Formulario.abrir({
        titulo: empleado ? "Editar empleado" : "Nuevo empleado",
        icono: "bi-person-badge",
        campos,
        valores,
        ancho: "modal-lg",
        campoDuplicado: "dpi",
        alGuardar: async (datos) => {
          if (datos.salario === null) datos.salario = 0;
          if (empleado) await API.put(`/api/empleados/${empleado.id}`, datos);
          else await API.post("/api/empleados", datos);
          UI.aviso(`Se guardó al empleado '${datos.nombres.trim()} ${datos.apellidos.trim()}'`);
          tabla.recargar();
        },
      });
    }

    App.alSalir = () => Formulario.cerrar();
  }

  App.registrar("empleados", { render });
})();