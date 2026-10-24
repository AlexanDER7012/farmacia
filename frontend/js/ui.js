/**
 * ui.js
 * Utilidades de pantalla que usan todos los módulos:
 * formatos, tema claro/oscuro, recuadros de confirmación y error,
 * avisos pequeños y manejo de formularios.
 */
const UI = {
  // ===================== Formatos =====================
  /** "2026-10-23" o "2026-10-23T14:05:00" -> "23/10/2026" (sin desfase de zona horaria) */
  fecha(valor) {
    if (!valor) return "";
    const [anio, mes, dia] = String(valor).slice(0, 10).split("-");
    return `${dia}/${mes}/${anio}`;
  },

  /** "2026-10-23T14:05:00" -> "23/10/2026 14:05" */
  fechaHora(valor) {
    if (!valor) return "";
    const hora = String(valor).slice(11, 16);
    return `${UI.fecha(valor)} ${hora}`.trim();
  },

  /** 1234.5 -> "Q 1,234.50" */
  moneda(valor, simbolo = "Q") {
    const numero = Number(valor || 0);
    return `${simbolo} ${numero.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  /** 10.00 -> "10", 2.50 -> "2.5" */
  numero(valor) {
    return Number(valor || 0).toLocaleString("es-GT", { maximumFractionDigits: 2 });
  },

  /** Fecha de JavaScript -> "2026-10-23" (en hora local) */
  isoDe(fecha) {
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  },

  hoyISO() {
    return UI.isoDe(new Date());
  },

  /** "2026-10-23" + 5 días -> "2026-10-28" */
  sumarDias(iso, dias) {
    const [anio, mes, dia] = iso.split("-").map(Number);
    return UI.isoDe(new Date(anio, mes - 1, dia + dias));
  },

  /** Evita que un texto con < > se interprete como HTML */
    /** Evita que un texto se interprete como HTML (también sirve dentro de atributos value="...") */
  escapar(texto) {
    return String(texto ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  // ===================== Tema claro / oscuro =====================
  tema: {
    actual() {
      return document.documentElement.getAttribute("data-bs-theme") === "dark" ? "dark" : "light";
    },
    aplicar(tema) {
      document.documentElement.setAttribute("data-bs-theme", tema);
      try { localStorage.setItem("tema", tema); } catch { /* sin almacenamiento */ }
      document.querySelectorAll("[data-boton-tema]").forEach((b) => {
        b.innerHTML = `<i class="bi bi-${tema === "dark" ? "sun" : "moon-stars"} fs-6"></i>`;
        b.title = tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
      });
      document.dispatchEvent(new CustomEvent("tema-cambiado", { detail: tema }));
    },
    alternar() {
      UI.tema.aplicar(UI.tema.actual() === "dark" ? "light" : "dark");
    },
    /** Conecta todos los botones con data-boton-tema */
    preparar() {
      UI.tema.aplicar(UI.tema.actual());
      document.querySelectorAll("[data-boton-tema]").forEach((b) =>
        b.addEventListener("click", () => UI.tema.alternar()));
    },
  },

  // ===================== Recuadros del sistema =====================
  _cola: Promise.resolve(),

  /**
   * Recuadro con ícono, título, mensaje y botones. Devuelve una promesa:
   * true si presionó el botón principal, false si canceló o cerró.
   * tipo: "peligro", "advertencia", "info" o "exito"
   */
  _dialogo({ tipo = "info", titulo, mensaje, textoAceptar = "Aceptar", textoCancelar = null }) {
    const ejecutar = () => new Promise((resolver) => {
      const iconos = {
        peligro: "bi-exclamation-octagon",
        advertencia: "bi-exclamation-triangle",
        info: "bi-info-circle",
        exito: "bi-check2-circle",
      };
      const claseBoton = tipo === "peligro" ? "btn-peligro" : "btn-primary";

      let elemento = document.getElementById("dialogo-sistema");
      if (!elemento) {
        elemento = document.createElement("div");
        elemento.id = "dialogo-sistema";
        elemento.className = "modal fade dialogo-sistema";
        elemento.tabIndex = -1;
        elemento.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"></div></div>`;
        document.body.appendChild(elemento);
      }

      const mensajeHtml = UI.escapar(mensaje || "").replace(/\n/g, "<br>");
      elemento.querySelector(".modal-content").innerHTML = `
        <div class="icono-dialogo ${tipo}"><i class="bi ${iconos[tipo] || iconos.info}"></i></div>
        <div class="titulo-dialogo">${UI.escapar(titulo || "")}</div>
        <div class="mensaje-dialogo">${mensajeHtml}</div>
        <div class="botones-dialogo">
          ${textoCancelar ? `<button type="button" class="btn btn-vidrio" data-respuesta="no">${UI.escapar(textoCancelar)}</button>` : ""}
          <button type="button" class="btn ${claseBoton}" data-respuesta="si">${UI.escapar(textoAceptar)}</button>
        </div>`;

      const modal = bootstrap.Modal.getOrCreateInstance(elemento);
      let respuesta = false;

      elemento.querySelectorAll("[data-respuesta]").forEach((boton) =>
        boton.addEventListener("click", () => {
          respuesta = boton.dataset.respuesta === "si";
          modal.hide();
        }));

      elemento.addEventListener("shown.bs.modal", () => {
        // Si hay otro modal abierto debajo, el fondo oscuro de este queda encima de aquel
        const fondos = document.querySelectorAll(".modal-backdrop");
        if (fondos.length > 1) fondos[fondos.length - 1].style.zIndex = "1060";
        elemento.querySelector('[data-respuesta="si"]').focus();
      }, { once: true });

      elemento.addEventListener("hidden.bs.modal", () => resolver(respuesta), { once: true });
      modal.show();
    });

    // En cola: si se piden dos recuadros seguidos, se muestran uno después del otro
    const resultado = UI._cola.then(ejecutar);
    UI._cola = resultado.catch(() => {});
    return resultado;
  },

  /** Pregunta antes de hacer algo. Devuelve true o false. */
  confirmar({ titulo = "¿Estás seguro?", mensaje = "", textoAceptar = "Sí, continuar",
              textoCancelar = "Cancelar", peligro = false } = {}) {
    return UI._dialogo({
      tipo: peligro ? "peligro" : "advertencia", titulo, mensaje, textoAceptar, textoCancelar,
    });
  },

  /** Recuadro informativo con un solo botón */
  alerta({ titulo, mensaje = "", tipo = "info", textoAceptar = "Entendido" } = {}) {
    return UI._dialogo({ tipo, titulo, mensaje, textoAceptar });
  },

  /** Recuadro de error con el mensaje del servidor */
  error(error, titulo = "No se pudo completar") {
    return UI.alerta({
      tipo: "peligro",
      titulo,
      mensaje: error?.message || "Ocurrió un error inesperado. Intenta de nuevo.",
    });
  },

  // ===================== Avisos pequeños (solo para "todo salió bien") =====================
  aviso(mensaje, tipo = "success") {
    let contenedor = document.getElementById("contenedor-avisos");
    if (!contenedor) {
      contenedor = document.createElement("div");
      contenedor.id = "contenedor-avisos";
      contenedor.className = "toast-container position-fixed top-0 end-0 p-3";
      contenedor.style.zIndex = "1090";
      document.body.appendChild(contenedor);
    }
    const iconos = {
      success: ["bi-check-circle-fill", "#0d9488"],
      warning: ["bi-exclamation-triangle-fill", "#d97706"],
      danger: ["bi-x-circle-fill", "#e11d48"],
      info: ["bi-info-circle-fill", "#2563eb"],
    };
    const [icono, color] = iconos[tipo] || iconos.info;

    const elemento = document.createElement("div");
    elemento.className = "toast align-items-center border-0";
    elemento.setAttribute("role", "status");
    elemento.innerHTML = `
      <div class="d-flex align-items-center p-2">
        <i class="bi ${icono} icono-toast ms-2" style="color:${color}"></i>
        <div class="toast-body">${UI.escapar(mensaje)}</div>
        <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>`;
    contenedor.appendChild(elemento);
    const toast = new bootstrap.Toast(elemento, { delay: 3500 });
    toast.show();
    elemento.addEventListener("hidden.bs.toast", () => elemento.remove());
  },

  // ===================== Formularios =====================
  /** Lee un formulario como objeto. Los campos vacíos van como null. */
  leerFormulario(form) {
    const datos = {};
    for (const campo of form.elements) {
      if (!campo.name) continue;
      if (campo.type === "checkbox") datos[campo.name] = campo.checked;
      else if (campo.value === "") datos[campo.name] = null;
      else if (campo.type === "number" || campo.dataset.tipo === "numero") datos[campo.name] = Number(campo.value);
      else datos[campo.name] = campo.value;
    }
    return datos;
  },

  limpiarErrores(form) {
    form.querySelectorAll(".is-invalid").forEach((c) => c.classList.remove("is-invalid"));
    form.querySelectorAll(".invalid-feedback.dinamico").forEach((m) => m.remove());
    const general = form.querySelector(".error-general");
    if (general) general.classList.add("d-none");
  },

  /** Muestra cada error debajo de su campo; lo que no tenga campo va arriba del formulario. */
  mostrarErrores(form, error) {
    UI.limpiarErrores(form);
    const campos = error?.campos || {};
    let sinCampo = Object.keys(campos).length === 0;

    for (const [nombre, mensaje] of Object.entries(campos)) {
      const campo = form.elements[nombre];
      if (!campo) { sinCampo = true; continue; }
      campo.classList.add("is-invalid");
      const nota = document.createElement("div");
      nota.className = "invalid-feedback dinamico";
      nota.textContent = mensaje;
      campo.insertAdjacentElement("afterend", nota);
    }

    if (sinCampo) {
      const general = form.querySelector(".error-general");
      if (general) {
        general.textContent = error?.message || "Revisa los datos";
        general.classList.remove("d-none");
      } else {
        UI.error(error);
      }
    }
  },

  /** Desactiva el botón y muestra "Guardando..." mientras espera al servidor */
  cargando(boton, activo, texto = "Guardando...") {
    if (!boton) return;
    if (activo) {
      boton.dataset.textoOriginal = boton.innerHTML;
      boton.disabled = true;
      boton.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${texto}`;
    } else {
      boton.disabled = false;
      boton.innerHTML = boton.dataset.textoOriginal || boton.innerHTML;
    }
  },
};