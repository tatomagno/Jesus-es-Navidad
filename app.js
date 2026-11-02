/**
 * Sorteo Papá Noel Invisible - "¡Navidad es Jesús!"
 * Incluye:
 * - Sorteo de ciclo cerrado sin repeticiones (nadie se saca a sí mismo ni queda sin regalo)
 * - Protección obligatoria con clave personal (creada por cada participante al entrar o asignada por el organizador)
 * - Sección de Talles (ropa, calzado) y Deseos/Gustos de regalo + envío al grupo de WhatsApp y sincronización opcional en la nube
 */

(function () {
  "use strict";

  // --- Estado de la aplicación ---
  // Cada participante en el organizador: { name, wish, pin }
  let participants = [];
  // Estructura de currentDrawData:
  // {
  //   id: "s...",
  //   t: "Título",
  //   n: "Nota/Presupuesto",
  //   m: "self" | "org", // modo de clave
  //   db: "https://...", // URL opcional de Firebase RTDB
  //   p: [ [giver, receiver, initialPin, initialWish], ... ]
  // }
  let currentDrawData = null;
  let selectedParticipantEntry = null; // [giver, receiver, initialPin, initialWish]
  let isSingleParticipantLink = false;

  // Cache sincronizado de claves y deseos dinámicos:
  // { [personName]: { pin: "...", clothes: "...", shoes: "...", notes: "..." } }
  let dynamicProfiles = {};

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
  const inputParticipantWish = document.getElementById("participant-wish-input");
  const inputParticipantPin = document.getElementById("participant-pin-input");
  const btnAddParticipant = document.getElementById("btn-add-participant");
  const badgeCount = document.getElementById("participant-count-badge");
  const emptyHint = document.getElementById("empty-participants-hint");
  const ulChips = document.getElementById("participants-chips");

  const btnToggleBulk = document.getElementById("btn-toggle-bulk");
  const bulkBox = document.getElementById("bulk-paste-box");
  const bulkTextarea = document.getElementById("bulk-textarea");
  const btnConfirmBulk = document.getElementById("btn-confirm-bulk");

  const cloudDbUrlInput = document.getElementById("cloud-db-url-input");
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
  const indListExplanation = document.getElementById("ind-list-explanation");
  const btnNewDraw = document.getElementById("btn-new-draw");

  // Vista Lista de Participantes
  const alreadyOpenedBanner = document.getElementById("already-opened-banner");
  const savedPersonName = document.getElementById("saved-person-name");
  const btnReopenSaved = document.getElementById("btn-reopen-saved");
  const searchParticipantInput = document.getElementById("search-participant-input");
  const participantSearchBox = document.getElementById("participant-search-box");
  const participantButtonsGrid = document.getElementById("participant-buttons-grid");
  const publicWishesList = document.getElementById("public-wishes-list");
  const btnGoOrganizer = document.getElementById("btn-go-organizer");

  // Vista Revelación + Deseos
  const revealGiverName = document.getElementById("reveal-giver-name");
  const giftClosedStage = document.getElementById("gift-closed-stage");
  const giftOpenedStage = document.getElementById("gift-opened-stage");
  const btnOpenGift = document.getElementById("btn-open-gift");
  const revealReceiverName = document.getElementById("reveal-receiver-name");
  const receiverWishOwner = document.getElementById("receiver-wish-owner");
  const receiverWishText = document.getElementById("receiver-wish-text");
  const btnDownloadTicket = document.getElementById("btn-download-ticket");
  const btnHideResult = document.getElementById("btn-hide-result");
  const btnBackToList = document.getElementById("btn-back-to-list");

  const inputMyClothes = document.getElementById("my-size-clothes");
  const inputMyShoes = document.getElementById("my-size-shoes");
  const inputMyNotes = document.getElementById("my-wish-notes");
  const btnSaveMyWish = document.getElementById("btn-save-my-wish");
  const btnWaMyWish = document.getElementById("btn-wa-my-wish");

  // Modal de Confirmación y Clave
  const confirmModal = document.getElementById("confirm-modal");
  const modalPersonName = document.getElementById("modal-person-name");
  const modalInstructionText = document.getElementById("modal-instruction-text");
  const modalPinLabel = document.getElementById("modal-pin-label");
  const modalPinInput = document.getElementById("modal-pin-input");
  const modalPinHint = document.getElementById("modal-pin-hint");
  const modalPinError = document.getElementById("modal-pin-error");
  const btnModalCancel = document.getElementById("btn-modal-cancel");
  const btnModalConfirm = document.getElementById("btn-modal-confirm");

  const toastEl = document.getElementById("toast");

  // =========================================================
  // 1. CODIFICACIÓN OFUSCADA EN LA URL
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
  // 2. PERSISTENCIA LOCAL + SINCRONIZACIÓN OPCIONAL EN LA NUBE
  // =========================================================
  function getLocalProfilesKey(drawId) {
    return `profiles_${drawId || "default"}`;
  }

  function loadLocalProfiles(drawId) {
    try {
      const raw = localStorage.getItem(getLocalProfilesKey(drawId));
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveLocalProfiles(drawId, profilesObj) {
    try {
      localStorage.setItem(getLocalProfilesKey(drawId), JSON.stringify(profilesObj));
    } catch (_) {}
  }

  async function syncProfilesFromCloud(drawData) {
    if (!drawData) return;
    dynamicProfiles = loadLocalProfiles(drawData.id);

    if (drawData.db) {
      try {
        const cleanDb = drawData.db.replace(/\/+$/, "");
        const res = await fetch(`${cleanDb}/sorteos/${encodeURIComponent(drawData.id)}.json`);
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData && typeof cloudData === "object") {
            dynamicProfiles = { ...dynamicProfiles, ...cloudData };
            saveLocalProfiles(drawData.id, dynamicProfiles);
          }
        }
      } catch (e) {
        console.warn("No se pudo sincronizar desde la nube:", e);
      }
    }
  }

  async function savePersonProfile(drawData, personName, profileUpdate) {
    if (!drawData) return;
    const current = dynamicProfiles[personName] || {};
    const merged = { ...current, ...profileUpdate };
    dynamicProfiles[personName] = merged;
    saveLocalProfiles(drawData.id, dynamicProfiles);

    if (drawData.db) {
      try {
        const cleanDb = drawData.db.replace(/\/+$/, "");
        await fetch(
          `${cleanDb}/sorteos/${encodeURIComponent(drawData.id)}/${encodeURIComponent(personName)}.json`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(merged),
          }
        );
      } catch (e) {
        console.warn("Error guardando en la nube:", e);
      }
    }
  }

  // Obtiene la clave efectiva de un participante (sea cargada en el sorteo o creada por la persona)
  function getEffectivePin(entry) {
    const [giver, , initialPin] = entry;
    if (dynamicProfiles[giver] && dynamicProfiles[giver].pin) {
      return String(dynamicProfiles[giver].pin);
    }
    if (initialPin) {
      return String(initialPin);
    }
    return "";
  }

  // Formatea el texto de talles y deseos de una persona
  function getFormattedWishForPerson(personName) {
    let initialWish = "";
    if (currentDrawData && Array.isArray(currentDrawData.p)) {
      const found = currentDrawData.p.find((item) => item[0] === personName);
      if (found && found[3]) {
        initialWish = found[3];
      }
    }

    const prof = dynamicProfiles[personName];
    if (prof) {
      const parts = [];
      if (prof.clothes) parts.push(`👕 Ropa: ${prof.clothes}`);
      if (prof.shoes) parts.push(`👟 Calzado: ${prof.shoes}`);
      if (prof.notes) parts.push(`🎁 Le gustaría: ${prof.notes}`);
      if (parts.length > 0) {
        return parts.join("  |  ");
      }
    }

    return initialWish || "";
  }

  // =========================================================
  // 3. ALGORITMO DEL SORTEO (CICLO CERRADO SIN REPETICIONES)
  // =========================================================
  function cryptoRandomInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function generateClosedCycleDraw(participantsList, pinMode) {
    const shuffled = [...participantsList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    // Ciclo cerrado: shuffled[i] le regala a shuffled[(i + 1) % n]
    const pairs = shuffled.map((person, idx) => {
      const receiver = shuffled[(idx + 1) % shuffled.length];
      let pin = person.pin || "";
      if (pinMode === "organizer" && !pin) {
        pin = String(1000 + cryptoRandomInt(9000));
      }
      return [person.name, receiver.name, pin, person.wish || ""];
    });

    pairs.sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }));
    return pairs;
  }

  // =========================================================
  // 4. GESTIÓN DEL MODO ORGANIZADOR
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
    }, 3000);
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
    return (raw || "").trim().replace(/\s+/g, " ");
  }

  function addParticipantObj(rawName, rawWish, rawPin) {
    const cleanName = normalizeName(rawName);
    if (!cleanName) return false;

    const exists = participants.some(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (exists) {
      showError(`"${cleanName}" ya está en la lista. Si hay dos personas con el mismo nombre, agregale la inicial del apellido o apodo.`);
      return false;
    }

    showError("");
    participants.push({
      name: cleanName,
      wish: normalizeName(rawWish),
      pin: normalizeName(rawPin),
    });
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

    participants.forEach((p, idx) => {
      const li = document.createElement("li");
      li.className = "chip-item";

      const span = document.createElement("span");
      span.textContent = p.name;
      li.appendChild(span);

      if (p.wish || p.pin) {
        const meta = document.createElement("span");
        meta.className = "chip-meta";
        const tags = [];
        if (p.wish) tags.push(`🎁`);
        if (p.pin) tags.push(`🔑${p.pin}`);
        meta.textContent = tags.join(" ");
        meta.title = `${p.wish ? "Deseo/Talle: " + p.wish : ""} ${p.pin ? "Clave: " + p.pin : ""}`;
        li.appendChild(meta);
      }

      const btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "chip-remove";
      btnRemove.title = `Quitar a ${p.name}`;
      btnRemove.textContent = "✕";
      btnRemove.addEventListener("click", () => removeParticipantIndex(idx));

      li.appendChild(btnRemove);
      ulChips.appendChild(li);
    });
  }

  function triggerAddFromInputs() {
    if (addParticipantObj(inputParticipant.value, inputParticipantWish.value, inputParticipantPin.value)) {
      inputParticipant.value = "";
      inputParticipantWish.value = "";
      inputParticipantPin.value = "";
      inputParticipant.focus();
    }
  }

  btnAddParticipant.addEventListener("click", triggerAddFromInputs);

  [inputParticipant, inputParticipantWish, inputParticipantPin].forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        triggerAddFromInputs();
      }
    });
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
      if (addParticipantObj(p, "", "")) added++;
    });

    bulkTextarea.value = "";
    bulkBox.classList.add("hidden");
    if (added > 0) {
      showToast(`✅ Se agregaron ${added} participantes`);
    }
  });

  // =========================================================
  // 5. GENERAR SORTEO Y COMPARTIR
  // =========================================================
  function getSelectedPinMode() {
    const checked = document.querySelector('input[name="pin-mode"]:checked');
    return checked ? checked.value : "self";
  }

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
      `👉 Entrá a este link, tocá *tu nombre*, poné tu clave secreta para ver quién te tocó y dejá anotados tus talles o qué te gustaría recibir:\n${fullGroupUrl}`;

    btnWhatsappGroup.href = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

    individualItemsUl.innerHTML = "";
    if (currentDrawData.m === "org") {
      indListExplanation.textContent =
        "Elegiste PIN por persona: pasale a cada participante su PIN de 4 dígitos (o mandale su mensaje directo con el botón de WhatsApp):";
    } else {
      indListExplanation.textContent =
        "Cada persona creará su propia clave al abrir su nombre por primera vez. Si alguien prefiere su link directo individual, podés enviárselo desde acá:";
    }

    currentDrawData.p.forEach(([giver, receiver, pin, wish]) => {
      const singlePayload = {
        id: currentDrawData.id,
        t: currentDrawData.t,
        n: currentDrawData.n,
        m: currentDrawData.m,
        db: currentDrawData.db || "",
        g: giver,
        r: receiver,
        pin: pin || "",
        rw: getFormattedWishForPerson(receiver),
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

      const pinSpan = document.createElement("span");
      pinSpan.className = "ind-pin";
      if (pin) {
        pinSpan.textContent = `🔑 Clave asignada: ${pin}`;
      } else {
        pinSpan.textContent = `🔐 Crea su clave al entrar`;
      }
      infoDiv.appendChild(pinSpan);

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
        `¡Hola *${giver}*! Entrá acá para descubrir a quién le hacés regalo en esta Navidad y anotar tus talles/deseos:\n` +
        (pin ? `🔑 Tu clave secreta es: *${pin}*\n` : "") +
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
    if (inputParticipant.value.trim()) {
      if (!addParticipantObj(inputParticipant.value, inputParticipantWish.value, inputParticipantPin.value)) {
        return;
      }
      inputParticipant.value = "";
      inputParticipantWish.value = "";
      inputParticipantPin.value = "";
    }

    if (participants.length < 3) {
      showError("Necesitás cargar al menos 3 personas para que el sorteo sea sorpresa y nadie adivine quién le regala a quién.");
      return;
    }

    showError("");
    const pinMode = getSelectedPinMode();
    const pairs = generateClosedCycleDraw(participants, pinMode);
    const drawId = "s" + Date.now().toString(36);

    currentDrawData = {
      id: drawId,
      t: normalizeName(inputTitle.value) || "¡Navidad es Jesús!",
      n: normalizeName(inputNote.value) || "Sorteo sorpresa de Papá Noel Invisible",
      m: pinMode === "organizer" ? "org" : "self",
      db: normalizeName(cloudDbUrlInput.value),
      p: pairs,
    };

    dynamicProfiles = {};
    saveLocalProfiles(drawId, dynamicProfiles);
    updateHeaderTitles(currentDrawData.t, currentDrawData.n);

    if (window.location.protocol === "file:") {
      localFileWarning.classList.remove("hidden");
    } else {
      localFileWarning.classList.add("hidden");
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

  btnPreviewGroup.addEventListener("click", async () => {
    if (!currentDrawData) return;
    const token = encodePayload(currentDrawData);
    window.history.pushState({}, "", `?s=${token}`);
    await renderParticipantListView(currentDrawData);
  });

  btnNewDraw.addEventListener("click", () => {
    window.history.pushState({}, "", window.location.pathname);
    updateHeaderTitles("¡Navidad es Jesús!", "Sorteo sorpresa de regalos navideños");
    showOnlyView(viewOrganizer);
  });

  // =========================================================
  // 6. MODO PARTICIPANTE: LISTA, CLAVE Y CARTELERA DE DESEOS
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

  async function renderParticipantListView(drawData) {
    currentDrawData = drawData;
    isSingleParticipantLink = false;
    updateHeaderTitles(drawData.t, drawData.n);

    await syncProfilesFromCloud(drawData);

    const savedGiver = getSavedGiverForDraw(drawData.id);
    if (savedGiver) {
      const foundEntry = drawData.p.find((item) => item[0] === savedGiver);
      if (foundEntry) {
        savedPersonName.textContent = savedGiver;
        alreadyOpenedBanner.classList.remove("hidden");
        btnReopenSaved.onclick = () => {
          onSelectParticipantCard(foundEntry);
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
    renderPublicWishesBoard();
    showOnlyView(viewParticipantList);
  }

  function populateParticipantButtons(filterText) {
    participantButtonsGrid.innerHTML = "";
    const q = filterText.trim().toLowerCase();

    currentDrawData.p.forEach((entry, idx) => {
      const [giver] = entry;
      if (q && !giver.toLowerCase().includes(q)) return;

      const hasPin = Boolean(getEffectivePin(entry));

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "participant-card-btn";

      const emojiSpan = document.createElement("span");
      emojiSpan.className = "avatar-emoji";
      emojiSpan.textContent = AVATARS[idx % AVATARS.length];

      const nameSpan = document.createElement("span");
      nameSpan.textContent = giver;

      const statusPill = document.createElement("span");
      statusPill.className = "lock-status-pill";
      statusPill.textContent = hasPin ? "🔒 Con clave" : "🔑 Crear clave";

      btn.appendChild(emojiSpan);
      btn.appendChild(nameSpan);
      btn.appendChild(statusPill);

      btn.addEventListener("click", () => onSelectParticipantCard(entry));
      participantButtonsGrid.appendChild(btn);
    });
  }

  function renderPublicWishesBoard() {
    publicWishesList.innerHTML = "";
    if (!currentDrawData || !Array.isArray(currentDrawData.p)) return;

    currentDrawData.p.forEach(([personName]) => {
      const wishStr = getFormattedWishForPerson(personName);
      const li = document.createElement("li");
      li.className = "wish-li";

      const strong = document.createElement("strong");
      strong.textContent = `${personName}: `;
      li.appendChild(strong);

      const span = document.createElement("span");
      if (wishStr) {
        span.textContent = wishStr;
      } else {
        span.className = "wish-empty";
        span.textContent = "Todavía no anotó sus talles o deseos.";
      }
      li.appendChild(span);

      publicWishesList.appendChild(li);
    });
  }

  searchParticipantInput.addEventListener("input", () => {
    populateParticipantButtons(searchParticipantInput.value);
  });

  // --- Modal de Clave (SIEMPRE PIDE CLAVE) ---
  function onSelectParticipantCard(entry) {
    selectedParticipantEntry = entry;
    const [giver] = entry;
    const existingPin = getEffectivePin(entry);

    modalPersonName.textContent = giver;
    modalPinError.classList.add("hidden");
    modalPinInput.value = "";

    if (existingPin) {
      // Ya tiene clave (asignada por el organizador o creada antes por esta persona)
      modalInstructionText.textContent =
        "Este sobre está protegido con clave secreta. Ingresá tu clave para entrar:";
      modalPinLabel.textContent = "🔑 Ingresá tu clave secreta:";
      modalPinInput.placeholder = "Tu clave...";
      modalPinHint.textContent =
        currentDrawData.m === "org"
          ? "Pedile tu PIN al organizador si no lo tenés."
          : "Es la clave que elegiste la primera vez que abriste tu sobre.";
    } else {
      // Primera vez que entra en modo "Cada uno crea su clave"
      modalInstructionText.textContent =
        "¡Bienvenido/a! Como es la primera vez que abrís tu sobre, inventá una clave corta (ej: 4 números o una palabra) para bloquear tu nombre y que nadie más pueda espiarlo:";
      modalPinLabel.textContent = "🔐 Creá tu clave personal:";
      modalPinInput.placeholder = "Ej: 1234";
      modalPinHint.textContent = "Acordate de esta clave por si querés volver a entrar después.";
    }

    confirmModal.classList.remove("hidden");
    setTimeout(() => modalPinInput.focus(), 100);
  }

  btnModalCancel.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
    selectedParticipantEntry = null;
  });

  async function confirmModalAction() {
    if (!selectedParticipantEntry) return;
    const [giver] = selectedParticipantEntry;
    const existingPin = getEffectivePin(selectedParticipantEntry);
    const typedPin = modalPinInput.value.trim();

    if (!typedPin) {
      modalPinError.textContent = "⚠️ Por favor escribí una clave para continuar.";
      modalPinError.classList.remove("hidden");
      return;
    }

    if (existingPin) {
      if (typedPin.toLowerCase() !== existingPin.toLowerCase()) {
        modalPinError.textContent = "❌ Clave incorrecta. Intentá de nuevo.";
        modalPinError.classList.remove("hidden");
        return;
      }
    } else {
      // Guardamos la nueva clave creada por el participante
      await savePersonProfile(currentDrawData, giver, { pin: typedPin });
      showToast("🔐 ¡Tu sobre quedó protegido con tu clave!");
    }

    confirmModal.classList.add("hidden");
    openRevealStage(selectedParticipantEntry);
  }

  btnModalConfirm.addEventListener("click", confirmModalAction);
  modalPinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmModalAction();
    }
  });

  // =========================================================
  // 7. REVELACIÓN DEL REGALO + CARGA DE TALLES Y DESEOS
  // =========================================================
  function openRevealStage(entry) {
    const [giver, receiver] = entry;
    selectedParticipantEntry = entry;

    revealGiverName.textContent = giver;
    revealReceiverName.textContent = receiver;
    receiverWishOwner.textContent = receiver;

    const receiverWish = getFormattedWishForPerson(receiver);
    if (receiverWish) {
      receiverWishText.textContent = receiverWish;
    } else {
      receiverWishText.textContent =
        "Todavía no dejó anotados sus talles o qué le gustaría recibir. ¡Fijate en el grupo de WhatsApp o volvé a mirar más tarde!";
    }

    // Cargar los propios deseos/talles de quien abrió su sobre
    const myProf = dynamicProfiles[giver] || {};
    inputMyClothes.value = myProf.clothes || "";
    inputMyShoes.value = myProf.shoes || "";
    inputMyNotes.value = myProf.notes || (entry[3] || "");
    updateWhatsAppMyWishLink(giver);

    giftClosedStage.classList.remove("hidden");
    giftOpenedStage.classList.add("hidden");

    if (isSingleParticipantLink) {
      btnBackToList.classList.add("hidden");
    } else {
      btnBackToList.classList.remove("hidden");
    }

    showOnlyView(viewReveal);
  }

  function updateWhatsAppMyWishLink(giverName) {
    const clothes = normalizeName(inputMyClothes.value);
    const shoes = normalizeName(inputMyShoes.value);
    const notes = normalizeName(inputMyNotes.value);

    const lines = [`🎄 *Mis datos para mi Papá Noel Invisible (soy ${giverName}):*`];
    if (clothes) lines.push(`👕 *Talle ropa:* ${clothes}`);
    if (shoes) lines.push(`👟 *Calzado:* ${shoes}`);
    if (notes) lines.push(`🎁 *Me gustaría / gustos:* ${notes}`);
    if (!clothes && !shoes && !notes) {
      lines.push(`🎁 Todavía estoy pensando qué me gustaría recibir 😊`);
    }

    btnWaMyWish.href = `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  [inputMyClothes, inputMyShoes, inputMyNotes].forEach((inp) => {
    inp.addEventListener("input", () => {
      if (selectedParticipantEntry) {
        updateWhatsAppMyWishLink(selectedParticipantEntry[0]);
      }
    });
  });

  btnSaveMyWish.addEventListener("click", async () => {
    if (!selectedParticipantEntry || !currentDrawData) return;
    const [giver] = selectedParticipantEntry;

    const clothes = normalizeName(inputMyClothes.value);
    const shoes = normalizeName(inputMyShoes.value);
    const notes = normalizeName(inputMyNotes.value);

    await savePersonProfile(currentDrawData, giver, {
      clothes,
      shoes,
      notes,
    });

    updateWhatsAppMyWishLink(giver);
    showToast("✅ ¡Tus talles y deseos quedaron guardados!");
  });

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

  btnBackToList.addEventListener("click", async () => {
    if (currentDrawData) {
      await renderParticipantListView(currentDrawData);
    }
  });

  btnGoOrganizer.addEventListener("click", () => {
    window.history.pushState({}, "", window.location.pathname);
    updateHeaderTitles("¡Navidad es Jesús!", "Sorteo sorpresa de regalos navideños");
    showOnlyView(viewOrganizer);
  });

  // =========================================================
  // 8. DESCARGAR TARJETA RECORDATORIO CON TALLES INCLUIDOS
  // =========================================================
  btnDownloadTicket.addEventListener("click", () => {
    if (!selectedParticipantEntry) return;
    const [giver, receiver] = selectedParticipantEntry;
    const receiverWish = getFormattedWishForPerson(receiver);
    const heroImg = document.getElementById("hero-img");

    const buildAndDownload = (includePhoto) => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 1100;
      const ctx = canvas.getContext("2d");

      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, "#0b0f29");
      grad.addColorStop(0.5, "#191c4d");
      grad.addColorStop(1, "#090c22");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 8;
      ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

      if (includePhoto && heroImg && heroImg.complete && heroImg.naturalWidth > 0) {
        const targetH = 440;
        const aspect = heroImg.naturalWidth / heroImg.naturalHeight;
        const targetW = targetH * aspect;
        const x = (canvas.width - targetW) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, 60, targetW, targetH, 24);
        ctx.clip();
        ctx.drawImage(heroImg, x, 60, targetW, targetH);
        ctx.restore();
      } else {
        ctx.textAlign = "center";
        ctx.font = "130px sans-serif";
        ctx.fillText("🎄🎅🎁", canvas.width / 2, 320);
      }

      ctx.textAlign = "center";
      ctx.fillStyle = "#fde68a";
      ctx.font = "bold 34px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(currentDrawData?.t || "¡Navidad es Jesús!", canvas.width / 2, 565);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "26px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(`Hola ${giver}, tu misión secreta es regalarle a:`, canvas.width / 2, 630);

      // Caja roja dorada para el nombre del agasajado
      ctx.fillStyle = "#991b1b";
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(90, 665, 620, 145, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 52px Georgia, serif";
      ctx.fillText(`🎁 ${receiver} 🎁`, canvas.width / 2, 755);

      if (receiverWish) {
        ctx.fillStyle = "#fde68a";
        ctx.font = "bold 22px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(
          receiverWish.length > 65 ? receiverWish.slice(0, 62) + "..." : receiverWish,
          canvas.width / 2,
          865
        );
      }

      if (currentDrawData?.n) {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "italic 22px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(currentDrawData.n, canvas.width / 2, 930);
      }

      ctx.fillStyle = "#94a3b8";
      ctx.font = "20px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("🤫 ¡Guardá el secreto hasta Navidad!", canvas.width / 2, 1015);

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
  // 9. ANIMACIÓN DE NIEVE Y CONFETI NAVIDEÑO
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
        p.vy += 0.38;
        p.rot += p.vrot;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
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
  // 10. INICIALIZACIÓN AL ABRIR LA APP
  // =========================================================
  async function initApp() {
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
          m: data.m || "self",
          db: data.db || "",
          p: [
            [data.g, data.r, data.pin || "", ""],
            [data.r, "", "", data.rw || ""],
          ],
        };
        await syncProfilesFromCloud(currentDrawData);
        updateHeaderTitles(data.t, data.n);
        onSelectParticipantCard(currentDrawData.p[0]);
        return;
      }
    }

    if (groupToken) {
      const data = decodePayload(groupToken);
      if (data && Array.isArray(data.p) && data.p.length > 0) {
        await renderParticipantListView(data);
        return;
      }
    }

    showOnlyView(viewOrganizer);
  }

  initApp();
})();
