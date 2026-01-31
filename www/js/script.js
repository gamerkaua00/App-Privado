// ======================================================
// GHOSTMSG - CORE SCRIPT (V4.0 - NOTIFICATIONS EDITION)
// ======================================================

// --- VARIÁVEIS GLOBAIS ---
let meuId = localStorage.getItem('ghost_my_id');
let meuNick = localStorage.getItem('ghost_my_nick') || "Eu";
let contatos = JSON.parse(localStorage.getItem('ghost_contacts') || "[]");
let contatoAtual = null; // Objeto {id, name}
let peer = null;
let conexoes = {}; // Mapa de conexões ativas: { id: conn }

// Elementos de Áudio
const somEnviar = document.getElementById('sound-sent');
const somReceber = document.getElementById('sound-received');

// --- INICIALIZAÇÃO DO APP ---

// 1. Configuração Inicial
function init() {
    // Gera ID se não existir
    if (!meuId) {
        meuId = "User-" + Math.floor(Math.random() * 1000000);
        localStorage.setItem('ghost_my_id', meuId);
    }

    // Aplica Tema Salvo
    const tema = localStorage.getItem('ghost_theme');
    if (tema) document.body.className = tema;

    // Preenche Interface
    document.getElementById('my-nickname').value = meuNick;
    document.getElementById('my-id-display').innerText = meuId;

    // Inicia Sistemas
    renderizarContatos();
    iniciarPeer();
}

// 2. Evento Cordova (Quando o Android carrega)
document.addEventListener('deviceready', function () {
    console.log("Android pronto. Configurando plugins...");

    if (window.cordova && cordova.plugins) {
        // A. Permissões de Notificação (Android 13+)
        if (cordova.plugins.notification && cordova.plugins.notification.local) {
            cordova.plugins.notification.local.requestPermission(function (granted) {
                console.log('Permissão Notificação: ' + granted);
            });
        }

        // B. Modo Background (Manter conexão viva)
        if (cordova.plugins.backgroundMode) {
            cordova.plugins.backgroundMode.enable();
            cordova.plugins.backgroundMode.setDefaults({
                title: "GhostMsg Ativo",
                text: "Conexão P2P segura mantida em segundo plano.",
                silent: true // Tenta esconder a notificação persistente se possível
            });
            
            // Corrige problema de WebView pausando timers
            cordova.plugins.backgroundMode.on('activate', function() {
                cordova.plugins.backgroundMode.disableWebViewOptimizations(); 
            });
        }
    }
}, false);

// Executa init
init();

// --- LÓGICA DE REDE (P2P) ---

function iniciarPeer() {
    peer = new Peer(meuId);

    peer.on('open', (id) => {
        console.log("Conectado à rede P2P: " + id);
        atualizarStatusUI("Online", "online");
    });

    peer.on('connection', (conn) => {
        setupConexao(conn);
        showToast(`Nova conexão de: ${conn.peer}`, 'success');
    });

    peer.on('error', (err) => {
        console.error("Erro P2P:", err);
        if (err.type === 'peer-unavailable') {
            showToast("Usuário offline ou ID inválido.", "error");
            atualizarStatusUI("Offline", "error");
        } else if (err.type === 'network') {
            showToast("Sem internet.", "error");
            atualizarStatusUI("Sem Rede", "error");
        }
    });

    peer.on('disconnected', () => {
        atualizarStatusUI("Desconectado", "error");
        // Tenta reconectar automaticamente
        setTimeout(() => peer.reconnect(), 3000);
    });
}

function conectarP2P(destId) {
    if (!destId) return;
    // Fecha conexão anterior se existir para limpar
    if (conexoes[destId]) {
        conexoes[destId].close();
    }
    const conn = peer.connect(destId);
    setupConexao(conn);
}

function setupConexao(conn) {
    conexoes[conn.peer] = conn;

    conn.on('open', () => {
        // Se estiver no chat com essa pessoa, atualiza status
        if (contatoAtual && contatoAtual.id === conn.peer) {
            atualizarStatusUI("Online", "online");
        }
    });

    conn.on('data', (data) => {
        tratarMensagemRecebida(conn.peer, data);
    });

    conn.on('close', () => {
        delete conexoes[conn.peer];
        if (contatoAtual && contatoAtual.id === conn.peer) {
            atualizarStatusUI("Desconectou", "error");
        }
    });
}

