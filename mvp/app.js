/*
 * SCCD — Telas do MVP.
 *
 * Organização:
 *   1. Armazenamento  — lê e grava no localStorage do navegador.
 *   2. Senhas         — gera e confere o hash (PBKDF2) das senhas.
 *   3. Estado         — em que tela estamos, quem está logado, filtros.
 *   4. Telas          — uma função por tela; render() decide qual mostrar.
 *
 * Regras de negócio (validações, filtros, permissões): regras.js.
 * Peças de interface (h, ícones, campos): ui.js.
 */
/* global Regras, h, icone, campo, opcoes, erros, seloCategoria, campoSenha, estadoVazio */

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

// ---------------------------------------------------------------- 3. Estado e navegação
const FILTROS_VAZIOS = { inicio: "", fim: "", categoria: "", texto: "" };
const estado = {
  usuario: null, // usuário logado (sem o hash)
  tela: "inicio",
  editando: null, // id da doação em correção (RF005)
  filtros: { ...FILTROS_VAZIOS },
  filtrosResumo: null,
  ultimoRegistro: null, // data, categoria, unidade e doador mantidos para o próximo registro
  mensagem: null,
  foco: null, // id do campo que recebe o cursor depois de desenhar a tela
};

function ehCoordenacao() {
  return Boolean(estado.usuario) && estado.usuario.perfil === Regras.PERFIS.COORDENACAO;
}

function ir(tela, extra = {}) {
  Object.assign(estado, { tela, mensagem: null, editando: null, foco: null }, extra);
  render();
  window.scrollTo?.(0, 0);
}

function sair() {
  estado.usuario = null;
  sessionStorage.removeItem("sccd_sessao");
  render();
}

function render() {
  const raiz = document.getElementById("app");
  raiz.replaceChildren();
  if (!window.crypto || !crypto.subtle) {
    raiz.append(erros(["Este navegador não oferece criptografia. Use Chrome ou Firefox atualizados (RNF004)."]));
    return;
  }
  if (Banco.ler("usuarios").length === 0) return raiz.append(telaAcesso(true));
  if (!estado.usuario) return raiz.append(telaAcesso(false));

  const telas = { inicio: telaInicio, registrar: telaRegistrar, consultar: telaConsultar, doadores: telaDoadores, resumo: telaResumo, usuarios: telaUsuarios };
  const restritas = ["resumo", "usuarios"];
  if (restritas.includes(estado.tela) && !ehCoordenacao()) estado.tela = "inicio";

  raiz.append(h("div", { class: "layout" },
    menuLateral(),
    h("main", { class: "conteudo", id: "conteudo" }, (telas[estado.tela] || telaInicio)())));
  if (estado.mensagem) raiz.append(h("div", { class: "toast", role: "status" }, icone("ok"), h("span", {}, estado.mensagem)));
  if (estado.foco) document.getElementById(estado.foco)?.focus();
}

function menuLateral() {
  const coord = ehCoordenacao();
  const itens = [
    ["inicio", "Início", "inicio"],
    ["registrar", "Registrar doação", "mais"],
    ["consultar", "Consultar", "busca"],
    ["doadores", "Doadores", "pessoas"],
    coord && ["resumo", "Resumo", "grafico"],
    coord && ["usuarios", "Usuários", "escudo"],
  ].filter(Boolean);
  const nome = estado.usuario.nome;
  return h("aside", { class: "lateral" },
    h("div", { class: "marca" }, h("span", { class: "marca-icone" }, icone("caixa")), h("span", {}, "SCCD")),
    h("nav", { "aria-label": "Telas" },
      itens.map(([id, rotulo, ic]) => h("button", {
        class: estado.tela === id ? "aba ativa" : "aba",
        "aria-current": estado.tela === id ? "page" : false,
        onclick: () => ir(id),
      }, icone(ic), h("span", {}, rotulo)))),
    h("div", { class: "quem" },
      h("span", { class: "avatar", "aria-hidden": "true" }, nome.trim().charAt(0).toUpperCase()),
      h("div", { class: "quem-texto" }, h("strong", {}, nome), h("small", {}, coord ? "coordenação" : "voluntário")),
      h("button", { class: "link sair", onclick: sair }, icone("sair"), h("span", {}, "Sair"))));
}

function cabecalho(titulo, subtitulo, ...acoes) {
  return h("header", { class: "cabecalho" },
    h("div", {}, h("h1", {}, titulo), subtitulo && h("p", { class: "subtitulo" }, subtitulo)),
    acoes.length ? h("div", { class: "acoes" }, acoes) : null);
}

