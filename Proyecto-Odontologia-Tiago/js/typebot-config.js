// ============================================================
//  typebot-config.js  —  v3 iframe (solución definitiva)
//  Bot ID: my-typebot-hja5zcc
// ============================================================

const ODONTO_CONFIG = {
  // URL pública de tu bot (la que ves cuando hacés Share → el link de "View")
  // Formato: https://typebot.io/my-typebot-hja5zcc
  typebotUrl:            "https://typebot.io/my-typebot-hja5zcc",

  whatsappNumber:        "595981234567",
  whatsappFallback:      "Hola! Vi su página y quiero mi consulta GRATUITA 🦷",

  autoOpenDelay:         0,     // segundos hasta auto-apertura (0 = desactivado)
  stickyScrollThreshold: 40,    // % de scroll para mostrar botón sticky
};

// ─── Estado ───────────────────────────────
let popupIsOpen = false;

// ─── Construir popup con iframe ───────────
function buildPopup() {
  const isMobile = window.innerWidth < 640;

  // Overlay oscuro
  const overlay = document.createElement("div");
  overlay.id    = "odonto-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.80);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: ${isMobile ? "0" : "20px"};
    opacity: 0;
    transition: opacity 0.25s ease;
  `;

  // Modal
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: relative;
    width: 100%;
    max-width: ${isMobile ? "100%" : "480px"};
    height: ${isMobile ? "100dvh" : "640px"};
    max-height: ${isMobile ? "100%" : "90vh"};
    background: #0F1E2E;
    border-radius: ${isMobile ? "0" : "20px"};
    overflow: hidden;
    border: ${isMobile ? "none" : "1px solid rgba(200,164,74,0.25)"};
    box-shadow: 0 32px 80px rgba(0,0,0,0.65);
    display: flex;
    flex-direction: column;
  `;

  // Header con título y botón cerrar
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 16px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
  `;
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:9px;">
      <span style="font-size:18px;">🦷</span>
      <span style="
        color:#F2EDE3; font-weight:700; font-size:13px;
        font-family:'Cabinet Grotesk',sans-serif;
        letter-spacing:-0.01em;
      ">Tu consulta GRATIS</span>
    </div>
    <button id="odonto-close-btn" aria-label="Cerrar" style="
      background:rgba(255,255,255,0.08);
      border:1px solid rgba(255,255,255,0.1);
      color:#F2EDE3; width:28px; height:28px;
      border-radius:50%; cursor:pointer; font-size:12px;
      display:flex; align-items:center; justify-content:center;
      line-height:1; flex-shrink:0;
    ">✕</button>
  `;

  // ── IFRAME — método que siempre funciona ──
  const iframe = document.createElement("iframe");
  iframe.id    = "odonto-iframe";
  iframe.src   = ODONTO_CONFIG.typebotUrl;
  iframe.allow = "camera; microphone; autoplay";
  iframe.style.cssText = `
    flex: 1;
    width: 100%;
    border: none;
    background: transparent;
  `;

  // Spinner de carga mientras el iframe carga
  const spinner = document.createElement("div");
  spinner.id    = "odonto-spinner";
  spinner.style.cssText = `
    position: absolute;
    inset: 60px 0 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0F1E2E;
    z-index: 2;
    flex-direction: column;
    gap: 14px;
  `;
  spinner.innerHTML = `
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <div style="
      width:36px; height:36px;
      border:3px solid rgba(52,201,171,0.2);
      border-top-color:#34C9AB;
      border-radius:50%;
      animation: spin 0.8s linear infinite;
    "></div>
    <span style="color:#6b7a95; font-size:13px; font-family:'Cabinet Grotesk',sans-serif;">
      Cargando...
    </span>
  `;

  // Ocultar spinner cuando el iframe termina de cargar
  iframe.addEventListener("load", () => {
    spinner.style.opacity = "0";
    setTimeout(() => spinner.remove(), 300);
  });

  modal.appendChild(header);
  modal.appendChild(iframe);
  modal.appendChild(spinner);
  overlay.appendChild(modal);

  return overlay;
}

// ─── Abrir popup ──────────────────────────
function openTypebotPopup() {
  if (popupIsOpen) return;

  // Limpiar instancia anterior
  const old = document.getElementById("odonto-overlay");
  if (old) old.remove();

  const overlay = buildPopup();
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  // Animar entrada (doble rAF para que la transición CSS se dispare)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { overlay.style.opacity = "1"; });
  });

  popupIsOpen = true;

  // Cerrar con botón X
  document.getElementById("odonto-close-btn")
    .addEventListener("click", closeTypebotPopup);

  // Cerrar al hacer clic fuera del modal
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeTypebotPopup();
  });

  // Cerrar con Escape
  document.addEventListener("keydown", onEscKey);

  // Escuchar mensajes del iframe (cuando el bot se completa)
  window.addEventListener("message", onTypebotMessage);
}

// ─── Cerrar popup ─────────────────────────
function closeTypebotPopup() {
  const overlay = document.getElementById("odonto-overlay");
  if (!overlay) return;

  overlay.style.opacity = "0";
  setTimeout(() => {
    overlay.remove();
    document.body.style.overflow = "";
    popupIsOpen = false;
  }, 250);

  document.removeEventListener("keydown", onEscKey);
  window.removeEventListener("message", onTypebotMessage);
}

function onEscKey(e) {
  if (e.key === "Escape") closeTypebotPopup();
}

