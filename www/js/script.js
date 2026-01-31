// ======================================================
// GHOSTMSG V5 - ULTIMATE EDITION (ALL FEATURES)
// ======================================================

// --- VARIÁVEIS DE SISTEMA ---
let meuId = localStorage.getItem('ghost_id');
let config = JSON.parse(localStorage.getItem('ghost_config') || '{"autoDl": true, "theme": "dark"}');
let contatos = JSON.parse(localStorage.getItem('ghost_contacts') || "[]");
let avatarBase64 = localStorage.getItem('ghost_avatar') || ""; // Minha Foto
let meuNome = localStorage.getItem('ghost_name') || "Eu";

// --- VARIÁVEIS DE ESTADO ---
let peer = null;
let conexoes = {};
let contatoAtual = null;
let mediaRecorder = null;
let audioChunks = [];
let gravando = false;
let intervaloGravacao = null;

// --- INICIALIZAÇÃO ---
function init() {
    if (!meuId) {
        meuId = "Ghost-" + Math.floor(Math.random() * 999999);
        localStorage.setItem('ghost_id', meuId);
    }

    // Carrega Perfil e Configs
    document.getElementById('my-nickname').value = meuNome;
    document.getElementById('my-id-display').innerText = meuId;
    document.getElementById('toggle-auto-dl').checked = config.autoDl;
    aplicarAvatar(avatarBase64);
    aplicarWallpaper();

    // Inicia Peer
    iniciarPeer();
    renderizarContatos();

    // Monitora Digitação para mudar ícone do botão (Mic vs Send)
    document.getElementById('msg-input').addEventListener('input', (e) => {
        const btnIcon = document.getElementById('icon-action');
        if (e.target.value.trim().length > 0) {
            btnIcon.innerText = "send"; // Vira botão enviar
        } else {
            btnIcon.innerText = "mic"; // Vira botão gravar
        }
    });
}

// Cordova Ready
document.addEventListener('deviceready', () => {
    if (window.cordova && cordova.plugins) {
        if(cordova.plugins.backgroundMode) cordova.plugins.backgroundMode.enable();
        if(cordova.plugins.notification) cordova.plugins.notification.local.requestPermission();
    }
}, false);

init();

// --- LÓGICA DE REDE (P2P) ---
function iniciarPeer() {
    peer = new Peer(meuId);
    
    peer.on('open', (id) => atualizarStatus("Online", "online"));
    
    peer.on('connection', (conn) => {
        setupConexao(conn);
        showToast("Nova conexão recebida!", "success");
    });
    
    peer.on('error', (err) => {
        if(err.type === 'peer-unavailable') atualizarStatus("Offline", "error");
    });

    peer.on('disconnected', () => setTimeout(() => peer.reconnect(), 3000));
}

function conectar(id) {
    if(!id) return;
    if(conexoes[id]) conexoes[id].close();
    const conn = peer.connect(id);
    setupConexao(conn);
}

function setupConexao(conn) {
    conexoes[conn.peer] = conn;

    conn.on('open', () => {
        if(contatoAtual && contatoAtual.id === conn.peer) atualizarStatus("Online", "online");
    });

    conn.on('data', (pacote) => receberPacote(conn.peer, pacote));
    
    conn.on('close', () => {
        if(contatoAtual && contatoAtual.id === conn.peer) atualizarStatus("Desconectado", "error");
    });
}

// --- ENVIO E RECEBIMENTO ---

// Função Principal do Botão de Ação (Send ou Gravar)
function acaoPrincipal() {
    const input = document.getElementById('msg-input');
    const texto = input.value.trim();

    if (texto.length > 0) {
        // Enviar Texto
        enviarPacote({ type: 'text', content: texto });
        input.value = '';
        document.getElementById('icon-action').innerText = "mic";
    } else {
        // Gravar Áudio
        if (!gravando) iniciarGravacao();
    }
}

function enviarPacote(pacote) {
    // pacote = { type: 'text'|'image'|'video'|'audio', content: 'base64...' }
    if (!contatoAtual) return showToast("Abra um chat primeiro", "error");

    // Adiciona ao meu chat
    adicionarBalao(pacote, 'sent');
    
    // Envia P2P
    if (contatoAtual.id !== meuId) {
        const conn = conexoes[contatoAtual.id];
        if (conn && conn.open) {
            conn.send(pacote);
        } else {
            showToast("Reconectando...", "error");
            conectar(contatoAtual.id);
            setTimeout(() => { if(conexoes[contatoAtual.id]) conexoes[contatoAtual.id].send(pacote) }, 1500);
        }
    }
}