function chipsPeriodo(atual, aoEscolher, chaves = ["hoje", "7dias", "mes", "mesPassado", "tudo"]) {
  const nomes = { hoje: "Hoje", "7dias": "7 dias", mes: "Este mês", mesPassado: "Mês passado", tudo: "Tudo" };
  return h("div", { class: "chips", role: "group", "aria-label": "Períodos rápidos" },
    chaves.map((k) => {
      const p = Regras.periodoRapido(k, hojeISO());
      const ativo = atual.inicio === p.inicio && atual.fim === p.fim;
      return h("button", { type: "button", class: ativo ? "chip ativo" : "chip", "aria-pressed": String(ativo), onclick: () => aoEscolher(p) }, nomes[k]);
    }));
}

// ---------------------------------------------------------------- Acesso (H08)
function telaAcesso(primeiro) {
  const caixa = h("div");
  const nome = h("input", { required: true, autocomplete: "name" });
  const usuario = h("input", { required: true, autocomplete: "username", autofocus: !primeiro });
  const senha = h("input", { type: "password", required: true, autocomplete: primeiro ? "new-password" : "current-password", minlength: primeiro ? 6 : false });

  const entrar = async (e) => {
    e.preventDefault();
    const login = usuario.value.trim().toLowerCase();
    if (primeiro) {
      const falhas = [];
      if (!nome.value.trim() || !login) falhas.push("Preencha nome e usuário.");
      if (senha.value.length < 6) falhas.push("A senha precisa ter pelo menos 6 caracteres.");
      caixa.replaceChildren(erros(falhas) || "");
      if (falhas.length) return;
      const { sal, hash } = await gerarHash(senha.value);
      Banco.gravar("usuarios", [{ id: novoId(), nome: nome.value.trim(), usuario: login, perfil: Regras.PERFIS.COORDENACAO, sal, hash }]);
      return render();
    }
    const u = Banco.ler("usuarios").find((x) => x.usuario === login);
    const confere = u && (await gerarHash(senha.value, u.sal)).hash === u.hash;
    if (!confere) return caixa.replaceChildren(erros(["Usuário ou senha incorretos."]));
    estado.usuario = { id: u.id, nome: u.nome, perfil: u.perfil };
    sessionStorage.setItem("sccd_sessao", u.id);
    ir("inicio");
  };

  return h("div", { class: "acesso" },
    h("div", { class: "acesso-marca" },
      h("span", { class: "marca-icone grande" }, icone("caixa")),
      h("p", { class: "acesso-sigla" }, "SCCD"),
      h("p", { class: "acesso-titulo" }, "Sistema de Cadastro e Controle de Doações"),
      h("p", { class: "acesso-texto" }, "Registre o que chega, encontre qualquer doação em segundos e preste contas com um clique.")),
    h("form", { class: "acesso-form", onsubmit: entrar },
      h("h1", {}, primeiro ? "Primeiro acesso" : "Sistema de Doações"),
      h("p", { class: "subtitulo" }, primeiro
        ? "Crie a conta da coordenação. Depois, ela cadastra os voluntários na aba Usuários."
        : "Entre com o usuário criado pela coordenação."),
      caixa,
      primeiro && campo("Nome", nome),
      campo("Usuário", usuario),
      campo("Senha", campoSenha(senha), primeiro ? "Mínimo de 6 caracteres." : null),
      h("button", { class: "primario largo", type: "submit" }, primeiro ? "Criar conta" : "Entrar"),
      !primeiro && h("p", { class: "nota" }, "Usuários são criados pela coordenação.")));
}

