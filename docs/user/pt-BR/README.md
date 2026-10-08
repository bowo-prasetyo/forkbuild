<!-- translation-of: docs/user/README.md source-hash: d9d89f42b403877b -->
# Documentação do ForkBuild para usuários

<!-- languages -->
[English](../README.md) · [Deutsch](../de/README.md) · [Español](../es/README.md) · [Français](../fr/README.md) · [Bahasa Indonesia](../id/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · **Português (Brasil)**
<!-- /languages -->

Guias práticos para usar o ForkBuild no navegador. Tudo aqui descreve o
produto como ele funciona hoje; os detalhes internos do motor estão em
[docs/Architecture.md](../../Architecture.md) (em inglês) e no restante da
pasta [docs/](../..) de nível superior.

## Comece aqui (leia em ordem)

1. **[Primeiros passos](01-GettingStarted.md)** — abra o app, entre e
   coloque seu primeiro bloco.
2. **[O Editor](02-TheEditor.md)** — o kit de construção: ferramentas,
   seleção, transformações, cores dos blocos, grupos, as estruturas da
   Biblioteca de construção e suas próprias plantas, instâncias de
   estruturas, e o título/descrição/licença de uma criação.
3. **[Visão do mundo](03-WorldView.md)** — o espaço 3D compartilhado e
   somente leitura onde vive toda criação publicada: voar por ele,
   encontrar e inspecionar coisas, **Editar uma cópia** para levar algo ao
   Editor, World Encounters compartilhados pelos seus pares, distribuir sua
   própria publicação a partir de **Meu Mundo compartilhado**, comentários e
   notificações.
4. **[Publicar e bifurcar](04-PublishingAndForking.md)** — publicação,
   licenças, bifurcação, o catálogo do Repositório e a distribuição de uma
   publicação direto do Editor.
   Para tudo o que você pode distribuir e para onde pode ir, veja
   [Distribuindo seu trabalho](Distribution.md).
5. **[Identidade e login](05-IdentityAndLogin.md)** — sua identidade
   criptográfica, o cofre (bloquear/desbloquear), o backup dela com
   exportação/importação e o gerenciamento de identidades em **Minhas
   identidades**.
6. **[Avatares e presença](06-AvatarsAndPresence.md)** — personalizar seu
   avatar, quem pode ver você, caminhar, perspectivas de câmera, veículos,
   animais e seu inventário.
7. **[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)** —
   conectar-se diretamente a outras pessoas, lembrar, fazer amizade, seguir,
   bloquear, reconexão automática e seu próprio relay TURN.
8. **[Conversas](08-ChatAndConversations.md)** — mensagens diretas, só
   entre amigos, entrega offline, confirmações de leitura e chamadas de voz.
9. **[Publicações e evidências externas](09-PublicationsAndEvidence.md)** —
   a camada técnica e opcional: declarações assinadas de autoria e de nomes
   de lugares, a página Publicações, comentários e o que o seu dispositivo
   guarda (Snapshot local). Partes da página são *experimentais*, e estão
   marcadas assim.
10. **[Configurações de rede](10-NetworkSettings.md)** — gateways, relays,
    provedores de armazenamento e de anúncio, e servidores de conexão entre
    pares.
    Do que cada rede precisa está resumido em
    [Distribuindo seu trabalho](Distribution.md#do-que-cada-rede-precisa).
11. **[Evidências e armazenamento](11-EvidenceAndStorage.md)** — guardar
    conteúdo no IPFS ou no Arweave, ancorar no Arweave e, de forma
    *experimental*, as demais evidências externas, os fluxos de carteira do Bitcoin e da Base, posicionamentos de
    snapshot, pinning remoto no IPFS, o Steem e o Blurt.
    [Distribuindo seu trabalho](Distribution.md) mostra como
    tudo isso se encaixa.
12. **[Arquivo e classificações](12-ArchiveAndLeaderboards.md)** —
    *experimental*. O arquivo de observações, referências entre publicações,
    conquistas, rótulos de editores e as páginas de classificação.
13. **[Seus dados](13-YourData.md)** — fazer backup de tudo o que este
    navegador guarda em um único arquivo criptografado e restaurá-lo, as
    exportações menores e onde este dispositivo registrou a distribuição das
    suas publicações.

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

- **Editor** (`/editor`) — seu espaço de trabalho particular. Coloque blocos
  da paleta, selecione-os e transforme-os com o teclado ou com o gizmo.
  Salve, carregue e publique documentos pela barra de ferramentas.
- **Visão do mundo** (`/world/:id`) — o mundo espacial compartilhado. Voe
  entre mundos publicados, pesquise e explore o que há ao seu redor,
  inspecione blocos e estruturas posicionadas, caminhe com seu avatar sobre
  estruturas e terreno, e use **Editar uma cópia** para abrir no Editor o que
  encontrou, pronto para continuar a construção.

Tudo o que você faz no Editor é um passo que pode ser desfeito, e
`Ctrl/Cmd+Z` o desfaz.

## Colaboração e exploração

O ForkBuild oferece colaboração com presença no mundo e descoberta:

- **Caminhe e navegue** — use as teclas WASD para caminhar com seu avatar
  por construções e terreno, pular, escalar e explorar espaços verticais.
- **Construa junto** — veja os avatares de outros construtores e entenda no
  que estão trabalhando pela percepção espacial; depois use **Editar uma
  cópia** para levar ao Editor algo que você encontrou e continuar a
  construção você mesmo.
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
construir com estruturas inteiras de uma vez — vinte prontas, em cinco
categorias, mais tudo o que você mesmo salvar:

- **Posicione** uma estrutura direto no que você está construindo, ou
  **bifurque** uma em um documento novo só dela.
- **Salve as suas próprias** construções como estruturas reutilizáveis em
  **Minhas estruturas**, sua biblioteca pessoal de plantas.
- **Exporte e importe** uma planta como um arquivo portátil para
  compartilhá-la com outra pessoa ou levá-la a outro dispositivo.

Veja [O Editor](02-TheEditor.md#estruturas-compor-bifurcar-e-sua-biblioteca-pessoal)
para o passo a passo completo.
