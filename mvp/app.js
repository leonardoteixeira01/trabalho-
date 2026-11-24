/*
 * SCCD — Interface do MVP.
 *
 * Organização:
 *   1. Armazenamento  — lê e grava no localStorage do navegador.
 *   2. Senhas         — gera e confere o hash (PBKDF2) das senhas.
 *   3. Utilidades     — função h() que monta elementos HTML com segurança.
 *   4. Telas          — uma função por tela; render() decide qual mostrar.
 *
 * As regras de negócio (validações, filtros, permissões) ficam em regras.js.
 */
/* global Regras */

// ---------------------------------------------------------------- 1. Armazenamento
const Banco = {
  ler(chave) {
    try {
      return JSON.parse(localStorage.getItem("sccd_" + chave)) || [];
    } catch {
      return [];
    }
  },
  gravar(chave, lista) {
    try {
      localStorage.setItem("sccd_" + chave, JSON.stringify(lista));
      return true;
    } catch {
      alert("Não foi possível salvar. Verifique se o navegador permite armazenamento local.");
      return false;
    }
  },
};

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- 2. Senhas (RF008)
// A senha nunca é guardada: só o hash PBKDF2 com um "sal" aleatório por usuário.
async function gerarHash(senha, salHex) {
  const sal = salHex
    ? Uint8Array.from(salHex.match(/../g).map((x) => parseInt(x, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: 100000, hash: "SHA-256" }, chave, 256);
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { sal: hex(sal), hash: hex(bits) };
}

// ---------------------------------------------------------------- 3. Utilidades
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

function aviso(texto) {
  return h("div", { class: "alerta ok", role: "status" }, texto);
}

// ---------------------------------------------------------------- 4. Estado e navegação
const estado = {
  usuario: null, // usuário logado (sem o hash)
  tela: "registrar",
  editando: null, // id da doação em edição (RF005)
  filtros: { inicio: "", fim: "", categoria: "", texto: "" },
  mensagem: null,
};

function ir(tela, extra = {}) {
  Object.assign(estado, { tela, mensagem: null, editando: null }, extra);
  render();
}

function render() {
  const raiz = document.getElementById("app");
  raiz.replaceChildren();
  if (!window.crypto || !crypto.subtle) {
    raiz.append(erros(["Este navegador não oferece criptografia. Use Chrome ou Firefox atualizados (RNF004)."]));
    return;
  }
  if (Banco.ler("usuarios").length === 0) return raiz.append(telaPrimeiroAcesso());
  if (!estado.usuario) return raiz.append(telaLogin());
  raiz.append(cabecalho());
  const telas = { registrar: telaRegistrar, consultar: telaConsultar, doadores: telaDoadores, resumo: telaResumo, usuarios: telaUsuarios };
  const main = h("main", { class: "conteudo" });
  if (estado.mensagem) main.append(aviso(estado.mensagem));
  main.append((telas[estado.tela] || telaRegistrar)());
  raiz.append(main);
}

function cabecalho() {
  const coord = estado.usuario.perfil === Regras.PERFIS.COORDENACAO;
  const abas = [
    ["registrar", "Registrar doação"],
    ["consultar", "Consultar"],
    ["doadores", "Doadores"],
    coord && ["resumo", "Resumo"],
    coord && ["usuarios", "Usuários"],
  ].filter(Boolean);
  return h("header", { class: "topo" },
    h("div", { class: "marca" }, "SCCD ", h("span", {}, "Controle de Doações")),
    h("nav", { "aria-label": "Telas" },
      abas.map(([id, nome]) => h("button", { class: estado.tela === id ? "aba ativa" : "aba", onclick: () => ir(id), "aria-current": estado.tela === id ? "page" : false }, nome))),
    h("div", { class: "quem" },
      `${estado.usuario.nome} · ${coord ? "coordenação" : "voluntário"} `,
      h("button", { class: "link", onclick: () => { estado.usuario = null; sessionStorage.removeItem("sccd_sessao"); render(); } }, "Sair")));
}

// ---------------------------------------------------------------- Telas de acesso (H08)
function telaPrimeiroAcesso() {
  let falhas = [];
  const nome = h("input", { required: true, autocomplete: "name" });
  const usuario = h("input", { required: true, autocomplete: "username" });
  const senha = h("input", { type: "password", required: true, autocomplete: "new-password", minlength: 6 });
  const caixa = h("div");
  const form = h("form", { class: "cartao estreito", onsubmit: async (e) => {
    e.preventDefault();
    falhas = [];
    if (senha.value.length < 6) falhas.push("A senha precisa ter pelo menos 6 caracteres.");
    if (!nome.value.trim() || !usuario.value.trim()) falhas.push("Preencha nome e usuário.");
    caixa.replaceChildren(erros(falhas) || "");
    if (falhas.length) return;
    const { sal, hash } = await gerarHash(senha.value);
    Banco.gravar("usuarios", [{ id: novoId(), nome: nome.value.trim(), usuario: usuario.value.trim().toLowerCase(), perfil: Regras.PERFIS.COORDENACAO, sal, hash }]);
    render();
  } },
    h("h1", {}, "Primeiro acesso"),
    h("p", {}, "Crie a conta da coordenação. Depois, ela cadastra os voluntários na aba Usuários."),
    caixa,
    campo("Nome", nome), campo("Usuário", usuario), campo("Senha", senha, "Mínimo de 6 caracteres."),
    h("button", { class: "primario", type: "submit" }, "Criar conta"));
  return form;
}

function telaLogin() {
  const usuario = h("input", { required: true, autocomplete: "username", autofocus: true });
  const senha = h("input", { type: "password", required: true, autocomplete: "current-password" });
  const caixa = h("div");
  return h("form", { class: "cartao estreito", onsubmit: async (e) => {
    e.preventDefault();
    const u = Banco.ler("usuarios").find((x) => x.usuario === usuario.value.trim().toLowerCase());
    const confere = u && (await gerarHash(senha.value, u.sal)).hash === u.hash;
    if (!confere) return caixa.replaceChildren(erros(["Usuário ou senha incorretos."]));
    estado.usuario = { id: u.id, nome: u.nome, perfil: u.perfil };
    sessionStorage.setItem("sccd_sessao", u.id);
    ir("registrar");
  } },
    h("h1", {}, "Sistema de Doações"),
    caixa,
    campo("Usuário", usuario), campo("Senha", senha),
    h("button", { class: "primario", type: "submit" }, "Entrar"),
    h("p", { class: "nota" }, "Usuários são criados pela coordenação."));
}

// ---------------------------------------------------------------- Registrar / corrigir doação (H02, H05)
function telaRegistrar() {
  const doadores = Banco.ler("doadores").sort((a, b) => a.nome.localeCompare(b.nome));
  const doacoes = Banco.ler("doacoes");
  const atual = estado.editando ? doacoes.find((d) => d.id === estado.editando) : null;
  const v = atual || { data: hojeISO(), categoria: "", descricao: "", quantidade: "", unidade: "un", observacao: "", doadorId: "" };

  const f = {
    doadorId: h("select", {}, opcoes(doadores.map((d) => [d.id, d.nome]), v.doadorId || "", "Anônimo")),
    data: h("input", { type: "date", value: v.data, max: hojeISO() }),
    categoria: h("select", {}, opcoes(Regras.CATEGORIAS, v.categoria, "Escolha…")),
    descricao: h("input", { value: v.descricao, placeholder: "Ex.: arroz tipo 1" }),
    quantidade: h("input", { type: "number", min: "0.01", step: "any", value: v.quantidade, inputmode: "decimal" }),
    unidade: h("select", {}, opcoes(Regras.UNIDADES, v.unidade)),
    observacao: h("input", { value: v.observacao || "" }),
  };
  const caixa = h("div");

  const salvar = (e) => {
    e.preventDefault();
    const dados = {
      doadorId: f.doadorId.value || null, data: f.data.value, categoria: f.categoria.value,
      descricao: f.descricao.value.trim(), quantidade: Number(f.quantidade.value), unidade: f.unidade.value,
      observacao: f.observacao.value.trim(),
    };
    const falhas = Regras.validarDoacao(dados);
    if (falhas.length) return caixa.replaceChildren(erros(falhas));
    if (atual) {
      if (!Regras.podeEditarDoacao(estado.usuario)) return caixa.replaceChildren(erros(["Só a coordenação pode corrigir registros."]));
      Object.assign(atual, dados, { alteradoPor: estado.usuario.nome, alteradoEm: Date.now() });
      Banco.gravar("doacoes", doacoes);
      ir("consultar", { mensagem: "Registro corrigido." });
    } else {
      doacoes.push({ id: novoId(), ...dados, registradoPor: estado.usuario.nome, criadoEm: Date.now() });
      Banco.gravar("doacoes", doacoes);
      ir("registrar", { mensagem: `Doação registrada: ${dados.quantidade} ${dados.unidade} de ${dados.descricao}.` });
    }
  };

  return h("form", { class: "cartao", onsubmit: salvar },
    h("h1", {}, atual ? "Corrigir doação" : "Registrar doação"),
    caixa,
    h("div", { class: "grade" },
      campo("Doador", f.doadorId, h("span", {}, "Não está na lista? ", h("button", { type: "button", class: "link", onclick: () => ir("doadores") }, "Cadastrar doador"))),
      campo("Data *", f.data),
      campo("Categoria *", f.categoria),
      campo("Descrição do item *", f.descricao),
      h("div", { class: "linha" }, campo("Quantidade *", f.quantidade), campo("Unidade", f.unidade)),
      campo("Observação", f.observacao)),
    h("div", { class: "acoes" },
      h("button", { class: "primario", type: "submit" }, atual ? "Salvar correção" : "Salvar"),
      atual && h("button", { type: "button", onclick: () => ir("consultar") }, "Cancelar")));
}

// ---------------------------------------------------------------- Consultar (H03, H04, H05)
function telaConsultar() {
  const doadores = Banco.ler("doadores");
  const nomePorId = Object.fromEntries(doadores.map((d) => [d.id, d.nome]));
  const fl = estado.filtros;
  const ctl = {
    inicio: h("input", { type: "date", value: fl.inicio }),
    fim: h("input", { type: "date", value: fl.fim }),
    categoria: h("select", {}, opcoes(Regras.CATEGORIAS, fl.categoria, "Todas")),
    texto: h("input", { type: "search", value: fl.texto, placeholder: "Doador ou descrição" }),
  };
  const lista = Regras.filtrarDoacoes(Banco.ler("doacoes"), fl, doadores);
  const pode = Regras.podeEditarDoacao(estado.usuario);

  return h("section", { class: "cartao" },
    h("h1", {}, "Consultar doações"),
    h("form", { class: "filtros", onsubmit: (e) => {
      e.preventDefault();
      estado.filtros = { inicio: ctl.inicio.value, fim: ctl.fim.value, categoria: ctl.categoria.value, texto: ctl.texto.value };
      render();
    } },
      campo("De", ctl.inicio), campo("Até", ctl.fim), campo("Categoria", ctl.categoria), campo("Pesquisa", ctl.texto),
      h("div", { class: "acoes" },
        h("button", { class: "primario", type: "submit" }, "Pesquisar"),
        h("button", { type: "button", onclick: () => { estado.filtros = { inicio: "", fim: "", categoria: "", texto: "" }; render(); } }, "Limpar"))),
    h("p", { class: "nota" }, `${lista.length} ${lista.length === 1 ? "registro" : "registros"} · mais recentes primeiro`),
    lista.length === 0
      ? h("p", { class: "vazio" }, "Nenhuma doação encontrada.")
      : h("div", { class: "tabela" }, h("table", {},
          h("thead", {}, h("tr", {}, ["Data", "Item", "Categoria", "Quantidade", "Doador", pode ? "" : null].filter((x) => x !== null).map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", {}, lista.map((d) => h("tr", {},
            h("td", {}, Regras.formatarData(d.data)),
            h("td", {}, d.descricao, d.observacao && h("small", {}, d.observacao)),
            h("td", {}, d.categoria),
            h("td", { class: "num" }, `${d.quantidade} ${d.unidade}`),
            h("td", {}, nomePorId[d.doadorId] || "Anônimo"),
            pode && h("td", {}, h("button", { class: "link", onclick: () => ir("registrar", { editando: d.id }) }, "Corrigir"))))))));
}