// ---------------------------------------------------------------- Início (painel)
function telaInicio() {
  const doacoes = Banco.ler("doacoes");
  const doadores = Banco.ler("doadores");
  const p = Regras.painel(doacoes, doadores, hojeISO());
  const primeiroNome = estado.usuario.nome.trim().split(/\s+/)[0];
  const mes = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  if (doacoes.length === 0) {
    return h("div", {},
      cabecalho(`Olá, ${primeiroNome}`, "Ainda não há doações registradas."),
      estadoVazio("vazio", "Nenhuma doação por aqui ainda", "Registre a primeira doação recebida. Ela aparece aqui, na consulta e no resumo.",
        h("button", { class: "primario", onclick: () => ir("registrar") }, icone("mais"), "Registrar doação"),
        ehCoordenacao() && h("button", { onclick: carregarExemplo }, "Carregar dados de exemplo")));
  }

  const variacao = p.doacoesMes - p.doacoesMesAnterior;
  const comparacao = p.doacoesMesAnterior === 0 && p.doacoesMes === 0 ? "Nenhuma no mês passado"
    : variacao === 0 ? "Igual ao mês passado"
    : `${variacao > 0 ? "+" : "−"}${Math.abs(variacao)} em relação ao mês passado`;
  const topo = [...p.porCategoria].sort((a, b) => b.registros - a.registros)[0];
  const maxRegistros = Math.max(1, ...p.porCategoria.map((l) => l.registros));
  const nomePorId = Object.fromEntries(doadores.map((d) => [d.id, d.nome]));

  return h("div", {},
    cabecalho(`Olá, ${primeiroNome}`, `Resumo de ${mes}`,
      h("button", { class: "primario", onclick: () => ir("registrar") }, icone("mais"), "Registrar doação")),
    h("div", { class: "kpis" },
      kpi("calendario", "Doações neste mês", Regras.formatarNumero(p.doacoesMes), comparacao),
      kpi("tendencia", "Categoria mais doada", topo && topo.registros ? topo.categoria : "—", topo && topo.registros ? `${topo.registros} doações no mês` : "Sem doações no mês"),
      kpi("pessoas", "Doadores cadastrados", Regras.formatarNumero(p.doadores), "Doações anônimas não entram aqui"),
      kpi("caixa", "Última doação", p.ultima ? Regras.formatarData(p.ultima.data) : "—", p.ultima ? p.ultima.descricao : "")),
    h("div", { class: "duas-colunas" },
      h("section", { class: "cartao" },
        h("h2", {}, "Por categoria neste mês"),
        h("div", { class: "barras" }, p.porCategoria.map((l) => barra(l, maxRegistros)))),
      h("section", { class: "cartao" },
        h("div", { class: "cartao-topo" }, h("h2", {}, "Últimas doações"),
          h("button", { class: "link", onclick: () => ir("consultar") }, "Ver todas")),
        h("ul", { class: "lista-recentes" }, p.recentes.map((d) => h("li", {},
          h("div", {}, h("strong", {}, d.descricao), h("small", {}, `${Regras.formatarData(d.data)} · ${nomePorId[d.doadorId] || "Anônimo"}`)),
          h("div", { class: "direita" }, seloCategoria(d.categoria), h("small", {}, `${Regras.formatarNumero(d.quantidade)} ${d.unidade}`))))))));
}

function kpi(nomeIcone, rotulo, valor, detalhe) {
  return h("div", { class: "kpi" },
    h("span", { class: "kpi-icone" }, icone(nomeIcone)),
    h("p", { class: "kpi-rotulo" }, rotulo),
    h("p", { class: "kpi-valor" }, valor),
    detalhe && h("p", { class: "kpi-detalhe" }, detalhe));
}

// Barra horizontal de uma categoria: largura proporcional ao número de doações, com o número escrito.
function barra(linha, max) {
  const classe = linha.categoria.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return h("div", { class: "barra" },
    h("div", { class: "barra-topo" }, h("span", {}, linha.categoria), h("strong", {}, `${linha.registros} ${linha.registros === 1 ? "doação" : "doações"}`)),
    h("div", { class: "barra-trilho" }, h("div", { class: `barra-cheia cor-${classe}`, style: `width:${(linha.registros / max) * 100}%` })),
    h("small", {}, Regras.formatarQuantidades(linha.porUnidade)));
}

