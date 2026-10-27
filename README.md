# Player Mixer — Twitch/Kick → Nimo

Extensão do Chrome (Manifest V3) que mostra o player de uma live da **Nimo** no lugar do player da **Twitch** ou da **Kick**, mantendo o chat original da plataforma.

A ideia: quem assiste continua com o conforto do chat da Twitch (ou da Kick) e vê o vídeo que está rodando na Nimo. A troca só acontece para quem instalou a extensão.

## Recursos

- Troca o player da Twitch ou da Kick pelo player de embed oficial da Nimo (`nimo.tv/embed/<canal>`).
- Mantém o chat, a lista de seguidores e o resto da página originais.
- Funciona só no canal que você configurou; outros canais e páginas ficam intactos.
- Ignora VODs e clipes, e troca apenas a live.
- Preenchimento automático: abrindo o popup numa aba da Twitch, da Kick ou da Nimo, o campo daquela plataforma é preenchido com o canal da aba. Os canais das outras abas abertas aparecem como sugestões de um clique.
- Aceita **só o nome** do canal ou o **link inteiro** (`https://www.twitch.tv/meucanal`, `kick.com/meucanal`, `nimo.tv/meucanal`, links de popout etc.).
- O popup guarda um rascunho enquanto você digita, então o que foi digitado não se perde ao trocar de aba (o Chrome fecha o popup nesse caso). O rascunho só vale depois de clicar em **Salvar**.
- Acompanha a navegação interna da Twitch e da Kick (SPAs) sem precisar recarregar a página.

## Instalação

A extensão ainda não está na Chrome Web Store. Para instalar em modo de desenvolvedor:

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions`.
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta do projeto.

Para atualizar depois de mudar os arquivos, clique no botão de recarregar da extensão em `chrome://extensions`.

## Como usar

1. Clique no ícone da extensão.
2. Preencha o canal da Twitch e/ou da Kick e o canal da Nimo (nome ou link). Deixe em branco o que não for usar.
3. Ative **Ativar troca de player**.
4. Clique em **Salvar e recarregar a aba**.

Ao abrir o canal configurado, o player da Nimo aparece no lugar do player original. O vídeo original fica pausado por baixo.

## Como funciona

- Um *content script* roda em `twitch.tv` e `kick.com` e usa um `MutationObserver` para achar o player, porque as duas plataformas recriam o DOM durante a navegação.
  - Twitch: `[data-a-target="video-player"]`.
  - Kick: `#video-holder`. Se não achar, usa o maior elemento `<video>` da página e sobe pelos ancestrais que têm o mesmo tamanho dele.
- Sobre o player é colocado um `<iframe>` apontando para `https://www.nimo.tv/embed/<canal>`.
- O vídeo original é pausado sem mexer em volume ou mute, que a plataforma salva no seu perfil.
- Quando a troca está ativada, um conjunto de regras `declarativeNetRequest` (`rules.json`) libera o iframe:
  - remove `X-Frame-Options` e `Content-Security-Policy` das respostas de `nimo.tv` carregadas dentro de páginas da Twitch e da Kick;
  - remove o `Content-Security-Policy` das páginas principais da Twitch e da Kick, para o iframe poder ser embutido.
- As configurações ficam em `chrome.storage.local`. O `background.js` liga e desliga as regras conforme o interruptor do popup.

## Permissões e segurança

| Permissão | Para que serve |
| --- | --- |
| `storage` | Guardar canais, estado do interruptor e rascunho do popup. |
| `declarativeNetRequest` | Ajustar os headers que impedem o iframe da Nimo. |
| `https://*.twitch.tv/*`, `https://*.kick.com/*` | Rodar o content script e ler a URL das abas no popup. |
| `https://*.nimo.tv/*` | Permitir as regras de headers e ler a URL de abas da Nimo. |

Atenção: enquanto a troca está **ativada**, o `Content-Security-Policy` das páginas da Twitch e da Kick é removido. Isso reduz uma camada de proteção do navegador nessas páginas. Desative o interruptor quando não estiver usando.

## Limitações conhecidas

- Só funciona no Chrome para computador e em navegadores baseados em Chromium (Edge, Brave etc.). O Chrome para Android não suporta extensões.
- Depende de a Nimo continuar permitindo o player de embed. Se ela mudar isso, o iframe pode parar de funcionar.
- Os seletores do player podem quebrar quando a Twitch ou a Kick mudarem o site. O da Kick tem um plano B, mas vale conferir. Os ajustes ficam em `content.js`.
- O reconhecimento de links da Nimo assume os formatos `nimo.tv/<canal>`, `nimo.tv/live/<id>` e `nimo.tv/embed/<canal>`.
- A Nimo e a plataforma original podem ter atrasos diferentes entre si, então o vídeo e o chat podem ficar um pouco dessincronizados.

## Estrutura

```
manifest.json    configuração da extensão (MV3)
background.js    liga/desliga as regras de headers
rules.json       regras declarativeNetRequest
content.js       localiza o player e coloca o iframe da Nimo
popup.html       interface do popup
popup.js         campos, autopreenchimento, leitura de link e rascunho
```

## Aviso

Projeto independente, sem relação com a Twitch, a Kick ou a Nimo. Use por sua conta e respeite os termos de uso de cada plataforma.
