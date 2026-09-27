export {};
type Data = {
  contacts: any[];
  posts: any[];
  settings: any[];
  views: any[];
  sources: any[];
  pages: any[];
};
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const status = (text: string) => {
  $("#admin-status").textContent = text;
};
let data: Data;
let currentTab = "overview";
async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers:
      body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {},
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const result = await r.json();
  if (!r.ok) {
    if (r.status === 401) {
      $("#dashboard").hidden = true;
      $("#login-panel").hidden = false;
    }
    throw new Error(result.error || "No se pudo completar la operación.");
  }
  return result;
}
function el(tag: string, text = "", cls = "") {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function field(form: HTMLFormElement, name: string) {
  return form.elements.namedItem(name) as HTMLInputElement;
}
function table(target: string, rows: any[], key: string, label: string) {
  const box = $(target);
  box.replaceChildren();
  if (!rows.length) {
    box.append(el("p", "Todavía no hay datos.", "empty"));
    return;
  }
  const wrap = el("div", "", "table-wrap");
  const t = el("table");
  const head = el("thead");
  const hr = el("tr");
  hr.append(el("th", label), el("th", "Vistas"));
  head.append(hr);
  const body = el("tbody");
  for (const r of rows) {
    const tr = el("tr");
    tr.append(
      el(
        "td",
        key === "day" ? new Date(r[key]).toLocaleDateString("es-MX") : r[key],
      ),
      el("td", String(r.views)),
    );
    body.append(tr);
  }
  t.append(head, body);
  wrap.append(t);
  box.append(wrap);
}
function render() {
  const metrics = $("#metrics");
  metrics.replaceChildren();
  for (const [label, value] of [
    [
      "Vistas (30 días)",
      data.views.reduce((s: number, r: any) => s + r.views, 0),
    ],
    [
      "Solicitudes nuevas",
      data.contacts.filter((c) => c.status === "new").length,
    ],
    ["Artículos publicados", data.posts.filter((p) => p.published).length],
  ]) {
    const item = el("div", String(label), "metric");
    item.append(el("strong", String(value)));
    metrics.append(item);
  }
  table("#sources", data.sources, "referrer", "Dominio");
  table("#pages", data.pages, "path", "Página");
  table("#daily", data.views, "day", "Día");
  renderContacts();
  const list = $("#post-list");
  list.replaceChildren();
  for (const p of data.posts) {
    const b = el(
      "button",
      `${p.locale.toUpperCase()} · ${p.published ? "Publicado" : "Borrador"} — ${p.title}`,
      "secondary",
    ) as HTMLButtonElement;
    b.type = "button";
    b.onclick = () => editPost(p);
    list.append(b);
  }
  loadSite();
}
async function load() {
  data = await request("admin/data");
  $("#login-panel").hidden = true;
  $("#dashboard").hidden = false;
  render();
}
function renderContacts() {
  const list = $("#contact-list");
  list.replaceChildren();
  const filter = $<HTMLSelectElement>("#contact-filter").value;
  const contacts = data.contacts.filter(
    (c) => filter === "all" || c.status === filter,
  );
  if (!contacts.length)
    list.append(el("p", "No hay solicitudes en este estado.", "empty"));
  for (const c of contacts) {
    const card = el("article", "", "admin-panel");
    card.append(el("h3", `${c.name}${c.company ? " / " + c.company : ""}`));
    const email = el("a", c.email) as HTMLAnchorElement;
    email.href = "mailto:" + c.email;
    card.append(
      email,
      el(
        "p",
        `${c.service} · ${new Date(c.created_at).toLocaleString("es-MX")} · ${c.locale}`,
      ),
      el("p", c.message),
    );
    const label = el("label", "Estado");
    const select = document.createElement("select");
    for (const [value, text] of [
      ["new", "Nuevo"],
      ["in-progress", "En seguimiento"],
      ["closed", "Cerrado"],
    ]) {
      const option = new Option(text, value);
      option.selected = c.status === value;
      select.add(option);
    }
    select.onchange = async () => {
      try {
        await request("admin/contact/" + c.id, "PUT", { status: select.value });
        await load();
        status("Estado actualizado.");
      } catch (e) {
        status((e as Error).message);
      }
    };
    label.append(select);
    card.append(label);
    const del = el(
      "button",
      "Eliminar solicitud",
      "secondary danger",
    ) as HTMLButtonElement;
    del.onclick = async () => {
      if (
        !confirm(
          "¿Eliminar definitivamente esta solicitud y sus datos personales?",
        )
      )
        return;
      try {
        await request("admin/contact/" + c.id, "DELETE");
        await load();
        status("Solicitud eliminada.");
      } catch (e) {
        status((e as Error).message);
      }
    };
    card.append(del);
    list.append(card);
  }
}
const postForm = $<HTMLFormElement>("#post-form");
function editPost(p?: any) {
  postForm.reset();
  field(postForm, "id").value = p?.id || "";
  $("#post-heading").textContent = p ? "Editar artículo" : "Nuevo artículo";
  if (p)
    for (const key of [
      "translation_key",
      "locale",
      "slug",
      "title",
      "excerpt",
      "body",
      "image",
      "image_alt",
    ])
      field(postForm, key).value = p[key];
  field(postForm, "published").checked = !!p?.published;
  $("#post-preview").setAttribute("src", p?.image || "/images/mvp-studio.webp");
  const link = $<HTMLAnchorElement>("#post-public-link");
  link.hidden = !p?.published;
  if (p) link.href = (p.locale === "en" ? "/en" : "") + "/blog/" + p.slug;
}
const siteForm = $<HTMLFormElement>("#site-form");
function loadSite() {
  const lang = field(siteForm, "locale").value;
  const c = data.settings.find((s) => s.locale === lang).content;
  for (const key of ["headline", "description", "image"])
    field(siteForm, key).value = c[key];
  $("#site-preview").setAttribute("src", c.image);
  const services = $("#service-fields");
  services.replaceChildren();
  c.services.forEach((s: any, i: number) => {
    for (const key of ["title", "description"]) {
      const label = el(
        "label",
        `${i + 1}. ${key === "title" ? "Servicio" : "Descripción"}`,
      );
      const input = document.createElement(
        key === "title" ? "input" : "textarea",
      );
      input.name = `service-${i}-${key}`;
      input.value = s[key];
      input.required = true;
      input.maxLength = key === "title" ? 90 : 250;
      input.minLength = key === "title" ? 2 : 10;
      label.append(input);
      services.append(label);
    }
  });
}
$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget as HTMLFormElement;
  const b = form.querySelector("button")!;
  b.disabled = true;
  try {
    await request("login", "POST", Object.fromEntries(new FormData(form)));
    form.reset();
    await load();
    status("Sesión iniciada.");
  } catch (e) {
    status((e as Error).message);
  } finally {
    b.disabled = false;
  }
});
$("#logout").onclick = async () => {
  try {
    await request("logout", "POST");
    data = undefined as unknown as Data;
    $("#dashboard").hidden = true;
    $("#login-panel").hidden = false;
    $("#contact-list").replaceChildren();
    status("Sesión cerrada.");
  } catch (e) {
    status((e as Error).message);
  }
};
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      currentTab = b.dataset.tab!;
      document
        .querySelectorAll<HTMLElement>("[data-panel]")
        .forEach((p) => (p.hidden = p.dataset.panel !== currentTab));
      document
        .querySelectorAll("[data-tab]")
        .forEach((t) =>
          t.setAttribute(
            "aria-pressed",
            String((t as HTMLElement).dataset.tab === currentTab),
          ),
        );
      status("");
    }),
);
$("#contact-filter").onchange = renderContacts;
$("#new-post").onclick = () => editPost();
$("#site-locale").onchange = loadSite;
postForm.onsubmit = async (e) => {
  e.preventDefault();
  status("Guardando artículo…");
  const b = postForm.querySelector("button")!;
  b.disabled = true;
  const values: any = Object.fromEntries(new FormData(postForm));
  const id = values.id;
  delete values.id;
  values.published = field(postForm, "published").checked;
  try {
    const result = await request(
      "admin/posts" + (id ? "/" + id : ""),
      id ? "PUT" : "POST",
      values,
    );
    await load();
    editPost(data.posts.find((p) => p.id === Number(id || result.id)));
    status("Artículo guardado.");
  } catch (e) {
    status((e as Error).message);
  } finally {
    b.disabled = false;
  }
};
siteForm.onsubmit = async (e) => {
  e.preventDefault();
  status("Guardando portada…");
  const b = siteForm.querySelector("button")!;
  b.disabled = true;
  const lang = field(siteForm, "locale").value;
  const count = data.settings.find((s) => s.locale === lang).content.services
    .length;
  const content = {
    headline: field(siteForm, "headline").value,
    description: field(siteForm, "description").value,
    image: field(siteForm, "image").value,
    services: Array.from({ length: count }, (_, i) => ({
      title: field(siteForm, `service-${i}-title`).value,
      description: field(siteForm, `service-${i}-description`).value,
    })),
  };
  try {
    await request("admin/site/" + lang, "PUT", content);
    await load();
    status("Portada actualizada. Los cambios ya están disponibles.");
  } catch (e) {
    status((e as Error).message);
  } finally {
    b.disabled = false;
  }
};
for (const prefix of ["post", "site"]) {
  $<HTMLInputElement>("#" + prefix + "-upload").onchange = async (e) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      status("La imagen supera 5 MB.");
      input.value = "";
      return;
    }
    const form = prefix === "post" ? postForm : siteForm;
    const button = form.querySelector("button")!;
    button.disabled = true;
    status("Optimizando y subiendo imagen…");
    try {
      const body = new FormData();
      body.append("image", file);
      const result = await request("admin/upload", "POST", body);
      field(form, "image").value = result.url;
      $("#" + prefix + "-preview").setAttribute("src", result.url);
      status(
        `Imagen lista (${Math.round(result.size / 1024)} KB). Guarda los cambios para publicarla.`,
      );
    } catch (e) {
      status((e as Error).message);
    } finally {
      button.disabled = false;
      input.value = "";
    }
  };
}
load().catch((e) => {
  if (!String((e as Error).message).includes("Inicia sesión"))
    status((e as Error).message);
});
