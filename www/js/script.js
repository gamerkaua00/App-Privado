// ======================================================
// GHOSTMSG V8 - HYPER STABLE CORE
// ======================================================

// --- SAFETY FIRST: REMOÇÃO DO SPLASH ---
// Garante que o loading saia em 3s, mesmo com erro
setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if(splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.style.display = 'none', 500);
    }
    // Esconde o robô do Cordova se ainda estiver lá
    if(navigator.splashscreen) navigator.splashscreen.hide();
}, 3000);

// --- ESTADO ---
let meuId = localStorage.getItem('kmz_id');
let meuNome = localStorage.getItem('kmz_name') || "Eu";
let contatos = JSON.parse(localStorage.getItem('kmz_contacts') || "[]");
let peer = null;
let conexoes = {};
let chatAtual = null;
let modoBomba = false;

// --- INICIALIZAÇÃO ---
function init() {
    if (!meuId) {
        meuId = "User-" + Math.floor(Math.random() * 999999);
        localStorage.setItem('kmz_id', meuId);
    }

    document.getElementById('my-id-display').innerText = meuId;
    document.getElementById('my-nickname').value = meuNome;

    renderizarListas();
    iniciarPeer();

    // Listener de Digitação
    document.getElementById('msg-input').addEventListener('input', (e) => {
        const btn = document.getElementById('icon-action');
        btn.innerText = e.target.value.trim().length > 0 ? "send" : "mic";
    });
}

document.addEventListener('deviceready', () => {
    // 1. Pedir Permissões
    if (cordova.plugins.permissions) {
        const list = [
            cordova.plugins.permissions.RECORD_AUDIO,
            cordova.plugins.permissions.WRITE_EXTERNAL_STORAGE,
            cordova.plugins.permissions.READ_EXTERNAL_STORAGE
        ];
        cordova.plugins.permissions.requestPermissions(list, null, null);
    }
    // 2. Background
    if(cordova.plugins.backgroundMode) {
        cordova.plugins.backgroundMode.enable();
        cordova.plugins.backgroundMode.disableWebViewOptimizations();
    }
    // 3. Notificações
    if(cordova.plugins.notification) {
        cordova.plugins.notification.local.requestPermission();
    }
}, false);

init();

// --- P2P ---
function iniciarPeer() {
    peer = new Peer(meuId);
    peer.on('open', () => console.log('Online'));
    peer.on('connection', conn => {
        conexoes[conn.peer] = conn;
        conn.on('data', data => receberMsg(data, conn.peer));
        showToast("Nova Conexão!");
    });
    peer.on('error', e => console.log("Peer Erro:", e));
}

function conectar(id) {
    if(conexoes[id]) return;
    const conn = peer.connect(id);
    conn.on('open', () => conexoes[id] = conn);
    conn.on('data', data => receberMsg(data, id));
}

// --- MENSAGENS ---
function acaoPrincipal() {
    const input = document.getElementById('msg-input');
    const txt = input.value.trim();
    if(txt) {
        enviarMsg('text', txt);
        input.value = '';
        document.getElementById('icon-action').innerText = "mic";
    } else {
        alert("Gravação de áudio em breve...");
    }
}

function enviarMsg(tipo, conteudo) {
    if(!chatAtual) return;
    
    const msg = {
        tipo: tipo,
        conteudo: conteudo,
        bomba: modoBomba,
        data: new Date().getTime()
    };

    // UI
    adicionarBalao(msg, 'sent');

    // Envio
    const conn = conexoes[chatAtual.id];
    if(conn && conn.open) {
        conn.send(msg);
    } else {
        conectar(chatAtual.id);
        setTimeout(() => {
            if(conexoes[chatAtual.id]) conexoes[chatAtual.id].send(msg);
        }, 1500);
    }
}

function receberMsg(msg, senderId) {
    if(chatAtual && chatAtual.id === senderId) {
        adicionarBalao(msg, 'received');
    } else {
        showToast("Nova mensagem recebida!");
    }
}

