<!-- translation-of: docs/user/13-YourData.md source-hash: 8347bc85df3e2e3a -->
# 13 — Seus dados

<!-- languages -->
[English](../13-YourData.md) · [Deutsch](../de/13-YourData.md) · [Español](../es/13-YourData.md) · [Français](../fr/13-YourData.md) · [Bahasa Indonesia](../id/13-YourData.md) · [日本語](../ja/13-YourData.md) · [한국어](../ko/13-YourData.md) · **Português (Brasil)**
<!-- /languages -->

O ForkBuild não tem contas nem servidor que guarde seu trabalho. Tudo o que
ele guarda fica neste navegador, neste dispositivo: seus documentos,
identidades e as chaves privadas delas, estruturas, publicações, pares e
amigos, histórico de conversas e configurações. **Limpar os dados deste site
no navegador apaga tudo isso para sempre**, e o mesmo acontece se você
desinstalar o navegador ou perder o dispositivo.

A página **Seus dados** (**Seus dados** no menu superior) é onde você guarda
uma cópia.

## Neste dispositivo

A primeira seção lista o que está guardado, por tipo, e quanto espaço ocupa.
As contagens são entradas de armazenamento, não documentos: um documento
salvo e a lista de documentos são duas entradas, por exemplo.

Se aparecer **O navegador pode remover estes dados quando o disco estiver
cheio.**, clique em **Pedir ao navegador para mantê-los**. Os navegadores
costumam concordar depois que você adiciona o site aos favoritos, o instala
ou o usa com frequência. Isso só protege contra o navegador fazer uma
limpeza por conta própria: limpar os dados do site continua apagando tudo.

## Fazendo backup

1. Escolha uma **frase secreta do backup** (pelo menos 8 caracteres) e
   digite-a duas vezes.
2. Deixe **Incluir construções baixadas de outras pessoas** desmarcado, a
   menos que você as queira: elas podem ser grandes e em geral dá para
   buscá-las de novo. Suas próprias publicações sempre entram.
3. Clique em **Fazer backup em um arquivo**. O navegador baixa um arquivo
   `forkbuild-backup-<data>.forkbuild-backup`.

O arquivo contém tudo o que a página listou, criptografado com a frase
secreta do backup. É seguro guardá-lo num armazenamento em nuvem ou num pen
drive, mas **não há como abri-lo sem essa frase secreta**, então guarde os
dois num lugar onde não vá perdê-los. A frase secreta do backup é separada
das frases secretas das suas identidades: cada identidade lá dentro continua
protegida pela sua própria.

O backup não inclui com qual identidade você entrou. Depois de restaurar,
você entra de novo.

Além de **Fazer backup em um arquivo**, a mesma seção pode:

- **Compartilhar backup…** (celulares, tablets e alguns computadores): abre
  o menu de compartilhamento do seu dispositivo, para você salvar o arquivo
  num drive na nuvem, enviá-lo por e-mail ou levá-lo para outro dispositivo.
  Se o menu de compartilhamento não abrir no primeiro toque (a criptografia
  levou mais tempo do que o navegador permite), toque em **Compartilhar
  backup** de novo: o backup está pronto e sai na hora.
- **Fazer backup em "pasta"**: depois que você escolher uma pasta de backup
  (abaixo).

**Lembrar a chave de backup neste dispositivo** aparece depois que você
digita uma frase secreta. Marque para fazer os próximos backups sem digitar a
frase secreta: os botões de um clique e os backups automáticos abaixo usam
essa chave. O ForkBuild não guarda a frase secreta em si, só uma chave feita
a partir dela, que o navegador deixa o ForkBuild usar para fazer backups e
nunca mostra a ninguém, e que não consegue abrir um backup. Os backups feitos
com ela continuam abrindo com sua frase secreta. **Esquecer a chave de
backup** a remove.

## Lembretes

Se este dispositivo está há um tempo sem backup, uma barra embaixo do menu,
em todas as páginas, avisa isso, com **Fazer backup agora** e **Lembrar
daqui a uma semana**:

- Ela aparece pela primeira vez uma semana depois que este navegador começa
  a guardar seu trabalho (documentos, identidades, estruturas, pares ou
  conversas), se você nunca fez backup.
- Depois disso, ela aparece quando o último backup é mais antigo do que o
  que você escolheu em **Lembretes e backups automáticos → Lembrar-me de
  fazer backup**: toda semana, a cada 2 semanas, todo mês (o padrão) ou a
  cada 3 meses, ou nunca.
- **Fazer backup agora** faz o backup na sua pasta de backup com um clique,
  quando você configurou uma com uma chave lembrada; senão, abre esta
  página.

A mesma seção mostra quando foi feito o último backup e para onde.

## Fazendo backup numa pasta

No Chrome e no Edge num computador, **Escolher pasta…** deixa você escolher
uma pasta para os backups. Escolha uma que seu armazenamento em nuvem
sincroniza (Dropbox, OneDrive, iCloud Drive, Google Drive) ou um pen drive,
e todo backup sai deste dispositivo sem você precisar mover arquivos. O
backup de cada dia é um arquivo,
`forkbuild-backup-<data>.forkbuild-backup`; um segundo backup no mesmo dia
substitui o arquivo daquele dia, e o ForkBuild mantém ali os dez backups mais
novos dele, sem nunca mexer em mais nada da pasta.

