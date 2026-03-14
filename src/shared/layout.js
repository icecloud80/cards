function getLayoutElements() {
  return [...dom.table.querySelectorAll("[data-layout-id]")];
}

function captureLayoutRect(element) {
  if (element.offsetParent === null) return null;
  const tableRect = dom.table.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - tableRect.left,
    top: rect.top - tableRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function applyLayoutRect(element, rect) {
  if (!rect) return;
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
  element.style.right = "auto";
  element.style.bottom = "auto";
  element.style.transform = "none";
}

function normalizeLayoutElement(element) {
  const rect = captureLayoutRect(element);
  if (!rect) return;
  applyLayoutRect(element, rect);
}

function saveLayoutState() {
  const layouts = {};
  for (const element of getLayoutElements()) {
    const rect = captureLayoutRect(element);
    if (!rect) continue;
    layouts[element.dataset.layoutId] = rect;
    applyLayoutRect(element, rect);
  }
  window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
}

function applySavedLayoutState() {
  const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (!raw) return;
  try {
    const layouts = JSON.parse(raw);
    for (const element of getLayoutElements()) {
      const saved = layouts[element.dataset.layoutId];
      if (saved) {
        applyLayoutRect(element, saved);
      }
    }
  } catch {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
  }
}

function clearLayoutStyles(element) {
  element.style.left = "";
  element.style.top = "";
  element.style.right = "";
  element.style.bottom = "";
  element.style.width = "";
  element.style.height = "";
  element.style.transform = "";
}

function setLayoutEditMode(enabled) {
  state.layoutEditMode = enabled;
  dom.table.classList.toggle("layout-edit-mode", enabled);
  dom.layoutEditBtn.textContent = enabled ? "完成布局" : "布局编辑";
  dom.layoutEditBtn.classList.toggle("alert", enabled);
  if (enabled) {
    for (const element of getLayoutElements()) {
      normalizeLayoutElement(element);
    }
    return;
  }
  saveLayoutState();
}

function resetLayoutState() {
  window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
  setLayoutEditMode(false);
  for (const element of getLayoutElements()) {
    clearLayoutStyles(element);
  }
}

function makeFloatingPanel(panel, handle) {
  if (!panel || !handle) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (state.layoutEditMode) return;
    if (event.target.closest(".panel-close")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    const tableRect = panel.parentElement.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    panel.style.left = `${rect.left - tableRect.left}px`;
    panel.style.top = `${rect.top - tableRect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    handle.style.cursor = "grabbing";
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const tableRect = panel.parentElement.getBoundingClientRect();
    const nextLeft = Math.max(12, Math.min(tableRect.width - panel.offsetWidth - 12, event.clientX - tableRect.left - offsetX));
    const nextTop = Math.max(12, Math.min(tableRect.height - panel.offsetHeight - 12, event.clientY - tableRect.top - offsetY));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
  });

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = "grab";
    if (event?.pointerId !== undefined) {
      handle.releasePointerCapture(event.pointerId);
    }
  };

  handle.addEventListener("pointerup", stopDragging);
  handle.addEventListener("pointercancel", stopDragging);
}

function makeLayoutEditable(element) {
  if (!element) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  element.addEventListener("pointerdown", (event) => {
    if (!state.layoutEditMode) return;
    if (event.target.closest("button")) return;
    normalizeLayoutElement(element);
    const rect = element.getBoundingClientRect();
    const tableRect = dom.table.getBoundingClientRect();
    dragging = true;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    element.style.zIndex = "9";
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (!state.layoutEditMode || !dragging) return;
    const tableRect = dom.table.getBoundingClientRect();
    const nextLeft = Math.max(8, Math.min(tableRect.width - element.offsetWidth - 8, event.clientX - tableRect.left - offsetX));
    const nextTop = Math.max(8, Math.min(tableRect.height - element.offsetHeight - 8, event.clientY - tableRect.top - offsetY));
    element.style.left = `${nextLeft}px`;
    element.style.top = `${nextTop}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  });

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    element.style.zIndex = "";
    if (event?.pointerId !== undefined) {
      element.releasePointerCapture(event.pointerId);
    }
    if (state.layoutEditMode) {
      saveLayoutState();
    }
  };

  element.addEventListener("pointerup", stopDragging);
  element.addEventListener("pointercancel", stopDragging);
  element.addEventListener("mouseleave", () => {
    if (state.layoutEditMode) {
      saveLayoutState();
    }
  });
}

