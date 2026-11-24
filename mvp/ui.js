/*
 * SCCD — Utilidades de interface (sem regras de negócio).
 *
 *   h()             monta elementos HTML com segurança (texto nunca vira código)
 *   icone()         ícones SVG desenhados aqui mesmo, sem baixar nada da internet
 *   campo(), etc.   peças repetidas dos formulários
 */

// h("p", {class: "x"}, "texto") cria <p class="x">texto</p>.
// Textos entram como textContent, nunca como HTML: um nome digitado não vira código.
function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

// Desenhos dos ícones (traços de 24×24). São textos fixos do próprio sistema, nunca dados digitados.
const ICONES = {
  inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  mais: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  escudo: '<path d="M12 21s7.5-3.5 7.5-9.5V5.5L12 3 4.5 5.5v6C4.5 17.5 12 21 12 21z"/><path d="m9 12 2 2 4-4"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  caixa: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  editar: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  imprimir: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  baixar: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  subir: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  vazio: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tendencia: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
};

function icone(nome) {
  const t = document.createElement("template");
  t.innerHTML = `<svg class="icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] || ""}</svg>`;
  return t.content.firstChild;
}

function campo(rotulo, controle, ajuda) {
  return h("label", { class: "campo" }, h("span", {}, rotulo), controle, ajuda && h("small", {}, ajuda));
}

function opcoes(lista, selecionado, vazio) {
  return [
    vazio !== undefined && h("option", { value: "" }, vazio),
    ...lista.map((o) => {
      const [valor, texto] = Array.isArray(o) ? o : [o, o];
      return h("option", { value: valor, selected: valor === selecionado }, texto);
    }),
  ];
}

function erros(lista) {
  return lista.length ? h("div", { class: "alerta erro", role: "alert" }, h("ul", {}, lista.map((e) => h("li", {}, e)))) : null;
}

// Selo colorido da categoria. A cor ajuda, mas o nome está sempre escrito (não depende só da cor).
function seloCategoria(categoria) {
  const classe = String(categoria || "outro").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return h("span", { class: `selo selo-${classe}` }, categoria);
}

// Campo de senha com botão para mostrar/ocultar o que foi digitado.
function campoSenha(input) {
  const botao = h("button", {
    type: "button", class: "ver-senha", "aria-label": "Mostrar senha", "aria-pressed": "false",
    onclick: () => {
      const mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      botao.setAttribute("aria-pressed", String(mostrar));
      botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
    },
  }, icone("olho"));
  return h("div", { class: "senha" }, input, botao);
}

// Tela vazia com ícone, título, explicação e botões de ação.
function estadoVazio(nomeIcone, titulo, texto, ...acoes) {
  return h("div", { class: "vazio" },
    h("div", { class: "vazio-icone" }, icone(nomeIcone)),
    h("h2", {}, titulo),
    h("p", {}, texto),
    acoes.length ? h("div", { class: "acoes centro" }, acoes) : null);
}
