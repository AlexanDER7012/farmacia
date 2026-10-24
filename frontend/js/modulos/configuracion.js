/**
 * Configuración general de la farmacia (solo Administrador). Un solo formulario.
 */
(() => {
  async function render(contenedor) {
    const [config, ubicaciones] = await Promise.all([
      API.get("/api/configuracion"),
      API.get("/api/ubicaciones/opciones"),
    ]);

    const opcionesUbicacion = ubicaciones.map((u) => `
      <option value="${u.id}" ${u.id === config.ubicacion_defecto?.id ? "selected" : ""}>${UI.escapar(u.nombre)}</option>`).join("");

    contenedor.innerHTML = `
      <div class="card p-3 p-md-4" style="max-width: 900px">
        <form id="form-config" novalidate>
          <div class="alert alert-danger rounded-4 error-general d-none" role="alert"></div>

          <div class="seccion-formulario"><i class="bi bi-shop me-2"></i>Datos de la farmacia</div>
          <div class="row g-3 mb-4">
            <div class="col-md-6">
              <label class="form-label" for="c-nombre">Nombre del negocio <span class="text-danger">*</span></label>
              <input class="form-control" id="c-nombre" name="nombre_negocio" maxlength="100"
                     value="${UI.escapar(config.nombre_negocio)}">
            </div>
            <div class="col-md-6">
              <label class="form-label" for="c-nit">NIT</label>
              <input class="form-control" id="c-nit" name="nit" maxlength="20" value="${UI.escapar(config.nit || "")}">
            </div>
            <div class="col-md-6">
              <label class="form-label" for="c-telefono">Teléfono</label>
              <input type="tel" class="form-control" id="c-telefono" name="telefono" maxlength="9"
                     placeholder="1234-5678" value="${UI.escapar(config.telefono || "")}">
            </div>
            <div class="col-md-6">
              <label class="form-label" for="c-correo">Correo</label>
              <input type="email" class="form-control" id="c-correo" name="correo" maxlength="100"
                     value="${UI.escapar(config.correo || "")}">
            </div>
            <div class="col-12">
              <label class="form-label" for="c-direccion">Dirección</label>
              <input class="form-control" id="c-direccion" name="direccion" maxlength="255"
                     value="${UI.escapar(config.direccion || "")}">
            </div>
          </div>

          <div class="seccion-formulario"><i class="bi bi-sliders me-2"></i>Funcionamiento</div>
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label" for="c-iva">IVA (%) <span class="text-danger">*</span></label>
              <input type="number" class="form-control" id="c-iva" name="iva_porcentaje" min="0" max="100" step="0.01"
                     value="${UI.escapar(config.iva_porcentaje)}">
            </div>
            <div class="col-md-3">
              <label class="form-label" for="c-moneda">Moneda <span class="text-danger">*</span></label>
              <input class="form-control" id="c-moneda" name="moneda" maxlength="10" value="${UI.escapar(config.moneda)}">
            </div>
            <div class="col-md-6">
              <label class="form-label" for="c-dias">Avisar vencimientos con (días) <span class="text-danger">*</span></label>
              <input type="number" class="form-control" id="c-dias" name="dias_alerta_vencimiento" min="0" max="365" step="1"
                     value="${UI.escapar(config.dias_alerta_vencimiento)}">
              <div class="form-text">Los lotes que vencen dentro de estos días aparecen en las alertas del panel.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="c-ubicacion">Ubicación por defecto</label>
              <select class="form-select" id="c-ubicacion" name="id_ubicacion_defecto" data-tipo="numero">
                <option value="">Sin ubicación por defecto</option>
                ${opcionesUbicacion}
              </select>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center mt-4">
            <span class="small text-secondary">Última actualización: ${UI.fechaHora(config.fecha_actualizacion)}</span>
            <button type="submit" class="btn btn-primary"><i class="bi bi-check2 me-1"></i>Guardar cambios</button>
          </div>
        </form>
      </div>`;

    const form = contenedor.querySelector("#form-config");
    const boton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      UI.limpiarErrores(form);
      const datos = UI.leerFormulario(form);

      const faltantes = {};
      if (!datos.nombre_negocio?.trim()) faltantes.nombre_negocio = "El nombre del negocio es obligatorio";
      if (datos.iva_porcentaje === null) faltantes.iva_porcentaje = "El IVA es obligatorio";
      if (!datos.moneda?.trim()) faltantes.moneda = "La moneda es obligatoria";
      if (datos.dias_alerta_vencimiento === null) faltantes.dias_alerta_vencimiento = "Indica los días";
      if (Object.keys(faltantes).length) {
        UI.mostrarErrores(form, { campos: faltantes });
        return;
      }

      UI.cargando(boton, true);
      try {
        App.config = await API.put("/api/configuracion", datos);
        App.pintarPerfil();   // actualiza el nombre del negocio en el menú
        UI.aviso("Se guardó la configuración");
      } catch (error) {
        UI.mostrarErrores(form, error);
      } finally {
        UI.cargando(boton, false);
      }
    });
  }

  App.registrar("configuracion", { render });
})();