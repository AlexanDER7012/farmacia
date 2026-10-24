(() => {
  async function render(contenedor) {
    const puedeEditar = App.tiene(ROLES.BODEGUERO);
    const moneda = App.config.moneda || "Q";

    const [categorias, laboratorios, principios, presentaciones, unidades] = await Promise.all([
      "/api/categorias/opciones", "/api/laboratorios/opciones", "/api/principios-activos/opciones",
      "/api/presentaciones/opciones", "/api/unidades-medida/opciones",
    ].map((url) => API.get(url)));
    const op = (lista) => lista.map((r) => ({ valor: r.id, texto: r.nombre }));

    contenedor.innerHTML = `<div class="card p-3 p-md-4"><div id="tabla-productos"></div></div>`;

    const tabla = new TablaPaginada({
      contenedor: contenedor.querySelector("#tabla-productos"),
      url: "/api/consultas/productos",
      textoBuscar: "Buscar por nombre, código o principio activo...",
      vacio: "No hay productos registrados",
      claseFila: (f) => (f.activo ? "" : "fila-inactiva"),
      columnas: [
        { titulo: "Producto", render: (f) => `
            <div class="fw-semibold">${UI.escapar(f.nombre)}
              ${f.requiere_receta ? `<span class="badge text-bg-warning ms-1" title="Requiere receta"><i class="bi bi-file-medical"></i> Receta</span>` : ""}
            </div>
            <div class="descripcion-fila">${UI.escapar(f.codigo)}${f.principio_activo ? ` · ${UI.escapar(f.principio_activo)}` : ""}${f.concentracion ? ` ${UI.escapar(f.concentracion)}` : ""}</div>` },
        { titulo: "Categoría", render: (f) => UI.escapar(f.categoria) },
        { titulo: "Laboratorio", render: (f) => UI.escapar(f.laboratorio) },
        { titulo: "Presentación", render: (f) => `${UI.escapar(f.presentacion)} <span class="small text-secondary">(${UI.escapar(f.unidad)})</span>` },
        { titulo: "Precio", clase: "text-end text-nowrap", render: (f) => {
            const perdida = Number(f.precio_venta) < Number(f.precio_compra);
            return `
              <div class="fw-semibold">${UI.moneda(f.precio_venta, moneda)}
                ${perdida ? `<i class="bi bi-exclamation-triangle-fill text-warning" title="Precio de venta menor que el costo"></i>` : ""}
              </div>
              <div class="small text-secondary">Costo ${UI.moneda(f.precio_compra, moneda)}</div>`;
          } },
        { titulo: "Stock", clase: "text-end", render: (f) => {
            const stock = Number(f.stock_total);
            const minimo = Number(f.stock_minimo);
            if (stock <= 0) return `<span class="badge text-bg-danger">Agotado</span>`;
            if (minimo > 0 && stock <= minimo) return `<span class="badge text-bg-warning">${UI.numero(stock)} · bajo</span>`;
            return `<span class="fw-bold">${UI.numero(stock)}</span>`;
          } },
        { titulo: "Estado", render: (f) => Formulario.badgeEstado(f.activo) },
      ],
      botones: puedeEditar ? Formulario.botonNuevo("Nuevo producto") : "",
      acciones: puedeEditar ? (f) => Formulario.botonesFila(f) : null,
      alAccionar: (accion, f) => {
        if (accion === "editar") abrir(f);
        else Formulario.cambiarEstado({
          url: `/api/productos/${f.id}`, nombre: f.nombre, etiqueta: "el producto",
          activar: accion === "reactivar", tabla,
          mensajeDesactivar: `'${f.nombre}' no recibirá entradas, salidas ni ventas hasta que se reactive.`,
        });
      },
    });

    contenedor.querySelector("[data-nuevo]")?.addEventListener("click", () => abrir(null));

    async function abrir(fila) {
      let p = null;
      if (fila) {
        try {
          p = await API.get(`/api/productos/${fila.id}`);
        } catch (error) {
          UI.error(error);
          return;
        }
      }
      const actual = (ref) => (ref ? { valor: ref.id, texto: ref.nombre } : null);

      // Modal extra ancho: 3 o 4 campos por fila
      const campos = [
        // Fila 1: identificación
        { nombre: "codigo", etiqueta: "Código", requerido: true, max: 50, columnas: 3, placeholder: "Ej: PAR-500" },
        { nombre: "nombre", etiqueta: "Nombre", requerido: true, max: 150, columnas: 6, placeholder: "Ej: Acetaminofén 500 mg" },
        { nombre: "concentracion", etiqueta: "Concentración", max: 50, columnas: 3, placeholder: "Ej: 500 mg" },

        // Fila 2: clasificación
        { nombre: "id_principio_activo", etiqueta: "Principio activo", tipo: "select", numerico: true, columnas: 3,
          placeholder: "Ninguno", opciones: op(principios), actual: actual(p?.principio_activo) },
        { nombre: "id_categoria", etiqueta: "Categoría", tipo: "select", requerido: true, numerico: true, columnas: 3,
          opciones: op(categorias), actual: actual(p?.categoria) },
        { nombre: "id_laboratorio", etiqueta: "Laboratorio", tipo: "select", requerido: true, numerico: true, columnas: 3,
          opciones: op(laboratorios), actual: actual(p?.laboratorio) },
        { nombre: "id_presentacion", etiqueta: "Presentación", tipo: "select", requerido: true, numerico: true, columnas: 3,
          opciones: op(presentaciones), actual: actual(p?.presentacion) },

        // Fila 3: venta y precios
        { nombre: "id_unidad_medida", etiqueta: "Unidad de venta", tipo: "select", requerido: true, numerico: true, columnas: 3,
          opciones: op(unidades), actual: actual(p?.unidad_medida) },
        { nombre: "precio_compra", etiqueta: "Precio de compra", tipo: "numero", min: 0, prefijo: moneda, columnas: 3 },
        { nombre: "precio_venta", etiqueta: "Precio de venta", tipo: "numero", min: 0, prefijo: moneda, columnas: 3 },
        { nombre: "stock_minimo", etiqueta: "Stock mínimo", tipo: "numero", min: 0, columnas: 3,
          ayuda: "Avisa cuando baje de aquí" },

        // Fila 4: resto
        { nombre: "stock_maximo", etiqueta: "Stock máximo", tipo: "numero", min: 0, columnas: 3, ayuda: "0 = sin máximo" },
        { nombre: "descripcion", etiqueta: "Descripción", tipo: "area", filas: 2, columnas: 9 },

        { nombre: "requiere_receta", etiqueta: "Requiere receta médica", tipo: "checkbox" },
      ];

      const valores = p
        ? {
            ...p,
            id_categoria: p.categoria.id,
            id_laboratorio: p.laboratorio.id,
            id_principio_activo: p.principio_activo?.id,
            id_presentacion: p.presentacion.id,
            id_unidad_medida: p.unidad_medida.id,
          }
        : { precio_compra: 0, precio_venta: 0, stock_minimo: 0, stock_maximo: 0 };

      Formulario.abrir({
        titulo: p ? "Editar producto" : "Nuevo producto",
        icono: "bi-capsule",
        campos,
        valores,
        ancho: "modal-xl",
        campoDuplicado: "codigo",
        alGuardar: async (datos) => {
          for (const campo of ["precio_compra", "precio_venta", "stock_minimo", "stock_maximo"]) {
            if (datos[campo] === null) datos[campo] = 0;
          }
          const guardado = p
            ? await API.put(`/api/productos/${p.id}`, datos)
            : await API.post("/api/productos", datos);
          UI.aviso(`Se guardó el producto '${guardado.nombre}'`);
          tabla.recargar();
          if (guardado.aviso) {
            setTimeout(() => UI.alerta({
              tipo: "advertencia",
              titulo: "Venta con pérdida",
              mensaje: `${guardado.aviso}.\nEl producto se guardó de todas formas.`,
            }), 400);
          }
        },
      });
    }

    App.alSalir = () => Formulario.cerrar();
  }

  App.registrar("productos", { render });
})();