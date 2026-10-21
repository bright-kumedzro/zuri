/** Docs page: copy buttons on code blocks and a sidebar that tracks the section in view. */

for (const pre of document.querySelectorAll<HTMLPreElement>(".doc-body pre:not(.sig)")) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.textContent = "copy";
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? "");
    button.textContent = "copied";
    setTimeout(() => (button.textContent = "copy"), 1400);
  });
  pre.append(button);
}

const nav = document.querySelector(".top")!;
addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });

const links = new Map<string, HTMLAnchorElement>();
for (const a of document.querySelectorAll<HTMLAnchorElement>(".toc a")) links.set(a.hash.slice(1), a);

const visible = new Set<string>();
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id);
    // Highlight the first section in view, in document order.
    const current = [...links.keys()].find((id) => visible.has(id));
    if (current) for (const [id, a] of links) a.classList.toggle("active", id === current);
  },
  { rootMargin: "-72px 0px -55% 0px" },
);

for (const id of links.keys()) {
  const section = document.getElementById(id);
  if (section) observer.observe(section);
}
