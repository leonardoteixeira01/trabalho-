# MVP — Sistema de Cadastro e Controle de Doações (SCCD)

Menor versão funcional do sistema (seção 8 do documento, opção A). Cobre **as oito histórias** do backlog: as Must (H08, H01–H04), as Should (H05, H06) e a Could (H07), esta pelo botão "Imprimir / salvar PDF" do resumo.

## Como usar

1. Baixe o repositório e abra `mvp/index.html` no Chrome ou no Firefox. Não precisa instalar nada.
2. **Primeiro acesso:** crie a conta da coordenação e anote a senha.
3. Para demonstrar: **Usuários → Carregar dados de exemplo**.
4. Na aba **Usuários**, a coordenação cria as contas dos voluntários.

## O que cada tela atende

| Tela | Histórias | Requisitos e regras |
|---|---|---|
| Login / primeiro acesso | H08 | RF008 (senha com botão de mostrar/ocultar) |
| Início (painel) | H03, H06 | Números do mês, categoria mais doada, últimas doações |
| Registrar doação | H02, H01, H05 | RF002, RF005, RD001, RD002, RD004, RNF001. Data, categoria e doador continuam preenchidos para a próxima doação; botão "Novo" cadastra doador sem sair da tela |
| Consultar | H03, H04, H05 | RF003, RF004, RF005. Períodos rápidos (Hoje, 7 dias, Este mês…), busca enquanto digita, selos de categoria |
| Doadores | H01 | RF001, RD003 (telefone só com autorização), RNF003; busca e número de doações por doador |
| Resumo (coordenação) | H06, H07 | RF006, RF007. Barras por categoria e "Imprimir / salvar PDF" |
| Usuários (coordenação) | — | Criar voluntários, dados de exemplo, exportar e importar cópia de segurança |

Também tem **modo escuro automático** (segue o sistema), layout para **celular** e contraste mínimo de 4,5:1 (RNF005).

## Como o código está organizado

| Arquivo | Conteúdo |
|---|---|
| `regras.js` | Regras de negócio puras: validações, filtros, períodos, permissões, resumo e números do painel. Cada função cita o requisito que implementa. |
| `ui.js` | Peças de interface: `h()` monta o HTML tratando todo texto como texto (nunca como código), ícones e campos. |
| `app.js` | As telas e o armazenamento no navegador. |
| `estilo.css` | Visual, modo escuro, celular e impressão. |
| `testes.js` | 11 testes automáticos das regras: `node mvp/testes.js`. |

## Limitações (assumidas para um MVP acadêmico)

- **Os dados ficam só no navegador** (localStorage). Para levar a outro computador: **Usuários → Exportar** num computador e **Importar cópia** no outro.
- **O login protege só a interface.** As senhas são guardadas como hash (PBKDF2), mas, sem um servidor, quem tem acesso ao computador consegue ler os dados pelo navegador. Para uso real, seria preciso um backend com banco de dados.
- Não há exclusão de registros nem recuperação de senha. Esqueceu a senha num navegador de teste? No Console (Cmd+Option+J): `Object.keys(localStorage).filter(k => k.startsWith("sccd_")).forEach(k => localStorage.removeItem(k)); location.reload()` — isso apaga os dados do MVP naquele navegador.

## Uso de IA

O código foi gerado com o Claude (Anthropic) em 24/11/2026, a partir do backlog e dos requisitos da equipe, e foi revisado por ela. Isso está declarado na seção 9.4 do documento.
