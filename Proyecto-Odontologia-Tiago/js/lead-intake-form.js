/**
 * Formulario multi-paso de captura de leads (reemplazo de Typebot).
 * Abre en modal al hacer clic en los CTAs de WhatsApp de la landing.
 * Envía JSON por POST al webhook de n8n.
 */

// ─── Configuración editable ─────────────────────────────────
const LEAD_FORM_CONFIG = {
  /** URL del webhook n8n (producción). */
  webhookUrl: "https://ot1agoo.app.n8n.cloud/webhook/dental-lead-intake",

  /** Número WhatsApp fallback si el usuario cierra sin enviar (opcional). */
  whatsappNumber: "595981234567",
  whatsappFallback: "Hola! Vi su página y quiero mi consulta GRATUITA 🦷",

  /** Segundos hasta auto-apertura del modal (0 = desactivado). */
  autoOpenDelay: 0,

  /** Cantidad de pasos visibles (1–5) para el texto "Paso X de Y". */
  totalSteps: 5,
};

/** Nota: `fecha_envio` en el JSON se arma en buildPayload() como ISO 8601 (automático). */

/** Definición de pasos con opciones (valor guardado = texto mostrado). */
const LEAD_STEPS = [
  {
    key: "tratamiento",
    question: "¿Qué tratamiento te interesa?",
    type: "choice",
    options: [
      "Implante dental",
      "Ortodoncia / brackets",
      "Blanqueamiento",
      "Limpieza dental",
      "Dolor o urgencia",
      "Consulta general",
    ],
  },
  {
    key: "urgencia",
    question: "¿Para cuándo querés atenderte?",
    type: "choice",
    options: ["Hoy", "Esta semana", "Este mes", "Solo estoy consultando"],
  },
  {
    key: "evaluacion_previa",
    question: "¿Ya tuviste una evaluación previa?",
    type: "choice",
    options: ["Sí", "No", "Tengo estudios / radiografía", "No estoy seguro"],
  },
  {
    key: "situacion",
    question: "¿Cuál es tu situación?",
    type: "choice",
    options: [
      "Quiero agendar una consulta",
      "Quiero saber precios",
      "Tengo dolor o molestia",
      "Estoy comparando opciones",
    ],
  },
  {
    key: "_contact",
    question: "Dejanos tus datos para contactarte por WhatsApp",
    type: "fields",
    fields: [
      { key: "nombre", label: "Nombre", inputType: "text", placeholder: "Tu nombre" },
      { key: "telefono", label: "WhatsApp", inputType: "tel", placeholder: "Ej: +595981 000000 o 0981 000000" },
    ],
  },
];

// ─── Estado del modal ───────────────────────────────────────
let modalOpen = false;
let currentStepIndex = 0;
/** @type {Record<string, string>} */
const answers = {};
let overlayEl = null;
/** Evita doble avance si el usuario aprieta "Siguiente" y el auto-avance del mismo paso. */
let autoAdvanceTimer = null;

function clearAutoAdvanceTimer() {
  if (autoAdvanceTimer != null) {
    window.clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

// ─── Utilidades de validación ───────────────────────────────

/**
 * Valida teléfono: acepta con o sin +; permite espacios y separadores.
 * @returns {{ ok: true, value: string } | { ok: false, message: string }}
 */
function validatePhone(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return { ok: false, message: "Ingresá tu número de WhatsApp." };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, message: "El teléfono debe tener entre 8 y 15 dígitos." };
  }
  const value = trimmed.startsWith("+") ? `+${digits}` : digits;
  return { ok: true, value };
}

function validateNombre(raw) {
  const n = (raw || "").trim();
  if (!n) {
    return { ok: false, message: "Ingresá tu nombre." };
  }
  return { ok: true, value: n };
}

/** Mensaje de error visible bajo el paso actual. */
function setInlineError(message) {
  const box = overlayEl && overlayEl.querySelector("[data-lead-inline-error]");
  if (!box) return;
  box.textContent = message || "";
  box.classList.toggle("hidden", !message);
}

// ─── Construcción del modal (Tailwind + estética landing) ───

