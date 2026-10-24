/**
 * Panel principal. Todo sale de las vistas (/api/consultas).
 */
App.registrar("panel", {
  async render(contenedor) {
    const nombre = App.usuario.nombre_completo.split(" ")[0];
    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
    const moneda = App.config.moneda || "Q";
    const diasAlerta = App.config.dias_alerta_vencimiento || 90;

    contenedor.innerHTML = `
      <div class="saludo mb-4">
        <h2>${saludo}, ${UI.escapar(nombre)}</h2>
        <p class="mb-0">Este es el resumen de hoy en ${UI.escapar(App.usuario.ubicacion)}.</p>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-sm-6 col-xl-3"><div class="card kpi kpi-verde" id="kpi-ventas"></div></div>
        <div class="col-sm-6 col-xl-3"><div class="card kpi kpi-azul" id="kpi-turno"></div></div>
        <div class="col-sm-6 col-xl-3"><div class="card kpi kpi-ambar" id="kpi-stock"></div></div>
        <div class="col-sm-6 col-xl-3"><div class="card kpi kpi-rosa" id="kpi-vencer"></div></div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-12">
          <div class="card p-3 p-md-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h3 class="tarjeta-titulo">Ventas de los últimos 14 días</h3>
              <span class="text-secondary small" id="total-14"></span>
            </div>
            <div style="height: 280px"><canvas id="grafica-ventas"></canvas></div>
          </div>
        </div>
      </div>

      <div class="row g-3">
        <div class="col-lg-7">
          <div class="card p-3 p-md-4 h-100">
            <h3 class="tarjeta-titulo mb-2">Lotes próximos a vencer</h3>
            <div id="lista-vencer"></div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card p-3 p-md-4 h-100">
            <h3 class="tarjeta-titulo mb-2">Productos con stock bajo</h3>
            <div id="lista-stock" class="lista-alerta"></div>
          </div>
        </div>
      </div>`;

    const hoy = UI.hoyISO();
    const desde = UI.sumarDias(hoy, -13);
    const usaCaja = App.tiene(ROLES.VENDEDOR);

    const [ventas, stockBajo, vencimientos, turno] = await Promise.allSettled([
      API.get("/api/consultas/ventas-diarias", { desde, hasta: hoy }),
      API.get("/api/consultas/alertas/stock-bajo"),
      API.get("/api/consultas/alertas/vencimientos"),
      usaCaja ? API.get("/api/caja/turnos/actual") : Promise.resolve(undefined),
    ]);

    const valor = (resultado, porDefecto) => (resultado.status === "fulfilled" ? resultado.value : porDefecto);
    const listaVentas = valor(ventas, []);
    const listaStock = valor(stockBajo, []);
    const listaVencer = valor(vencimientos, []);

    // ===================== Tarjetas =====================
    const deHoy = listaVentas.find((v) => v.dia === hoy);
    tarjeta("kpi-ventas", "bi-graph-up-arrow", UI.moneda(deHoy?.total, moneda),
      `Ventas de hoy · ${deHoy?.cantidad_ventas || 0} transacciones`);

    if (usaCaja) {
      const t = valor(turno, null);
      tarjeta("kpi-turno", "bi-cash-stack",
        t ? UI.moneda(t.efectivo_esperado, moneda) : "Sin turno",
        t ? `Efectivo en caja · abierto a las ${UI.fechaHora(t.turno.fecha_apertura).slice(11)}`
          : "Abre tu turno en Punto de venta");
    } else {
      const totalLotes = listaVencer.length;
      tarjeta("kpi-turno", "bi-box-seam", UI.numero(totalLotes), "Lotes en revisión de vencimiento");
    }

    tarjeta("kpi-stock", "bi-exclamation-triangle", UI.numero(listaStock.length), "Productos con stock bajo");

    const vencidos = listaVencer.filter((l) => l.vencido).length;
    tarjeta("kpi-vencer", "bi-calendar-x", UI.numero(listaVencer.length),
      vencidos ? `Por vencer · ${vencidos} ya vencidos` : `Vencen en los próximos ${diasAlerta} días`);

    // ===================== Gráfica =====================
    graficaVentas(listaVentas, desde, moneda);

    // ===================== Listas =====================
    pintarVencimientos(listaVencer.slice(0, 8));
    pintarStockBajo(listaStock.slice(0, 8));

    // ===================== Funciones internas =====================
    function tarjeta(id, icono, valorTexto, etiqueta) {
      document.getElementById(id).innerHTML = `
        <div class="icono-kpi"><i class="bi ${icono}"></i></div>
        <div>
          <div class="valor">${UI.escapar(valorTexto)}</div>
          <div class="etiqueta">${UI.escapar(etiqueta)}</div>
        </div>`;
    }

    function graficaVentas(lista, inicio, simbolo) {
      // Llena con 0 los días sin ventas, para que la gráfica no salte días
      const porDia = Object.fromEntries(lista.map((v) => [v.dia, Number(v.total)]));
      const dias = Array.from({ length: 14 }, (_, i) => UI.sumarDias(inicio, i));
      const totales = dias.map((d) => porDia[d] || 0);
      document.getElementById("total-14").textContent =
        `Total: ${UI.moneda(totales.reduce((a, b) => a + b, 0), simbolo)}`;

      // Colores según el tema (claro u oscuro)
      const css = getComputedStyle(document.documentElement);
      const colorLinea = css.getPropertyValue("--grafica-linea").trim();
      const colorTexto = css.getPropertyValue("--grafica-texto").trim();
      const colorRejilla = css.getPropertyValue("--grafica-rejilla").trim();

      const lienzo = document.getElementById("grafica-ventas");
      const ctx = lienzo.getContext("2d");
      const degradado = ctx.createLinearGradient(0, 0, 0, 280);
      degradado.addColorStop(0, "rgba(13, 148, 136, 0.35)");
      degradado.addColorStop(1, "rgba(13, 148, 136, 0)");

      const grafica = new Chart(lienzo, {
        type: "line",
        data: {
          labels: dias.map((d) => UI.fecha(d).slice(0, 5)),
          datasets: [{
            label: "Ventas",
            data: totales,
            borderColor: colorLinea,
            backgroundColor: degradado,
            fill: true,
            tension: 0.4,
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: "#0d9488",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          }],
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => UI.moneda(c.parsed.y, simbolo) } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: colorTexto } },
            y: {
              beginAtZero: true,
              grid: { color: colorRejilla },
              ticks: { color: colorTexto, callback: (v) => `${simbolo} ${v}` },
            },
          },
        },
      });
      App.alSalir = () => grafica.destroy();
    }

    function pintarVencimientos(lista) {
      const destino = document.getElementById("lista-vencer");
      if (!lista.length) {
        destino.innerHTML = `<div class="vacio"><i class="bi bi-check2-circle"></i>No hay lotes por vencer</div>`;
        return;
      }
      destino.innerHTML = `
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr><th>Producto</th><th>Lote</th><th>Ubicación</th><th class="text-end">Cant.</th><th>Vence</th></tr>
            </thead>
            <tbody>
              ${lista.map((l) => {
                const color = l.vencido ? "danger" : l.dias_restantes <= 30 ? "warning" : "info";
                const texto = l.vencido ? "Vencido" : `${l.dias_restantes} días`;
                return `
                  <tr>
                    <td class="fw-semibold">${UI.escapar(l.producto)}</td>
                    <td>${UI.escapar(l.numero_lote)}</td>
                    <td>${UI.escapar(l.ubicacion)}</td>
                    <td class="text-end">${UI.numero(l.cantidad)}</td>
                    <td class="text-nowrap">${UI.fecha(l.fecha_vencimiento)}
                      <span class="badge text-bg-${color} ms-1">${texto}</span></td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`;
    }

    function pintarStockBajo(lista) {
      const destino = document.getElementById("lista-stock");
      if (!lista.length) {
        destino.innerHTML = `<div class="vacio"><i class="bi bi-emoji-smile"></i>Todo el stock está en orden</div>`;
        return;
      }
      destino.innerHTML = lista.map((p) => {
        const porcentaje = Math.min(100, Math.round((Number(p.stock_total) / Number(p.stock_minimo)) * 100));
        const color = porcentaje <= 25 ? "danger" : porcentaje <= 60 ? "warning" : "info";
        return `
          <div class="item">
            <div class="d-flex justify-content-between mb-1">
              <span class="fw-semibold">${UI.escapar(p.nombre)}</span>
              <span class="small text-secondary">${UI.numero(p.stock_total)} / ${UI.numero(p.stock_minimo)}</span>
            </div>
            <div class="progress"><div class="progress-bar bg-${color}" style="width:${porcentaje}%"></div></div>
          </div>`;
      }).join("");
    }
  },
});