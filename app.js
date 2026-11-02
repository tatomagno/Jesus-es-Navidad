/**
 * Sorteo Papá Noel Invisible - "¡Navidad es Jesús!"
 * Funciona 100% sin servidor codificando el sorteo de forma segura en el link de WhatsApp.
 */

(function () {
  "use strict";

  // --- Estado de la aplicación ---
  let participants = [];
  let currentDrawData = null; // { id, t (title), n (note), u (usePins), p: [[giver, receiver, pin], ...] }
  let selectedParticipantEntry = null; // [giver, receiver, pin]
  let isSingleParticipantLink = false;

  const AVATARS = ["🎅", "🤶", "🎄", "⛄", "🦌", "🌟", "🔔", "🎁", "🕯️", "👼"];

  // --- Referencias del DOM ---
  const elTitleDisplay = document.getElementById("event-title-display");
  const elNoteDisplay = document.getElementById("event-note-display");

  const viewOrganizer = document.getElementById("view-organizer");
  const viewShare = document.getElementById("view-share");
  const viewParticipantList = document.getElementById("view-participant-list");
  const viewReveal = document.getElementById("view-reveal");

  const inputTitle = document.getElementById("event-title-input");
  const inputNote = document.getElementById("event-note-input");
  const inputParticipant = document.getElementById("participant-input");
  const btnAddParticipant = document.getElementById("btn-add-participant");
  const badgeCount = document.getElementById("participant-count-badge");
  const emptyHint = document.getElementById("empty-participants-hint");
  const ulChips = document.getElementById("participants-chips");

  const btnToggleBulk = document.getElementById("btn-toggle-bulk");
  const bulkBox = document.getElementById("bulk-paste-box");
  const bulkTextarea = document.getElementById("bulk-textarea");
  const btnConfirmBulk = document.getElementById("btn-confirm-bulk");

  const chkUsePins = document.getElementById("chk-use-pins");
  const organizerError = document.getElementById("organizer-error");
  const btnGenerateDraw = document.getElementById("btn-generate-draw");

  // Vista Compartir
  const localFileWarning = document.getElementById("local-file-warning");
  const customBaseUrlInput = document.getElementById("custom-base-url");
  const groupShareUrlInput = document.getElementById("group-share-url");
  const btnCopyGroupUrl = document.getElementById("btn-copy-group-url");
  const btnWhatsappGroup = document.getElementById("btn-whatsapp-group");
  const btnPreviewGroup = document.getElementById("btn-preview-group");
  const btnToggleIndividual = document.getElementById("btn-toggle-individual");
  const individualLinksList = document.getElementById("individual-links-list");
  const individualItemsUl = document.getElementById("individual-items-ul");
  const pinsIndicatorText = document.getElementById("pins-indicator-text");
  const btnNewDraw = document.getElementById("btn-new-draw");

  // Vista Lista de Participantes
  const alreadyOpenedBanner = document.getElementById("already-opened-banner");
  const savedPersonName = document.getElementById("saved-person-name");
  const btnReopenSaved = document.getElementById("btn-reopen-saved");
  const searchParticipantInput = document.getElementById("search-participant-input");
  const participantSearchBox = document.getElementById("participant-search-box");
  const participantButtonsGrid = document.getElementById("participant-buttons-grid");
  const btnGoOrganizer = document.getElementById("btn-go-organizer");

  // Vista Revelación
  const revealGiverName = document.getElementById("reveal-giver-name");
  const giftClosedStage = document.getElementById("gift-closed-stage");
  const giftOpenedStage = document.getElementById("gift-opened-stage");
  const btnOpenGift = document.getElementById("btn-open-gift");
  const revealReceiverName = document.getElementById("reveal-receiver-name");
  const btnDownloadTicket = document.getElementById("btn-download-ticket");
  const btnHideResult = document.getElementById("btn-hide-result");
  const btnBackToList = document.getElementById("btn-back-to-list");

  // Modal de Confirmación
  const confirmModal = document.getElementById("confirm-modal");
  const modalPersonName = document.getElementById("modal-person-name");
  const modalPinSection = document.getElementById("modal-pin-section");
  const modalPinInput = document.getElementById("modal-pin-input");
  const modalPinError = document.getElementById("modal-pin-error");
  const btnModalCancel = document.getElementById("btn-modal-cancel");
  const btnModalConfirm = document.getElementById("btn-modal-confirm");

  const toastEl = document.getElementById("toast");

  // =========================================================
  // 1. UTILIDADES DE CODIFICACIÓN OFUSCADA EN LA URL
  // =========================================================
  const SECRET_KEY = "NavidadEsJesus2026";

  function encodePayload(obj) {
    const jsonStr = JSON.stringify(obj);
    const utf8Bytes = new TextEncoder().encode(jsonStr);
    const keyBytes = new TextEncoder().encode(SECRET_KEY);
    const xored = new Uint8Array(utf8Bytes.length);

    for (let i = 0; i < utf8Bytes.length; i++) {
      xored[i] = utf8Bytes[i] ^ keyBytes[i % keyBytes.length];
    }

    let binary = "";
    for (let i = 0; i < xored.length; i++) {
      binary += String.fromCharCode(xored[i]);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function decodePayload(token) {
    try {
      let base64 = token.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4 !== 0) {
        base64 += "=";
      }
      const binary = atob(base64);
      const xored = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        xored[i] = binary.charCodeAt(i);
      }
      const keyBytes = new TextEncoder().encode(SECRET_KEY);
      const utf8Bytes = new Uint8Array(xored.length);
      for (let i = 0; i < xored.length; i++) {
        utf8Bytes[i] = xored[i] ^ keyBytes[i % keyBytes.length];
      }
      const jsonStr = new TextDecoder().decode(utf8Bytes);
      return JSON.parse(jsonStr);
    } catch (err) {
      console.error("Error decodificando el link del sorteo:", err);
      return null;
    }
  }

  // =========================================================
  // 2. ALGORITMO DEL SORTEO (CICLO CERRADO SIN REPETICIONES)
  // =========================================================
  function cryptoRandomInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function generateClosedCycleDraw(namesList, usePins) {
    // Clonamos y mezclamos con Fisher-Yates criptográfico
    const shuffled = [...namesList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    // Armamos el ciclo cerrado: shuffled[i] -> shuffled[(i + 1) % length]
    // Así nadie se regala a sí mismo, nadie se repite y nadie se queda sin regalo
    const pairs = shuffled.map((giver, idx) => {
      const receiver = shuffled[(idx + 1) % shuffled.length];
      const pin = usePins
        ? String(1000 + cryptoRandomInt(9000))
        : "";
      return [giver, receiver, pin];
    });

    // Ordenamos alfabéticamente por el nombre del que regala para que no revele el orden del ciclo
    pairs.sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }));
    return pairs;
  }

  // =========================================================
  // 3. GESTIÓN DE VISTAS Y EVENTOS DEL ORGANIZADOR
  // =========================================================
  function showOnlyView(viewToShow) {
    [viewOrganizer, viewShare, viewParticipantList, viewReveal].forEach((v) => {
      v.classList.add("hidden");
    });
    viewToShow.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 2800);
  }

  function showError(msg) {
    if (!msg) {
      organizerError.classList.add("hidden");
      organizerError.textContent = "";
      return;
    }
    organizerError.textContent = msg;
    organizerError.classList.remove("hidden");
  }

  function normalizeName(raw) {
    return raw.trim().replace(/\s+/g, " ");
  }

  function addParticipantName(rawName) {
    const clean = normalizeName(rawName);
    if (!clean) return false;

    const exists = participants.some(
      (p) => p.toLowerCase() === clean.toLowerCase()
    );
    if (exists) {
      showError(`"${clean}" ya está en la lista. Si hay dos personas con el mismo nombre, agregale la inicial del apellido o apodo.`);
      return false;
    }

    showError("");
    participants.push(clean);
    renderParticipantChips();
    return true;
  }

  function removeParticipantIndex(idx) {
    participants.splice(idx, 1);
    renderParticipantChips();
  }

  function renderParticipantChips() {
    ulChips.innerHTML = "";
    badgeCount.textContent = `${participants.length} ${participants.length === 1 ? "cargado" : "cargados"}`;

    if (participants.length === 0) {
      emptyHint.classList.remove("hidden");
      return;
    }
    emptyHint.classList.add("hidden");

    participants.forEach((name, idx) => {
      const li = document.createElement("li");
      li.className = "chip-item";

      const span = document.createElement("span");
      span.textContent = name;

      const btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "chip-remove";
      btnRemove.title = `Quitar a ${name}`;
      btnRemove.textContent = "✕";
      btnRemove.addEventListener("click", () => removeParticipantIndex(idx));

      li.appendChild(span);
      li.appendChild(btnRemove);
      ulChips.appendChild(li);
    });
  }

  btnAddParticipant.addEventListener("click", () => {
    if (addParticipantName(inputParticipant.value)) {
      inputParticipant.value = "";
      inputParticipant.focus();
    }
  });

  inputParticipant.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (addParticipantName(inputParticipant.value)) {
        inputParticipant.value = "";
      }
    }
  });

  btnToggleBulk.addEventListener("click", () => {
    bulkBox.classList.toggle("hidden");
    if (!bulkBox.classList.contains("hidden")) {
      bulkTextarea.focus();
    }
  });

  btnConfirmBulk.addEventListener("click", () => {
    const rawText = bulkTextarea.value;
    if (!rawText.trim()) return;
    const parts = rawText
      .split(/[\n,;]+/)
      .map((s) => normalizeName(s.replace(/^[-•*\d.)+\s]+/, "")))
      .filter(Boolean);

    let added = 0;
    parts.forEach((p) => {
      if (addParticipantName(p)) added++;
    });

    bulkTextarea.value = "";
    bulkBox.classList.add("hidden");
    if (added > 0) {
      showToast(`✅ Se agregaron ${added} participantes`);
    }
  });

  // =========================================================
  // 4. GENERAR SORTEO Y LINKS PARA COMPARTIR
  // =========================================================
  function getEffectiveBaseUrl() {
    const custom = customBaseUrlInput.value.trim();
    if (custom) {
      return custom.replace(/\/+$/, "");
    }
    return window.location.href.split("?")[0].split("#")[0];
  }

  function buildShareLinks() {
    if (!currentDrawData) return;
    const base = getEffectiveBaseUrl();
    const token = encodePayload(currentDrawData);
    const fullGroupUrl = `${base}?s=${token}`;

    groupShareUrlInput.value = fullGroupUrl;

    const titleText = currentDrawData.t || "¡Navidad es Jesús! - Papá Noel Invisible";
    const waMessage =
      `🎄 *${titleText}* 🎁\n\n` +
      `¡Hola a todos! Ya está hecho el sorteo sorpresa del *Papá Noel Invisible*.\n` +
      (currentDrawData.n ? `📌 _${currentDrawData.n}_\n\n` : `\n`) +
      `👉 Entrá a este link, tocá *únicamente tu nombre* y descubrí a quién te toca hacerle un regalo:\n${fullGroupUrl}`;

    btnWhatsappGroup.href = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

    // Renderizar links individuales
    individualItemsUl.innerHTML = "";
    pinsIndicatorText.textContent = currentDrawData.u ? "(con sus PINs)" : "";

    currentDrawData.p.forEach(([giver, receiver, pin]) => {
      const singlePayload = {
        id: currentDrawData.id,
        t: currentDrawData.t,
        n: currentDrawData.n,
        g: giver,
        r: receiver,
      };
      const singleToken = encodePayload(singlePayload);
      const singleUrl = `${base}?p=${singleToken}`;

      const li = document.createElement("li");
      li.className = "ind-item";

      const infoDiv = document.createElement("div");
      infoDiv.className = "ind-name-wrap";

      const nameSpan = document.createElement("span");
      nameSpan.className = "ind-name";
      nameSpan.textContent = `🎅 ${giver}`;
      infoDiv.appendChild(nameSpan);

      if (currentDrawData.u && pin) {
        const pinSpan = document.createElement("span");
        pinSpan.className = "ind-pin";
        pinSpan.textContent = `🔐 PIN para el link grupal: ${pin}`;
        infoDiv.appendChild(pinSpan);
      }

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "ind-actions";

      const btnCopyInd = document.createElement("button");
      btnCopyInd.type = "button";
      btnCopyInd.className = "btn btn-secondary btn-sm";
      btnCopyInd.textContent = "📋 Link";
      btnCopyInd.addEventListener("click", () => {
        navigator.clipboard.writeText(singleUrl);
        showToast(`Link personal de ${giver} copiado`);
      });

      const waIndMsg =
        `🎄 *${titleText}* 🎁\n\n` +
        `¡Hola *${giver}*! Tocá tu sobre personal para descubrir a quién le hacés regalo en esta Navidad:\n` +
        (currentDrawData.u && pin ? `(Si entrás por el link del grupo, tu PIN es *${pin}*)\n` : "") +
        `${singleUrl}`;

      const aWaInd = document.createElement("a");
      aWaInd.href = `https://wa.me/?text=${encodeURIComponent(waIndMsg)}`;
      aWaInd.target = "_blank";
      aWaInd.rel = "noopener";
      aWaInd.className = "btn btn-whatsapp btn-sm";
      aWaInd.textContent = "📲 WhatsApp";

      actionsDiv.appendChild(btnCopyInd);
      actionsDiv.appendChild(aWaInd);

      li.appendChild(infoDiv);
      li.appendChild(actionsDiv);
      individualItemsUl.appendChild(li);
    });
  }

  btnGenerateDraw.addEventListener("click", () => {
    // Si quedó texto escrito en el input de participante, lo sumamos automáticamente
    if (inputParticipant.value.trim()) {
      if (!addParticipantName(inputParticipant.value)) return;
      inputParticipant.value = "";
    }

    if (participants.length < 3) {
      showError("Necesitás cargar al menos 3 personas para que el sorteo sea secreto y nadie adivine quién le regala a quién.");
      return;
    }

    showError("");
    const usePins = chkUsePins.checked;
    const pairs = generateClosedCycleDraw(participants, usePins);
    const drawId = "s" + Date.now().toString(36);

    currentDrawData = {
      id: drawId,
      t: normalizeName(inputTitle.value) || "¡Navidad es Jesús!",
      n: normalizeName(inputNote.value) || "Sorteo sorpresa de Papá Noel Invisible",
      u: usePins ? 1 : 0,
      p: pairs,
    };

    // Guardamos el último sorteo del organizador por si recarga sin querer
    try {
      localStorage.setItem("last_organizer_draw", JSON.stringify(currentDrawData));
    } catch (_) {}

    updateHeaderTitles(currentDrawData.t, currentDrawData.n);

    if (window.location.protocol === "file:") {
      localFileWarning.classList.remove("hidden");
    } else {
      localFileWarning.classList.add("hidden");
    }

    if (usePins) {
      individualLinksList.classList.remove("hidden");
    }

    buildShareLinks();
    launchConfetti();
    showOnlyView(viewShare);
  });

  customBaseUrlInput.addEventListener("input", buildShareLinks);

  btnCopyGroupUrl.addEventListener("click", () => {
    groupShareUrlInput.select();
    navigator.clipboard.writeText(groupShareUrlInput.value);
    showToast("✅ ¡Link del grupo copiado al portapapeles!");
  });

  btnToggleIndividual.addEventListener("click", () => {
    individualLinksList.classList.toggle("hidden");
  });

  btnPreviewGroup.addEventListener("click", () => {
    if (!currentDrawData) return;
    const token = encodePayload(currentDrawData);
    window.history.pushState({}, "", `?s=${token}`);
    renderParticipantListView(currentDrawData);
  });

  btnNewDraw.addEventListener("click", () => {
    window.history.pushState({}, "", window.location.pathname);
    updateHeaderTitles("¡Navidad es Jesús!", "Sorteo sorpresa de regalos navideños");
    showOnlyView(viewOrganizer);
  });

  // =========================================================
  // 5. MODO PARTICIPANTE: ELEGIR NOMBRE Y REVELAR
  // =========================================================
  function updateHeaderTitles(title, note) {
    elTitleDisplay.textContent = title || "¡Navidad es Jesús!";
    elNoteDisplay.textContent = note || "Sorteo sorpresa de regalos navideños";
  }

  function getSavedGiverForDraw(drawId) {
    try {
      return localStorage.getItem(`opened_${drawId}`);
    } catch (_) {
      return null;
    }
  }

  function setSavedGiverForDraw(drawId, giverName) {
    try {
      localStorage.setItem(`opened_${drawId}`, giverName);
    } catch (_) {}
  }

  function renderParticipantListView(drawData) {
    currentDrawData = drawData;
    isSingleParticipantLink = false;
    updateHeaderTitles(drawData.t, drawData.n);

    const savedGiver = getSavedGiverForDraw(drawData.id);
    if (savedGiver) {
      const foundEntry = drawData.p.find((item) => item[0] === savedGiver);
      if (foundEntry) {
        savedPersonName.textContent = savedGiver;
        alreadyOpenedBanner.classList.remove("hidden");
        btnReopenSaved.onclick = () => {
          openRevealStage(foundEntry);
        };
      } else {
        alreadyOpenedBanner.classList.add("hidden");
      }
    } else {
      alreadyOpenedBanner.classList.add("hidden");
    }

    if (drawData.p.length > 6) {
      participantSearchBox.classList.remove("hidden");
    } else {
      participantSearchBox.classList.add("hidden");
    }

    searchParticipantInput.value = "";
    populateParticipantButtons("");
    showOnlyView(viewParticipantList);
  }

  function populateParticipantButtons(filterText) {
    participantButtonsGrid.innerHTML = "";
    const q = filterText.trim().toLowerCase();

    currentDrawData.p.forEach((entry, idx) => {
      const [giver] = entry;
      if (q && !giver.toLowerCase().includes(q)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "participant-card-btn";

      const emojiSpan = document.createElement("span");
      emojiSpan.className = "avatar-emoji";
      emojiSpan.textContent = AVATARS[idx % AVATARS.length];

      const nameSpan = document.createElement("span");
      nameSpan.textContent = giver;

      btn.appendChild(emojiSpan);
      btn.appendChild(nameSpan);

      btn.addEventListener("click", () => onSelectParticipantCard(entry));
      participantButtonsGrid.appendChild(btn);
    });
  }

  searchParticipantInput.addEventListener("input", () => {
    populateParticipantButtons(searchParticipantInput.value);
  });

  function onSelectParticipantCard(entry) {
    selectedParticipantEntry = entry;
    const [giver, , pin] = entry;

    modalPersonName.textContent = giver;
    modalPinError.classList.add("hidden");
    modalPinInput.value = "";

    if (currentDrawData.u && pin) {
      modalPinSection.classList.remove("hidden");
      setTimeout(() => modalPinInput.focus(), 100);
    } else {
      modalPinSection.classList.add("hidden");
    }

    confirmModal.classList.remove("hidden");
  }

  btnModalCancel.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
    selectedParticipantEntry = null;
  });

  btnModalConfirm.addEventListener("click", () => {
    if (!selectedParticipantEntry) return;
    const [, , pin] = selectedParticipantEntry;

    if (currentDrawData && currentDrawData.u && pin) {
      if (modalPinInput.value.trim() !== String(pin)) {
        modalPinError.classList.remove("hidden");
        return;
      }
    }

    confirmModal.classList.add("hidden");
    openRevealStage(selectedParticipantEntry);
  });

  function openRevealStage(entry) {
    const [giver, receiver] = entry;
    selectedParticipantEntry = entry;

    revealGiverName.textContent = giver;
    revealReceiverName.textContent = receiver;

    giftClosedStage.classList.remove("hidden");
    giftOpenedStage.classList.add("hidden");

    if (isSingleParticipantLink) {
      btnBackToList.classList.add("hidden");
    } else {
      btnBackToList.classList.remove("hidden");
    }

    showOnlyView(viewReveal);
  }

  btnOpenGift.addEventListener("click", () => {
    if (!selectedParticipantEntry) return;
    const [giver] = selectedParticipantEntry;

    if (currentDrawData && currentDrawData.id) {
      setSavedGiverForDraw(currentDrawData.id, giver);
    }

    giftClosedStage.classList.add("hidden");
    giftOpenedStage.classList.remove("hidden");
    launchConfetti();
  });

  btnHideResult.addEventListener("click", () => {
    giftOpenedStage.classList.add("hidden");
    giftClosedStage.classList.remove("hidden");
  });

  btnBackToList.addEventListener("click", () => {
    if (currentDrawData) {
      renderParticipantListView(currentDrawData);
    }
  });

  btnGoOrganizer.addEventListener("click", () => {
    window.history.pushState({}, "", window.location.pathname);
    updateHeaderTitles("¡Navidad es Jesús!", "Sorteo sorpresa de regalos navideños");
    showOnlyView(viewOrganizer);
  });

  // =========================================================
  // 6. DESCARGAR TARJETA RECORDATORIO CON LA IMAGEN NAVIDEÑA
  // =========================================================
  btnDownloadTicket.addEventListener("click", () => {
    if (!selectedParticipantEntry) return;
    const [giver, receiver] = selectedParticipantEntry;
    const heroImg = document.getElementById("hero-img");

    const buildAndDownload = (includePhoto) => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 1050;
      const ctx = canvas.getContext("2d");

      // Fondo azul noche navideño
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, "#0b0f29");
      grad.addColorStop(0.5, "#191c4d");
      grad.addColorStop(1, "#090c22");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Marco dorado
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 8;
      ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

      if (includePhoto && heroImg && heroImg.complete && heroImg.naturalWidth > 0) {
        const targetH = 460;
        const aspect = heroImg.naturalWidth / heroImg.naturalHeight;
        const targetW = targetH * aspect;
        const x = (canvas.width - targetW) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, 65, targetW, targetH, 24);
        ctx.clip();
        ctx.drawImage(heroImg, x, 65, targetW, targetH);
        ctx.restore();
      } else {
        ctx.textAlign = "center";
        ctx.font = "130px sans-serif";
        ctx.fillText("🎄🎅🎁", canvas.width / 2, 330);
      }

      ctx.textAlign = "center";
      ctx.fillStyle = "#fde68a";
      ctx.font = "bold 34px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(currentDrawData?.t || "¡Navidad es Jesús!", canvas.width / 2, 590);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "26px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(`Hola ${giver}, tu misión secreta es regalarle a:`, canvas.width / 2, 660);

      // Caja roja dorada para el nombre del agasajado
      ctx.fillStyle = "#991b1b";
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(90, 700, 620, 150, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 54px Georgia, serif";
      ctx.fillText(`🎁 ${receiver} 🎁`, canvas.width / 2, 793);

      if (currentDrawData?.n) {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "italic 23px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(currentDrawData.n, canvas.width / 2, 915);
      }

      ctx.fillStyle = "#94a3b8";
      ctx.font = "20px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("🤫 ¡Guardá el secreto hasta Navidad!", canvas.width / 2, 975);

      const link = document.createElement("a");
      link.download = `Papa-Noel-Invisible-${giver}.png`;
      try {
        link.href = canvas.toDataURL("image/png");
        link.click();
        showToast("📥 ¡Tarjeta guardada en tu dispositivo!");
      } catch (_) {
        if (includePhoto) {
          buildAndDownload(false);
        }
      }
    };

    buildAndDownload(true);
  });

  // =========================================================
  // 7. ANIMACIÓN DE NIEVE Y CONFETI NAVIDEÑO
  // =========================================================
  function initSnowAnimation() {
    const canvas = document.getElementById("snow-canvas");
    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const flakes = Array.from({ length: 55 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2.6 + 1,
      d: Math.random() * 0.7 + 0.3,
      gold: Math.random() < 0.25,
    }));

    function drawSnow() {
      ctx.clearRect(0, 0, width, height);
      for (const f of flakes) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = f.gold
          ? "rgba(253, 230, 138, 0.75)"
          : "rgba(255, 255, 255, 0.65)";
        ctx.fill();

        f.y += f.d;
        f.x += Math.sin(f.y * 0.015) * 0.35;
        if (f.y > height) {
          f.y = -5;
          f.x = Math.random() * width;
        }
      }
      requestAnimationFrame(drawSnow);
    }
    drawSnow();
  }

  function launchConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#fbbf24", "#fde68a", "#ef4444", "#22c55e", "#ffffff"];
    const pieces = Array.from({ length: 85 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 80,
      y: canvas.height * 0.45,
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -14 - 4,
      size: Math.random() * 8 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.2,
    }));

    let frame = 0;
    function step() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.38; // gravedad
        p.rot += p.vrot;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        ctx.restore();
      });
      frame++;
      if (frame < 110) {
        requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    step();
  }

  // =========================================================
  // 8. INICIALIZACIÓN AL ABRIR LA APP
  // =========================================================
  function initApp() {
    initSnowAnimation();

    const params = new URLSearchParams(window.location.search);
    const groupToken = params.get("s");
    const singleToken = params.get("p");

    if (singleToken) {
      const data = decodePayload(singleToken);
      if (data && data.g && data.r) {
        isSingleParticipantLink = true;
        currentDrawData = {
          id: data.id || "single",
          t: data.t,
          n: data.n,
          u: 0,
          p: [[data.g, data.r, ""]],
        };
        updateHeaderTitles(data.t, data.n);
        openRevealStage([data.g, data.r, ""]);
        return;
      }
    }

    if (groupToken) {
      const data = decodePayload(groupToken);
      if (data && Array.isArray(data.p) && data.p.length > 0) {
        renderParticipantListView(data);
        return;
      }
    }

    // Por defecto abre el Modo Organizador
    showOnlyView(viewOrganizer);
  }

  initApp();
})();
