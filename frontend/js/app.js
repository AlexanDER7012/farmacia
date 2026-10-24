/**
 * app.js
 * - Carga el usuario de la sesión (si no hay, manda al login).
 * - Arma el menú según el rol.
 * - Navega entre módulos con la URL (#/productos), así F5 no te saca del módulo.
 * - Abre y cierra el menú lateral.
 * - Tema claro / oscuro.
 */
const ROLES = { ADMIN: "Administrador", VENDEDOR: "Vendedor", BODEGUERO: "Bodeguero" };

// roles: null = todos; [] = solo Administrador; si no, lista de roles permitidos
// (el Administrador siempre tiene acceso)
const MENU = [
  { seccion: "Inicio", items: [
    { id: "panel", titulo: "Panel", icono: "bi-grid-1x2", roles: null },
  ]},
  { seccion: "Ventas", items: [
    { id: "punto-venta", titulo: "Punto de venta", icono: "bi-cart3", roles: [ROLES.VENDEDOR] },
    { id: "ventas", titulo: "Historial de ventas", icono: "bi-receipt", roles: [ROLES.VENDEDOR] },
    { id: "clientes", titulo: "Clientes", icono: "bi-people", roles: [ROLES.VENDEDOR] },
    { id: "caja", titulo: "Caja y gastos", icono: "bi-cash-coin", roles: [ROLES.VENDEDOR] },
  ]},
  { seccion: "Inventario", items: [
    { id: "productos", titulo: "Productos", icono: "bi-capsule", roles: null },
    { id: "existencias", titulo: "Existencias", icono: "bi-box-seam", roles: null },
    { id: "movimientos", titulo: "Movimientos", icono: "bi-arrow-left-right", roles: null },
  ]},
  { seccion: "Compras", items: [
    { id: "compras", titulo: "Compras", icono: "bi-bag-check", roles: [ROLES.BODEGUERO] },
    { id: "proveedores", titulo: "Proveedores", icono: "bi-truck", roles: [ROLES.BODEGUERO] },
  ]},
  { seccion: "Catálogos", items: [
    { id: "catalogos", titulo: "Catálogos", icono: "bi-tags", roles: null },
  ]},
  { seccion: "Administración", items: [
    { id: "empleados", titulo: "Empleados", icono: "bi-person-badge", roles: [] },
    { id: "usuarios", titulo: "Usuarios", icono: "bi-person-lock", roles: [] },
    { id: "ubicaciones", titulo: "Ubicaciones y puestos", icono: "bi-geo-alt", roles: [] },
    { id: "configuracion", titulo: "Configuración", icono: "bi-gear", roles: [] },
    { id: "bitacora", titulo: "Bitácora", icono: "bi-journal-text", roles: [] },
  ]},
];