// ---------------------------------------------------------------- Registrar / corrigir doação (H02, H05)
function telaRegistrar() {
  const doadores = Banco.ler("doadores").sort((a, b) => a.nome.localeCompare(b.nome));
  const doacoes = Banco.ler("doacoes");
  const atual = estado.editando ? doacoes.find((d) => d.id === estado.editando) : null;
  const ult = estado.ultimoRegistro || {};
  const v = atual || { data: ult.data || hojeISO(), categoria: ult.categoria || "", descricao: "", quantidade: "", unidade: ult.unidade || "un", observacao: "", doadorId: ult.doadorId || "" };

  const f = {
    doadorId: h("select", { id: "f-doador" }, opcoes(doadores.map((d) => [d.id, d.nome]), v.doadorId || "", "Anônimo")),
    data: h("input", { id: "f-data", type: "date", value: v.data, max: hojeISO() }),
    categoria: h("select", { id: "f-categoria" }, opcoes(Regras.CATEGORIAS, v.categoria, "Escolha…")),
    descricao: h("input", { id: "f-descricao", value: v.descricao, placeholder: "Ex.: arroz tipo 1", autocomplete: "off" }),
    quantidade: h("input", { id: "f-quantidade", type: "number", min: "0.01", step: "any", value: v.quantidade, inputmode: "decimal", placeholder: "0" }),
    unidade: h("select", { id: "f-unidade" }, opcoes(Regras.UNIDADES, v.unidade)),
    observacao: h("input", { id: "f-observacao", value: v.observacao || "", placeholder: "Opcional" }),
  };
  const caixa = h("div");
  const novoDoador = h("button", { type: "button", class: "secundario", onclick: () => abrirNovoDoador((d) => {
    f.doadorId.append(h("option", { value: d.id }, d.nome));
    f.doadorId.value = d.id;
  }) }, icone("mais"), "Novo");

  const salvar = (e) => {
    e.preventDefault();
    const dados = {
      doadorId: f.doadorId.value || null, data: f.data.value, categoria: f.categoria.value,
      descricao: f.descricao.value.trim(), quantidade: Number(f.quantidade.value), unidade: f.unidade.value,
      observacao: f.observacao.value.trim(),
    };
    const falhas = Regras.validarDoacao(dados);
    // marca em vermelho os campos com problema (aria-invalid também avisa leitores de tela)
    f.data.setAttribute("aria-invalid", String(!dados.data));
    f.categoria.setAttribute("aria-invalid", String(!dados.categoria));
    f.descricao.setAttribute("aria-invalid", String(!dados.descricao));
    f.quantidade.setAttribute("aria-invalid", String(!(dados.quantidade > 0)));
    if (falhas.length) return caixa.replaceChildren(erros(falhas));
    if (atual) {
      if (!Regras.podeEditarDoacao(estado.usuario)) return caixa.replaceChildren(erros(["Só a coordenação pode corrigir registros."]));
      Object.assign(atual, dados, { alteradoPor: estado.usuario.nome, alteradoEm: Date.now() });
      Banco.gravar("doacoes", doacoes);
      ir("consultar", { mensagem: "Registro corrigido." });
    } else {
      doacoes.push({ id: novoId(), ...dados, registradoPor: estado.usuario.nome, criadoEm: Date.now() });
      Banco.gravar("doacoes", doacoes);
      ir("registrar", {
        mensagem: `Doação registrada: ${Regras.formatarNumero(dados.quantidade)} ${dados.unidade} de ${dados.descricao}.`,
        ultimoRegistro: { data: dados.data, categoria: dados.categoria, unidade: dados.unidade, doadorId: dados.doadorId || "" },
        foco: "f-descricao",
      });
    }
  };

  return h("div", {},
    cabecalho(atual ? "Corrigir doação" : "Registrar doação",
      atual ? "Só a coordenação pode corrigir registros." : "Campos com * são obrigatórios. Depois de salvar, data, categoria e doador continuam preenchidos para a próxima doação."),
    h("form", { class: "cartao formulario", onsubmit: salvar, novalidate: true },
      caixa,
      h("div", { class: "grade" },
        campo("Doador", h("div", { class: "com-botao" }, f.doadorId, novoDoador), "Deixe “Anônimo” se a pessoa não quiser se identificar."),
        campo("Data *", f.data),
        campo("Categoria *", f.categoria),
        campo("Descrição do item *", f.descricao),
        h("div", { class: "linha" }, campo("Quantidade *", f.quantidade), campo("Unidade", f.unidade)),
        campo("Observação", f.observacao)),
      h("div", { class: "acoes" },
        h("button", { class: "primario", type: "submit" }, icone("ok"), atual ? "Salvar correção" : "Salvar"),
        atual && h("button", { type: "button", onclick: () => ir("consultar") }, "Cancelar"))));
}

// Janela para cadastrar um doador sem sair do registro da doação (H01).
function abrirNovoDoador(aoCriar) {
  const nome = h("input", { required: true, autocomplete: "off" });
  const telefone = h("input", { type: "tel", placeholder: "(83) 9____-____", disabled: true });
  const autorizou = h("input", { type: "checkbox", onchange: () => { telefone.disabled = !autorizou.checked; if (!autorizou.checked) telefone.value = ""; } });
  const caixa = h("div");
  const fechar = () => { dlg.close(); dlg.remove(); };
  const dlg = h("dialog", { class: "dialogo", "aria-labelledby": "titulo-novo-doador" },
    h("form", { onsubmit: (e) => {
      e.preventDefault();
      const dados = { nome: nome.value, telefone: telefone.value, autorizouContato: autorizou.checked };
      const falhas = Regras.validarDoador(dados);
      if (falhas.length) return caixa.replaceChildren(erros(falhas));
      const novo = { id: novoId(), ...Regras.prepararDoador(dados), criadoEm: Date.now() };
      Banco.gravar("doadores", [...Banco.ler("doadores"), novo]);
      fechar();
      aoCriar(novo);
    } },
      h("h2", { id: "titulo-novo-doador" }, "Novo doador"),
      caixa,
      campo("Nome *", nome),
      h("label", { class: "check" }, autorizou, " O doador autorizou guardar o telefone (LGPD)"),
      campo("Telefone (opcional)", telefone),
      h("div", { class: "acoes" },
        h("button", { class: "primario", type: "submit" }, "Salvar doador"),
        h("button", { type: "button", onclick: fechar }, "Cancelar"))));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  if (typeof dlg.showModal === "function") {
    dlg.showModal();
    nome.focus();
  } else {
    dlg.remove();
    ir("doadores");
  }
}