function receberPacote(remetenteId, pacote) {
    const estouNoChat = contatoAtual && contatoAtual.id === remetenteId;
    
    if (estouNoChat && !document.hidden) {
        adicionarBalao(pacote, 'received');
    } else {
        // Notificação
        let msg = "Nova Mensagem";
        if(pacote.type === 'image') msg = "📷 Foto";
        if(pacote.type === 'video') msg = "🎥 Vídeo";
        if(pacote.type === 'audio') msg = "🎤 Áudio";
        
        if(window.cordova) {
            cordova.plugins.notification.local.schedule({ title: obterNome(remetenteId), text: msg });
        } else {
            showToast(`Msg de ${obterNome(remetenteId)}`, "success");
        }
    }
}

// --- MÍDIA (FOTO, VIDEO, AUDIO) ---

function processarArquivo(input, tipo) {
    const arquivo = input.files[0];
    if (!arquivo) return;

    if (arquivo.size > 8 * 1024 * 1024) return alert("Arquivo muito grande (Max 8MB)");

    const reader = new FileReader();
    reader.onload = (e) => {
        enviarPacote({ type: tipo, content: e.target.result });
        toggleAnexos(); // Fecha menu
    };
    reader.readAsDataURL(arquivo);
    input.value = '';
}

// --- GRAVADOR DE ÁUDIO ---
function iniciarGravacao() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => enviarPacote({ type: 'audio', content: reader.result });
            
            stream.getTracks().forEach(track => track.stop()); // Libera mic
        };

        mediaRecorder.start();
        gravando = true;
        document.getElementById('audio-recorder').classList.add('recording');
        
        // Timer visual
        let seg = 0;
        intervaloGravacao = setInterval(() => {
            seg++;
            document.getElementById('record-timer').innerText = `00:${seg < 10 ? '0'+seg : seg}`;
        }, 1000);

    }).catch(e => showToast("Erro no Microfone: " + e, "error"));
}

function enviarAudio() {
    if (mediaRecorder && gravando) {
        mediaRecorder.stop();
        cancelarGravacaoUI();
    }
}

function cancelarGravacao() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        audioChunks = []; // Descarta
        cancelarGravacaoUI();
    }
}

function cancelarGravacaoUI() {
    gravando = false;
    clearInterval(intervaloGravacao);
    document.getElementById('audio-recorder').classList.remove('recording');
    document.getElementById('record-timer').innerText = "00:00";
}

// --- UI HELPERS ---

function adicionarBalao(pacote, lado) {
    const area = document.getElementById('messages-area');
    const div = document.createElement('div');
    div.className = 'msg ' + lado;

    let conteudoHtml = '';

    // Verifica Auto-Download (Se for recebido e config for false, mostra botão)
    if (lado === 'received' && !config.autoDl && (pacote.type === 'image' || pacote.type === 'video')) {
        // Lógica de "Clique para Baixar" (Simplificada: salva num atributo data e exibe botão)
        conteudoHtml = `
            <button onclick="baixarMidia(this, '${pacote.type}', '${pacote.content}')" style="background:#333;color:white;border:none;padding:10px;border-radius:5px">
                ⬇ Baixar ${pacote.type}
            </button>
        `;
    } else {
        // Exibe direto
        if (pacote.type === 'text') conteudoHtml = pacote.content;
        if (pacote.type === 'image') conteudoHtml = `<img src="${pacote.content}" onclick="verFull(this.src)">`;
        if (pacote.type === 'video') conteudoHtml = `<video src="${pacote.content}" controls></video>`;
        if (pacote.type === 'audio') conteudoHtml = `<audio src="${pacote.content}" controls></audio>`;
    }

    const hora = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    div.innerHTML = `${conteudoHtml} <span class="msg-time">${hora}</span>`;
    
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

function baixarMidia(btn, tipo, content) {
    // Substitui o botão pela mídia real
    let html = '';
    if (tipo === 'image') html = `<img src="${content}" onclick="verFull(this.src)">`;
    if (tipo === 'video') html = `<video src="${content}" controls></video>`;
    btn.parentNode.innerHTML = html + btn.parentNode.innerHTML.split('<span')[1]; // Mantém a hora
}

function toggleAnexos() {
    const menu = document.getElementById('attach-menu');
    menu.classList.toggle('open');
}

// --- PERFIL E CONFIGURAÇÕES ---

function salvarPerfil() {
    meuNome = document.getElementById('my-nickname').value;
    localStorage.setItem('ghost_name', meuNome);
    showToast("Nome salvo!", "success");
}

function mudarAvatar(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            avatarBase64 = e.target.result;
            localStorage.setItem('ghost_avatar', avatarBase64);
            aplicarAvatar(avatarBase64);
        };
        reader.readAsDataURL(file);
    }
}

