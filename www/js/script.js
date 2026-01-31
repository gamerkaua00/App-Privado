// ======================================================
// GHOSTMSG - SCRIPT PRINCIPAL (V5.1 STABLE)
// ======================================================

// --- VARIÁVEIS GLOBAIS ---
let meuId = localStorage.getItem('ghost_my_id');
let meuNick = localStorage.getItem('ghost_my_nick') || "Eu";
let contatos = JSON.parse(localStorage.getItem('ghost_contacts') || "[]");
let contatoAtual = null; // {id, name}
let peer = null;
let conexoes = {}; // { id: conn }
let digitandoTimeout = null;

// Elementos de Áudio
const somEnviar = document.getElementById('sound-sent');
const somReceber = document.getElementById('sound-received');

// --- INICIALIZAÇÃO ---

function init() {
    // 1. Gera ID único se não tiver
    if (!meuId) {
        meuId = "Ghost-" + Math.floor(Math.random() * 999999);
        localStorage.setItem('ghost_my_id', meuId);
    }

    // 2. Aplica Tema
    const tema = localStorage.getItem('ghost_theme');
    if (tema) document.body.className = tema;

    // 3. Preenche tela de configurações
    document.getElementById('my-nickname').value = meuNick;
    document.getElementById('my-id-display').innerText = meuId;

    // 4. Inicia sistemas
    renderizarContatos();
    iniciarPeer();

    // 5. Listener para "Digitando..."
    document.getElementById('msg-input').addEventListener('input', avisarQueEstouDigitando);
}

// Evento do Cordova (Android pronto)
document.addEventListener('deviceready', function () {
    console.log("Sistema Android Iniciado.");

    if (window.cordova && cordova.plugins) {
        // A. Notificações (Pede permissão no Android 13+)
        if (cordova.plugins.notification && cordova.plugins.notification.local) {
            cordova.plugins.notification.local.requestPermission(function (granted) {
                console.log('Permissão Notificação: ' + granted);
            });
        }

        // B. Modo Background (Para não cair a conexão)
        if (cordova.plugins.backgroundMode) {
            // Habilita o modo
            cordova.plugins.backgroundMode.enable();
            
            // Configura a notificação persistente (Obrigatória no Android novo para não matar o app)
            cordova.plugins.backgroundMode.setDefaults({
                title: "GhostMsg Online",
                text: "Mantendo conexão criptografada...",
                icon: 'icon', 
                color: '0D1117',
                resume: true,
                hidden: false, 
                bigText: false
            });

            // Evita que o Android pause o JavaScript
            cordova.plugins.backgroundMode.on('activate', function() {
                cordova.plugins.backgroundMode.disableWebViewOptimizations(); 
            });
        }
    }
}, false);

// Inicia o app
init();

// --- LÓGICA DE REDE (P2P) ---

function iniciarPeer() {
    peer = new Peer(meuId);

    peer.on('open', (id) => {
        console.log("Conectado na rede P2P: " + id);
        atualizarStatusUI("Online", "online");
    });

    peer.on('connection', (conn) => {
        setupConexao(conn);
        showToast(`Nova conexão: ${obterNomeContato(conn.peer)}`, 'success');
    });

    peer.on('error', (err) => {
        console.error("Erro PeerJS:", err);
        if (err.type === 'peer-unavailable') {
            showToast("Usuário offline ou ID incorreto.", "error");
            atualizarStatusUI("Offline", "error");
        } else if (err.type === 'network') {
            atualizarStatusUI("Sem Internet", "error");
        }
    });

    peer.on('disconnected', () => {
        // Tenta reconectar sozinho
        setTimeout(() => peer.reconnect(), 3000);
    });
}

function conectarP2P(destId) {
    if (!destId) return;
    // Fecha anterior para evitar duplicidade
    if (conexoes[destId]) conexoes[destId].close();
    
    const conn = peer.connect(destId);
    setupConexao(conn);
}

function setupConexao(conn) {
    conexoes[conn.peer] = conn;

    conn.on('open', () => {
        if (contatoAtual && contatoAtual.id === conn.peer) {
            atualizarStatusUI("Online", "online");
        }
    });

    conn.on('data', (pacote) => {
        tratarPacoteRecebido(conn.peer, pacote);
    });

    conn.on('close', () => {
        delete conexoes[conn.peer];
        if (contatoAtual && contatoAtual.id === conn.peer) {
            atualizarStatusUI("Desconectou", "error");
        }
    });
}

// --- TRATAMENTO DE MENSAGENS ---

