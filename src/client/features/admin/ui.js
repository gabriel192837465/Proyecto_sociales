export function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("visible");
    modal.style.display = "";
  }
}

export function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("visible");
    modal.style.display = "none";
  }
}

export function setModalContent(id, content) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = content;
  }
}

export function setModalValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

export function getModalValue(id) {
  const element = document.getElementById(id);
  return element ? element.value : null;
}

export function setElementDisplay(id, display) {
  const element = document.getElementById(id);
  if (element) {
    element.style.display = display;
  }
}

export function setElementHTML(id, html) {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = html;
  }
}

export function toggleClass(element, className, condition) {
  if (element) {
    element.classList.toggle(className, condition);
  }
}