// ---------------------------------------------------------------- Doadores (H01)
function telaDoadores() {
  const doadores = Banco.ler("doadores").sort((a, b) => a.nome.localeCompare(b.nome));
  const verContato = Regras.podeVerContato(estado.usuario);
  const nome = h("input", { required: true });
  const telefone = h("input", { type: "tel", placeholder: "(83) 9____-____", disabled: true });
  const autorizou = h("input", { type: "checkbox", onchange: () => { telefone.disabled = !autorizou.checked; if (!autorizou.checked) telefone.value = ""; } });
  const caixa = h("div");

  return h("div", { class: "pilha" },
    h("form", { class: "cartao", onsubmit: (e) => {
      e.preventDefault();
      const dados = { nome: nome.value, telefone: telefone.value, autorizouContato: autorizou.checked };
      const falhas = Regras.validarDoador(dados);
      if (falhas.length) return caixa.replaceChildren(erros(falhas));
      Banco.gravar("doadores", [...doadores, { id: novoId(), ...Regras.prepararDoador(dados), criadoEm: Date.now() }]);
      ir("doadores", { mensagem: `Doador “${dados.nome.trim()}” cadastrado.` });
    } },
      h("h1", {}, "Cadastrar doador"),
      caixa,
      h("div", { class: "grade" },
        campo("Nome *", nome),
        h("label", { class: "check" }, autorizou, " O doador autorizou guardar o telefone (LGPD)"),
        campo("Telefone (opcional)", telefone)),
      h("div", { class: "acoes" }, h("button", { class: "primario", type: "submit" }, "Salvar"))),
    h("section", { class: "cartao" },
      h("h2", {}, `Doadores cadastrados (${doadores.length})`),
      doadores.length === 0 ? h("p", { class: "vazio" }, "Nenhum doador ainda. Doações podem ser registradas como anônimas.")
        : h("ul", { class: "lista" }, doadores.map((d) => h("li", {}, d.nome, verContato && d.telefone && h("small", {}, d.telefone))))));
}

