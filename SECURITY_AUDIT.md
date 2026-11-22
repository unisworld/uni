# UniWorld — revisão local de segurança

**Base auditada:** `unisworld/uni`, commit `e8ead43e42779612c5916c7a6d36b3436235323b` (snapshot público). Esta cópia contém mudanças locais para revisão; nada foi enviado ao GitHub, ao PostgreSQL real ou ao serviço público.

## Correções aplicadas nesta cópia

- **Autorização de peças novas:** `/api/part` emite uma capacidade aleatória de 256 bits. O servidor persiste somente o SHA-256; o segredo vai em cookie `HttpOnly; SameSite=Strict` e, quando `NODE_ENV=production`, também `Secure`. Alterações, placas e progresso de pistas passam a exigir a capacidade. `ownerId` enviado pelo cliente não é mais autoridade para consultar/alterar progresso.
- **Revelação de pistas personalizadas:** o endpoint público da peça não retorna o texto de pistas personalizadas antes da coleta autorizada. A coleta autenticada retorna o texto revelado. Coordenadas e sementes continuam expostas ao cliente para o jogo e não são prova de presença.
- **Redução de falsificação/fingerprinting:** substituído o fingerprint de canvas/GPU/fontes/hardware por ID aleatório guardado no perfil do navegador; a interface e o README agora dizem explicitamente que não se garante uma peça por aparelho.
- **DoS básico:** corpos JSON limitados a 16 KiB, timeout da requisição de 15 s, fila de no máximo 100 requisições, até 120 chamadas de API por IP por minuto, resposta 413/400/415 apropriada e cabeçalhos de segurança. IP encaminhado por cabeçalhos só é aceito com `TRUST_PROXY=1`.
- **Persistência:** escrita do JSON de desenvolvimento via arquivo temporário + rename atômico. PostgreSQL agora usa conexão dedicada e advisory lock para recusar outra instância desta versão usando o mesmo banco, evitando que snapshots simultâneos se sobrescrevam.
- **Limite por identificador:** passou a aplicar efetivamente 12 contribuições em 24 h por `ownerId`, além do intervalo de 90 s já existente. É uma barreira de conveniência, não identidade verificada.
- README atualizado com limitações, operação e instruções de teste.

## Riscos que continuam abertos

1. **Uma peça por aparelho/pessoa não pode ser garantida apenas por navegador.** Fingerprint/`ownerId` podem ser limpos ou falsificados, e IP pode ser compartilhado, trocado ou distribuído por botnet. A garantia real exige autenticação verificável, regras de privacidade e revisão de abuso. A edição de peças novas tem uma capacidade de acesso, mas o cookie pode ser perdido ou usado por script same-origin comprometido; não há recuperação.
2. **Compatibilidade de dados existentes:** registros antigos sem `access_hash` não podem ser editados pelas novas rotas. Antes de migrar um banco real, o operador precisa definir e testar um procedimento seguro de verificação/rotação dos tokens; não reintroduzir autenticação pelo fingerprint como fallback.
3. **Revelação final:** `/api/state` publica deliberadamente a chave quando a contagem chega a 2.000. Como as contribuições ainda podem ser falsificadas com novos perfis/IPs, um atacante coordenado pode tentar preencher o mundo e forçar a revelação. A regra “uma contribuição por pessoa/aparelho” não é uma barreira criptográfica.
4. **Coleta de pista:** coordenadas e sementes são enviadas ao navegador e a API recebe coordenadas do cliente; um participante autenticado pode falsificar movimento e coletar sem caminhar. A mudança protege o progresso contra `ownerId` arbitrário, não prova presença física.
5. **DDoS e concorrência:** limites são locais ao processo e não substituem WAF/limites de borda. O PostgreSQL continua como snapshot JSONB completo em memória, não é modelo multi-instância; o lock só protege instâncias que adotem o mesmo advisory lock. Migração de dados normalizados/transações continua recomendada.
6. **Chave de revelação e implantação:** comprimento mínimo não garante entropia. Configurar segredo aleatório de alta entropia; usar HTTPS e `NODE_ENV=production` para cookie `Secure`. Configurar `TRUST_PROXY=1` somente se o proxy confiável sobrescrever os cabeçalhos recebidos. A resposta final continua pública por projeto.
7. **Cliente/supply chain:** não foi criada CSP estrita, pois o site usa importmap, estilos dinâmicos e módulos externos (`three` via esm.sh). Recomenda-se empacotar/servir dependências localmente e construir CSP com nonce/hash antes de produção.
8. **Produção antiga:** código anterior não usa o advisory lock. Não executar a versão antiga em paralelo com esta sobre o mesmo banco; o lock não controla clientes que não o respeitam.

## Testes

`tests/security.test.mjs` cobre cookie de acesso, tentativa sem autenticação, proteção de progresso, ocultação/revelação de pista, ausência do token em claro no arquivo, JSON grande/malformado, tipo de conteúdo e não exposição de arquivos internos. O teste usa `DATA_DIR` temporário e nunca conecta ao PostgreSQL real. Para evitar depender da disponibilidade de sockets locais, ele chama o mesmo dispatcher de requisições HTTP do servidor com objetos de requisição/resposta em memória; isso cobre o roteamento e validação, mas não substitui um smoke test de rede real.

Nesta revisão, foi baixado Node.js oficial v22.23.5 de `nodejs.org/dist/latest-v22.x/`; o tarball `node-v22.23.5-linux-x64.tar.gz` foi validado contra `SHASUMS256.txt` (SHA-256 `c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1`). `npm ci` reinstalou as dependências do lockfile: 14 pacotes adicionados, auditoria npm com 0 vulnerabilidades. `npm test` passou: 6/6 testes. No sandbox foi necessário executar com `NODE_OPTIONS=--disable-wasm-trap-handler`, pois o limite de memória virtual local impede a alocação WASM do fetch nativo do Node; em Node 22 sem essa opção, a própria inicialização do fetch falha por OOM.

Também foram verificados sintaxe JS/MJS e importações locais do frontend, além do contrato de 2.000 peças. Ainda falta um teste manual de navegador/rede com o Three.js e recursos remotos carregados; sockets loopback não estão disponíveis neste sandbox.

## Arquivos alterados/gerados

- `server.mjs`
- `assets/app.js`
- `assets/fingerprint.js`
- `README.md`
- `package.json` (script `test`)
- `tests/security.test.mjs` (novo)
- `SECURITY_AUDIT.md` (este relatório)