function aplicarAvatar(base64) {
    if(!base64) return;
    document.getElementById('home-avatar').innerHTML = `<img src="${base64}">`;
    document.getElementById('settings-avatar').innerHTML = `<img src="${base64}">`;
}

function mudarWallpaper(input) {
    const file = input.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            localStorage.setItem('ghost_wallpaper', e.target.result);
            aplicarWallpaper();
        };
        reader.readAsDataURL(file);
    }
}

function aplicarWallpaper() {
    const wp = localStorage.getItem('ghost_wallpaper');
    if(wp) {
        document.getElementById('chat-wallpaper').style.backgroundImage = `url(${wp})`;
        document.getElementById('chat-wallpaper').style.opacity = '0.4';
    }
}

function toggleAutoDownload(chk) {
    config.autoDl = chk.checked;
    localStorage.setItem('ghost_config', JSON.stringify(config));
}

// --- QR CODE ---
function abrirQR() {
    document.getElementById('modal-qr').classList.add('open');
    document.getElementById('qrcode-container').innerHTML = '';
    new QRCode(document.getElementById("qrcode-container"), {
        text: meuId,
        width: 200,
        height: 200
    });
}
function fecharModalQR() { document.getElementById('modal-qr').classList.remove('open'); }

// --- GERENCIAMENTO DE CONTATOS (Resumido) ---
function renderizarContatos() {
    const lista = document.getElementById('contact-list');
    lista.innerHTML = '';
    contatos.forEach(c => {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.onclick = () => abrirChat(c.id, c.name);
        div.innerHTML = `<div class="mini-avatar">${c.name[0]}</div> <div><b>${c.name}</b><br><small>${c.id.substring(0,8)}...</small></div>`;
        lista.appendChild(div);
    });
}

function salvarNovoContato() {
    const n = document.getElementById('new-contact-name').value;
    const i = document.getElementById('new-contact-id').value;
    if(n && i) {
        contatos.push({name:n, id:i});
        localStorage.setItem('ghost_contacts', JSON.stringify(contatos));
        renderizarContatos();
        fecharModalAdd();
    }
}

function abrirChat(id, nome) {
    contatoAtual = {id, name: nome};
    document.getElementById('current-chat-name').innerText = nome;
    document.getElementById('messages-area').innerHTML = '';
    conectar(id);
    trocarTela('view-chat');
}

// --- UTILS ---
function voltarHome() { contatoAtual = null; trocarTela('view-home'); }
function trocarTela(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}
function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = `toast ${type}`; t.innerText = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
function obterNome(id) { 
    const c = contatos.find(x => x.id === id);
    return c ? c.name : "Desconhecido";
}
function copiarID() { navigator.clipboard.writeText(meuId); showToast("Copiado!", "success"); }
function mostrarModalAdd() { document.getElementById('modal-add').classList.add('open'); }
function fecharModalAdd() { document.getElementById('modal-add').classList.remove('open'); }
function abrirConfig() { trocarTela('view-settings'); }
function adicionarEuMesmo() { document.getElementById('new-contact-id').value = meuId; document.getElementById('new-contact-name').value = "Eu"; }
function limparChatAtual() { document.getElementById('messages-area').innerHTML = ''; }
function verFull(src) { window.open("").document.write(`<img src="${src}" style="width:100%">`); }
function toggleTema(chk) { 
    if(!chk.checked) document.body.style.filter = "invert(1)"; // Simples light mode hack
    else document.body.style.filter = "none";
}
