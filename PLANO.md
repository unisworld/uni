# uniworld — plano completo de construção

Documento de referência para reconstruir, auditar ou continuar o projeto.
Quem implementar deve seguir esta ordem e não pode quebrar as invariantes da seção 2.

---

## 1. O que é

Um mundo de 40 × 50 posições (2.000 peças) construído por 2.000 pessoas que nunca se falam.
Cada pessoa entrega uma parte. O servidor sorteia onde ela cabe. Ninguém escolhe vizinho.
Quando a última peça entra, o centro do mapa abre uma mensagem que ninguém sabe qual é.

O site tem cinco superfícies: mapa, estado, sobre, regras e baixar.
A ilha de cada peça é visitável em 3D, no navegador, com ou sem câmera.

Identidade: grafite, papel, ocre e verde-mata. Tipografia serifada nos títulos e monoespaçada no corpo.
Sem gradiente decorativo, sem sombra difusa, sem emoji, sem exclamação.
Tom de voz sóbrio, curto, com peso. Nunca entusiasmo de startup.

---

## 2. Invariantes — o que nunca pode ser quebrado

1. **Nenhum `Math.random()` no caminho da geração.** Tudo sai de `mulberry32(xmur3(seed))`.
   A mesma seed produz a mesma peça em qualquer máquina, para sempre.
2. **O terreno é função da coordenada global, nunca do sorteio.**
   `elevation(cx, cy)` decide bioma e altitude. Duas peças vizinhas herdam o mesmo relevo na
   fronteira, então a emenda é automática por construção, não por validação.
3. **A ordem de consumo do rng é contrato.** `variant → nome → boas-vindas → população → nós →
   cidadãos → pistas → pontos de pista → real_idx`. Mudar a ordem muda todo mundo que já existe.
4. **O código real aparece uma única vez.** O servidor devolve `{ code, options, realIdx }` e
   guarda apenas `sha256(code:seed:SEED_GLOBAL)`. Não existe endpoint que devolva o código de novo.
5. **O cliente nunca recebe o texto de uma pista antes de coletá-la.**
   A coleta é conferida no servidor pela distância entre o avatar e o ponto gerado.
6. **Nada de conta obrigatória.** Identidade é um `ownerId` aleatório no `localStorage`.
7. **Zero dependência de serviço externo** no pacote exportado. Node e navegador, só.
8. **A página não pode estourar horizontalmente em 375 px.** Nunca.

---

## 3. Arquitetura

```
index.html                 documento único, módulos nativos
assets/styles.css          todo o visual (variáveis de cor e tipografia)
assets/engine.js           geração determinística — fonte única da verdade
assets/vat.js              multidão: cozimento de poses + shader
assets/scenery.js          céu, solo, água, poeira, texturas em canvas
assets/realm.js            a ilha: cena, câmera, entrada, AR, loop
assets/app.js              mapa, entrega, visita, estado, rotas por hash
server.mjs                 servidor de referência (API + estáticos), Node 18+
PLANO.md                   este documento
```

Regra de dependência: `engine.js` não importa nada. `vat.js` e `scenery.js` importam só `three`
(e `scenery.js` importa `engine.js`). `realm.js` importa os três. `app.js` importa todos.

---

## 4. Modelo de dados

**Part** — uma peça do mundo.
`cx`, `cy` (grade), `seed` (8 caracteres, emitida pelo servidor), `name`, `welcome`, `biome`,
`variant`, `clue_a`, `clue_b`, `clue_c`, `code_hash`, `real_idx`, `owner_id`.
Leitura aberta. Escrita só pelo servidor.

**Clue** — pista coletada por alguém.
`part_cx`, `part_cy`, `idx` (0..2), `owner_id`. Só o servidor lê e escreve.

**Counter** — contador único do mundo (`key: "world"`, `rejected`).
Serve para o número público de tentativas recusadas. Só o servidor.

`created_date` é usado para limite de entrega (90 s entre partes, 12 por dia).

---

## 5. Geração determinística

### 5.1 Ruído

`hash2(x, y, s)` inteiro → [0,1). `noise2` interpola com curva suave. `fbm` soma 4 oitavas.
Nada de tabela pré-computada, nada de estado global.

