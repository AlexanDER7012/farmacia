/**
 * Catálogos: categorías, laboratorios, principios activos, presentaciones,
 * unidades de medida y tipos de pago. Un CRUD con pestañas.
 * La pestaña activa queda en la URL (#/catalogos?tab=...), así al guardar
 * o al recargar con F5 no regresa a la primera.
 */
(() => {
  const CATALOGOS = [
    { id: "categorias", titulo: "Categorías", singular: "categoría", articulo: "la",
      icono: "bi-tags", url: "/api/categorias", editan: [ROLES.BODEGUERO] },
    { id: "laboratorios", titulo: "Laboratorios", singular: "laboratorio", articulo: "el",
      icono: "bi-building", url: "/api/laboratorios", editan: [ROLES.BODEGUERO] },
    { id: "principios", titulo: "Principios activos", singular: "principio activo", articulo: "el",
      icono: "bi-droplet-half", url: "/api/principios-activos", editan: [ROLES.BODEGUERO] },
    { id: "presentaciones", titulo: "Presentaciones", singular: "presentación", articulo: "la",
      icono: "bi-capsule", url: "/api/presentaciones", editan: [ROLES.BODEGUERO] },
    { id: "unidades", titulo: "Unidades de medida", singular: "unidad de medida", articulo: "la",
      icono: "bi-rulers", url: "/api/unidades-medida", editan: [ROLES.BODEGUERO], abreviatura: true },
    { id: "tipos-pago", titulo: "Tipos de pago", singular: "tipo de pago", articulo: "el",
      icono: "bi-credit-card", url: "/api/tipos-pago", editan: [] },   // [] = solo Administrador
  ];

  let tabla = null;
  let actual = null;

  // ===================== Pestaña en la URL =====================
  function pestanaDeUrl() {
    const parametros = new URLSearchParams(location.hash.split("?")[1] || "");
    return CATALOGOS.find((c) => c.id === parametros.get("tab")) || CATALOGOS[0];
  }

  function guardarPestanaEnUrl(catalogo) {
    // replaceState no dispara "hashchange", así no se vuelve a cargar el módulo entero
    history.replaceState(null, "", `#/catalogos?tab=${catalogo.id}`);
  }

  // ===================== Pantalla =====================
  function render(contenedor) {
    contenedor.innerHTML = `
      <nav class="pestanas" id="pestanas-catalogo">
        ${CATALOGOS.map((c) => `
          <button type="button" data-tab="${c.id}"><i class="bi ${c.icono}"></i>${c.titulo}</button>`).join("")}
      </nav>
      <div class="card p-3 p-md-4">
        <div id="tabla-catalogo"></div>
      </div>`;

    contenedor.querySelector("#pestanas-catalogo").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-tab]");
      if (!boton) return;
      mostrar(CATALOGOS.find((c) => c.id === boton.dataset.tab));
    });

    mostrar(pestanaDeUrl());

    // Si se cambia de módulo con el formulario abierto, se cierra
    App.alSalir = () => {
      const modal = document.getElementById("modal-catalogo");
      if (modal) bootstrap.Modal.getInstance(modal)?.hide();
    };
  }

  function mostrar(catalogo) {
    actual = catalogo;
    guardarPestanaEnUrl(catalogo);
    document.querySelectorAll("#pestanas-catalogo [data-tab]").forEach((b) =>
      b.classList.toggle("activa", b.dataset.tab === catalogo.id));

    const puedeEditar = App.tiene(...catalogo.editan);

    const columnas = [
      {
        titulo: "Nombre",
        render: (f) => `
          <div class="fw-semibold">${UI.escapar(f.nombre)}</div>
          ${f.descripcion ? `<div class="descripcion-fila" title="${UI.escapar(f.descripcion)}">${UI.escapar(f.descripcion)}</div>` : ""}`,
      },
    ];
    if (catalogo.abreviatura) {
      columnas.push({ titulo: "Abreviatura", render: (f) => UI.escapar(f.abreviatura) });
    }
    columnas.push({
      titulo: "Estado",
      render: (f) => f.activo
        ? `<span class="badge estado-badge activo">Activo</span>`
        : `<span class="badge estado-badge inactivo">Inactivo</span>`,
    });

    tabla = new TablaPaginada({
      contenedor: document.getElementById("tabla-catalogo"),
      url: catalogo.url,
      textoBuscar: `Buscar ${catalogo.singular}...`,
      vacio: `No hay ${catalogo.titulo.toLowerCase()} registrados`,
      columnas,
      claseFila: (f) => (f.activo ? "" : "fila-inactiva"),
      botones: puedeEditar
        ? `<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nuevo</button>`
        : "",
      acciones: puedeEditar
        ? (f) => `
            <button class="btn-accion" data-accion="editar" title="Editar"><i class="bi bi-pencil"></i></button>
            ${f.activo
              ? `<button class="btn-accion peligro" data-accion="desactivar" title="Desactivar"><i class="bi bi-slash-circle"></i></button>`
              : `<button class="btn-accion" data-accion="reactivar" title="Reactivar"><i class="bi bi-arrow-counterclockwise"></i></button>`}`
        : null,
      alAccionar: (accion, fila) => {
        if (accion === "editar") abrirFormulario(fila);
        if (accion === "desactivar") desactivar(fila);
        if (accion === "reactivar") reactivar(fila);
      },
    });

    document.querySelector("#tabla-catalogo [data-nuevo]")?.addEventListener("click", () => abrirFormulario(null));
  }

  // ===================== Formulario (crear y editar) =====================
  function obtenerModal() {
    let modal = document.getElementById("modal-catalogo");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-catalogo";
      modal.className = "modal fade";
      modal.tabIndex = -1;
      modal.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"></div></div>`;
      document.body.appendChild(modal);
    }
    return modal;
  }

  function abrirFormulario(registro) {
    const catalogo = actual;
    const editando = Boolean(registro);
    const modal = obtenerModal();

    modal.querySelector(".modal-content").innerHTML = `
      <form novalidate>
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi ${catalogo.icono} me-2"></i>${editando ? "Editar" : "Nuevo"}: ${UI.escapar(catalogo.singular)}
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="alert alert-danger rounded-4 error-general d-none" role="alert"></div>

          <div class="mb-3">
            <label class="form-label" for="cat-nombre">Nombre <span class="text-danger">*</span></label>
            <input type="text" class="form-control" id="cat-nombre" name="nombre" maxlength="100" required
                   value="${UI.escapar(registro?.nombre || "")}">
          </div>

          ${catalogo.abreviatura ? `
          <div class="mb-3">
            <label class="form-label" for="cat-abreviatura">Abreviatura <span class="text-danger">*</span></label>
            <input type="text" class="form-control" id="cat-abreviatura" name="abreviatura" maxlength="10" required
                   placeholder="Ej: und, cja, fco" value="${UI.escapar(registro?.abreviatura || "")}">
          </div>` : ""}

          <div class="mb-1">
            <label class="form-label" for="cat-descripcion">Descripción</label>
            <textarea class="form-control" id="cat-descripcion" name="descripcion" rows="3"
                      placeholder="Opcional">${UI.escapar(registro?.descripcion || "")}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-vidrio" data-bs-dismiss="modal">Cancelar</button>
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2 me-1"></i>Guardar</button>
        </div>
      </form>`;

    const form = modal.querySelector("form");
    const botonGuardar = form.querySelector('button[type="submit"]');
    const instancia = bootstrap.Modal.getOrCreateInstance(modal);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      UI.limpiarErrores(form);
      const datos = UI.leerFormulario(form);

      // Revisión rápida antes de ir al servidor (el servidor igual valida todo)
      const faltantes = {};
      if (!datos.nombre || !datos.nombre.trim()) faltantes.nombre = "El nombre es obligatorio";
      if (catalogo.abreviatura && (!datos.abreviatura || !datos.abreviatura.trim())) {
        faltantes.abreviatura = "La abreviatura es obligatoria";
      }
      if (Object.keys(faltantes).length) {
        UI.mostrarErrores(form, { campos: faltantes });
        return;
      }

      UI.cargando(botonGuardar, true);
      try {
        if (editando) await API.put(`${catalogo.url}/${registro.id}`, datos);
        else await API.post(catalogo.url, datos);

        instancia.hide();
        UI.aviso(`Se guardó ${catalogo.articulo} ${catalogo.singular} '${datos.nombre.trim()}'`);
        tabla.recargar();
      } catch (error) {
        // Nombre repetido: el mensaje se muestra debajo del campo nombre
        if (error.estado === 409) UI.mostrarErrores(form, { campos: { nombre: error.message } });
        else UI.mostrarErrores(form, error);
      } finally {
        UI.cargando(botonGuardar, false);
      }
    });

    modal.addEventListener("shown.bs.modal", () => form.querySelector("#cat-nombre").focus(), { once: true });
    instancia.show();
  }

  // ===================== Desactivar y reactivar =====================
  async function desactivar(registro) {
    const catalogo = actual;
    const ok = await UI.confirmar({
      titulo: `¿Desactivar ${catalogo.articulo} ${catalogo.singular}?`,
      mensaje: `'${registro.nombre}' ya no aparecerá para elegirse en los formularios.\nPuedes reactivarlo después cuando lo necesites.`,
      textoAceptar: "Desactivar",
      peligro: true,
    });
    if (!ok) return;
    try {
      const respuesta = await API.patch(`${catalogo.url}/${registro.id}/desactivar`);
      UI.aviso(respuesta.mensaje);
      tabla.recargar();
    } catch (error) {
      UI.error(error, "No se pudo desactivar");
    }
  }

  async function reactivar(registro) {
    const catalogo = actual;
    const ok = await UI.confirmar({
      titulo: `¿Reactivar ${catalogo.articulo} ${catalogo.singular}?`,
      mensaje: `'${registro.nombre}' volverá a aparecer en los formularios.`,
      textoAceptar: "Reactivar",
    });
    if (!ok) return;
    try {
      const respuesta = await API.patch(`${catalogo.url}/${registro.id}/reactivar`);
      UI.aviso(respuesta.mensaje);
      tabla.recargar();
    } catch (error) {
      UI.error(error, "No se pudo reactivar");
    }
  }

  App.registrar("catalogos", { render });
})();