const App = {
  usuario: null,
  config: null,
  modulos: {},
  alSalir: null,   // función que el módulo actual quiere ejecutar al cambiar de pantalla

  /** Cada archivo de /js/modulos se registra así: App.registrar("productos", { render(contenedor) {...} }) */
  registrar(id, modulo) {
    this.modulos[id] = modulo;
  },

  esAdmin() {
    return this.usuario?.rol === ROLES.ADMIN;
  },

  /** ¿El usuario tiene alguno de estos roles? (el Administrador siempre sí) */
  tiene(...roles) {
    return this.esAdmin() || roles.includes(this.usuario?.rol);
  },

  puedeVer(item) {
    return item.roles === null || this.tiene(...item.roles);
  },

  buscarItem(id) {
    for (const grupo of MENU) {
      const item = grupo.items.find((i) => i.id === id);
      if (item) return item;
    }
    return null;
  },

  // ===================== Inicio =====================
  async iniciar() {
    UI.tema.preparar();

    try {
      this.usuario = await API.get("/api/auth/me");
    } catch {
      location.replace("/login.html");
      return;
    }
    try {
      this.config = await API.get("/api/configuracion");
    } catch {
      this.config = { nombre_negocio: "Farmacia", moneda: "Q", dias_alerta_vencimiento: 90 };
    }

    this.pintarPerfil();
    this.pintarMenu();
    this.prepararMenuLateral();
    this.iniciarReloj();

    document.getElementById("cerrar-sesion").addEventListener("click", (e) => {
      e.preventDefault();
      this.cerrarSesion();
    });

    // Al cambiar el tema, se vuelve a dibujar el módulo (para que la gráfica tome los colores nuevos)
    document.addEventListener("tema-cambiado", () => this.navegar());

    window.addEventListener("hashchange", () => this.navegar());
    this.navegar();
  },

  pintarPerfil() {
    const nombre = this.usuario.nombre_completo;
    const iniciales = nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    document.getElementById("avatar").textContent = iniciales;
    document.getElementById("perfil-nombre").textContent = nombre;
    document.getElementById("perfil-nombre").title = nombre;
    document.getElementById("perfil-rol").textContent = `${this.usuario.rol} · ${this.usuario.ubicacion}`;
    document.getElementById("nombre-negocio").textContent = this.config.nombre_negocio;
    document.title = this.config.nombre_negocio;
  },

  pintarMenu() {
    const nav = document.getElementById("menu-navegacion");
    nav.innerHTML = MENU.map((grupo) => {
      const visibles = grupo.items.filter((i) => this.puedeVer(i));
      if (!visibles.length) return "";
      return `
        <div class="menu-seccion">${grupo.seccion}</div>
        ${visibles.map((i) => `
          <a href="#/${i.id}" class="menu-enlace" data-modulo="${i.id}" title="${i.titulo}">
            <i class="bi ${i.icono}"></i><span class="texto-menu">${i.titulo}</span>
          </a>`).join("")}`;
    }).join("");
  },

  // ===================== Menú lateral =====================
  prepararMenuLateral() {
    const esCelular = () => window.matchMedia("(max-width: 991.98px)").matches;

    try {
      if (localStorage.getItem("menu-contraido") === "1") document.body.classList.add("menu-contraido");
    } catch { /* sin almacenamiento, no pasa nada */ }

    document.getElementById("boton-menu").addEventListener("click", () => {
      if (esCelular()) {
        document.body.classList.toggle("menu-abierto");
      } else {
        const contraido = document.body.classList.toggle("menu-contraido");
        try { localStorage.setItem("menu-contraido", contraido ? "1" : "0"); } catch { /* nada */ }
      }
    });

    // En celular, se cierra al tocar fuera o al elegir un módulo
    document.getElementById("fondo-menu").addEventListener("click", () => document.body.classList.remove("menu-abierto"));
    document.getElementById("menu-navegacion").addEventListener("click", (e) => {
      if (e.target.closest(".menu-enlace")) document.body.classList.remove("menu-abierto");
    });
  },

  iniciarReloj() {
    const actualizar = () => {
      const ahora = new Date();
      document.getElementById("reloj-hora").textContent =
        ahora.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
      document.getElementById("reloj-fecha").textContent =
        ahora.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" });
    };
    actualizar();
    setInterval(actualizar, 30000);
  },

  // ===================== Navegación =====================
  async navegar() {
    const id = (location.hash.replace("#/", "") || "panel").split("?")[0];
    const item = this.buscarItem(id);

    if (!item || !this.puedeVer(item)) {
      if (id !== "panel") {
        UI.alerta({
          tipo: "advertencia",
          titulo: "Sin acceso",
          mensaje: "Tu rol no tiene permiso para entrar a ese módulo.",
        });
      }
      location.hash = "#/panel";
      return;
    }

    if (typeof this.alSalir === "function") {
      try { this.alSalir(); } catch { /* nada */ }
    }
    this.alSalir = null;

    document.querySelectorAll(".menu-enlace[data-modulo]").forEach((a) =>
      a.classList.toggle("activo", a.dataset.modulo === id));
    document.getElementById("titulo-pagina").textContent = item.titulo;

    const vista = document.getElementById("vista");
    const modulo = this.modulos[id];
    if (!modulo) {
      vista.innerHTML = `
        <div class="card vacio py-5">
          <i class="bi bi-cone-striped"></i>
          <h5 class="mt-2">${item.titulo}</h5>
          <p class="mb-0">Este módulo se agrega en los siguientes pasos.</p>
        </div>`;
      return;
    }

    vista.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>`;
    try {
      await modulo.render(vista);
    } catch (error) {
      vista.innerHTML = `
        <div class="card vacio py-5">
          <i class="bi bi-exclamation-triangle"></i>
          ${UI.escapar(error.message)}
        </div>`;
    }
  },

  async cerrarSesion() {
    const salir = await UI.confirmar({
      titulo: "¿Cerrar sesión?",
      mensaje: "Tendrás que volver a ingresar tu usuario y contraseña.",
      textoAceptar: "Cerrar sesión",
    });
    if (!salir) return;
    try { await API.post("/api/auth/logout"); } catch { /* igual se sale */ }
    location.replace("/login.html");
  },
};

document.addEventListener("DOMContentLoaded", () => App.iniciar());