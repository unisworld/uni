# uniworld

Um mundo comum que só existe quando duas mil pessoas diferentes doam uma peça cada.

O frontend é estático, mas as contribuições e o mapa compartilhado dependem da API Node. Em produção, o backend usa PostgreSQL persistente quando `DATABASE_URL` está configurada; sem ela, usa JSON local apenas para desenvolvimento.

## Rodar

```bash
npm install
npm start
```

Abre em `http://localhost:3000`. Node 18 ou mais novo. Não há `npm install`: o servidor usa apenas módulos nativos e o navegador carrega o Three.js por CDN.

Para publicar a aplicação completa, use um host Node ligado a PostgreSQL (por exemplo, Render ou Railway). Configure `DATABASE_URL`, `REVEAL_PASSPHRASE` (segredo aleatório de pelo menos 32 caracteres) e `PORT` no ambiente do serviço. O processo Node serve frontend e API na mesma origem. GitHub Pages e Neocities só hospedam o frontend estático e não executam a API.

**Segredo da mensagem:** `REVEAL_PASSPHRASE` não pode ser incluída no Git. O conteúdo de `assets/sealed.json` foi cifrado novamente; mantenha a frase apenas nas variáveis secretas do host. Sem essa variável o servidor não inicia. Nunca publique a frase nem o texto final antes de decidir que ele pode ser revelado.

## Estrutura

```
index.html            documento único; importa os módulos nativos
assets/styles.css     todo o visual (grafite #0b0e12, papel #e6e2da, ocre #c8a45c)
assets/engine.js      geração determinística: bioma, nome, população, pistas, terreno
assets/vat.js         multidão: poses cozidas em textura, shader, um draw call
assets/scenery.js     céu por reino, solo, água, poeira, texturas em canvas
assets/realm.js       a ilha em 3D (Three.js): terreno, cenário, multidão, AR, câmera
assets/ambience.js    som ambiente sintetizado no navegador (chuva, vento, ondas, pássaros)
assets/fingerprint.js identificador aleatório local do perfil (não prova identidade)
assets/sealed.js      abre a mensagem final, que viaja cifrada
assets/sealed.json    a mensagem, em AES-256-GCM
assets/app.js         interface: mapa, entrega, visita, edição, estado, sobre, regras
server.mjs            API + arquivos estáticos + store PostgreSQL (JSON local em desenvolvimento)
PLANO.md              plano completo de construção, invariantes e critérios
```

## Onde mexer primeiro

- **Chave PIX:** a constante `PIX_KEY` no topo de `assets/app.js`.
- **Frase que abre a mensagem final:** `REVEAL_PASSPHRASE` em `server.mjs`. Trocar essa frase exige recifrar `assets/sealed.json`.
- **Paleta e tipografia:** as variáveis no topo de `assets/styles.css`.
- **Textos de boas-vindas e pistas:** `WELCOME` e `CLUES` em `assets/engine.js`.
- **Comportamentos dos cidadãos:** `NODE_POOL` em `assets/engine.js`.

## Limite de identidade: não é uma peça garantida por aparelho

O identificador aleatório de `assets/fingerprint.js` e o `ownerId` são valores sob controle do navegador e podem ser apagados, falsificados ou trocados. O bloqueio por identificador/IP reduz duplicatas casuais, mas **não prova identidade nem garante uma peça por pessoa ou aparelho**. IP compartilhado também pode bloquear participantes legítimos. Os cabeçalhos de proxy só são aceitos quando o administrador configura `TRUST_PROXY=1`; configure isso somente se o proxy de confiança sobrescrever esses cabeçalhos. Para reduzir sequestro de peças novas, a entrega emite um token aleatório de 256 bits, guarda apenas seu hash e usa cookie `HttpOnly; SameSite=Strict` para editar/remover placas e associar pistas. Em produção, `NODE_ENV=production` também adiciona `Secure`, então o serviço deve estar atrás de HTTPS. O cookie não pode ser lido diretamente por scripts, mas XSS ainda pode agir como o usuário; perfis/cookies perdidos não têm recuperação automática. Dados antigos sem hash de token exigem migração/verificação segura pelo operador e não poderão ser editados pela nova interface até lá. Para antifraude real e recuperação de conta é necessário autenticação verificável e política de privacidade/minimização; identificadores de navegador não substituem isso.

Metadados das peças (nome, boas-vindas, Instagram, clima) são públicos. Pistas personalizadas ficam ocultas nas respostas públicas até a coleta autenticada; as posições e sementes de renderização são entregues ao cliente para o jogo e não constituem segredo. Não trate IDs de navegador como prova de identidade.

Quem já tem um mundo entra por `#/editar` e pode mudar boas-vindas, Instagram, clima e placas quantas vezes quiser. O **nome** só pode ser trocado **uma vez**; depois disso o servidor recusa a mudança para sempre.

## A mensagem final

O texto não existe em claro em lugar nenhum do pacote. Ele viaja cifrado em `assets/sealed.json` (AES-256-GCM) e a chave é derivada de uma frase que fica só em `server.mjs`. A rota `/api/state` só devolve a chave quando `db.parts.length >= 2000`; antes disso o navegador não tem como abrir o selo. Quando a última peça entra, o mapa mostra a mensagem sozinho.