O navegador pergunta se o ForkBuild pode salvar na pasta da primeira vez, e
pode perguntar de novo numa visita futura. **Parar de usar esta pasta** a
esquece; os backups que já estão lá continuam.

**Fazer backup na pasta automaticamente uma vez por dia enquanto o ForkBuild
estiver aberto** precisa de uma pasta e de uma chave lembrada. O ForkBuild
então confere um minuto depois de abrir, e a cada hora, e faz backup se o
último tiver um dia. Ele nunca pede permissão sozinho: se o navegador quiser
perguntar de novo, os backups automáticos esperam até você mesmo fazer um
backup na pasta. Um backup automático que falhou aparece nesta página.

Outros navegadores não conseguem salvar numa pasta. Use **Compartilhar
backup…** neles, ou baixe o arquivo e mova-o você mesmo.

## Restaurando

Feche antes o ForkBuild em qualquer outra aba: uma aba deixada aberta pode
gravar de volta os dados antigos dela.

1. Em **Restaurar**, escolha o arquivo de backup e digite a frase secreta
   dele, depois clique em **Abrir backup**. Uma frase secreta errada é
   recusada e nada muda. O ForkBuild mostra quando o backup foi feito e o
   que ele contém.
2. Escolha como restaurar:
   - **Adicionar o que este dispositivo não tem** (o padrão): tudo o que está
     no backup e não está neste dispositivo é adicionado. Onde os dois têm
     algo, como o mesmo documento ou uma configuração, a versão deste
     dispositivo é mantida.
   - **Substituir tudo neste dispositivo pelo backup**: apaga primeiro o que
     o ForkBuild guardou aqui e depois restaura o backup exatamente. Marque a
     confirmação para habilitar.
3. Clique em **Restaurar**. A página recarrega quando termina. Um
   dispositivo restaurado conta como tendo backup na data em que o backup
   foi feito.

Um backup feito por uma versão mais nova do ForkBuild não pode ser aberto por
uma mais antiga; atualize esta cópia antes. Tudo o que houver num backup e
esta versão não conhecer é ignorado, e o resultado diz quantos foram.

## Exportações menores

Para levar um tipo de coisa, ou compartilhá-lo, use a exportação na página
dele:

| O quê | Exportar | Importar |
|---|---|---|
| Um documento | **Exportar** na barra de ferramentas do Editor | **Importar** na barra de ferramentas do Editor |
| Todos os documentos salvos | **Exportar todos os documentos**, no fim do menu **Recentes** do Editor | **Importar** na barra de ferramentas do Editor |
| Uma estrutura | **Exportar planta** no menu **⋮** do cartão dela | **Importar planta** ao lado de **Minhas estruturas** |
| Todas as estruturas | **Exportar tudo** ao lado de **Minhas estruturas** | **Importar planta** ao lado de **Minhas estruturas** |
| Uma identidade | **Exportar** em **Minhas identidades** | **Importar identidade** em **Minhas identidades** |

Importar todos os documentos traz de volta os que este dispositivo não tem,
mantém sem mudanças os que ele já tem e salva uma cópia ao lado de qualquer
um que ele tenha em outra versão. Importar todas as estruturas ignora os
projetos que já estão em Minhas estruturas. Uma identidade exportada também
leva a revogação, a sucessora e as autorizações de dispositivos dela, então
uma identidade revogada volta revogada.

Histórico de conversas, amigos, pessoas seguidas e configurações só vão
junto num backup completo.

## Suas publicações

Uma criação que você **Publica** fica guardada só neste dispositivo, até você
distribuí-la (veja [Publicar e bifurcar](04-PublishingAndForking.md)). O
cartão dela no Repositório diz onde este dispositivo registrou a
distribuição, por exemplo **Guardado no IPFS · Anunciado no Nostr**: para
onde a construção ou a Declaração assinada dela foi enviada (IPFS, Arweave
ou Steem) e onde foi anunciada (Nostr, Arweave ou Steem). Pare o ponteiro
sobre um nome para ver o endereço ou o id do anúncio.

A linha só diz o que este dispositivo tem registrado. Ela não confere se um
envio continua disponível (uma cópia no IPFS só dura enquanto alguém a
mantiver fixada) e uma distribuição feita de outro dispositivo não é
conhecida aqui. Sem registro, o cartão diz **Nenhuma distribuição registrada
neste dispositivo.**: faça um backup, ou abra a criação na Visão do mundo com
**Explorar** e use **Distribuir** em **Meu Mundo compartilhado**.
Compartilhá-la com pares conectados não é registrado como distribuição: eles
só mantêm uma cópia enquanto quiserem.

## Contagem diária de visitantes

No fim da página, **Contagem diária de visitantes** controla a única coisa
que o ForkBuild envia sem que nenhum recurso precise dela. Uma vez por dia, o
site oficial avisa o GoatCounter de que mais um navegador o abriu. A
solicitação não identifica nenhuma página, construção ou pessoa e não grava
cookies, e qualquer pessoa pode ver os totais no painel público. Desmarque
**Contar este navegador** para interromper; a escolha é salva na hora, só
neste navegador. Um navegador que envia Global Privacy Control ou Do Not
Track nunca é contado, e o interruptor avisa isso. Veja
[Privacidade](Privacy.md#contagem-de-visitantes) para saber exatamente o
que é enviado.