// --- UI HELPERS ---
function adicionarBalao(msg, lado) {
    const area = document.getElementById('messages-area');
    const div = document.createElement('div');
    div.className = `msg ${lado}`;
    
    let html = msg.conteudo;
    if(msg.tipo === 'image') {
        html = `<img src="${msg.conteudo}" onclick="abrirImagem(this.src)">`;
    }
    
    if(msg.bomba) {
        setTimeout(() => { div.innerHTML = "<i>Apagada</i>"; div.style.opacity = 0.5; }, 10000);
        html += " <small>⏱ 10s</small>";
    }

    const hora = new Date(msg.data).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    div.innerHTML = `${html}<span class="msg-time">${hora}</span>`;
    
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// --- ARQUIVOS ---
const GerenciadorArquivos = {
    selecionar: function(input) {
        const file = input.files[0];
        if(!file) return;
        
        if(file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = e => enviarMsg('image', e.target.result);
            reader.readAsDataURL(file);
        } else {
            enviarMsg('text', `Arquivo: ${file.name}`);
        }
    }
};

// --- LIGHTBOX ---
function abrirImagem(src) {
    const v = document.getElementById('image-viewer');
    document.getElementById('img-full').src = src;
    v.classList.add('open');
}
function fecharImagem() { document.getElementById('image-viewer').classList.remove('open'); }

// --- CONTATOS ---
function renderizarListas() {
    const list = document.getElementById('list-chats');
    list.innerHTML = '';
    contatos.forEach(c => {
        const d = document.createElement('div');
        d.className = 'contact-item';
        d.onclick = () => abrirChat(c.id, c.name);
        d.innerHTML = `<div class="item-avatar">${c.name[0]}</div><div class="item-info"><h4>${c.name}</h4><p>Toque para conversar</p></div>`;
        list.appendChild(d);
    });
}

function salvarNovoContato() {
    const n = document.getElementById('new-contact-name').value;
    const i = document.getElementById('new-contact-id').value;
    contatos.push({name:n, id:i});
    localStorage.setItem('kmz_contacts', JSON.stringify(contatos));
    renderizarListas();
    fecharModalAdd();
}

function abrirChat(id, nome) {
    chatAtual = {id, name:nome};
    document.getElementById('current-chat-name').innerText = nome;
    document.getElementById('messages-area').innerHTML = '';
    conectar(id);
    trocarTela('view-chat');
}

// --- NAVEGAÇÃO ---
function mudarAba(aba) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.list-area').forEach(l => l.style.display = 'none');
    
    if(aba === 'chats') {
        document.querySelector('.tab:nth-child(1)').classList.add('active');
        document.getElementById('list-chats').style.display = 'block';
    } else {
        document.querySelector('.tab:nth-child(2)').classList.add('active');
        document.getElementById('list-groups').style.display = 'block';
    }
}

function trocarTela(id) { document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function voltarHome() { chatAtual = null; trocarTela('view-home'); }
function mostrarModalAdd() { document.getElementById('modal-add').classList.add('open'); }
function fecharModalAdd() { document.getElementById('modal-add').classList.remove('open'); }
function showToast(m) { const t=document.createElement('div'); t.className='toast'; t.innerText=m; document.getElementById('toast-container').appendChild(t); setTimeout(()=>t.remove(),3000); }
function toggleModoBomba() { modoBomba = !modoBomba; document.getElementById('btn-bomb').style.color = modoBomba ? 'red' : 'inherit'; showToast(modoBomba?"Modo Espião ON":"Modo Normal"); }
function limparTudo() { localStorage.clear(); location.reload(); }
function copiarID() { navigator.clipboard.writeText(meuId); showToast("ID Copiado!"); }
function abrirQR() { 
    document.getElementById('modal-qr').classList.add('open'); 
    document.getElementById('qrcode-container').innerHTML = '';
    new QRCode(document.getElementById("qrcode-container"), {text:meuId, width:200, height:200});
}
function abrirConfig() { trocarTela('view-settings'); }
