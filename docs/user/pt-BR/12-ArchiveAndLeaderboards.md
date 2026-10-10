<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 9ecc6d131bdffddc -->
# 12 — Arquivo e conquistas

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · [Deutsch](../de/12-ArchiveAndLeaderboards.md) · [Español](../es/12-ArchiveAndLeaderboards.md) · [Français](../fr/12-ArchiveAndLeaderboards.md) · [Bahasa Indonesia](../id/12-ArchiveAndLeaderboards.md) · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [한국어](../ko/12-ArchiveAndLeaderboards.md) · **Português (Brasil)**
<!-- /languages -->

> **Experimental.** Tudo aqui pode mudar ou ser removido numa versão
> futura, e o que produz pode não ser aproveitado depois. Na página
> Publicações, o painel **Ferramentas de carteira, arquivo e editor** é
> marcado com um selo **Experimental**.

As ferramentas de Bitcoin, Base e IPFS de
[Evidências e armazenamento](11-EvidenceAndStorage.md) registram o que
observam num arquivo durável neste dispositivo. Este guia trata desse
arquivo e do que é construído sobre ele: referências entre publicações e
conquistas.

A maioria destes cartões fica na página Publicações, em **Ferramentas de
carteira, arquivo e editor**, nas guias **Ferramentas de arquivo** e
**Referências e conquistas**. Cada um mostra **Guardado localmente** quando o
que ele guarda sobrevive a uma recarga.

