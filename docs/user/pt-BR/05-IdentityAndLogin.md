<!-- translation-of: docs/user/05-IdentityAndLogin.md source-hash: b7e773ae656ae805 -->
# 05 — Identidade e login

<!-- languages -->
[English](../05-IdentityAndLogin.md) · [Deutsch](../de/05-IdentityAndLogin.md) · [Español](../es/05-IdentityAndLogin.md) · [Français](../fr/05-IdentityAndLogin.md) · [Bahasa Indonesia](../id/05-IdentityAndLogin.md) · [日本語](../ja/05-IdentityAndLogin.md) · [한국어](../ko/05-IdentityAndLogin.md) · **Português (Brasil)**
<!-- /languages -->

<!-- stale -->
> **Nota:** A versão em inglês desta página mudou desde a tradução, então esta tradução pode estar desatualizada. Consulte a [versão em inglês](../05-IdentityAndLogin.md).
<!-- /stale -->

O ForkBuild não tem senhas nem servidor central de contas. **Sua identidade é
um par de chaves criptográficas guardado neste navegador** — a mesma chave
que assina tudo o que você constrói, publica, envia em mensagem ou move. Este
guia mostra como criar, proteger e fazer backup dessa identidade.

## Criando uma identidade

Clique em **Entrar** na barra superior. A caixa de diálogo lista todas as
identidades que este dispositivo já tem — clique em uma para usá-la — ou
crie uma nova:

1. Digite um **nome de exibição**. É o que as outras pessoas veem; você pode
   ter várias identidades com nomes diferentes.
2. Digite uma **frase secreta** (pelo menos 8 caracteres) e depois digite de
   novo para confirmar.
3. Clique em **Criar e entrar**.

Isso cria uma identidade **protegida** (mostrada com um 🔒): a chave fica
criptografada quando guardada e só é descriptografada, na memória, depois que
você digita a frase secreta.

Você pode deixar a frase secreta em branco, mas só marcando **Criar sem
frase secreta**. Isso cria uma identidade **desprotegida**: a chave fica
guardada sem criptografia neste navegador, pronta para usar sem nunca pedir
nada a você, e qualquer coisa que consiga ler o armazenamento deste site pode
assinar como você. Você pode protegê-la depois em **Minhas identidades**.

> Não há redefinição de senha. Para uma identidade protegida, a frase secreta
> *é* o único jeito de descriptografar a chave — se você a perder, aquela
> identidade se foi, até para o próprio ForkBuild. Escolha uma que você
> consiga guardar.

## O cofre: bloqueado ou desconectado

A chave descriptografada de uma identidade protegida fica numa coisa chamada
**cofre**. O cofre pode estar **bloqueado** ou **desbloqueado**, e essa é
uma pergunta realmente diferente de você ter entrado ou não:

- **Conectado, desbloqueado** — tudo funciona normalmente.
- **Conectado, bloqueado** (🔒 ao lado do seu nome, no canto superior
  direito) — você continua sendo você e ainda pode navegar, construir e
  salvar, mas tudo o que precisa de uma assinatura nova (publicar, ficar
  visível, entrar numa sala) falha com uma mensagem de "identidade
  bloqueada" até você desbloquear. Clique em **Desbloquear** ao lado do seu
  nome para digitar a frase secreta e tente de novo.
- **Desconectado** — você não é ninguém; abra **Entrar** para escolher ou
  desbloquear uma identidade de novo.

Um cofre se bloqueia automaticamente **15 minutos depois de você
desbloqueá-lo**, esteja você usando o app ou não (não é um tempo de
inatividade), ou sempre que você mesmo clicar em **Bloquear** em **Minhas
identidades**. Recarregar a página sempre deixa as identidades protegidas
bloqueadas — a chave descriptografada nunca é gravada em disco, só fica na
memória —, mesmo que o app ainda lembre com quem você tinha entrado.

## Gerenciando identidades — a página Minhas identidades

Abra **Minhas identidades** na barra superior para ver todas as identidades
que este dispositivo tem, cada uma com seu estado de bloqueio, independente
de com qual você entrou. Daqui você pode:

- **Criar** uma identidade nova (como na caixa de diálogo de login).
- **Proteger com frase secreta** — aparece numa identidade desprotegida
  (marcada ⚠ Desprotegida). Criptografa a chave existente; a identidade em
  si não muda, e fica bloqueada até você desbloqueá-la.
