const Formulario = {
  // ===================== Botones y estados que se repiten =====================
  botonNuevo(texto = "Nuevo") {
    return `<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>${UI.escapar(texto)}</button>`;
  },

  botonesFila(fila) {
    return `
      <button class="btn-accion" data-accion="editar" title="Editar"><i class="bi bi-pencil"></i></button>
      ${fila.activo
        ? `<button class="btn-accion peligro" data-accion="desactivar" title="Desactivar"><i class="bi bi-slash-circle"></i></button>`
        : `<button class="btn-accion" data-accion="reactivar" title="Reactivar"><i class="bi bi-arrow-counterclockwise"></i></button>`}`;
  },

  badgeEstado(activo) {
    return activo
      ? `<span class="badge estado-badge activo">Activo</span>`
      : `<span class="badge estado-badge inactivo">Inactivo</span>`;
  },

  /** Pregunta y luego desactiva o reactiva. url: "/api/clientes/5" */
  async cambiarEstado({ url, nombre, etiqueta, activar, tabla, mensajeDesactivar }) {
    const ok = await UI.confirmar({
      titulo: `¿${activar ? "Reactivar" : "Desactivar"} ${etiqueta}?`,
      mensaje: activar
        ? `'${nombre}' volverá a estar disponible en el sistema.`
        : (mensajeDesactivar || `'${nombre}' ya no aparecerá para elegirse en los formularios.\nPuedes reactivarlo después cuando lo necesites.`),
      textoAceptar: activar ? "Reactivar" : "Desactivar",
      peligro: !activar,
    });
    if (!ok) return;
    try {
      const respuesta = await API.patch(`${url}/${activar ? "reactivar" : "desactivar"}`);
      UI.aviso(respuesta.mensaje);
      if (respuesta.aviso) UI.alerta({ tipo: "info", titulo: "Ten en cuenta", mensaje: respuesta.aviso });
      tabla?.recargar();
    } catch (error) {
      UI.error(error, `No se pudo ${activar ? "reactivar" : "desactivar"}`);
    }
  },

  // ===================== Modal =====================
  _modal() {
    let modal = document.getElementById("modal-formulario");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-formulario";
      modal.className = "modal fade";
      modal.tabIndex = -1;
      modal.innerHTML = `<div class="modal-dialog"><div class="modal-content"></div></div>`;
      document.body.appendChild(modal);
    }
    return modal;
  },

  /** Cierra el formulario si está abierto (se usa al cambiar de módulo) */
  cerrar() {
    const modal = document.getElementById("modal-formulario");
    if (modal) bootstrap.Modal.getInstance(modal)?.hide();
  },

  _campoHtml(campo, valor) {
    const id = `f-${campo.nombre}`;
    const requerido = campo.requerido ? ` <span class="text-danger">*</span>` : "";
    const ayuda = campo.ayuda ? `<div class="form-text">${UI.escapar(campo.ayuda)}</div>` : "";
    const v = valor ?? "";

    if (campo.tipo === "checkbox") {
      return `
        <div class="col-12">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch" id="${id}" name="${campo.nombre}" ${v ? "checked" : ""}>
            <label class="form-check-label" for="${id}">${UI.escapar(campo.etiqueta)}</label>
          </div>
          ${ayuda}
        </div>`;
    }

    const etiqueta = `<label class="form-label" for="${id}">${UI.escapar(campo.etiqueta)}${requerido}</label>`;
    let control;

    if (campo.tipo === "area") {
      control = `<textarea class="form-control" id="${id}" name="${campo.nombre}" rows="${campo.filas || 3}"
        ${campo.max ? `maxlength="${campo.max}"` : ""} placeholder="${UI.escapar(campo.placeholder || "")}">${UI.escapar(v)}</textarea>`;
    } else if (campo.tipo === "select") {
      const opciones = [...(campo.opciones || [])];
      // Si el valor guardado ya está inactivo, igual se muestra para no perderlo al editar
      if (campo.actual?.valor != null && !opciones.some((o) => String(o.valor) === String(campo.actual.valor))) {
        opciones.unshift({ valor: campo.actual.valor, texto: `${campo.actual.texto} (inactivo)` });
      }
      control = `
        <select class="form-select" id="${id}" name="${campo.nombre}" ${campo.numerico ? 'data-tipo="numero"' : ""}>
          ${campo.sinVacio ? "" : `<option value="">${UI.escapar(campo.placeholder || "Selecciona...")}</option>`}
          ${opciones.map((o) => `
            <option value="${UI.escapar(o.valor)}" ${String(o.valor) === String(v) ? "selected" : ""}>${UI.escapar(o.texto)}</option>`).join("")}
        </select>`;
    } else {
      const tipos = { texto: "text", email: "email", telefono: "tel", numero: "number", fecha: "date" };
      const extra = [];
      if (campo.max) extra.push(`maxlength="${campo.max}"`);
      if (campo.tipo === "numero") {
        extra.push(`step="${campo.paso ?? "0.01"}"`);
        if (campo.min != null) extra.push(`min="${campo.min}"`);
        if (campo.maximo != null) extra.push(`max="${campo.maximo}"`);
      }
      if (campo.tipo === "telefono") extra.push(`maxlength="9" inputmode="numeric"`);
      const placeholder = campo.placeholder || (campo.tipo === "telefono" ? "1234-5678" : "");
      control = `<input type="${tipos[campo.tipo] || "text"}" class="form-control" id="${id}" name="${campo.nombre}"
        value="${UI.escapar(v)}" placeholder="${UI.escapar(placeholder)}" ${extra.join(" ")}>`;
      if (campo.prefijo) {
        control = `<div class="input-group has-validation"><span class="input-group-text">${UI.escapar(campo.prefijo)}</span>${control}</div>`;
      }
    }

    return `<div class="col-md-${campo.columnas || 12}">${etiqueta}${control}${ayuda}</div>`;
  },

  /**
   * Abre el formulario.
   * alGuardar(datos): hace el POST o PUT. Si lanza error, el error se muestra en el formulario.
   * campoDuplicado: en qué campo mostrar el error de "ya existe" (409), ej. "nit" o "dpi".
   */
  abrir({ titulo, icono = "bi-pencil-square", campos, valores = {}, ancho = "",
          textoGuardar = "Guardar", campoDuplicado = null, alGuardar }) {
    const modal = this._modal();
    modal.querySelector(".modal-dialog").className = `modal-dialog modal-dialog-centered modal-dialog-scrollable ${ancho}`;
    modal.querySelector(".modal-content").innerHTML = `
      <form novalidate>
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi ${icono} me-2"></i>${UI.escapar(titulo)}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="alert alert-danger rounded-4 error-general d-none" role="alert"></div>
          <div class="row g-3">
            ${campos.map((c) => this._campoHtml(c, valores[c.nombre])).join("")}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-vidrio" data-bs-dismiss="modal">Cancelar</button>
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2 me-1"></i>${UI.escapar(textoGuardar)}</button>
        </div>
      </form>`;

    const form = modal.querySelector("form");
    const botonGuardar = form.querySelector('button[type="submit"]');
    const instancia = bootstrap.Modal.getOrCreateInstance(modal);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      UI.limpiarErrores(form);
      const datos = UI.leerFormulario(form);

      // Revisión rápida de obligatorios (el servidor igual valida todo)
      const faltantes = {};
      for (const c of campos) {
        const valor = datos[c.nombre];
        if (c.requerido && (valor === null || valor === undefined || String(valor).trim() === "")) {
          faltantes[c.nombre] = `${c.etiqueta} es obligatorio`;
        }
      }
      if (Object.keys(faltantes).length) {
        UI.mostrarErrores(form, { campos: faltantes });
        return;
      }

      UI.cargando(botonGuardar, true);
      try {
        await alGuardar(datos);
        instancia.hide();
      } catch (error) {
        if (error.estado === 409 && campoDuplicado) UI.mostrarErrores(form, { campos: { [campoDuplicado]: error.message } });
        else UI.mostrarErrores(form, error);
      } finally {
        UI.cargando(botonGuardar, false);
      }
    });

    modal.addEventListener("shown.bs.modal", () => form.querySelector("input, select, textarea")?.focus(), { once: true });
    instancia.show();
  },
};