function injectLeadFormStyles() {
  if (document.getElementById("lead-intake-form-styles")) return;
  const style = document.createElement("style");
  style.id = "lead-intake-form-styles";
  style.textContent = `
    @keyframes lead-form-slide-in {
      from { opacity: 0; transform: translateX(14px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .lead-form-step-panel {
      animation: lead-form-slide-in 0.28s ease-out;
    }
    .lead-option-btn:focus-visible {
      outline: 2px solid #34C9AB;
      outline-offset: 2px;
    }
    .lead-option-btn.is-selected {
      border-color: rgba(52, 201, 171, 0.55);
      background: rgba(52, 201, 171, 0.12);
      box-shadow: 0 0 0 1px rgba(52, 201, 171, 0.2);
    }
  `;
  document.head.appendChild(style);
}

function buildOverlay() {
  injectLeadFormStyles();

  const overlay = document.createElement("div");
  overlay.id = "lead-intake-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "lead-intake-title");
  overlay.className =
    "fixed inset-0 z-[99999] flex items-center justify-center p-0 sm:p-5 " +
    "bg-black/80 backdrop-blur-md opacity-0 transition-opacity duration-300";

  overlay.innerHTML = `
    <div
      id="lead-intake-modal"
      class="relative flex flex-col w-full max-w-lg sm:max-h-[90vh] h-full sm:h-auto sm:rounded-2xl overflow-hidden
             bg-panel border-0 sm:border border-gold/25 shadow-2xl text-left font-body"
    >
      <!-- Cabecera -->
      <div class="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/[0.07] bg-white/[0.03] shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg shrink-0" aria-hidden="true">🦷</span>
          <div class="min-w-0">
            <p id="lead-intake-title" class="text-ivory font-bold text-sm tracking-tight truncate">Tu consulta GRATIS</p>
            <p data-lead-progress class="text-[11px] font-semibold uppercase tracking-wider text-muted">Paso 1 de 5</p>
          </div>
        </div>
        <button
          type="button"
          data-lead-close
          aria-label="Cerrar"
          class="shrink-0 w-9 h-9 rounded-full border border-white/10 bg-white/[0.08] text-ivory text-sm hover:bg-white/15 transition-colors"
        >✕</button>
      </div>

      <!-- Barra de progreso -->
      <div class="h-1 w-full bg-white/[0.06] shrink-0">
        <div data-lead-progress-bar class="h-full bg-mint transition-all duration-300" style="width: 20%"></div>
      </div>

      <!-- Cuerpo scrollable -->
      <div class="flex-1 overflow-y-auto min-h-0 p-5 sm:p-6">
        <div data-lead-step-root class="lead-form-step-panel"></div>
        <p data-lead-inline-error class="hidden mt-3 text-sm text-red-urgent font-medium" role="alert"></p>
      </div>

      <!-- Pie: navegación -->
      <div data-lead-footer class="shrink-0 px-5 sm:px-6 pb-5 sm:pb-6 pt-2 border-t border-white/[0.06] bg-panel">
        <div class="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between sm:items-center">
          <button
            type="button"
            data-lead-back
            class="w-full sm:w-auto px-5 py-3 rounded-full text-sm font-bold border border-white/15 text-ivory hover:bg-white/[0.06] transition-colors"
          >
            Atrás
          </button>
          <button
            type="button"
            data-lead-next
            class="w-full sm:w-auto px-6 py-3 rounded-full text-sm font-bold bg-mint text-navy hover:opacity-90 transition-opacity"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  `;

  return overlay;
}

function updateProgressUI() {
  if (!overlayEl) return;
  const step = currentStepIndex + 1;
  const total = LEAD_FORM_CONFIG.totalSteps;
  const pct = (step / total) * 100;
  const prog = overlayEl.querySelector("[data-lead-progress]");
  const bar = overlayEl.querySelector("[data-lead-progress-bar]");
  if (prog) prog.textContent = `Paso ${step} de ${total}`;
  if (bar) bar.style.width = `${pct}%`;
}

/**
 * Renderiza el contenido del paso actual dentro de [data-lead-step-root].
 */
