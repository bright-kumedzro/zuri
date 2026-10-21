/**
 * Replaces a native <select> with a styled "select-only combobox" (the WAI-ARIA APG pattern), so the open list
 * matches the site instead of the browser's default menu.
 *
 * The <select> stays in the DOM, hidden, as the source of truth: setting `select.value` updates the button, and
 * picking an option sets the value and fires "change", so existing code keeps working unchanged.
 */

let uid = 0;
const valueProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!;

export function customSelect(select: HTMLSelectElement): void {
  if (select.dataset.custom !== undefined) return;
  select.dataset.custom = "";
  const id = `cs${++uid}`;
  // Read these before moving anything: once the button sits inside a wrapping <label>, it becomes the label's control.
  const labels = [...(select.labels ?? [])];
  const name = select.getAttribute("aria-label") ?? labels[0]?.textContent?.trim();

  const wrap = document.createElement("div");
  wrap.className = "cselect";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "select";
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", `${id}-list`);
  if (name) button.setAttribute("aria-label", name);
  const list = document.createElement("ul");
  list.id = `${id}-list`;
  list.className = "select-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  select.before(wrap);
  wrap.append(button, list, select);
  select.hidden = true;
  select.tabIndex = -1;
  // A <label> forwards clicks to the first control inside it, which would reopen the list after picking an option.
  // Swallow that, and make clicks on the label text focus our button instead of the hidden select.
  for (const label of labels) {
    label.addEventListener("click", (e) => {
      if (e.target === button) return;
      e.preventDefault();
      if (!wrap.contains(e.target as Node)) button.focus();
    });
  }

  let active = -1;
  const items = () => list.children as HTMLCollectionOf<HTMLLIElement>;

  function sync() {
    button.textContent = select.selectedOptions[0]?.text ?? "";
  }
  // Programmatic `select.value = …` doesn't fire events, so intercept it.
  Object.defineProperty(select, "value", {
    configurable: true,
    get: () => valueProp.get!.call(select),
    set: (v: string) => {
      valueProp.set!.call(select, v);
      sync();
    },
  });

  function render() {
    list.replaceChildren(
      ...[...select.options].map((o, i) => {
        const li = document.createElement("li");
        li.id = `${id}-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(o.selected));
        li.textContent = o.text;
        li.addEventListener("pointerdown", (e) => e.preventDefault()); // keep focus on the button
        li.addEventListener("pointermove", () => setActive(i, false));
        li.addEventListener("click", () => choose(i));
        return li;
      }),
    );
  }

  function setActive(i: number, scroll = true) {
    active = i;
    for (const [j, li] of [...items()].entries()) li.toggleAttribute("data-active", j === i);
    const li = items()[i];
    if (!li) return button.removeAttribute("aria-activedescendant");
    button.setAttribute("aria-activedescendant", li.id);
    if (scroll) li.scrollIntoView({ block: "nearest" });
  }

  function outside(e: PointerEvent) {
    if (!wrap.contains(e.target as Node)) close();
  }

  function open() {
    if (!list.hidden) return;
    render();
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    // Flip up or to the right edge when there isn't room below or to the right.
    list.classList.remove("up", "right");
    const b = button.getBoundingClientRect(), l = list.getBoundingClientRect();
    if (b.bottom + l.height + 8 > innerHeight && b.top > innerHeight - b.bottom) list.classList.add("up");
    if (b.left + l.width + 8 > innerWidth) list.classList.add("right");
    setActive(Math.max(0, select.selectedIndex));
    document.addEventListener("pointerdown", outside, true);
  }

  function close() {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", outside, true);
  }

  function choose(i: number) {
    if (i >= 0 && i !== select.selectedIndex) {
      select.selectedIndex = i;
      sync();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close();
    button.focus();
  }

  let typed = "", typedTimer = 0;
  function typeahead(key: string) {
    clearTimeout(typedTimer);
    typed += key.toLowerCase();
    typedTimer = window.setTimeout(() => (typed = ""), 600);
    const opts = [...select.options];
    const start = typed.length === 1 ? active + 1 : active;
    for (let k = 0; k < opts.length; k++) {
      const i = (start + k + opts.length) % opts.length;
      // Match the start of the label or of any word in it, so "n" finds "₦ · NGN".
      const text = opts[i]!.text.toLowerCase();
      if (text.startsWith(typed) || text.split(/[\s·]+/).some((w) => w.startsWith(typed))) {
        open();
        setActive(i);
        return;
      }
    }
  }

  button.addEventListener("click", () => (list.hidden ? open() : close()));
  button.addEventListener("keydown", (e) => {
    const isOpen = !list.hidden, last = select.options.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        isOpen ? setActive(Math.min(last, active + 1)) : open();
        break;
      case "ArrowUp":
        e.preventDefault();
        isOpen ? setActive(Math.max(0, active - 1)) : open();
        break;
      case "Home":
      case "PageUp":
        if (isOpen) (e.preventDefault(), setActive(0));
        break;
      case "End":
      case "PageDown":
        if (isOpen) (e.preventDefault(), setActive(last));
        break;
      case "Enter":
      case " ":
        if (e.key === " " && typed) return typeahead(" ");
        e.preventDefault();
        isOpen ? choose(active) : open();
        break;
      case "Escape":
        if (isOpen) (e.preventDefault(), close());
        break;
      case "Tab":
        close();
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key);
    }
  });
  button.addEventListener("blur", () => setTimeout(() => wrap.contains(document.activeElement) || close()));

  sync();
}
