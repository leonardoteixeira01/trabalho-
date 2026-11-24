# MVP — Sistema de Cadastro e Controle de Doações (SCCD)

Menor versão funcional do sistema (seção 8 do documento, opção A). Cobre as histórias **Must** (H08, H01, H02, H03, H04) e duas **Should** (H05 e H06). A H07 (exportar PDF) ficou de fora.

## Como usar

1. Baixe o repositório e abra `mvp/index.html` no Chrome ou no Firefox. Não precisa instalar nada.
2. **Primeiro acesso:** crie a conta da coordenação.
3. Na aba **Usuários**, a coordenação cria as contas dos voluntários.
4. Registre doadores e doações, consulte, corrija e gere o resumo.

## O que cada tela atende

| Tela | Histórias | Requisitos e regras |
|---|---|---|
| Login / primeiro acesso | H08 | RF008 |
| Registrar doação | H02 (e H05 ao corrigir) | RF002, RF005, RD001, RD002, RD004, RNF001 (6 campos) |
| Consultar | H03, H04, H05 | RF003, RF004, RF005 |
| Doadores | H01 | RF001, RD003 (telefone só com autorização), RNF003 |
| Resumo (coordenação) | H06 | RF006 |
| Usuários (coordenação) | — | criação de voluntários e cópia de segurança |

## Como o código está organizado

| Arquivo | Conteúdo |
|---|---|
| `regras.js` | Regras de negócio puras: validações, filtros, ordenação, permissões e resumo. Cada função cita o requisito que implementa. |
| `app.js` | Telas e armazenamento. A função `h()` monta o HTML tratando todo texto como texto, nunca como código. |
| `estilo.css` | Visual, com contraste mínimo de 4,5:1 (RNF005). |
| `testes.js` | Testes automáticos das regras: `node mvp/testes.js`. |

## Limitações (assumidas para um MVP acadêmico)

- **Os dados ficam só no navegador** (localStorage). Outro computador não vê os mesmos dados. Use **Usuários → Exportar** para guardar uma cópia.
- **O login protege só a interface.** As senhas são guardadas como hash (PBKDF2), mas, sem um servidor, quem tem acesso ao computador consegue ler os dados pelo navegador. Para uso real, seria preciso um backend com banco de dados.
- Não há exclusão de registros nem recuperação de senha.

## Uso de IA

O código foi gerado com o Claude (Anthropic) em 24/11/2026, a partir do backlog e dos requisitos da equipe, e foi revisado por ela. Isso está declarado na seção 9.4 do documento.
