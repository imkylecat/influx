export function enableStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}

export function disableStyle(id: string): void {
  document.getElementById(id)?.remove();
}
