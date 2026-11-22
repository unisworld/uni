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
assets/fingerprint.js impressão digital do aparelho: um mundo por dispositivo
assets/sealed.js      abre a mensagem final, que viaja cifrada
assets/sealed.json    a mensagem, em AES-256-GCM
assets/app.js         interface: mapa, entrega, visita, edição, estado, sobre, regras
server.mjs            API + arquivos estáticos + store em data/parts.json
PLANO.md              plano completo de construção, invariantes e critérios
```

## Onde mexer primeiro

- **Chave PIX:** a constante `PIX_KEY` no topo de `assets/app.js`.
- **Frase que abre a mensagem final:** `REVEAL_PASSPHRASE` em `server.mjs`. Trocar essa frase exige recifrar `assets/sealed.json`.
- **Paleta e tipografia:** as variáveis no topo de `assets/styles.css`.
- **Textos de boas-vindas e pistas:** `WELCOME` e `CLUES` em `assets/engine.js`.
- **Comportamentos dos cidadãos:** `NODE_POOL` em `assets/engine.js`.

## Um mundo por aparelho

A peça fica presa ao aparelho, não à sessão. `assets/fingerprint.js` calcula uma impressão digital (canvas, GPU, tela, fuso, fontes, hardware) e o servidor recusa uma segunda entrega vinda do mesmo valor — inclusive de outro navegador no mesmo dispositivo. O IP é guardado apenas como hash, como segunda barreira.

Quem já tem um mundo entra por `#/editar` e pode mudar boas-vindas, Instagram, clima e placas quantas vezes quiser. O **nome** só pode ser trocado **uma vez**; depois disso o servidor recusa a mudança para sempre.

## A mensagem final

O texto não existe em claro em lugar nenhum do pacote. Ele viaja cifrado em `assets/sealed.json` (AES-256-GCM) e a chave é derivada de uma frase que fica só em `server.mjs`. A rota `/api/state` só devolve a chave quando `db.parts.length >= 2000`; antes disso o navegador não tem como abrir o selo. Quando a última peça entra, o mapa mostra a mensagem sozinho.

## Som

`assets/ambience.js` sintetiza tudo com a Web Audio API — nenhum arquivo de áudio, nenhuma licença, nenhum CDN. Cada bioma tem suas camadas (ondas, vento, pássaros, grilos, folhas) e o clima escolhido pelo dono acrescenta chuva, neve, névoa ou ventania. O navegador só libera o áudio depois de um toque: o botão "som" fica no canto do mundo.

## Invariantes

1. O terreno é função das coordenadas globais, nunca do sorteio. A posição da peça não muda o bioma, então a emenda entre vizinhos é automática.
2. Nada gerado no cliente é confiado ao cliente: posição, código e contagem são decididos no servidor.
3. Toda peça é reproduzível: mesma semente + mesma coordenada = mesma peça, em qualquer aparelho, para sempre.
4. O celular é o alvo primário. Sem pós-processamento, sem shadow map, sem textura baixada da rede: o chão e o céu são gerados em canvas e shader.
5. Nenhuma tela branca: sem WebGL cai para a ficha textual; sem câmera cai para órbita; sem rede, a mensagem de erro explica o que fazer.

## API

| método | rota | função |
| --- | --- | --- |
| GET | `/api/state` | contador, bordas, tentativas |
| GET | `/api/map` | peças ocupadas (sem códigos) |
| POST | `/api/part` | sorteia posição, valida emenda, grava, devolve o código uma vez |
| GET | `/api/part/:cx/:cy` | peça + população + nós + pontos de pista |
| GET | `/api/clues?owner=` | pistas coletadas por um visitante |
| POST | `/api/clue` | valida a distância e marca a pista |
| POST | `/api/celestial` | valida o código supremo |

`POST /api/part` recebe `{ ownerId, welcome?, clues?[] }`. Limites: uma parte a cada 90 segundos, 12 por dia, por `ownerId`.

O código supremo é `sha256(code_hash_oeste + code_hash_leste + code_hash_norte + code_hash_sul + "world")`, cortado em 16 caracteres. Só é aceito com 2000/2000 e com as quatro pistas das bordas coletadas pelo mesmo visitante.

## Simplificações em relação ao plano normativo

Estas escolhas foram tomadas para caber em uma primeira entrega que roda de verdade:

- **Peça isométrica em PNG:** o mapa desenha o terreno direto da função global (rápido, 2000 células, sem CDN). O render headless por peça pode entrar depois, gravando `png_key` e trocando a célula por imagem.
- **Multidão:** resolvida com textura cozida (VAT). 14 clipes de 16 quadros são calculados uma vez no carregamento e gravados numa textura de floats; o vertex shader lê a pose, então a CPU não anima ninguém. A multidão inteira é um draw call.
- **Realidade aumentada:** câmera traseira + orientação do aparelho, mundo ancorado 3,2 m à frente com escala ajustável, anel de apoio e órbita como caminho de volta. `immersive-ar` com `hit-test` fica para quando houver superfície calibrada — o desenho atual não depende dele para funcionar.
- **Armazenamento:** JSON em disco. A interface do servidor está isolada em `claimPart`, `collectClue` e `celestial`, então trocar por Postgres ou KV é substituir essas três funções.

## Licença

Uso livre. Crédito: Vinícius Gabriel.

## Limitações da persistência

O servidor atual mantém o estado em memória e o grava inteiro em uma linha JSONB do PostgreSQL. Execute **uma única instância**, sem múltiplos processos ou réplicas. Para escalar com segurança, migre para tabelas e transações com controles de concorrência. Faça backups do banco. Não use o JSON local em hospedagem de disco efêmero.

A impressão digital não é autenticação segura: ela pode ser forjada. A regra de um mundo por aparelho é uma barreira de conveniência, não uma garantia. Reveja autenticação, moderação, limites de requisições e privacidade antes de abrir ao público.