Uma palavra usada em todo o guia: uma **identidade de publicação** é um
registro de Publicação de âncora no Bitcoin ou na Base (veja
[Publicações de âncora no Bitcoin](11-EvidenceAndStorage.md#publicações-de-âncora-no-bitcoin)).
É um registro numa cadeia, não uma pessoa.

## O arquivo de observações de publicações

Um único registro durável, neste dispositivo, dos fatos que as ferramentas
de IPFS, Bitcoin e Base observam. Ele guarda só identidades de publicação e
observações: nunca uma conexão de carteira, uma chave ou uma credencial de
pinning.

### Arquivo de observações

O cartão **Arquivo de observações** mostra quantas **Publicações** e
**Observações** ele guarda.

- **Mostrar arquivo** abre a **Linha do tempo de observações arquivadas**:
  cada publicação e verificação no IPFS, cada transmissão, confirmação e
  prova de conteúdo no Bitcoin e cada observação de inclusão na Base, em
  ordem cronológica, cada uma com o domínio, o estado e (quando cabe) o
  localizador, o txid ou a altura do bloco. Abri-la não contata nenhuma
  rede.
- **Esvaziar arquivo** é o único jeito de remover algo do arquivo; todo o
  resto só acrescenta. Fica desabilitado quando o arquivo está vazio.

### Evidências históricas de âncoras no Bitcoin

Os mesmos fatos do Bitcoin, agrupados por ID de âncora, num cartão da guia
**Ancoragem em blockchain**. **Mostrar âncoras históricas**, e depois um ID
de âncora, mostra o **Histórico de transmissões**, o **Histórico de
confirmações**, o **Histórico de provas de conteúdo**, as **Comparações de
posição na cadeia** e a **Consistência das observações**, com um resumo de
**Evidências combinadas** das cinco contagens. As contagens dizem quanto foi
registrado, não quão confiável isso é.

### Exportando, importando e inspecionando o arquivo

O cartão **Arquivo de publicações** transforma o arquivo num documento JSON:

- **Exportar arquivo** mostra o JSON e um link **Baixar a exportação do
  arquivo**.
- **Importar arquivo** recebe um documento ou um JSON colado e mostra uma
  prévia de quantas publicações e observações ele guarda em relação ao
  arquivo atual. Só **Substituir o arquivo atual** o aplica. Importar
  **substitui** o arquivo atual (não mescla) e não pode ser desfeito. Um
  documento inválido é recusado sem que nada mude.

**Inspecionar um arquivo externo** olha dentro de uma exportação sem
importá-la. Mostra a versão do esquema do documento, a contagem de fatos por
domínio (publicação e verificação no IPFS; transmissão, confirmação, prova
de conteúdo e identidade de publicação no Bitcoin; inclusão e identidade de
publicação na Base), as contagens de fatos locais e importados, os eventos de
importação, a impressão digital dele, e os IDs de âncora no Bitcoin, os
índices de registros no IPFS e os hashes de transação na Base que ele guarda.
Dali:

- **Comparar com o arquivo atual** lista, por domínio, o que está **Igual**,
  **Alterado**, **Só no atual**, **Só no externo** ou tem **Procedência
  diferente**.
- **Revisar a substituição** (depois de uma comparação) mostra uma prévia do
  que a substituição mudaria, com as contagens e as impressões digitais dos
  dois arquivos. O botão **Substituir o arquivo atual** dele é a mesma
  importação de cima. Substituir marca todos os fatos como recém-importados,
  então a impressão digital resultante é diferente da do documento.

### Procedência do arquivo

Mostra de onde vieram os fatos: **Fatos locais** (observados neste
dispositivo) e **Fatos importados** (de um **Substituir o arquivo atual**).
Se você já importou alguma vez, **Importações do arquivo** lista a hora, o
número de fatos e a versão do esquema de cada importação. Nenhum dos dois
tipos é tratado como mais confiável.

### Impressão digital do arquivo

Um resumo SHA-256 de cada fato e etiqueta de procedência do arquivo.
**Copiar impressão digital** o copia. Para comparar com uma impressão digital
de outro lugar (de um par, por exemplo), cole-a em **Comparar com outra
impressão digital** e clique em **Comparar**:

| Resultado | Significado |
|---|---|
| **CORRESPONDE** | Os dois arquivos têm conteúdos idênticos. |
| **DIFERENTE** | Não têm. |
| **INVALID_FINGERPRINT** (impressão digital inválida) | O que você colou não é uma impressão digital SHA-256 de 64 caracteres. |

Uma correspondência só quer dizer que os conteúdos são idênticos, não que
estão corretos, e nada aqui diz qual arquivo é mais novo.

## Referências entre publicações

Registre que uma identidade de publicação aponta para outra.

**Referências entre publicações → Mostrar referências** abre um formulário:
escolha a **Publicação de origem (a que faz a referência)** e a **Publicação
referenciada (a que é apontada)** entre as suas identidades de publicação
conhecidas no Bitcoin e na Base (por exemplo "Bitcoin — a1b2…c3d4 — conteúdo
9f8e…") e clique em **Registrar referência**. Uma publicação não pode fazer
referência a si mesma. As referências só são feitas por você; nada cria uma
automaticamente, nem bifurcar em outro lugar do app.

De propósito, uma referência não se chama bifurcação: ela registra que o
apontamento existe, não o que ele significa (uma bifurcação, uma citação,
uma resposta).

As referências registradas aparecem da mais antiga para a mais nova, com a
cadeia, a identidade curta, o hash do conteúdo de cada lado e quando foi
registrada. Duplicatas ficam como referências separadas.

O **Grafo de referências entre publicações** agrupa as mesmas referências
por publicação: totais de **Arestas**, **Publicações**, **Origens
distintas** e **Referenciadas distintas**, e para cada publicação as
**Referências feitas** e **Referências recebidas**, que se expandem nas
referências individuais. As contagens não são uma classificação.

## Conquistas

Uma identidade de publicação ganha um emblema no momento em que passa de um
limite; não há nada para reivindicar.

**Conquistas → Mostrar conquistas** lista os emblemas ganhos até agora (os
nomes aparecem em inglês no app):

| Emblema | Ícone | Ganho quando |
|---|---|---|
| First publication (primeira publicação) | 🏆 | Seu primeiro registro de publicação de âncora no Bitcoin ou na Base. |
| Bitcoin publisher (editor no Bitcoin) | ₿ | Seu primeiro no Bitcoin. |
| Base publisher (editor na Base) | 🔵 | Seu primeiro na Base. |
| Multi-chain publisher (editor em várias cadeias) | 🌐 | Registros em mais de uma cadeia. |
| Ten publications (dez publicações) | 🔟 | Seu 10º, Bitcoin e Base juntos. |
| One hundred publications (cem publicações) | 💯 | Seu 100º. |

Clique num emblema para ver a **Publicação de origem** (cadeia, hash do
conteúdo, referência na cadeia, hora de criação) e, quando disponível, **Ver
o ciclo de vida da publicação acima**, que leva ao ciclo de vida daquele
registro.

Mais cinco conquistas vêm de referências e ainda não têm emblema: **First
reference created** (primeira referência criada), **First reference
received** (primeira referência recebida), **Referenced by 10
publications** (referenciada por 10 publicações), **Referenced by 100
publications** (referenciada por 100 publicações) e **First cross-chain
reference** (primeira referência entre cadeias, entre uma publicação no
Bitcoin e uma na Base). Elas aparecem pelo nome em **Perfil de
conquistas**, onde você escolhe uma identidade de publicação e vê a contagem
e a lista completa de conquistas dela, cada uma com quando foi ganha.

As conquistas pertencem às identidades de publicação, não a pessoas: nada
aqui liga uma publicação a uma pessoa.

## Removido: classificações, conciliação e rótulos de editores

Versões anteriores tinham páginas de classificação: uma classificação de
editores, declarações assinadas de instantâneo do editor, um espaço e uma
classificação de conciliação, e a comparação de exportações de evidências.
O ForkBuild não classifica pessoas nem guarda pontuações
([Pilares](../../Pillars.md#what-we-are-not-making)), por isso elas foram removidas. Um link antigo para uma
dessas páginas abre o Início. Um arquivo salvo quando elas existiam continua
carregando e sendo importado, com todos os seus outros registros; as
declarações de classificação e as decisões de conciliação que ele tinha são
descartadas.

As Associações de editores, que rotulavam suas publicações com um nome de
editor para essas páginas, também foram removidas. Os rótulos que um arquivo
tinha são descartados da mesma forma.