### 5.2 Bioma por coordenada

`elevation(cx, cy) = fbm(cx·0.085, cy·0.085, 4, 11)`.

- `e < 0.37` → oceano
- `e < 0.44` → costa
- `e < 0.57` → campina
- `e < 0.70` → mata
- resto → serra

O bioma da peça **é** o bioma da coordenada. Não há escolha.

### 5.3 Altura local

```
h0 = (elevation - 0.42) * 5.2
n1 = (fbm(x·0.085 + 13.7, z·0.085 + 4.2, 3, 21) - 0.5) * 2.4
n2 = (fbm(x·0.34, z·0.34, 2, 37) - 0.5) * 0.55
d  = hypot(x, z) / 11.5
fall = 1 - clamp((d - 0.62) / 0.42)
h = (h0 + 1.6 + n1 + n2) · fall² - 0.55
```

A mesma função roda no servidor (validação de pista) e no cliente (malha e caminhada).
Se divergirem, a pista nunca é coletada. É o teste mais importante do projeto.

### 5.4 Nós sociais e cidadãos

`NODE_POOL` lista 13 tipos de nó, cada um com comportamento, prop, raio e biomas onde aparece.
A peça sorteia de 6 a 14 nós com posição polar (raio 2.4–9.0). Depois sorteia a população
(oceano 2–5, costa 6–12, campina 10–20, mata 8–16, serra 4–10) e associa cada cidadão a um nó.

Regra de ouro na renderização: **os primeiros N cidadãos cobrem os N primeiros nós.**
Assim toda atividade sorteada aparece de fato na ilha, e não só por sorte.

---

## 6. Sorteio de posição e a física do coletor de cupons

Preencher 2.000 espaços com sorteio uniforme não custa 2.000 tentativas, custa
`2.000 · H(2.000) ≈ 16,8 mil` — o clássico problema do coletor de cupons. As últimas peças quase
sempre caem em buraco ocupado. Com 20% de rejeição por emenda, o total passa de 19 mil acessos.

**Isso é o desenho, não um defeito.** O contador público mostra `entregues` e `recusadas`, e a
diferença entre eles é a prova de que o mundo está sendo preenchido de verdade.

Regras do sorteio no servidor:

1. Carregar as peças ocupadas.
2. Listar as vazias.
3. Se restarem mais de 40 vazias, excluir as 4 posições de borda reservadas.
4. Sortear uma vazia com `crypto.getRandomValues`.
5. Conferir o vizinho: se o bioma do vizinho existente diferir em mais de 1 índice, incrementar
   `rejected` e recusar com mensagem.
6. Emitir `seed`, gerar a peça, sortear o código real e os dois falsos, gravar.

Limites: 90 s entre entregas do mesmo `ownerId`, 12 por dia.

---

## 7. O código e o totem

Cada parte entrega um código de 4 caracteres e dois falsos, embaralhados em 3 posições.
O verdadeiro só é exibido na resposta da entrega. O banco guarda `sha256(code:seed:"world")`.

Os quatro códigos das bordas (19,0 · 39,24 · 19,49 · 0,24), concatenados e somados ao sufixo,
produzem o código supremo por `sha256(...).slice(0,16).toUpperCase()`.

O totem no centro exige: mundo completo, as quatro bordas preenchidas, as quatro pistas
coletadas pelo mesmo `ownerId`, e o código supremo digitado. Só então devolve a mensagem.

---

## 8. A multidão: textura cozida (VAT)

O problema: 2.000 bonecos animados por skinning na CPU derretem um celular de entrada.

A solução, em `vat.js`:

1. **Esqueleto fixo de 7 ossos** (root, torso, cabeça, dois braços, duas pernas) montado com
   6 caixas → 216 vértices, 72 triângulos por cidadão.
2. **14 clipes** de 16 quadros cada, gerados por uma função de pose (`poseFor(clipe, fase)`).
   Nada de arquivo de animação, nada de download.
3. **Cozimento no carregamento**: para cada quadro, calcula-se a matriz de cada osso e transforma
   os 216 vértices. O resultado vai para uma `DataTexture` de floats de 216 × 224 pixels (~770 KB,
   uma única subida para a GPU).