// ---------------------------------------------------------------- Resumo (H06)
function telaResumo() {
  const hoje = hojeISO();
  const inicioMes = hoje.slice(0, 8) + "01";
  const inicio = h("input", { type: "date", value: estado.filtrosResumo?.inicio || inicioMes });
  const fim = h("input", { type: "date", value: estado.filtrosResumo?.fim || hoje });
  const r = Regras.resumoPorCategoria(Banco.ler("doacoes"), inicio.value, fim.value);
  const qtd = (porUnidade) => Object.entries(porUnidade).map(([u, n]) => `${Number(n.toFixed(2))} ${u}`).join(" + ") || "—";

  return h("section", { class: "cartao" },
    h("h1", {}, "Resumo por período"),
    h("form", { class: "filtros", onsubmit: (e) => { e.preventDefault(); estado.filtrosResumo = { inicio: inicio.value, fim: fim.value }; render(); } },
      campo("De", inicio), campo("Até", fim),
      h("div", { class: "acoes" }, h("button", { class: "primario", type: "submit" }, "Gerar resumo"))),
    h("p", { class: "nota" }, `${Regras.formatarData(inicio.value)} a ${Regras.formatarData(fim.value)} · ${r.totalRegistros} doações registradas`),
    h("div", { class: "tabela" }, h("table", {},
      h("thead", {}, h("tr", {}, ["Categoria", "Doações", "Quantidade recebida"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, r.linhas.map((l) => h("tr", {}, h("td", {}, l.categoria), h("td", { class: "num" }, l.registros), h("td", {}, qtd(l.porUnidade))))))),
    h("p", { class: "nota" }, "Quantidades com unidades diferentes (kg, un, L…) aparecem separadas."));
}

// ---------------------------------------------------------------- Usuários e cópia de segurança (coordenação)
function telaUsuarios() {
  const usuarios = Banco.ler("usuarios");
  const nome = h("input", { required: true });
  const usuario = h("input", { required: true, autocomplete: "off" });
  const senha = h("input", { type: "password", required: true, minlength: 6, autocomplete: "new-password" });
  const perfil = h("select", {}, opcoes([[Regras.PERFIS.VOLUNTARIO, "Voluntário"], [Regras.PERFIS.COORDENACAO, "Coordenação"]], Regras.PERFIS.VOLUNTARIO));
  const caixa = h("div");

  const exportar = () => {
    const dados = { exportadoEm: new Date().toISOString(), doadores: Banco.ler("doadores"), doacoes: Banco.ler("doacoes") };
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" })), download: `sccd-backup-${hojeISO()}.json` });
    a.click();
  };

  return h("div", { class: "pilha" },
    h("form", { class: "cartao", onsubmit: async (e) => {
      e.preventDefault();
      const login = usuario.value.trim().toLowerCase();
      const falhas = [];
      if (usuarios.some((u) => u.usuario === login)) falhas.push("Esse usuário já existe.");
      if (senha.value.length < 6) falhas.push("A senha precisa ter pelo menos 6 caracteres.");
      if (falhas.length) return caixa.replaceChildren(erros(falhas));
      const { sal, hash } = await gerarHash(senha.value);
      Banco.gravar("usuarios", [...usuarios, { id: novoId(), nome: nome.value.trim(), usuario: login, perfil: perfil.value, sal, hash }]);
      ir("usuarios", { mensagem: `Usuário “${login}” criado.` });
    } },
      h("h1", {}, "Usuários"),
      caixa,
      h("div", { class: "grade" }, campo("Nome", nome), campo("Usuário", usuario), campo("Senha inicial", senha), campo("Perfil", perfil)),
      h("div", { class: "acoes" }, h("button", { class: "primario", type: "submit" }, "Criar usuário"))),
    h("section", { class: "cartao" },
      h("ul", { class: "lista" }, usuarios.map((u) => h("li", {}, `${u.nome} (${u.usuario})`, h("small", {}, u.perfil === Regras.PERFIS.COORDENACAO ? "coordenação" : "voluntário"))))),
    h("section", { class: "cartao" },
      h("h2", {}, "Cópia de segurança"),
      h("p", {}, "Os dados ficam só neste navegador. Exporte uma cópia com frequência."),
      h("button", { onclick: exportar }, "Exportar doações e doadores (JSON)")));
}

// ---------------------------------------------------------------- Início
(function iniciar() {
  const id = sessionStorage.getItem("sccd_sessao");
  const u = id && Banco.ler("usuarios").find((x) => x.id === id);
  if (u) estado.usuario = { id: u.id, nome: u.nome, perfil: u.perfil };
  render();
})();
