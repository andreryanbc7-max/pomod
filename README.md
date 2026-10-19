# Deep Focus — Pomodoro cinematográfico

Aplicação web estática em HTML, CSS e JavaScript puro. Não precisa de Node.js, npm ou processo de build.

## Executar no VS Code
1. Abra a pasta `deep-focus-zero` no VS Code.
2. Abra `index.html` com a extensão **Live Server** (Ritwick Dey).
3. Clique com o botão direito em `index.html` → **Open with Live Server**. O YouTube bloqueia incorporações quando a página é aberta diretamente como `file://`.

## Funcionalidades
- Pomodoro com foco, pausa curta e longa, pausa/retomada, reinício, avanço e transição automática.
- Duração e ciclo configuráveis.
- Estatísticas e tarefa salvas no `localStorage` do navegador.
- Seleção de quatro ambientes com imagens de fundo remotas.
- Camadas sonoras sintéticas de chuva, vento, fogueira e floresta usando Web Audio API. Clique em Começar ou no controle de som para permitir a reprodução pelo navegador.
- Player incorporado do Spotify: cole um link HTTPS de faixa, álbum, playlist, episódio ou programa. O link fica salvo neste navegador; a reprodução pode exigir uma conta Spotify. Esta opção incorpora o player, não conecta a conta Spotify do usuário.
- URL opcional de vídeo MP4 em Configurações. Vídeos externos dependem de URL pública compatível com reprodução direta e conexão à internet.
- Tela cheia, relógio e layout responsivo.

## Publicar online
Por ser um site estático, pode ser hospedado em GitHub Pages, Netlify ou Vercel. As imagens e fontes usam recursos remotos; a URL de vídeo é opcional. Os dados ficam no navegador de cada dispositivo e não sincronizam entre dispositivos nesta versão.