function renderCurrentStep() {
  if (!overlayEl) return;
  const root = overlayEl.querySelector("[data-lead-step-root]");
  const nextBtn = overlayEl.querySelector("[data-lead-next]");
  const backBtn = overlayEl.querySelector("[data-lead-back]");
  if (!root || !nextBtn || !backBtn) return;

  setInlineError("");
  const stepDef = LEAD_STEPS[currentStepIndex];
  const isLast = currentStepIndex === LEAD_STEPS.length - 1;

  backBtn.classList.toggle("invisible", currentStepIndex === 0);
  nextBtn.textContent = isLast ? "Enviar" : "Siguiente";

  if (stepDef.type === "choice") {
    const selected = answers[stepDef.key] || "";
    root.innerHTML = `
      <h3 class="font-display text-xl sm:text-2xl font-bold text-ivory leading-snug mb-5">
        ${escapeHtml(stepDef.question)}
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="group" aria-labelledby="lead-intake-title">
        ${stepDef.options
          .map(
            (opt) => `
          <button
            type="button"
            class="lead-option-btn text-left px-4 py-3.5 rounded-xl border border-white/[0.1]
                   text-sm font-semibold text-ivory bg-white/[0.03] hover:bg-white/[0.07]
                   transition-all duration-150 ${selected === opt ? "is-selected" : ""}"
            data-lead-option="${escapeAttr(opt)}"
          >${escapeHtml(opt)}</button>
        `
          )
          .join("")}
      </div>
    `;

    root.querySelectorAll("[data-lead-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-lead-option") || "";
        answers[stepDef.key] = val;
        root.querySelectorAll(".lead-option-btn").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        // Avance automático tras selección (también queda claro el estado visual).
        clearAutoAdvanceTimer();
        autoAdvanceTimer = window.setTimeout(() => {
          autoAdvanceTimer = null;
          if (modalOpen && currentStepIndex < LEAD_STEPS.length - 1) {
            goNext();
          }
        }, 320);
      });
    });
  } else if (stepDef.type === "fields") {
    const nombre = answers.nombre || "";
    const telefono = answers.telefono || "";
    root.innerHTML = `
      <h3 class="font-display text-xl sm:text-2xl font-bold text-ivory leading-snug mb-5">
        ${escapeHtml(stepDef.question)}
      </h3>
      <div class="space-y-4">
        ${stepDef.fields
          .map(
            (f) => `
          <label class="block">
            <span class="block text-xs font-bold uppercase tracking-wider text-mint mb-1.5">${escapeHtml(f.label)}</span>
            <input
              type="${escapeAttr(f.inputType)}"
              name="${escapeAttr(f.key)}"
              data-lead-field="${escapeAttr(f.key)}"
              placeholder="${escapeAttr(f.placeholder)}"
              value="${escapeAttr(f.key === "nombre" ? nombre : telefono)}"
              autocomplete="${f.key === "telefono" ? "tel" : "name"}"
              class="w-full px-4 py-3 rounded-xl bg-navy/80 border border-white/10 text-ivory text-sm
                     placeholder:text-muted/70 focus:border-mint/50 focus:ring-1 focus:ring-mint/30 outline-none transition-shadow"
            />
          </label>
        `
          )
          .join("")}
      </div>
    `;
  }

  // Re-disparar animación del panel
  root.classList.remove("lead-form-step-panel");
  void root.offsetWidth;
  root.classList.add("lead-form-step-panel");

  updateProgressUI();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function currentStepIsValid() {
  const stepDef = LEAD_STEPS[currentStepIndex];
  if (stepDef.type === "choice") {
    return !!(answers[stepDef.key] && String(answers[stepDef.key]).trim());
  }
  if (stepDef.type === "fields") {
    const n = validateNombre(answers.nombre || "");
    const p = validatePhone(answers.telefono || "");
    if (!n.ok) {
      setInlineError(n.message);
      return false;
    }
    if (!p.ok) {
      setInlineError(p.message);
      return false;
    }
    return true;
  }
  return false;
}