// --- TRATAMENTO DE MENSAGENS E NOTIFICAÇÕES ---

function tratarMensagemRecebida(remetenteId, texto) {
    // 1. Verifica estado do App
    const appEmBackground = (window.cordova && cordova.plugins && cordova.plugins.backgroundMode) 
                            ? cordova.plugins.backgroundMode.isActive() 
                            : document.hidden;

    const estouNoChatDela = contatoAtual && contatoAtual.id === remetenteId;

    // 2. Decisão de onde mostrar
    if (estouNoChatDela && !appEmBackground) {
        // Caso A: App aberto e no chat da pessoa -> Mostra Balão
        adicionarBalao(texto, 'received');
        tocarSom('received');
    } else {
        // Caso B: App em background OU em outra tela -> Notificação
        tocarSom('received');
        
        if (appEmBackground) {
            enviarNotificacaoNativa(remetenteId, texto);
        } else {
            // App aberto mas em outra tela (ex: na Home)
            showToast(`Msg de ${obterNomeContato(remetenteId)}: ${texto.substring(0, 20)}...`, 'success');
        }
    }
}

function enviarNotificacaoNativa(remetenteId, texto) {
    if (!window.cordova || !cordova.plugins || !cordova.plugins.notification) return;

    const nome = obterNomeContato(remetenteId);
    
    cordova.plugins.notification.local.schedule({
        id: new Date().getTime(), // ID único baseado no tempo
        title: nome,
        text: texto,
        foreground: true,
        vibrate: true,
        priority: 2,
        smallIcon: 'res://icon',
        lockscreenVisibility: 'PUBLIC'
    });
}

// --- FUNÇÕES DE ENVIO ---

function enviarMensagem() {
    const input = document.getElementById('msg-input');
    const texto = input.value.trim();

    if (!texto || !contatoAtual) return;

    // CASO 1: Conversa Comigo Mesmo (Loopback)
    if (contatoAtual.id === meuId) {
        adicionarBalao(texto, 'sent');
        tocarSom('sent');
        input.value = '';
        
        // Simula resposta
        setTimeout(() => {
            adicionarBalao(texto, 'received');
            tocarSom('received');
        }, 500);
        return;
    }

    // CASO 2: Envio Real P2P
    const conn = conexoes[contatoAtual.id];
    
    if (conn && conn.open) {
        conn.send(texto);
        adicionarBalao(texto, 'sent');
        tocarSom('sent');
        input.value = '';
    } else {
        // Tenta reconectar e enviar
        showToast("Reconectando...", "normal");
        conectarP2P(contatoAtual.id);
        
        // Retry rápido
        setTimeout(() => {
             const novaConn = conexoes[contatoAtual.id];
             if(novaConn && novaConn.open) {
                 novaConn.send(texto);
                 adicionarBalao(texto, 'sent');
                 tocarSom('sent');
                 input.value = '';
             } else {
                 showToast("Falha ao enviar. Usuário offline.", "error");
             }
        }, 1500);
    }
}

// --- INTERFACE GRÁFICA (UI) ---