// ---------------------------------------------------------------- Consultar (H03, H04, H05)
function telaConsultar() {
  const doadores = Banco.ler("doadores");
  const nomePorId = Object.fromEntries(doadores.map((d) => [d.id, d.nome]));
  const doacoes = Banco.ler("doacoes");
  const fl = estado.filtros;
  const pode = Regras.podeEditarDoacao(estado.usuario);
  const resultados = h("div", { class: "resultados", "aria-live": "polite" });

  const ctl = {
    inicio: h("input", { type: "date", value: fl.inicio, onchange: () => aplicar() }),
    fim: h("input", { type: "date", value: fl.fim, onchange: () => aplicar() }),
    categoria: h("select", { onchange: () => aplicar() }, opcoes(Regras.CATEGORIAS, fl.categoria, "Todas")),
    texto: h("input", { type: "search", value: fl.texto, placeholder: "Doador ou descrição", oninput: () => aplicar() }),
  };

  // Lê os filtros dos campos e redesenha só a lista (a busca acompanha a digitação sem perder o cursor).
  function aplicar() {
    estado.filtros = { inicio: ctl.inicio.value, fim: ctl.fim.value, categoria: ctl.categoria.value, texto: ctl.texto.value };
    desenhar();
  }

  function desenhar() {
    const lista = Regras.filtrarDoacoes(doacoes, estado.filtros, doadores);
    if (lista.length === 0) {
      resultados.replaceChildren(doacoes.length === 0
        ? estadoVazio("vazio", "Nenhuma doação registrada", "As doações registradas aparecem aqui.", h("button", { class: "primario", onclick: () => ir("registrar") }, "Registrar doação"))
        : estadoVazio("busca", "Nenhuma doação encontrada", "Tente outro período, outra categoria ou outra palavra.", h("button", { onclick: limpar }, "Limpar filtros")));
      return;
    }
    const colunas = ["Data", "Item", "Categoria", "Quantidade", "Doador"];
    resultados.replaceChildren(
      h("p", { class: "nota" }, `${lista.length} ${lista.length === 1 ? "registro" : "registros"} · mais recentes primeiro`),
      h("div", { class: "tabela" }, h("table", {},
        h("thead", {}, h("tr", {}, [...colunas, pode ? "" : null].filter((x) => x !== null).map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, lista.map((d) => h("tr", {},
          h("td", { "data-rotulo": "Data" }, Regras.formatarData(d.data)),
          h("td", { "data-rotulo": "Item", class: "item" }, d.descricao, d.observacao && h("small", {}, d.observacao)),
          h("td", { "data-rotulo": "Categoria" }, seloCategoria(d.categoria)),
          h("td", { "data-rotulo": "Quantidade", class: "num" }, `${Regras.formatarNumero(d.quantidade)} ${d.unidade}`),
          h("td", { "data-rotulo": "Doador" }, nomePorId[d.doadorId] || "Anônimo"),
          pode && h("td", { class: "acao" }, h("button", { class: "link", onclick: () => ir("registrar", { editando: d.id }) }, icone("editar"), h("span", {}, "Corrigir")))))))));
  }

  function limpar() {
    estado.filtros = { ...FILTROS_VAZIOS };
    render();
  }

  desenhar();
  return h("div", {},
    cabecalho("Consultar doações", "Filtre por período, categoria ou digite parte do nome do doador ou do item."),
    h("section", { class: "cartao" },
      chipsPeriodo(fl, (p) => { estado.filtros = { ...estado.filtros, ...p }; render(); }),
      h("form", { class: "filtros", onsubmit: (e) => { e.preventDefault(); aplicar(); } },
        campo("De", ctl.inicio), campo("Até", ctl.fim), campo("Categoria", ctl.categoria), campo("Pesquisa", ctl.texto),
        h("div", { class: "acoes" },
          h("button", { class: "primario", type: "submit" }, icone("busca"), "Pesquisar"),
          h("button", { type: "button", onclick: limpar }, "Limpar"))),
      resultados));
}

// ---------------------------------------------------------------- Doadores (H01)
function telaDoadores() {
  const doadores = Banco.ler("doadores").sort((a, b) => a.nome.localeCompare(b.nome));
  const contagem = Regras.contarPorDoador(Banco.ler("doacoes"));
  const verContato = Regras.podeVerContato(estado.usuario);
  const nome = h("input", { required: true, autocomplete: "off" });
  const telefone = h("input", { type: "tel", placeholder: "(83) 9____-____", disabled: true });
  const autorizou = h("input", { type: "checkbox", onchange: () => { telefone.disabled = !autorizou.checked; if (!autorizou.checked) telefone.value = ""; } });
  const caixa = h("div");
  const listaEl = h("ul", { class: "lista-doadores" });
  const busca = h("input", { type: "search", placeholder: "Buscar doador", "aria-label": "Buscar doador", oninput: () => desenharLista() });

  function desenharLista() {
    const termo = busca.value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const visiveis = doadores.filter((d) => d.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(termo));
    listaEl.replaceChildren(...visiveis.map((d) => h("li", {},
      h("span", { class: "avatar pequeno", "aria-hidden": "true" }, d.nome.trim().charAt(0).toUpperCase()),
      h("div", { class: "doador-texto" }, h("strong", {}, d.nome), verContato && d.telefone && h("small", {}, d.telefone)),
      h("span", { class: "contagem" }, `${contagem[d.id] || 0} ${contagem[d.id] === 1 ? "doação" : "doações"}`))));
    if (!visiveis.length) listaEl.replaceChildren(h("li", { class: "nota" }, "Nenhum doador encontrado."));
  }
  desenharLista();

  return h("div", {},
    cabecalho("Doadores", verContato ? "O telefone só é guardado com autorização do doador e só a coordenação o vê." : "Doações podem ser registradas como anônimas."),
    h("div", { class: "duas-colunas" },
      h("form", { class: "cartao formulario", onsubmit: (e) => {
        e.preventDefault();
        const dados = { nome: nome.value, telefone: telefone.value, autorizouContato: autorizou.checked };
        const falhas = Regras.validarDoador(dados);
        if (falhas.length) return caixa.replaceChildren(erros(falhas));
        Banco.gravar("doadores", [...doadores, { id: novoId(), ...Regras.prepararDoador(dados), criadoEm: Date.now() }]);
        ir("doadores", { mensagem: `Doador “${dados.nome.trim()}” cadastrado.` });
      } },
        h("h2", {}, "Cadastrar doador"),
        caixa,
        campo("Nome *", nome),
        h("label", { class: "check" }, autorizou, " O doador autorizou guardar o telefone (LGPD)"),
        campo("Telefone (opcional)", telefone),
        h("div", { class: "acoes" }, h("button", { class: "primario", type: "submit" }, icone("ok"), "Salvar"))),
      h("section", { class: "cartao" },
        h("div", { class: "cartao-topo" }, h("h2", {}, `Cadastrados (${doadores.length})`)),
        doadores.length === 0
          ? estadoVazio("pessoas", "Nenhum doador ainda", "Doações podem ser registradas como anônimas.")
          : h("div", {}, busca, listaEl))));
}

// ---------------------------------------------------------------- Resumo (H06, H07)
function telaResumo() {
  const hoje = hojeISO();
  const padrao = Regras.periodoRapido("mes", hoje);
  const atual = estado.filtrosResumo || padrao;
  const inicio = h("input", { type: "date", value: atual.inicio });
  const fim = h("input", { type: "date", value: atual.fim });
  const r = Regras.resumoPorCategoria(Banco.ler("doacoes"), atual.inicio, atual.fim);
  const max = Math.max(1, ...r.linhas.map((l) => l.registros));
  const periodoTexto = atual.inicio || atual.fim
    ? `${Regras.formatarData(atual.inicio) || "início"} a ${Regras.formatarData(atual.fim) || "hoje"}`
    : "Todo o período";

  return h("div", { class: "resumo" },
    cabecalho("Resumo por período", "Use para prestar contas aos apoiadores.",
      h("button", { onclick: () => window.print() }, icone("imprimir"), "Imprimir / salvar PDF")),
    h("section", { class: "cartao nao-imprimir" },
      chipsPeriodo(atual, (p) => { estado.filtrosResumo = p; render(); }, ["mes", "mesPassado", "7dias", "tudo"]),
      h("form", { class: "filtros curto", onsubmit: (e) => { e.preventDefault(); estado.filtrosResumo = { inicio: inicio.value, fim: fim.value }; render(); } },
        campo("De", inicio), campo("Até", fim),
        h("div", { class: "acoes" }, h("button", { class: "primario", type: "submit" }, "Gerar resumo")))),
    h("section", { class: "cartao" },
      h("div", { class: "so-impressao" }, h("p", { class: "olho" }, "SCCD · Sistema de Cadastro e Controle de Doações"), h("h2", {}, "Resumo de doações recebidas")),
      h("div", { class: "cartao-topo" },
        h("div", {}, h("p", { class: "olho" }, periodoTexto), h("p", { class: "kpi-valor" }, `${r.totalRegistros} ${r.totalRegistros === 1 ? "doação" : "doações"}`))),
      h("div", { class: "barras" }, r.linhas.map((l) => barra(l, max))),
      h("div", { class: "tabela" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Categoria", "Doações", "Quantidade recebida"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, r.linhas.map((l) => h("tr", {},
          h("td", { "data-rotulo": "Categoria" }, seloCategoria(l.categoria)),
          h("td", { "data-rotulo": "Doações", class: "num" }, l.registros),
          h("td", { "data-rotulo": "Quantidade" }, Regras.formatarQuantidades(l.porUnidade))))))),
      h("p", { class: "nota" }, `Quantidades com unidades diferentes (kg, un, L…) aparecem separadas. Gerado em ${Regras.formatarData(hoje)} por ${estado.usuario.nome}.`)));
}