function syncFieldAnswersFromDOM() {
  const stepDef = LEAD_STEPS[currentStepIndex];
  if (!overlayEl || stepDef.type !== "fields") return;
  stepDef.fields.forEach((f) => {
    const input = overlayEl.querySelector(`[data-lead-field="${f.key}"]`);
    if (input) answers[f.key] = input.value;
  });
}

function goBack() {
  if (currentStepIndex <= 0) return;
  clearAutoAdvanceTimer();
  currentStepIndex -= 1;
  renderCurrentStep();
}

function goNext() {
  clearAutoAdvanceTimer();
  const stepDef = LEAD_STEPS[currentStepIndex];
  if (stepDef.type === "fields") {
    syncFieldAnswersFromDOM();
  }
  if (stepDef.type === "choice" && !answers[stepDef.key]) {
    setInlineError("Elegí una opción para continuar.");
    return;
  }
  if (currentStepIndex === LEAD_STEPS.length - 1) {
    syncFieldAnswersFromDOM();
    if (!currentStepIsValid()) return;
    submitLead();
    return;
  }
  currentStepIndex += 1;
  renderCurrentStep();
}

/** Construye el cuerpo JSON para n8n. */
function buildPayload() {
  const fechaEnvio = new Date().toISOString();
  const phoneResult = validatePhone(answers.telefono || "");
  return {
    nombre: (answers.nombre || "").trim(),
    telefono: phoneResult.ok ? phoneResult.value : (answers.telefono || "").trim(),
    tratamiento: answers.tratamiento || "",
    urgencia: answers.urgencia || "",
    evaluacion_previa: answers.evaluacion_previa || "",
    situacion: answers.situacion || "",
    horario_preferido: "",
    origen: "Landing odontología",
    pagina: "implantes",
    fecha_envio: fechaEnvio,
  };
}

/**
 * Muestra estado de carga en el botón principal.
 * @param {boolean} loading
 */
function setSubmitLoading(loading) {
  if (!overlayEl) return;
  const nextBtn = overlayEl.querySelector("[data-lead-next]");
  const backBtn = overlayEl.querySelector("[data-lead-back]");
  if (nextBtn) {
    if (loading) {
      if (nextBtn.textContent !== "Enviando...") {
        nextBtn.dataset.restoreLabel = nextBtn.textContent;
      }
      nextBtn.textContent = "Enviando...";
    } else if (nextBtn.dataset.restoreLabel) {
      nextBtn.textContent = nextBtn.dataset.restoreLabel;
    }
    nextBtn.disabled = loading;
    nextBtn.classList.toggle("opacity-60", loading);
    nextBtn.classList.toggle("cursor-not-allowed", loading);
  }
  if (backBtn) {
    backBtn.disabled = loading;
    backBtn.classList.toggle("opacity-40", loading);
  }
}

async function submitLead() {
  const payload = buildPayload();
  setSubmitLoading(true);
  setInlineError("");

  try {
    const res = await fetch(LEAD_FORM_CONFIG.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      throw new Error(data && data.message ? data.message : `Error del servidor (${res.status})`);
    }

    if (data && data.success === true) {
      if (window.DentalLeadForm) {
        window.DentalLeadForm.lastClassification =
          data.classification !== undefined && data.classification !== null ? data.classification : null;
        window.DentalLeadForm.lastScore =
          data.score !== undefined && data.score !== null ? data.score : null;
      }
      if (data.classification != null || data.score != null) {
        // Útil para depuración / analítica en consola
        console.info("[DentalLead]", "classification:", data.classification, "score:", data.score);
      }
      showSuccessInModal();
      return;
    }

    throw new Error(data && data.message ? data.message : "No se pudo confirmar el envío. Intentá de nuevo.");
  } catch (err) {
    const msg =
      err instanceof TypeError && err.message === "Failed to fetch"
        ? "No pudimos conectar. Revisá tu conexión o la URL del webhook (CORS en n8n)."
        : err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado.";
    setInlineError(msg);
  } finally {
    setSubmitLoading(false);
  }
}