## Som

`assets/ambience.js` sintetiza tudo com a Web Audio API — nenhum arquivo de áudio, nenhuma licença, nenhum CDN. Cada bioma tem suas camadas (ondas, vento, pássaros, grilos, folhas) e o clima escolhido pelo dono acrescenta chuva, neve, névoa ou ventania. O navegador só libera o áudio depois de um toque: o botão "som" fica no canto do mundo.

## Invariantes

1. O terreno é função das coordenadas globais, nunca do sorteio. A posição da peça não muda o bioma, então a emenda entre vizinhos é automática.
2. O servidor valida a posição reportada e decide a contagem, mas coordenadas enviadas pelo navegador podem ser falsificadas; a coleta é uma regra de jogo, não prova de presença física.
3. Toda peça é reproduzível: mesma semente + mesma coordenada = mesma peça, em qualquer aparelho, para sempre.
4. O celular é o alvo primário. Sem pós-processamento, sem shadow map, sem textura baixada da rede: o chão e o céu são gerados em canvas e shader.
5. Nenhuma tela branca: sem WebGL cai para a ficha textual; sem câmera cai para órbita; sem rede, a mensagem de erro explica o que fazer.

## API

| método | rota | função |
| --- | --- | --- |
| GET | `/api/state` | contador, bordas, tentativas |
| GET | `/api/map` | peças ocupadas (sem códigos) |
| POST | `/api/part` | sorteia posição, valida emenda, grava, devolve o código uma vez |
| GET | `/api/part/:cx/:cy` | peça + população + nós + pontos; pistas personalizadas só aparecem após coleta autenticada |
| GET | `/api/clues?owner=` | progresso do participante autenticado pelo cookie (query `owner` ignorada) |
| POST | `/api/clue` | valida a distância e marca a pista |
| POST | `/api/celestial` | valida o código supremo |

`POST /api/part` recebe `{ ownerId, fingerprint, welcome?, clues?[] }`; no sucesso, emite um cookie de acesso `HttpOnly` e devolve o código uma única vez. Limites atuais: uma parte a cada 90 segundos e 12 partes em 24 horas por `ownerId`, além de um registro por fingerprint e IP. São valores controlados pelo cliente; os limites não são identidade verificada.

O código supremo é `sha256(code_hash_oeste + code_hash_leste + code_hash_norte + code_hash_sul + "world")`, cortado em 16 caracteres. Só é aceito com 2000/2000 e com as quatro pistas das bordas coletadas pelo mesmo visitante.

## Simplificações em relação ao plano normativo

Estas escolhas foram tomadas para caber em uma primeira entrega que roda de verdade:

- **Peça isométrica em PNG:** o mapa desenha o terreno direto da função global (rápido, 2000 células, sem CDN). O render headless por peça pode entrar depois, gravando `png_key` e trocando a célula por imagem.
- **Multidão:** resolvida com textura cozida (VAT). 14 clipes de 16 quadros são calculados uma vez no carregamento e gravados numa textura de floats; o vertex shader lê a pose, então a CPU não anima ninguém. A multidão inteira é um draw call.
- **Realidade aumentada:** câmera traseira + orientação do aparelho, mundo ancorado 3,2 m à frente com escala ajustável, anel de apoio e órbita como caminho de volta. `immersive-ar` com `hit-test` fica para quando houver superfície calibrada — o desenho atual não depende dele para funcionar.
- **Armazenamento:** PostgreSQL em produção (snapshot JSONB) ou arquivo JSON atômico em desenvolvimento local. O estado segue em memória e exige um único processo por banco.

## Licença

Uso livre. Crédito: Vinícius Gabriel.

## Limitações da persistência e operação

O servidor mantém o estado em memória e grava o snapshot inteiro em uma linha JSONB. Execute **uma única instância**: o snapshot não oferece coordenação entre processos nem entre implantações simultâneas. O pool PostgreSQL reabre conexões ociosas depois que o endpoint serverless suspende; a primeira requisição após suspensão pode demorar. Isso **não** torna o modelo distribuído nem substitui tabelas normalizadas, transações e controles de concorrência; faça backups. O modo JSON local não é adequado a hospedagem com disco efêmero.

A API limita corpos JSON a 16 KiB, encerra requisições lentas, limita a fila, aplica até 120 chamadas de API por IP por minuto e não confia em cabeçalhos de IP enviados pelo cliente por padrão. São defesas básicas, não mitigação completa de DDoS: use também limites de borda/WAF, observabilidade e estratégia de recuperação. O ambiente precisa de `REVEAL_PASSPHRASE` com segredo aleatório de alta entropia (p. ex. gerado por `openssl rand -hex 32`); o teste local usa apenas um valor descartável. A mensagem final só é revelada quando o estado atinge a contagem de conclusão, o que não impede fraude de contribuição para forçar essa condição.

Para executar testes locais: `npm install` e `npm test`. Eles iniciam uma instância com diretório de dados temporário e não usam banco real. Antes de produção, reveja autenticação, moderação, limites de infraestrutura e privacidade. Segurança reduz riscos; não há garantia de risco zero.