- **Bloquear / Desbloquear** cada identidade separadamente.
- **Mudar frase secreta** — troca a frase secreta de uma identidade
  protegida (só as protegidas oferecem isso). A identidade em si — o ID, a
  chave pública e todas as assinaturas que ela já fez — nunca muda.
- **Exportar** — fazer backup.
- **Importar** — restaurar ou copiar uma a partir de um arquivo de backup.
- **Declarar sucessora / Revogar** — marcar uma identidade como aposentada
  em favor de outra (cole o ID `did:key:z…` da sucessora), ou revogá-la de
  vez, para sempre. Declarar uma sucessora não revoga nada por si só —
  revogue separadamente quando a troca deve passar a valer. Para uma
  identidade protegida e bloqueada, as duas ações pedem a frase secreta dela,
  e assinar com ela a desbloqueia, exatamente como desbloquear você mesmo.

Só um destes formulários (Desbloquear, Exportar, Mudar frase secreta,
Declarar sucessora, Revogar) fica aberto de cada vez, num único cartão de
identidade. Abrir outro, pressionar **Cancelar** ou concluir a ação o fecha e
limpa todos os campos dele, para que uma frase secreta digitada nunca fique
esquecida na página. Os gerenciadores de senha do navegador são avisados para
não preencher automaticamente os campos desta página.

Não há como renomear nem excluir — as identidades são feitas para durar; se
quiser parar de usar uma, revogue-a.

## Fazendo backup de uma identidade (exportar e importar)

Sua identidade só existe neste dispositivo, a menos que você faça um backup.
**Exportar** gera um arquivo para baixar que contém sua chave privada
criptografada:

- Exportar sempre pede a frase secreta da identidade, mesmo que ela esteja
  desbloqueada.
- Se a identidade é desprotegida, exportar pede que você escolha na hora uma
  frase secreta (pelo menos 8 caracteres), só para proteger a cópia no
  arquivo.

**Importar** traz uma identidade exportada para outro dispositivo ou
navegador:

1. Clique em **Importar identidade** e escolha o arquivo exportado (ou cole o
   JSON dele na caixa abaixo). O ForkBuild mostra antes uma prévia segura —
   nome, ID, algoritmo e se você já a tem — sem descriptografar nada.
2. Digite a frase secreta da exportação para importá-la de fato.

Uma identidade importada sempre chega **bloqueada**, e você não entra
automaticamente com ela — desbloqueie-a em Minhas identidades ou na caixa de
diálogo de login, como qualquer outra identidade protegida.

O arquivo também leva os registros assinados do ciclo de vida da identidade:
a revogação dela, a sucessora que ela declarou e os dispositivos que ela
autorizou ou deixou de autorizar. Importar os restaura, então uma identidade
revogada volta revogada, e não ativa. Importar um arquivo mais novo de uma
identidade que você já tem adiciona os registros que faltam ao dispositivo e
não muda mais nada.

Para fazer backup de todas as identidades de uma vez, junto com todo o
resto, use [Seus dados](13-YourData.md).

Arquivos exportados por versões anteriores do ForkBuild continuam sendo
importados. Os arquivos exportados agora usam um formato mais novo que as
versões anteriores não conseguem ler, então atualize o ForkBuild no outro
dispositivo antes.

## Chaves de versões anteriores

As identidades protegidas criadas antes desta versão usavam um formato de
criptografia mais fraco. Elas ainda desbloqueiam com a mesma frase secreta,
e na primeira vez que você desbloquear uma (ou exportá-la), o ForkBuild a
criptografa de novo no formato atual. Nada na identidade em si muda.

> Guarde em segurança tanto o arquivo exportado *quanto* a frase secreta
> dele. Um sem o outro não serve para nada — e perder os dois significa que
> aquela identidade, e tudo o que só ela podia assinar, não tem mais
> recuperação.

## Frase secreta errada

Cinco tentativas erradas (ao desbloquear, exportar ou mudar a frase
secreta — elas dividem uma única contagem por identidade) ativam uma espera
de 30 segundos; a mensagem de erro conta as tentativas restantes e depois o
tempo de bloqueio restante. A contagem zera ao recarregar.

## E agora?

Agora que você entrou, configure como os outros veem você em
**[Avatares e presença](06-AvatarsAndPresence.md)**, ou encontre pessoas
para construir junto em
**[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)**.