// ---------------------------------------------------------------- Usuários e dados (coordenação)
function telaUsuarios() {
  const usuarios = Banco.ler("usuarios");
  const nome = h("input", { required: true });
  const usuario = h("input", { required: true, autocomplete: "off" });
  const senha = h("input", { type: "password", required: true, minlength: 6, autocomplete: "new-password" });
  const perfil = h("select", {}, opcoes([[Regras.PERFIS.VOLUNTARIO, "Voluntário"], [Regras.PERFIS.COORDENACAO, "Coordenação"]], Regras.PERFIS.VOLUNTARIO));
  const caixa = h("div");
  const arquivo = h("input", { type: "file", accept: "application/json,.json", class: "oculto", onchange: () => importar(arquivo.files[0]) });

  const exportar = () => {
    const dados = { exportadoEm: new Date().toISOString(), doadores: Banco.ler("doadores"), doacoes: Banco.ler("doacoes") };
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" })), download: `sccd-backup-${hojeISO()}.json` });
    a.click();
  };

  return h("div", {},
    cabecalho("Usuários e dados", "Só a coordenação vê esta tela."),
    h("div", { class: "duas-colunas" },
      h("form", { class: "cartao formulario", onsubmit: async (e) => {
        e.preventDefault();
        const login = usuario.value.trim().toLowerCase();
        const falhas = [];
        if (!nome.value.trim() || !login) falhas.push("Preencha nome e usuário.");
        if (usuarios.some((u) => u.usuario === login)) falhas.push("Esse usuário já existe.");
        if (senha.value.length < 6) falhas.push("A senha precisa ter pelo menos 6 caracteres.");
        if (falhas.length) return caixa.replaceChildren(erros(falhas));
        const { sal, hash } = await gerarHash(senha.value);
        Banco.gravar("usuarios", [...usuarios, { id: novoId(), nome: nome.value.trim(), usuario: login, perfil: perfil.value, sal, hash }]);
        ir("usuarios", { mensagem: `Usuário “${login}” criado.` });
      } },
        h("h2", {}, "Criar usuário"),
        caixa,
        h("div", { class: "grade" }, campo("Nome", nome), campo("Usuário", usuario), campo("Senha inicial", senha), campo("Perfil", perfil)),
        h("div", { class: "acoes" }, h("button", { class: "primario", type: "submit" }, icone("mais"), "Criar usuário"))),
      h("section", { class: "cartao" },
        h("h2", {}, `Quem tem acesso (${usuarios.length})`),
        h("ul", { class: "lista-doadores" }, usuarios.map((u) => h("li", {},
          h("span", { class: "avatar pequeno", "aria-hidden": "true" }, u.nome.trim().charAt(0).toUpperCase()),
          h("div", { class: "doador-texto" }, h("strong", {}, u.nome), h("small", {}, u.usuario)),
          h("span", { class: u.perfil === Regras.PERFIS.COORDENACAO ? "selo selo-perfil" : "selo" }, u.perfil === Regras.PERFIS.COORDENACAO ? "coordenação" : "voluntário")))))),
    h("div", { class: "duas-colunas" },
      h("section", { class: "cartao" },
        h("h2", {}, "Dados de exemplo"),
        h("p", {}, "Para demonstração: adiciona 3 doadores e 12 doações fictícias do mês atual e do anterior, todos marcados como “(exemplo)”."),
        h("div", { class: "acoes" }, h("button", { onclick: carregarExemplo }, "Carregar dados de exemplo"))),
      h("section", { class: "cartao" },
        h("h2", {}, "Cópia de segurança"),
        h("p", {}, "Os dados ficam só neste navegador. Exporte uma cópia com frequência; para usar em outro computador, importe a cópia lá."),
        h("div", { class: "acoes" },
          h("button", { onclick: exportar }, icone("baixar"), "Exportar doações e doadores (JSON)"),
          h("button", { onclick: () => arquivo.click() }, icone("subir"), "Importar cópia"),
          arquivo))));
}