4. **Um único draw call**: `InstancedBufferGeometry` com atributos por instância
   (posição, giro, escala, clipe, fase, ritmo, cor). O vertex shader lê a textura e devolve a
   posição já deformada.
5. **Normais por derivada** no fragment shader: sombreamento plano de baixa poli, sem cozinhar
   normais e sem dobrar a textura.
6. **Névoa manual** no shader (`uFogNear`, `uFogFar`), porque `ShaderMaterial` não herda a névoa
   da cena.

Custo por frame na CPU: escrever ~30 posições de instância. Na GPU: 1 draw call.
Escalar para 2.000 cidadãos no mesmo mundo não muda a contagem de draw calls; muda só o
`instanceCount` e o buffer de posições.

Cuidados que não podem ser perdidos:

- `position` precisa existir na geometria (o renderer usa para calcular o `drawCount`).
- `frustumCulled = false` e `boundingSphere` generosa: a geometria é deformada no shader.
- Textura com `NearestFilter`, sem mipmap. Filtro linear borra a pose entre quadros vizinhos.
- Se `prefers-reduced-motion`, congelar `uMotion` em 0 em vez de desligar a multidão.

---

## 9. Atividades dos cidadãos

Cada cidadão herda o comportamento do nó onde está. Treze atividades, todas sorteadas pela seed:

caminhar · conversar · ler · ouvir música · mexer no celular · jogar bola · soltar pipa ·
dormir na cadeira de balanço · lutar · dançar · jogar vôlei · capoeira · pescar.

Regras:

- Quem tem o nó `trilha` caminha de verdade entre nós, e usa o clipe `caminhar`.
- Quem lê, ouve música, mexe no celular, dorme ou pesca fica **sentado** (root rebaixado,
  coxas a −1,35 rad). Dormir balança a cadeira (rotação do root em X).
- Ninguém atravessa prop nem terreno: a posição é sempre relativa ao nó, e o Y vem de `h(x,z)`.
- O avatar usa o mesmo rig e o mesmo sistema: anda com `caminhar` e para com `parado`.

Aproximação: a cada 0,4 s o cliente mede a distância do avatar a cada cidadão. O mais próximo
dentro de 3,5 unidades dispara o balão com a **frase de boas-vindas escrita pelo dono da peça**.
Uma vez por cidadão, com intervalo mínimo de 9 s entre falas.

---

## 10. O cenário

**Céu.** Cúpula de 150 unidades com shader de gradiente por reino, disco solar e halo no
horizonte. Paleta por bioma (azul-noite no oceano, ocre esverdeado na campina, cinza pedra na
serra). A névoa da cena usa a mesma cor do horizonte: é isso que costura o mundo no céu.

**Solo.** O terreno é uma malha de 96 × 96 segmentos com cor por vértice (bioma, areia perto da
água, rocha acima de 2,1) multiplicada por uma textura de grão gerada em canvas: capim inclinado
na campina e na mata, ondulações de areia na costa, fissuras angulares na serra.

**Elementos.** Árvores (tronco + copa icosaédrica, contagem por bioma), tufos de capim, pedras
tetraédricas, poeira flutuante e duas camadas de água (base opaca + ondulação aditiva que rola).
Tudo instanciado, tudo posicionado por `freeSpot()`, que evita cair em cima de um nó social.

**Sombras.** Nada de shadow map no celular. Elipse de contato por instância, uma textura radial,
um draw call.

---

## 11. Realidade aumentada

O que existe é **passagem de câmera com mundo ancorado**, não WebXR:

1. Ao ligar, pede `DeviceOrientationEvent.requestPermission()` (iOS) e `getUserMedia`
   com `facingMode: environment`. Se qualquer um falhar, volta para órbita com mensagem clara.
2. O vídeo entra atrás do canvas; o renderer passa a limpar com alfa zero e o céu é escondido.
3. O mundo é posicionado 3,2 m à frente do olhar, 1 m abaixo do olho, com escala 0,16.
4. Um anel pulsante e uma mancha de contato marcam onde o mundo está apoiado.
5. Um dedo gira o mundo; dois dedos mudam a escala (0,07–0,50); toque sem arrasto reancora à frente.
6. O direcional move o avatar **relativo ao olhar do aparelho**, não ao eixo do mundo.
7. Sair da AR restaura céu, névoa, escala, posição e alfa.