function adicionarBalao(texto, tipo) {
    const area = document.getElementById('messages-area');
    const div = document.createElement('div');
    div.className = 'msg ' + tipo;
    
    const hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `${texto} <span class="msg-time">${hora}</span>`;
    
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

function showToast(msg, type = 'normal') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function tocarSom(tipo) {
    // Tenta tocar som ignorando erros de permissão do navegador
    const audio = tipo === 'sent' ? somEnviar : somReceber;
    if(audio) audio.play().catch(e => console.log("Audio bloqueado pelo navegador"));
}

function atualizarStatusUI(texto, classe) {
    if (!contatoAtual) return;
    const elStatus = document.getElementById('current-chat-status');
    const elDot = document.getElementById('status-dot'); // Assumindo que o HTML tem esse elemento dentro da .chat-status
    
    // Se não tiver o span do dot no HTML, aplicamos a classe no pai
    const statusContainer = document.querySelector('.chat-status');
    
    if(elStatus) elStatus.innerText = texto;
    
    statusContainer.className = 'chat-status'; // Limpa
    statusContainer.classList.add(classe);
}

// --- NAVEGAÇÃO E TELAS ---

function irParaChat(contactId, contactName) {
    contatoAtual = { id: contactId, name: contactName };
    
    document.getElementById('current-chat-name').innerText = contactName;
    atualizarStatusUI("Conectando...", "normal");
    
    // Limpa chat anterior
    document.getElementById('messages-area').innerHTML = '';

    // Se não for eu mesmo, tenta conectar
    if (contactId !== meuId) {
        if (!conexoes[contactId] || !conexoes[contactId].open) {
            conectarP2P(contactId);
        } else {
            atualizarStatusUI("Online", "online");
        }
    } else {
        atualizarStatusUI("Notas Pessoais", "online");
    }

    trocarTela('view-chat');
}

function voltarHome() {
    contatoAtual = null;
    trocarTela('view-home');
}

function abrirConfig() { trocarTela('view-settings'); }

function trocarTela(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// --- GERENCIAMENTO DE CONTATOS ---

function renderizarContatos() {
    const lista = document.getElementById('contact-list');
    lista.innerHTML = '';

    if (contatos.length === 0) {
        lista.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.5"><i class="material-icons" style="font-size:40px">contacts</i><br>Lista vazia</div>';
        return;
    }

    contatos.forEach(c => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.onclick = () => irParaChat(c.id, c.name);
        
        const avatarLetra = c.name.charAt(0).toUpperCase();
        item.innerHTML = `
            <div class="avatar">${avatarLetra}</div>
            <div class="contact-info">
                <h4>${c.name}</h4>
                <p>${c.id === meuId ? 'Conversa com você mesmo' : 'ID: ' + c.id.substring(0,8)+'...'}</p>
            </div>
        `;
        lista.appendChild(item);
    });
}

function salvarNovoContato() {
    const nome = document.getElementById('new-contact-name').value.trim();
    const id = document.getElementById('new-contact-id').value.trim();

    if (nome && id) {
        // Evita duplicatas
        if(contatos.some(c => c.id === id)) {
            showToast("Contato já existe!", "error");
            return;
        }

        contatos.push({ name: nome, id: id });
        localStorage.setItem('ghost_contacts', JSON.stringify(contatos));
        renderizarContatos();
        fecharModalAdd();
        showToast("Contato salvo com sucesso!", "success");
        
        // Limpa campos
        document.getElementById('new-contact-name').value = '';
        document.getElementById('new-contact-id').value = '';
    } else {
        showToast("Preencha o Nome e o ID!", "error");
    }
}

function adicionarEuMesmo() {
    document.getElementById('new-contact-name').value = "Eu (Notas)";
    document.getElementById('new-contact-id').value = meuId;
    // Não chamamos salvar direto para o usuário confirmar visualmente
}

function obterNomeContato(id) {
    if (id === meuId) return "Eu";
    const contato = contatos.find(c => c.id === id);
    return contato ? contato.name : id.substring(0,6)+"...";
}

// --- CONFIGURAÇÕES E UTILITÁRIOS ---

function salvarNickname() {
    const nick = document.getElementById('my-nickname').value.trim();
    if(nick) {
        localStorage.setItem('ghost_my_nick', nick);
        meuNick = nick;
        showToast("Apelido atualizado!");
    }
}

function mudarTema(tema) {
    document.body.className = ''; 
    if(tema !== 'cyber') document.body.classList.add('theme-'+tema);
    localStorage.setItem('ghost_theme', document.body.className);
    showToast("Tema aplicado: " + tema);
}

function copiarID() {
    navigator.clipboard.writeText(meuId).then(() => {
        showToast("ID copiado para a área de transferência!", "success");
    }).catch(() => {
        // Fallback se navegador bloquear
        showToast("Erro ao copiar. Selecione manualmente.", "error");
    });
}

function limparTudo() {
    if(confirm("ATENÇÃO: Isso apagará todos os contatos e seu ID atual. Continuar?")) {
        localStorage.clear();
        location.reload();
    }
}

// Controle de Modais
function mostrarModalAdd() { document.getElementById('modal-add').classList.add('open'); }
function fecharModalAdd() { document.getElementById('modal-add').classList.remove('open'); }

// Tecla Enter para enviar
document.getElementById('msg-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enviarMensagem();
});
