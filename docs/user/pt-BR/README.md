<!-- translation-of: docs/user/README.md source-hash: a206e390cf4902f4 -->
# Documentação do ForkBuild para usuários

<!-- languages -->
[English](../README.md) · [Deutsch](../de/README.md) · [Español](../es/README.md) · [Français](../fr/README.md) · [Bahasa Indonesia](../id/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · **Português (Brasil)**
<!-- /languages -->

<!-- stale -->
> **Nota:** A versão em inglês desta página mudou desde a tradução, então esta tradução pode estar desatualizada. Consulte a [versão em inglês](../README.md).
<!-- /stale -->

Guias práticos para usar o ForkBuild no navegador. É novo por aqui?
Comece por **[Primeiros passos](01-GettingStarted.md)**: cinco minutos
entre abrir o aplicativo e entrar andando na sua primeira construção.

## Eu quero…

| Eu quero… | Leia |
|---|---|
| Construir minha primeira coisa | [Primeiros passos](01-GettingStarted.md#colocando-seu-primeiro-bloco) |
| Aprender as ferramentas de construção | [O Editor](02-TheEditor.md) |
| Compartilhar uma construção com um amigo | [Compartilhando um link](04-PublishingAndForking.md#compartilhando-um-link) |
| Deixar todo mundo encontrar minha construção | [Quem pode encontrá-la?](04-PublishingAndForking.md#quem-pode-encontrá-la) |
| Remixar a construção de outra pessoa | [Bifurcar: torne-a sua](04-PublishingAndForking.md#bifurcar-torne-a-sua) |
| Construir com um amigo, ao vivo | [Construir comigo](02-TheEditor.md#construir-comigo-construir-juntos-ao-vivo) |
| Passear com amigos | [Passear aqui comigo](03-WorldView.md#passear-aqui-comigo--trazer-amigos-para-este-mundo) |
| Mudar a aparência do meu avatar | [Avatares e presença](06-AvatarsAndPresence.md#personalizando-seu-avatar) |
| Fazer backup do meu trabalho, ou levá-lo para outro dispositivo | [Seus dados](13-YourData.md) |
| Consultar uma tecla ou um controle do mouse | [Referência de controles](ControlsReference.md) |
| Consertar algo que não está funcionando | [Perguntas frequentes](FAQ.md) |

Tudo aqui descreve o produto como ele funciona hoje; os detalhes internos
do motor estão em [docs/Architecture.md](../../Architecture.md) e no resto
da pasta [docs/](../..) de nível superior (só em inglês).

## Jogar (leia em ordem)

Tudo o que você precisa para construir, compartilhar, remixar e passear
com amigos.

1. **[Primeiros passos](01-GettingStarted.md)** — abra o app, oriente-se
   no menu, coloque seu primeiro bloco e escolha um nome só na hora de
   publicar.
2. **[O Editor](02-TheEditor.md)** — o kit de construção: ferramentas,
   seleção, transformações, cores dos blocos, grupos, as estruturas da
   Biblioteca de construção e suas próprias plantas, instâncias de
   estruturas, e o título/descrição/licença de uma criação.
3. **[Visão do mundo](03-WorldView.md)** — o mundo 3D compartilhado
   onde vive cada construção publicada: andar e voar por aí, encontrar e
   olhar coisas, **Construir aqui**, **Passear aqui comigo**, os
   moradores e **Editar uma cópia** para levar algo ao Editor. As
   ferramentas de rede ficam em **Mostrar ferramentas avançadas**.
4. **[Publicar e remixar](04-PublishingAndForking.md)** — publicar e
   compartilhar um link, escolher para onde suas construções vão,
   licenças, remixar, o **Explorar** e suas construções prontas, o
   desafio semanal e sua praça, e as árvores genealógicas. Para tudo
   para onde uma construção pode ir, veja [Distribuindo seu
   trabalho](Distribution.md).
5. **[Avatares e presença](06-AvatarsAndPresence.md)** — personalizar seu
   avatar, quem pode ver você, caminhar, perspectivas de câmera, veículos,
   animais e seu inventário.
6. **[Seus dados](13-YourData.md)** — fazer backup de tudo o que este
   navegador guarda em um único arquivo criptografado e restaurá-lo, as
   exportações menores e onde este dispositivo registrou a distribuição das
   suas publicações.

## Avançado

A maquinaria por baixo: sua identidade em detalhe, conexões diretas com
outras pessoas, as redes para onde uma construção pode ir e as
ferramentas experimentais. Você não precisa de nada disso para jogar.

- **[Seu nome e sua identidade](05-IdentityAndLogin.md)** — seu nome e a
  identidade criptográfica por trás dele, o cofre (bloquear/desbloquear), o backup dela com
  exportação/importação e o gerenciamento de identidades em **Minhas
  identidades**.
- **[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)** —
  conectar-se diretamente a outras pessoas, lembrar, fazer amizade, seguir,
  bloquear, reconexão automática e seu próprio relay TURN.
- **[Conversas](08-ChatAndConversations.md)** — mensagens diretas, só
  entre amigos, entrega offline, confirmações de leitura e chamadas de voz.
- **[Publicações e evidências externas](09-PublicationsAndEvidence.md)** —
  a camada técnica e opcional: declarações assinadas de autoria e de nomes
  de lugares, a página Publicações, comentários e o que o seu dispositivo
  guarda (Snapshot local). Partes da página são *experimentais*, e estão
  marcadas assim.
- **[Configurações de rede](10-NetworkSettings.md)** — gateways, relays,
  provedores de armazenamento e de anúncio, e servidores de conexão entre
  pares.
  Do que cada rede precisa está resumido em
  [Distribuindo seu trabalho](Distribution.md#do-que-cada-rede-precisa).
- **[Evidências e armazenamento](11-EvidenceAndStorage.md)** — guardar
  conteúdo no IPFS ou no Arweave, posicionamentos de snapshot, ancorar no
  Arweave e, de forma *experimental*, as demais evidências externas, os
  fluxos de carteira do Bitcoin e da Base, pinning remoto no IPFS, o Steem
  e o Blurt. [Distribuindo seu trabalho](Distribution.md) mostra como tudo
  isso se encaixa.
- **[Arquivo e conquistas](12-ArchiveAndLeaderboards.md)** —
  *experimental*. O arquivo de observações, referências entre publicações
  e conquistas.

## Referência

- **[Distribuindo seu trabalho](Distribution.md)** — tudo o que
  você pode colocar em redes descentralizadas (seus Mundos, declarações de
  autoria e de nomes de lugares, comentários, âncoras), os três papéis que
  uma rede cumpre (Conteúdo, Anúncio / descoberta, Prova / ancoragem), do
  que cada rede precisa e links para os guias com os detalhes.
- **[Perguntas frequentes](FAQ.md)** — respostas curtas às dúvidas mais
  comuns: compartilhamento, licenças, frases secretas perdidas, mudar para
  outro dispositivo, caminhar com seu avatar e reconectar-se com amigos.
- **[Referência de controles](ControlsReference.md)** — cada interação de
  mouse e teclado no Editor e na Visão do mundo, em uma única tabela de
  consulta. Se esta página e a Paleta de comandos do app (`Ctrl/Cmd+K`)
  discordarem, a Paleta está certa e esta página tem um erro — por favor,
  informe.
- **[Gizmo de transformação interativo](InteractiveTransformGizmo.md)** —
  como mover e girar sua seleção arrastando direto na área de visualização:
  alças, o pivô, o encaixe, confirmar, cancelar, desfazer e como os grupos
  se comportam.

## Onde você constrói, onde você explora

O Editor é o único lugar onde se constrói no ForkBuild; a Visão do mundo é
uma superfície de exploração somente leitura:

- **Editor** (**Construir** no menu) — seu espaço de trabalho particular.
  Coloque blocos da Biblioteca de construção, selecione-os e mova-os ou
  gire-os com o teclado ou com o gizmo. Salve, abra e publique construções
  pela barra de ferramentas.
- **Visão do mundo** (**Passear** no menu, ou **Explorar** em qualquer
  construção) — o mundo compartilhado. Ande ou voe entre construções
  publicadas, pesquise e explore o que há ao seu redor, caminhe com seu
  avatar sobre edifícios e terreno, e use **Editar uma cópia** para abrir
  no Editor o que encontrou, pronto para continuar a construção.

Tudo o que você faz no Editor é um passo que pode ser desfeito, e
`Ctrl/Cmd+Z` o desfaz.

## Colaboração e exploração

O ForkBuild oferece colaboração com presença no mundo e descoberta:

- **Caminhe e navegue** — use as teclas WASD para caminhar com seu avatar
  por construções e terreno, pular, escalar e explorar espaços verticais.
- **Construa junto** — **Construir comigo**, no Editor, cria um link que
  abre a sua construção no Editor de um amigo, para vocês construírem
  juntos, ao vivo, cada um vendo os blocos do outro aparecerem e para onde
  ele está apontando (veja [O
  Editor](02-TheEditor.md#construir-comigo-construir-juntos-ao-vivo)). Na
  Visão do mundo, veja os avatares de outros construtores e no que estão
  trabalhando; depois use **Editar uma cópia** para levar ao Editor algo que
  você encontrou e continuar a construção você mesmo.
- **Descubra o mundo** — use a bússola, com marcadores de lugar conforme o
  contexto, para encontrar estruturas próximas e elementos do terreno como
  florestas, rios e campos.
- **Siga colaboradores** — trave sua câmera para seguir o avatar de alguém
  enquanto essa pessoa se move pelo mundo.

Tudo o que você vê é derivado da semente determinística do mundo —
terreno, ecologia e hidrologia são calculados da mesma forma para todos,
criando um lugar compartilhado coerente sem guardar dados extras.

## Estruturas e plantas reutilizáveis

Além dos blocos individuais, a Biblioteca de construção do Editor permite
construir com estruturas inteiras de uma vez — vinte e duas prontas, em cinco
categorias, mais tudo o que você mesmo salvar:

- **Posicione** uma estrutura direto no que você está construindo, ou
  **bifurque** uma em um documento novo só dela.
- **Salve as suas próprias** construções como estruturas reutilizáveis em
  **Minhas estruturas**, sua biblioteca pessoal de plantas.
- **Exporte e importe** uma planta como um arquivo portátil para
  compartilhá-la com outra pessoa ou levá-la a outro dispositivo.

Veja [O Editor](02-TheEditor.md#estruturas-compor-bifurcar-e-sua-biblioteca-pessoal)
para o passo a passo completo.