function tratarPacoteRecebido(remetenteId, pacote) {
    // Pacote = { type: 'text'|'image'|'typing', content: '...' }

    // 1. É Status de Digitando?
    if (pacote.type === 'typing') {
        if (contatoAtual && contatoAtual.id === remetenteId) {
            mostrarIndicadorDigitando();
        }
        return;
    }

    // 2. Verifica se o App está em segundo plano
    let appEmBackground = document.hidden; // Verificação padrão Web
    if (window.cordova && cordova.plugins && cordova.plugins.backgroundMode) {
        appEmBackground = cordova.plugins.backgroundMode.isActive();
    }

    const estouNoChat = contatoAtual && contatoAtual.id === remetenteId;

    // 3. Exibe a mensagem ou notificação
    if (estouNoChat && !appEmBackground) {
        // Estou vendo a tela -> Mostra Balão
        adicionarBalao(pacote.content, 'received', pacote.type);
        tocarSom('received');
    } else {
        // Estou fora -> Notificação
        tocarSom('received');
        const preview = pacote.type === 'image' ? '📷 Foto' : pacote.content;
        
        if (appEmBackground) {
            enviarNotificacaoNativa(remetenteId, preview);
        } else {
            showToast(`Msg de ${obterNomeContato(remetenteId)}`, 'success');
        }
    }
}

function enviarNotificacaoNativa(id, texto) {
    if (window.cordova && cordova.plugins && cordova.plugins.notification) {
        cordova.plugins.notification.local.schedule({
            id: new Date().getTime(),
            title: obterNomeContato(id),
            text: texto,
            foreground: true,
            vibrate: true,
            priority: 2,
            smallIcon: 'res://icon',
            lockscreenVisibility: 'PUBLIC'
        });
    }
}

// --- ENVIO DE DADOS ---

function enviarTexto() {
    const input = document.getElementById('msg-input');
    const texto = input.value.trim();
    if (!texto || !contatoAtual) return;

    enviarPacote({ type: 'text', content: texto });
    input.value = '';
}

function enviarImagem(inputElement) {
    const arquivo = inputElement.files[0];
    if (!arquivo || !contatoAtual) return;

    if (arquivo.size > 2 * 1024 * 1024) { // 2MB
        alert("Imagem muito grande (Max 2MB).");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        enviarPacote({ type: 'image', content: e.target.result });
    };
    reader.readAsDataURL(arquivo);
    inputElement.value = ''; // Reseta input
}

function enviarPacote(pacote) {
    // Loopback (Eu comigo mesmo)
    if (contatoAtual.id === meuId) {
        adicionarBalao(pacote.content, 'sent', pacote.type);
        tocarSom('sent');
        setTimeout(() => {
            adicionarBalao(pacote.content, 'received', pacote.type);
            tocarSom('received');
        }, 300);
        return;
    }

    // Envio P2P Real
    const conn = conexoes[contatoAtual.id];
    if (conn && conn.open) {
        conn.send(pacote);
        adicionarBalao(pacote.content, 'sent', pacote.type);
        tocarSom('sent');
    } else {
        showToast("Reconectando...", "error");
        conectarP2P(contatoAtual.id);
        // Tenta re-enviar rapidinho
        setTimeout(() => {
            const novaConn = conexoes[contatoAtual.id];
            if(novaConn && novaConn.open) {
                novaConn.send(pacote);
                adicionarBalao(pacote.content, 'sent', pacote.type);
                tocarSom('sent');
            } else {
                showToast("Falha. Usuário Offline.", "error");
            }
        }, 1500);
    }
}

// --- INDICADOR DIGITANDO ---

function avisarQueEstouDigitando() {
    if (!contatoAtual || contatoAtual.id === meuId) return;
    const conn = conexoes[contatoAtual.id];
    if (conn && conn.open) {
        conn.send({ type: 'typing', content: true });
    }
}

function mostrarIndicadorDigitando() {
    const el = document.getElementById('current-chat-status');
    const textoAntigo = el.innerText === "Digitando..." ? "Online" : el.innerText; // Preserva status
    
    el.innerText = "Digitando...";
    el.classList.add('typing-indicator');

    if (digitandoTimeout) clearTimeout(digitandoTimeout);
    
    digitandoTimeout = setTimeout(() => {
        el.innerText = "Online"; // Assume online se parar de digitar
        el.classList.remove('typing-indicator');
    }, 2000);
}

// --- INTERFACE (UI) ---

