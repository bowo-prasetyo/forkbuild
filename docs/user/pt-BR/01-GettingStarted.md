<!-- translation-of: docs/user/01-GettingStarted.md source-hash: a742c831b5f54e8b -->
# 01 — Primeiros passos

<!-- languages -->
[English](../01-GettingStarted.md) · [Deutsch](../de/01-GettingStarted.md) · [Español](../es/01-GettingStarted.md) · [Français](../fr/01-GettingStarted.md) · [Bahasa Indonesia](../id/01-GettingStarted.md) · [日本語](../ja/01-GettingStarted.md) · [한국어](../ko/01-GettingStarted.md) · **Português (Brasil)**
<!-- /languages -->

Boas-vindas! Este guia leva você de "acabei de abrir o app" a "construí
alguma coisa" em uns cinco minutos.

## Abrindo o ForkBuild

O ForkBuild funciona em qualquer navegador atual. Abra a URL hospedada e
você vai chegar à tela **Início**. Para rodar sua própria cópia, sirva a
pasta por HTTP (por exemplo `python3 -m http.server 8000`, e depois abra
<http://localhost:8000/>): abrir o `index.html` direto do disco não funciona,
porque os navegadores não carregam os módulos dele a partir de uma página
`file://`. O servidor de encontro padrão só atende o site hospedado, então
uma cópia sua não consegue usá-lo para encontrar pessoas; conecte-se com
convites ou configure um servidor de encontro próprio (veja
[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)).

A tela **Início** mostra uma pequena vila girando em 3D e oferece três
formas de começar: **Experimente agora: comece com uma casa** abre uma casa
pronta no Editor como sua própria cópia, pronta para mudar; **Começar do
zero** abre o Editor em um terreno vazio; e **Explorar construções** abre o
Repositório. Em **Comece com uma construção pronta**, cada cartão (um
castelo, uma ilha do porto, uma praça da vila, uma casa, um moinho e uma
ponte) abre sua própria cópia daquela construção do mesmo jeito; o
Repositório, Meus mundos e **Novo** no Editor oferecem as mesmas
construções. Nada é publicado nem enviado a lugar nenhum até você decidir.

A barra no topo está sempre visível:

`ForkBuild Início Editor Repositório Meus mundos Meu avatar Minhas identidades Pares Seguindo Conversas Publicações Configurações de rede Seus dados Idioma Sobre 🔔 [Entrar]`

- **Início** — a página inicial
- **Editor** — onde você constrói
- **Repositório** — navegue pelas criações publicadas por todos
- **Meus mundos** — os Mundos que você realmente visitou neste dispositivo;
  veja [Meus mundos](03-WorldView.md#meus-mundos--os-mundos-em-que-você-realmente-esteve)
- **Meu avatar** — como os outros veem você na Visão do mundo; veja
  [Avatares e presença](06-AvatarsAndPresence.md)
- **Minhas identidades** — as identidades criptográficas guardadas neste
  dispositivo; veja [Identidade e login](05-IdentityAndLogin.md)
- **Pares** — as pessoas com quem você está conectado, que você conhece ou
  de quem é amigo; veja
  [Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)
- **Conversas** — suas mensagens diretas; veja
  [Conversas](08-ChatAndConversations.md)
- **Publicações** — declarações assinadas de autoria e de nomes de lugares,
  onde guardá-las e anunciá-las e (*experimental*) as evidências externas
  delas; veja [Publicações e evidências externas](09-PublicationsAndEvidence.md)
- **Configurações de rede** — gateways, relays, provedores e servidores de
  conexão entre pares; veja
  [Configurações de rede](10-NetworkSettings.md)
- **Idioma** — o idioma em que o ForkBuild aparece neste dispositivo. Ele
  segue os idiomas do seu navegador até você escolher um; salvar recarrega a
  página, então salve seu trabalho antes. O ForkBuild está disponível em
  inglês, alemão, espanhol, francês, bahasa indonesia, japonês, coreano e português do Brasil
  (veja [Translating ForkBuild](../../Translating.md), em inglês).
- **Sobre** — informações de versão

## Entrando

Clique em **Entrar** no canto superior direito. O ForkBuild não usa senhas
nem contas centrais — em vez disso, **sua identidade é um par de chaves
criptográficas guardado neste dispositivo**. A caixa de diálogo Entrar lista
todas as identidades que este navegador já tem; clique em uma para usá-la,
ou crie uma nova:

1. Digite um **nome de exibição** — é o que as outras pessoas vão ver.
2. Digite duas vezes uma **frase secreta** de pelo menos 8 caracteres. Ela
   criptografa sua chave neste dispositivo, e não há como redefini-la, então
   escolha uma que você vá guardar. (Para pular essa etapa, marque **Criar
   sem frase secreta**; a chave fica então guardada sem criptografia neste
   navegador.)
3. Clique em **Criar e entrar**.

Pronto — você entrou, e tudo o que construir, publicar ou enviar é assinado
com esta identidade.

O que uma frase secreta protege, bloquear e desbloquear, e o backup da sua
identidade estão em [Identidade e login](05-IdentityAndLogin.md).

## Fazendo o tour

O ForkBuild tem várias áreas principais:

| Área | Para que serve |
|---|---|
| **Editor** | Construir e editar suas próprias criações |
| **Repositório** | Pesquisar, navegar, abrir, bifurcar e explorar criações publicadas |
| **Página do autor** | Ver tudo o que uma pessoa fez (abra clicando no nome de qualquer autor) |
| **Visão do mundo** | Voar pelo mundo compartilhado onde todas as criações vivem em 3D, e pesquisar ou explorar para encontrar coisas |
| **Meu avatar / Pares / Conversas** | Como os outros veem você, com quem você está conectado e suas mensagens diretas — veja os guias indicados acima |

## Colocando seu primeiro bloco

1. Clique em **Editor** na barra superior.
2. Na barra lateral esquerda, confira se a ferramenta **Colocar** está ativa
   (pressione `2`).
3. Na **Biblioteca de construção** logo abaixo, abra a guia **Blocos** e
   clique em um bloco — por exemplo, **Cubo** em **Básicos**.
4. Leve o mouse até a área de visualização 3D. Um **fantasma** translúcido do
   bloco acompanha a grade.
5. **Clique** para colocá-lo.

Parabéns — você construiu seu primeiro bloco! 🎉

### Empilhando blocos

Você não precisa construir só no chão. Passe o mouse sobre uma **face** de
um bloco existente e o fantasma se encaixa nela — clique para empilhar por
cima ou prender na lateral. É assim que se constroem paredes, torres e
telhados.

## Salvando seu trabalho

Pressione **Ctrl+S** (ou clique em **Salvar** na barra de ferramentas). O
indicador **● Alterações não salvas** passa a mostrar **Salvo**.

Sua criação fica guardada no navegador, então ela continua lá quando você
voltar. Enquanto você edita, o ForkBuild também mantém uma cópia de
recuperação das alterações não salvas e oferece restaurá-la se a página
fechar antes de você salvar.

Os navegadores limitam quanto cada site pode guardar, em geral a uma parte
do disco. Se a parte do ForkBuild encher, salvar e a recuperação param, com
uma mensagem avisando; nada do que você tem aberto se perde. Use
**Exportar** na barra de ferramentas para guardar uma cópia do documento
como arquivo. Na primeira vez que você salva, alguns navegadores perguntam
se o ForkBuild pode manter os dados dele de forma permanente; permitir
impede que o navegador os apague quando o disco estiver cheio.

Você não precisa ter entrado para construir. Entrar importa quando você
publica ou trabalha com outras pessoas: uma criação publicada sem ter
entrado não tem autor nem assinatura, então não pode ser compartilhada com
pares nem distribuída depois. Entre primeiro, depois publique.

## E agora?

- Aprenda o kit de construção completo em **[O Editor](02-TheEditor.md)**.
- Pronto para compartilhar? Vá para
  **[Publicar e bifurcar](04-PublishingAndForking.md)**.
- Configure sua identidade, seu avatar e suas conexões em
  **[Identidade e login](05-IdentityAndLogin.md)**,
  **[Avatares e presença](06-AvatarsAndPresence.md)** e
  **[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)**.