// Junta uma cópia exportada com os dados atuais (registros com o mesmo id não são duplicados).
function importar(file) {
  if (!file) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    try {
      const dados = JSON.parse(leitor.result);
      if (!Array.isArray(dados.doacoes) || !Array.isArray(dados.doadores)) throw new Error("formato");
      const doacoesOk = dados.doacoes.filter((d) => d && d.id && Regras.validarDoacao(d).length === 0);
      const doadoresOk = dados.doadores.filter((d) => d && d.id && Regras.validarDoador(d).length === 0).map(Regras.prepararDoador);
      const juntar = (lista, novos) => [...lista.filter((x) => !novos.some((n) => n.id === x.id)), ...novos];
      Banco.gravar("doadores", juntar(Banco.ler("doadores"), doadoresOk));
      Banco.gravar("doacoes", juntar(Banco.ler("doacoes"), doacoesOk));
      const ignorados = dados.doacoes.length - doacoesOk.length + dados.doadores.length - doadoresOk.length;
      ir("usuarios", { mensagem: `Cópia importada: ${doacoesOk.length} doações e ${doadoresOk.length} doadores${ignorados ? ` (${ignorados} registros inválidos ignorados)` : ""}.` });
    } catch {
      ir("usuarios", { mensagem: "Não foi possível ler o arquivo. Use uma cópia exportada pelo próprio sistema." });
    }
  };
  leitor.readAsText(file);
}

