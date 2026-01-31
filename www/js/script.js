// --- (MANTENHA O INÍCIO DO CÓDIGO IGUAL ATÉ A PARTE DE SETUP CONEXAO) ---
// ... variáveis ... inicialização ...

// --- ATIVA O MODO PLANO DE FUNDO (NOVO) ---
document.addEventListener('deviceready', function () {
    // Pede permissão para notificar (Android 13+)
    cordova.plugins.notification.local.requestPermission(function (granted) {
        console.log('Permissão de notificação: ' + granted);
    });

    // Ativa modo background para não cair a conexão
    cordova.plugins.backgroundMode.enable();
    
    // Configura o modo background para ser invisível se possível
    cordova.plugins.backgroundMode.setDefaults({
        title: "GhostMsg Ativo",
        text: "Mantendo conexão segura...",
        silent: true 
    });
}, false);

// ... funções de navegação ...

// --- ATUALIZAÇÃO NA FUNÇÃO SETUP CONEXAO ---
function setupConexao(conn) {
    conexoes[conn.peer] = conn;

    conn.on('open', () => {
        if(contatoAtual && contatoAtual.id === conn.peer) {
            document.querySelector('.chat-status').classList.add('online');
            document.getElementById('current-chat-status').innerText = "Online";
        }
    });

    conn.on('data', (data) => {
        // Lógica: Está na tela do chat com essa pessoa?
        const estouNoChatDela = contatoAtual && contatoAtual.id === conn.peer;
        
        // Verifica se o app está em segundo plano (background)
        const appEmBackground = cordova.plugins.backgroundMode.isActive();

        if (estouNoChatDela && !appEmBackground) {
            // Se estou vendo a tela, só mostra o balão
            adicionarBalao(data, 'received');
            somReceber.play().catch(e=>{});
        } else {
            // Se estou em outra tela OU com o app minimizado -> NOTIFICAÇÃO
            enviarNotificacaoNativa(conn.peer, data);
            
            // Também mostra o Toast se estiver com o app aberto em outra tela
            if(!appEmBackground) {
                showToast(`Nova mensagem de ${conn.peer}`, 'success');
            }
        }
    });
    // ... resto do código ...
}

// --- NOVA FUNÇÃO PARA GERAR NOTIFICAÇÃO NA TELA DE BLOQUEIO ---
function enviarNotificacaoNativa(remetenteId, texto) {
    // Tenta achar o nome do contato pelo ID
    let nomeExibicao = remetenteId;
    const contatoSalvo = contatos.find(c => c.id === remetenteId);
    if(contatoSalvo) nomeExibicao = contatoSalvo.name;

    cordova.plugins.notification.local.schedule({
        title: nomeExibicao,
        text: texto,
        foreground: true, // Mostra mesmo se o app estiver aberto
        vibrate: true,
        priority: 2, // Alta prioridade (Heads-up notification)
        smallIcon: 'res://icon', // Usa o ícone do app
        lockscreenVisibility: 'PUBLIC' // Aparece na tela de bloqueio
    });
}

// ... o resto das funções (enviarMensagem, renderizarContatos) continua igual ...
