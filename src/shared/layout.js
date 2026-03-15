// 获取可编辑布局元素。
function getLayoutElements() {
  return [...dom.table.querySelectorAll("[data-layout-id]")];
}

// 记录元素当前的布局尺寸和位置。
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

// 应用布局位置尺寸。
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

// 规范化布局元素。
function normalizeLayoutElement(element) {
  const rect = captureLayoutRect(element);
  if (!rect) return;
  applyLayoutRect(element, rect);
}

// 保存布局状态。
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

// 应用已保存的布局状态。
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

// 清除自定义布局样式并恢复默认显示。
function clearLayoutStyles(element) {
  element.style.left = "";
  element.style.top = "";
  element.style.right = "";
  element.style.bottom = "";
  element.style.width = "";
  element.style.height = "";
  element.style.transform = "";
}

// 设置布局编辑模式。
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

// 重置布局状态。
function resetLayoutState() {
  window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
  setLayoutEditMode(false);
  for (const element of getLayoutElements()) {
    clearLayoutStyles(element);
  }
}

// 让面板支持拖拽悬浮显示。
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

// 启用布局编辑模式并允许拖拽调整。
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