function adicionarBalao(conteudo, lado, tipo) {
    const area = document.getElementById('messages-area');
    const div = document.createElement('div');
    div.className = 'msg ' + lado;
    
    let htmlInterno = '';
    if (tipo === 'image') {
        htmlInterno = `<img src="${conteudo}" class="msg-img" onclick="verImagem(this.src)">`;
    } else {
        htmlInterno = conteudo;
    }
    
    const hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `${htmlInterno} <span class="msg-time">${hora}</span>`;
    
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

function verImagem(src) {
    const w = window.open("");
    w.document.write(`<body style="background:#000;margin:0;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${src}" style="max-width:100%;max-height:100%"></body>`);
}

function showToast(msg, type) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

function tocarSom(tipo) {
    const audio = tipo === 'sent' ? somEnviar : somReceber;
    if(audio) audio.play().catch(e => {}); // Ignora erros de autoplay
}

function atualizarStatusUI(texto, classe) {
    if (!contatoAtual) return;
    const el = document.getElementById('current-chat-status');
    const dot = document.getElementById('status-dot');
    
    if(el) el.innerText = texto;
    if(dot) {
        dot.style.background = (classe === 'online') ? '#00ff88' : '#ff4444';
        dot.style.boxShadow = (classe === 'online') ? '0 0 5px #00ff88' : 'none';
    }
}

// --- NAVEGAÇÃO E CONTATOS ---

function irParaChat(id, nome) {
    contatoAtual = { id: id, name: nome };
    document.getElementById('current-chat-name').innerText = nome;
    document.getElementById('messages-area').innerHTML = ''; // Limpa chat (não tem histórico persistente ainda)
    
    atualizarStatusUI("Conectando...", "normal");
    
    if (id !== meuId) {
        if (!conexoes[id] || !conexoes[id].open) conectarP2P(id);
        else atualizarStatusUI("Online", "online");
    } else {
        atualizarStatusUI("Notas Pessoais", "online");
    }
    
    trocarTela('view-chat');
}

function renderizarContatos() {
    const lista = document.getElementById('contact-list');
    lista.innerHTML = '';

    if (contatos.length === 0) {
        lista.innerHTML = '<div style="opacity:0.5;text-align:center;padding:30px">Nenhum contato.</div>';
        return;
    }

    contatos.forEach(c => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.onclick = () => irParaChat(c.id, c.name);
        item.innerHTML = `
            <div class="avatar">${c.name.charAt(0).toUpperCase()}</div>
            <div class="contact-info">
                <h4>${c.name}</h4>
                <p>${c.id === meuId ? 'Você' : 'ID: ' + c.id.substring(0,8)+'...'}</p>
            </div>
        `;
        lista.appendChild(item);
    });
}

function salvarNovoContato() {
    const n = document.getElementById('new-contact-name').value.trim();
    const i = document.getElementById('new-contact-id').value.trim();
    
    if (n && i) {
        if (contatos.some(c => c.id === i)) {
            showToast("Esse ID já existe!", "error");
            return;
        }
        contatos.push({ name: n, id: i });
        localStorage.setItem('ghost_contacts', JSON.stringify(contatos));
        renderizarContatos();
        fecharModalAdd();
        showToast("Contato adicionado!", "success");
        // Limpa
        document.getElementById('new-contact-name').value = '';
        document.getElementById('new-contact-id').value = '';
    } else {
        showToast("Preencha nome e ID.", "error");
    }
}

function adicionarEuMesmo() {
    document.getElementById('new-contact-name').value = "Eu (Notas)";
    document.getElementById('new-contact-id').value = meuId;
}

// --- UTILS ---

function obterNomeContato(id) {
    if (id === meuId) return "Eu";
    const c = contatos.find(x => x.id === id);
    return c ? c.name : id.substring(0, 6);
}

function salvarNickname() {
    const n = document.getElementById('my-nickname').value.trim();
    if(n) {
        localStorage.setItem('ghost_my_nick', n);
        meuNick = n;
        showToast("Apelido salvo!");
    }
}

function mudarTema(t) {
    document.body.className = '';
    if(t !== 'cyber') document.body.classList.add('theme-'+t);
    localStorage.setItem('ghost_theme', document.body.className);
    showToast("Tema alterado.");
}

function copiarID() {
    navigator.clipboard.writeText(meuId);
    showToast("ID copiado!");
}

function limparTudo() {
    if(confirm("Apagar tudo e reiniciar?")) {
        localStorage.clear();
        location.reload();
    }
}

// Navegação UI
function voltarHome() { contatoAtual = null; trocarTela('view-home'); }
function abrirConfig() { trocarTela('view-settings'); }
function mostrarModalAdd() { document.getElementById('modal-add').classList.add('open'); }
function fecharModalAdd() { document.getElementById('modal-add').classList.remove('open'); }
function trocarTela(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// Atalho Enter
document.getElementById('msg-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') enviarTexto();
});