// Dados fictícios só para demonstrar o sistema (não são dados de nenhuma instituição).
function carregarExemplo() {
  if (!confirm("Adicionar dados de exemplo para demonstração?")) return;
  const agora = Date.now();
  const doadores = [
    { id: "ex1", nome: "Mercadinho do Bairro (exemplo)", telefone: "", autorizouContato: false, criadoEm: agora },
    { id: "ex2", nome: "Paróquia vizinha (exemplo)", telefone: "", autorizouContato: false, criadoEm: agora },
    { id: "ex3", nome: "Família Souza (exemplo)", telefone: "(83) 90000-0000", autorizouContato: true, criadoEm: agora },
  ];
  const hoje = new Date();
  const dia = (mesesAtras, d) => {
    const x = new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, Math.min(d, 28));
    return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const base = [
    [0, 2, "Alimento", "Arroz tipo 1", 20, "kg", "ex1"], [0, 3, "Alimento", "Feijão carioca", 10, "kg", "ex1"],
    [0, 5, "Higiene", "Sabonete", 24, "un", "ex2"], [0, 8, "Roupa", "Camisetas infantis", 15, "un", null],
    [0, 10, "Alimento", "Leite em pó", 6, "un", "ex3"], [0, 12, "Outro", "Cobertores", 4, "un", "ex2"],
    [1, 4, "Alimento", "Macarrão", 12, "pacote", "ex1"], [1, 9, "Higiene", "Pasta de dente", 18, "un", null],
    [1, 15, "Roupa", "Calças", 8, "un", "ex2"], [1, 18, "Alimento", "Óleo de soja", 9, "L", "ex1"],
    [1, 22, "Alimento", "Açúcar", 10, "kg", null], [1, 26, "Higiene", "Fraldas", 3, "pacote", "ex3"],
  ];
  const doacoes = base.map(([m, d, categoria, descricao, quantidade, unidade, doadorId], i) => ({
    id: "exd" + i, data: dia(m, d), categoria, descricao: descricao + " (exemplo)", quantidade, unidade,
    observacao: "", doadorId, registradoPor: estado.usuario.nome, criadoEm: agora + i,
  })).filter((x) => x.data <= hojeISO());
  const semRepetir = (lista, novos) => [...lista.filter((x) => !novos.some((n) => n.id === x.id)), ...novos];
  Banco.gravar("doadores", semRepetir(Banco.ler("doadores"), doadores));
  Banco.gravar("doacoes", semRepetir(Banco.ler("doacoes"), doacoes));
  ir("consultar", {
    mensagem: `${doacoes.length} doações de exemplo carregadas.`,
    filtros: { ...FILTROS_VAZIOS }, // limpa filtros antigos para mostrar tudo
  });
}

// ---------------------------------------------------------------- Início
(function iniciar() {
  const id = sessionStorage.getItem("sccd_sessao");
  const u = id && Banco.ler("usuarios").find((x) => x.id === id);
  if (u) estado.usuario = { id: u.id, nome: u.nome, perfil: u.perfil };
  render();
})();