// ─── Mensajes del iframe de Typebot ───────
function onTypebotMessage(event) {
  // Aceptar solo mensajes de typebot.io
  if (!event.origin.includes("typebot.io")) return;

  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (
    data.type === "typebot-form-completed" ||
    data.type === "typebot-ended"          ||
    data.isCompleted === true
  ) {
    handleTypebotComplete(data.answers || data.variables || {});
  }
}

// ─── Procesar lead al completar el bot ────
function handleTypebotComplete(answers) {
  const nombre      = answers.nombre      || "";
  const telefono    = answers.telefono    || "";
  const tratamiento = answers.tratamiento || "";
  const urgencia    = answers.urgencia    || "";

  let leadScore   = "Frio";
  let manychatTag = "lead-frio";
  if (urgencia === "Caliente") { leadScore = "Caliente"; manychatTag = "lead-caliente"; }
  else if (urgencia === "Tibio") { leadScore = "Tibio"; manychatTag = "lead-tibio"; }

  localStorage.setItem("odonto_lead", JSON.stringify({
    nombre, telefono, tratamiento, urgencia, leadScore,
    timestamp: new Date().toISOString(),
  }));

  // ── HOOK MANYCHAT (activar cuando tengas API Key) ─────────
  // fetch("https://api.manychat.com/fb/subscriber/addTag", {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     "Authorization": "Bearer TU_MANYCHAT_API_KEY",
  //   },
  //   body: JSON.stringify({ subscriber_id: telefono, tag_name: manychatTag }),
  // });
  // ─────────────────────────────────────────────────────────

  closeTypebotPopup();
  showConfirmation(nombre, leadScore);
}

// ─── Pantalla de confirmación ─────────────
function showConfirmation(nombre, score) {
  const messages = {
    Caliente: "¡Te contactamos en menos de 5 minutos! 🔥",
    Tibio:    "¡Genial! Te escribimos en las próximas horas 😊",
    Frio:     "¡Recibido! Te enviamos información por WhatsApp 📋",
  };

  const el = document.createElement("div");
  el.id    = "odonto-confirmation";
  el.style.cssText = `
    position:fixed; inset:0; z-index:99998;
    background:rgba(0,0,0,0.82); backdrop-filter:blur(8px);
    display:flex; align-items:center; justify-content:center; padding:24px;
  `;
  el.innerHTML = `
    <div style="
      background:#0F1E2E; border:1px solid rgba(52,201,171,0.35);
      border-radius:20px; padding:40px 32px;
      max-width:380px; width:100%; text-align:center;
      box-shadow:0 32px 80px rgba(0,0,0,0.5);
    ">
      <div style="font-size:52px;margin-bottom:16px;">🎉</div>
      <h3 style="
        color:#F2EDE3; font-family:'Cabinet Grotesk',sans-serif;
        font-size:22px; font-weight:800; margin-bottom:10px;
      ">¡Listo${nombre ? ", " + nombre : ""}!</h3>
      <p style="color:#6b7a95;font-size:14px;line-height:1.65;margin-bottom:28px;">
        ${messages[score] || messages.Frio}
      </p>
      <button onclick="document.getElementById('odonto-confirmation').remove()" style="
        background:#34C9AB; color:#08111C; border:none;
        padding:13px 28px; border-radius:99px;
        font-weight:700; font-size:14px; cursor:pointer; width:100%;
        font-family:'Cabinet Grotesk',sans-serif;
      ">Perfecto ✓</button>
    </div>
  `;

  document.body.appendChild(el);
  setTimeout(() => {
    const c = document.getElementById("odonto-confirmation");
    if (c) c.remove();
  }, 7000);
}

// ─── Fallback WhatsApp ────────────────────
function openWhatsAppFallback() {
  const url = `https://wa.me/${ODONTO_CONFIG.whatsappNumber}?text=${encodeURIComponent(ODONTO_CONFIG.whatsappFallback)}`;
  window.open(url, "_blank");
}

// ─── Inicialización ───────────────────────
document.addEventListener("DOMContentLoaded", function () {

  // Conectar todos los botones CTA al popup
  const btns = document.querySelectorAll(
    'a[href*="wa.me"], a[href*="whatsapp"], [data-open-bot]'
  );

  btns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openTypebotPopup();
    });
  });

  console.log(`[OdontoBot] ✅ ${btns.length} botones conectados al popup.`);

  // Sticky mobile — scroll + clic
  const stickyWrapper = document.getElementById("stickyBtn");
  if (stickyWrapper) {
    const stickyLink = stickyWrapper.querySelector("a");
    if (stickyLink) {
      stickyLink.addEventListener("click", (e) => {
        e.preventDefault();
        openTypebotPopup();
      });
    }
    window.addEventListener("scroll", () => {
      const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      stickyWrapper.classList.toggle("show", pct > ODONTO_CONFIG.stickyScrollThreshold / 100);
    }, { passive: true });
  }

  // Auto-apertura por tiempo
  if (ODONTO_CONFIG.autoOpenDelay > 0 && !sessionStorage.getItem("odonto_popup_shown")) {
    setTimeout(() => {
      if (!popupIsOpen) {
        sessionStorage.setItem("odonto_popup_shown", "true");
        openTypebotPopup();
      }
    }, ODONTO_CONFIG.autoOpenDelay * 1000);
  }

});

// ─── API pública ──────────────────────────
window.OdontoBot = {
  open:  openTypebotPopup,
  close: closeTypebotPopup,
};