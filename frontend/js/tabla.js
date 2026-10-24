class TablaPaginada {
  constructor(opciones) {
    this.o = {
      porPagina: 20,
      filtroActivo: true,
      buscador: true,
      textoBuscar: "Buscar...",
      vacio: "No hay registros",
      parametros: () => ({}),
      claseFila: () => "",
      ...opciones,
    };
    this.pagina = 1;
    this.porPagina = this.o.porPagina;
    this.buscar = "";
    this.activo = this.o.filtroActivo ? "true" : "";
    this.items = [];
    this._peticion = 0;

    this.pintarEstructura();
    this.cargar();
  }

  /** Controles de fecha listos para poner en "botones" */
  static filtrosFecha() {
    return `
      <input type="date" class="form-control filtro" data-filtro="desde" title="Desde">
      <input type="date" class="form-control filtro" data-filtro="hasta" title="Hasta">`;
  }

  /** Valor actual de un filtro: tabla.filtro("desde") */
  filtro(nombre) {
    return this.o.contenedor.querySelector(`[data-filtro="${nombre}"]`)?.value || "";
  }

  get totalColumnas() {
    return this.o.columnas.length + (this.o.acciones ? 1 : 0);
  }

  pintarEstructura() {
    const c = this.o.contenedor;
    c.innerHTML = `
      <div class="barra-tabla">
        ${this.o.buscador ? `
          <div class="campo-pill buscador">
            <i class="bi bi-search icono-izq"></i>
            <input type="search" class="form-control" placeholder="${UI.escapar(this.o.textoBuscar)}" data-rol="buscar">
          </div>` : ""}
        ${this.o.filtroActivo ? `
          <select class="form-select filtro-estado" data-rol="activo">
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
            <option value="">Todos</option>
          </select>` : ""}
        <div class="ms-auto d-flex flex-wrap gap-2">${this.o.botones || ""}</div>
      </div>
      <div class="table-responsive">
        <table class="table align-middle">
          <thead>
            <tr>
              ${this.o.columnas.map((col) => `<th class="${col.clase || ""}">${UI.escapar(col.titulo)}</th>`).join("")}
              ${this.o.acciones ? `<th class="text-end">Acciones</th>` : ""}
            </tr>
          </thead>
          <tbody data-rol="cuerpo"></tbody>
        </table>
      </div>
      <div class="paginacion" data-rol="pie"></div>`;

    this.cuerpo = c.querySelector('[data-rol="cuerpo"]');
    this.pie = c.querySelector('[data-rol="pie"]');

    // Búsqueda: espera a que el usuario deje de escribir
    let espera;
    c.querySelector('[data-rol="buscar"]')?.addEventListener("input", (e) => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        this.buscar = e.target.value.trim();
        this.pagina = 1;
        this.cargar();
      }, 350);
    });

    c.querySelector('[data-rol="activo"]')?.addEventListener("change", (e) => {
      this.activo = e.target.value;
      this.pagina = 1;
      this.cargar();
    });

    // Filtros extra (fechas, ubicación, estado...)
    c.querySelectorAll("[data-filtro]").forEach((control) =>
      control.addEventListener("change", () => {
        const desde = this.filtro("desde");
        const hasta = this.filtro("hasta");
        if (desde && hasta && desde > hasta) {
          UI.alerta({
            tipo: "advertencia",
            titulo: "Revisa las fechas",
            mensaje: "La fecha 'Desde' no puede ser mayor que la fecha 'Hasta'.",
          });
          return;
        }
        this.pagina = 1;
        this.cargar();
      }));

    // Botones de cada fila (un solo escuchador para toda la tabla)
    this.cuerpo.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-accion]");
      if (!boton) return;
      const fila = this.items[Number(boton.closest("tr").dataset.indice)];
      if (fila && this.o.alAccionar) this.o.alAccionar(boton.dataset.accion, fila, boton);
    });

    // Paginación
    this.pie.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-pagina]");
      if (!boton || boton.disabled) return;
      this.pagina = Number(boton.dataset.pagina);
      this.cargar();
    });
    this.pie.addEventListener("change", (e) => {
      if (e.target.dataset.rol !== "por-pagina") return;
      this.porPagina = Number(e.target.value);
      this.pagina = 1;
      this.cargar();
    });
  }

  filaMensaje(html) {
    this.cuerpo.innerHTML = `<tr><td colspan="${this.totalColumnas}">${html}</td></tr>`;
  }

  async cargar() {
    const numero = ++this._peticion;
    this.filaMensaje(`<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-secondary"></div></div>`);

    try {
      const respuesta = await API.get(this.o.url, {
        pagina: this.pagina,
        por_pagina: this.porPagina,
        buscar: this.buscar,
        activo: this.activo,
        ...this.o.parametros(this),
      });
      if (numero !== this._peticion) return;   // llegó tarde, ya hay otra búsqueda más nueva

      // Si la página quedó vacía (por ejemplo, al desactivar el último), se regresa una
      if (!respuesta.items.length && this.pagina > 1) {
        this.pagina -= 1;
        return this.cargar();
      }

      this.items = respuesta.items;
      this.pintarFilas();
      this.pintarPie(respuesta);
    } catch (error) {
      if (numero !== this._peticion) return;
      this.filaMensaje(`<div class="vacio"><i class="bi bi-exclamation-triangle"></i>${UI.escapar(error.message)}</div>`);
      this.pie.innerHTML = "";
    }
  }

  recargar() {
    return this.cargar();
  }

  pintarFilas() {
    if (!this.items.length) {
      const mensaje = this.buscar ? `No se encontraron resultados para "${UI.escapar(this.buscar)}"` : UI.escapar(this.o.vacio);
      this.filaMensaje(`<div class="vacio"><i class="bi bi-inbox"></i>${mensaje}</div>`);
      return;
    }
    this.cuerpo.innerHTML = this.items.map((fila, indice) => `
      <tr data-indice="${indice}" class="${this.o.claseFila(fila)}">
        ${this.o.columnas.map((col) => `
          <td class="${col.clase || ""}">${col.render ? col.render(fila) : UI.escapar(fila[col.campo] ?? "")}</td>`).join("")}
        ${this.o.acciones ? `<td class="text-end text-nowrap">${this.o.acciones(fila)}</td>` : ""}
      </tr>`).join("");
  }

  pintarPie({ total, pagina, por_pagina }) {
    const paginas = Math.max(1, Math.ceil(total / por_pagina));
    const desde = total ? (pagina - 1) * por_pagina + 1 : 0;
    const hasta = Math.min(total, pagina * por_pagina);
    const opciones = [10, 20, 50, 100]
      .map((n) => `<option value="${n}" ${n === por_pagina ? "selected" : ""}>${n}</option>`).join("");

    this.pie.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <span>Mostrar</span>
        <select class="form-select form-select-sm" data-rol="por-pagina">${opciones}</select>
        <span>por página</span>
      </div>
      <span>Mostrando ${desde}–${hasta} de ${total}</span>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-vidrio btn-sm" data-pagina="${pagina - 1}" ${pagina <= 1 ? "disabled" : ""}>
          <i class="bi bi-chevron-left"></i>
        </button>
        <span>Página ${pagina} de ${paginas}</span>
        <button class="btn btn-vidrio btn-sm" data-pagina="${pagina + 1}" ${pagina >= paginas ? "disabled" : ""}>
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>`;
  }
}