function showSuccessInModal() {
  if (!overlayEl) return;
  const root = overlayEl.querySelector("[data-lead-step-root]");
  const footer = overlayEl.querySelector("[data-lead-footer]");
  const progress = overlayEl.querySelector("[data-lead-progress]");
  const bar = overlayEl.querySelector("[data-lead-progress-bar]");
  if (progress) progress.textContent = "¡Listo!";
  if (bar) bar.style.width = "100%";
  if (footer) footer.classList.add("hidden");
  if (root) {
    root.innerHTML = `
      <div class="text-center py-4 sm:py-6">
        <div class="text-5xl mb-4" aria-hidden="true">✓</div>
        <h3 class="font-display text-2xl font-bold text-ivory mb-4">¡Gracias!</h3>
        <p class="text-sm sm:text-base leading-relaxed text-muted max-w-sm mx-auto">
          ¡Listo! Recibimos tus datos correctamente. Un asesor se va a comunicar contigo por WhatsApp.
        </p>
        <button
          type="button"
          data-lead-success-close
          class="mt-8 w-full sm:w-auto px-8 py-3.5 rounded-full text-sm font-bold bg-mint text-navy hover:opacity-90 transition-opacity"
        >
          Cerrar
        </button>
      </div>
    `;
    root.querySelector("[data-lead-success-close]")?.addEventListener("click", closeLeadFormModal);
  }
  overlayEl.querySelector("[data-lead-inline-error]")?.classList.add("hidden");
}

function resetFormState() {
  currentStepIndex = 0;
  Object.keys(answers).forEach((k) => delete answers[k]);
}

function attachOverlayListeners(overlay) {
  overlay.querySelector("[data-lead-close]")?.addEventListener("click", closeLeadFormModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeLeadFormModal();
  });
  overlay.querySelector("[data-lead-back]")?.addEventListener("click", goBack);
  overlay.querySelector("[data-lead-next]")?.addEventListener("click", goNext);
}

function onEscapeKey(e) {
  if (e.key === "Escape") closeLeadFormModal();
}

function openLeadFormModal() {
  if (modalOpen) return;

  clearAutoAdvanceTimer();

  const old = document.getElementById("lead-intake-overlay");
  if (old) old.remove();

  resetFormState();
  overlayEl = buildOverlay();
  document.body.appendChild(overlayEl);
  document.body.style.overflow = "hidden";
  attachOverlayListeners(overlayEl);
  renderCurrentStep();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlayEl.classList.remove("opacity-0");
      overlayEl.classList.add("opacity-100");
    });
  });

  modalOpen = true;
  document.addEventListener("keydown", onEscapeKey);
}

function closeLeadFormModal() {
  clearAutoAdvanceTimer();
  const overlay = document.getElementById("lead-intake-overlay");
  if (!overlay) {
    modalOpen = false;
    overlayEl = null;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onEscapeKey);
    return;
  }

  overlay.classList.remove("opacity-100");
  overlay.classList.add("opacity-0");
  window.setTimeout(() => {
    overlay.remove();
    document.body.style.overflow = "";
    modalOpen = false;
    overlayEl = null;
  }, 280);

  document.removeEventListener("keydown", onEscapeKey);
}

/** Compatibilidad: mismos selectores que el antiguo Typebot. */
function wireCtaButtons() {
  const btns = document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"], [data-open-bot]');
  btns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openLeadFormModal();
    });
  });
  console.info("[DentalLeadForm]", btns.length, "CTAs enlazados al formulario de leads.");
}

document.addEventListener("DOMContentLoaded", () => {
  wireCtaButtons();

  if (LEAD_FORM_CONFIG.autoOpenDelay > 0 && !sessionStorage.getItem("dental_lead_popup_shown")) {
    window.setTimeout(() => {
      if (!modalOpen) {
        sessionStorage.setItem("dental_lead_popup_shown", "true");
        openLeadFormModal();
      }
    }, LEAD_FORM_CONFIG.autoOpenDelay * 1000);
  }
});

window.DentalLeadForm = {
  open: openLeadFormModal,
  close: closeLeadFormModal,
  /** Última respuesta del webhook (solo lectura; se actualiza tras envío exitoso). */
  lastClassification: null,
  lastScore: null,
};