Regra: a AR nunca pode ser o único caminho. Sem câmera, a ilha continua inteira em órbita.

---

## 12. Orçamentos de performance

Metas em celular de entrada, 60 fps:

- 1 draw call para toda a multidão, 1 para as sombras, 1 para as pistas, 1 para props,
  até 6 para cenário. Total abaixo de 16.
- Abaixo de 90 mil triângulos na cena de uma peça.
- Nenhuma alocação dentro do loop (reutilizar `Object3D`, `Vector3`, `Color`).
- `dt` limitado a 0,05 s para não explodir depois de uma aba em segundo plano.
- Pausa total em `visibilitychange`.
- `devicePixelRatio` limitado a 2; antialias desligado acima disso.
- Medir e mostrar: cidadãos, draw calls, triângulos, ms/frame.

---

## 13. O que não fazer

- Não usar `Math.random` na geração, nunca, em nenhum arquivo.
- Não sortear o bioma da peça: o bioma é a coordenada.
- Não guardar código de pista em claro no cliente nem no banco.
- Não trocar a textura cozida por skinning de CPU "para ficar mais bonito".
- Não usar shadow map, nem pós-processamento, nem SSR.
- Não colocar conta, senha ou e-mail para visitar o mundo.
- Não pedir PIX por SDK, modal ou redirecionamento: só copiar a chave.
- Não escrever texto de marketing. Frases curtas, minúsculas, sem exclamação.
- Não estourar a largura da tela em 375 px, em nenhuma rota.
- Não prometer o que não está pronto: se falta, o README diz o que falta.

---

## 14. Critérios de aceitação

1. Duas máquinas diferentes, mesma seed, geram nome, população, nós e pistas idênticos.
2. Entregar uma parte devolve código de 4 caracteres; recarregar a página não devolve de novo.
3. Duas entregas seguidas do mesmo `ownerId` em menos de 90 s são recusadas.
4. A peça `6-0` abre, renderiza canvas, caminha, fala e coleta pista.
5. O balão de fala aparece ao chegar a 3,5 unidades de um cidadão e mostra a frase do dono.
6. Cada atividade sorteada aparece pelo menos uma vez na ilha.
7. Nenhum erro de hidratação, nenhum aviso de import, zero estouro horizontal em 375 px e 1440 px.
8. Sem câmera, a AR avisa e a ilha continua jogável em órbita.
9. Baixar o .zip produz 15 arquivos, e `node server.mjs` sobe o site completo sem npm install.
10. Um aparelho entrega uma peça só, e a impressão digital impede uma segunda entrega por outro navegador no mesmo dispositivo.
11. O nome muda uma vez; boas-vindas, Instagram, clima e até cinco placas mudam sempre.
12. O som do reino é sintetizado no navegador — nenhum arquivo de áudio no pacote.
13. O texto final viaja cifrado em AES-256-GCM e a chave só sai do servidor com as 2000 peças no lugar.
10. O contador público mostra entregues, vazias, tentativas e recusadas coerentes.

---

## 15. Roteiro

**Fase 1 — mundo.** engine, entidade, sorteio, entrega, código, emenda, contador.
**Fase 2 — mapa.** grade de 2.000 células, bioma, bordas, centro, hover.
**Fase 3 — ilha.** terreno, céu, cenário, multidão VAT, atividades, avatar, pistas.
**Fase 4 — AR.** câmera, orientação, âncora, gesto, fallback.
**Fase 5 — totem.** bordas, pistas, código supremo, mensagem.
**Fase 6 — entrega.** pacote .zip, README, este plano, servidor de referência.
**Fase 7 — escala.** render isométrico em PNG por peça (servidor headless), cache em CDN,
mapa com miniaturas reais.

---

## 16. Créditos

uniworld — criado por Vinícius Gabriel.
Instagram: @morvezito · Contato: miatsupport@gmail.com · Doação: chave PIX no rodapé do site.
Código livre para uso, com o nome do autor preservado.
