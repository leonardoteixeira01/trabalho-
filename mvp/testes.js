/*
 * Testes das regras de negócio. Rodar com:  node mvp/testes.js
 * Cada teste corresponde a um critério de aceite do backlog.
 */
const assert = require("node:assert/strict");
const R = require("./regras.js");

let ok = 0;
function teste(nome, fn) {
  fn();
  ok++;
  console.log("✓ " + nome);
}

const coord = { perfil: R.PERFIS.COORDENACAO };
const vol = { perfil: R.PERFIS.VOLUNTARIO };
const doadores = [{ id: "d1", nome: "Padaria São José" }];
const doacoes = [
  { id: "a", data: "2026-11-20", categoria: "Alimento", descricao: "Arroz", quantidade: 5, unidade: "kg", doadorId: "d1", criadoEm: 1 },
  { id: "b", data: "2026-11-22", categoria: "Roupa", descricao: "Camisetas", quantidade: 12, unidade: "un", doadorId: null, criadoEm: 2 },
  { id: "c", data: "2026-11-22", categoria: "Alimento", descricao: "Feijão", quantidade: 3, unidade: "kg", doadorId: null, criadoEm: 3 },
  { id: "d", data: "2026-10-30", categoria: "Higiene", descricao: "Sabonete", quantidade: 30, unidade: "un", doadorId: null, criadoEm: 4 },
  { id: "e", data: "2026-11-21", categoria: "Alimento", descricao: "Leite", quantidade: 6, unidade: "L", doadorId: null, criadoEm: 5 },
];

teste("H02/RD001 — quantidade zero ou negativa é recusada", () => {
  const base = { data: "2026-11-24", categoria: "Alimento", descricao: "Arroz" };
  assert.ok(R.validarDoacao({ ...base, quantidade: 0 }).length > 0);
  assert.ok(R.validarDoacao({ ...base, quantidade: -2 }).length > 0);
  assert.deepEqual(R.validarDoacao({ ...base, quantidade: 1 }), []);
});

teste("H02/RD002 — data, categoria e descrição são obrigatórias", () => {
  const erros = R.validarDoacao({ quantidade: 1 });
  assert.equal(erros.length, 3);
});

teste("H01/RD003 — telefone sem autorização é recusado e descartado", () => {
  assert.ok(R.validarDoador({ nome: "Ana", telefone: "8399999", autorizouContato: false }).length > 0);
  assert.equal(R.prepararDoador({ nome: " Ana ", telefone: "8399999", autorizouContato: false }).telefone, "");
  assert.equal(R.prepararDoador({ nome: "Ana", telefone: "8399999", autorizouContato: true }).telefone, "8399999");
});

teste("H03/RF003 — lista da mais recente para a mais antiga", () => {
  assert.deepEqual(R.ordenarRecentes(doacoes).map((d) => d.id), ["c", "b", "e", "a", "d"]);
});

teste("H04/RF004 — filtros retornam somente registros correspondentes", () => {
  const porPeriodo = R.filtrarDoacoes(doacoes, { inicio: "2026-11-01", fim: "2026-11-30" }, doadores);
  assert.deepEqual(porPeriodo.map((d) => d.id), ["c", "b", "e", "a"]);
  const porCategoria = R.filtrarDoacoes(doacoes, { categoria: "Alimento" }, doadores);
  assert.deepEqual(porCategoria.map((d) => d.id), ["c", "e", "a"]);
  const porDoador = R.filtrarDoacoes(doacoes, { texto: "padaria sao jose" }, doadores);
  assert.deepEqual(porDoador.map((d) => d.id), ["a"]);
  const anonimo = R.filtrarDoacoes(doacoes, { texto: "anônimo", categoria: "Roupa" }, doadores);
  assert.deepEqual(anonimo.map((d) => d.id), ["b"]);
});

teste("H05/RD004 — só a coordenação corrige registros", () => {
  assert.equal(R.podeEditarDoacao(coord), true);
  assert.equal(R.podeEditarDoacao(vol), false);
  assert.equal(R.podeEditarDoacao(null), false);
});

teste("RNF003 — contato do doador só para a coordenação", () => {
  assert.equal(R.podeVerContato(coord), true);
  assert.equal(R.podeVerContato(vol), false);
});

teste("H06/RF006 — totais por categoria conferem com os registros do período", () => {
  const r = R.resumoPorCategoria(doacoes, "2026-11-01", "2026-11-30");
  const alimento = r.linhas.find((l) => l.categoria === "Alimento");
  assert.deepEqual(alimento.porUnidade, { kg: 8, L: 6 });
  assert.equal(alimento.registros, 3);
  assert.equal(r.linhas.find((l) => l.categoria === "Higiene").registros, 0);
  assert.equal(r.totalRegistros, 4);
});

console.log(`\n${ok} testes passaram.`);
