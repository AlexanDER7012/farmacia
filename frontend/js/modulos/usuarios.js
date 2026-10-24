(() => {
  const AYUDA_PASSWORD = "Mínimo 8 caracteres, con al menos una letra y un número";

  function render(contenedor) {
    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-usuarios"></div></div>`;

    const tabla = new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-usuarios"),
      url: "/api/usuarios",
      textoBuscar: "Buscar por usuario o nombre...",
      vacio: "No hay usuarios registrados",
      claseFila: (f) => (f.activo ? "" : "fila-inactiva"),
      columnas: [
        { titulo: "Usuario", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.nombre_usuario)}
              ${f.id === App.usuario.id ? `<span class="badge text-bg-info ms-1">Tú</span>` : ""}
            </div>
            <div class="descripcion-fila">${UI.escapar(`${f.empleado.nombres} ${f.empleado.apellidos}`)}</div>` },
        { titulo: "Rol", render: (f) => UI.escapar(f.rol.nombre) },
        { titulo: "Último acceso", clase: "text-nowrap", render: (f) => f.ultimo_acceso
            ? UI.fechaHora(f.ultimo_acceso) : `<span class="text-secondary">Nunca</span>` },
        { titulo: "Estado", render: (f) => f.bloqueado
            ? `<span class="badge text-bg-danger"><i class="bi bi-lock-fill me-1"></i>Bloqueado</span>`
            : Formulario.badgeEstado(f.activo) },
      ],
      botones: Formulario.botonNuevo("Nuevo usuario"),
      acciones: (f) => {
        if (f.id === App.usuario.id) return `<span class="small text-secondary">Tu usuario</span>`;
        return `
          <button class="btn-accion" data-accion="rol" title="Cambiar rol"><i class="bi bi-person-gear"></i></button>
          <button class="btn-accion" data-accion="password" title="Restablecer contraseña"><i class="bi bi-key"></i></button>
          ${f.bloqueado ? `<button class="btn-accion" data-accion="desbloquear" title="Desbloquear"><i class="bi bi-unlock"></i></button>` : ""}
          ${f.activo
            ? `<button class="btn-accion peligro" data-accion="desactivar" title="Desactivar"><i class="bi bi-slash-circle"></i></button>`
            : `<button class="btn-accion" data-accion="reactivar" title="Reactivar"><i class="bi bi-arrow-counterclockwise"></i></button>`}`;
      },
      alAccionar: (accion, f) => {
        if (accion === "rol") cambiarRol(f);
        if (accion === "password") restablecer(f);
        if (accion === "desbloquear") desbloquear(f);
        if (accion === "desactivar" || accion === "reactivar") {
          Formulario.cambiarEstado({
            url: `/api/usuarios/${f.id}`, nombre: f.nombre_usuario, etiqueta: "el usuario",
            activar: accion === "reactivar", tabla,
            mensajeDesactivar: `'${f.nombre_usuario}' ya no podrá iniciar sesión hasta que se reactive.`,
          });
        }
      },
    });

    contenedor.querySelector("[data-nuevo]").addEventListener("click", crear);

    const opcionesRoles = async () => (await API.get("/api/roles/opciones")).map((r) => ({ valor: r.id, texto: r.nombre }));

    // ===================== Crear =====================
    async function crear() {
      let empleados;
      let roles;
      try {
        [empleados, roles] = await Promise.all([API.get("/api/empleados/sin-usuario"), opcionesRoles()]);
      } catch (error) {
        UI.error(error);
        return;
      }
      if (!empleados.length) {
        UI.alerta({
          tipo: "info",
          titulo: "No hay empleados disponibles",
          mensaje: "Todos los empleados activos ya tienen usuario.\nRegistra primero al empleado en el módulo Empleados.",
        });
        return;
      }

      Formulario.abrir({
        titulo: "Nuevo usuario",
        icono: "bi-person-plus",
        ancho: "modal-lg",
        campoDuplicado: "nombre_usuario",
        campos: [
          { nombre: "id_empleado", etiqueta: "Empleado", tipo: "select", requerido: true, numerico: true, columnas: 6,
            opciones: empleados.map((e) => ({ valor: e.id, texto: e.nombre })) },
          { nombre: "id_rol", etiqueta: "Rol", tipo: "select", requerido: true, numerico: true, columnas: 6, opciones: roles },
          { nombre: "nombre_usuario", etiqueta: "Nombre de usuario", requerido: true, max: 50,
            placeholder: "Ej: maria.lopez", ayuda: "Solo minúsculas, números, punto o guion bajo (de 3 a 50)" },
          { nombre: "password", etiqueta: "Contraseña", tipo: "password", requerido: true, columnas: 6, ayuda: AYUDA_PASSWORD },
          { nombre: "confirmar", etiqueta: "Confirmar contraseña", tipo: "password", requerido: true, columnas: 6 },
        ],
        alGuardar: async (datos) => {
          if (datos.password !== datos.confirmar) throw { campos: { confirmar: "Las contraseñas no coinciden" } };
          delete datos.confirmar;
          datos.nombre_usuario = datos.nombre_usuario.trim().toLowerCase();
          await API.post("/api/usuarios", datos);
          UI.aviso(`Se creó el usuario '${datos.nombre_usuario}'`);
          tabla.recargar();
        },
      });
    }

    // ===================== Cambiar rol =====================
    async function cambiarRol(usuario) {
      let roles;
      try {
        roles = await opcionesRoles();
      } catch (error) {
        UI.error(error);
        return;
      }
      Formulario.abrir({
        titulo: `Cambiar rol de ${usuario.nombre_usuario}`,
        icono: "bi-person-gear",
        valores: { id_rol: usuario.rol.id },
        campos: [
          { nombre: "id_rol", etiqueta: "Rol", tipo: "select", requerido: true, numerico: true, sinVacio: true,
            opciones: roles, actual: { valor: usuario.rol.id, texto: usuario.rol.nombre },
            ayuda: "El cambio aplica desde su siguiente acción en el sistema." },
        ],
        alGuardar: async (datos) => {
          await API.put(`/api/usuarios/${usuario.id}`, datos);
          UI.aviso(`Se actualizó el rol de '${usuario.nombre_usuario}'`);
          tabla.recargar();
        },
      });
    }

    // ===================== Restablecer contraseña =====================
    function restablecer(usuario) {
      Formulario.abrir({
        titulo: `Nueva contraseña para ${usuario.nombre_usuario}`,
        icono: "bi-key",
        textoGuardar: "Restablecer",
        campos: [
          { nombre: "password_nueva", etiqueta: "Contraseña nueva", tipo: "password", requerido: true, ayuda: AYUDA_PASSWORD },
          { nombre: "confirmar", etiqueta: "Confirmar contraseña", tipo: "password", requerido: true },
        ],
        alGuardar: async (datos) => {
          if (datos.password_nueva !== datos.confirmar) throw { campos: { confirmar: "Las contraseñas no coinciden" } };
          const respuesta = await API.patch(`/api/usuarios/${usuario.id}/restablecer-password`, {
            password_nueva: datos.password_nueva,
          });
          UI.aviso(respuesta.mensaje);
          tabla.recargar();
        },
      });
    }

    // ===================== Desbloquear =====================
    async function desbloquear(usuario) {
      const ok = await UI.confirmar({
        titulo: "¿Desbloquear usuario?",
        mensaje: `'${usuario.nombre_usuario}' podrá volver a intentar iniciar sesión.`,
        textoAceptar: "Desbloquear",
      });
      if (!ok) return;
      try {
        const respuesta = await API.patch(`/api/usuarios/${usuario.id}/desbloquear`);
        UI.aviso(respuesta.mensaje);
        tabla.recargar();
      } catch (error) {
        UI.error(error, "No se pudo desbloquear");
      }
    }

    App.alSalir = () => Formulario.cerrar();
  }

  App.registrar("usuarios", { render });
})();