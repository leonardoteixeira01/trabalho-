/*
 * SCCD — Regras de negócio (sem interface).
 *
 * Tudo aqui é função pura: recebe dados, devolve resultado, não mexe na tela
 * nem no armazenamento. Por isso dá para testar com `node mvp/testes.js`.
 *
 * Cada função indica o requisito ou a regra de domínio que implementa.
 */

const CATEGORIAS = ["Alimento", "Roupa", "Higiene", "Outro"];
const UNIDADES = ["un", "kg", "L", "pacote", "caixa"];
const PERFIS = { COORDENACAO: "coordenacao", VOLUNTARIO: "voluntario" };

/* RD001 e RD002 — toda doação precisa de data, categoria, descrição e quantidade > 0. */
function validarDoacao(doacao) {
  const erros = [];
  if (!doacao.data) erros.push("Informe a data da doação.");
  if (!CATEGORIAS.includes(doacao.categoria)) erros.push("Escolha uma categoria.");
  if (!doacao.descricao || !doacao.descricao.trim()) erros.push("Descreva o item doado.");
  const qtd = Number(doacao.quantidade);
  if (!Number.isFinite(qtd) || qtd <= 0) erros.push("A quantidade deve ser maior que zero.");
  return erros;
}

/* RF001 e RD003 — doador precisa de nome; telefone só pode ser guardado com autorização. */
function validarDoador(doador) {
  const erros = [];
  if (!doador.nome || !doador.nome.trim()) erros.push("Informe o nome do doador.");
  if (doador.telefone && doador.telefone.trim() && !doador.autorizouContato) {
    erros.push("Só guarde o telefone se o doador autorizar (LGPD).");
  }
  return erros;
}

/* RD003 — se não houver autorização, o telefone é descartado antes de salvar. */
function prepararDoador(doador) {
  return {
    ...doador,
    nome: doador.nome.trim(),
    telefone: doador.autorizouContato ? (doador.telefone || "").trim() : "",
  };
}

/* RD004 — só a coordenação corrige registros de doação (RF005). */
function podeEditarDoacao(usuario) {
  return Boolean(usuario) && usuario.perfil === PERFIS.COORDENACAO;
}

/* RNF003 — contato do doador visível só para a coordenação. */
function podeVerContato(usuario) {
  return Boolean(usuario) && usuario.perfil === PERFIS.COORDENACAO;
}

/* RF003 — lista da mais recente para a mais antiga (data e, no empate, ordem de cadastro). */
function ordenarRecentes(doacoes) {
  return [...doacoes].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (b.criadoEm || 0) - (a.criadoEm || 0);
  });
}

function semAcento(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/*
 * RF004 — filtra por período (datas no formato AAAA-MM-DD, inclusivas),
 * categoria e texto (busca na descrição e no nome do doador, sem diferenciar acentos).
 */
function filtrarDoacoes(doacoes, filtros, doadores) {
  const nomePorId = Object.fromEntries((doadores || []).map((d) => [d.id, d.nome]));
  const termo = semAcento(filtros.texto).trim();
  return ordenarRecentes(
    doacoes.filter((d) => {
      if (filtros.inicio && d.data < filtros.inicio) return false;
      if (filtros.fim && d.data > filtros.fim) return false;
      if (filtros.categoria && d.categoria !== filtros.categoria) return false;
      if (termo) {
        const alvo = semAcento(d.descricao + " " + (nomePorId[d.doadorId] || "Anônimo"));
        if (!alvo.includes(termo)) return false;
      }
      return true;
    })
  );
}

/*
 * RF006 — total de itens por categoria no período.
 * Soma as quantidades por categoria e unidade (não faz sentido somar kg com unidades).
 */
function resumoPorCategoria(doacoes, inicio, fim) {
  const noPeriodo = filtrarDoacoes(doacoes, { inicio, fim }, []);
  const linhas = CATEGORIAS.map((categoria) => {
    const daCategoria = noPeriodo.filter((d) => d.categoria === categoria);
    const porUnidade = {};
    for (const d of daCategoria) {
      porUnidade[d.unidade] = (porUnidade[d.unidade] || 0) + Number(d.quantidade);
    }
    return { categoria, registros: daCategoria.length, porUnidade };
  });
  return { linhas, totalRegistros: noPeriodo.length };
}

function formatarData(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/* Soma por unidade em texto: { kg: 8, L: 6 } → "8 kg + 6 L" (usada no resumo e no painel). */
function formatarQuantidades(porUnidade) {
  const partes = Object.entries(porUnidade || {}).map(([u, n]) => `${formatarNumero(n)} ${u}`);
  return partes.join(" + ") || "—";
}

/* Número no padrão brasileiro, com no máximo 2 casas: 1234.5 → "1.234,5". */
function formatarNumero(n) {
  return Number(Number(n).toFixed(2)).toLocaleString("pt-BR");
}

/*
 * Períodos rápidos dos botões de filtro (RF004 e RF006).
 * hoje: "AAAA-MM-DD". Date.UTC ajusta sozinho dia 0 (último dia do mês anterior) e mês 0 (dezembro).
 */
function periodoRapido(chave, hoje) {
  const [a, m, d] = hoje.split("-").map(Number);
  const iso = (ano, mes, dia) => new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
  switch (chave) {
    case "hoje": return { inicio: hoje, fim: hoje };
    case "7dias": return { inicio: iso(a, m, d - 6), fim: hoje };
    case "mes": return { inicio: iso(a, m, 1), fim: hoje };
    case "mesPassado": return { inicio: iso(a, m - 1, 1), fim: iso(a, m, 0) };
    default: return { inicio: "", fim: "" }; // "tudo"
  }
}

/* RF003 + RF001 — quantas doações cada doador fez (lista de doadores). */
function contarPorDoador(doacoes) {
  const contagem = {};
  for (const d of doacoes) if (d.doadorId) contagem[d.doadorId] = (contagem[d.doadorId] || 0) + 1;
  return contagem;
}

/* Números da tela inicial: mês atual × mês anterior, doadores, última doação e totais por categoria. */
function painel(doacoes, doadores, hoje) {
  const mes = periodoRapido("mes", hoje);
  const anterior = periodoRapido("mesPassado", hoje);
  const recentes = ordenarRecentes(doacoes);
  return {
    doacoesMes: filtrarDoacoes(doacoes, mes, []).length,
    doacoesMesAnterior: filtrarDoacoes(doacoes, anterior, []).length,
    doadores: doadores.length,
    ultima: recentes[0] || null,
    recentes: recentes.slice(0, 5),
    porCategoria: resumoPorCategoria(doacoes, mes.inicio, mes.fim).linhas,
  };
}

const Regras = {
  CATEGORIAS, UNIDADES, PERFIS,
  validarDoacao, validarDoador, prepararDoador,
  podeEditarDoacao, podeVerContato,
  ordenarRecentes, filtrarDoacoes, resumoPorCategoria, formatarData,
  formatarQuantidades, formatarNumero, periodoRapido, contarPorDoador, painel,
};

if (typeof module !== "undefined") module.exports = Regras;
